/**
 * modes/TypingFrMode.js
 * 
 * Mode saisie : un mot anglais est affiché, l'utilisateur tape sa traduction
 * en français.
 * 
 * Toute la logique des essais multiples / révélation / classification d'erreur
 * vit dans la classe parente TextInputMode.
 * Cette classe n'a plus qu'à définir :
 *   - ce qu'on attend (la traduction française)
 *   - comment afficher la prompt (mot anglais + bouton audio)
 *   - la langue du champ (fr pour adapter le clavier)
 */

import { TextInputMode } from './TextInputMode.js';
import { audio } from '../services/AudioService.js';
import { flag } from '../ui/icons.js';


export class TypingFrMode extends TextInputMode {

  static get modeId() { return "typing_fr"; }

  /**
   * Ce mode rejoue l'audio anglais au succès (cf. _onAfterSuccess).
   * Il gère donc lui-même le moment où il est prêt à passer au suivant,
   * via options.onReadyToAdvance() — sinon l'ExerciseScreen couperait
   * l'audio en passant après son délai fixe.
   */
  static get managesOwnAdvanceTiming() { return true; }

  _getExpected() {
    return this.word.fr;
  }

  _getLanguage() {
    return "fr";
  }

  _renderPrompt() {
    // Consigne complète en français → drapeau → mot.
    // Le drapeau (SVG inline, marche sur toutes plateformes) indique la
    // langue de la RÉPONSE attendue : l'enfant le voit avant d'arriver au
    // mot anglais, et sait dans quelle langue répondre. La consigne reste
    // écrite en français complet ("en français"), le drapeau renforce mais
    // ne remplace pas le mot. Cf. decisions sur la lisibilité (mai 2026).
    return `
      <div class="exercise-prompt">
        <div class="exercise-prompt-label">Traduis en français</div>
        <div class="exercise-prompt-flag">${flag('fr')}</div>
        <div class="exercise-prompt-word">${this.word.en}</div>
        <button class="audio-btn" data-action="audio" style="margin:1rem auto 0;" aria-label="Écouter">🔊</button>
      </div>
    `;
  }

  _onAfterRender() {
    // Écoute du bouton audio
    this.container.querySelector('[data-action="audio"]')
      .addEventListener('click', () => this._playAudio());

    // Autoplay du mot à l'affichage de l'exercice.
    // Règle "exposition audio maximale" : l'enfant entend le mot anglais
    // dès qu'il apparaît, avant même de chercher la traduction.
    this._setTimeout(() => this._playAudio(), 300);
  }

  /**
   * À la révélation (après 3 essais ratés), on rejoue le mot anglais.
   * L'enfant va recopier la traduction française : entendre la forme
   * sonore anglaise pendant qu'il a la réponse sous les yeux renforce
   * le lien son ↔ sens au moment où il en a le plus besoin.
   */
  _onAfterReveal() {
    this._setTimeout(() => this._playAudio(), 200);
  }

  /**
   * Au succès, on rejoue le mot anglais. L'enfant vient d'associer
   * correctement le sens (il a tapé la bonne traduction) — c'est le
   * moment idéal pour réentendre la forme sonore et consolider le
   * lien son ↔ sens. Principe : exposition audio maximale.
   *
   * On signale onReadyToAdvance() à la fin de l'audio pour que
   * l'ExerciseScreen attende avant de passer au mot suivant.
   */
  _onAfterSuccess() {
    this._setTimeout(() => {
      this._playAudio({
        onDone: () => {
          if (this.options.onReadyToAdvance) {
            this.options.onReadyToAdvance();
          }
        },
      });
    }, 400);
  }

  /**
   * Joue l'audio du mot anglais.
   * @param {Object} [opts]
   * @param {Function} [opts.onDone] - appelé quand l'audio est terminé
   */
  _playAudio(opts = {}) {
    const btn = this.container?.querySelector('[data-action="audio"]');
    if (btn) btn.classList.add('playing');
    audio.speak(this.word.en, {
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

