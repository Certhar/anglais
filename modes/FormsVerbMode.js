/**
 * modes/FormsVerbMode.js
 *
 * Mode "3 formes du verbe irrégulier" : on présente le verbe (français +
 * anglais base + audio), et l'enfant doit saisir les 3 formes :
 * base, prétérit, participe passé.
 *
 * Exemple : pour "to think" / "penser", attendu : think / thought / thought
 *
 * Format des données attendu (via options.forms) :
 *   { base: "think", preterit: "thought", participle: "thought" }
 *
 * Ce format est cohérent avec celui qu'extrait ExerciseService._extractVerbForms()
 * depuis la note du mot ("irrég: think/thought/thought"). PAS DE MODIFICATION
 * de words.json nécessaire.
 *
 * ─────────────────────────────────────────────────────────────────────
 * PRINCIPE PÉDAGOGIQUE FONDAMENTAL : on ne finit JAMAIS sur une faute.
 * ─────────────────────────────────────────────────────────────────────
 *
 * Cycle de validation :
 *
 *   1. L'enfant remplit les 3 cases et clique "Valider".
 *
 *   2. Les BONNES cases se verrouillent en vert ✅ (acquis, on n'y revient pas).
 *      Les MAUVAISES cases sont classifiées (typo orange / ignorance rouge)
 *      et VIDÉES pour permettre une nouvelle tentative sur les seules formes
 *      manquantes.
 *
 *   3. L'enfant retape les cases vides. Il peut faire jusqu'à 3 essais
 *      globaux. À chaque essai raté, les saisies fausses s'affichent dans
 *      un historique sous les cases.
 *
 *   4. Au 3e essai raté OU sur clic "Je donne ma langue au chat" →
 *      RÉVÉLATION : les bonnes formes manquantes apparaissent dans une zone
 *      bleue, audio joué à 0.9 (chaîne complète).
 *
 *   5. PHASE RECOPIE : les cases restent à remplir (vides). L'enfant doit
 *      recopier les formes révélées pour fermer l'exercice. Pas de pénalité
 *      sur les fautes de recopie : on vide juste et on refait.
 *
 *   6. Une fois toutes les cases correctes → succès final + audio chaîne
 *      complète + feedback.
 *
 * Calcul du success final (= le mot ira-t-il en pile de révision demain ?) :
 *   - success = true  ssi AUCUNE ignorance détectée pendant les essais
 *                     (que des typos accumulées = OK, l'enfant connaissait)
 *   - success = false si au moins une ignorance OU une révélation a eu lieu
 *
 * Cohérent avec la philosophie de TextInputMode.
 */

import { BaseEngine } from '../core/BaseEngine.js';
import { events } from '../core/EventBus.js';
import { audio } from '../services/AudioService.js';
import { compareAnswers, normalize } from '../core/helpers.js';


const RATE = 0.9;
const MAX_ATTEMPTS_BEFORE_REVEAL = 3;
const TYPO_DISTANCE_THRESHOLD = 1;

const LABELS = ["Base", "Prétérit", "Participe passé"];


/**
 * Distance de Levenshtein (utilisée UNIQUEMENT pour classer typo/ignorance).
 */
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[a.length][b.length];
}


export class FormsVerbMode extends BaseEngine {

  static get modeId() { return "forms_verb"; }

  /**
   * Ce mode joue un feedback audio au succès (la chaîne des 3 formes).
   * Il gère donc lui-même le moment où il est prêt à passer au suivant,
   * via options.onReadyToAdvance() — sinon l'ExerciseScreen couperait
   * la chaîne audio (ex: "go, went, gone" qui dure ~2.5s).
   */
  static get managesOwnAdvanceTiming() { return true; }

  constructor(word, options = {}) {
    super(word, options);
    if (!options.forms || !options.forms.base
        || !options.forms.preterit || !options.forms.participle) {
      throw new Error(
        `FormsVerbMode nécessite options.forms = { base, preterit, participle }. `
        + `Reçu pour "${word.en}" : ${JSON.stringify(options.forms)}`
      );
    }
    this.forms = options.forms;
    this._expected = [
      this.forms.base,
      this.forms.preterit,
      this.forms.participle,
    ];

    // État pédagogique
    this._cellState = ["pending", "pending", "pending"];  // pending | locked | revealed
    this._failedAttempts = [];   // historique global { values: [v0,v1,v2], typos: [bool,bool,bool] }
    this._hasIgnorance = false;  // dès qu'une ignorance est détectée, le mot est flagué
    this._revealed = false;      // true après révélation
    this._completed = false;     // true après succès final

    // ID du timer d'autoplay de la base (armé dans _render, annulé si
    // l'enfant valide avant qu'il ne se déclenche — cf. _validateAndComplete)
    this._baseAudioTimerId = null;
  }

  _render() {
    const inputsHtml = this._expected.map((_, i) => `
      <div class="forms-cell">
        <label class="forms-label" for="forms-input-${i}">${LABELS[i]}</label>
        <input type="text"
               class="forms-input"
               id="forms-input-${i}"
               data-role="input"
               data-index="${i}"
               lang="en"
               autocomplete="off"
               autocorrect="off"
               autocapitalize="off"
               spellcheck="false" />
      </div>
    `).join("");

    this.container.innerHTML = `
      <div class="card">
        <div class="exercise-prompt">
          <div class="exercise-prompt-label">Donne les 3 formes de ce verbe irrégulier</div>
          <div class="exercise-prompt-word">${this._escape(this.word.en)}</div>
          <div class="word-prono" style="margin-top:0.3rem;">${this._escape(this.word.fr)}</div>
          <button class="audio-btn"
                  data-action="audio"
                  style="margin:1rem auto 0;"
                  aria-label="Écouter">🔊</button>
        </div>
        <div class="forms-grid">
          ${inputsHtml}
        </div>
        <div class="text-input-history" data-role="history"></div>
        <div class="text-input-revelation hidden" data-role="revelation"></div>
        <div class="text-input-actions">
          <button class="btn btn-large" data-action="validate">Valider</button>
          <button class="btn-give-up hidden" data-action="give-up">Je donne ma langue au chat</button>
        </div>
      </div>
    `;

    this._inputs = Array.from(this.container.querySelectorAll('[data-role="input"]'));
    this._validateBtn = this.container.querySelector('[data-action="validate"]');
    this._giveUpBtn = this.container.querySelector('[data-action="give-up"]');
    this._audioBtn = this.container.querySelector('[data-action="audio"]');
    this._historyEl = this.container.querySelector('[data-role="history"]');
    this._revelationEl = this.container.querySelector('[data-role="revelation"]');

    // Listeners
    this._audioBtn.addEventListener('click', () => this._playBaseAudio());
    this._validateBtn.addEventListener('click', () => this._onValidate());
    this._giveUpBtn.addEventListener('click', () => this._onGiveUp());

    // Enter : passe au champ suivant pending, ou valide si tous remplis
    this._inputs.forEach((input, idx) => {
      input.addEventListener('keydown', e => {
        if (e.key !== "Enter") return;
        if (this._completed) return;
        // Trouver le prochain champ pending (non locked) après celui-ci
        const next = this._findNextPending(idx);
        if (next !== -1 && input.value.trim()) {
          this._inputs[next].focus();
        } else {
          this._onValidate();
        }
      });
    });

    // Focus 1er champ pending + audio auto
    this._setTimeout(() => this._focusFirstPending(), 100);
    // On garde l'ID de l'autoplay : si l'enfant valide très vite (avant
    // que cet autoplay ait eu lieu), _validateAndComplete l'annulera pour
    // éviter qu'il vienne couper la chaîne audio de succès.
    this._baseAudioTimerId = this._setTimeout(() => this._playBaseAudio(), 300);
  }

  _focusFirstPending() {
    const idx = this._cellState.findIndex(s => s === "pending");
    if (idx >= 0) this._inputs[idx].focus();
  }

  _findNextPending(fromIdx) {
    for (let i = fromIdx + 1; i < this._cellState.length; i++) {
      if (this._cellState[i] === "pending") return i;
    }
    return -1;
  }

  _playBaseAudio() {
    if (this._audioBtn) this._audioBtn.classList.add('playing');
    // On dit l'infinitif COMPLET ("to go") et pas juste la base ("go").
    // Le mot tel qu'enregistré dans le corpus est `this.word.en` = "to go" ;
    // c'est aussi ce que les autres modes (mcq, typing_fr, audio_to_text)
    // prononcent. Cohérence inter-modes + pédagogique (l'infinitif anglais
    // se présente avec le `to`).
    // La chaîne au feedback, elle, garde "go, went, gone" sans `to` — voir
    // `_playFullChain` : on récite les 3 formes, et "to go, went, gone"
    // serait bizarre (le `to` ne s'applique qu'à l'infinitif).
    audio.speak(this.word.en, {
      rate: RATE,
      onEnd: () => {
        if (this._audioBtn) this._audioBtn.classList.remove('playing');
      },
    });
  }

  /**
   * Joue la chaîne mémorielle "think, thought, thought" en UNE seule
   * utterance.
   *
   * La virgule + l'espace produit une pause naturelle gérée par le moteur
   * TTS, ce qui évite le bug Firefox où speechSynthesis.cancel() implicite
   * entre deux speak() peut "perdre" l'utterance suivante.
   *
   * Utilisé après succès et après révélation.
   * @param {Object} [opts]
   * @param {Function} [opts.onDone] - appelé quand l'audio est terminé
   */
  _playFullChain(opts = {}) {
    const [base, pret, part] = this._expected;
    audio.speak(`${base}, ${pret}, ${part}`, {
      rate: RATE,
      onEnd: () => {
        if (opts.onDone) opts.onDone();
      },
    });
  }

  // =========================================================================
  // VALIDATION
  // =========================================================================

  _onValidate() {
    if (this._completed) return;
    if (this._revealed) {
      this._handleCopyAttempt();
    } else {
      this._handleGuessAttempt();
    }
  }

  _onGiveUp() {
    if (this._completed || this._revealed) return;
    if (!this._hasIgnorance) this._hasIgnorance = true;
    this._reveal();
  }

  /**
   * Phase essais : on classifie chaque case et on met à jour l'état.
   */
  _handleGuessAttempt() {
    // Récupérer les valeurs des cases PENDING uniquement
    const userValues = this._inputs.map((input, i) =>
      this._cellState[i] === "pending" ? input.value.trim() : null
    );

    // Bloquer si une case pending est vide
    for (let i = 0; i < this._inputs.length; i++) {
      if (this._cellState[i] === "pending" && !userValues[i]) {
        this._inputs[i].focus();
        return;
      }
    }

    // Classifier chaque case pending
    const attemptTypos = [null, null, null]; // null = case déjà locked, true/false = typo/ignorance
    let allCorrect = true;
    let anyIgnorance = false;

    for (let i = 0; i < this._inputs.length; i++) {
      if (this._cellState[i] !== "pending") continue;

      if (compareAnswers(userValues[i], this._expected[i])) {
        // Bonne réponse → verrouiller
        this._cellState[i] = "locked";
        this._inputs[i].disabled = true;
        this._inputs[i].classList.remove('wrong');
        this._inputs[i].classList.add('correct');
      } else {
        // Mauvaise → classifier
        const dist = levenshtein(
          normalize(userValues[i]),
          normalize(this._expected[i])
        );
        const isTypo = dist <= TYPO_DISTANCE_THRESHOLD;
        attemptTypos[i] = isTypo;
        if (!isTypo) anyIgnorance = true;
        allCorrect = false;

        // Vider et signaler visuellement
        this._inputs[i].classList.add('wrong');
        this._inputs[i].value = "";
        // Retire le rouge après un court flash
        this._setTimeout(() => this._inputs[i]?.classList.remove('wrong'), 600);
      }
    }

    // Stocker l'historique de cet essai
    this._failedAttempts.push({
      values: userValues.slice(),
      typos: attemptTypos,
    });

    if (anyIgnorance) this._hasIgnorance = true;

    // Événement de suivi
    events.emit('forms-verb:attempt-failed', {
      word: this.word,
      mode: this.constructor.modeId,
      userValues,
      expected: this._expected,
      typos: attemptTypos,
      attemptNumber: this._failedAttempts.length,
    });

    if (allCorrect) {
      // Toutes les cases pending sont passées correctes : on regarde si
      // TOUTES les cases sont locked → succès final.
      // (Si certaines étaient déjà locked d'un précédent essai, c'est le cas.)
      this._validateAndComplete();
      return;
    }

    // Rendu de l'historique + bouton "J'abandonne"
    this._renderHistory();
    this._giveUpBtn.classList.remove('hidden');

    // Faut-il révéler ?
    if (this._failedAttempts.length >= MAX_ATTEMPTS_BEFORE_REVEAL) {
      this._reveal();
    } else {
      this._focusFirstPending();
    }
  }

  /**
   * Phase recopie (post-révélation) : on attend que l'enfant tape les formes
   * révélées dans leurs cases. Pas de pénalité sur les fautes de recopie.
   */
  _handleCopyAttempt() {
    let allCorrect = true;

    for (let i = 0; i < this._inputs.length; i++) {
      if (this._cellState[i] !== "revealed") continue;
      const v = this._inputs[i].value.trim();
      if (!v) {
        this._inputs[i].focus();
        return;
      }
      if (compareAnswers(v, this._expected[i])) {
        // Recopie correcte → verrouiller
        this._cellState[i] = "locked";
        this._inputs[i].disabled = true;
        this._inputs[i].classList.remove('wrong');
        this._inputs[i].classList.add('correct');
      } else {
        // Recopie fausse : flash, on vide, on redemande sans pénalité
        events.emit('forms-verb:copy-failed', {
          word: this.word,
          mode: this.constructor.modeId,
          index: i,
          userInput: v,
        });
        this._inputs[i].classList.add('wrong');
        this._setTimeout(() => {
          if (!this._inputs[i]) return;
          this._inputs[i].classList.remove('wrong');
          this._inputs[i].value = "";
          this._inputs[i].focus();
        }, 600);
        allCorrect = false;
      }
    }

    if (allCorrect) {
      this._validateAndComplete();
    }
  }

  /**
   * Passe en phase recopie : affiche la zone bleue avec les formes à recopier,
   * audio chaîne, déverrouille les cases pending pour la recopie.
   */
  _reveal() {
    this._revealed = true;

    // Les cases pending deviennent "revealed" (à recopier)
    const toReveal = [];
    for (let i = 0; i < this._cellState.length; i++) {
      if (this._cellState[i] === "pending") {
        this._cellState[i] = "revealed";
        toReveal.push({ label: LABELS[i], value: this._expected[i] });
        // Vider et déverrouiller pour la recopie
        this._inputs[i].value = "";
        this._inputs[i].disabled = false;
        this._inputs[i].classList.remove('wrong', 'correct');
      }
    }

    events.emit('forms-verb:revealed', {
      word: this.word,
      mode: this.constructor.modeId,
      attemptsBeforeReveal: this._failedAttempts.length,
      revealedForms: toReveal,
    });

    // Affichage de la révélation
    const revealedHtml = toReveal.map(r => `
      <div style="margin: 0.4rem 0;">
        <span class="forms-label">${r.label}</span>
        <span class="text-input-revelation-answer" style="font-size:1.3rem; display:inline-block; margin-left:0.5rem;">
          ${this._escape(r.value)}
        </span>
      </div>
    `).join("");

    this._revelationEl.innerHTML = `
      <div class="text-input-revelation-label">Les bonnes formes :</div>
      ${revealedHtml}
      <div class="text-input-revelation-hint">Recopie-les pour passer à la suite</div>
    `;
    this._revelationEl.classList.remove('hidden');

    this._giveUpBtn.classList.add('hidden');

    // Audio chaîne complète à la révélation
    this._setTimeout(() => this._playFullChain(), 200);

    this._focusFirstRevealed();
  }

  _focusFirstRevealed() {
    const idx = this._cellState.findIndex(s => s === "revealed");
    if (idx >= 0) this._inputs[idx].focus();
  }

  /**
   * Succès final : toutes les cases sont locked. Émission, feedback, audio.
   */
  _validateAndComplete() {
    this._completed = true;
    this._validateBtn.disabled = true;
    this._giveUpBtn.classList.add('hidden');

    // Fix B : annuler l'autoplay de la base s'il est encore en attente.
    // Sinon, si l'enfant valide très vite après l'affichage, cet autoplay
    // se déclencherait pendant la chaîne audio de succès et la couperait
    // (audio.speak fait un cancel() implicite).
    if (this._baseAudioTimerId != null) {
      this._clearTimeout(this._baseAudioTimerId);
      this._baseAudioTimerId = null;
    }

    // Success final : aucune ignorance pendant les essais
    const success = !this._hasIgnorance;

    events.emit('exercise:answered', {
      word: this.word,
      mode: this.constructor.modeId,
      success,
      userInput: this._inputs.map(i => i.value.trim()).join(" / "),
      expected: this._expected.join(" / "),
      attempts: this._failedAttempts.length + 1,
      revealed: this._revealed,
      hadIgnorance: this._hasIgnorance,
    });

    // Feedback final
    const fb = document.createElement('div');
    fb.className = 'feedback correct';
    fb.innerHTML = `✓ <strong>${this._expected.join(" / ")}</strong>`;
    this.container.querySelector('.card').appendChild(fb);

    // Helper : signale à l'orchestrateur qu'on est prêt à passer au suivant.
    const signalReady = () => {
      if (this.options.onReadyToAdvance) {
        this.options.onReadyToAdvance();
      }
    };

    // On joue la chaîne mémorielle au succès dans TOUS les cas, y compris
    // après une révélation (→ exposition audio maximale : si révélation,
    // l'enfant entend la chaîne au reveal PUIS à la recopie réussie).
    //
    // Robustesse : c'est AudioService qui gère proprement le cas où la
    // chaîne de révélation jouerait encore au moment où on lance celle-ci
    // (l'enfant recopie vite). speak() invalide la lecture précédente et
    // ses callbacks "fantômes". Le onDone ci-dessous est donc fiable :
    // il ne se déclenche qu'à la fin réelle de CETTE chaîne, ce qui
    // garantit que onReadyToAdvance (→ passage au mot suivant) n'arrive
    // jamais en plein milieu d'un audio.
    this._setTimeout(() => {
      this._playFullChain({ onDone: signalReady });
    }, 400);

    if (this.options.onAnswered) {
      this.options.onAnswered(success);
    }
  }

  /**
   * Affiche l'historique des essais ratés (sous les cases).
   * Chaque ligne : une saisie par case avec son verdict typo/ignorance.
   */
  _renderHistory() {
    if (this._failedAttempts.length === 0) {
      this._historyEl.innerHTML = "";
      return;
    }
    this._historyEl.innerHTML = this._failedAttempts.map((att, n) => {
      const cells = att.values.map((v, i) => {
        if (v === null) return ''; // case déjà locked à ce moment, on n'affiche rien
        const cls = att.typos[i] === true ? 'typo'
                  : att.typos[i] === false ? 'ignorance'
                  : '';
        return `<span class="text-input-failed-attempt ${cls}" style="display:inline-block; padding:0.3rem 0.6rem; margin:0.1rem; font-size:0.95rem;">${this._escapeHtml(v)}</span>`;
      }).filter(Boolean).join(" ");
      return `<div style="margin: 0.3rem 0;">
        <span style="font-size:0.8rem; color:var(--color-text-light); margin-right:0.5rem;">essai ${n + 1}</span>
        ${cells}
      </div>`;
    }).join("");
  }

  _validateInput(_userInput) {
    return {
      success: this._completed && !this._hasIgnorance,
      expected: this._expected.join(" / "),
    };
  }

  cleanup() {
    audio.stop();
  }

  _escape(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  _escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }
}
