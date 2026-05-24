/**
 * Tests pour le sous-pas 10.3 : ExerciseService.buildQueueSeance(seance, wordRepo).
 *
 * Lancer : node services/test_pas10_3_buildQueueSeance.mjs
 *
 * Spec de référence : PAS-10-decisions.md §4 ("Ordre dans la séance").
 *
 * Cas couverts :
 *   - Séance normale : ordre ColdLesson → Lourds → Légers J+1
 *   - Séance normale : nouveaux seuls (pas de chutes, pas de J+1)
 *   - Séance normale : J+1 seuls (corpus terminé)
 *   - Séance normale : tout vide → queue vide
 *   - Séance révision : groupement par palier (j7/j30/j90) via word.etape
 *   - Séance révision : ordre des paliers j7 → j30 → j90
 *   - Séance révision : mots sans etape valide → warn + ignore
 *   - Type de séance inconnu → exception
 *   - Validation des entrées (seance, wordRepo)
 */

import { ExerciseService } from "./services/ExerciseService.js";

// ─── Mini framework ────────────────────────────────────────────────────
let passed = 0, failed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (err) { failed++; failures.push({ name, err }); console.log(`  ✗ ${name}\n      ${err.message}`); }
}
function group(name) { console.log(`\n${name}`); }
function eq(a, b, msg) {
  const aStr = JSON.stringify(a), bStr = JSON.stringify(b);
  if (aStr !== bStr) throw new Error(`${msg || "égalité"} — attendu ${bStr}, reçu ${aStr}`);
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion échouée"); }

// ─── Fixtures ──────────────────────────────────────────────────────────
// Mots lambda (pas de note, pas de verbe irrég, pas de pluriel)
const apple   = { id: 1, en: "apple",   fr: "pomme",   nature: "n" };
const banana  = { id: 2, en: "banana",  fr: "banane",  nature: "n" };
const cherry  = { id: 3, en: "cherry",  fr: "cerise",  nature: "n" };
const date    = { id: 4, en: "date",    fr: "datte",   nature: "n" };
const fig     = { id: 5, en: "fig",     fr: "figue",   nature: "n" };

// Mots avec etape (pour séance révision)
const oldJ7   = { id: 10, en: "house",  fr: "maison",  nature: "n", etape: "j7"  };
const oldJ30  = { id: 11, en: "tree",   fr: "arbre",   nature: "n", etape: "j30" };
const oldJ90  = { id: 12, en: "river",  fr: "rivière", nature: "n", etape: "j90" };

// Mock wordRepo minimal
function makeRepo(allWords) {
  const byId = new Map(allWords.map(w => [w.id, w]));
  return {
    getByIds(ids) {
      return ids.map(id => byId.get(id)).filter(Boolean);
    }
  };
}

const service = new ExerciseService();

// ─── Helpers ──────────────────────────────────────────────────────────
function modesIn(queue) {
  return queue.map(ex => ex.mode);
}
function wordsIn(queue, mode) {
  return queue.filter(ex => ex.mode === mode).map(ex => ex.word.en);
}
function firstIndexOfMode(queue, mode) {
  return queue.findIndex(ex => ex.mode === mode);
}
function lastIndexOfMode(queue, mode) {
  for (let i = queue.length - 1; i >= 0; i--) {
    if (queue[i].mode === mode) return i;
  }
  return -1;
}

// ─── 1. Séance normale, cas complet ────────────────────────────────────
group("1. Séance normale (cas complet : chutes + nouveaux + J+1)");

test("Structure : ColdLesson → Lourds → Légers J+1", () => {
  const seance = {
    type: "normale",
    coldLesson: [1, 2, 3, 4], // apple, banana (chutes) + cherry, date (nouveaux)
    chutes:   [1, 2],
    nouveaux: [3, 4],
    j1:       [5],            // fig
  };
  const repo = makeRepo([apple, banana, cherry, date, fig]);
  const q = service.buildQueueSeance(seance, repo);

  // ColdLesson en tête : 4 exos cold_lesson
  eq(q.slice(0, 4).map(e => e.mode), ["cold_lesson", "cold_lesson", "cold_lesson", "cold_lesson"]);
  // L'ordre des cold_lesson doit respecter seance.coldLesson (1,2,3,4)
  eq(q.slice(0, 4).map(e => e.word.en), ["apple", "banana", "cherry", "date"]);

  // Puis exos lourds (4 chutes+nouveaux × 4 modes = 16)
  const lourdSlice = q.slice(4, 4 + 16);
  const lourdModes = new Set(lourdSlice.map(e => e.mode));
  eq([...lourdModes].sort(), ["audio_to_text", "mcq", "text_to_audio", "typing_fr"]);

  // Puis exos légers j1 (1 mot × 2 modes audio = 2)
  const legerSlice = q.slice(4 + 16);
  eq(legerSlice.length, 2);
  eq(legerSlice.map(e => e.mode), ["audio_to_text", "text_to_audio"]);
  // Tous les exos légers portent sur fig
  for (const ex of legerSlice) {
    eq(ex.word.en, "fig");
  }
});

test("ColdLesson AVANT exos lourds AVANT exos légers (frontières strictes)", () => {
  const seance = {
    type: "normale",
    coldLesson: [1, 2, 3, 4],
    chutes:   [1, 2],
    nouveaux: [3, 4],
    j1:       [5],
  };
  const repo = makeRepo([apple, banana, cherry, date, fig]);
  const q = service.buildQueueSeance(seance, repo);

  const lastCold = lastIndexOfMode(q, "cold_lesson");
  const firstMcq = firstIndexOfMode(q, "mcq"); // dans buildQueueLourd, mcq est en tête
  const firstAudioLeger = q.length - 2; // les 2 exos j1 sont en fin

  assert(lastCold < firstMcq, "tous les cold_lesson avant le premier mcq");
  assert(firstMcq < firstAudioLeger, "exos lourds avant exos légers");
});

// ─── 2. Séance normale, cas partiels ───────────────────────────────────
group("2. Séance normale, cas partiels");

test("Nouveaux seuls (pas de chutes, pas de J+1) : pas de phase légère", () => {
  const seance = {
    type: "normale",
    coldLesson: [3, 4],
    chutes: [],
    nouveaux: [3, 4],
    j1: [],
  };
  const repo = makeRepo([cherry, date]);
  const q = service.buildQueueSeance(seance, repo);

  // 2 cold + (2 mots × 4 modes lourds) = 2 + 8 = 10
  eq(q.length, 10);
  eq(q.slice(0, 2).map(e => e.mode), ["cold_lesson", "cold_lesson"]);
});

test("J+1 seuls (corpus terminé : pas de chutes ni nouveaux)", () => {
  // Cas atypique mais possible : aucun nouveau dispo, aucune chute.
  // La ColdLesson est vide, on n'a que des J+1.
  const seance = {
    type: "normale",
    coldLesson: [],
    chutes: [],
    nouveaux: [],
    j1: [5],
  };
  const repo = makeRepo([fig]);
  const q = service.buildQueueSeance(seance, repo);

  // Aucun cold_lesson, aucun exo lourd, juste 2 légers
  eq(q.length, 2);
  eq(q.map(e => e.mode), ["audio_to_text", "text_to_audio"]);
});

test("Tout vide : queue vide", () => {
  const seance = {
    type: "normale",
    coldLesson: [],
    chutes: [],
    nouveaux: [],
    j1: [],
  };
  const repo = makeRepo([]);
  const q = service.buildQueueSeance(seance, repo);
  eq(q, []);
});

test("Champs optionnels manquants : pas de crash (chutes/nouveaux/j1 undefined)", () => {
  // Robustesse minimale : si SessionComposer renvoie une séance sans certains
  // champs (cas théorique), on ne plante pas.
  const seance = {
    type: "normale",
    coldLesson: [],
    // chutes, nouveaux, j1 absents
  };
  const repo = makeRepo([]);
  const q = service.buildQueueSeance(seance, repo);
  eq(q, []);
});

// ─── 3. Séance révision ────────────────────────────────────────────────
group("3. Séance révision (groupement par palier)");

test("Mots de 3 paliers : groupés et ordonnés j7 → j30 → j90", () => {
  const seance = {
    type: "revision",
    coldLesson: [],
    longs: [12, 10, 11], // ordre quelconque dans la séance
  };
  const repo = makeRepo([oldJ7, oldJ30, oldJ90]);
  const q = service.buildQueueSeance(seance, repo);

  // j7 : 4 modes (cold + mcq + audio + text) × 1 mot = 4
  // j30 : 3 modes (cold + audio + text) × 1 mot = 3
  // j90 : 4 modes × 1 mot = 4
  eq(q.length, 4 + 3 + 4);

  // Vérifier l'ordre : tous les exos sur "house" (j7) avant tous ceux sur "tree" (j30)
  // avant tous ceux sur "river" (j90)
  const housePositions = q.map((e, i) => e.word.en === "house" ? i : -1).filter(i => i >= 0);
  const treePositions  = q.map((e, i) => e.word.en === "tree"  ? i : -1).filter(i => i >= 0);
  const riverPositions = q.map((e, i) => e.word.en === "river" ? i : -1).filter(i => i >= 0);

  assert(Math.max(...housePositions) < Math.min(...treePositions),
    "house (j7) doit précéder tree (j30)");
  assert(Math.max(...treePositions) < Math.min(...riverPositions),
    "tree (j30) doit précéder river (j90)");
});

test("Plusieurs mots dans le même palier : groupés par mode dans le palier", () => {
  const oldJ7bis = { id: 13, en: "garden", fr: "jardin", nature: "n", etape: "j7" };
  const seance = {
    type: "revision",
    coldLesson: [],
    longs: [10, 13], // 2 mots en j7
  };
  const repo = makeRepo([oldJ7, oldJ7bis]);
  const q = service.buildQueueSeance(seance, repo);

  // j7 = 4 modes × 2 mots = 8 exos
  eq(q.length, 8);
  // Ordre interne : 2 cold_lesson, 2 mcq, 2 audio_to_text, 2 text_to_audio
  eq(q.slice(0, 2).map(e => e.mode), ["cold_lesson", "cold_lesson"]);
  eq(q.slice(2, 4).map(e => e.mode), ["mcq", "mcq"]);
  eq(q.slice(4, 6).map(e => e.mode), ["audio_to_text", "audio_to_text"]);
  eq(q.slice(6, 8).map(e => e.mode), ["text_to_audio", "text_to_audio"]);
});

test("Aucun mot long : queue vide", () => {
  const seance = { type: "revision", coldLesson: [], longs: [] };
  const repo = makeRepo([]);
  const q = service.buildQueueSeance(seance, repo);
  eq(q, []);
});

test("Mot sans etape valide : warn + ignoré (filet de sécurité)", () => {
  const orphan = { id: 99, en: "orphan", fr: "orphelin", nature: "n", etape: "j0" };
  const seance = {
    type: "revision",
    coldLesson: [],
    longs: [10, 99], // un j7 valide + un j0 invalide
  };
  const repo = makeRepo([oldJ7, orphan]);

  // Capturer console.warn
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (msg) => warnings.push(msg);

  try {
    const q = service.buildQueueSeance(seance, repo);
    // L'orphan ne doit pas apparaître
    const ens = q.map(e => e.word.en);
    assert(!ens.includes("orphan"), "orphan ne devrait pas être dans la queue");
    assert(ens.includes("house"), "house (j7 valide) doit être présent");
    // Un warning doit avoir été émis
    assert(warnings.length === 1, `attendu 1 warning, reçu ${warnings.length}`);
    assert(/orphan/.test(warnings[0]), "le warning doit mentionner le mot fautif");
  } finally {
    console.warn = originalWarn;
  }
});

// ─── 4. Erreurs et validation ──────────────────────────────────────────
group("4. Validation des entrées");

test("Type de séance inconnu : exception explicite", () => {
  const seance = { type: "rien", coldLesson: [] }; // ancien type supprimé
  const repo = makeRepo([]);
  let caught = null;
  try { service.buildQueueSeance(seance, repo); } catch (e) { caught = e; }
  assert(caught, "doit lever");
  assert(/Type de séance inconnu/.test(caught.message), `message inattendu : ${caught.message}`);
  assert(/rien/.test(caught.message), "le type fautif doit apparaître");
});

test("seance manquante : exception explicite", () => {
  const repo = makeRepo([]);
  let caught = null;
  try { service.buildQueueSeance(null, repo); } catch (e) { caught = e; }
  assert(caught, "doit lever");
  assert(/seance/i.test(caught.message));
});

test("wordRepo sans getByIds : exception explicite", () => {
  const seance = { type: "normale", coldLesson: [], chutes: [], nouveaux: [], j1: [] };
  let caught = null;
  try { service.buildQueueSeance(seance, {}); } catch (e) { caught = e; }
  assert(caught, "doit lever");
  assert(/getByIds/.test(caught.message));
});

// ─── 5. Verbe irrégulier en J+1 (intégration avec buildQueueLeger) ────
group("5. Intégration avec buildQueueLeger (verbes irréguliers en J+1)");

test("Verbe irrégulier en J+1 : forms_verb ajouté dans la phase légère", () => {
  const toGo = { id: 20, en: "to go", fr: "aller", nature: "v", note: "irrég: went/gone" };
  const seance = {
    type: "normale",
    coldLesson: [],
    chutes: [],
    nouveaux: [],
    j1: [20],
  };
  const repo = makeRepo([toGo]);
  const q = service.buildQueueSeance(seance, repo);

  // J+1 lambda = 2 exos. Avec verbe irrég = 2 + 1 forms_verb = 3
  eq(q.length, 3);
  const fv = q.find(e => e.mode === "forms_verb");
  assert(fv, "forms_verb doit être présent");
  eq(fv.forms, { base: "go", preterit: "went", participle: "gone" });
});

// ─── Bilan ─────────────────────────────────────────────────────────────
console.log("\n" + "═".repeat(60));
console.log(`Résultat : ${passed} OK · ${failed} échec(s)`);
if (failed > 0) {
  console.log("\nDétails des échecs :");
  for (const { name, err } of failures) {
    console.log(`  ✗ ${name}\n      ${err.message}`);
  }
  process.exit(1);
}
