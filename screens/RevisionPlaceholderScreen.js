/**
 * screens/RevisionPlaceholderScreen.js
 *
 * Écran provisoire affiché quand l'enfant clique sur "Réviser" sur
 * HomeScreen. Sera remplacé par le vrai écran de révision quand
 * l'ExerciseService spécial (révision longue : 2 exos par mot) sera
 * implémenté (Pas 11+).
 *
 * ─────────────────────────────────────────────────────────────────────
 * RÔLE PROVISOIRE
 * ─────────────────────────────────────────────────────────────────────
 * Affiche un message clair "Cette fonctionnalité arrive bientôt", avec
 * un bouton pour retourner à l'accueil. L'enfant n'est pas perdu, et
 * Gauthier en tant que développeur voit immédiatement quand on tombe
 * sur ce flux (= une révision longue est due).
 *
 * Pour faciliter le debug, on affiche aussi le nombre de mots qui
 * seraient à réviser (info passée par le Router).
 *
 * ─────────────────────────────────────────────────────────────────────
 * API
 * ─────────────────────────────────────────────────────────────────────
 *   const screen = new RevisionPlaceholderScreen({
 *     childName: "Max",
 *     nbMots: 3,          // optionnel, pour info debug
 *     onBack: () => { ... },
 *   });
 *   screen.render(container);
 *   screen.destroy();
 */


export class RevisionPlaceholderScreen {

  /**
   * @param {Object} options
   * @param {string} [options.childName] - prénom de l'enfant (pour personnaliser)
   * @param {number} [options.nbMots]    - nombre de mots à réviser (debug)
   * @param {Function} [options.onBack]  - callback du bouton "Retour"
   */
  constructor(options = {}) {
    this.childName = options.childName || "";
    this.nbMots = options.nbMots ?? null;
    this.onBack = options.onBack || (() => {});

    this.container = null;
    this._destroyed = false;
  }

  render(container) {
    if (this._destroyed) {
      throw new Error("Impossible de render un RevisionPlaceholderScreen détruit");
    }
    this.container = container;

    const greeting = this.childName
      ? `Salut ${this._escape(this.childName)} !`
      : "Aujourd'hui c'est révision !";

    const detail = this.nbMots != null
      ? `<div class="revision-placeholder-detail">${this.nbMots} mot${this.nbMots > 1 ? "s" : ""} à revoir</div>`
      : "";

    this.container.innerHTML = `
      <div class="revision-placeholder">
        <div class="revision-placeholder-emoji">🔁</div>
        <div class="revision-placeholder-title">${greeting}</div>
        <div class="revision-placeholder-message">
          Aujourd'hui c'est jour de révision.<br>
          Cette fonctionnalité arrive bientôt !
        </div>
        ${detail}
        <button class="revision-placeholder-back" data-action="back">
          ← Retour
        </button>
      </div>
    `;

    this.container.querySelector('[data-action="back"]')
      .addEventListener('click', () => this.onBack());
  }

  /** Échappement HTML minimal. @private */
  _escape(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    if (this.container) {
      this.container.innerHTML = "";
      this.container = null;
    }
  }
}
