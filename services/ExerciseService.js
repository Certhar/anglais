/**
 * services/ExerciseService.js
 *
 * Génère la queue d'exercices pour une session.
 *
 * Règles :
 *   1. Phase 1 : exercices classiques dans l'ordre pédagogique
 *      (MCQ → typing FR → audio→texte → texte→audio).
 *      Tous les mots passent en MCQ d'abord, puis tous en typing FR, etc.
 *
 *   2. Phase 2 : exercices spécifiques (verbes irréguliers, pluriels notés)
 *      en bonus de fin, mélangés entre eux.
 *
 * Détection des particularités via le champ `note` :
 *   - "irrég: base/prétérit/participe" → verbe irrégulier 3 formes
 *   - "irrég: prétérit/participe"      → verbe irrégulier 2 formes,
 *     la base étant déduite de word.en (en retirant un éventuel "to ").
 *     C'est le format majoritaire du corpus 1500 mots (63/64 verbes).
 *   - "pluriel: xxx" ou "irrég pluriel: xxx" → pluriel notable
 *   - "pluriel irrég de xxx" → ligne du pluriel lui-même, on n'en génère pas
 *
 * Note sur les idiomes (décision 21 mai 2026) : les expressions
 * idiomatiques (nature `idiom`) suivent le même traitement que les
 * autres mots, y compris typing_fr. La traduction française attendue
 * est l'équivalent idiomatique ("il pleut des seaux") et non la
 * traduction littérale. L'enfant intériorise vite la convention.
 */

import { shuffle } from '../core/helpers.js';


// Ordre pédagogique des modes classiques (du plus facile au plus dur)
export const MODE_ORDER = [
  "mcq",
  "typing_fr",
  "audio_to_text",
  "text_to_audio",
];


/**
 * Modes à présenter par palier de rebrassage léger.
 *
 * Encode strictement le tableau §1 de PAS-10-decisions.md.
 * L'ordre des modes dans chaque tableau est l'ordre de présentation
 * à l'enfant (phase par mode, mots mélangés à l'intérieur).
 *
 * Notes pédagogiques (cf. §2 de PAS-10-decisions.md) :
 *   - `cold_lesson` présent en j7/j30/j90 (l'enfant ré-introduit le mot
 *     qu'il n'a pas vu depuis longtemps) mais PAS en j1 (§2.4).
 *   - `mcq` à j7 et j90 seulement (§2.1 — l'écrit s'allège).
 *   - `typing_fr` jamais ici (uniquement au J+0, cf. §2.2).
 *   - `audio_to_text` et `text_to_audio` à tous les paliers (§2.1 — l'oral
 *     est partout).
 *   - `forms_plural` jamais ici (uniquement au J+0, cf. §2.5).
 *   - `forms_verb` ajouté en bonus de fin pour les verbes irréguliers
 *     à tous les paliers (§2.6) — géré séparément, pas dans cette table.
 */
export const MODES_PAR_PALIER = {
  j1:  ["audio_to_text", "text_to_audio"],
  j7:  ["cold_lesson", "mcq", "audio_to_text", "text_to_audio"],
  j30: ["cold_lesson", "audio_to_text", "text_to_audio"],
  j90: ["cold_lesson", "mcq", "audio_to_text", "text_to_audio"],
};


export class ExerciseService {
  /**
   * Construit la queue d'exercices "lourde" pour une liste de mots.
   *
   * Une queue lourde contient le set COMPLET d'exercices (4 modes
   * classiques dans l'ordre pédagogique + exercices forms en bonus
   * de fin). C'est ce qu'on utilise pour :
   *   - Les NOUVEAUX mots (J+0 inaugural)
   *   - Les CHUTES (mots ratés la veille, qui reviennent en J+0)
   *
   * Pour les rebrassages légers (J+1, J+7, J+30, J+90), il faudra
   * utiliser `buildQueueLeger(words, palier)` — voir sous-pas 10.2.
   *
   * @param {Array<Object>} words - mots à exercer
   * @returns {Array<Object>} queue d'exercices, chacun de la forme :
   *   { word, mode, ...options }
   */
  buildQueueLourd(words) {
    const queue = [];

    // Phase 1 : modes classiques, tous les mots par mode
    for (const mode of MODE_ORDER) {
      const wordsForMode = shuffle(words);
      for (const word of wordsForMode) {
        queue.push({ word, mode });
      }
    }

    // Phase 2 : exercices spécifiques (verbes irréguliers + pluriels)
    const formsExercises = this._buildFormsExercises(words);
    queue.push(...shuffle(formsExercises));

    return queue;
  }

  /**
   * Construit la queue d'exercices "légère" pour un palier de rebrassage donné.
   *
   * À utiliser pour les rebrassages des paliers J+1, J+7, J+30, J+90.
   * Le contenu suit strictement le tableau §1 de PAS-10-decisions.md
   * (via la constante MODES_PAR_PALIER).
   *
   * Organisation interne (cohérente avec buildQueueLourd) :
   *   1. Phase classique : pour chaque mode du palier, dans l'ordre du tableau,
   *      on présente TOUS les mots (mélangés entre eux à l'intérieur de la phase).
   *   2. Phase forms : les verbes irréguliers reçoivent un exercice `forms_verb`
   *      supplémentaire, mélangés entre eux en bonus de fin.
   *      (Pas de `forms_plural` : c'est uniquement à J+0, cf. §2.5.)
   *
   * @param {Array<Object>} words - mots à exercer
   * @param {"j1"|"j7"|"j30"|"j90"} palier - palier de rebrassage
   * @returns {Array<Object>} queue d'exercices, chacun de la forme :
   *   { word, mode, ...options }
   * @throws {Error} si le palier n'est pas valide
   */
  buildQueueLeger(words, palier) {
    const modes = MODES_PAR_PALIER[palier];
    if (!modes) {
      throw new Error(
        `[ExerciseService] Palier inconnu pour buildQueueLeger : "${palier}". `
        + `Attendu : ${Object.keys(MODES_PAR_PALIER).join(", ")}.`
      );
    }

    const queue = [];

    // Phase 1 : modes du palier, tous les mots par mode (dans l'ordre du tableau)
    for (const mode of modes) {
      const wordsForMode = shuffle(words);
      for (const word of wordsForMode) {
        queue.push({ word, mode });
      }
    }

    // Phase 2 : forms_verb pour les verbes irréguliers, en bonus de fin
    // (forms_plural EXCLU explicitement : uniquement à J+0, cf. §2.5)
    const formsVerbExercises = [];
    for (const word of words) {
      const verbForms = this._extractVerbForms(word);
      if (verbForms) {
        formsVerbExercises.push({
          word,
          mode: "forms_verb",
          forms: verbForms,
        });
      }
    }
    queue.push(...shuffle(formsVerbExercises));

    return queue;
  }

  /**
   * Assemble la queue complète d'exercices d'une séance entière.
   *
   * Orchestre `buildQueueLourd` et `buildQueueLeger` selon le §4 de
   * PAS-10-decisions.md, en deux variantes selon `seance.type`.
   *
   * ─── Séance "normale" ───
   * Composition :
   *   1. ColdLesson pour chutes + nouveaux (ordre fourni par seance.coldLesson)
   *   2. Exos lourds : chutes ∪ nouveaux, traités en un seul appel
   *      buildQueueLourd (entrelacement par mode — détail technique, cf. note ci-dessous)
   *   3. Exos légers : J+1 dûs, palier "j1"
   *
   * ─── Séance "revision" ───
   * Composition :
   *   1. Pas de ColdLesson collective (seance.coldLesson est vide)
   *   2. Exos légers pour les mots longs, **groupés par palier** (j7, j30, j90)
   *      pour appeler buildQueueLeger une fois par palier.
   *
   * ─── Notes ───
   * - Pour la séance normale, la priorité "chutes avant nouveaux" est garantie
   *   par la ColdLesson (qui les présente dans cet ordre). Une fois la
   *   ColdLesson passée, l'entrelacement par mode des exos lourds est
   *   pédagogiquement neutre — l'enfant a déjà rencontré ses chutes.
   * - En séance révision, l'ordre des paliers dans la queue est j7 → j30 → j90
   *   (ordre croissant de difficulté de rappel). Choix interne, non spécifié
   *   par la doc — à confirmer si Gauthier le souhaite.
   *
   * ─── Format d'entrée attendu ───
   * `seance` = sortie de `SessionComposerService.composerSeance()` :
   *   {
   *     type: "normale",
   *     coldLesson: number[],  // chutes + nouveaux dans cet ordre
   *     chutes:     number[],
   *     nouveaux:   number[],
   *     j1:         number[]
   *   }
   *   ou
   *   {
   *     type: "revision",
   *     coldLesson: [],
   *     longs:      number[]   // tous les mots j7/30/90 dûs, mélangés
   *   }
   *
   * Pour la séance révision, on a besoin de connaître **le palier** de chaque
   * mot. Pour cela on lit `word.etape` (alimenté par RebrassageService).
   *
   * @param {Object} seance - séance composée par SessionComposerService
   * @param {Object} wordRepo - repository de mots (doit exposer `getByIds(ids)`)
   * @returns {Array<Object>} queue d'exos plate, prête à être consommée par
   *   ExerciseScreen. Chaque exo : { word, mode, ...options }
   * @throws {Error} si seance.type est inconnu
   */
  buildQueueSeance(seance, wordRepo) {
    if (!seance || typeof seance !== "object") {
      throw new Error(`[ExerciseService] seance manquante ou invalide.`);
    }
    if (!wordRepo || typeof wordRepo.getByIds !== "function") {
      throw new Error(`[ExerciseService] wordRepo doit exposer getByIds(ids).`);
    }

    if (seance.type === "normale") {
      return this._buildQueueSeanceNormale(seance, wordRepo);
    }
    if (seance.type === "revision") {
      return this._buildQueueSeanceRevision(seance, wordRepo);
    }

    throw new Error(
      `[ExerciseService] Type de séance inconnu : "${seance.type}". `
      + `Attendu : "normale" ou "revision".`
    );
  }

  /**
   * @private
   */
  _buildQueueSeanceNormale(seance, wordRepo) {
    const queue = [];

    // 1. ColdLesson (chutes + nouveaux dans l'ordre fourni)
    const coldWords = wordRepo.getByIds(seance.coldLesson || []);
    for (const word of coldWords) {
      queue.push({ word, mode: "cold_lesson" });
    }

    // 2. Exos lourds : chutes ∪ nouveaux, un seul appel buildQueueLourd.
    //    Justification du tout-en-un : cf. JSDoc de buildQueueSeance, §"Notes".
    const lourdIds = [...(seance.chutes || []), ...(seance.nouveaux || [])];
    if (lourdIds.length > 0) {
      const lourdWords = wordRepo.getByIds(lourdIds);
      queue.push(...this.buildQueueLourd(lourdWords));
    } else if (
      (seance.coldLesson || []).length > 0
      && (seance.j1 || []).length === 0
    ) {
      // Mode "relecture" (Anglais 25, cf. BIBLE §11.4) :
      // séance du jour déjà terminée (chutes=[], nouveaux=[], j1=[]) mais
      // coldLesson non vide → ce sont les acquiredToday présentés pour
      // permettre à l'enfant de re-vérifier une hésitation. On régénère
      // les exos lourds sur ces mêmes mots. Le recorder étant idempotent
      // sur acquiredToday, aucun effet pédagogique.
      const releuWords = wordRepo.getByIds(seance.coldLesson);
      queue.push(...this.buildQueueLourd(releuWords));
    }

    // 3. Exos légers : J+1 dûs
    const j1Ids = seance.j1 || [];
    if (j1Ids.length > 0) {
      const j1Words = wordRepo.getByIds(j1Ids);
      queue.push(...this.buildQueueLeger(j1Words, "j1"));
    }

    return queue;
  }

  /**
   * @private
   */
  _buildQueueSeanceRevision(seance, wordRepo) {
    const queue = [];

    const longsIds = seance.longs || [];
    if (longsIds.length === 0) return queue;

    const longsWords = wordRepo.getByIds(longsIds);

    // Grouper par palier via word.etape (alimenté par RebrassageService).
    // Mots sans etape valide → ignorés avec un warn (filet de sécurité ;
    // par construction tout mot dans seance.longs doit avoir une etape
    // ∈ {j7, j30, j90}).
    const buckets = { j7: [], j30: [], j90: [] };
    for (const word of longsWords) {
      const etape = word.etape;
      if (buckets[etape]) {
        buckets[etape].push(word);
      } else {
        console.warn(
          `[ExerciseService] Mot "${word.en}" dans seance.longs sans etape `
          + `j7/j30/j90 (etape="${etape}"). Ignoré dans la queue.`
        );
      }
    }

    // Ordre interne : j7 → j30 → j90 (choix arbitraire, voir JSDoc)
    for (const palier of ["j7", "j30", "j90"]) {
      if (buckets[palier].length > 0) {
        queue.push(...this.buildQueueLeger(buckets[palier], palier));
      }
    }

    return queue;
  }

  /**
   * Construit les exercices "forms" (verbes 3 formes + pluriels notés).
   * @private
   */
  _buildFormsExercises(words) {
    const exercises = [];

    for (const word of words) {
      // Verbe irrégulier
      const verbForms = this._extractVerbForms(word);
      if (verbForms) {
        exercises.push({
          word,
          mode: "forms_verb",
          forms: verbForms,
        });
      }

      // Pluriel notable
      const pluralForm = this._extractPluralForm(word);
      if (pluralForm) {
        exercises.push({
          word,
          mode: "forms_plural",
          expected: pluralForm,
        });
      }
    }

    return exercises;
  }

  /**
   * Extrait les 3 formes d'un verbe irrégulier depuis sa note.
   *
   * Deux formats acceptés :
   *   - "irrég: base/prétérit/participe" (3 formes explicites)
   *     ex: "irrég: be/was/been" → { base: "be", preterit: "was", participle: "been" }
   *
   *   - "irrég: prétérit/participe" (2 formes, format majoritaire du corpus)
   *     La base est déduite de word.en en retirant un éventuel "to " initial.
   *     ex: word.en = "to go", note = "irrég: went/gone"
   *         → { base: "go", preterit: "went", participle: "gone" }
   *
   * Robustesse : si word.en ne commence pas par "to " (cas atypique), on
   * utilise word.en tel quel comme base. Pas d'ajout proactif de "to "
   * (ce serait dangereux pour un imperatif ou une expression verbale).
   *
   * La note peut contenir du texte additionnel après les formes
   * (ex: "irrég: had/had - aussi auxiliaire du perfect"). On extrait juste
   * la séquence de mots séparés par "/" qui suit "irrég:".
   *
   * @param {Object} word
   * @returns {{base, preterit, participle}|null}
   * @private
   */
  _extractVerbForms(word) {
    if (word.nature !== "v" || !word.note) return null;
    const m = word.note.match(/irr[ée]g\s*:\s*([\w\/]+)/i);
    if (!m) return null;
    const parts = m[1].split("/").map(s => s.trim()).filter(Boolean);

    if (parts.length === 3) {
      return {
        base: parts[0],
        preterit: parts[1],
        participle: parts[2],
      };
    }

    if (parts.length === 2) {
      // Format 2 formes : base déduite de word.en, "to " retiré si présent.
      const en = word.en || "";
      const base = en.toLowerCase().startsWith("to ")
        ? en.slice(3)
        : en;
      return {
        base: base.trim(),
        preterit: parts[0],
        participle: parts[1],
      };
    }

    console.warn(
      `[ExerciseService] Format note inattendu pour "${word.en}" `
      + `(${parts.length} formes au lieu de 2 ou 3) : ${word.note}`
    );
    return null;
  }

  /**
   * Extrait la forme plurielle depuis la note.
   * Ne génère PAS d'exercice si la note dit "pluriel irrég de X"
   * (ça veut dire que la ligne est elle-même un pluriel).
   * 
   * @param {Object} word 
   * @returns {string|null}
   * @private
   */
  _extractPluralForm(word) {
    if (!word.note) return null;
    // Exclure les lignes qui SONT le pluriel (children, teeth, etc.)
    if (/pluriel\s+irr[ée]g\s+de\s+/i.test(word.note)) return null;
    const m = word.note.match(/pluriel.*?:\s*(\w+)/i);
    if (!m) return null;
    return m[1].trim();
  }

  /**
   * Compte le nombre d'exercices par mode dans une queue.
   * Utile pour debug et affichage.
   * 
   * @param {Array<Object>} queue 
   * @returns {Object} { mcq: 8, typing_fr: 8, ... }
   */
  countByMode(queue) {
    const counts = {};
    for (const ex of queue) {
      counts[ex.mode] = (counts[ex.mode] || 0) + 1;
    }
    return counts;
  }
}


// Singleton exporté
export const exerciseService = new ExerciseService();
