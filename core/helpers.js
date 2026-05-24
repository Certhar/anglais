/**
 * core/helpers.js
 * 
 * Fonctions utilitaires pures, sans dépendance externe.
 * Toute fonction ici doit être :
 *   - sans état (pure)
 *   - testable indépendamment
 *   - réutilisable par n'importe quelle couche
 */


/**
 * Normalise une chaîne pour comparaison souple.
 *
 * Transformations appliquées :
 * - Mise en minuscules
 * - Suppression des espaces de bord
 * - Décomposition Unicode + suppression des diacritiques (accents)
 * - Remplacement des ligatures typographiques : œ → oe, æ → ae
 *   (ces caractères ne sont PAS décomposés par NFD car ce sont des
 *   ligatures, pas des combinaisons accentuées)
 * - Suppression des articles fr courants en début (le/la/les/un/une/...)
 *   et de l'infinitif anglais "to ", SAUF si la chaîne attendue commence
 *   elle-même par un article — auquel cas le strip est annulé en amont
 *   par compareAnswers (voir cette fonction).
 * - Suppression de la ponctuation
 * - Espaces multiples → un seul
 *
 * @param {string} str - chaîne à normaliser
 * @param {Object} [opts]
 * @param {boolean} [opts.stripArticles=true] - retirer les articles en début ?
 *   Passer `false` quand on veut imposer l'article (cas "a wife → une épouse" :
 *   l'enfant doit taper "une épouse", pas juste "épouse").
 * @returns {string} chaîne normalisée
 *
 * @example
 *   normalize("L'enfant") === normalize("enfant") === "enfant"
 *   normalize("À bientôt!") === "a bientot"
 *   normalize("sœur") === normalize("soeur") === "soeur"
 *   normalize("une épouse", {stripArticles: false}) === "une epouse"
 */
export function normalize(str, opts = {}) {
  const { stripArticles = true } = opts;
  if (!str) return "";
  let s = String(str)
    .toLowerCase()
    .trim()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (stripArticles) {
    s = s.replace(/^(le |la |les |l'|un |une |des |du |de la |de l'|to )/i, "");
  }
  return s
    .replace(/\s+/g, " ")
    .replace(/[.,;:!?()]/g, "");
}


/**
 * Regex des articles fr en début de chaîne, identique à celle utilisée dans
 * normalize(). Sert à détecter si une réponse attendue commence par un
 * article (logique : si le prof a mis "une épouse", il l'a fait exprès,
 * l'enfant doit taper l'article).
 */
const ARTICLE_FR_START = /^(le |la |les |l'|un |une |des |du |de la |de l')/i;


/**
 * Compare deux réponses après normalisation.
 * Pas de tolérance aux fautes (volontairement strict pour la pédagogie).
 *
 * Règle "article requis si présent dans l'attendue" :
 * si `expected` commence par un article fr (ex: "une épouse"), on désactive
 * le retrait des articles pour cette comparaison. Conséquence : l'enfant
 * DOIT taper l'article. C'est précisément l'enjeu pédagogique de "a wife
 * → une épouse" : sans cette règle, "épouse" serait accepté et l'élève
 * raterait le rôle grammatical de "a".
 *
 * Tolère les variations cosmétiques : casse, accents, ligatures œ/æ, espaces.
 *
 * @param {string} userInput - ce que l'utilisateur a tapé
 * @param {string} expected - la réponse attendue
 * @returns {boolean} true si les deux correspondent
 *
 * @example
 *   compareAnswers("être", "etre") === true            // accents
 *   compareAnswers("Brother", "brother") === true      // casse
 *   compareAnswers("soeur", "sœur") === true           // ligature
 *   compareAnswers("épouse", "une épouse") === false   // article requis
 *   compareAnswers("une épouse", "une épouse") === true
 *   compareAnswers("aimer", "to aimer") === true       // strip "to"
 */
export function compareAnswers(userInput, expected) {
  const expectedHasArticle = ARTICLE_FR_START.test((expected || "").trim().toLowerCase());
  const opts = { stripArticles: !expectedHasArticle };
  return normalize(userInput, opts) === normalize(expected, opts);
}


/**
 * Mélange un tableau aléatoirement (Fisher-Yates).
 * Retourne un nouveau tableau, ne modifie pas l'original.
 * 
 * @param {Array} arr - tableau à mélanger
 * @returns {Array} nouveau tableau mélangé
 */
export function shuffle(arr) {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}


/**
 * Tire N éléments aléatoires d'un tableau, sans remise.
 * Si le tableau a moins de N éléments, retourne tout le tableau mélangé.
 * 
 * @param {Array} arr - tableau source
 * @param {number} n - nombre d'éléments à tirer
 * @returns {Array} échantillon aléatoire
 */
export function sample(arr, n) {
  return shuffle(arr).slice(0, n);
}


/**
 * Génère un identifiant unique court (UUID v4 simplifié).
 * Pas cryptographiquement sûr, mais suffisant pour distinguer des entités.
 * 
 * @returns {string} ex: "k3p9-2f8a-9c1b"
 */
export function generateId() {
  const part = () => Math.random().toString(36).slice(2, 6);
  return `${part()}-${part()}-${part()}`;
}


/**
 * Convertit une couleur hexadécimale en composantes RGB.
 * Utile pour générer des couleurs dérivées.
 * 
 * @param {string} hex - couleur format "#RRGGBB" ou "RRGGBB"
 * @returns {{r: number, g: number, b: number}} composantes 0-255
 */
export function hexToRgb(hex) {
  const cleaned = hex.replace(/^#/, "");
  if (cleaned.length !== 6) throw new Error(`Invalid hex color: ${hex}`);
  return {
    r: parseInt(cleaned.slice(0, 2), 16),
    g: parseInt(cleaned.slice(2, 4), 16),
    b: parseInt(cleaned.slice(4, 6), 16),
  };
}


/**
 * Retourne la date du jour au format YYYY-MM-DD (UTC).
 * Utilisée pour la rotation quotidienne des erreurs.
 * 
 * @returns {string} ex: "2026-05-09"
 */
export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}


/**
 * Retourne true si on est sur un nouveau jour par rapport à une date stockée.
 * 
 * @param {string|null} lastDateISO - dernière date connue (YYYY-MM-DD) ou null
 * @returns {boolean}
 */
export function isNewDay(lastDateISO) {
  if (!lastDateISO) return false;
  return lastDateISO !== todayISO();
}


/**
 * Promesse qui se résout après N millisecondes.
 * Utile pour temporiser des animations.
 * 
 * @param {number} ms - millisecondes
 * @returns {Promise<void>}
 */
export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
