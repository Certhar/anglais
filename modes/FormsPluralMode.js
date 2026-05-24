/**
 * modes/FormsPluralMode.js
 *
 * Mode "pluriel irrégulier" : on présente le singulier (anglais + traduction
 * FR + audio singulier), et l'enfant doit saisir le pluriel.
 *
 * Exemple : pour "wife" / "épouse", attendu : "wives".
 *           pour "child" / "enfant", attendu : "children".
 *
 * Format des données attendu (via options.expected) :
 *   "wives" (chaîne pure)
 *
 * Ce format est cohérent avec celui qu'extrait
 * ExerciseService._extractPluralForm() depuis la note du mot
 * ("pluriel: wives"). PAS DE MODIFICATION de words.json nécessaire.
 *
 * ─────────────────────────────────────────────────────────────────────
 * PRINCIPE PÉDAGOGIQUE FONDAMENTAL : on ne finit JAMAIS sur une faute.
 * ─────────────────────────────────────────────────────────────────────
 *
 * Toute la mécanique des essais multiples / classification typo-ignorance /
 * révélation / phase recopie vit dans la classe parente TextInputMode.
 * FormsPluralMode n'a qu'à définir :
 *   - ce qu'on attend (le pluriel)
 *   - comment afficher la prompt (singulier + FR + audio)
 *   - la langue du champ (en)
 *   - les hooks audio (chaîne mémorielle singulier → pluriel)
 *
 * ─────────────────────────────────────────────────────────────────────
 * STRATÉGIE AUDIO (ancrage prosodique)
 * ─────────────────────────────────────────────────────────────────────
 *
 *   - À l'affichage initial : audio du SINGULIER à vitesse 0.9 (rappel
 *     du point de départ ; l'enfant voit le mot, pas besoin de ralentir).
 *   - Bouton 🔊 pendant la saisie : rejoue le singulier (même fonction).
 *   - À la révélation (échec) : chaîne "wife, wives" à 0.9 — moment-clé
 *     de l'ancrage : l'enfant entend pour la première fois la paire qu'il
 *     n'a pas su produire.
 *   - Au succès : on joue UNIQUEMENT le pluriel ("wives") à 0.9. C'est
 *     la confirmation auditive de la production de l'enfant — il vient
 *     d'écrire "wives", on lui confirme en l'écoutant. Pas besoin de
 *     re-jouer le singulier qu'il avait sous les yeux comme prompt.
 *
 * Cohérent avec FormsVerbMode (qui joue la chaîne base/preterit/participle
 * à la révélation et au succès — différence : le verbe affiche la base et
 * demande les 3 formes, donc rejouer les 3 fait sens).
 */

import { TextInputMode } from './TextInputMode.js';
import { audio } from '../services/AudioService.js';


const RATE = 0.9;


export class FormsPluralMode extends TextInputMode {

  static get modeId() { return "forms_plural"; }

  /**
   * Ce mode joue un feedback audio au succès (le pluriel). Il gère donc
   * lui-même le moment où il est prêt à passer au suivant, via
   * options.onReadyToAdvance() — sinon l'ExerciseScreen couperait l'audio.
   */
  static get managesOwnAdvanceTiming() { return true; }

  constructor(word, options = {}) {
    super(word, options);
    if (!options.expected || typeof options.expected !== "string") {
      throw new Error(
        `FormsPluralMode nécessite options.expected (la forme plurielle, ex: "wives"). `
        + `Reçu pour "${word.en}" : ${JSON.stringify(options.expected)}`
      );
    }
    this._plural = options.expected.trim();
  }

  // =========================================================================
  // Implémentation du contrat TextInputMode
  // =========================================================================

  _getExpected() {
    return this._plural;
  }

  _getLanguage() {
    return "en";
  }

  _renderPrompt() {
    // Consigne avec "pluriel" en couleur + schéma "singulier → ?".
    // Le schéma matérialise visuellement la transformation attendue :
    // on part du singulier, on doit PRODUIRE autre chose (le ? rouge).
    // Ça renforce l'idée que ce n'est pas une simple recopie. La trad FR
    // reste affichée sous le schéma. Cf. decisions sur la lisibilité des
    // consignes (mai 2026).
    return `
      <div class="exercise-prompt">
        <div class="exercise-prompt-instruction">Écris le <span class="highlight-key">pluriel</span></div>
        <div class="forms-plural-schema">
          <span class="forms-plural-schema-singular">${this._escape(this.word.en)}</span>
          <span class="forms-plural-schema-arrow" aria-hidden="true">→</span>
          <span class="forms-plural-schema-target">?</span>
        </div>
        <div class="word-prono" style="margin-top:0.3rem;">${this._escape(this.word.fr)}</div>
        <button class="audio-btn"
                data-action="audio"
                style="margin:1rem auto 0;"
                aria-label="Écouter le singulier">🔊</button>
      </div>
    `;
  }

  // =========================================================================
  // Hooks audio
  // =========================================================================

  _onAfterRender() {
    // Listener du bouton audio (rejoue le singulier seul)
    const btn = this.container.querySelector('[data-action="audio"]');
    if (btn) {
      btn.addEventListener('click', () => this._playSingular());
    }
    // Autoplay du singulier à l'apparition de l'exercice
    this._setTimeout(() => this._playSingular(), 300);
  }

  /**
   * À la révélation, on entend pour la première fois la paire complète.
   * Moment-clé de l'ancrage prosodique singulier ↔ pluriel.
   */
  _onAfterReveal() {
    this._setTimeout(() => this._playPairChain(), 200);
  }

  /**
   * Au succès, on rejoue UNIQUEMENT le pluriel (= ce que l'enfant vient
   * de produire). C'est la confirmation auditive de la trace qu'il a
   * lui-même construite.
   *
   * Pédagogique : pas de "wife... wives" ici. La chaîne complète est jouée
   * uniquement à la révélation (échec), où l'enfant découvre la paire.
   * Au succès, on confirme la production, on ne re-présente pas le départ.
   */
  _onAfterSuccess() {
    // Délai léger pour laisser le feedback "✓ Bravo !" s'afficher avant
    // que l'audio démarre. À la fin de l'audio, on signale à
    // l'orchestrateur qu'il peut passer au mot suivant.
    this._setTimeout(() => {
      this._playPlural({
        onDone: () => {
          if (this.options.onReadyToAdvance) {
            this.options.onReadyToAdvance();
          }
        },
      });
    }, 400);
  }

  // =========================================================================
  // Audio helpers
  // =========================================================================

  _playSingular() {
    const btn = this.container?.querySelector('[data-action="audio"]');
    if (btn) btn.classList.add('playing');
    audio.speak(this.word.en, {
      rate: RATE,
      onEnd: () => {
        if (btn) btn.classList.remove('playing');
      },
    });
  }

  /**
   * Joue uniquement la forme plurielle. Utilisé au succès pour
   * confirmer la production de l'enfant.
   * @param {Object} [opts]
   * @param {Function} [opts.onDone] - appelé quand l'audio est terminé
   */
  _playPlural(opts = {}) {
    audio.speak(this._plural, {
      rate: RATE,
      onEnd: () => {
        if (opts.onDone) opts.onDone();
      },
    });
  }

  /**
   * Joue la chaîne mémorielle "wife, wives" en UNE seule utterance.
   * La virgule + l'espacement produit une pause naturelle gérée par
   * le moteur TTS, sans risque de bug d'enchaînement (cf. Firefox qui
   * peut perdre des utterances enchaînées via onEnd + cancel).
   *
   * Utilisé uniquement à la révélation (échec) : moment-clé de l'ancrage
   * prosodique singulier ↔ pluriel.
   */
  _playPairChain() {
    audio.speak(`${this.word.en}, ${this._plural}`, { rate: RATE });
  }

  // =========================================================================
  // Cleanup
  // =========================================================================

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
}
