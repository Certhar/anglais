/**
 * screens/ResultScreen.js
 *
 * Écran de bilan de fin de session.
 *
 * Reçoit les résultats bruts d'ExerciseScreen (un tableau d'entrées
 * { word, mode, success }, une par exercice) et présente un bilan
 * adapté à un enfant :
 *   - un en-tête de célébration (ton positif quoi qu'il arrive)
 *   - une note en étoiles (1 à 3)
 *   - un compteur "X mots acquis / Y à revoir"
 *   - la liste des mots, chacun dépliable pour voir le détail par exercice
 *   - deux actions : "Terminer" et "Refaire les mots à revoir"
 *
 * ─────────────────────────────────────────────────────────────────────
 * REGROUPEMENT PAR MOT
 * ─────────────────────────────────────────────────────────────────────
 * Un même mot passe par plusieurs exercices dans une session (book en
 * mcq, puis en typing, puis en audio...). L'enfant pense en "mots", pas
 * en "exercices". On regroupe donc les entrées par mot :
 *   - un mot est "acquis" s'il a été réussi sur TOUS ses exercices
 *   - un mot est "à revoir" dès qu'il a au moins un raté
 *
 * ─────────────────────────────────────────────────────────────────────
 * FORMULE DES ÉTOILES
 * ─────────────────────────────────────────────────────────────────────
 *   ⭐⭐⭐  tous les mots acquis
 *   ⭐⭐    plus de la moitié des mots acquis
 *   ⭐      au moins un mot acquis (la moitié ou moins)
 *   ⭐      même avec 0 mot acquis : on ne met jamais 0 étoile.
 *           L'enfant a terminé sa session, c'est déjà un effort.
 *
 * ─────────────────────────────────────────────────────────────────────
 * API :
 *   const screen = new ResultScreen(results, {
 *     onFinish:      () => { ... },   // bouton "Terminer"
 *     onRetryFailed: (wordsToRetry) => { ... },  // bouton "Refaire les mots à revoir"
 *     aborted:       false,           // true si la session a été interrompue
 *   });
 *   screen.render(container);
 *   screen.destroy();
 *
 * Note : onRetryFailed reçoit la liste des objets `word` à revoir, prête
 * à être renvoyée à un nouvel ExerciseScreen. Le branchement réel se
 * fera au Round 6 (Router) ; ici on se contente d'exposer le callback.
 */


export class ResultScreen {

  /**
   * @param {Array<Object>} results - entrées { word, mode, success }
   * @param {Object} options
   * @param {Function} [options.onFinish]      - callback bouton "Terminer"
   * @param {Function} [options.onRetryFailed] - callback bouton "Refaire", reçoit (wordsToRetry)
   * @param {boolean}  [options.aborted]       - true si session interrompue
   */
  constructor(results, options = {}) {
    this.results = Array.isArray(results) ? results : [];
    this.onFinish = options.onFinish || (() => {});
    this.onRetryFailed = options.onRetryFailed || (() => {});
    this.aborted = options.aborted === true;

    this.container = null;
    this._destroyed = false;

    // Regroupement par mot, calculé une fois à la construction.
    this._wordSummaries = this._buildWordSummaries();
  }

  /**
   * Regroupe les entrées brutes par mot.
   *
   * Règle de `acquired` :
   *   - tous les exos passés sur ce mot sont des succès (jamais raté)
   *   - ET au moins MIN_EXERCISES_FOR_ACQUIRED exos ont été faits sur lui
   *
   * Le second critère évite le piège des sessions abandonnées tôt : si
   * l'enfant fait 2 exos faciles sur un mot et part, on ne peut pas dire
   * que le mot est "acquis" — il n'a juste pas été assez testé. Sans ce
   * garde-fou, après un abandon précoce, tous les mots passeraient comme
   * acquis et le bouton "Refaire les mots à revoir" serait grisé à tort.
   *
   * Le seuil de 3 est un choix pragmatique (≈ la moitié des ~6-7 exos
   * générés par mot). À ajuster avec le ReviewService quand on aura plus
   * de recul sur l'usage réel.
   *
   * @returns {Array<Object>} un tableau de
   *   { word, exercises: [{mode, success}], acquired: boolean }
   * @private
   */
  _buildWordSummaries() {
    const MIN_EXERCISES_FOR_ACQUIRED = 3;

    // Map id-du-mot → résumé. On utilise word.id comme clé ; fallback
    // sur word.en si pas d'id (robustesse).
    const byWord = new Map();

    for (const entry of this.results) {
      const key = entry.word?.id ?? entry.word?.en ?? "?";
      if (!byWord.has(key)) {
        byWord.set(key, {
          word: entry.word,
          exercises: [],
          _allSuccess: true,  // optimiste, repassé à false au premier raté
        });
      }
      const summary = byWord.get(key);
      summary.exercises.push({ mode: entry.mode, success: entry.success });
      if (!entry.success) {
        summary._allSuccess = false;
      }
    }

    // Calcul final de `acquired` : succès partout ET assez d'exos faits
    const summaries = Array.from(byWord.values());
    for (const s of summaries) {
      s.acquired = s._allSuccess && s.exercises.length >= MIN_EXERCISES_FOR_ACQUIRED;
      delete s._allSuccess;  // détail interne, on ne l'expose pas
    }
    return summaries;
  }

  /**
   * Calcule le nombre d'étoiles (1 à 3).
   *
   * Méthode : proportion de mots acquis, ramenée sur 10, puis seuils.
   *   score = (mots acquis / total) × 10
   *     score >= 8  →  ★★★   (ex: 10/10, 9/10, 8/10)
   *     score >= 6  →  ★★    (ex: 7/10, 6/10)
   *     sinon       →  ★     (5/10 et en dessous, y compris 0)
   *
   * On ne met jamais 0 étoile : l'enfant a terminé sa session.
   *
   * @returns {number} 1, 2 ou 3
   * @private
   */
  _computeStars() {
    const total = this._wordSummaries.length;
    if (total === 0) return 1;

    const acquired = this._wordSummaries.filter(s => s.acquired).length;
    const scoreOutOf10 = (acquired / total) * 10;

    if (scoreOutOf10 >= 8) return 3;
    if (scoreOutOf10 >= 6) return 2;
    return 1;
  }

  /**
   * Message de célébration adapté au nombre d'étoiles.
   * @private
   */
  _celebrationMessage(stars) {
    if (this.aborted) return "Session interrompue";
    switch (stars) {
      case 3:  return "Parfait, tu maîtrises tout !";
      case 2:  return "Bravo, beau travail !";
      default: return "C'est un bon début !";
    }
  }

  /**
   * Rendu de l'écran.
   */
  render(container) {
    if (this._destroyed) {
      throw new Error("Impossible de render un ResultScreen détruit");
    }
    this.container = container;

    const total = this._wordSummaries.length;
    const acquired = this._wordSummaries.filter(s => s.acquired).length;
    const toReview = total - acquired;
    const stars = this._computeStars();

    container.innerHTML = `
      <div class="result-screen">

        <div class="result-screen-celebration">
          <div class="result-screen-icon">${this.aborted ? "⏸️" : "🎉"}</div>
          <div class="result-screen-title">${this._celebrationMessage(stars)}</div>
        </div>

        <div class="result-screen-stars" aria-label="${stars} étoile(s) sur 3">
          ${this._renderStars(stars)}
        </div>

        <div class="result-screen-counters">
          <div class="result-screen-counter">
            <span class="result-screen-counter-value result-screen-counter-acquired">${acquired}</span>
            <span class="result-screen-counter-label">${acquired > 1 ? "mots acquis" : "mot acquis"}</span>
          </div>
          <div class="result-screen-counter">
            <span class="result-screen-counter-value result-screen-counter-review">${toReview}</span>
            <span class="result-screen-counter-label">à revoir</span>
          </div>
        </div>

        <div class="result-screen-word-list" data-el="word-list">
          ${this._wordSummaries.map((s, i) => this._renderWordRow(s, i)).join("")}
        </div>

        <div class="result-screen-actions">
          <button class="btn btn-secondary"
                  data-action="retry"
                  data-el="retry-btn"
                  ${toReview === 0 ? "disabled" : ""}>
            Refaire les mots à revoir
          </button>
          <button class="btn btn-primary" data-action="finish">
            Terminer
          </button>
        </div>

      </div>
    `;

    // --- Listeners ---

    // Boutons d'action
    container.querySelector('[data-action="finish"]')
      .addEventListener('click', () => this.onFinish());

    const retryBtn = container.querySelector('[data-el="retry-btn"]');
    if (retryBtn && toReview > 0) {
      retryBtn.addEventListener('click', () => {
        const wordsToRetry = this._wordSummaries
          .filter(s => !s.acquired)
          .map(s => s.word);
        this.onRetryFailed(wordsToRetry);
      });
    }

    // Lignes de mots dépliables (délégation d'événement sur la liste)
    container.querySelector('[data-el="word-list"]')
      .addEventListener('click', (e) => {
        const row = e.target.closest('.result-screen-word-row');
        if (row) this._toggleWordRow(row);
      });
  }

  /**
   * Génère le HTML des étoiles : `stars` pleines, le reste vides, sur 3.
   * @private
   */
  _renderStars(stars) {
    let html = "";
    for (let i = 1; i <= 3; i++) {
      const filled = i <= stars;
      html += `<span class="result-screen-star ${filled ? "filled" : "empty"}">${filled ? "★" : "☆"}</span>`;
    }
    return html;
  }

  /**
   * Génère le HTML d'une ligne de mot (résumé + détail caché).
   * @param {Object} summary - { word, exercises, acquired }
   * @param {number} index
   * @private
   */
  _renderWordRow(summary, index) {
    const { word, exercises, acquired } = summary;
    const statusClass = acquired ? "acquired" : "to-review";
    const statusIcon = acquired ? "✓" : "↻";

    return `
      <div class="result-screen-word-row ${statusClass}" data-row-index="${index}">
        <div class="result-screen-word-head">
          <span class="result-screen-word-status">${statusIcon}</span>
          <span class="result-screen-word-en">${this._escape(word?.en ?? "?")}</span>
          <span class="result-screen-word-fr">${this._escape(word?.fr ?? "")}</span>
          <span class="result-screen-word-chevron">▾</span>
        </div>
        <div class="result-screen-word-detail" data-el="detail">
          ${exercises.map(ex => `
            <div class="result-screen-exercise ${ex.success ? "ok" : "ko"}">
              <span class="result-screen-exercise-icon">${ex.success ? "✓" : "✗"}</span>
              <span class="result-screen-exercise-mode">${this._modeLabel(ex.mode)}</span>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }

  /**
   * Déplie / replie une ligne de mot.
   * @private
   */
  _toggleWordRow(row) {
    row.classList.toggle('expanded');
  }

  /**
   * Traduit un identifiant de mode en libellé lisible pour un humain.
   * Le mode brut ("mcq", "typing_fr"...) ne parle pas à un enfant ni à
   * un parent ; on affiche un nom clair.
   * @private
   */
  _modeLabel(mode) {
    const labels = {
      "mcq":           "Choix multiple",
      "typing_fr":     "Écrire en français",
      "audio_to_text": "Écouter et écrire",
      "text_to_audio": "Lire à voix haute",
      "forms_verb":    "Les 3 formes du verbe",
      "forms_plural":  "Le pluriel",
    };
    return labels[mode] || mode;
  }

  /** Échappement HTML minimal. @private */
  _escape(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /**
   * Détruit l'écran.
   */
  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;

    if (this.container) {
      this.container.innerHTML = "";
      this.container = null;
    }
  }
}
