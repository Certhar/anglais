/**
 * services/RebrassageService.js
 *
 * Moteur du cycle de rebrassage J+0 / J+1 / J+7 / J+30 / J+90.
 * Voir architecture.md §7 pour la spec pédagogique complète.
 *
 * ─────────────────────────────────────────────────────────────────────
 * POSITIONNEMENT
 * ─────────────────────────────────────────────────────────────────────
 * Ce service gère le CYCLE TEMPOREL des mots : quand un mot doit
 * revenir, à quelle étape, et ce qu'il devient sur succès/chute.
 *
 * Il ne gère PAS :
 *   - le NOMBRE ou la NATURE des exercices par palier
 *     → c'est le boulot d'ExerciseService (à brancher plus tard)
 *   - la COMPOSITION de la séance du jour (chutes + nouveaux + J+1)
 *     → c'est le boulot de SessionComposerService (à venir)
 *   - le CRITÈRE de réussite (combien d'exos OK pour valider ?)
 *     → c'est l'appelant qui calcule, on reçoit juste un booléen
 *
 * Il s'appuie sur UserStateService pour persister la progression de
 * chaque mot. UserStateService est de la pure persistance, ce service
 * est de la pure logique métier.
 *
 * ─────────────────────────────────────────────────────────────────────
 * RÈGLES (cf. architecture.md §7.4)
 * ─────────────────────────────────────────────────────────────────────
 *
 *   [Introduction J+0]
 *     ├─ chute (partielle)  → reste j0, revient demain (dans le quota)
 *     └─ succès             → passe j1, prochain rebrassage = demain
 *
 *   [Rebrassage J+1 (2-3 exos)]
 *     ├─ chute              → RESET COMPLET : retour j0, demain
 *     └─ succès             → passe j7, prochain rebrassage = J+7
 *
 *   [Rebrassage J+7 / J+30]
 *     ├─ chute              → RESET COMPLET : retour j0, demain
 *     └─ succès             → palier suivant
 *
 *   [Rebrassage J+90]
 *     ├─ chute              → RESET COMPLET : retour j0, demain
 *     └─ succès             → mot ACQUIS, sort du cycle
 *
 * Cas particulier "tous exos ratés au J+0" : le service ne le voit pas,
 * c'est le composer qui décide de ne pas appeler introduireMot() dans
 * ce cas. Le mot n'a donc pas d'entrée de progression et sera reproposé
 * comme nouveau le lendemain.
 *
 * ─────────────────────────────────────────────────────────────────────
 * DEUX RÉGIMES DE DATES (cf. architecture.md §7.5)
 * ─────────────────────────────────────────────────────────────────────
 * Le système distingue deux régimes pour les rebrassages :
 *
 *   PALIERS COURTS (chute j0→demain, j0→j1)
 *     Mesurés en JOURS DE CONNEXION : si l'enfant ne se connecte pas
 *     un jour, la date stockée (lendemain calendaire brut) reste due
 *     jusqu'à la prochaine connexion (mécanisme `date ≤ aujourd'hui`
 *     dans getWordsDueOn). Pas d'alignement spécial. Si un j1 tombe
 *     un mercredi par hasard, il sera ignoré ce jour-là (le mercredi
 *     ne traite que les longs) et réapparaîtra le jeudi.
 *
 *   PALIERS LONGS (j1→j7, j7→j30, j30→j90)
 *     Mesurés en CALENDAIRE RÉEL (consolidation par le sommeil) ET
 *     ALIGNÉS SUR LE MERCREDI LE PLUS PROCHE à l'écriture.
 *
 *     INVARIANT : toute date `dateProchainRebrassage` d'un mot en
 *     étape ∈ {j7, j30, j90} est, par construction, un mercredi.
 *
 *     L'alignement est CRUCIAL : c'est lui qui garantit que les
 *     révisions longues ne tombent que le mercredi. Sans ça, le
 *     SessionComposer trouverait des longs dûs n'importe quel jour
 *     de la semaine et basculerait en révision longue en boucle.
 *
 *     Algorithme d'alignement (mercredi le plus proche) :
 *       1. Si la date naturelle (`dernierRebrassage + écart`) est
 *          déjà un mercredi → on garde.
 *       2. Sinon → on prend le mercredi à distance minimale (avant
 *          ou après, peu importe).
 *       3. En cas d'égalité parfaite (3 jours avant = 3 jours après,
 *          c'est-à-dire date naturelle = dimanche) → on choisit le
 *          mercredi SUIVANT (pas de raccourcissement gratuit).
 *
 *     Impact pédagogique : l'écart effectif entre paliers peut varier
 *     légèrement (un j7 peut être j+5 à j+9 réels). Acceptable.
 *
 * ─────────────────────────────────────────────────────────────────────
 * MERCREDI — pourquoi c'est ce jour-là
 * ─────────────────────────────────────────────────────────────────────
 * Le mercredi est le jour où l'auteur fait la grammaire en présentiel
 * avec ses enfants. C'est donc le bon moment pour faire le point sur
 * la consolidation long terme. Si la version publique permet un jour
 * de configurer le jour pivot par enfant, il faudra :
 *  (a) déplacer JOUR_PIVOT dans les préférences utilisateur
 *  (b) prévoir une migration ou recalcul des dates déjà écrites
 * Pour le MVP famille : mercredi en dur.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SAMEDI / DIMANCHE
 * ─────────────────────────────────────────────────────────────────────
 * Pas de traitement spécial. Jours normaux comme les autres.
 *
 * ─────────────────────────────────────────────────────────────────────
 * API
 * ─────────────────────────────────────────────────────────────────────
 *   rebrassage.introduireMot(childId, wordId, date, success)
 *   rebrassage.enregistrerRebrassage(childId, wordId, date, success)
 *
 *   rebrassage.getMotsDus(childId, date)            → {j1, lourds}
 *   rebrassage.hasDetteConsolidation(childId, date) → boolean
 *
 *   // Utilitaires purs (exposés pour les tests / debug)
 *   rebrassage.calculerDateProchainPalier(etapeActuelle, dateAujourdhui)
 *   rebrassage.alignerSurJourPivot(dateISO)
 */

import { userState } from "./UserStateService.js";


// ─── Constantes du moteur ──────────────────────────────────────────────

/**
 * Nombre de jours calendaires entre l'étape COURANTE et le prochain
 * rebrassage programmé. La clé est l'étape *qu'on vient de réussir*.
 *
 * Exemple : si on vient de réussir un j7, on passe à j30, le prochain
 * rebrassage est dans 30 - 7 = 23 jours... NON ! La règle de la bible
 * (§7.4) parle des paliers J+1/J+7/J+30/J+90 mesurés DEPUIS L'INTRODUCTION,
 * pas depuis le dernier rebrassage.
 *
 * MAIS : avec un reset complet en cas de chute, la date d'introduction
 * effective d'un mot peut changer. Donc on calcule le délai à partir
 * de la date du rebrassage qu'on vient de faire, en utilisant l'écart
 * naturel entre paliers consécutifs :
 *
 *   j0 → j1   : +1 jour
 *   j1 → j7   : +6 jours
 *   j7 → j30  : +23 jours
 *   j30 → j90 : +60 jours
 *   j90 → acquis : pas de prochain rebrassage
 *
 * Ces écarts reproduisent fidèlement les paliers calendaires depuis
 * l'introduction quand le cycle se déroule sans accroc. En cas de
 * retard (l'enfant n'a pas ouvert l'app au bon moment), le retard se
 * propage — c'est exactement ce qu'on veut : un palier raté décale les
 * suivants, sans recalculer depuis l'origine.
 */
const ECART_VERS_PROCHAIN_PALIER = {
  j0:  1,   // après un j0 réussi → j1 demain
  j1:  6,   // après un j1 réussi → j7
  j7:  23,  // après un j7 réussi → j30
  j30: 60,  // après un j30 réussi → j90
  j90: null, // après un j90 réussi → acquis, plus de date
};

/**
 * L'étape qui suit l'étape donnée (en cas de succès).
 * Une chute (n'importe quel palier) renvoie à j0, traité à part.
 */
const ETAPE_SUIVANTE = {
  j0:  "j1",
  j1:  "j7",
  j7:  "j30",
  j30: "j90",
  j90: "acquis",
};

/**
 * Jour de la semaine "pivot" sur lequel les paliers longs sont alignés.
 * Convention : 0=dim, 1=lun, ..., 6=sam (Date.getDay() de JS). 3 = mercredi.
 *
 * Pour rendre configurable par enfant un jour, remplacer l'usage dans
 * alignerSurJourPivot() par une lecture de préférences.
 */
const JOUR_PIVOT = 3; // mercredi

/**
 * Étapes considérées "lourdes" en rebrassage : si elles sont dues,
 * elles entrent dans le quota et déclenchent éventuellement une
 * journée consolidation. j0 (chute non rattrapée) est lourd aussi.
 * j1 est léger (hors quota).
 */
const ETAPES_LOURDES = new Set(["j0", "j7", "j30", "j90"]);

/**
 * Étapes "longues" : paliers de consolidation long terme. Leur date
 * `dateProchainRebrassage` est par construction un mercredi (cf.
 * invariant en tête de fichier). Sert à savoir s'il faut aligner
 * la date à l'écriture, et à filtrer la session de révision longue.
 */
const ETAPES_LONGUES = new Set(["j7", "j30", "j90"]);


// ─── Helpers de date ──────────────────────────────────────────────────

const ISO_DATE_RX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Ajoute N jours à une date ISO YYYY-MM-DD et renvoie la date résultante
 * au même format. Calcul en heure locale pour rester cohérent avec
 * UserStateService._today() (qui utilise aussi l'heure locale, pas UTC).
 *
 * @param {string} dateISO
 * @param {number} n
 * @returns {string}
 */
function addDaysISO(dateISO, n) {
  // Construction explicite year/month/day pour éviter les pièges UTC
  // de new Date("2026-05-17") qui interprète parfois en UTC.
  const [y, m, d] = dateISO.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Renvoie le jour de la semaine (0=dim, 6=sam) d'une date ISO.
 * @param {string} dateISO
 * @returns {number}
 */
function dayOfWeek(dateISO) {
  const [y, m, d] = dateISO.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}


// ─── Le service ───────────────────────────────────────────────────────

/**
 * Filet de sécurité : vérifie que si on écrit un mot en étape longue
 * (j7/j30/j90), sa dateProchainRebrassage est bien un mercredi.
 * Ne casse rien (juste un console.warn) : c'est un garde-fou contre
 * une modif future qui oublierait l'alignement.
 *
 * @param {string} etape
 * @param {string|null} dateProchain
 */
function _verifierInvariantMercredi(etape, dateProchain) {
  if (!ETAPES_LONGUES.has(etape)) return;
  if (!dateProchain) return;
  if (!ISO_DATE_RX.test(dateProchain)) return;
  if (dayOfWeek(dateProchain) !== JOUR_PIVOT) {
    console.warn(
      "[RebrassageService] invariant mercredi violé :",
      `étape=${etape}, date=${dateProchain} (jour ${dayOfWeek(dateProchain)})`,
    );
  }
}


class RebrassageService {

  /**
   * Aligne une date sur le mercredi (= JOUR_PIVOT) le plus proche.
   *
   * Algorithme :
   *  - Si la date est déjà un mercredi → renvoyée telle quelle.
   *  - Sinon, on calcule la distance au mercredi précédent et au
   *    mercredi suivant, et on renvoie celui à distance minimale.
   *  - En cas d'égalité parfaite (distance 3-3, c'est-à-dire date
   *    en entrée = dimanche), on renvoie le mercredi SUIVANT
   *    (pas de raccourcissement gratuit du palier).
   *
   * Cette fonction n'est utilisée QUE pour les paliers longs
   * (j7/j30/j90). Les paliers courts (chute→demain, j0→j1) sont
   * stockés en lendemain calendaire brut, sans alignement.
   *
   * @param {string} dateISO - YYYY-MM-DD
   * @returns {string} date alignée sur le mercredi le plus proche
   */
  alignerSurJourPivot(dateISO) {
    if (!ISO_DATE_RX.test(dateISO)) return dateISO;
    const dow = dayOfWeek(dateISO);
    if (dow === JOUR_PIVOT) return dateISO;

    // Distance "vers l'arrière" pour atteindre un mercredi.
    // Exemple : dim(0) → 4 jours en arrière, lun(1) → 5, mar(2) → 6,
    //           mer(3) → 0, jeu(4) → 1, ven(5) → 2, sam(6) → 3.
    const distBack = (dow - JOUR_PIVOT + 7) % 7;
    // Distance "vers l'avant" : complément à 7 quand on n'est pas déjà mer.
    const distForward = 7 - distBack;

    if (distBack < distForward) {
      return addDaysISO(dateISO, -distBack);
    }
    if (distForward < distBack) {
      return addDaysISO(dateISO, distForward);
    }
    // Égalité (distBack === distForward === 3) → on choisit le suivant.
    return addDaysISO(dateISO, distForward);
  }

  /**
   * Calcule la date du prochain rebrassage à partir de l'étape qu'on
   * vient de réussir et de la date d'aujourd'hui (date du rebrassage
   * qu'on vient de faire).
   *
   * Si l'étape n'a pas de suivante (j90 → acquis), renvoie null.
   *
   * Selon l'étape SUIVANTE :
   *   - étape suivante courte (j1) → lendemain brut, pas d'alignement
   *   - étape suivante longue (j7/j30/j90) → alignée sur le mercredi
   *     le plus proche (cf. invariant § doc en tête de fichier)
   *
   * @param {string} etapeActuelle - étape qu'on vient de valider (j0, j1, j7, j30, j90)
   * @param {string} dateAujourdhui - YYYY-MM-DD
   * @returns {string|null} prochaine date ou null si plus de palier
   */
  calculerDateProchainPalier(etapeActuelle, dateAujourdhui) {
    const ecart = ECART_VERS_PROCHAIN_PALIER[etapeActuelle];
    if (ecart === null || ecart === undefined) return null;
    if (!ISO_DATE_RX.test(dateAujourdhui)) return null;
    const naive = addDaysISO(dateAujourdhui, ecart);

    // Aligne sur le mercredi le plus proche UNIQUEMENT si l'étape
    // qu'on va atteindre est un palier long. Pour j0→j1, on stocke
    // le lendemain brut (régime court terme, jours de connexion).
    const etapeCible = ETAPE_SUIVANTE[etapeActuelle];
    if (ETAPES_LONGUES.has(etapeCible)) {
      return this.alignerSurJourPivot(naive);
    }
    return naive;
  }

  // ─── Cycle de vie ────────────────────────────────────────────────────

  /**
   * Première rencontre d'un mot. À appeler en fin de session J+0
   * pour les mots dont au moins UN exo a été fait (le composer décide ;
   * un mot totalement raté n'est pas introduit du tout).
   *
   * Spec §7.4 :
   *   - chute (success=false) → reste j0, revient demain
   *   - succès (success=true) → passe j1, prochain rebrassage = demain
   *
   * Dans les deux cas, dateIntroduction = aujourd'hui.
   *
   * @param {string} childId
   * @param {number} wordId
   * @param {string} dateISO - date du passage (typiquement aujourd'hui)
   * @param {boolean} success
   */
  introduireMot(childId, wordId, dateISO, success) {
    if (!ISO_DATE_RX.test(dateISO)) return;

    if (success) {
      // Succès au J+0 → passe j1, programmation au lendemain brut.
      // j1 est un palier COURT : pas d'alignement mercredi (régime
      // "jours de connexion"). Si demain est un mercredi, le j1 sera
      // simplement ignoré ce jour-là (séance révision longue) et
      // réapparaîtra le jeudi via le mécanisme date≤aujourd'hui.
      const prochainDate = addDaysISO(dateISO, 1);
      userState.setWordProgress(childId, wordId, {
        etape: "j1",
        dateIntroduction: dateISO,
        dateProchainRebrassage: prochainDate,
        historique: [{ date: dateISO, statut: "j0", resultat: "ok" }],
      });
    } else {
      // Chute partielle au J+0 → reste j0, revient demain brut
      // (palier court, pas d'alignement).
      const demain = addDaysISO(dateISO, 1);
      userState.setWordProgress(childId, wordId, {
        etape: "j0",
        dateIntroduction: dateISO,
        dateProchainRebrassage: demain,
        historique: [{ date: dateISO, statut: "j0", resultat: "chute" }],
      });
    }
  }

  /**
   * Enregistre l'issue d'un rebrassage (mot déjà introduit, à n'importe
   * quel palier j0 répété / j1 / j7 / j30 / j90).
   *
   * Spec §7.4 :
   *   - succès au palier P → passe au palier suivant, date programmée
   *     selon ECART_VERS_PROCHAIN_PALIER. j90 succès → "acquis".
   *   - chute (à n'importe quel palier ≥ j1) → RESET COMPLET : retour
   *     à j0, revient demain. La dateIntroduction est ÉCRASÉE avec
   *     la date d'aujourd'hui (le mot recommence sa vie).
   *
   * Si le mot n'a pas d'entrée existante (situation anormale), no-op
   * silencieux. C'est l'appelant qui doit garantir qu'il appelle
   * `introduireMot` au tout premier passage.
   *
   * @param {string} childId
   * @param {number} wordId
   * @param {string} dateISO
   * @param {boolean} success
   */
  enregistrerRebrassage(childId, wordId, dateISO, success) {
    if (!ISO_DATE_RX.test(dateISO)) return;
    const current = userState.getWordProgress(childId, wordId);
    if (!current) {
      // Pas d'entrée : situation anormale (appel sans introduction préalable).
      // On ne crée rien à l'aveugle, on log pour aider le debug.
      console.warn(
        "[RebrassageService] enregistrerRebrassage sans introduction préalable",
        { childId, wordId, dateISO }
      );
      return;
    }
    if (current.etape === "acquis") {
      // Mot déjà sorti du cycle : ne rien faire. (Le composer ne devrait
      // pas le proposer en rebrassage, mais on ne casse rien si ça arrive.)
      return;
    }

    if (success) {
      const etapeSuivante = ETAPE_SUIVANTE[current.etape];
      const prochainDate = this.calculerDateProchainPalier(current.etape, dateISO);

      _verifierInvariantMercredi(etapeSuivante, prochainDate);

      userState.setWordProgress(childId, wordId, {
        etape: etapeSuivante,
        dateIntroduction: current.dateIntroduction, // inchangée
        dateProchainRebrassage: prochainDate, // null si on atteint "acquis"
        historique: [
          ...current.historique,
          { date: dateISO, statut: current.etape, resultat: "ok" },
        ],
      });
    } else {
      // Chute en rebrassage → reset complet. Le mot recommence à zéro,
      // sa nouvelle dateIntroduction est aujourd'hui. Lendemain brut
      // (palier court, pas d'alignement).
      const demain = addDaysISO(dateISO, 1);
      userState.setWordProgress(childId, wordId, {
        etape: "j0",
        dateIntroduction: dateISO,
        dateProchainRebrassage: demain,
        historique: [
          ...current.historique,
          { date: dateISO, statut: current.etape, resultat: "chute" },
        ],
      });
    }
  }

  // ─── Lectures pour le composer ──────────────────────────────────────

  /**
   * Renvoie les mots dus à la date donnée, séparés en deux piles :
   *   - j1     : mots à l'étape j1 dus à cette date (hors quota, légers)
   *   - lourds : mots à toute autre étape ≥ due à cette date (dans quota,
   *              set complet d'exos chacun)
   *
   * "Dû à cette date" = `dateProchainRebrassage <= date`. Cela inclut
   * naturellement les retards (un mot dû il y a 3 jours reste dans la
   * pile tant qu'il n'a pas été traité).
   *
   * Les mots "acquis" sont exclus (ils n'ont pas de date de rebrassage).
   *
   * @param {string} childId
   * @param {string} dateISO
   * @returns {{j1: number[], lourds: number[]}}
   */
  getMotsDus(childId, dateISO) {
    if (!ISO_DATE_RX.test(dateISO)) return { j1: [], lourds: [] };

    const tousDus = userState.getWordsDueOn(childId, dateISO);
    const j1 = [];
    const lourds = [];

    for (const wordId of tousDus) {
      const entry = userState.getWordProgress(childId, wordId);
      if (!entry) continue; // race protect, pas censé arriver
      if (entry.etape === "j1") {
        j1.push(wordId);
      } else if (ETAPES_LOURDES.has(entry.etape)) {
        lourds.push(wordId);
      }
      // Note : "acquis" est déjà filtré par UserStateService.getWordsDueOn
    }

    return { j1, lourds };
  }

  /**
   * Y a-t-il des rebrassages j7/j30/j90 dus à cette date ? Si oui, le
   * composer basculera en journée consolidation (pas de nouveaux mots).
   *
   * On exclut volontairement j0 et j1 :
   *  - j0 (chute) est attendu et géré dans le quota normal
   *  - j1 est léger et ne justifie pas une journée consolidation
   *
   * @param {string} childId
   * @param {string} dateISO
   * @returns {boolean}
   */
  hasDetteConsolidation(childId, dateISO) {
    if (!ISO_DATE_RX.test(dateISO)) return false;
    const tousDus = userState.getWordsDueOn(childId, dateISO);
    for (const wordId of tousDus) {
      const entry = userState.getWordProgress(childId, wordId);
      if (!entry) continue;
      if (entry.etape === "j7" || entry.etape === "j30" || entry.etape === "j90") {
        return true;
      }
    }
    return false;
  }
}


// Singleton exporté — usage normal de l'app
export const rebrassage = new RebrassageService();

// Classe exportée pour les tests (permet de créer une instance isolée)
export { RebrassageService };
