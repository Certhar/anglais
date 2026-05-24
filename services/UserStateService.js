/**
 * services/UserStateService.js
 *
 * Service de persistance de l'état utilisateur.
 *
 * ─────────────────────────────────────────────────────────────────────
 * STOCKAGE
 * ─────────────────────────────────────────────────────────────────────
 * Persistance dans `localStorage` sous la clé `vocabulaire.userState.v1`.
 *
 * Choix de `localStorage` (cf. decisions-en-attente.md n°4) :
 *   - API synchrone → code simple, pas de propagation d'async dans toute
 *     l'app pour quelques Ko de données
 *   - Suffit largement pour la volumétrie attendue (quelques enfants,
 *     quelques flags par enfant)
 *   - Le jour où on a besoin de plus (gros volumes, sync multi-appareils,
 *     données structurées), on bascule sur IndexedDB ou un backend SANS
 *     changer le contrat public de ce service — c'est précisément le
 *     bénéfice de passer par un service plutôt que de toucher
 *     localStorage en direct depuis les écrans.
 *
 * Le suffixe `.v1` dans la clé permet une migration propre si on change
 * un jour le schéma : on lit `.v2`, et si absent, on essaie de lire `.v1`
 * + on convertit (puis on écrit en `.v2` et on efface `.v1`).
 *
 * ─────────────────────────────────────────────────────────────────────
 * ROBUSTESSE
 * ─────────────────────────────────────────────────────────────────────
 *  - Si `localStorage` est indisponible (mode privé Safari, environnement
 *    non-navigateur, quota dépassé...), le service bascule silencieusement
 *    en mode mémoire pure. L'app continue de fonctionner, simplement
 *    l'état est perdu au reload.
 *  - Si le JSON stocké est corrompu (édition manuelle, ancienne version
 *    incompatible), on repart d'un état vide proprement plutôt que de
 *    planter.
 *  - Toutes les écritures sont silencieusement try/catch : on n'interrompt
 *    jamais le flux applicatif pour une erreur de stockage.
 *
 * ─────────────────────────────────────────────────────────────────────
 * CONCEPTS
 * ─────────────────────────────────────────────────────────────────────
 * "Un jour" = un jour calendaire. La leçon courante avance d'un cran
 * à chaque nouveau jour d'utilisation, pas à chaque session.
 *
 * Verrou des exercices : tant que la leçon courante n'a pas été
 * parcourue au moins une fois, les exercices sont verrouillés. Le flag
 * est remis à false dès qu'on détecte un nouveau jour.
 *
 * ─────────────────────────────────────────────────────────────────────
 * PROGRESSION PAR MOT (ajout mai 2026 — préalable au RebrassageService)
 * ─────────────────────────────────────────────────────────────────────
 * En plus des flags du jour, le service stocke maintenant l'avancement
 * de chaque mot dans le cycle de rebrassage J+0/J+1/J+7/J+30/J+90 (voir
 * architecture.md §7). Une entrée par couple (enfant × mot) :
 *
 *   {
 *     etape: "j0" | "j1" | "j7" | "j30" | "j90" | "acquis",
 *     dateIntroduction: "YYYY-MM-DD",
 *     dateProchainRebrassage: "YYYY-MM-DD" | null,
 *     historique: [
 *       {date: "YYYY-MM-DD", statut: "j0", resultat: "ok"|"chute"},
 *       ...
 *     ]
 *   }
 *
 * ⚠️ Important : ce service ne décide RIEN sur la pédagogie. Il ne
 * calcule pas les dates de rebrassage, ne fait pas progresser les étapes,
 * ne traite pas les chutes. Il PERSISTE ce que le RebrassageService lui
 * dit d'écrire. Le service de rebrassage à venir lira/écrira via les
 * méthodes ci-dessous.
 *
 * ─────────────────────────────────────────────────────────────────────
 * API
 * ─────────────────────────────────────────────────────────────────────
 *   // Flags du jour
 *   userState.markLessonViewed(childId)
 *   userState.isLessonViewed(childId) → boolean
 *   userState.resetForNewDay(childId)  // exposé pour les tests
 *   userState.clear()                  // efface tout (tests / "premier lancement")
 *
 *   // Dernier enfant utilisé
 *   userState.setLastChildId(childId)
 *   userState.getLastChildId() → string|null
 *   userState.clearLastChildId()
 *
 *   // Progression par mot (lecture)
 *   userState.getWordProgress(childId, wordId) → progressEntry | null
 *   userState.getAllProgress(childId) → Map<wordId, progressEntry>  (copie)
 *   userState.getWordsByEtape(childId, etape) → number[]
 *   userState.getWordsDueOn(childId, dateISO) → number[]
 *
 *   // Progression par mot (écriture)
 *   userState.setWordProgress(childId, wordId, entry)
 *   userState.recordWordOutcome(childId, wordId, {date, statut, resultat})
 *   userState.removeWordProgress(childId, wordId)
 *   userState.clearProgress(childId)
 *   userState.clearChild(childId)        // table rase complète pour CET enfant
 *
 *   // État intra-jour (ajout Pas 9a — préalable au SessionRecorderService)
 *   userState.recordExoSuccess(childId, wordId, mode)
 *   userState.getExosProgress(childId, wordId) → string[]
 *   userState.markWordAcquiredToday(childId, wordId)
 *   userState.getAcquiredToday(childId) → number[]
 *   userState.isWordAcquiredToday(childId, wordId) → boolean
 *
 * Méthode interne : _checkDayRollover(childId) est appelée
 * automatiquement par toutes les méthodes publiques pour détecter si
 * on a changé de jour calendaire depuis la dernière utilisation, et
 * réinitialiser les flags du jour (lessonViewed, exosProgress,
 * acquiredToday) si oui.
 *
 * ─────────────────────────────────────────────────────────────────────
 * ÉTAT INTRA-JOUR (ajout Pas 9a — mai 2026)
 * ─────────────────────────────────────────────────────────────────────
 * Pour permettre la reprise après abort/crash en plein milieu d'une
 * séance, on stocke par enfant :
 *
 *   exosProgress: { wordId: ["mcq", "textInput", ...], ... }
 *       → modes RÉUSSIS aujourd'hui (les échecs ne sont pas stockés,
 *         ils sont rejoués à la reprise — D6 N3c).
 *   acquiredToday: [wordId, wordId, ...]
 *       → mots dont tous les modes prévus ont été validés aujourd'hui.
 *
 * Ces deux structures sont automatiquement réinitialisées au rollover
 * de jour (cf. _checkDayRollover). Le SessionRecorderService (à venir)
 * écrit dedans en mode "stream" : à chaque exo réussi, pas en batch.
 */


const STORAGE_KEY = "vocabulaire.userState.v1";

// Étapes valides du cycle de rebrassage (cf. architecture.md §5.3 + §7.4).
// Utilisé pour valider les entrées qu'on lit/écrit. Une entrée avec une
// étape hors de ce set est considérée corrompue et ignorée silencieusement.
const VALID_ETAPES = new Set(["j0", "j1", "j7", "j30", "j90", "acquis"]);

// Résultats valides pour une entrée d'historique.
const VALID_RESULTATS = new Set(["ok", "chute"]);

// Regex strict YYYY-MM-DD. On reste minimaliste : on ne tente PAS de
// valider que la date est réelle (31 février passerait). C'est juste un
// garde-fou contre les valeurs manifestement aberrantes ("hier", null, "").
const ISO_DATE_RX = /^\d{4}-\d{2}-\d{2}$/;


class UserStateService {

  constructor() {
    // État en mémoire. C'est la SOURCE DE VÉRITÉ pendant la session ;
    // localStorage n'est qu'un miroir persisté.
    //
    // Structure :
    //   {
    //     "_lastChildId": "julie",   // (optionnel) dernier enfant utilisé
    //     "julie": { lessonViewed: false, lastUsedDate: "2026-05-15" },
    //     "max":   { lessonViewed: true,  lastUsedDate: "2026-05-15" },
    //   }
    //
    // Les clés préfixées par "_" sont des métadonnées globales. Les autres
    // sont des états par enfant indexés par childId. Cette convention évite
    // tout conflit (un childId ne commence jamais par "_").
    this._state = {};

    // Disponibilité de localStorage. Évaluée une seule fois, mémorisée
    // pour éviter de retenter à chaque écriture si c'est indisponible.
    this._storageAvailable = this._detectStorage();

    // Au démarrage, on essaie de récupérer l'état persisté
    this._load();
  }

  // ───────────────────────────────────────────────────────────────────
  // Détection et accès au stockage
  // ───────────────────────────────────────────────────────────────────

  /**
   * Détecte si localStorage est utilisable dans cet environnement.
   * Test léger : on tente une écriture/lecture/suppression d'une clé
   * temporaire. Ça suffit à détecter le mode privé Safari (qui throw),
   * un quota plein, ou un environnement non-navigateur.
   * @private
   */
  _detectStorage() {
    try {
      if (typeof localStorage === "undefined") return false;
      const testKey = "__vocab_probe__";
      localStorage.setItem(testKey, "1");
      localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Charge l'état depuis localStorage. Tolérant aux données corrompues :
   * en cas d'erreur de parsing, on repart d'un état vide propre.
   * @private
   */
  _load() {
    if (!this._storageAvailable) return;

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;  // pas de données stockées, état vide normal

      const parsed = JSON.parse(raw);
      // Validation minimale : on attend un objet plain.
      // (Si quelqu'un a écrit n'importe quoi dans la clé, on l'ignore.)
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        this._state = parsed;
      }
    } catch (err) {
      console.warn(
        "[UserStateService] Données corrompues dans localStorage, " +
        "reprise sur un état vide.", err
      );
      this._state = {};
    }
  }

  /**
   * Sauvegarde l'état complet dans localStorage. Best-effort : si ça
   * échoue (quota plein, indispo...), on log un avertissement mais on
   * ne propage pas l'erreur — l'app continue avec l'état mémoire.
   * @private
   */
  _save() {
    if (!this._storageAvailable) return;

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._state));
    } catch (err) {
      console.warn("[UserStateService] Échec de sauvegarde :", err);
    }
  }

  // ───────────────────────────────────────────────────────────────────
  // Gestion du jour calendaire
  // ───────────────────────────────────────────────────────────────────

  /**
   * Renvoie la date du jour au format "YYYY-MM-DD" (clé de comparaison
   * pour détecter un changement de jour calendaire).
   * @private
   */
  _today() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  /**
   * Renvoie (en le créant si besoin) l'état d'un enfant.
   * AVANT le retour, vérifie si on a changé de jour calendaire depuis
   * la dernière utilisation et réinitialise les flags du jour si oui.
   *
   * Si une modification a lieu (création ou rollover), elle est
   * automatiquement persistée.
   * @private
   */
  _getOrInit(childId) {
    let dirty = false;

    if (!this._state[childId]) {
      this._state[childId] = {
        lessonViewed: false,
        lastUsedDate: null,
        progress: {},
        exosProgress: {},      // ajout Pas 9a — modes réussis aujourd'hui par mot
        acquiredToday: [],     // ajout Pas 9a — mots acquis aujourd'hui
      };
      dirty = true;
    } else {
      // Migrations douces : enfant créé avant l'ajout de tel ou tel champ.
      // On l'ajoute sur place, pas besoin de bumper la version de clé.
      if (!this._state[childId].progress) {
        this._state[childId].progress = {};
        dirty = true;
      }
      if (!this._state[childId].exosProgress) {
        this._state[childId].exosProgress = {};
        dirty = true;
      }
      if (!Array.isArray(this._state[childId].acquiredToday)) {
        this._state[childId].acquiredToday = [];
        dirty = true;
      }
    }

    if (this._checkDayRollover(childId)) {
      dirty = true;
    }

    if (dirty) {
      this._save();
    }

    return this._state[childId];
  }

  /**
   * Si on a changé de jour calendaire depuis lastUsedDate, on réinitialise
   * les flags qui sont liés à la journée (lessonViewed). lastUsedDate est
   * mis à jour à aujourd'hui.
   *
   * Note : on appelle cette méthode à chaque accès, pas seulement au
   * démarrage. Comme ça si l'app reste ouverte pendant minuit, on
   * détecte tout de même le passage au jour suivant.
   *
   * @returns {boolean} true si quelque chose a changé (utile pour décider
   *   si on doit persister)
   * @private
   */
  _checkDayRollover(childId) {
    const st = this._state[childId];
    if (!st) return false;

    const today = this._today();
    if (st.lastUsedDate !== today) {
      // Nouveau jour → reset des flags liés à la journée :
      //   - lessonViewed : verrou des exos repart de zéro
      //   - exosProgress : les modes réussis hier n'ont plus de sens aujourd'hui
      //   - acquiredToday : les mots "validés hier" ne sont plus dans ce statut
      // (cf. D6 N3 : ces structures sont strictement intra-jour)
      st.lessonViewed = false;
      st.exosProgress = {};
      st.acquiredToday = [];
      st.lastUsedDate = today;
      return true;
    }
    return false;
  }

  // ───────────────────────────────────────────────────────────────────
  // API publique
  // ───────────────────────────────────────────────────────────────────

  /**
   * Marque la leçon courante comme parcourue pour cet enfant.
   * Déverrouille les exercices. Persiste immédiatement.
   */
  markLessonViewed(childId) {
    const st = this._getOrInit(childId);
    if (!st.lessonViewed) {
      st.lessonViewed = true;
      this._save();
    }
  }

  /**
   * Renvoie true si la leçon courante a déjà été parcourue aujourd'hui.
   * @returns {boolean}
   */
  isLessonViewed(childId) {
    const st = this._getOrInit(childId);
    return st.lessonViewed;
  }

  /**
   * Force le passage à un nouveau jour pour cet enfant (utile pour les
   * tests : permet de simuler "Julie revient demain" sans attendre).
   *
   * Réinitialise TOUS les flags du jour, en cohérence avec ce que ferait
   * un vrai rollover automatique de minuit :
   *   - lessonViewed → false
   *   - exosProgress → {}
   *   - acquiredToday → []
   *   - lastUsedDate → null (forcera un nouveau rollover au prochain accès)
   *
   * La progression long-terme (`progress`, cycle de rebrassage) n'est
   * PAS touchée — elle vit sur plusieurs jours par construction.
   *
   * Persiste immédiatement.
   */
  resetForNewDay(childId) {
    if (!this._state[childId]) return;
    this._state[childId].lessonViewed = false;
    this._state[childId].exosProgress = {};
    this._state[childId].acquiredToday = [];
    this._state[childId].lastUsedDate = null;
    this._save();
  }

  /**
   * Efface tout l'état (en mémoire ET dans localStorage).
   * Pratique pour tester un scénario "premier lancement" sans devoir
   * vider le storage à la main via les DevTools.
   */
  clear() {
    this._state = {};
    if (this._storageAvailable) {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (err) {
        console.warn("[UserStateService] Échec d'effacement :", err);
      }
    }
  }

  // ───────────────────────────────────────────────────────────────────
  // Préférence "dernier enfant utilisé"
  // ───────────────────────────────────────────────────────────────────
  //
  // Permet à l'app de se rouvrir directement sur le menu du dernier
  // enfant connecté, plutôt que de redemander "Qui es-tu ?" à chaque
  // ouverture. Sert l'usage cible "1 tel = 1 enfant" tout en gardant
  // la capacité de changer (bouton "Changer de profil" = clearLastChildId).
  //
  // Stocké dans la même clé localStorage que le reste, sous le champ
  // `_lastChildId` (préfixé par _ pour le distinguer des childId réels).

  /**
   * Enregistre le dernier enfant utilisé.
   * Appelé par le Router quand un enfant démarre une activité.
   * @param {string} childId
   */
  setLastChildId(childId) {
    if (!childId) return;
    if (this._state._lastChildId !== childId) {
      this._state._lastChildId = childId;
      this._save();
    }
  }

  /**
   * Renvoie le dernier enfant utilisé, ou null si aucun n'est connu.
   * Appelé par le Router au démarrage pour préinitialiser _currentChildId.
   * @returns {string|null}
   */
  getLastChildId() {
    return this._state._lastChildId || null;
  }

  /**
   * Efface la préférence "dernier enfant". L'app reviendra à l'écran
   * "Qui es-tu ?" au prochain démarrage (ou immédiatement si appelé
   * pendant une session). Appelé par le Router via le bouton
   * "Changer de profil" de HomeScreen.
   */
  clearLastChildId() {
    if (this._state._lastChildId) {
      delete this._state._lastChildId;
      this._save();
    }
  }

  // ───────────────────────────────────────────────────────────────────
  // Progression par mot (cycle de rebrassage J+0/J+1/J+7/J+30/J+90)
  // ───────────────────────────────────────────────────────────────────
  //
  // Rappel de positionnement : ce bloc est de la PERSISTANCE. Il ne fait
  // AUCUNE décision pédagogique (calcul des dates de rebrassage, transition
  // d'étape, gestion des chutes, etc.). Cette logique vit dans le
  // RebrassageService à venir, qui appelle les méthodes ci-dessous pour
  // lire et écrire l'état.
  //
  // Les wordId sont attendus comme des nombres (cf. words.canonical.json,
  // champ `id`). On les stocke en interne sous forme de String (les clés
  // d'objet JSON sont toujours des strings) et on les renvoie en Number
  // dans les getters de listes, pour rester cohérent avec le corpus.

  /**
   * Valide la structure d'une entrée de progression. Tolérant : renvoie
   * true/false sans throw. Utilisé en lecture (filtrer le corrompu) et
   * en écriture (refuser silencieusement les inputs invalides).
   *
   * @param {*} entry
   * @returns {boolean}
   * @private
   */
  _isValidProgressEntry(entry) {
    if (!entry || typeof entry !== "object") return false;
    if (!VALID_ETAPES.has(entry.etape)) return false;
    if (!ISO_DATE_RX.test(entry.dateIntroduction)) return false;
    // dateProchainRebrassage : null autorisé (mot acquis, ou pas encore programmé)
    if (entry.dateProchainRebrassage !== null
        && !ISO_DATE_RX.test(entry.dateProchainRebrassage)) {
      return false;
    }
    if (!Array.isArray(entry.historique)) return false;
    return true;
  }

  /**
   * Renvoie l'entrée de progression d'un mot pour un enfant, ou null si
   * absente / corrompue. La valeur renvoyée est une COPIE — modifier le
   * résultat ne modifie pas l'état stocké.
   *
   * @param {string} childId
   * @param {number|string} wordId
   * @returns {Object|null}
   */
  getWordProgress(childId, wordId) {
    const st = this._getOrInit(childId);
    const entry = st.progress[String(wordId)];
    if (!this._isValidProgressEntry(entry)) return null;
    // Deep copy via JSON pour éviter toute fuite de référence interne.
    // L'historique est petit (qq entrées), le coût est négligeable.
    return JSON.parse(JSON.stringify(entry));
  }

  /**
   * Renvoie toute la progression d'un enfant sous forme de Map
   * wordId(Number) → entry(copie). Les entrées corrompues sont filtrées.
   *
   * Map plutôt qu'Object pour garder des clés numériques côté consommateur
   * (plus naturel à utiliser : `progress.get(42)` plutôt que `progress["42"]`).
   *
   * @param {string} childId
   * @returns {Map<number, Object>}
   */
  getAllProgress(childId) {
    const st = this._getOrInit(childId);
    const result = new Map();
    for (const [key, entry] of Object.entries(st.progress)) {
      if (!this._isValidProgressEntry(entry)) continue;
      const wordId = Number(key);
      if (!Number.isInteger(wordId)) continue;  // garde-fou supplémentaire
      result.set(wordId, JSON.parse(JSON.stringify(entry)));
    }
    return result;
  }

  /**
   * Renvoie les ids des mots actuellement à une étape donnée pour cet
   * enfant. Utile au RebrassageService pour parcourir "tous les J+0",
   * "tous les acquis", etc.
   *
   * @param {string} childId
   * @param {string} etape - une valeur de VALID_ETAPES
   * @returns {number[]}
   */
  getWordsByEtape(childId, etape) {
    if (!VALID_ETAPES.has(etape)) return [];
    const st = this._getOrInit(childId);
    const result = [];
    for (const [key, entry] of Object.entries(st.progress)) {
      if (!this._isValidProgressEntry(entry)) continue;
      if (entry.etape !== etape) continue;
      const wordId = Number(key);
      if (Number.isInteger(wordId)) result.push(wordId);
    }
    return result;
  }

  /**
   * Renvoie les ids des mots dont `dateProchainRebrassage` est ≤ dateISO.
   * Volontairement basique : pas de logique mercredi, pas de bascule
   * journée découverte/consolidation. C'est au RebrassageService de
   * combiner ce résultat avec les règles métier.
   *
   * Les mots déjà "acquis" sont exclus (ils ont dateProchainRebrassage=null
   * et n'auraient de toute façon rien à faire dans une pile de rebrassage).
   *
   * @param {string} childId
   * @param {string} dateISO - YYYY-MM-DD (typiquement aujourd'hui)
   * @returns {number[]}
   */
  getWordsDueOn(childId, dateISO) {
    if (!ISO_DATE_RX.test(dateISO)) return [];
    const st = this._getOrInit(childId);
    const result = [];
    for (const [key, entry] of Object.entries(st.progress)) {
      if (!this._isValidProgressEntry(entry)) continue;
      if (entry.etape === "acquis") continue;
      if (!entry.dateProchainRebrassage) continue;
      // Comparaison de strings YYYY-MM-DD = comparaison chronologique
      if (entry.dateProchainRebrassage <= dateISO) {
        const wordId = Number(key);
        if (Number.isInteger(wordId)) result.push(wordId);
      }
    }
    return result;
  }

  /**
   * Écrit (upsert) l'entrée de progression complète d'un mot. À utiliser
   * quand le RebrassageService veut poser un état explicite (ex : créer
   * une entrée J+0 à l'introduction d'un nouveau mot).
   *
   * Si `entry` est invalide, l'écriture est refusée silencieusement et
   * un warn est loggué (cohérent avec la philo "ne jamais interrompre
   * le flux applicatif pour une erreur de stockage").
   *
   * @param {string} childId
   * @param {number|string} wordId
   * @param {Object} entry - structure progressEntry complète
   */
  setWordProgress(childId, wordId, entry) {
    if (!this._isValidProgressEntry(entry)) {
      console.warn(
        "[UserStateService] setWordProgress refusé : entrée invalide",
        { childId, wordId, entry }
      );
      return;
    }
    const st = this._getOrInit(childId);
    // Deep copy à l'entrée aussi, pour ne pas garder une référence vers
    // un objet que l'appelant pourrait muter ensuite.
    st.progress[String(wordId)] = JSON.parse(JSON.stringify(entry));
    this._save();
  }

  /**
   * Ajoute une entrée à l'historique d'un mot et met à jour son étape
   * courante en cohérence. Création implicite de l'entrée si elle
   * n'existait pas (cas d'un tout premier passage J+0).
   *
   * Ce que cette méthode FAIT :
   *   - append à `historique`
   *   - met `etape` = `outcome.statut` (l'appelant décide de l'étape qu'il
   *     vient de traiter)
   *   - PAS de calcul de dateProchainRebrassage (c'est de la pédagogie,
   *     donc le boulot du RebrassageService — il appellera setWordProgress
   *     juste après pour fixer la prochaine date)
   *
   * @param {string} childId
   * @param {number|string} wordId
   * @param {Object} outcome - { date: "YYYY-MM-DD", statut: "j0"|..., resultat: "ok"|"chute" }
   */
  recordWordOutcome(childId, wordId, outcome) {
    if (!outcome || typeof outcome !== "object") return;
    if (!ISO_DATE_RX.test(outcome.date)) return;
    if (!VALID_ETAPES.has(outcome.statut)) return;
    if (!VALID_RESULTATS.has(outcome.resultat)) return;

    const st = this._getOrInit(childId);
    const key = String(wordId);
    let entry = st.progress[key];

    if (!this._isValidProgressEntry(entry)) {
      // Première trace pour ce mot : on crée une entrée. dateIntroduction
      // = la date du premier outcome (typiquement un j0).
      entry = {
        etape: outcome.statut,
        dateIntroduction: outcome.date,
        dateProchainRebrassage: null,
        historique: [],
      };
      st.progress[key] = entry;
    }

    entry.historique.push({
      date: outcome.date,
      statut: outcome.statut,
      resultat: outcome.resultat,
    });
    entry.etape = outcome.statut;
    this._save();
  }

  /**
   * Supprime l'entrée de progression d'un mot. Utilisé typiquement quand
   * un mot devient "acquis" et qu'on veut le sortir des structures
   * actives (le RebrassageService peut aussi choisir de le garder avec
   * etape="acquis" pour les stats ; c'est lui qui décide).
   *
   * No-op si l'entrée n'existait pas.
   *
   * @param {string} childId
   * @param {number|string} wordId
   */
  removeWordProgress(childId, wordId) {
    const st = this._getOrInit(childId);
    const key = String(wordId);
    if (key in st.progress) {
      delete st.progress[key];
      this._save();
    }
  }

  /**
   * Efface toute la progression d'un enfant, sans toucher aux autres
   * flags (lessonViewed, lastUsedDate). Utile pour un "reset progression"
   * dans le dashboard parent, ou en tests.
   *
   * @param {string} childId
   */
  clearProgress(childId) {
    const st = this._getOrInit(childId);
    st.progress = {};
    this._save();
  }

  /**
   * Table rase complète pour UN enfant donné. Supprime l'intégralité de
   * son état (progress, lessonViewed, lastUsedDate, exosProgress,
   * acquiredToday) en mémoire ET dans localStorage. Les autres enfants
   * ne sont PAS affectés.
   *
   * À la prochaine lecture (`_getOrInit`), l'enfant sera recréé avec
   * un état vierge, exactement comme à la première connexion.
   *
   * Différences avec les méthodes voisines :
   *   - clearProgress(childId) : ne vide QUE la progression long-terme
   *     (le cycle de rebrassage), garde lessonViewed et les flags du jour.
   *   - resetForNewDay(childId) : ne touche QUE les flags intra-jour,
   *     garde la progression long-terme.
   *   - clear() : table rase pour TOUS les enfants.
   *   - clearChild(childId) [cette méthode] : table rase pour UN enfant.
   *
   * Usage prévu : bouton "reset" sur les profils de débug (cf. flag
   * `isDebugProfile` sur le profil papa dans main.js) pour permettre
   * de tester l'app depuis un état neuf sans toucher aux autres profils.
   *
   * No-op si l'enfant n'avait aucun état stocké.
   *
   * @param {string} childId
   */
  clearChild(childId) {
    if (!childId) return;
    if (childId in this._state) {
      delete this._state[childId];
      this._save();
    }
  }

  // ───────────────────────────────────────────────────────────────────
  // État intra-jour (ajout Pas 9a)
  // ───────────────────────────────────────────────────────────────────
  //
  // Stocke les modes réussis aujourd'hui par mot (exosProgress) et la
  // liste des mots dont tous les modes prévus ont été validés
  // aujourd'hui (acquiredToday). Le rollover automatique (cf.
  // _checkDayRollover) réinitialise ces structures à chaque nouveau
  // jour calendaire, donc les méthodes ci-dessous sont sûres à appeler
  // sans précaution particulière : si on est passé minuit depuis
  // l'écriture précédente, le reset est silencieux et automatique.

  /**
   * Enregistre qu'un mode d'exercice donné a été RÉUSSI pour un mot
   * aujourd'hui. Idempotent : appeler deux fois avec le même mode ne
   * crée pas de doublon.
   *
   * Les échecs ne sont PAS stockés (cf. D6 N3c) : ils sont rejoués à
   * la reprise. Conséquence pédagogique : un enfant qui rate un exo
   * le retrouvera en relançant l'app, ce qui constitue une répétition
   * = apprentissage involontaire.
   *
   * No-op silencieux si les arguments sont invalides (mode non-string,
   * mode vide…). Le but est de ne jamais interrompre le flux du
   * Recorder pour une erreur de stockage.
   *
   * @param {string} childId
   * @param {number|string} wordId
   * @param {string} mode - nom du mode d'exercice (ex: "mcq", "textInput")
   */
  recordExoSuccess(childId, wordId, mode) {
    if (typeof mode !== "string" || mode === "") return;
    const st = this._getOrInit(childId);
    const key = String(wordId);
    const modes = st.exosProgress[key] || [];
    if (modes.includes(mode)) return;  // idempotent
    modes.push(mode);
    st.exosProgress[key] = modes;
    this._save();
  }

  /**
   * Renvoie la liste (COPIE) des modes réussis pour un mot aujourd'hui.
   * Tableau vide si aucun mode n'a encore été réussi, ou si l'entrée
   * n'existe pas.
   *
   * @param {string} childId
   * @param {number|string} wordId
   * @returns {string[]}
   */
  getExosProgress(childId, wordId) {
    const st = this._getOrInit(childId);
    const modes = st.exosProgress[String(wordId)];
    return Array.isArray(modes) ? [...modes] : [];
  }

  /**
   * Marque un mot comme acquis aujourd'hui (tous ses modes prévus ont
   * été validés). Idempotent : ajouter deux fois le même wordId ne
   * crée pas de doublon.
   *
   * "Acquis aujourd'hui" ≠ "acquis dans le cycle long-terme" : ce flag
   * est purement intra-jour, il sert au filtrage par le Router/Composer
   * pour ne pas re-proposer dans la même journée un mot déjà validé.
   * La transition d'étape dans le cycle de rebrassage est faite par
   * le RebrassageService, indépendamment.
   *
   * @param {string} childId
   * @param {number|string} wordId
   */
  markWordAcquiredToday(childId, wordId) {
    const idNum = Number(wordId);
    if (!Number.isInteger(idNum)) return;
    const st = this._getOrInit(childId);
    if (st.acquiredToday.includes(idNum)) return;  // idempotent
    st.acquiredToday.push(idNum);
    this._save();
  }

  /**
   * Renvoie la liste (COPIE) des mots acquis aujourd'hui pour cet enfant.
   * Tableau vide si rien n'a été acquis (ou nouveau jour).
   *
   * @param {string} childId
   * @returns {number[]}
   */
  getAcquiredToday(childId) {
    const st = this._getOrInit(childId);
    return [...st.acquiredToday];
  }

  /**
   * Renvoie true si le mot a déjà été validé aujourd'hui.
   * Raccourci pratique pour le Router/Composer qui ont juste besoin
   * d'un test booléen ("ce mot a-t-il été fait aujourd'hui ?").
   *
   * @param {string} childId
   * @param {number|string} wordId
   * @returns {boolean}
   */
  isWordAcquiredToday(childId, wordId) {
    const idNum = Number(wordId);
    if (!Number.isInteger(idNum)) return false;
    const st = this._getOrInit(childId);
    return st.acquiredToday.includes(idNum);
  }
}


// Singleton exporté — usage normal de l'app
export const userState = new UserStateService();

// La classe est aussi exportée pour permettre de créer une instance
// fraîche en test (utile pour simuler un reload : nouvelle instance =
// nouvel appel à _load() depuis localStorage). À ne PAS utiliser dans
// le code applicatif — toujours passer par le singleton `userState`
// pour garder une seule source de vérité.
export { UserStateService };
