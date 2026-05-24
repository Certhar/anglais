/**
 * services/SessionComposerService.js
 *
 * Compose la séance du jour pour un enfant : décide quel TYPE de
 * séance (normale ou révision), puis tire les ids des mots à proposer
 * dans chaque catégorie (chutes, j+1, nouveaux, longs).
 *
 * Voir architecture.md §7.5 pour la spec pédagogique et
 * Anglais/SESSION-decisions-SessionComposer.md pour le détail des
 * décisions prises lors de la conception (18-19 mai 2026).
 *
 * ─────────────────────────────────────────────────────────────────────
 * POSITIONNEMENT
 * ─────────────────────────────────────────────────────────────────────
 * Ce service répond à la question : "qu'est-ce que l'enfant fait
 * aujourd'hui ?". Il ASSEMBLE les ids des mots à présenter.
 *
 * Il ne gère PAS :
 *   - le NOMBRE ou la NATURE des exercices par mot (ColdLesson, MCQ…)
 *     → c'est ExerciseService (à venir)
 *   - le CYCLE temporel d'un mot (introduireMot, enregistrerRebrassage)
 *     → RebrassageService
 *   - le TIRAGE des nouveaux (phases, sous-files, V-T-V…)
 *     → OrdonnanceurService
 *   - la PERSISTANCE des résultats (mots acquis, exos faits…)
 *     → SessionRecorderService (à venir, miroir de ce service)
 *   - le FILTRAGE des mots déjà acquis aujourd'hui (cas reprise)
 *     → Router, après l'appel à ce service
 *
 * Il S'APPUIE sur :
 *   - UserStateService : pour lire la progression (mots déjà introduits)
 *   - WordRepository   : pour valider que les ids existent (opt.)
 *   - RebrassageService : pour getMotsDus(date) → {j1, lourds}
 *   - OrdonnanceurService : pour tirer les nouveaux mots
 *
 * ─────────────────────────────────────────────────────────────────────
 * LES DEUX TYPES DE SÉANCE (cf. architecture.md §7.5)
 * ─────────────────────────────────────────────────────────────────────
 *
 *   "revision"        : il y a au moins un mot en étape {j7,j30,j90}
 *                       dont la dateProchainRebrassage ≤ aujourd'hui.
 *                       Par construction (invariant mercredi), c'est
 *                       soit un vrai mercredi, soit un jour de
 *                       rattrapage après un mercredi manqué.
 *                       → on prend TOUS les longs dûs, rien d'autre.
 *                       → coldLesson vide, pas de nouveaux, pas de J+1.
 *                       → côté UI : bouton "Réviser" sur HomeScreen.
 *
 *   "normale"         : pas de révision longue en attente. Composition
 *                       en deux enveloppes :
 *                       - lourde (chutes + nouveaux, max N=10, set complet)
 *                       - légère (J+1, max N, 2 exos par mot)
 *                       → coldLesson = chutes + nouveaux (dans cet ordre).
 *                       → côté UI : bouton "Démarrer" sur HomeScreen.
 *
 * Pas de type "rien" pour le quotidien. Le composer renvoie toujours
 * une séance exploitable. Si le corpus est complètement épuisé (aucun
 * nouveau, aucune chute, aucun J+1, aucune révision), `_composerNormale`
 * renverra une séance "normale" avec coldLesson vide — c'est au Router
 * de détecter ce cas extrême (corpus terminé) et d'afficher un message
 * de fin de parcours. Mais ce n'est PAS le cas d'usage courant.
 *
 * ─────────────────────────────────────────────────────────────────────
 * INVARIANT CRITIQUE
 * ─────────────────────────────────────────────────────────────────────
 * La détection "révision longue" repose sur l'invariant que toute
 * dateProchainRebrassage d'un mot en j7/j30/j90 est, par construction,
 * un mercredi (garanti par RebrassageService.alignerSurJourPivot).
 *
 * Sans cet invariant, on basculerait en révision longue n'importe
 * quel jour de la semaine. La détection se fait donc PAR CONTENU
 * (présence d'un long dû) plutôt que PAR JOUR (mercredi du calendrier).
 * C'est ce qui permet le "rattrapage automatique" si l'enfant manque
 * un mercredi : les longs restent dûs à la prochaine connexion, qui
 * bascule alors en révision longue.
 *
 * ─────────────────────────────────────────────────────────────────────
 * FORMAT DE SORTIE
 * ─────────────────────────────────────────────────────────────────────
 *
 *   Décision D1 : ids purs (Array<number>), pas d'objets Word complets.
 *   La résolution id → Word est faite par le Router/ExerciseScreen.
 *
 *   Schéma stable (toujours les mêmes champs, présents même si vides) :
 *   {
 *     type:       "normale" | "revision",
 *     coldLesson: number[],   // chutes + nouveaux dans cet ordre (normale uniquement)
 *     chutes:     number[],   // ids étape j0 dûs (normale uniquement)
 *     j1:         number[],   // ids étape j1 dûs (normale uniquement)
 *     nouveaux:   number[],   // ids tirés par OrdonnanceurService (normale uniquement)
 *     longs:      number[],   // ids étape j7/j30/j90 dûs (revision uniquement)
 *   }
 *
 *   Les champs non pertinents pour le type courant sont des tableaux
 *   vides (jamais undefined) : le consommateur peut faire des
 *   `.forEach`, `.length`, etc. sans test de nullité.
 *
 * ─────────────────────────────────────────────────────────────────────
 * CONSTANTES PÉDAGOGIQUES (cf. architecture.md §7.3)
 * ─────────────────────────────────────────────────────────────────────
 *
 *   QUOTA_LOURD = 10  : taille maximale de l'enveloppe lourde
 *                       (chutes + nouveaux pour la compléter).
 *
 *   Le nombre de J+1 n'est pas capé explicitement : par construction,
 *   il ne peut pas dépasser QUOTA_LOURD (un J+1 ne peut exister que
 *   si un mot est passé en j1 lors d'une séance précédente, qui en
 *   passe au plus QUOTA_LOURD).
 *
 * ─────────────────────────────────────────────────────────────────────
 * API
 * ─────────────────────────────────────────────────────────────────────
 *   new SessionComposerService({ userState, wordRepo, rebrassage, ordonnanceur })
 *   composer.composerSeance(childId, dateISO) → SeanceComposee
 *
 * Pas de singleton exporté : le câblage se fait dans le Router au
 * démarrage (cf. OrdonnanceurService, même approche).
 */


// ─── Constantes pédagogiques ──────────────────────────────────────────

/**
 * Taille maximale de l'enveloppe lourde d'une journée normale :
 * (chutes + nouveaux) ≤ QUOTA_LOURD.
 *
 * Valeur par défaut : 10 (cf. §7.3 de architecture.md). Peut monter
 * à 15 si la calibration le justifie. Pour l'instant on garde la
 * valeur par défaut, codée en dur ici. Si on doit la rendre
 * configurable par enfant un jour, on la passera dans le constructeur
 * (this._quotaLourd = opts.quotaLourd ?? QUOTA_LOURD).
 */
const QUOTA_LOURD = 10;


// ─── Le service ───────────────────────────────────────────────────────

export class SessionComposerService {

  /**
   * @param {Object} deps
   * @param {UserStateService}   deps.userState
   * @param {WordRepository}     deps.wordRepo
   * @param {RebrassageService}  deps.rebrassage
   * @param {OrdonnanceurService} deps.ordonnanceur
   */
  constructor({ userState, wordRepo, rebrassage, ordonnanceur } = {}) {
    if (!userState) {
      throw new Error("SessionComposerService: userState requis");
    }
    if (!wordRepo) {
      throw new Error("SessionComposerService: wordRepo requis");
    }
    if (!rebrassage) {
      throw new Error("SessionComposerService: rebrassage requis");
    }
    if (!ordonnanceur) {
      throw new Error("SessionComposerService: ordonnanceur requis");
    }
    this._userState = userState;
    this._wordRepo = wordRepo;
    this._rebrassage = rebrassage;
    this._ordonnanceur = ordonnanceur;
  }

  // ───────────────────────────────────────────────────────────────────
  // API publique
  // ───────────────────────────────────────────────────────────────────

  /**
   * Compose la séance du jour pour un enfant.
   *
   * Algorithme :
   *  1. Détecter s'il y a au moins un mot j7/j30/j90 dû à dateISO.
   *  2a. Oui → type "revision" : prendre tous les longs dûs.
   *  2b. Non → type "normale" : composer chutes + j1 + nouveaux.
   *
   * Note : le mercredi n'a aucun traitement particulier ici. Les
   * paliers longs restent ancrés sur le mercredi via
   * RebrassageService.alignerSurJourPivot, donc en pratique les
   * révisions tomberont surtout les mercredis. Mais un mercredi sans
   * révision en attente est un jour normal : l'enfant fait sa leçon
   * comme n'importe quel autre jour.
   *
   * @param {string} childId  - identifiant de l'enfant ("max", "julie", …)
   * @param {string} dateISO  - date du jour au format YYYY-MM-DD
   * @returns {SeanceComposee} cf. schéma documenté en tête de fichier
   */
  composerSeance(childId, dateISO) {
    const hasLongsDus = this._rebrassage.hasDetteConsolidation(childId, dateISO);

    if (hasLongsDus) {
      return this._composerRevision(childId, dateISO);
    }

    return this._composerNormale(childId, dateISO);
  }


  // ───────────────────────────────────────────────────────────────────
  // Helpers internes
  // ───────────────────────────────────────────────────────────────────

  /**
   * Compose une séance de type "normale" : deux enveloppes.
   *
   * Enveloppe lourde (max QUOTA_LOURD = 10) :
   *   1. Chutes (mots étape j0 dûs aujourd'hui) en priorité
   *   2. Nouveaux pour compléter jusqu'à QUOTA_LOURD
   *
   * Enveloppe légère :
   *   3. Tous les J+1 dûs (≤ QUOTA_LOURD par construction, pas de cap explicite)
   *
   * ColdLesson = chutes + nouveaux (dans cet ordre). Pas les J+1.
   *
   * @param {string} childId
   * @param {string} dateISO
   * @returns {SeanceComposee}
   */
  _composerNormale(childId, dateISO) {
    // 1. Récupérer les mots dûs (séparés j1 / lourds par RebrassageService).
    //    "lourds" ici contient les j0 (chutes) — j7/j30/j90 sont absents
    //    car la branche "revision" aurait déjà été prise sinon.
    //    On filtre quand même par sécurité au cas où.
    const dus = this._rebrassage.getMotsDus(childId, dateISO);
    const j1 = dus.j1;

    const chutes = [];
    for (const wordId of dus.lourds) {
      const entry = this._userState.getWordProgress(childId, wordId);
      if (!entry) continue;
      if (entry.etape === "j0") chutes.push(wordId);
    }

    // 2. Tirer des nouveaux pour compléter l'enveloppe lourde jusqu'à QUOTA_LOURD.
    const slotsRestants = Math.max(0, QUOTA_LOURD - chutes.length);
    const nouveaux = slotsRestants > 0
      ? this._ordonnanceur.tirerNouveaux(childId, slotsRestants, dateISO)
      : [];

    // 3. ColdLesson = chutes + nouveaux (cf. D3ter).
    const coldLesson = [...chutes, ...nouveaux];

    return {
      type: "normale",
      coldLesson,
      chutes,
      j1,
      nouveaux,
      longs: [],
    };
  }

  /**
   * Compose une séance de type "revision" : tous les mots dont
   * l'étape est j7, j30 ou j90 et dont la date est ≤ dateISO.
   *
   * Pas de cap, pas de tri, pas de priorité (cf. §7.5 architecture.md).
   * Le mercredi présentiel garantit un volume raisonnable en pratique.
   *
   * @param {string} childId
   * @param {string} dateISO
   * @returns {SeanceComposee}
   */
  _composerRevision(childId, dateISO) {
    const tousDus = this._userState.getWordsDueOn(childId, dateISO);
    const longs = [];
    for (const wordId of tousDus) {
      const entry = this._userState.getWordProgress(childId, wordId);
      if (!entry) continue;
      if (entry.etape === "j7" || entry.etape === "j30" || entry.etape === "j90") {
        longs.push(wordId);
      }
    }
    return {
      type: "revision",
      coldLesson: [],  // pas de ColdLesson en révision (cf. D3ter)
      chutes: [],
      j1: [],
      nouveaux: [],
      longs,
    };
  }
}


// ─── Typedef JSDoc (documentation seulement) ──────────────────────────

/**
 * @typedef {Object} SeanceComposee
 * @property {"normale"|"revision"} type
 * @property {number[]} coldLesson - ids présentés en ColdLesson (chutes + nouveaux pour "normale", vide en "revision")
 * @property {number[]} chutes     - ids étape j0 dûs (uniquement "normale")
 * @property {number[]} j1         - ids étape j1 dûs (uniquement "normale")
 * @property {number[]} nouveaux   - ids tirés par OrdonnanceurService (uniquement "normale")
 * @property {number[]} longs      - ids étape j7/j30/j90 dûs (uniquement "revision")
 */
