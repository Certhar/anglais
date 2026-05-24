/**
 * screens/ColdLessonScreen.js
 *
 * Écran de "leçon froide" : présente les N mots du jour, un par un,
 * sans aucune évaluation. L'enfant défile à son rythme avec Précédent/
 * Suivant, et termine soit en sortant ("Terminé"), soit en enchaînant
 * sur les exercices ("Passer aux exercices →").
 *
 * ─────────────────────────────────────────────────────────────────────
 * PHILOSOPHIE
 * ─────────────────────────────────────────────────────────────────────
 * Cf. architecture.md : "double étape quotidienne — leçon froide
 * (découverte) + exercices (évaluation)". La leçon froide est un
 * PRÉREQUIS aux exercices : l'enfant doit voir le mot avant de devoir
 * répondre dessus. Pas d'enjeu, pas de score, pas de barre de
 * progression — juste un compteur N/total pour se repérer.
 *
 * ─────────────────────────────────────────────────────────────────────
 * RESPONSABILITÉS
 * ─────────────────────────────────────────────────────────────────────
 * Cet écran orchestre la séquence ; il ne décide pas QUOI faire ensuite.
 * Deux callbacks distincts pour la sortie :
 *   - onFinish() : "je veux juste sortir de la leçon" (vers l'accueil)
 *   - onContinueToExercises() : "j'enchaîne maintenant" (vers exo)
 *
 * Le routage réel est la responsabilité de l'orchestrateur extérieur
 * (Router au Round 6). On garde la même philosophie que ResultScreen.
 *
 * ─────────────────────────────────────────────────────────────────────
 * NAVIGATION
 * ─────────────────────────────────────────────────────────────────────
 * - Boutons Précédent / Suivant en bas
 * - Précédent désactivé sur la première carte
 * - Sur la dernière carte : Suivant remplacé par "Terminé" +
 *   "Passer aux exercices →"
 * - Raccourcis clavier ← / → en bonus (utile pour parcourir vite)
 *
 * ─────────────────────────────────────────────────────────────────────
 * API
 * ─────────────────────────────────────────────────────────────────────
 *   const screen = new ColdLessonScreen(words, {
 *     onFinish: () => { ... },
 *     onContinueToExercises: () => { ... },
 *     onAbort: () => { ... },   // bouton croix (optionnel)
 *   });
 *   screen.render(container);
 *   screen.destroy();
 */

import { ColdLessonMode } from '../modes/ColdLessonMode.js';


export class ColdLessonScreen {

  /**
   * @param {Array<Object>} words - mots à présenter (déjà normalisés)
   * @param {Object} options
   * @param {Function} [options.onFinish]
   * @param {Function} [options.onContinueToExercises]
   * @param {Function} [options.onAbort]
   */
  constructor(words, options = {}) {
    if (!Array.isArray(words) || words.length === 0) {
      throw new Error("ColdLessonScreen nécessite au moins un mot");
    }

    this.words = words;
    this.onFinish = options.onFinish || (() => {});
    this.onContinueToExercises = options.onContinueToExercises || (() => {});
    this.onAbort = options.onAbort || (() => {});

    this.currentIndex = 0;
    this.container = null;
    this._currentMode = null;
    this._destroyed = false;

    // Liaison du listener clavier pour pouvoir le détacher au destroy
    this._onKeydown = this._onKeydown.bind(this);
  }

  /**
   * Rendu initial.
   */
  render(container) {
    if (this._destroyed) {
      throw new Error("Impossible de render un ColdLessonScreen détruit");
    }
    this.container = container;

    container.innerHTML = `
      <div class="cold-lesson-screen">

        <header class="cold-lesson-screen-header">
          <button class="cold-lesson-screen-abort"
                  data-action="abort"
                  aria-label="Quitter">×</button>
          <div class="cold-lesson-screen-counter" data-el="counter"></div>
          <div class="cold-lesson-screen-header-spacer"></div>
        </header>

        <main class="cold-lesson-screen-stage" data-el="stage"></main>

        <footer class="cold-lesson-screen-footer" data-el="footer"></footer>

      </div>
    `;

    this._stageEl = container.querySelector('[data-el="stage"]');
    this._counterEl = container.querySelector('[data-el="counter"]');
    this._footerEl = container.querySelector('[data-el="footer"]');

    container.querySelector('[data-action="abort"]')
      .addEventListener('click', () => this._onAbortClick());

    document.addEventListener('keydown', this._onKeydown);

    this._renderCurrentCard();
  }

  /**
   * Affiche la carte courante : compteur, mode au centre, footer adapté.
   * @private
   */
  _renderCurrentCard() {
    const total = this.words.length;
    const word = this.words[this.currentIndex];
    const isFirst = this.currentIndex === 0;
    const isLast = this.currentIndex === total - 1;

    // Compteur
    this._counterEl.textContent = `${this.currentIndex + 1} / ${total}`;

    // Détruire l'éventuel mode précédent avant d'instancier le nouveau
    if (this._currentMode) {
      this._currentMode.destroy();
      this._currentMode = null;
    }
    this._stageEl.innerHTML = "";

    // Le mode rend sa propre carte ; on lui dit de ne PAS afficher son
    // bouton "J'ai vu" interne — c'est l'écran qui fournit les boutons.
    this._currentMode = new ColdLessonMode(word, {
      showSeenButton: false,
    });
    this._currentMode.render(this._stageEl);

    // Footer : Précédent + (Suivant) OU (Terminé + Passer aux exercices)
    this._renderFooter(isFirst, isLast);
  }

  /**
   * Construit le footer selon la position dans la séquence.
   * @private
   */
  _renderFooter(isFirst, isLast) {
    if (isLast) {
      // Dernière carte : Précédent + Terminé + Passer aux exercices
      this._footerEl.innerHTML = `
        <button class="btn btn-secondary"
                data-action="prev"
                ${isFirst ? "disabled" : ""}>
          ← Précédent
        </button>
        <button class="btn btn-secondary" data-action="finish">
          Terminé
        </button>
        <button class="btn btn-primary" data-action="continue">
          Passer aux exercices →
        </button>
      `;
    } else {
      // Carte normale : Précédent + Suivant
      this._footerEl.innerHTML = `
        <button class="btn btn-secondary"
                data-action="prev"
                ${isFirst ? "disabled" : ""}>
          ← Précédent
        </button>
        <button class="btn btn-primary" data-action="next">
          Suivant →
        </button>
      `;
    }

    // Listeners (re-attachés à chaque rendu de footer — c'est OK, le
    // footer est ré-écrit à chaque carte, donc on n'accumule pas)
    const prevBtn = this._footerEl.querySelector('[data-action="prev"]');
    if (prevBtn) prevBtn.addEventListener('click', () => this._goPrev());

    const nextBtn = this._footerEl.querySelector('[data-action="next"]');
    if (nextBtn) nextBtn.addEventListener('click', () => this._goNext());

    const finishBtn = this._footerEl.querySelector('[data-action="finish"]');
    if (finishBtn) finishBtn.addEventListener('click', () => this.onFinish());

    const continueBtn = this._footerEl.querySelector('[data-action="continue"]');
    if (continueBtn) continueBtn.addEventListener('click', () => this.onContinueToExercises());
  }

  /**
   * Navigue vers la carte précédente. No-op si on est déjà sur la première.
   * @private
   */
  _goPrev() {
    if (this._destroyed) return;
    if (this.currentIndex === 0) return;
    this.currentIndex--;
    this._renderCurrentCard();
  }

  /**
   * Navigue vers la carte suivante. Sur la dernière carte, le bouton
   * Suivant n'existe pas (remplacé par Terminé + Exercices), donc
   * cette méthode ne devrait pas être appelée — mais on garde un
   * garde-fou au cas où (raccourci clavier).
   * @private
   */
  _goNext() {
    if (this._destroyed) return;
    if (this.currentIndex >= this.words.length - 1) return;
    this.currentIndex++;
    this._renderCurrentCard();
  }

  /**
   * Raccourcis clavier : flèches gauche/droite pour parcourir.
   * Pratique pour parcourir 10 cartes rapidement.
   * @private
   */
  _onKeydown(e) {
    if (this._destroyed) return;
    // On ignore si une saisie a le focus (par sécurité — y a pas
    // d'input dans cet écran, mais au cas où un futur ajout)
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      this._goPrev();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      this._goNext();
    }
  }

  /**
   * Croix : confirmation puis sortie.
   * @private
   */
  _onAbortClick() {
    const msg = "Quitter la leçon ?";
    if (window.confirm(msg)) {
      this.onAbort();
    }
  }

  /**
   * Détruit l'écran : nettoie le mode courant, le listener clavier et le DOM.
   */
  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;

    document.removeEventListener('keydown', this._onKeydown);

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
