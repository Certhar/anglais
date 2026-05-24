/**
 * modes/AudioToTextMode.js
 *
 * Mode dictée : l'utilisateur entend un mot anglais et doit le taper
 * en anglais. Exercice de compréhension orale → écriture, pour ancrer
 * le lien prononciation ↔ orthographe.
 *
 * Particularités pédagogiques :
 *   - Le mot anglais N'EST PAS affiché (sinon l'exo est trivial). Seul
 *     un bouton audio et un libellé "Tape ce que tu entends" apparaissent.
 *   - Audio auto-joué à l'affichage, rejouable à volonté via le bouton.
 *   - Vitesse 0.7 (lent) pendant la phase d'essais pour faciliter la
 *     discrimination des sons.
 *   - À la révélation, le mot apparaît visuellement (via TextInputMode)
 *     ET l'audio est rejoué à vitesse 0.9 (normale). L'idée : ancrer
 *     l'écriture sur la prononciation normale, puisque l'enfant voit
 *     déjà le mot.
 *
 * Toute la mécanique des essais multiples, classification typo/ignorance,
 * révélation et recopie vit dans la classe parente TextInputMode.
 */

import { TextInputMode } from './TextInputMode.js';
import { audio } from '../services/AudioService.js';
import { flag } from '../ui/icons.js';


// Vitesses de lecture. La phase "guess" est plus lente pour aider à
// distinguer les sons d'un mot qu'on n'a jamais vu écrit.
const RATE_GUESS  = 0.7;
const RATE_REVEAL = 0.9;


export class AudioToTextMode extends TextInputMode {

  static get modeId() { return "audio_to_text"; }

  /**
   * Ce mode rejoue l'audio anglais au succès (cf. _onAfterSuccess). Il
   * gère donc lui-même le moment où il est prêt à passer au suivant,
   * via options.onReadyToAdvance() — sinon l'ExerciseScreen couperait
   * l'audio.
   */
  static get managesOwnAdvanceTiming() { return true; }

  _getExpected() {
    return this.word.en;
  }

  _getLanguage() {
    return "en";
  }

  _renderPrompt() {
    // Pas de mot affiché (exo d'écoute) : consigne → drapeau → bouton audio.
    // Le drapeau 🇬🇧 indique la langue de la RÉPONSE attendue (anglais) :
    // l'enfant sait qu'il doit taper de l'anglais, pas la traduction.
    return `
      <div class="exercise-prompt">
        <div class="exercise-prompt-label">Écoute et écris en anglais</div>
        <div class="exercise-prompt-flag">${flag('gb')}</div>
        <button class="audio-btn"
                data-action="audio"
                style="margin:1rem auto 0;"
                aria-label="Écouter">🔊</button>
      </div>
    `;
  }

  _onAfterRender() {
    // Listener sur le bouton audio (rejouable à volonté)
    this.container.querySelector('[data-action="audio"]')
      .addEventListener('click', () => this._playAudio(RATE_GUESS));

    // Auto-play à l'affichage (vitesse lente)
    this._setTimeout(() => this._playAudio(RATE_GUESS), 300);
  }

  /**
   * Hook : à la révélation, on rejoue l'audio à vitesse normale (0.9)
   * pour ancrer la recopie sur la prononciation standard.
   */
  _onAfterReveal() {
    this._setTimeout(() => this._playAudio(RATE_REVEAL), 200);
  }

  /**
   * Hook : à la fin (succès), on rejoue l'audio à vitesse normale.
   * Logique pédagogique : à chaque fois que le mot apparaît visuellement
   * à l'enfant, on l'accompagne d'une lecture à vitesse normale pour
   * ancrer le lien orthographe ↔ prononciation.
   *
   * Joué systématiquement, même en cas de succès en recopie post-révélation
   * (cohérence : "tu as fini → tu réentends le mot").
   *
   * Le délai laisse le temps à l'enfant de voir le ✓ Bravo avant l'audio.
   * On signale onReadyToAdvance() à la fin de l'audio pour que
   * l'ExerciseScreen attende avant de passer au mot suivant.
   */
  _onAfterSuccess() {
    this._setTimeout(() => {
      this._playAudio(RATE_REVEAL, {
        onDone: () => {
          if (this.options.onReadyToAdvance) {
            this.options.onReadyToAdvance();
          }
        },
      });
    }, 400);
  }

  /**
   * Joue l'audio à la vitesse demandée, avec animation visuelle du bouton.
   * @param {number} rate - vitesse de lecture (0.5 = lent, 1.0 = normal)
   * @param {Object} [opts]
   * @param {Function} [opts.onDone] - appelé quand l'audio est terminé
   * @private
   */
  _playAudio(rate, opts = {}) {
    const btn = this.container?.querySelector('[data-action="audio"]');
    if (btn) btn.classList.add('playing');
    audio.speak(this.word.en, {
      rate,
      onEnd: () => {
        if (btn) btn.classList.remove('playing');
        if (opts.onDone) opts.onDone();
      },
    });
  }

  cleanup() {
    audio.stop();
  }
}
