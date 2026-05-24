/**
 * repositories/WordRepository.js
 * 
 * Accès aux données des mots (lecture seule, depuis words.json).
 * 
 * Cette couche EST la seule à savoir où vivent les mots ET sous quel
 * format brut. Le reste de l'app ne voit que le format normalisé.
 * 
 * Rôle :
 *   - Charger words.json au démarrage (ou un sous-corpus selon dataPath)
 *   - NORMALISER le format brut → format consommé par les modes
 *   - Fournir des méthodes de requête (getAll, getById, getByTheme...)
 *   - Fournir des méthodes spécialisées pour les files d'ordonnancement
 *     (Fréquence par phase/catégorie, Thèmes par ordre)
 *   - Cacher la source (fichier, plus tard API ou IndexedDB)
 * 
 * ─────────────────────────────────────────────────────────────────────
 * CONTRAT DE NORMALISATION
 * ─────────────────────────────────────────────────────────────────────
 * 
 * Format brut dans words.json / words.canonical.json :
 *   { id, word_en, translation_fr, nature, level, theme, sub_theme,
 *     note, prono, audio,
 *     ordo_file, bracket?, phase?, categorie_ordo?, ordre_dans_phase?,
 *     groupe_semantique?, ordre_theme?, ordre_dans_theme? }
 * 
 * Format normalisé (ce que getAll/getById retournent) :
 *   { id, en, fr, nature, level, theme, subTheme, note, prono, audio,
 *     ordoFile, bracket?, phase?, categorieOrdo?, ordreDansPhase?,
 *     groupeSemantique?, ordreTheme?, ordreDansTheme? }
 * 
 * Règles :
 *   - word_en           → en
 *   - translation_fr    → fr
 *   - sub_theme         → subTheme (camelCase JS)
 *   - ordo_file         → ordoFile ("freq" | "themes")
 *   - categorie_ordo    → categorieOrdo ("V" | "T" | null)
 *   - ordre_dans_phase  → ordreDansPhase (entier | null)
 *   - ordre_theme       → ordreTheme (entier | null)
 *   - ordre_dans_theme  → ordreDansTheme (entier | null)
 *   - groupe_semantique → groupeSemantique (chaîne | null)
 *   - note manquante    → ""    (jamais undefined)
 *   - prono manquant    → ""    (jamais undefined)
 *   - audio manquant    → null
 *   - les champs ordo non présents → null (pas undefined)
 * 
 * Les modes (TypingFrMode, FormsVerbMode, etc.) consomment ce format
 * et lui seul. Aucun mode ne doit jamais voir word_en ou translation_fr.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SOURCE DE DONNÉES
 * ─────────────────────────────────────────────────────────────────────
 *
 * Par défaut, le repo charge `./data/words.canonical.json` (corpus complet
 * enrichi avec phase/bracket/ordre, géré par l'Ordonnanceur). C'est le
 * seul fichier de données du dépôt.
 *
 * La source est paramétrable via le constructeur (`dataPath`) pour
 * faciliter les tests, mais en production le défaut convient.
 */


import { sample } from "../core/helpers.js";


export class WordRepository {
  /**
   * @param {Object} [options]
   * @param {string} [options.dataPath='./data/words.canonical.json'] - chemin du fichier à charger
   */
  constructor(options = {}) {
    this._dataPath = options.dataPath || './data/words.canonical.json';
    this._words = null;        // null = pas encore chargé
    this._byId = null;         // Map id → word, construite après chargement
    this._loadPromise = null;  // pour éviter les chargements multiples
  }

  /**
   * Permet de changer la source AVANT le premier load().
   * Utile pour basculer en boot/canonical sans réinstancier.
   * @param {string} path
   */
  setDataPath(path) {
    if (this._words || this._loadPromise) {
      throw new Error("WordRepository : setDataPath() doit être appelé AVANT load()");
    }
    this._dataPath = path;
  }

  /**
   * Normalise un mot brut (format words.json) vers le format consommé
   * par les modes. Cf. doc en tête de fichier pour le contrat complet.
   * 
   * @param {Object} raw - mot brut depuis words.json
   * @returns {Object} mot normalisé
   * @private
   */
  _normalize(raw) {
    return {
      // Champs de base (corpus historique)
      id: raw.id,
      en: raw.word_en,
      fr: raw.translation_fr,
      nature: raw.nature,
      level: raw.level,
      theme: raw.theme,
      subTheme: raw.sub_theme,
      note: raw.note || "",
      prono: raw.prono || "",
      audio: raw.audio || null,
      // Champs d'ordonnancement (corpus canonique enrichi)
      // Tous nullable : un mot peut n'avoir aucun de ces champs si
      // le repo charge un ancien sous-corpus non enrichi.
      ordoFile: raw.ordo_file || null,
      bracket: raw.bracket ?? null,
      phase: raw.phase || null,
      categorieOrdo: raw.categorie_ordo || null,
      ordreDansPhase: raw.ordre_dans_phase ?? null,
      groupeSemantique: raw.groupe_semantique || null,
      ordreTheme: raw.ordre_theme ?? null,
      ordreDansTheme: raw.ordre_dans_theme ?? null,
    };
  }

  /**
   * Charge les mots depuis le fichier JSON.
   * Idempotent : si déjà chargé, retourne immédiatement.
   * Sûr en cas d'appels concurrents (retourne la même promesse).
   * 
   * @returns {Promise<void>}
   */
  async load() {
    if (this._words) return;
    if (this._loadPromise) return this._loadPromise;

    this._loadPromise = (async () => {
      const response = await fetch(this._dataPath);
      if (!response.ok) {
        throw new Error(`Impossible de charger ${this._dataPath}: ${response.status}`);
      }
      const data = await response.json();
      // Normalisation : on transforme une seule fois le format brut vers
      // le format consommé par le reste de l'app. Plus jamais besoin de
      // remapper ailleurs.
      this._words = data.words.map(w => this._normalize(w));
      this._byId = new Map(this._words.map(w => [w.id, w]));
      console.log(`[WordRepository] ${this._words.length} mots chargés depuis ${this._dataPath} (et normalisés)`);
    })();

    return this._loadPromise;
  }

  /**
   * Vérifie que le repo est chargé. Lance une erreur sinon.
   * @private
   */
  _ensureLoaded() {
    if (!this._words) {
      throw new Error("WordRepository non chargé. Appelle await load() d'abord.");
    }
  }

  /**
   * @returns {Array<Object>} tous les mots
   */
  getAll() {
    this._ensureLoaded();
    return [...this._words];  // copie défensive
  }

  /**
   * @param {number} id 
   * @returns {Object|null} le mot, ou null si inconnu
   */
  getById(id) {
    this._ensureLoaded();
    return this._byId.get(id) || null;
  }

  /**
   * @param {Array<number>} ids 
   * @returns {Array<Object>} les mots correspondants (ignore les ids inconnus)
   */
  getByIds(ids) {
    this._ensureLoaded();
    return ids
      .map(id => this._byId.get(id))
      .filter(Boolean);
  }

  /**
   * @param {string} theme - nom du thème (ex: "Verbes")
   * @returns {Array<Object>} mots de ce thème
   */
  getByTheme(theme) {
    this._ensureLoaded();
    return this._words.filter(w => w.theme === theme);
  }

  // ─────────────────────────────────────────────────────────────────
  // FILES D'ORDONNANCEMENT
  // ─────────────────────────────────────────────────────────────────
  //
  // Méthodes spécialisées pour servir l'OrdonnanceurService qui compose
  // chaque jour les mots nouveaux. Voir synthese_ordonnancement.md.
  //
  // Note importante : ces méthodes renvoient les mots TRIÉS dans
  // l'ordre de pioche attendu. L'ordonnanceur n'a qu'à `.slice()` du
  // début pour ses N mots.

  /**
   * Renvoie les mots de la file Fréquence pour une phase donnée
   * (boot ou post_boot), triés par `(bracket, ordreDansPhase, id)`.
   *
   * Le tri par `bracket` croissant est primordial : il garantit que
   * l'enfant rencontre les mots les plus fondamentaux (bracket=1-2)
   * avant les plus avancés (bracket=4-5). Cf. architecture.md §8.4.
   *
   * Le tri secondaire par `ordreDansPhase` ordonne les mots d'un même
   * bracket. Le tri tertiaire par `id` est défensif face aux ajouts
   * manuels post-build qui pourraient créer des ex-aequo.
   *
   * @param {string} phase - "boot" ou "post_boot"
   * @param {string|null} [categorieOrdo] - filtre optionnel "V" ou "T"
   *   (pour patterns V-T-V ou T-T-T en post-boot)
   * @returns {Array<Object>} mots triés
   */
  getFrequenceByPhase(phase, categorieOrdo = null) {
    this._ensureLoaded();
    return this._words
      .filter(w =>
        w.ordoFile === 'freq' &&
        w.phase === phase &&
        (categorieOrdo === null || w.categorieOrdo === categorieOrdo)
      )
      .sort((a, b) =>
        (a.bracket ?? 9999) - (b.bracket ?? 9999) ||
        (a.ordreDansPhase ?? 9999) - (b.ordreDansPhase ?? 9999) ||
        a.id - b.id
      );
  }

  /**
   * Renvoie tous les mots de la file Thèmes, triés par `ordreTheme`
   * puis `ordreDansTheme` (puis id en tiebreaker).
   * C'est l'ordre global de pioche thématique sur tout le corpus.
   *
   * @returns {Array<Object>} mots triés
   */
  getThemesQueue() {
    this._ensureLoaded();
    return this._words
      .filter(w => w.ordoFile === 'themes')
      .sort((a, b) =>
        (a.ordreTheme ?? 9999) - (b.ordreTheme ?? 9999) ||
        (a.ordreDansTheme ?? 9999) - (b.ordreDansTheme ?? 9999) ||
        a.id - b.id
      );
  }

  /**
   * Renvoie les mots d'un thème précis, triés par `ordreDansTheme`.
   *
   * @param {number} ordreTheme - le numéro de thème (1 à 26)
   * @returns {Array<Object>} mots triés
   */
  getThemeByOrder(ordreTheme) {
    this._ensureLoaded();
    return this._words
      .filter(w => w.ordoFile === 'themes' && w.ordreTheme === ordreTheme)
      .sort((a, b) =>
        (a.ordreDansTheme ?? 9999) - (b.ordreDansTheme ?? 9999) ||
        a.id - b.id
      );
  }

  /**
   * @returns {Array<{order:number, name:string, count:number}>}
   *   Liste ordonnée des thèmes avec leur ordre et leur taille.
   */
  getThemesIndex() {
    this._ensureLoaded();
    const byOrder = new Map();
    for (const w of this._words) {
      if (w.ordoFile !== 'themes') continue;
      const order = w.ordreTheme;
      if (order == null) continue;
      if (!byOrder.has(order)) {
        byOrder.set(order, { order, name: w.theme, count: 0 });
      }
      byOrder.get(order).count++;
    }
    return [...byOrder.values()].sort((a, b) => a.order - b.order);
  }

  // ─────────────────────────────────────────────────────────────────

  /**
   * @returns {Array<string>} liste des thèmes disponibles
   */
  getAllThemes() {
    this._ensureLoaded();
    return [...new Set(this._words.map(w => w.theme))];
  }

  /**
   * @param {string} nature - n, v, adj...
   * @returns {Array<Object>} mots de cette nature
   */
  getByNature(nature) {
    this._ensureLoaded();
    return this._words.filter(w => w.nature === nature);
  }

  /**
   * Cherche des mots à utiliser comme distracteurs pour un mot donné.
   * Préfère le même thème + même nature, fallback élargi si pas assez.
   *
   * Retourne EXACTEMENT `count` distracteurs (ou moins si le corpus est
   * trop petit pour en fournir autant), tirés aléatoirement dans le pool
   * qualifié. Sans ce tirage, McqMode afficherait autant d'options qu'il
   * y a de mots qualifiés dans le pool — ce qui devient ingérable dès que
   * le corpus a 1500 mots et 40 noms par thème.
   *
   * FILTRE PAR LIBELLÉ EN
   * ─────────────────────
   * Le corpus contient des doublons sémantiques : `to like` apparaît
   * 3 fois (sens "aimer bien", "aimer (réseau social)", rappel dans un
   * autre thème), `to know` apparaît 2 fois, etc. Ces entrées ont des IDs
   * distincts mais le même libellé anglais. Sans filtre, elles
   * apparaîtraient comme distracteurs trompeurs dans le MCQ : l'enfant
   * verrait "to like" en prompt ET dans les options. On exclut donc tout
   * mot ayant le même `en` que la cible, en plus du filtre sur l'id.
   *
   * @param {Object} word - mot référence
   * @param {number} count - nombre de distracteurs souhaité
   * @returns {Array<Object>} distracteurs (mots différents du mot référence)
   */
  getDistractors(word, count = 3) {
    this._ensureLoaded();

    // Prédicat de base : ne pas reprendre la cible (ni un de ses doublons
    // sémantiques). On compare en lowercase trim() par sécurité.
    const targetEn = (word.en || "").trim().toLowerCase();
    const isDifferent = w =>
      w.id !== word.id
      && (w.en || "").trim().toLowerCase() !== targetEn;

    const sameThemeAndNature = this._words.filter(
      w => isDifferent(w) && w.theme === word.theme && w.nature === word.nature
    );
    if (sameThemeAndNature.length >= count) return sample(sameThemeAndNature, count);

    const sameNature = this._words.filter(
      w => isDifferent(w) && w.nature === word.nature
    );
    if (sameNature.length >= count) return sample(sameNature, count);

    return sample(this._words.filter(isDifferent), count);
  }
}


// Singleton exporté : il n'y a qu'un seul WordRepository dans l'app
export const wordRepo = new WordRepository();
