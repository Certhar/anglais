/**
 * Tests pour le sous-pas 10.2 : ExerciseService.buildQueueLeger(words, palier).
 *
 * Lancer : node services/test_pas10_2_buildQueueLeger.mjs
 *
 * Spec de référence : PAS-10-decisions.md §1 (tableau des exos par palier).
 *
 * Cas couverts :
 *   - 4 paliers (j1, j7, j30, j90) sur mots lambda → composition exacte
 *   - Verbes irréguliers : forms_verb ajouté à tous les paliers
 *   - Pluriels notables : PAS de forms_plural (uniquement au J+0)
 *   - Idiomes : traités comme des mots lambda
 *   - Palier inconnu : exception explicite
 *   - Tableau de mots vide
 *   - Ordre interne : phase par mode, mots à l'intérieur de chaque phase
 */

import { ExerciseService, MODES_PAR_PALIER } from "./services/ExerciseService.js";

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
// Mots "lambda" : pas de note particulière, donc ni verbe irrégulier ni pluriel.
const apple   = { en: "apple",   fr: "pomme",   nature: "n" };
const banana  = { en: "banana",  fr: "banane",  nature: "n" };
const cherry  = { en: "cherry",  fr: "cerise",  nature: "n" };

// Verbe irrégulier, format 2 formes (majoritaire du corpus).
const toGo    = { en: "to go", fr: "aller", nature: "v", note: "irrég: went/gone" };

// Pluriel notable (singulier porteur de la note).
const wife    = { en: "wife", fr: "épouse", nature: "n", note: "pluriel: wives" };

// Idiome.
const raining = { en: "it's raining cats and dogs", fr: "il pleut des seaux", nature: "idiom" };

const service = new ExerciseService();

// ─── Helpers d'inspection ──────────────────────────────────────────────
function modeSequence(queue) {
  // Renvoie la séquence des modes dans l'ordre de la queue.
  return queue.map(ex => ex.mode);
}
function countByMode(queue) {
  const c = {};
  for (const ex of queue) c[ex.mode] = (c[ex.mode] || 0) + 1;
  return c;
}
function wordsForMode(queue, mode) {
  return queue.filter(ex => ex.mode === mode).map(ex => ex.word.en);
}

// ─── 1. Composition exacte par palier sur mots lambda ──────────────────
group("1. Composition par palier (mots lambda, sans particularité)");

test("j1 : 2 modes × 3 mots = 6 exos (audio_to_text + text_to_audio)", () => {
  const q = service.buildQueueLeger([apple, banana, cherry], "j1");
  eq(q.length, 6, "longueur queue");
  eq(countByMode(q), { audio_to_text: 3, text_to_audio: 3 }, "comptage par mode");
});

test("j7 : 4 modes × 3 mots = 12 exos (cold + mcq + audio + text)", () => {
  const q = service.buildQueueLeger([apple, banana, cherry], "j7");
  eq(q.length, 12);
  eq(countByMode(q), { cold_lesson: 3, mcq: 3, audio_to_text: 3, text_to_audio: 3 });
});

test("j30 : 3 modes × 3 mots = 9 exos (cold + audio + text, PAS de mcq)", () => {
  const q = service.buildQueueLeger([apple, banana, cherry], "j30");
  eq(q.length, 9);
  eq(countByMode(q), { cold_lesson: 3, audio_to_text: 3, text_to_audio: 3 });
});

test("j90 : 4 modes × 3 mots = 12 exos (cold + mcq + audio + text)", () => {
  const q = service.buildQueueLeger([apple, banana, cherry], "j90");
  eq(q.length, 12);
  eq(countByMode(q), { cold_lesson: 3, mcq: 3, audio_to_text: 3, text_to_audio: 3 });
});

// ─── 2. Modes interdits dans le léger ──────────────────────────────────
group("2. Modes interdits dans buildQueueLeger");

test("typing_fr n'apparaît JAMAIS (uniquement au J+0, cf. §2.2)", () => {
  for (const palier of ["j1", "j7", "j30", "j90"]) {
    const q = service.buildQueueLeger([apple, banana, cherry], palier);
    const hasTypingFr = q.some(ex => ex.mode === "typing_fr");
    assert(!hasTypingFr, `typing_fr trouvé en ${palier}`);
  }
});

test("cold_lesson absent en j1 (l'enfant doit se souvenir, pas relire — §2.4)", () => {
  const q = service.buildQueueLeger([apple, banana, cherry], "j1");
  const hasCold = q.some(ex => ex.mode === "cold_lesson");
  assert(!hasCold, "cold_lesson trouvé en j1");
});

test("mcq absent en j30 (cf. tableau §1)", () => {
  const q = service.buildQueueLeger([apple, banana, cherry], "j30");
  const hasMcq = q.some(ex => ex.mode === "mcq");
  assert(!hasMcq, "mcq trouvé en j30");
});

// ─── 3. Verbes irréguliers : forms_verb à tous les paliers ─────────────
group("3. Verbes irréguliers (forms_verb partout, cf. §2.6)");

test("j1 avec verbe irrégulier : ajoute forms_verb en bonus", () => {
  const q = service.buildQueueLeger([toGo, apple], "j1");
  // 2 mots × 2 modes audio = 4 exos classiques + 1 forms_verb (toGo) = 5
  eq(q.length, 5);
  eq(countByMode(q), { audio_to_text: 2, text_to_audio: 2, forms_verb: 1 });
});

test("j7 avec verbe irrégulier : ajoute forms_verb en bonus", () => {
  const q = service.buildQueueLeger([toGo, apple], "j7");
  // 2 mots × 4 modes = 8 + 1 forms_verb = 9
  eq(q.length, 9);
  eq(countByMode(q), { cold_lesson: 2, mcq: 2, audio_to_text: 2, text_to_audio: 2, forms_verb: 1 });
});

test("j30 avec verbe irrégulier : ajoute forms_verb en bonus", () => {
  const q = service.buildQueueLeger([toGo], "j30");
  // 1 mot × 3 modes = 3 + 1 forms_verb = 4
  eq(q.length, 4);
  eq(countByMode(q), { cold_lesson: 1, audio_to_text: 1, text_to_audio: 1, forms_verb: 1 });
});

test("j90 avec verbe irrégulier : ajoute forms_verb en bonus", () => {
  const q = service.buildQueueLeger([toGo], "j90");
  eq(q.length, 5);
  eq(countByMode(q), { cold_lesson: 1, mcq: 1, audio_to_text: 1, text_to_audio: 1, forms_verb: 1 });
});

test("forms_verb porte les bonnes formes (déduites de word.en + note)", () => {
  const q = service.buildQueueLeger([toGo], "j1");
  const fv = q.find(ex => ex.mode === "forms_verb");
  assert(fv, "forms_verb manquant");
  eq(fv.forms, { base: "go", preterit: "went", participle: "gone" });
});

// ─── 4. Pluriels notables : forms_plural JAMAIS au léger ───────────────
group("4. Pluriels notables (forms_plural uniquement au J+0, cf. §2.5)");

test("j1 avec pluriel notable : PAS de forms_plural", () => {
  const q = service.buildQueueLeger([wife, apple], "j1");
  const hasPlural = q.some(ex => ex.mode === "forms_plural");
  assert(!hasPlural, "forms_plural trouvé en j1");
});

test("j7 avec pluriel notable : PAS de forms_plural", () => {
  const q = service.buildQueueLeger([wife], "j7");
  const hasPlural = q.some(ex => ex.mode === "forms_plural");
  assert(!hasPlural, "forms_plural trouvé en j7");
  // Sanity : 4 modes × 1 mot = 4 exos, rien d'autre
  eq(q.length, 4);
});

test("j30 avec pluriel notable : PAS de forms_plural", () => {
  const q = service.buildQueueLeger([wife], "j30");
  const hasPlural = q.some(ex => ex.mode === "forms_plural");
  assert(!hasPlural);
});

test("j90 avec pluriel notable : PAS de forms_plural", () => {
  const q = service.buildQueueLeger([wife], "j90");
  const hasPlural = q.some(ex => ex.mode === "forms_plural");
  assert(!hasPlural);
});

// ─── 5. Idiomes : traités comme mots lambda ────────────────────────────
group("5. Idiomes (cf. §2.3 — pas d'exclusion)");

test("j1 avec idiome : compte normalement (2 modes)", () => {
  const q = service.buildQueueLeger([raining], "j1");
  eq(q.length, 2);
  eq(countByMode(q), { audio_to_text: 1, text_to_audio: 1 });
});

test("j7 avec idiome : compte normalement (4 modes)", () => {
  const q = service.buildQueueLeger([raining], "j7");
  eq(q.length, 4);
  eq(countByMode(q), { cold_lesson: 1, mcq: 1, audio_to_text: 1, text_to_audio: 1 });
});

// ─── 6. Ordre interne (phase par mode, dans l'ordre du tableau) ────────
group("6. Ordre interne de la queue");

test("j1 : tous les audio_to_text avant tous les text_to_audio", () => {
  const q = service.buildQueueLeger([apple, banana, cherry], "j1");
  const modes = modeSequence(q);
  // 3 fois audio_to_text, puis 3 fois text_to_audio
  eq(modes.slice(0, 3), ["audio_to_text", "audio_to_text", "audio_to_text"]);
  eq(modes.slice(3, 6), ["text_to_audio", "text_to_audio", "text_to_audio"]);
});

test("j7 : ordre cold_lesson → mcq → audio_to_text → text_to_audio", () => {
  const q = service.buildQueueLeger([apple, banana], "j7");
  const modes = modeSequence(q);
  // 2 fois chaque, dans l'ordre
  eq(modes, [
    "cold_lesson", "cold_lesson",
    "mcq", "mcq",
    "audio_to_text", "audio_to_text",
    "text_to_audio", "text_to_audio",
  ]);
});

test("forms_verb arrive APRÈS la phase classique (bonus de fin)", () => {
  const q = service.buildQueueLeger([toGo, apple], "j1");
  // 4 classiques (2 mots × 2 modes), puis 1 forms_verb
  eq(q[q.length - 1].mode, "forms_verb");
  // Les 4 premiers sont classiques
  for (let i = 0; i < 4; i++) {
    assert(q[i].mode !== "forms_verb", `position ${i} ne devrait pas être forms_verb`);
  }
});

test("dans une phase mode, tous les mots de la liste sont présents", () => {
  const q = service.buildQueueLeger([apple, banana, cherry], "j7");
  // Pour chaque mode du palier, on doit retrouver les 3 mots
  for (const mode of ["cold_lesson", "mcq", "audio_to_text", "text_to_audio"]) {
    const ens = wordsForMode(q, mode).sort();
    eq(ens, ["apple", "banana", "cherry"], `mots pour mode ${mode}`);
  }
});

// ─── 7. Cas limites ────────────────────────────────────────────────────
group("7. Cas limites");

test("Tableau de mots vide : queue vide pour tous les paliers", () => {
  for (const palier of ["j1", "j7", "j30", "j90"]) {
    const q = service.buildQueueLeger([], palier);
    eq(q, [], `palier ${palier}`);
  }
});

test("Palier inconnu : lève une erreur explicite", () => {
  let caught = null;
  try {
    service.buildQueueLeger([apple], "j42");
  } catch (err) {
    caught = err;
  }
  assert(caught, "aucune erreur levée");
  assert(/Palier inconnu/.test(caught.message), `message inattendu : ${caught.message}`);
  assert(/j42/.test(caught.message), "le palier fautif devrait apparaître dans le message");
});

test("Palier en majuscules : non accepté (cohérence des clés)", () => {
  // On veut être strict pour éviter les bugs silencieux : pas de normalisation.
  let caught = null;
  try {
    service.buildQueueLeger([apple], "J1");
  } catch (err) {
    caught = err;
  }
  assert(caught, "doit refuser 'J1' (majuscule)");
});

test("MODES_PAR_PALIER est exporté et conforme au tableau §1", () => {
  eq(MODES_PAR_PALIER.j1,  ["audio_to_text", "text_to_audio"]);
  eq(MODES_PAR_PALIER.j7,  ["cold_lesson", "mcq", "audio_to_text", "text_to_audio"]);
  eq(MODES_PAR_PALIER.j30, ["cold_lesson", "audio_to_text", "text_to_audio"]);
  eq(MODES_PAR_PALIER.j90, ["cold_lesson", "mcq", "audio_to_text", "text_to_audio"]);
});

// ─── 8. Non-régression : buildQueueLourd intact ────────────────────────
group("8. Non-régression buildQueueLourd");

test("buildQueueLourd existe toujours et fonctionne (3 mots lambda → 12 exos)", () => {
  const q = service.buildQueueLourd([apple, banana, cherry]);
  // 4 modes classiques × 3 mots = 12 (pas de forms car pas de verbe irrég ni de pluriel)
  eq(q.length, 12);
  eq(countByMode(q), { mcq: 3, typing_fr: 3, audio_to_text: 3, text_to_audio: 3 });
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
