/**
 * services/SessionRecorderService.js
 *
 * Service de PERSISTANCE des résultats d'une séance.
 * Miroir d'écriture du SessionComposerService (qui ne fait que lire).
 *
 * ─────────────────────────────────────────────────────────────────────
 * RÔLE
 * ─────────────────────────────────────────────────────────────────────
 * Unique point d'entrée pour transformer un Array<{word, mode, success}>
 * (produit par ExerciseScreen) en :
 *   1. Écritures intra-jour dans UserStateService (exosProgress,
 *      acquiredToday) → reprise après crash/abort.
 *   2. Avancements du cycle de rebrassage via RebrassageService
 *      (introduireMot ou enregistrerRebrassage selon l'état du mot).
 *
 * Aucun autre code ne doit toucher au cycle ou à exosProgress en
 * écriture — toutes les écritures liées à une séance passent par ici.
 * Le Composer et le Router restent en lecture seule sur ces données.
 *
 * ─────────────────────────────────────────────────────────────────────
 * DEUX MODES D'UTILISATION
 * ─────────────────────────────────────────────────────────────────────
 *
 *   recordExo(childId, wordId, mode, success, dateISO)
 *     → "STREAM" : appelé à chaque exo terminé pendant la séance.
 *       Met à jour exosProgress (uniquement les succès, cf. D6 N3c).
 *       Aucun effet sur le cycle. Le but est purement la reprise après
 *       crash : si l'enfant fait 5 exos puis l'app plante, il les
 *       retrouvera comme déjà faits au prochain lancement.
 *
 *   enregistrerSeance(childId, results, dateISO)
 *     → "BATCH FIN DE SÉANCE" : appelé une fois en fin de séance
 *       (complete ou abort). Parcourt les résultats, agrège par mot,
 *       fait avancer le cycle pour les mots dont le critère success
 *       est validé, marque les mots dans acquiredToday.
 *
 * Les deux modes sont COMPLÉMENTAIRES, pas redondants :
 *   - recordExo écrit pour la reprise du jour
 *   - enregistrerSeance écrit pour l'avancement long-terme
 *
 * Le Router est chargé d'appeler les deux au bon moment :
 *   - recordExo via le callback onAnswer de ExerciseScreen
 *   - enregistrerSeance via les callbacks onComplete / onAbort
 *
 * ─────────────────────────────────────────────────────────────────────
 * CRITÈRE "SUCCESS PAR MOT" (TEMPORAIRE — PAS 10)
 * ─────────────────────────────────────────────────────────────────────
 * Spec finale (cf. SESSION-decisions D6 N3a) : un mot est "validé"
 * si TOUS les modes prévus pour lui dans cette séance ont été réussis.
 *
 * MAIS au Pas 9b, l'ExerciseService n'existe pas encore, donc on ne
 * sait pas combien de modes étaient prévus pour chaque mot. Critère
 * temporaire validé avec l'utilisateur :
 *
 *   "≥1 mode réussi dans les résultats = mot validé"
 *
 * Tous les sites concernés sont annotés `// TEMP Pas 10:` pour qu'on
 * les retrouve facilement quand on durcira le critère.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SÉANCE DE RÉVISION (NON SUPPORTÉE AU PAS 9b)
 * ─────────────────────────────────────────────────────────────────────
 * Le RevisionPlaceholderScreen actuel ne produit aucun résultat à
 * enregistrer, donc le Recorder ne devrait jamais être appelé pour
 * une séance révision. Filet de sécurité : si on lui passe des
 * résultats concernant un mot en étape j7/j30/j90 (= palier long,
 * géré uniquement par la séance révision), il lève une erreur
 * explicite. Comme ça, le jour où le vrai écran révision arrivera
 * au Pas 11 et qu'on oubliera de gérer ce cas dans le Router, ça
 * ne passera pas inaperçu.
 *
 * ─────────────────────────────────────────────────────────────────────
 * IDEMPOTENCE
 * ─────────────────────────────────────────────────────────────────────
 * Si enregistrerSeance est appelé deux fois pour la même séance (bug,
 * double-clic, navigation aller-retour…), le Recorder regarde
 * acquiredToday avant d'écrire dans le cycle. Un mot déjà marqué
 * "acquis aujourd'hui" est skippé silencieusement, pas de double
 * appel à introduireMot / enregistrerRebrassage. C'est gratuit
 * (lecture des structures du 9a) et ça évite de polluer l'historique.
 *
 * ─────────────────────────────────────────────────────────────────────
 * INJECTION DE DÉPENDANCES
 * ─────────────────────────────────────────────────────────────────────
 * Le service reçoit ses dépendances en constructeur (pattern aligné
 * sur le Composer). Permet d'injecter des doubles en test. Le
 * singleton applicatif est construit dans main.js avec les vrais
 * services.
 */

// Étapes valides pour un J+0 (peuvent passer par le flux "normale").
// Les autres étapes (j7, j30, j90) sont gérées en séance révision
// uniquement, et leur présence dans des results de séance "normale"
// est une erreur de branchement.
const ETAPES_SEANCE_NORMALE = new Set(["j0", "j1"]);

// Regex stricte pour les dates ISO. Aligné avec les autres services.
const ISO_DATE_RX = /^\d{4}-\d{2}-\d{2}$/;


class SessionRecorderService {

  /**
   * @param {Object} deps
   * @param {Object} deps.userState - instance de UserStateService
   * @param {Object} deps.rebrassage - instance de RebrassageService
   */
  constructor({ userState, rebrassage }) {
    if (!userState) {
      throw new Error(
        "[SessionRecorderService] dépendance manquante : userState"
      );
    }
    if (!rebrassage) {
      throw new Error(
        "[SessionRecorderService] dépendance manquante : rebrassage"
      );
    }
    this.userState = userState;
    this.rebrassage = rebrassage;
  }

  // ───────────────────────────────────────────────────────────────────
  // MODE STREAM : recordExo
  // ───────────────────────────────────────────────────────────────────

  /**
   * Enregistre le résultat d'UN exercice (un couple mot × mode) en
   * cours de séance. Mode "stream" : la séance n'est pas finie,
   * mais on persiste pour permettre la reprise après crash.
   *
   * Seuls les SUCCÈS sont stockés dans exosProgress (cf. D6 N3c).
   * Les échecs ne sont pas mémorisés : ils seront rejoués à la
   * reprise — c'est une répétition pédagogique involontaire mais
   * bénéfique.
   *
   * Cette méthode est sûre à appeler avec n'importe quel argument :
   * en cas de paramètre invalide, c'est un no-op silencieux (on
   * n'interrompt jamais le flux d'une séance pour une erreur de
   * stockage).
   *
   * @param {string} childId
   * @param {number|string} wordId
   * @param {string} mode - identifiant du mode d'exercice
   * @param {boolean} success
   * @param {string} dateISO - date du jour (pour cohérence intra-jour)
   */
  recordExo(childId, wordId, mode, success, dateISO) {
    // Validation tolérante
    if (!childId || typeof childId !== "string") return;
    if (typeof mode !== "string" || mode === "") return;
    if (!ISO_DATE_RX.test(dateISO)) return;

    // On ne stocke que les succès (D6 N3c)
    if (!success) return;

    this.userState.recordExoSuccess(childId, wordId, mode);
  }

  // ───────────────────────────────────────────────────────────────────
  // MODE BATCH : enregistrerSeance
  // ───────────────────────────────────────────────────────────────────

  /**
   * Traite la fin d'une séance d'exercices : agrège les résultats par
   * mot, fait avancer le cycle de rebrassage pour les mots validés,
   * et les marque acquis dans la journée.
   *
   * Algo (par mot apparaissant dans results) :
   *
   *   1. Garde-fou révision : si le mot est en étape j7/j30/j90, c'est
   *      une erreur de branchement → exception explicite.
   *
   *   2. Idempotence : si le mot est déjà dans acquiredToday, skip.
   *
   *   3. Calcul du success agrégé (TEMP Pas 10 : ≥1 mode réussi).
   *
   *   4. Routage Rebrassage :
   *        - Mot jamais introduit (getWordProgress = null)
   *          → rebrassage.introduireMot(child, wordId, date, success)
   *        - Mot déjà introduit
   *          → rebrassage.enregistrerRebrassage(child, wordId, date, success)
   *
   *   5. Marquer le mot dans acquiredToday (que success soit vrai ou
   *      faux : "acquis aujourd'hui" signifie "traité aujourd'hui",
   *      pas "réussi"). Sert au composer du lendemain pour ne pas
   *      reproposer un mot déjà vu dans la journée.
   *
   * @param {string} childId
   * @param {Array<{word, mode, success}>} results - résultats bruts d'ExerciseScreen
   * @param {string} dateISO
   * @returns {{processed: number, skipped: number}} compteurs
   *   processed = mots dont le cycle a avancé,
   *   skipped   = mots ignorés par idempotence.
   */
  enregistrerSeance(childId, results, dateISO) {
    if (!ISO_DATE_RX.test(dateISO)) {
      throw new Error(
        `[SessionRecorderService] date invalide : ${dateISO}`
      );
    }
    if (!Array.isArray(results)) {
      throw new Error(
        "[SessionRecorderService] results doit être un tableau"
      );
    }
    if (!childId || typeof childId !== "string") {
      throw new Error(
        "[SessionRecorderService] childId manquant ou invalide"
      );
    }

    // ─── Agrégation par mot ──────────────────────────────────────────
    // On regroupe les résultats par wordId pour traiter chaque mot
    // une seule fois, quel que soit le nombre de modes joués pour lui.
    // Une entrée par mot : { wordId, success (agrégé), modes (tous) }
    const parMot = new Map();  // wordId → { wordId, success, modes }

    for (const r of results) {
      // Validation tolérante : un résultat malformé est ignoré, pas
      // bloquant pour les autres.
      if (!r || typeof r !== "object") continue;
      if (!r.word || typeof r.word.id === "undefined") continue;
      if (typeof r.mode !== "string") continue;
      if (typeof r.success !== "boolean") continue;

      const wordId = Number(r.word.id);
      if (!Number.isInteger(wordId)) continue;

      let agg = parMot.get(wordId);
      if (!agg) {
        agg = { wordId, success: false, modes: [] };
        parMot.set(wordId, agg);
      }
      agg.modes.push({ mode: r.mode, success: r.success });
      // TEMP Pas 10 : critère temporaire = ≥1 mode réussi.
      // À durcir au Pas 10 en : "tous les modes prévus ont été réussis".
      if (r.success) agg.success = true;
    }

    // ─── Traitement séquentiel ─────────────────────────────────────
    let processed = 0;
    let skipped = 0;

    for (const { wordId, success } of parMot.values()) {

      // (1) Garde-fou révision : un mot en palier long n'a rien à
      // faire dans une séance "normale". Si c'est arrivé, c'est qu'on
      // a branché le Router de travers — on lève fort plutôt que
      // d'écrire silencieusement n'importe quoi dans le cycle.
      const progressBefore = this.userState.getWordProgress(childId, wordId);
      if (progressBefore && !ETAPES_SEANCE_NORMALE.has(progressBefore.etape)) {
        // Cas "acquis" : on laisse passer silencieusement (mot déjà
        // sorti du cycle, ne devrait pas être dans une séance, mais
        // l'ignorer est inoffensif).
        if (progressBefore.etape === "acquis") {
          skipped++;
          continue;
        }
        throw new Error(
          `[SessionRecorderService] mot ${wordId} en étape "${progressBefore.etape}" ` +
          `dans une séance normale — séance révision non supportée au Pas 9b. ` +
          `Vérifier le branchement Router (RevisionPlaceholderScreen ne doit ` +
          `pas appeler le recorder).`
        );
      }

      // (2) Idempotence : déjà traité aujourd'hui → skip
      if (this.userState.isWordAcquiredToday(childId, wordId)) {
        skipped++;
        continue;
      }

      // (3) Routage Rebrassage selon que le mot est nouveau ou pas
      if (progressBefore === null) {
        // Première fois qu'on voit ce mot → J+0 inaugural
        this.rebrassage.introduireMot(childId, wordId, dateISO, success);
      } else {
        // Mot déjà en cycle (j0 répété ou j1) → enregistrer le passage
        this.rebrassage.enregistrerRebrassage(childId, wordId, dateISO, success);
      }

      // (4) Marquer comme traité aujourd'hui (succès OU échec :
      // "acquis aujourd'hui" = "vu et traité aujourd'hui", pas
      // "validé". Le composer du lendemain s'en sert pour ne pas
      // reproposer un mot déjà vu, indépendamment du résultat.)
      this.userState.markWordAcquiredToday(childId, wordId);

      processed++;
    }

    return { processed, skipped };
  }
}


export { SessionRecorderService };
