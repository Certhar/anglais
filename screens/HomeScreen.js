/**
 * screens/HomeScreen.js
 *
 * Écran d'accueil de l'application Vocabulaire.
 *
 * ─────────────────────────────────────────────────────────────────────
 * STRUCTURE EN DEUX VUES
 * ─────────────────────────────────────────────────────────────────────
 *
 * 1. Vue "choix de l'enfant" : titre + un bouton par enfant.
 *    L'enfant clique sur son nom pour entrer dans son espace.
 *
 * 2. Vue "menu enfant" : "Bonjour [enfant] !" + actions, qui varient
 *    selon le `sessionType` :
 *
 *    Mode "normale" (jour de leçon ordinaire) :
 *      - ▶️ Démarrer : toujours actif. La leçon du jour. C'est un OUTIL
 *                      de référence, l'enfant peut y revenir autant qu'il
 *                      veut dans la journée.
 *      - ✏️ Exercices : verrouillé (grisé + 🔒) tant que la leçon du
 *                       jour n'a pas été parcourue au moins une fois.
 *                       Une fois la leçon vue, le verrou saute pour la
 *                       journée. Au passage d'un nouveau jour calendaire,
 *                       le verrou se remet automatiquement.
 *
 *    Mode "revision" (au moins un palier long j7/j30/j90 dû) :
 *      - 🔁 Réviser : équivalent du "Démarrer" du mode normale. Mène à la
 *                     ColdLesson du jour (rappel des mots à réviser).
 *                     Toujours actif.
 *      - ✏️ Exercices : verrouillé tant que la ColdLesson n'a pas été
 *                       parcourue, exactement comme en mode normale.
 *
 *    En mode "revision", le greeting est enrichi pour prévenir l'enfant :
 *    "Bonjour [enfant] ! Aujourd'hui, révision." — c'est important car
 *    les jours de révision peuvent contenir beaucoup plus de mots que
 *    les jours normaux (cumul des paliers longs), et savoir que ce n'est
 *    pas un jour d'apprentissage évite la panique.
 *
 *    Plus un bouton "← Changer de profil" pour repasser en vue 1.
 *
 * ─────────────────────────────────────────────────────────────────────
 * VERROU DES EXERCICES (modes normale et révision)
 * ─────────────────────────────────────────────────────────────────────
 * Géré par UserStateService (mock en mémoire pour l'instant — voir
 * `decisions-en-attente.md` n°4).
 *
 * "Un jour" = un jour calendaire. Tant que c'est le même jour, le flag
 * "leçon parcourue" reste à true. Le passage de minuit (ou la non-
 * connexion pendant plusieurs jours) remet le flag à false.
 *
 * ─────────────────────────────────────────────────────────────────────
 * API
 * ─────────────────────────────────────────────────────────────────────
 *   const screen = new HomeScreen({
 *     children: [{ id: "julie", name: "Julie" }, { id: "max", name: "Max" }],
 *     initialChildId:   "max",        // optionnel : démarre direct sur la vue 2
 *     sessionType:      "normale",    // "normale" (défaut) | "revision"
 *     onStartLesson:    (childId) => { ... },  // mode normale, bouton "Démarrer"
 *     onStartExercises: (childId) => { ... },  // les deux modes, bouton "Exercices"
 *     onStartRevision:  (childId) => { ... },  // mode revision, bouton "Réviser"
 *     onSwitchChild:    () => { ... },         // bouton "Changer de profil"
 *   });
 *   screen.render(container);
 *   screen.destroy();
 */

import { userState } from '../services/UserStateService.js';


export class HomeScreen {

  /**
   * @param {Object} options
   * @param {Array<{id:string,name:string}>} options.children - la liste des enfants
   * @param {"normale"|"revision"} [options.sessionType="normale"] - type de séance du jour
   * @param {Function} [options.onStartLesson]    - callback(childId), mode normale
   * @param {Function} [options.onStartExercises] - callback(childId), modes normale et révision
   * @param {Function} [options.onStartRevision]  - callback(childId), mode revision
   */
  constructor(options = {}) {
    this.children = options.children || [];
    this.sessionType = options.sessionType || "normale";
    this.onStartLesson = options.onStartLesson || (() => {});
    this.onStartExercises = options.onStartExercises || (() => {});
    this.onStartRevision = options.onStartRevision || (() => {});
    // onChildPicked : appelé quand l'enfant clique son nom en vue 1.
    // Permet au Router de calculer le sessionType pour cet enfant et
    // de re-monter HomeScreen avec le bon menu si besoin (révision).
    this.onChildPicked = options.onChildPicked || (() => {});
    // onSwitchChild : appelé quand l'enfant clique "← Changer de profil".
    // Permet au Router d'effacer la préférence "dernier enfant utilisé"
    // pour qu'au prochain démarrage, l'app revienne sur le choix d'enfant.
    this.onSwitchChild = options.onSwitchChild || (() => {});

    // initialChildId (optionnel) : si fourni ET correspond à un enfant connu,
    // l'écran s'ouvre directement sur la vue 2 (menu de cet enfant) au lieu
    // de la vue 1 (choix d'enfant). Utile quand on revient sur Home après
    // une leçon ou une session d'exos : on sait déjà qui joue.
    const initialChildId = options.initialChildId || null;
    const knownChild = initialChildId
      ? this.children.find(c => c.id === initialChildId)
      : null;

    this.container = null;
    this._selectedChildId = knownChild ? knownChild.id : null;
    this._destroyed = false;
  }

  /**
   * Rendu initial : vue 1 (choix d'enfant) par défaut, ou vue 2 (menu de
   * l'enfant) si un initialChildId valide a été fourni au constructeur.
   */
  render(container) {
    if (this._destroyed) {
      throw new Error("Impossible de render un HomeScreen détruit");
    }
    this.container = container;
    if (this._selectedChildId) {
      this._renderChildMenu();
    } else {
      this._renderChildPicker();
    }
  }

  /**
   * Vue 1 : choix de l'enfant.
   * @private
   */
  _renderChildPicker() {
    this.container.innerHTML = `
      <div class="home-screen">
        <div class="home-screen-brand">
          <div class="home-screen-brand-title">Vocabulaire</div>
          <div class="home-screen-brand-subtitle">Qui es-tu ?</div>
        </div>
        <div class="home-screen-children">
          ${this.children.map(c => `
            <button class="home-screen-child"
                    data-action="select-child"
                    data-child-id="${this._escape(c.id)}">
              ${this._escape(c.name)}
            </button>
          `).join("")}
        </div>
      </div>
    `;

    this.container.querySelectorAll('[data-action="select-child"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const childId = btn.dataset.childId;
        this._selectedChildId = childId;
        // On rend D'ABORD le menu local (réactivité visuelle immédiate),
        // PUIS on prévient le Router. Si le Router re-monte HomeScreen
        // (cas révision), il remplacera notre rendu — c'est OK, c'est
        // instantané et le flash visuel est invisible.
        this._renderChildMenu();
        this.onChildPicked(childId);
      });
    });
  }

  /**
   * Vue 2 : menu de l'enfant sélectionné. Selon `sessionType` :
   *   - "normale"  → "Démarrer" + "Exercices" (verrouillé par défaut)
   *   - "revision" → "Réviser"  + "Exercices" (verrouillé par défaut)
   * Dans les deux cas, le bouton "Exercices" est déverrouillé une fois
   * la ColdLesson du jour parcourue. Le greeting est enrichi en révision.
   * @private
   */
  _renderChildMenu() {
    const child = this.children.find(c => c.id === this._selectedChildId);
    if (!child) {
      // Sécurité : pas censé arriver, on retombe sur la vue 1
      this._renderChildPicker();
      return;
    }

    if (this.sessionType === "revision") {
      this._renderRevisionMenu(child);
    } else {
      this._renderNormalMenu(child);
    }
  }

  /**
   * Menu mode "normale" : Démarrer + Exercices (verrou).
   * @private
   */
  _renderNormalMenu(child) {
    const exercisesUnlocked = userState.isLessonViewed(child.id);

    this.container.innerHTML = `
      <div class="home-screen">

        <button class="home-screen-back"
                data-action="back"
                aria-label="Changer de profil">← Changer de profil</button>

        <div class="home-screen-greeting">Bonjour ${this._escape(child.name)} !</div>

        <div class="home-screen-actions">
          <button class="home-screen-action lesson" data-action="lesson">
            <span class="home-screen-action-icon">▶️</span>
            <span class="home-screen-action-label">Démarrer</span>
          </button>

          <button class="home-screen-action exercises ${exercisesUnlocked ? "" : "locked"}"
                  data-action="exercises"
                  ${exercisesUnlocked ? "" : "disabled"}>
            <span class="home-screen-action-icon">${exercisesUnlocked ? "✏️" : "🔒"}</span>
            <span class="home-screen-action-label">Exercices</span>
            ${!exercisesUnlocked ? `
              <span class="home-screen-action-hint">Démarre d'abord la leçon</span>
            ` : ""}
          </button>
        </div>
      </div>
    `;

    this._attachCommonListeners();

    this.container.querySelector('[data-action="lesson"]')
      .addEventListener('click', () => {
        this.onStartLesson(child.id);
      });

    const exoBtn = this.container.querySelector('[data-action="exercises"]');
    if (exoBtn && exercisesUnlocked) {
      exoBtn.addEventListener('click', () => {
        this.onStartExercises(child.id);
      });
    }
  }

  /**
   * Menu mode "revision" : "Réviser" + "Exercices" (verrou identique à
   * normale). Structure HTML symétrique à `_renderNormalMenu` ; seules
   * changent l'icône et le label du premier bouton (🔁 / "Réviser"), et
   * le greeting qui informe explicitement l'enfant qu'on est en jour
   * de révision (cf. JSDoc d'en-tête).
   * @private
   */
  _renderRevisionMenu(child) {
    const exercisesUnlocked = userState.isLessonViewed(child.id);

    this.container.innerHTML = `
      <div class="home-screen">

        <button class="home-screen-back"
                data-action="back"
                aria-label="Changer de profil">← Changer de profil</button>

        <div class="home-screen-greeting">Bonjour ${this._escape(child.name)} !
          <span class="home-screen-greeting-mode">Aujourd'hui, révision.</span>
        </div>

        <div class="home-screen-actions">
          <button class="home-screen-action lesson" data-action="revision">
            <span class="home-screen-action-icon">🔁</span>
            <span class="home-screen-action-label">Réviser</span>
          </button>

          <button class="home-screen-action exercises ${exercisesUnlocked ? "" : "locked"}"
                  data-action="exercises"
                  ${exercisesUnlocked ? "" : "disabled"}>
            <span class="home-screen-action-icon">${exercisesUnlocked ? "✏️" : "🔒"}</span>
            <span class="home-screen-action-label">Exercices</span>
            ${!exercisesUnlocked ? `
              <span class="home-screen-action-hint">Commence d'abord par Réviser</span>
            ` : ""}
          </button>
        </div>
      </div>
    `;

    this._attachCommonListeners();

    this.container.querySelector('[data-action="revision"]')
      .addEventListener('click', () => {
        this.onStartRevision(child.id);
      });

    const exoBtn = this.container.querySelector('[data-action="exercises"]');
    if (exoBtn && exercisesUnlocked) {
      exoBtn.addEventListener('click', () => {
        this.onStartExercises(child.id);
      });
    }
  }

  /**
   * Attache les listeners communs aux deux variantes du menu (bouton
   * "Changer de profil"). Doit être appelé après chaque innerHTML.
   * @private
   */
  _attachCommonListeners() {
    this.container.querySelector('[data-action="back"]')
      .addEventListener('click', () => {
        // On signale d'abord au Router (pour qu'il efface la préférence
        // persistée), PUIS on re-render localement la vue 1. L'ordre
        // n'a pas d'importance fonctionnelle ici, mais on met le signal
        // d'abord par symétrie avec les autres handlers de cet écran.
        this.onSwitchChild();
        this._selectedChildId = null;
        this._renderChildPicker();
      });
  }

  /**
   * Re-rend la vue courante. Utile si l'état change pendant que l'écran
   * est affiché (ex: l'enfant a fait sa leçon, revient sur Home, on veut
   * que le verrou des exos se mette à jour).
   *
   * Note : ça ne sera vraiment utile qu'avec le Router (Round 6) qui
   * remontera vers Home après la leçon. Mais autant exposer la méthode.
   */
  refresh() {
    if (this._destroyed || !this.container) return;
    if (this._selectedChildId) {
      this._renderChildMenu();
    } else {
      this._renderChildPicker();
    }
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
