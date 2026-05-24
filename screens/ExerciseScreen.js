/**
 * screens/ExerciseScreen.js
 *
 * Écran qui orchestre une session d'exercices.
 *
 * Responsabilités :
 *   - Si `options.queue` est fournie : l'utiliser telle quelle (cas
 *     "séance normale" depuis le Router au sous-pas 10.4+).
 *   - Sinon : construire la queue via ExerciseService.buildQueueLourd(words)
 *     (cas "refaire les mots à revoir" depuis ResultScreen).
 *   - Instancier le bon mode pour chaque entrée de queue
 *   - Gérer la transition entre exercices :
 *       • succès → passage automatique
 *       • échec  → bouton "Suivant" cliquable
 *   - Afficher la progression (compteur N/total)
 *   - Collecter les résultats et les transmettre à onComplete()
 *
 * ─────────────────────────────────────────────────────────────────────
 * TIMING DU PASSAGE AUTOMATIQUE (succès)
 * ─────────────────────────────────────────────────────────────────────
 *
 * Deux familles de modes :
 *
 *   1. Modes à feedback court (mcq, audio_to_text, text_to_audio, ...) :
 *      static managesOwnAdvanceTiming === false (défaut).
 *      → l'écran passe au suivant après AUTO_NEXT_DELAY_MS (1.5s).
 *
 *   2. Modes à feedback audio long (typing_fr, forms_verb, forms_plural) :
 *      static managesOwnAdvanceTiming === true.
 *      → l'écran ATTEND que le mode appelle onReadyToAdvance() avant de
 *        passer. Ça évite de couper une chaîne audio en cours
 *        (ex: "go, went, gone" qui dure ~2.5s).
 *      → filet de sécurité : si onReadyToAdvance() n'arrive pas dans
 *        SAFETY_TIMEOUT_MS, on passe quand même (un onend de
 *        speechSynthesis peut ne jamais se déclencher selon le navigateur).
 *
 * En cas d'échec : toujours le bouton "Suivant" manuel, quel que soit
 * le mode. L'enfant a vu sa correction, il passe quand il est prêt.
 *
 * ─────────────────────────────────────────────────────────────────────
 * Contrat avec les modes (cf. BaseEngine) :
 *   - options.onAnswered(success)  : le mode signale le résultat.
 *   - options.onReadyToAdvance()   : le mode signale qu'il a fini son
 *                                    feedback (optionnel ; utilisé par
 *                                    les modes managesOwnAdvanceTiming).
 *
 * API :
 *   // Cas 1 (sous-pas 10.4+) : queue pré-construite par le Router
 *   const screen = new ExerciseScreen(words, {
 *     queue,                                       // queue déjà filtrée (sans cold_lesson)
 *     onComplete: (results) => { ... },
 *     onAbort:    () => { ... },
 *     onAnswer:   (word, mode, success) => { ... },
 *   });
 *
 *   // Cas 2 (retry depuis ResultScreen) : pas de queue, on rebuild
 *   const screen = new ExerciseScreen(wordsToRetry, {
 *     onComplete: (results) => { ... },
 *     onAbort:    () => { ... },
 *   });
 *
 *   screen.render(container);
 *   screen.destroy();
 */

import { exerciseService } from '../services/ExerciseService.js';

import { McqMode }         from '../modes/McqMode.js';
import { TypingFrMode }    from '../modes/TypingFrMode.js';
import { AudioToTextMode } from '../modes/AudioToTextMode.js';
import { TextToAudioMode } from '../modes/TextToAudioMode.js';
import { FormsVerbMode }   from '../modes/FormsVerbMode.js';
import { FormsPluralMode } from '../modes/FormsPluralMode.js';


// Mapping mode-id → classe.
const MODE_CLASSES = {
  "mcq":           McqMode,
  "typing_fr":     TypingFrMode,
  "audio_to_text": AudioToTextMode,
  "text_to_audio": TextToAudioMode,
  "forms_verb":    FormsVerbMode,
  "forms_plural":  FormsPluralMode,
};


// Délais
const AUTO_NEXT_DELAY_MS = 1500;   // passage auto pour les modes à feedback court
const SAFETY_TIMEOUT_MS  = 6000;   // filet : passage forcé si onReadyToAdvance ne vient pas


export class ExerciseScreen {

  /**
   * @param {Array<Object>} words - mots de la session (déjà normalisés).
   *   Toujours requis (utilisé par certaines vues pour fallback / debug).
   *   Si `options.queue` est fournie, `words` n'est PAS reconverti en
   *   queue ; il sert juste de référence (peut être l'union des mots
   *   présents dans la queue, ou les mots à refaire en cas de retry).
   * @param {Object} options
   * @param {Array<{word,mode}>} [options.queue] - queue d'exos déjà
   *   construite et filtrée (aucune entrée `cold_lesson` — D-10.4a).
   *   Si présente, court-circuite l'appel interne à buildQueueLourd.
   *   Sinon, on rebuild via buildQueueLourd(words) — cas du "Refaire
   *   les mots à revoir" depuis ResultScreen.
   * @param {Function} options.onComplete - reçoit (results)
   * @param {Function} options.onAbort    - reçoit ()
   * @param {Function} [options.onAnswer] - reçoit (word, mode, success) à
   *   chaque réponse de l'enfant. Sert au SessionRecorder pour persister
   *   en stream (sauvegarde intra-séance). Best-effort : si le callback
   *   throw, on log mais on n'interrompt PAS la séance.
   */
  constructor(words, options = {}) {
    if (!Array.isArray(words) || words.length === 0) {
      throw new Error("ExerciseScreen nécessite au moins un mot");
    }

    this.words = words;
    this.onComplete = options.onComplete || (() => {});
    this.onAbort = options.onAbort || (() => {});
    this.onAnswer = options.onAnswer || (() => {});

    // Queue d'exos :
    //   - si options.queue est fournie (cas séance normale via Router,
    //     sous-pas 10.4+), on l'utilise telle quelle. Le Router a déjà
    //     filtré les entrées cold_lesson (D-10.4a).
    //   - sinon, on rebuild via buildQueueLourd (cas "Refaire les mots
    //     à revoir" depuis ResultScreen → on passe des mots bruts).
    if (Array.isArray(options.queue)) {
      // Garde-fou : si jamais une queue arrive avec des cold_lesson
      // résiduels, on les filtre ici. C'est une ceinture en plus de la
      // bretelle (le Router est censé les avoir déjà retirés).
      this.queue = options.queue.filter(item => item.mode !== "cold_lesson");
    } else {
      this.queue = exerciseService.buildQueueLourd(words);
    }

    if (this.queue.length === 0) {
      throw new Error("ExerciseScreen : queue d'exos vide après construction");
    }

    this.currentIndex = 0;
    this.results = [];

    this.container = null;
    this._currentMode = null;
    this._destroyed = false;

    // Gestion du timing de passage
    this._advanceTimer = null;       // timer (auto-next OU filet de sécurité)
    this._advanceArmed = false;      // true entre "succès" et "passage effectif"
  }

  /**
   * Rendu initial.
   */
  render(container) {
    if (this._destroyed) {
      throw new Error("Impossible de render un ExerciseScreen détruit");
    }
    this.container = container;

    container.innerHTML = `
      <div class="exercise-screen">
        <header class="exercise-screen-header">
          <button class="exercise-screen-abort" data-action="abort" aria-label="Quitter">×</button>
          <div class="exercise-screen-progress">
            <div class="exercise-screen-progress-bar">
              <div class="exercise-screen-progress-fill" data-el="progress-fill"></div>
            </div>
            <div class="exercise-screen-progress-text" data-el="progress-text"></div>
          </div>
        </header>

        <main class="exercise-screen-stage" data-el="stage"></main>

        <footer class="exercise-screen-footer">
          <button class="btn btn-primary hidden" data-action="next" data-el="next-btn">
            Suivant →
          </button>
        </footer>
      </div>
    `;

    this._stageEl = container.querySelector('[data-el="stage"]');
    this._progressFillEl = container.querySelector('[data-el="progress-fill"]');
    this._progressTextEl = container.querySelector('[data-el="progress-text"]');
    this._nextBtn = container.querySelector('[data-el="next-btn"]');

    container.querySelector('[data-action="abort"]')
      .addEventListener('click', () => this._onAbortClick());

    this._nextBtn.addEventListener('click', () => this._goToNext());

    this._renderCurrentExercise();
  }

  /**
   * Affiche l'exercice courant.
   * @private
   */
  _renderCurrentExercise() {
    if (this.currentIndex >= this.queue.length) {
      this._finish();
      return;
    }

    this._updateProgress();
    this._hideNextButton();
    this._advanceArmed = false;

    const item = this.queue[this.currentIndex];
    const ModeClass = MODE_CLASSES[item.mode];

    if (!ModeClass) {
      console.error(`[ExerciseScreen] Mode inconnu : "${item.mode}"`);
      // On saute proprement plutôt que de planter
      this.currentIndex++;
      this._renderCurrentExercise();
      return;
    }

    // Extraire les options spécifiques au mode (forms, expected, etc.)
    // en mettant de côté word/mode qui ont déjà leur rôle ; on injecte
    // nos callbacks au passage.
    // eslint-disable-next-line no-unused-vars
    const { word: _w, mode: _m, ...modeOptions } = item;

    this._currentMode = new ModeClass(item.word, {
      ...modeOptions,
      onAnswered: (success) => this._onAnswered(success),
      onReadyToAdvance: () => this._onReadyToAdvance(),
    });

    this._stageEl.innerHTML = "";
    this._currentMode.render(this._stageEl);
  }

  /**
   * Callback du mode : "l'enfant a répondu, voici le résultat".
   * @param {boolean} success
   * @private
   */
  _onAnswered(success) {
    if (this._destroyed) return;

    // Enregistre le résultat
    const item = this.queue[this.currentIndex];
    this.results.push({
      word: item.word,
      mode: item.mode,
      success,
    });

    // Notification "stream" pour persistance intra-séance (best-effort :
    // si le callback throw, on log mais on continue la séance — la
    // priorité reste l'expérience de l'enfant).
    try {
      this.onAnswer(item.word, item.mode, success);
    } catch (err) {
      console.warn("[ExerciseScreen] onAnswer a levé une erreur :", err);
    }

    if (!success) {
      // Échec → attente clic enfant. L'enfant a vu sa correction + recopie ;
      // le bouton n'est pas une punition, c'est un "j'ai compris, je passe".
      this._showNextButton();
      return;
    }

    // ----- Succès -----
    this._advanceArmed = true;

    const managesOwnTiming =
      this._currentMode &&
      this._currentMode.constructor.managesOwnAdvanceTiming === true;

    if (managesOwnTiming) {
      // Le mode a un feedback audio long. On attend qu'il nous signale
      // la fin via onReadyToAdvance(). Filet de sécurité au cas où le
      // signal n'arrive jamais (onend de speechSynthesis capricieux).
      this._advanceTimer = setTimeout(() => {
        this._advanceTimer = null;
        console.warn(
          `[ExerciseScreen] onReadyToAdvance non reçu après ${SAFETY_TIMEOUT_MS}ms ` +
          `(mode "${item.mode}") — passage forcé par le filet de sécurité.`
        );
        this._goToNext();
      }, SAFETY_TIMEOUT_MS);
    } else {
      // Mode à feedback court → passage auto après le délai standard.
      this._advanceTimer = setTimeout(() => {
        this._advanceTimer = null;
        this._goToNext();
      }, AUTO_NEXT_DELAY_MS);
    }
  }

  /**
   * Callback du mode : "j'ai fini mon feedback (audio compris), tu peux
   * me détruire et passer au suivant".
   *
   * Appelé uniquement par les modes managesOwnAdvanceTiming. Ignoré si
   * on n'est pas en attente d'un passage (ex: appelé après un échec, ou
   * en double).
   * @private
   */
  _onReadyToAdvance() {
    if (this._destroyed) return;
    if (!this._advanceArmed) return;  // pas en attente → ignore

    this._goToNext();
  }

  /**
   * Passe à l'exercice suivant. Annule tout timer de passage en cours.
   * @private
   */
  _goToNext() {
    if (this._destroyed) return;

    // Annuler le timer de passage (auto-next ou filet de sécurité).
    // Couvre aussi le cas où l'enfant clique "Suivant" pendant qu'un
    // timer tourne.
    if (this._advanceTimer) {
      clearTimeout(this._advanceTimer);
      this._advanceTimer = null;
    }
    this._advanceArmed = false;

    // Détruire le mode courant
    if (this._currentMode) {
      this._currentMode.destroy();
      this._currentMode = null;
    }

    this.currentIndex++;
    this._renderCurrentExercise();
  }

  /**
   * Fin de session : appelle onComplete avec les résultats.
   * @private
   */
  _finish() {
    this._updateProgress();
    this._stageEl.innerHTML = `
      <div class="exercise-screen-finish">
        <div class="exercise-screen-finish-icon">🎉</div>
        <div class="exercise-screen-finish-text">Session terminée !</div>
      </div>
    `;
    this._hideNextButton();

    // Appel asynchrone pour laisser le DOM se mettre à jour
    setTimeout(() => {
      if (!this._destroyed) {
        this.onComplete(this.results);
      }
    }, 100);
  }

  /**
   * Met à jour la barre de progression.
   * @private
   */
  _updateProgress() {
    const total = this.queue.length;
    const done = this.currentIndex;
    const percent = total > 0 ? (done / total) * 100 : 0;

    this._progressFillEl.style.width = `${percent}%`;
    this._progressTextEl.textContent = `${done} / ${total}`;
  }

  _showNextButton() {
    this._nextBtn.classList.remove('hidden');
    this._nextBtn.focus();
  }

  _hideNextButton() {
    this._nextBtn.classList.add('hidden');
  }

  /**
   * L'utilisateur clique sur la croix.
   * @private
   */
  _onAbortClick() {
    // Confirmation simple. Si on veut une modale plus tard, on l'extraira.
    //
    // Note : le message évite la promesse trompeuse "les exercices faits
    // seront conservés". Tant que le ReviewService n'est pas en place, une
    // session abandonnée puis terminée repart de zéro le lendemain. Voir
    // decisions-en-attente.md #1 et #4.
    const msg = "Quitter la session ?";
    if (window.confirm(msg)) {
      this.onAbort();
    }
  }

  /**
   * Détruit l'écran : nettoie timers, modes et DOM.
   */
  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;

    if (this._advanceTimer) {
      clearTimeout(this._advanceTimer);
      this._advanceTimer = null;
    }

    if (this._currentMode) {
      this._currentMode.destroy();
      this._currentMode = null;
    }

    if (this.container) {
      this.container.innerHTML = "";
      this.container = null;
    }
  }
}
