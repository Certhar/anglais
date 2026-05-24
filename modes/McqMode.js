/**
 * modes/McqMode.js
 * 
 * Mode QCM : un mot anglais est affiché, l'utilisateur clique sur la bonne
 * traduction française parmi 4 options.
 * 
 * Comportement en cas d'erreur :
 *   - Le mauvais bouton devient rouge et désactivé
 *   - Les autres restent cliquables (l'enfant peut retenter)
 *   - Le mot est marqué comme raté UNE FOIS (pas un raté par clic)
 *   - Quand le bon est trouvé : tout devient vert, on émet 'exercise:answered'
 *     avec le résultat final (success = true MAIS hadFailure = true si tâtonnement)
 */

import { BaseEngine } from '../core/BaseEngine.js';
import { shuffle } from '../core/helpers.js';
import { wordRepo } from '../repositories/WordRepository.js';
import { audio } from '../services/AudioService.js';
import { flag } from '../ui/icons.js';


export class McqMode extends BaseEngine {

  static get modeId() { return "mcq"; }

  /**
   * Ce mode rejoue l'audio anglais au succès (exposition audio maximale).
   * Il gère donc lui-même le moment où il est prêt à passer au suivant,
   * via options.onReadyToAdvance() — sinon l'ExerciseScreen couperait
   * l'audio.
   */
  static get managesOwnAdvanceTiming() { return true; }

  constructor(word, options = {}) {
    super(word, options);
    this._shuffledOptions = [];   // les 4 options affichées
    this._completed = false;       // true quand le bon a été trouvé
    this._hadFailure = false;      // true si au moins un mauvais clic
  }

  _render() {
    const distractors = wordRepo.getDistractors(this.word, 3);
    this._shuffledOptions = shuffle([...distractors, this.word]);

    // À partir de 6 options, on bascule en grille 2 colonnes pour éviter
    // une colonne unique trop longue. Sous 6, on garde 1 colonne pour la
    // lisibilité (chaque option en pleine largeur, plus simple à scanner).
    const colsClass = this._shuffledOptions.length >= 6 ? ' mcq-options--cols-2' : '';

    this.container.innerHTML = `
      <div class="card">
        <div class="exercise-prompt">
          <div class="exercise-prompt-label">Quelle est la traduction en français de</div>
          <div class="exercise-prompt-flag">${flag('fr')}</div>
          <div class="exercise-prompt-word">${this.word.en}</div>
          <button class="audio-btn" data-action="audio" style="margin:1rem auto 0;" aria-label="Écouter">🔊</button>
        </div>
        <div class="mcq-options${colsClass}">
          ${this._shuffledOptions.map(opt => `
            <button class="mcq-option" data-id="${opt.id}">${opt.fr}</button>
          `).join("")}
        </div>
      </div>
    `;

    this.container.querySelector('[data-action="audio"]')
      .addEventListener('click', () => this._playAudio());

    this.container.querySelectorAll('.mcq-option')
      .forEach(btn => {
        btn.addEventListener('click', () => this._onOptionClick(btn));
      });

    this._setTimeout(() => this._playAudio(), 300);
  }

  _playAudio(opts = {}) {
    const btn = this.container.querySelector('[data-action="audio"]');
    if (btn) btn.classList.add('playing');
    audio.speak(this.word.en, {
      onEnd: () => {
        if (btn) btn.classList.remove('playing');
        if (opts.onDone) opts.onDone();
      },
    });
  }

  _onOptionClick(btn) {
    if (this._completed) return;

    const chosenId = parseInt(btn.dataset.id);
    const isCorrect = chosenId === this.word.id;

    if (!isCorrect) {
      // Mauvais clic : marquer le bouton, désactiver, continuer
      btn.classList.add('wrong');
      btn.disabled = true;
      this._hadFailure = true;
      return;
    }

    // Bon clic : tout valider
    this._completed = true;
    btn.classList.add('correct');

    // Désactiver tous les boutons
    this.container.querySelectorAll('.mcq-option').forEach(b => {
      b.disabled = true;
    });

    // Émettre l'événement final
    // success = true MAIS si hadFailure, l'enfant a tâtonné → marqué comme raté
    const finalSuccess = !this._hadFailure;
    const result = this.validate(chosenId, finalSuccess);

    // Feedback texte : toujours positif quand on a trouvé la bonne réponse
    // L'info du tâtonnement reste dans l'événement (pour la pile à retravailler)
    // mais on ne la rappelle pas à l'écran : double peine inutile
    const fb = document.createElement('div');
    fb.className = 'feedback correct';
    fb.innerHTML = '✓ Bravo !';
    this.container.querySelector('.card').appendChild(fb);

    // Exposition audio maximale : on rejoue le mot anglais au succès.
    // L'enfant vient d'associer correctement le mot à sa traduction —
    // on en profite pour réancrer la forme sonore. onReadyToAdvance est
    // signalé à la fin de l'audio pour que l'ExerciseScreen attende.
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
      this.options.onAnswered(finalSuccess);
    }
  }

  /**
   * Surcharge de validate() pour passer le finalSuccess plutôt que de le déduire.
   * Permet de gérer le cas "trouvé après tâtonnement" comme un raté pédagogiquement.
   */
  validate(userInput, forcedResult = null) {
    if (forcedResult !== null) {
      // On force le résultat (cas du tâtonnement)
      const result = { success: forcedResult, expected: this.word.fr };
      // On émet manuellement l'événement parce qu'on ne passe pas par
      // le validate de la classe parente
      import('../core/EventBus.js').then(({ events }) => {
        events.emit('exercise:answered', {
          word: this.word,
          mode: this.constructor.modeId,
          success: forcedResult,
          userInput,
          expected: this.word.fr,
          hadFailure: this._hadFailure,
        });
      });
      return result;
    }
    return super.validate(userInput);
  }

  _validateInput(chosenId) {
    const success = chosenId === this.word.id;
    return {
      success,
      expected: this.word.fr,
    };
  }

  cleanup() {
    audio.stop();
  }
}
