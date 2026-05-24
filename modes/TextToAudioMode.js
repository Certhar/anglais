/**
 * modes/TextToAudioMode.js
 *
 * Mode prononciation : l'utilisateur voit un mot français, doit le
 * prononcer en anglais à voix haute, puis s'auto-évalue après écoute
 * de la réponse correcte.
 *
 * Philosophie pédagogique :
 *   - Pas de reconnaissance vocale automatique. Volontairement.
 *   - L'enfant développe l'écoute critique de soi (compétence métacognitive
 *     précieuse), pas juste la capacité à articuler.
 *   - Si l'enfant triche en cliquant "j'ai bien dit" sans avoir essayé,
 *     ce n'est pas grave : l'autre mode (AudioToTextMode) le ramènera à
 *     la réalité quand il devra écrire ce mot à l'oreille. Le système
 *     fait confiance.
 *
 * Cycle :
 *   1. Affichage du mot français + consigne
 *   2. Bouton "Écouter la réponse →" (l'enfant prononce en silence avant)
 *   3. Audio joué, mot anglais + phonétique révélés
 *   4. Bouton 🔊 pour réécouter à volonté
 *   5. Trois choix d'auto-évaluation :
 *      ✓ J'ai bien dit       → success: true
 *      ↻ Je recommence       → on rejoue l'audio, on reste en phase 2
 *      ✗ Je n'y arrive pas   → success: false (mot ira en révision)
 *
 * Le bouton "Je recommence" n'est pas pénalisant : il évite à l'enfant
 * d'avoir à mentir s'il sait qu'il n'a pas bien dit. Et le bouton
 * "Je n'y arrive pas" lui donne une sortie de secours honnête.
 */

import { BaseEngine } from '../core/BaseEngine.js';
import { events } from '../core/EventBus.js';
import { audio } from '../services/AudioService.js';
import { flag } from '../ui/icons.js';


export class TextToAudioMode extends BaseEngine {

  static get modeId() { return "text_to_audio"; }

  /**
   * Ce mode rejoue l'audio anglais après l'auto-jugement (exposition
   * audio maximale). Il gère donc lui-même le moment où il est prêt à
   * passer au suivant, via options.onReadyToAdvance().
   */
  static get managesOwnAdvanceTiming() { return true; }

  constructor(word, options = {}) {
    super(word, options);
    this._revealed = false;   // true après le clic "Écouter la réponse"
    this._completed = false;  // true après auto-évaluation finale
  }

  _render() {
    // Phase 1 : préparation. Mot français + consigne + bouton "Écouter".
    this.container.innerHTML = `
      <div class="card">
        <div class="exercise-prompt">
          <div class="exercise-prompt-label">Prononce ce mot en anglais à voix haute</div>
          <div class="exercise-prompt-flag">${flag('gb')}</div>
          <div class="exercise-prompt-word">${this._escape(this.word.fr)}</div>
        </div>
        <div class="text-to-audio-hint">
          Quand tu es prêt, écoute la bonne prononciation et compare.
        </div>
        <button class="btn btn-large mt-2" data-action="listen">
          🔊 Écouter la réponse →
        </button>
      </div>
    `;

    this.container.querySelector('[data-action="listen"]')
      .addEventListener('click', () => this._onListen());
  }

  /**
   * Phase 1 → 2 : l'enfant a dit (en silence), il veut maintenant
   * écouter la bonne prononciation pour comparer.
   */
  _onListen() {
    if (this._revealed) return;
    this._revealed = true;

    events.emit('text-to-audio:revealed', {
      word: this.word,
      mode: this.constructor.modeId,
    });

    this._renderRevealedPhase();
    // Audio auto-joué juste après le passage en phase 2
    this._setTimeout(() => this._playAudio(), 200);
  }

  /**
   * Rendu de la phase 2 : mot anglais + phonétique + audio + 3 boutons
   * d'auto-évaluation.
   */
  _renderRevealedPhase() {
    const pronoHtml = this.word.prono
      ? `<div class="word-prono">${this._escape(this.word.prono)}</div>`
      : "";

    this.container.innerHTML = `
      <!-- Wrapper en colonne : le stage parent (ExerciseScreen) est en
           flex row, ce wrapper force l'empilement vertical de la carte
           et du bloc judge. -->
      <div class="text-to-audio-stack">
        <div class="card">
          <div class="exercise-prompt">
            <div class="exercise-prompt-label">Tu devais prononcer</div>
            <div class="exercise-prompt-word">${this._escape(this.word.fr)}</div>
          </div>
          <div class="text-to-audio-reveal">
            <div class="text-to-audio-reveal-label">La bonne prononciation :</div>
            <div class="word-en">${this._escape(this.word.en)}</div>
            ${pronoHtml}
            <button class="audio-btn"
                    data-action="audio"
                    style="margin:1rem auto 0;"
                    aria-label="Réécouter">🔊</button>
          </div>
        </div>
        <!-- Boutons d'auto-évaluation : HORS de la carte (pour cohérence
             avec les autres écrans : carte = contenu, boutons en dessous). -->
        <div class="text-to-audio-judge">
          <div class="text-to-audio-judge-label">Tu as bien prononcé ?</div>
          <div class="text-to-audio-judge-buttons">
            <button class="btn btn-secondary" data-action="retry">
              ↻ Je recommence
            </button>
            <button class="btn btn-primary" data-action="success">
              ✓ J'ai bien dit
            </button>
          </div>
        </div>
      </div>
    `;

    this.container.querySelector('[data-action="audio"]')
      .addEventListener('click', () => this._playAudio());

    this.container.querySelector('[data-action="success"]')
      .addEventListener('click', () => this._onSelfJudge(true));

    this.container.querySelector('[data-action="retry"]')
      .addEventListener('click', () => this._onRetry());
  }

  /**
   * "Je recommence" : on rejoue l'audio, on reste en phase 2.
   * Pas de pénalité, pas de comptage. C'est juste un moyen d'éviter à
   * l'enfant d'avoir à mentir s'il sait qu'il n'a pas bien dit.
   */
  _onRetry() {
    if (this._completed) return;
    events.emit('text-to-audio:retry', {
      word: this.word,
      mode: this.constructor.modeId,
    });
    this._playAudio();
  }

  /**
   * Auto-jugement final de l'enfant : "j'ai bien dit" (success=true)
   * ou "je n'y arrive pas" (success=false). Ferme l'exercice.
   */
  _onSelfJudge(success) {
    if (this._completed) return;
    this._completed = true;

    // Désactiver tous les boutons d'auto-éval pour éviter double-clic
    this.container.querySelectorAll('[data-action]').forEach(btn => {
      if (btn.dataset.action !== 'audio') btn.disabled = true;
    });

    // Émettre l'événement (BaseEngine.validate() le fait normalement,
    // mais ici on a un cas un peu particulier : pas de "userInput" classique,
    // c'est un jugement subjectif. On émet directement.)
    events.emit('exercise:answered', {
      word: this.word,
      mode: this.constructor.modeId,
      success,
      userInput: success ? 'self-judged-ok' : 'self-judged-ko',
      expected: this.word.en,
      selfJudged: true,
    });

    // Feedback visuel
    const fb = document.createElement('div');
    fb.className = `feedback ${success ? 'correct' : 'wrong'}`;
    fb.innerHTML = success
      ? '✓ Super, tu maîtrises !'
      : 'On le retravaillera. Pas grave 💪';
    this.container.querySelector('.card').appendChild(fb);

    // Exposition audio maximale : on rejoue le mot anglais après le
    // jugement, qu'il soit positif ou négatif.
    // - "j'ai bien dit" → l'enfant réentend pour confirmer sa réussite.
    // - "je n'y arrive pas" → c'est justement le moment d'entendre la
    //   forme correcte une dernière fois avant de passer.
    // onReadyToAdvance est signalé à la fin de l'audio.
    this._setTimeout(() => {
      this._playAudio({
        onDone: () => {
          if (this.options.onReadyToAdvance) {
            this.options.onReadyToAdvance();
          }
        },
      });
    }, 400);

    if (this.options.onAnswered) {
      this.options.onAnswered(success);
    }
  }

  /**
   * Joue l'audio anglais à vitesse normale (0.9). Animation visuelle sur
   * le bouton 🔊 s'il existe (phase 2 uniquement).
   * @param {Object} [opts]
   * @param {Function} [opts.onDone] - appelé quand l'audio est terminé
   * @private
   */
  _playAudio(opts = {}) {
    const btn = this.container?.querySelector('[data-action="audio"]');
    if (btn) btn.classList.add('playing');
    audio.speak(this.word.en, {
      rate: 0.9,
      onEnd: () => {
        if (btn) btn.classList.remove('playing');
        if (opts.onDone) opts.onDone();
      },
    });
  }

  /**
   * BaseEngine déclare _validateInput abstrait. Ici on ne l'utilise pas
   * (la validation se fait via _onSelfJudge qui émet directement). Mais
   * on en donne une implémentation triviale au cas où.
   */
  _validateInput(_userInput) {
    return { success: this._completed, expected: this.word.en };
  }

  cleanup() {
    audio.stop();
  }

  /**
   * Échappe le HTML pour éviter les injections via les champs du mot.
   * @private
   */
  _escape(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}
