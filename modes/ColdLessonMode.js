/**
 * modes/ColdLessonMode.js
 *
 * Mode "leçon froide" : présentation d'un mot, sans évaluation.
 *
 * Diffère des autres modes :
 *   - Pas d'évaluation (validate() est surchargée pour ne rien faire)
 *   - Aucun "exercise:answered" émis (rien à juger)
 *   - Émet uniquement "exercise:completed" via destroy() de la classe mère
 *
 * Affichage (fidèle au prototype validé par les enfants) :
 *   - Étiquette nature + thème (ex: "verbe · Verbes")
 *   - Mot anglais en gros
 *   - Prononciation phonétique
 *   - Bouton audio (auto-joué à l'affichage, rejouable au clic)
 *   - Traduction française
 *   - Note pédagogique éventuelle (faux-ami, irrégularité, etc.)
 *
 * Note : on a testé l'ordre prono → mot, mais l'œil a tendance à
 * déchiffrer la transcription phonétique au lieu d'ancrer l'orthographe.
 * On garde donc le mot anglais en premier.
 *
 * IMPORTANT — séparation des responsabilités :
 * Ce mode présente UN mot. La navigation entre cartes (précédent / suivant /
 * progression / fin de leçon) est de la responsabilité de l'écran qui
 * orchestre la séquence (futur ColdLessonScreen, ou la page de test pour
 * l'instant).
 *
 * Pour signaler que l'utilisateur a vu le mot et veut passer au suivant,
 * passe un callback options.onSeen — c'est l'orchestrateur qui décidera
 * quoi faire (charger le mot suivant, montrer la page de fin, etc.).
 *
 * Si options.showSeenButton vaut false, on n'affiche pas de bouton "J'ai vu"
 * dans la carte (utile quand l'orchestrateur fournit ses propres boutons
 * Précédent/Suivant à l'extérieur).
 */

import { BaseEngine } from '../core/BaseEngine.js';
import { audio } from '../services/AudioService.js';


// Libellés humains pour la nature grammaticale.
// On peut bouger ça plus tard dans un fichier i18n quand on en aura plusieurs.
const NATURE_LABELS = {
  n: "nom",
  v: "verbe",
  adj: "adjectif",
  adv: "adverbe",
  prep: "préposition",
  conj: "conjonction",
};


export class ColdLessonMode extends BaseEngine {

  static get modeId() { return "cold_lesson"; }

  constructor(word, options = {}) {
    super(word, options);
    this._seen = false;  // true quand l'utilisateur a cliqué "J'ai vu"
  }

  _render() {
    const natureLabel = NATURE_LABELS[this.word.nature] || this.word.nature;
    const themeLabel = this.word.theme || "";
    const tagText = themeLabel
      ? `${natureLabel} · ${themeLabel}`
      : natureLabel;

    const noteHtml = this.word.note
      ? `<div class="word-note">⚠️ ${this._escape(this.word.note)}</div>`
      : "";

    // Bouton "J'ai vu" optionnel : si l'orchestrateur fournit ses propres
    // boutons de navigation à l'extérieur, on n'affiche pas le nôtre.
    const showSeenButton = this.options.showSeenButton !== false;
    const seenButtonHtml = showSeenButton
      ? `<button class="btn btn-large mt-2" data-action="seen">J'ai vu →</button>`
      : "";

    this.container.innerHTML = `
      <div class="word-card">
        <span class="word-nature">${this._escape(tagText)}</span>
        <div class="word-en">${this._escape(this.word.en)}</div>
        <div class="word-prono">${this._escape(this.word.prono || "")}</div>
        <button class="audio-btn" data-action="audio" aria-label="Écouter">🔊</button>
        <div class="word-fr">${this._escape(this.word.fr)}</div>
        ${noteHtml}
      </div>
      ${seenButtonHtml}
    `;

    // Listeners
    this.container.querySelector('[data-action="audio"]')
      .addEventListener('click', () => this._playAudio());

    if (showSeenButton) {
      this.container.querySelector('[data-action="seen"]')
        .addEventListener('click', () => this.markSeen());
    }

    // Auto-play audio à l'affichage (légère temporisation comme dans le proto)
    this._setTimeout(() => this._playAudio(), 300);
  }

  _playAudio() {
    const btn = this.container?.querySelector('[data-action="audio"]');
    if (btn) btn.classList.add('playing');
    audio.speak(this.word.en, {
      onEnd: () => {
        if (btn) btn.classList.remove('playing');
      },
    });
  }

  /**
   * Marque le mot comme "vu" et déclenche le callback onSeen s'il existe.
   * Méthode publique : utilisable depuis l'orchestrateur (boutons externes
   * de navigation par exemple).
   */
  markSeen() {
    if (this._seen) return;
    this._seen = true;

    // Désactiver le bouton "J'ai vu" interne (s'il existe) pour éviter les
    // doubles-clics.
    const btn = this.container?.querySelector('[data-action="seen"]');
    if (btn) btn.disabled = true;

    if (this.options.onSeen) {
      this.options.onSeen(this.word);
    }
  }

  /**
   * Surcharge : ce mode n'évalue jamais. Si quelqu'un appelle validate()
   * malgré tout (par erreur ou par génériquement), on retourne un succès
   * trivial sans émettre d'événement.
   */
  validate(_userInput) {
    return { success: true, expected: this.word.fr };
  }

  /**
   * Surcharge requise par BaseEngine (déclarée abstraite).
   * Inutilisée puisque validate() est court-circuitée.
   */
  _validateInput(_userInput) {
    return { success: true, expected: this.word.fr };
  }

  cleanup() {
    audio.stop();
  }

  /**
   * Échappe le HTML pour éviter les injections via word.note ou word.fr.
   * Sobre, suffisant pour notre cas (corpus sous notre contrôle).
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
