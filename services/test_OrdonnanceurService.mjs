/**
 * Tests pour OrdonnanceurService.
 *
 * Lancer : node test_OrdonnanceurService.mjs
 *
 * Comme les autres harness Node, on mock localStorage en amont pour
 * que UserStateService fonctionne. On utilise le corpus canonique
 * réel (../data/words.canonical.json) chargé via un patch de la
 * méthode load() du WordRepository (qui utilise normalement fetch).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// ─── Mock localStorage ─────────────────────────────────────────────────
class FakeLocalStorage {
  constructor() { this._data = new Map(); }
  getItem(k) { return this._data.has(k) ? this._data.get(k) : null; }
  setItem(k, v) { this._data.set(k, String(v)); }
  removeItem(k) { this._data.delete(k); }
  clear() { this._data.clear(); }
}
globalThis.localStorage = new FakeLocalStorage();

// Imports après mise en place du mock
const { userState } = await import("./UserStateService.js");
const { WordRepository } = await import("../repositories/WordRepository.js");
const { OrdonnanceurService } = await import("./OrdonnanceurService.js");

// ─── Patch de load() pour fonctionner en Node sans fetch ───────────────
// Le repo utilise fetch() en navigateur. En Node on remplace par un
// readFileSync. Le reste du repo (normalisation, getters) est intact.
const __dirname = dirname(fileURLToPath(import.meta.url));
const corpusPath = join(__dirname, "..", "data", "words.canonical.json");

function makeRepo() {
  const repo = new WordRepository({ dataPath: corpusPath });
  repo.load = async function() {
    if (this._words) return; // déjà chargé
    const raw = JSON.parse(readFileSync(this._dataPath, "utf-8"));
    const arr = raw.words || raw;
    this._words = arr.map(w => ({
      id: w.id,
      en: w.word_en,
      fr: w.translation_fr,
      nature: w.nature,
      level: w.level,
      theme: w.theme,
      subTheme: w.sub_theme,
      note: w.note ?? "",
      prono: w.prono ?? "",
      audio: w.audio ?? null,
      ordoFile: w.ordo_file,
      bracket: w.bracket ?? null,
      phase: w.phase ?? null,
      categorieOrdo: w.categorie_ordo ?? null,
      ordreDansPhase: w.ordre_dans_phase ?? null,
      groupeSemantique: w.groupe_semantique ?? null,
      ordreTheme: w.ordre_theme ?? null,
      ordreDansTheme: w.ordre_dans_theme ?? null,
    }));
    this._byId = new Map(this._words.map(w => [w.id, w]));
  };
  return repo;
}

// Repo unique partagé entre tests (lecture seule, c'est ok)
const repo = makeRepo();
await repo.load();

// ─── Mini framework ────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  userState.clear();
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, err });
    console.log(`  ✗ ${name}`);
    console.log(`      ${err.message}`);
  }
}
function group(name) { console.log(`\n${name}`); }
function eq(a, b, msg) {
  const aStr = JSON.stringify(a);
  const bStr = JSON.stringify(b);
  if (aStr !== bStr) {
    throw new Error(`${msg || "égalité"} — attendu ${bStr}, reçu ${aStr}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion échouée");
}

// ─── Helpers spécifiques aux tests ─────────────────────────────────────

/**
 * Marque une liste d'ids comme introduits pour un enfant donné. On
 * triche un peu en écrivant directement dans userState avec une entrée
 * minimale (l'ordonnanceur n'a besoin que de "il y a une entrée" pour
 * considérer un mot comme déjà vu).
 */
function marquerIntroduits(childId, ids) {
  for (const id of ids) {
    userState.setWordProgress(childId, id, {
      etape: "j0",
      dateIntroduction: "2026-05-18",
      dateProchainRebrassage: null,
      historique: [],
    });
  }
}

function makeOrdo() {
  return new OrdonnanceurService({ wordRepository: repo, userState });
}

function getWord(id) {
  return repo.getById(id);
}

// ═══════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════

group("1. Construction et garde-fous");

test("constructeur sans wordRepository → throw", () => {
  let err = null;
  try { new OrdonnanceurService({ userState }); } catch (e) { err = e; }
  assert(err !== null, "devait lever");
  assert(err.message.includes("wordRepository"), "message d'erreur explicite");
});

test("constructeur sans userState → throw", () => {
  let err = null;
  try { new OrdonnanceurService({ wordRepository: repo }); } catch (e) { err = e; }
  assert(err !== null, "devait lever");
  assert(err.message.includes("userState"), "message d'erreur explicite");
});

test("constructeur sans dépendances du tout → throw", () => {
  let err = null;
  try { new OrdonnanceurService(); } catch (e) { err = e; }
  assert(err !== null, "devait lever");
});

test("_getSourceMots avec sous-file inconnue → throw", () => {
  const ordo = makeOrdo();
  let err = null;
  try { ordo._getSourceMots("inexistante"); } catch (e) { err = e; }
  assert(err !== null, "devait lever");
});


group("2. getPhaseActuelle — détection de phase");

test("enfant vierge → phase 'boot'", () => {
  const ordo = makeOrdo();
  eq(ordo.getPhaseActuelle("max"), "boot");
});

test("boot introduit → phase 'post_boot_VTV'", () => {
  const ordo = makeOrdo();
  const bootIds = ordo.getMotsDisponibles("max", "boot");
  marquerIntroduits("max", bootIds);
  eq(ordo.getPhaseActuelle("max"), "post_boot_VTV");
});

test("boot + V post-boot introduits → phase 'post_boot_TTT'", () => {
  const ordo = makeOrdo();
  marquerIntroduits("max", ordo.getMotsDisponibles("max", "boot"));
  marquerIntroduits("max", ordo.getMotsDisponibles("max", "post_boot_V"));
  eq(ordo.getPhaseActuelle("max"), "post_boot_TTT");
});

test("toute la Fréquence introduite → phase 'themes_purs'", () => {
  const ordo = makeOrdo();
  marquerIntroduits("max", ordo.getMotsDisponibles("max", "boot"));
  marquerIntroduits("max", ordo.getMotsDisponibles("max", "post_boot_V"));
  marquerIntroduits("max", ordo.getMotsDisponibles("max", "post_boot_T"));
  eq(ordo.getPhaseActuelle("max"), "themes_purs");
});

test("tout introduit → phase 'epuise'", () => {
  const ordo = makeOrdo();
  marquerIntroduits("max", ordo.getMotsDisponibles("max", "boot"));
  marquerIntroduits("max", ordo.getMotsDisponibles("max", "post_boot_V"));
  marquerIntroduits("max", ordo.getMotsDisponibles("max", "post_boot_T"));
  marquerIntroduits("max", ordo.getMotsDisponibles("max", "themes"));
  eq(ordo.getPhaseActuelle("max"), "epuise");
});

test("getPhaseActuelle est étanche entre enfants", () => {
  const ordo = makeOrdo();
  // max consomme tout le boot, julie reste vierge
  marquerIntroduits("max", ordo.getMotsDisponibles("max", "boot"));
  eq(ordo.getPhaseActuelle("max"), "post_boot_VTV");
  eq(ordo.getPhaseActuelle("julie"), "boot");
});


group("3. getMotsDisponibles — taille des sous-files (enfant vierge)");

test("boot dispo = 30 mots pour un enfant vierge", () => {
  const ordo = makeOrdo();
  eq(ordo.getMotsDisponibles("max", "boot").length, 30);
});

test("post_boot_V dispo = 61 mots pour un enfant vierge", () => {
  const ordo = makeOrdo();
  eq(ordo.getMotsDisponibles("max", "post_boot_V").length, 61);
});

test("post_boot_T dispo = 150 mots pour un enfant vierge", () => {
  const ordo = makeOrdo();
  eq(ordo.getMotsDisponibles("max", "post_boot_T").length, 150);
});

test("themes dispo = 1128 mots pour un enfant vierge", () => {
  const ordo = makeOrdo();
  eq(ordo.getMotsDisponibles("max", "themes").length, 1128);
});

test("getMotsDisponibles décroît à mesure qu'on introduit", () => {
  const ordo = makeOrdo();
  const tous = ordo.getMotsDisponibles("max", "boot");
  marquerIntroduits("max", tous.slice(0, 5));
  eq(ordo.getMotsDisponibles("max", "boot").length, 25);
});


group("4. Tirage boot — phase 1");

test("J1 boot : 10 premiers mots", () => {
  const ordo = makeOrdo();
  const ids = ordo.tirerNouveaux("max", 10);
  eq(ids.length, 10);
  // 'to be' = id 1, 'to have' = id 2, 'to do' = id 3
  eq(ids[0], 1);
  eq(ids[1], 2);
  eq(ids[2], 3);
});

test("J1 boot : tous bracket=1", () => {
  const ordo = makeOrdo();
  const ids = ordo.tirerNouveaux("max", 10);
  for (const id of ids) {
    eq(getWord(id).bracket, 1, `mot id=${id} devrait être bracket=1`);
  }
});

test("J1 boot : ordre EN exact selon la bible §8.2", () => {
  const ordo = makeOrdo();
  const ids = ordo.tirerNouveaux("max", 10);
  const noms = ids.map(id => getWord(id).en);
  eq(noms, [
    "to be", "to have", "to do", "and", "what",
    "who", "no", "yes", "Hello", "Hi"
  ]);
});

test("boot consommé en 3 jours de 10 → boot vide à J3", () => {
  const ordo = makeOrdo();
  for (let j = 1; j <= 3; j++) {
    const ids = ordo.tirerNouveaux("max", 10);
    eq(ids.length, 10, `J${j} doit produire 10 mots`);
    marquerIntroduits("max", ids);
  }
  eq(ordo.getMotsDisponibles("max", "boot").length, 0);
  eq(ordo.getPhaseActuelle("max"), "post_boot_VTV");
});

test("boot : slots > dispo → on rend ce qu'on a", () => {
  const ordo = makeOrdo();
  // Introduire 25 mots du boot
  const debut = ordo.tirerNouveaux("max", 25);
  marquerIntroduits("max", debut);
  // Reste 5, on demande 10
  const fin = ordo.tirerNouveaux("max", 10);
  eq(fin.length, 5);
});

test("boot : slots=0 → []", () => {
  const ordo = makeOrdo();
  eq(ordo.tirerNouveaux("max", 0), []);
});

test("boot : slots négatif → []", () => {
  const ordo = makeOrdo();
  eq(ordo.tirerNouveaux("max", -3), []);
});


group("5. Tirage post-boot V-T-V");

test("J4 post-boot : 10 mots = 3 freq + 7 thèmes", () => {
  const ordo = makeOrdo();
  // Consommer le boot
  for (let j = 0; j < 3; j++) {
    marquerIntroduits("max", ordo.tirerNouveaux("max", 10));
  }
  const j4 = ordo.tirerNouveaux("max", 10);
  eq(j4.length, 10);
  // Les 3 premiers sont freq (V-T-V), les 7 suivants thèmes
  const cats = j4.map(id => getWord(id).ordoFile);
  eq(cats.slice(0, 3), ["freq", "freq", "freq"]);
  eq(cats.slice(3), ["themes", "themes", "themes", "themes", "themes", "themes", "themes"]);
});

test("J4 post-boot : pattern Fréquence = V-T-V", () => {
  const ordo = makeOrdo();
  for (let j = 0; j < 3; j++) {
    marquerIntroduits("max", ordo.tirerNouveaux("max", 10));
  }
  const j4 = ordo.tirerNouveaux("max", 10);
  const catsFreq = j4.slice(0, 3).map(id => getWord(id).categorieOrdo);
  eq(catsFreq, ["V", "T", "V"]);
});

test("J4 post-boot : premier V = 'to find' (br=3, ord=1)", () => {
  const ordo = makeOrdo();
  for (let j = 0; j < 3; j++) {
    marquerIntroduits("max", ordo.tirerNouveaux("max", 10));
  }
  const j4 = ordo.tirerNouveaux("max", 10);
  eq(getWord(j4[0]).en, "to find");
});

test("J4 post-boot : premier T = 'so' (br=2, ord=3)", () => {
  const ordo = makeOrdo();
  for (let j = 0; j < 3; j++) {
    marquerIntroduits("max", ordo.tirerNouveaux("max", 10));
  }
  const j4 = ordo.tirerNouveaux("max", 10);
  eq(getWord(j4[1]).en, "so");
});

test("J4 post-boot : T avant V dans le bracket — vérification d'indépendance", () => {
  // Le bracket 2 a 17 mots T mais 0 V (les V br=2 sont dans le boot).
  // Donc à J4, T pioche dans br=2 pendant que V pioche dans br=3.
  // C'est la preuve que V et T progressent indépendamment.
  const ordo = makeOrdo();
  for (let j = 0; j < 3; j++) {
    marquerIntroduits("max", ordo.tirerNouveaux("max", 10));
  }
  const j4 = ordo.tirerNouveaux("max", 10);
  const v = getWord(j4[0]);
  const t = getWord(j4[1]);
  eq(v.bracket, 3, "V doit être au bracket 3");
  eq(t.bracket, 2, "T doit être au bracket 2 (indépendance)");
});

test("J4 post-boot : 7 thèmes commencent au thème 1 (famille)", () => {
  const ordo = makeOrdo();
  for (let j = 0; j < 3; j++) {
    marquerIntroduits("max", ordo.tirerNouveaux("max", 10));
  }
  const j4 = ordo.tirerNouveaux("max", 10);
  const themes = j4.slice(3);
  // Tous au thème 1
  for (const id of themes) {
    eq(getWord(id).ordreTheme, 1, `mot ${id} devrait être au thème 1`);
  }
  // Premier mot = ordre_dans_theme=1
  eq(getWord(themes[0]).ordreDansTheme, 1);
});

test("post-boot 2 jours consécutifs : pas de doublons", () => {
  const ordo = makeOrdo();
  for (let j = 0; j < 3; j++) {
    marquerIntroduits("max", ordo.tirerNouveaux("max", 10));
  }
  const j4 = ordo.tirerNouveaux("max", 10);
  marquerIntroduits("max", j4);
  const j5 = ordo.tirerNouveaux("max", 10);
  // Aucun id de j4 ne doit revenir en j5
  for (const id of j5) {
    assert(!j4.includes(id), `id ${id} apparaît en J4 ET J5`);
  }
});

test("post-boot slots=10 : répartition 7+3", () => {
  const ordo = makeOrdo();
  for (let j = 0; j < 3; j++) {
    marquerIntroduits("max", ordo.tirerNouveaux("max", 10));
  }
  const j4 = ordo.tirerNouveaux("max", 10);
  const nbFreq = j4.filter(id => getWord(id).ordoFile === "freq").length;
  const nbTh = j4.filter(id => getWord(id).ordoFile === "themes").length;
  eq(nbFreq, 3);
  eq(nbTh, 7);
});

test("post-boot slots=4 : répartition 1+3 (round(4*0.3)=1)", () => {
  const ordo = makeOrdo();
  for (let j = 0; j < 3; j++) {
    marquerIntroduits("max", ordo.tirerNouveaux("max", 10));
  }
  const ids = ordo.tirerNouveaux("max", 4);
  eq(ids.length, 4);
  const nbFreq = ids.filter(id => getWord(id).ordoFile === "freq").length;
  const nbTh = ids.filter(id => getWord(id).ordoFile === "themes").length;
  eq(nbFreq, 1);
  eq(nbTh, 3);
});

test("post-boot slots=7 : répartition 2+5 (round(7*0.3)=2)", () => {
  const ordo = makeOrdo();
  for (let j = 0; j < 3; j++) {
    marquerIntroduits("max", ordo.tirerNouveaux("max", 10));
  }
  const ids = ordo.tirerNouveaux("max", 7);
  eq(ids.length, 7);
  const nbFreq = ids.filter(id => getWord(id).ordoFile === "freq").length;
  const nbTh = ids.filter(id => getWord(id).ordoFile === "themes").length;
  eq(nbFreq, 2);
  eq(nbTh, 5);
});

test("post-boot slots=1 : 0+1 (round(1*0.3)=0, fallback : 1 thème)", () => {
  const ordo = makeOrdo();
  for (let j = 0; j < 3; j++) {
    marquerIntroduits("max", ordo.tirerNouveaux("max", 10));
  }
  const ids = ordo.tirerNouveaux("max", 1);
  eq(ids.length, 1);
  eq(getWord(ids[0]).ordoFile, "themes");
});


group("6. Fallback : V s'épuise pendant V-T-V");

test("dernier V tiré, pattern V-T-V devient V-T-T", () => {
  const ordo = makeOrdo();
  // Boot complet
  for (let j = 0; j < 3; j++) {
    marquerIntroduits("max", ordo.tirerNouveaux("max", 10));
  }
  // Introduire tous les V sauf 1
  const tousV = ordo.getMotsDisponibles("max", "post_boot_V");
  marquerIntroduits("max", tousV.slice(0, tousV.length - 1));
  // Encore en VTV
  eq(ordo.getPhaseActuelle("max"), "post_boot_VTV");

  const ids = ordo.tirerNouveaux("max", 10);
  const freq = ids.slice(0, 3);
  const cats = freq.map(id => getWord(id).categorieOrdo);
  eq(cats, ["V", "T", "T"], "V, T, T attendu (le 2e V remplacé par T)");
});

test("après ce tirage, on bascule en post_boot_TTT", () => {
  const ordo = makeOrdo();
  for (let j = 0; j < 3; j++) {
    marquerIntroduits("max", ordo.tirerNouveaux("max", 10));
  }
  const tousV = ordo.getMotsDisponibles("max", "post_boot_V");
  marquerIntroduits("max", tousV.slice(0, tousV.length - 1));
  marquerIntroduits("max", ordo.tirerNouveaux("max", 10));
  eq(ordo.getPhaseActuelle("max"), "post_boot_TTT");
});


group("7. Tirage post-boot T-T-T");

test("phase T-T-T : 3 premiers freq sont tous des T", () => {
  const ordo = makeOrdo();
  // Consommer boot + tous les V
  for (let j = 0; j < 3; j++) {
    marquerIntroduits("max", ordo.tirerNouveaux("max", 10));
  }
  marquerIntroduits("max", ordo.getMotsDisponibles("max", "post_boot_V"));
  eq(ordo.getPhaseActuelle("max"), "post_boot_TTT");

  const ids = ordo.tirerNouveaux("max", 10);
  const catsFreq = ids.slice(0, 3).map(id => getWord(id).categorieOrdo);
  eq(catsFreq, ["T", "T", "T"]);
});

test("phase T-T-T : on continue à tirer dans la file Thèmes là où on en était", () => {
  const ordo = makeOrdo();
  // Boot
  for (let j = 0; j < 3; j++) {
    marquerIntroduits("max", ordo.tirerNouveaux("max", 10));
  }
  // Mémoriser combien de thèmes ont été consommés en phase V-T-V
  const themesConsommesAvant = 1128 - ordo.getMotsDisponibles("max", "themes").length;
  // Force le passage en T-T-T
  marquerIntroduits("max", ordo.getMotsDisponibles("max", "post_boot_V"));

  const ids = ordo.tirerNouveaux("max", 10);
  const themes = ids.filter(id => getWord(id).ordoFile === "themes");
  // Le premier thème tiré doit avoir l'ordre suivant
  const premierTheme = themes[0];
  // Trouver le mot précédent (ordre_dans_theme - 1 dans le même thème,
  // ou dernier d'un thème antérieur)
  // Vérification simple : ce thème ne doit pas avoir déjà été introduit
  assert(
    !userState.getWordProgress("max", premierTheme),
    "le thème tiré ne doit pas avoir déjà été introduit"
  );
});


group("8. Tirage thèmes purs");

test("phase thèmes_purs : 10 mots, tous thèmes", () => {
  const ordo = makeOrdo();
  // Consommer toute la Fréquence
  marquerIntroduits("max", ordo.getMotsDisponibles("max", "boot"));
  marquerIntroduits("max", ordo.getMotsDisponibles("max", "post_boot_V"));
  marquerIntroduits("max", ordo.getMotsDisponibles("max", "post_boot_T"));
  eq(ordo.getPhaseActuelle("max"), "themes_purs");

  const ids = ordo.tirerNouveaux("max", 10);
  eq(ids.length, 10);
  for (const id of ids) {
    eq(getWord(id).ordoFile, "themes", `id ${id} devrait être un thème`);
  }
});

test("phase épuisée : tirage retourne []", () => {
  const ordo = makeOrdo();
  marquerIntroduits("max", ordo.getMotsDisponibles("max", "boot"));
  marquerIntroduits("max", ordo.getMotsDisponibles("max", "post_boot_V"));
  marquerIntroduits("max", ordo.getMotsDisponibles("max", "post_boot_T"));
  marquerIntroduits("max", ordo.getMotsDisponibles("max", "themes"));
  eq(ordo.getPhaseActuelle("max"), "epuise");
  eq(ordo.tirerNouveaux("max", 10), []);
});


group("9. Simulation longue (régression)");

test("parcours complet : 1369 mots tirés en ~137 jours", () => {
  const ordo = makeOrdo();
  let jour = 0;
  let total = 0;
  while (ordo.getPhaseActuelle("max") !== "epuise" && jour < 200) {
    jour++;
    const ids = ordo.tirerNouveaux("max", 10);
    total += ids.length;
    marquerIntroduits("max", ids);
  }
  eq(total, 1369, "tous les mots du corpus tirés");
  assert(jour < 200, "épuisement en moins de 200 jours");
  assert(jour >= 130 && jour <= 145, `jours attendus ~137, obtenu ${jour}`);
});

test("parcours : phase boot dure 3 jours", () => {
  const ordo = makeOrdo();
  let jour = 0;
  while (ordo.getPhaseActuelle("max") === "boot") {
    jour++;
    marquerIntroduits("max", ordo.tirerNouveaux("max", 10));
  }
  eq(jour, 3, "le boot doit durer pile 3 jours à 10 mots/jour");
});

test("parcours : phase V-T-V dure ~31 jours (estimation bible)", () => {
  const ordo = makeOrdo();
  // Boot
  for (let j = 0; j < 3; j++) marquerIntroduits("max", ordo.tirerNouveaux("max", 10));
  let jour = 0;
  while (ordo.getPhaseActuelle("max") === "post_boot_VTV") {
    jour++;
    marquerIntroduits("max", ordo.tirerNouveaux("max", 10));
  }
  // Estimation bible : ~31. Tolérance ±3
  assert(jour >= 28 && jour <= 35, `V-T-V attendu ~31j, obtenu ${jour}`);
});

test("parcours : aucun doublon dans tout le parcours", () => {
  const ordo = makeOrdo();
  const vus = new Set();
  let jour = 0;
  while (ordo.getPhaseActuelle("max") !== "epuise" && jour < 200) {
    jour++;
    const ids = ordo.tirerNouveaux("max", 10);
    for (const id of ids) {
      assert(!vus.has(id), `id ${id} tiré deux fois (J${jour})`);
      vus.add(id);
    }
    marquerIntroduits("max", ids);
  }
  eq(vus.size, 1369);
});


group("10. Étanchéité multi-enfants");

test("deux enfants ont des phases indépendantes", () => {
  const ordo = makeOrdo();
  // max consomme le boot
  for (let j = 0; j < 3; j++) marquerIntroduits("max", ordo.tirerNouveaux("max", 10));
  eq(ordo.getPhaseActuelle("max"), "post_boot_VTV");
  eq(ordo.getPhaseActuelle("julie"), "boot");
});

test("deux enfants ont des tirages indépendants", () => {
  const ordo = makeOrdo();
  // max consomme 5 mots du boot
  marquerIntroduits("max", ordo.tirerNouveaux("max", 5));
  // julie démarre depuis 0 : doit avoir les mêmes 10 premiers mots qu'aurait eu max
  const j1Julie = ordo.tirerNouveaux("julie", 10);
  eq(getWord(j1Julie[0]).en, "to be");
  eq(getWord(j1Julie[1]).en, "to have");
});


// ═══════════════════════════════════════════════════════════════════════
// Bilan
// ═══════════════════════════════════════════════════════════════════════

console.log(`\n────────────────────────────────`);
console.log(`Bilan : ${passed} passés, ${failed} échoués`);
if (failed > 0) {
  console.log(`\nDétail des échecs :`);
  for (const f of failures) {
    console.log(`  • ${f.name}`);
    console.log(`    ${f.err.message}`);
  }
  process.exit(1);
}
