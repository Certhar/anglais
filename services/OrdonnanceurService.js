/**
 * services/OrdonnanceurService.js
 *
 * Sélectionne les NOUVEAUX mots à introduire un jour donné, selon les
 * 4 phases successives : boot → post_boot V-T-V → post_boot T-T-T →
 * thèmes purs. Voir architecture.md §8 pour la spec pédagogique.
 *
 * ─────────────────────────────────────────────────────────────────────
 * POSITIONNEMENT
 * ─────────────────────────────────────────────────────────────────────
 * Ce service répond à la question : "quels mots nouveaux ce matin ?".
 *
 * Il ne gère PAS :
 *   - le NOMBRE de nouveaux à tirer (c'est slots = N - nb_chutes,
 *     calculé en amont par SessionComposerService)
 *   - le rebrassage (J+1, J+7, J+30, J+90) → RebrassageService
 *   - l'introduction effective du mot (recordWordOutcome) → l'appelant
 *
 * Il S'APPUIE sur :
 *   - WordRepository : pour récupérer les sous-files Fréquence (par
 *     phase, catégorie) et Thèmes (queue globale), déjà triées.
 *   - UserStateService : pour savoir quels mots ont déjà été introduits
 *     (présence d'une entrée de progression = déjà vu, à éviter).
 *
 * ─────────────────────────────────────────────────────────────────────
 * MODÈLE DES SOUS-FILES (cf. architecture.md §8.4)
 * ─────────────────────────────────────────────────────────────────────
 *
 *   File Fréquence (244 mots, ordo_file = "freq") :
 *     - 30 mots phase=boot, triés (bracket, ordre_dans_phase, id)
 *     - 214 mots phase=post_boot, séparés en deux sous-files :
 *         * sous-file V (77 mots) : tri (bracket, ordre_dans_phase, id)
 *         * sous-file T (167 mots) : tri (bracket, ordre_dans_phase, id)
 *       V et T progressent indépendamment.
 *
 *   File Thèmes (1125 mots, ordo_file = "themes") :
 *     - triés (ordre_theme, ordre_dans_theme, id), tous thèmes
 *       confondus dans une queue globale qu'on consomme dans l'ordre.
 *
 * ─────────────────────────────────────────────────────────────────────
 * LES 4 PHASES (cf. architecture.md §8.2)
 * ─────────────────────────────────────────────────────────────────────
 *
 *   Phase 1 (boot)            : 10 nouveaux/jour, 100% Fréquence-boot
 *   Phase 2 (post_boot V-T-V) : 7 Thèmes + 3 Fréquence (V-T-V), tant
 *                               qu'il reste des V disponibles
 *   Phase 3 (post_boot T-T-T) : 7 Thèmes + 3 Fréquence (T-T-T), tant
 *                               qu'il reste des T disponibles
 *   Phase 4 (themes_purs)     : 10 Thèmes/jour, Fréquence épuisée
 *
 * La transition se fait automatiquement quand une sous-file s'épuise.
 * On n'a PAS besoin de jour_phase (compteur de jours d'introduction) :
 * la phase courante se déduit de l'état (progression de l'enfant +
 * disponibilité dans le corpus).
 *
 * ─────────────────────────────────────────────────────────────────────
 * API
 * ─────────────────────────────────────────────────────────────────────
 *   ordonnanceur.tirerNouveaux(childId, slots, dateISO)
 *     → renvoie Array<wordId> de longueur ≤ slots
 *
 *   ordonnanceur.getPhaseActuelle(childId) → "boot" | "post_boot_VTV"
 *                                         | "post_boot_TTT" | "themes_purs"
 *                                         | "epuise"
 *
 *   // Utilitaires exposés pour les tests / debug
 *   ordonnanceur.getMotsDisponibles(childId, sousFile)
 *     sousFile ∈ {"boot", "post_boot_V", "post_boot_T", "themes"}
 *     → Array<wordId>, dans l'ordre de tirage
 *
 * ─────────────────────────────────────────────────────────────────────
 * "DÉJÀ INTRODUIT" — DÉFINITION
 * ─────────────────────────────────────────────────────────────────────
 * Un mot est considéré "déjà introduit" pour l'enfant si
 * UserStateService.getWordProgress(childId, wordId) renvoie une entrée
 * non nulle. Cela inclut tous les mots dans le cycle (j0/j1/j7/j30/j90)
 * et les mots acquis.
 *
 * Note : le cas "tous exos ratés au J+0 → mot non introduit" est géré
 * par l'appelant qui n'appelle simplement pas RebrassageService.
 * introduireMot() ; donc pas d'entrée de progression → notre service
 * considère le mot comme jamais vu et pourra le reproposer.
 */


// ─── Constantes ───────────────────────────────────────────────────────

/**
 * Nombre de mots Fréquence par séance en post-boot (V-T-V ou T-T-T).
 * En cas de slots < 10, la part fréquence est calculée proportionnellement
 * (30% des slots, arrondi).
 */
const FREQ_PAR_JOUR_POST_BOOT = 3;

/**
 * Ratio Thèmes/Fréquence en post-boot. 7 thèmes / 3 fréquences sur 10 slots.
 * En cas de slots réduits, on respecte la proportion.
 */
const RATIO_FREQ_POST_BOOT = 0.3;

/**
 * Patterns de tirage Fréquence en post-boot V-T-V selon le nombre de
 * slots Fréquence disponibles. Si la sous-file V est épuisée pendant
 * le tirage, on remplace le V manquant par un T (fallback).
 */
const PATTERN_VTV = {
  3: ["V", "T", "V"],
  2: ["V", "T"],
  1: ["V"],
  0: [],
};


// ─── Service ──────────────────────────────────────────────────────────

export class OrdonnanceurService {
  /**
   * @param {Object} deps
   * @param {WordRepository} deps.wordRepository - source des mots
   * @param {UserStateService} deps.userState - source de la progression
   */
  constructor({ wordRepository, userState } = {}) {
    if (!wordRepository) {
      throw new Error("OrdonnanceurService: wordRepository requis");
    }
    if (!userState) {
      throw new Error("OrdonnanceurService: userState requis");
    }
    this._repo = wordRepository;
    this._userState = userState;
  }

  // ───────────────────────────────────────────────────────────────────
  // API publique — phase courante
  // ───────────────────────────────────────────────────────────────────

  /**
   * Détermine la phase d'ordonnancement courante pour cet enfant en
   * fonction de l'état des sous-files (épuisées ou non).
   *
   * Règles (cf. architecture.md §8.2) :
   *  - boot          : il reste des mots Fréquence-boot non introduits
   *  - post_boot_VTV : boot épuisé, il reste des V post-boot
   *  - post_boot_TTT : V post-boot épuisés, il reste des T post-boot
   *  - themes_purs   : toute la Fréquence est épuisée, il reste des thèmes
   *  - epuise        : tout est épuisé (cas théorique en fin de période)
   *
   * @param {string} childId
   * @returns {"boot"|"post_boot_VTV"|"post_boot_TTT"|"themes_purs"|"epuise"}
   */
  getPhaseActuelle(childId) {
    if (this.getMotsDisponibles(childId, "boot").length > 0) {
      return "boot";
    }
    if (this.getMotsDisponibles(childId, "post_boot_V").length > 0) {
      return "post_boot_VTV";
    }
    if (this.getMotsDisponibles(childId, "post_boot_T").length > 0) {
      return "post_boot_TTT";
    }
    if (this.getMotsDisponibles(childId, "themes").length > 0) {
      return "themes_purs";
    }
    return "epuise";
  }

  // ───────────────────────────────────────────────────────────────────
  // API publique — disponibilité (utilitaires + tests)
  // ───────────────────────────────────────────────────────────────────

  /**
   * Renvoie les wordId encore disponibles dans une sous-file, dans
   * l'ordre de tirage. "Disponible" = pas encore introduit pour cet
   * enfant (pas d'entrée de progression).
   *
   * @param {string} childId
   * @param {"boot"|"post_boot_V"|"post_boot_T"|"themes"} sousFile
   * @returns {number[]} wordId triés dans l'ordre de tirage
   */
  getMotsDisponibles(childId, sousFile) {
    const sourceMots = this._getSourceMots(sousFile);
    return sourceMots
      .filter(w => !this._userState.getWordProgress(childId, w.id))
      // Exclure les mots déjà traités aujourd'hui (acquiredToday).
      // Sans ce filtre, un enfant qui revient après avoir fini sa séance
      // voit de nouveaux mots être ré-introduits → 2e cold lesson dans
      // la journée. Cf. BIBLE §11 (audit Anglais 25).
      .filter(w => !this._userState.isWordAcquiredToday(childId, w.id))
      .map(w => w.id);
  }

  // ───────────────────────────────────────────────────────────────────
  // Tirage (sera implémenté à l'étape suivante)
  // ───────────────────────────────────────────────────────────────────

  /**
   * Renvoie les wordId à introduire ce jour, dans l'ordre, jusqu'à
   * `slots` mots (ou moins si une sous-file s'épuise). La phase est
   * déterminée automatiquement par l'état de l'enfant.
   *
   * Ordre des mots dans le résultat :
   *  - phase boot           : ordre de tri du repo (bracket, ordre, id)
   *  - phase post_boot_VTV  : mots Fréquence d'abord (pattern V-T-V),
   *                           puis mots Thèmes dans leur ordre de file
   *  - phase post_boot_TTT  : idem, pattern T-T-T pour la Fréquence
   *  - phase themes_purs    : ordre de tri du repo (thème, ordre, id)
   *
   * L'ordre exact d'affichage à l'écran est un choix UX laissé à
   * l'appelant (cf. architecture.md §8.2 note pédagogique).
   *
   * @param {string} childId
   * @param {number} slots - nombre de mots à tirer (typiquement N - nb_chutes)
   * @param {string} [dateISO] - non utilisé pour l'instant, sera utile
   *   pour journaliser ou pour des règles futures liées au calendrier
   * @returns {number[]} liste de wordId, longueur ≤ slots
   */
  tirerNouveaux(childId, slots, dateISO = null) {
    if (slots <= 0) return [];

    const phase = this.getPhaseActuelle(childId);

    if (phase === "boot") {
      return this._tirerBoot(childId, slots);
    }
    if (phase === "post_boot_VTV" || phase === "post_boot_TTT") {
      return this._tirerPostBoot(childId, slots, phase);
    }
    if (phase === "themes_purs") {
      return this._tirerThemesPurs(childId, slots);
    }

    // phase === "epuise" → rien à tirer
    return [];
  }

  // ───────────────────────────────────────────────────────────────────
  // Internes — tirages par phase
  // ───────────────────────────────────────────────────────────────────

  /**
   * Phase boot : tire les `slots` premiers mots disponibles de la
   * sous-file boot. Aucune contrainte de pattern, c'est juste un
   * "head" de la liste triée.
   *
   * @param {string} childId
   * @param {number} slots
   * @returns {number[]}
   */
  _tirerBoot(childId, slots) {
    const dispo = this.getMotsDisponibles(childId, "boot");
    return dispo.slice(0, slots);
  }

  /**
   * Phase thèmes purs : toute la Fréquence est épuisée, on tire
   * `slots` mots dans la queue Thèmes globale (ordre_theme puis
   * ordre_dans_theme).
   *
   * @param {string} childId
   * @param {number} slots
   * @returns {number[]}
   */
  _tirerThemesPurs(childId, slots) {
    const dispo = this.getMotsDisponibles(childId, "themes");
    return dispo.slice(0, slots);
  }

  /**
   * Phases post-boot V-T-V et T-T-T : tire un mélange Thèmes + Fréquence.
   *
   * Répartition (cf. architecture.md §8.5) :
   *  - si slots=10 : 7 thèmes + 3 freq
   *  - sinon       : nb_freq = round(slots * 0.3), nb_themes = slots - nb_freq
   *
   * Pattern Fréquence :
   *  - V-T-V : ["V","T","V"] (ou tronqué selon nb_freq)
   *  - T-T-T : nb_freq T consécutifs
   *
   * Si une sous-file s'épuise pendant le tirage Fréquence (rare en VTV,
   * impossible en TTT), on retombe sur l'autre. Si les deux sont
   * épuisées, on rend moins que demandé (l'appelant compense ou pas).
   * Idem si les Thèmes s'épuisent : on rend moins.
   *
   * Le résultat met les mots Fréquence d'abord puis les Thèmes ;
   * l'ordre d'affichage final est un choix UX laissé à l'écran.
   *
   * @param {string} childId
   * @param {number} slots
   * @param {"post_boot_VTV"|"post_boot_TTT"} phase
   * @returns {number[]}
   */
  _tirerPostBoot(childId, slots, phase) {
    // 1. Calculer la répartition thèmes/freq
    let nbFreq, nbThemes;
    if (slots === 10) {
      // Cas nominal : pile la répartition de la bible
      nbFreq = FREQ_PAR_JOUR_POST_BOOT; // 3
      nbThemes = slots - nbFreq;         // 7
    } else {
      // Cas avec chutes : on respecte la proportion
      nbFreq = Math.round(slots * RATIO_FREQ_POST_BOOT);
      nbThemes = slots - nbFreq;
    }

    // 2. Tirer la partie Fréquence selon la phase
    const motsFreq = (phase === "post_boot_VTV")
      ? this._tirerFreqVTV(childId, nbFreq)
      : this._tirerFreqTTT(childId, nbFreq);

    // 3. Tirer la partie Thèmes (queue globale, head)
    const themesDispo = this.getMotsDisponibles(childId, "themes");
    const motsThemes = themesDispo.slice(0, nbThemes);

    return [...motsFreq, ...motsThemes];
  }

  /**
   * Tire `n` mots Fréquence en pattern V-T-V (V, T, V pour n=3 ;
   * V, T pour n=2 ; V pour n=1 ; rien pour n=0).
   *
   * Garde une trace des ids déjà tirés dans CE tirage pour ne pas
   * proposer deux fois le même mot si on tire plusieurs V à la suite.
   * (Sans cette précaution, deux appels successifs à
   * getMotsDisponibles(...,"post_boot_V")[0] renverraient le même id
   * puisque la progression n'est pas encore enregistrée.)
   *
   * Fallback : si V est épuisé alors qu'on attend un V, on tire un T à
   * la place. Si les deux sont épuisés, on retourne ce qu'on a pu tirer.
   *
   * @param {string} childId
   * @param {number} n
   * @returns {number[]}
   */
  _tirerFreqVTV(childId, n) {
    const pattern = PATTERN_VTV[n] || [];
    return this._tirerSelonPattern(childId, pattern);
  }

  /**
   * Tire `n` mots Fréquence en pattern T-T-T (tous des T).
   * Fallback V si T est épuisé (très improbable en pratique).
   *
   * @param {string} childId
   * @param {number} n
   * @returns {number[]}
   */
  _tirerFreqTTT(childId, n) {
    const pattern = Array(n).fill("T");
    return this._tirerSelonPattern(childId, pattern);
  }

  /**
   * Tire les mots Fréquence selon un pattern de catégories ("V"/"T").
   * Tient un set des ids déjà tirés dans CE tirage (les entrées de
   * progression ne sont enregistrées qu'après par l'appelant).
   *
   * Pour chaque catégorie demandée, prend le premier mot disponible
   * non encore tiré ce tour. Si la sous-file de la catégorie demandée
   * est vide, bascule sur l'autre (fallback). Si les deux sont vides,
   * arrête et renvoie ce qui a été tiré.
   *
   * @param {string} childId
   * @param {string[]} pattern - séquence de "V" et "T"
   * @returns {number[]}
   */
  _tirerSelonPattern(childId, pattern) {
    const dejaTires = new Set();
    const resultat = [];

    // On précalcule les listes triées une seule fois pour le tirage,
    // ça évite des appels répétés à getMotsDisponibles dans la boucle.
    const dispoV = this.getMotsDisponibles(childId, "post_boot_V");
    const dispoT = this.getMotsDisponibles(childId, "post_boot_T");

    // Fonction de pioche : prend le premier id de la liste pas déjà tiré
    const piocher = (liste) => {
      for (const id of liste) {
        if (!dejaTires.has(id)) return id;
      }
      return null;
    };

    for (const catDemandee of pattern) {
      const preferee = catDemandee === "V" ? dispoV : dispoT;
      const fallback = catDemandee === "V" ? dispoT : dispoV;

      let id = piocher(preferee);
      if (id === null) {
        // Sous-file préférée épuisée pour ce tour → fallback
        id = piocher(fallback);
      }
      if (id === null) {
        // Les deux sous-files sont à sec, on arrête
        break;
      }
      dejaTires.add(id);
      resultat.push(id);
    }

    return resultat;
  }

  // ───────────────────────────────────────────────────────────────────
  // Internes
  // ───────────────────────────────────────────────────────────────────

  /**
   * Récupère depuis le repo la liste triée des mots d'une sous-file.
   * Centralise la correspondance "nom de sous-file" → appel au repo.
   *
   * @param {string} sousFile
   * @returns {Object[]} mots normalisés (déjà triés par le repo)
   */
  _getSourceMots(sousFile) {
    switch (sousFile) {
      case "boot":
        return this._repo.getFrequenceByPhase("boot");
      case "post_boot_V":
        return this._repo.getFrequenceByPhase("post_boot", "V");
      case "post_boot_T":
        return this._repo.getFrequenceByPhase("post_boot", "T");
      case "themes":
        return this._repo.getThemesQueue();
      default:
        throw new Error(`OrdonnanceurService: sous-file inconnue "${sousFile}"`);
    }
  }
}


// Instance par défaut, à câbler par l'appelant avec le repo et userState
// au démarrage de l'app. On n'exporte PAS d'instance singleton ici
// parce que le service a besoin de dépendances injectées (à la diff
// de UserStateService et RebrassageService qui peuvent vivre seuls).
