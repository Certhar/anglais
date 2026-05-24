/**
 * services/AudioService.js
 *
 * Service centralisé de lecture audio.
 *
 * MVP : utilise la Web Speech API (TTS du navigateur), gratuit.
 * Évolution future : pourra basculer vers des MP3 pré-générés sans
 * que le reste de l'app le sache.
 *
 * Préfère l'anglais britannique (en-GB), fallback en-US.
 *
 * ─────────────────────────────────────────────────────────────────────
 * ROBUSTESSE FIREFOX
 * ─────────────────────────────────────────────────────────────────────
 *
 * Firefox a un comportement erratique sur speechSynthesis : les
 * événements `onend` arrivent EN RETARD (parfois 1-2s après la fin
 * réelle de la parole) et DANS LE DÉSORDRE. Un `onend` peut même
 * arriver pour une utterance qui a déjà été annulée par cancel().
 *
 * Conséquence si on ne fait rien : des callbacks onEnd se déclenchent au
 * mauvais moment (ex: un onEnd "fantôme" d'une vieille utterance fait
 * croire à l'orchestrateur qu'on peut passer au mot suivant, alors que
 * l'audio courant joue encore).
 *
 * Parades mises en place ici :
 *
 *   • Chaque speak() reçoit un identifiant interne (_speakId). Les
 *     callbacks onEnd/onError ne sont déclenchés QUE si l'utterance qui
 *     les émet est encore l'utterance courante. Les onend "fantômes"
 *     d'utterances périmées sont ignorés.
 *
 *   • Un filet de sécurité : si onEnd n'arrive jamais (Firefox peut
 *     carrément l'oublier), un timer estime la durée de la parole et
 *     déclenche onEnd manuellement. La durée est estimée à partir de la
 *     longueur du texte et du rate.
 *
 * NOTE HISTORIQUE : une version précédente intercalait un délai de
 * 120ms entre cancel() et speak() ("CANCEL_SETTLE_MS"), censé être une
 * parade Firefox. Mauvaise idée : ce délai créait une fenêtre pendant
 * laquelle un stop() (appelé par les modes dans leur cleanup()) tuait le
 * speak() à venir avant qu'il ait parlé. Les tests ont montré que ce
 * délai est inutile sur Firefox (cancel() immédiatement suivi de
 * speak() fonctionne). Le délai a été supprimé.
 */


// Filet de sécurité : marge ajoutée à la durée estimée avant de
// déclencher onEnd manuellement si le navigateur ne l'a pas fait.
const SAFETY_MARGIN_MS = 1500;

// Estimation : ~12 caractères par seconde à rate 1.0 (parole TTS posée).
// On divise par le rate (rate 0.5 → 2x plus lent → 2x plus long).
const CHARS_PER_SEC_AT_RATE_1 = 12;


export class AudioService {
  constructor() {
    this.synth = window.speechSynthesis || null;
    this.voice = null;
    this.available = !!this.synth;

    // Identifiant incrémental : chaque speak() obtient un nouvel ID.
    // Sert à ignorer les callbacks d'utterances périmées.
    this._speakId = 0;

    // Timer du filet de sécurité "onEnd jamais arrivé", à nettoyer
    // entre deux speak.
    this._safetyTimer = null;

    // Watchdog Firefox : voir _startWatchdog().
    this._watchdogTimer = null;

    if (this.available) {
      this._initVoice();
      this._startWatchdog();
    } else {
      console.warn("[AudioService] Web Speech API non disponible");
    }
  }

  /**
   * Watchdog anti-"moteur muet" de Firefox.
   *
   * Bug Firefox (et Chrome dans une moindre mesure) : après plusieurs
   * speak()/cancel(), le moteur speechSynthesis peut entrer dans un état
   * où il déclenche bien onstart/onend, mais N'ÉMET PLUS AUCUN SON. Le
   * moteur se croit "en pause" sans que rien ne l'ait mis en pause.
   *
   * Symptôme observé : l'audio marche au début d'une session, puis après
   * quelques exercices (surtout après des révélations qui enchaînent
   * plusieurs speak/cancel), plus rien — alors que les logs montrent que
   * audio.speak() est bien appelé et que onEnd arrive normalement.
   *
   * Parade : appeler resume() périodiquement. resume() sur un moteur qui
   * n'est PAS en pause est totalement inoffensif (no-op). Mais s'il est
   * dans l'état "pause silencieuse" bugué, resume() le réveille.
   *
   * Référence : c'est le même type de workaround que le célèbre
   * "Chrome speechSynthesis pause bug" (le moteur se met en pause tout
   * seul après ~15s). Ici on couvre aussi le cas Firefox.
   * @private
   */
  _startWatchdog() {
    // Toutes les 7 secondes : si le moteur n'est pas explicitement arrêté,
    // on le "pousse" avec un resume(). Inoffensif s'il va bien.
    this._watchdogTimer = setInterval(() => {
      if (!this.available) return;
      // On ne resume QUE s'il est censé être en train de parler ou d'avoir
      // quelque chose en attente — pour éviter de réveiller le moteur pour
      // rien quand l'app est au repos.
      if (this.synth.speaking || this.synth.pending) {
        this.synth.resume();
      }
    }, 7000);
  }

  /**
   * Sélectionne la meilleure voix anglaise disponible.
   * Les voix sont chargées de manière asynchrone par le navigateur,
   * donc on écoute aussi voiceschanged pour rafraîchir.
   * @private
   */
  _initVoice() {
    const setVoice = () => {
      const voices = this.synth.getVoices();
      this.voice =
        voices.find(v => v.lang === "en-GB") ||
        voices.find(v => v.lang === "en-US") ||
        voices.find(v => v.lang.startsWith("en")) ||
        null;
    };
    setVoice();
    if (this.synth.onvoiceschanged !== undefined) {
      this.synth.onvoiceschanged = setVoice;
    }
  }

  /**
   * Lit un texte à voix haute.
   * Annule toute lecture en cours avant de démarrer.
   *
   * @param {string} text - texte à prononcer
   * @param {Object} options
   * @param {Function} [options.onEnd] - callback à la fin (garanti
   *        appelé une seule fois, et seulement si cette lecture-ci n'a
   *        pas été remplacée entre-temps par un autre speak()/stop()).
   * @param {Function} [options.onError] - callback en cas d'erreur
   * @param {number} [options.rate=0.9] - vitesse (0.5 lent → 2.0 rapide)
   */
  speak(text, options = {}) {
    if (!this.available || !text) {
      // Pas d'audio possible : on appelle quand même onEnd pour ne pas
      // bloquer un orchestrateur qui l'attend.
      if (options.onEnd) setTimeout(options.onEnd, 200);
      return;
    }

    // Nouvel ID pour cette lecture. Tout callback portant un ID différent
    // de celui-ci sera considéré comme périmé et ignoré.
    const myId = ++this._speakId;

    // Annule la lecture en cours + ses timers.
    this._hardStop();

    const rate = options.rate ?? 0.9;

    // onEnd "sûr" : ne se déclenche qu'une fois, et seulement si cette
    // lecture est toujours la lecture courante.
    let endFired = false;
    const fireEndOnce = () => {
      if (endFired) return;
      if (myId !== this._speakId) return;  // lecture périmée → ignore
      endFired = true;
      this._clearSafetyTimer();
      if (options.onEnd) options.onEnd();
    };

    const fireErrorOnce = (e) => {
      if (endFired) return;
      if (myId !== this._speakId) return;
      endFired = true;
      this._clearSafetyTimer();
      if (options.onError) options.onError(e);
      // On considère qu'une erreur termine aussi la lecture du point de
      // vue de l'orchestrateur : on déclenche onEnd pour ne pas bloquer.
      else if (options.onEnd) options.onEnd();
    };

    // synth.speak() appelé DIRECTEMENT après le cancel (pas de délai).
    // Les tests ont montré que Firefox n'a pas besoin de délai ici, et
    // qu'un délai créerait une fenêtre où un stop() tuerait ce speak().
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "en-GB";
    if (this.voice) utter.voice = this.voice;
    utter.rate = rate;
    utter.onend = fireEndOnce;
    utter.onerror = fireErrorOnce;

    this.synth.speak(utter);

    // Anti "moteur muet" Firefox : juste après speak(), un resume().
    // Si le moteur était dans l'état "pause silencieuse" bugué, ce
    // resume() le réveille pour que CETTE utterance soit bien audible.
    // Inoffensif si le moteur va bien.
    this.synth.resume();

    // Filet de sécurité : si onend n'arrive jamais (Firefox peut
    // l'oublier), on déclenche onEnd manuellement après la durée
    // estimée + marge.
    const estMs = this._estimateDurationMs(text, rate);
    this._safetyTimer = setTimeout(() => {
      this._safetyTimer = null;
      fireEndOnce();
    }, estMs + SAFETY_MARGIN_MS);
  }

  /**
   * Arrête immédiatement la lecture en cours.
   *
   * Note : incrémente _speakId, ce qui invalide automatiquement tout
   * callback onEnd/onError encore en attente de la lecture précédente.
   */
  stop() {
    // Invalide les callbacks de la lecture courante.
    this._speakId++;
    this._hardStop();
  }

  /**
   * Annule la lecture du moteur + nettoie le timer de sécurité.
   * Ne touche pas à _speakId (l'appelant décide s'il faut invalider).
   * @private
   */
  _hardStop() {
    if (this.available) {
      this.synth.cancel();
    }
    this._clearSafetyTimer();
  }

  /** @private */
  _clearSafetyTimer() {
    if (this._safetyTimer) {
      clearTimeout(this._safetyTimer);
      this._safetyTimer = null;
    }
  }

  /**
   * Estime la durée de parole d'un texte (en ms) à un rate donné.
   * Approximation volontairement grossière : sert juste à dimensionner
   * le filet de sécurité, pas à être précis.
   * @private
   */
  _estimateDurationMs(text, rate) {
    const effectiveCharsPerSec = CHARS_PER_SEC_AT_RATE_1 * rate;
    const seconds = text.length / effectiveCharsPerSec;
    return Math.max(500, seconds * 1000);  // plancher à 500ms
  }

  /**
   * @returns {boolean} true si une lecture est en cours
   */
  isSpeaking() {
    return this.available && this.synth.speaking;
  }
}


// Singleton exporté
export const audio = new AudioService();
