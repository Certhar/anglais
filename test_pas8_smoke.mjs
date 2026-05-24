/**
 * Smoke test : on importe tous les modules touchés par le Pas 8 pour
 * vérifier qu'il n'y a aucune erreur d'import / référence non résolue.
 * Pas de DOM, juste du chargement de modules.
 */

import { readFile } from "node:fs/promises";

const _store = new Map();
globalThis.localStorage = {
  getItem: k => _store.has(k) ? _store.get(k) : null,
  setItem: (k, v) => _store.set(k, String(v)),
  removeItem: k => _store.delete(k),
  clear: () => _store.clear(),
};
globalThis.fetch = async (path) => {
  const url = path.replace(/^\.?\//, "");
  const data = await readFile(`./${url}`, "utf8");
  return { ok: true, json: async () => JSON.parse(data) };
};

let pass = 0, fail = 0;
function test(label, fn) {
  try { fn(); console.log(`  ✓ ${label}`); pass++; }
  catch (e) { console.log(`  ✗ ${label}\n      ${e.message}`); fail++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

console.log("\n═════ Smoke test Pas 8 — imports et instanciation ═════\n");

console.log("1. Tous les modules s'importent");

const composerMod = await import("./services/SessionComposerService.js");
const ordoMod = await import("./services/OrdonnanceurService.js");
const rebMod = await import("./services/RebrassageService.js");
const usMod = await import("./services/UserStateService.js");
const wrMod = await import("./repositories/WordRepository.js");

test("SessionComposerService exporté", () => {
  assert(composerMod.SessionComposerService, "export manquant");
});

console.log("\n2. Composer : 2 types possibles, plus de 'rien' ni 'revision_longue'");

const userState = usMod.userState;  // singleton, partagé avec rebrassage
userState.clear();

wrMod.wordRepo.setDataPath('./data/words.canonical.json');
await wrMod.wordRepo.load();

const ordo = new ordoMod.OrdonnanceurService({
  wordRepository: wrMod.wordRepo, userState,
});
const composer = new composerMod.SessionComposerService({
  userState, wordRepo: wrMod.wordRepo,
  rebrassage: rebMod.rebrassage, ordonnanceur: ordo,
});

test("Mardi vierge → type 'normale' avec 10 mots", () => {
  const s = composer.composerSeance("max", "2026-05-19");
  assert(s.type === "normale", `attendu 'normale', reçu '${s.type}'`);
  assert(s.coldLesson.length === 10, `coldLesson devrait avoir 10 mots, en a ${s.coldLesson.length}`);
});

test("Mercredi vierge → type 'normale' aussi (le mercredi n'est plus spécial)", () => {
  const s = composer.composerSeance("max", "2026-05-20");
  assert(s.type === "normale", `attendu 'normale', reçu '${s.type}'`);
  assert(s.coldLesson.length === 10, `coldLesson devrait avoir 10 mots, en a ${s.coldLesson.length}`);
});

test("Avec un j7 dû → type 'revision', longs=[id]", () => {
  userState.clear();
  userState.setWordProgress("max", 1, {
    etape: "j7", dateIntroduction: "2026-05-13",
    dateProchainRebrassage: "2026-05-20", historique: [],
  });
  const s = composer.composerSeance("max", "2026-05-20");
  assert(s.type === "revision", `attendu 'revision', reçu '${s.type}'`);
  assert(s.longs.length === 1, `longs devrait avoir 1 mot, en a ${s.longs.length}`);
});

test("Le composer ne renvoie JAMAIS 'rien' ni 'revision_longue'", () => {
  // On teste plusieurs dates / configurations
  userState.clear();
  const types = new Set();
  for (const date of ["2026-05-17", "2026-05-18", "2026-05-19", "2026-05-20", "2026-05-21"]) {
    types.add(composer.composerSeance("max", date).type);
  }
  assert(!types.has("rien"), "Le type 'rien' apparaît encore");
  assert(!types.has("revision_longue"), "Le type 'revision_longue' apparaît encore");
  console.log(`      Types observés : ${[...types].join(", ")}`);
});

console.log("\n3. HomeScreen accepte sessionType");

// On ne peut pas instancier HomeScreen sans DOM, mais on peut vérifier
// que le constructeur ne lève pas et que les nouveaux props sont accueillis
const homeSrc = await readFile("./screens/HomeScreen.js", "utf8");
test("HomeScreen.js déclare bien sessionType dans le constructeur", () => {
  assert(homeSrc.includes('this.sessionType = options.sessionType'), "sessionType non récupéré");
});
test("HomeScreen.js déclare onStartRevision", () => {
  assert(homeSrc.includes('this.onStartRevision'), "onStartRevision manquant");
});
test("HomeScreen.js déclare onChildPicked", () => {
  assert(homeSrc.includes('this.onChildPicked'), "onChildPicked manquant");
});
test("HomeScreen.js a un _renderRevisionMenu", () => {
  assert(homeSrc.includes('_renderRevisionMenu'), "_renderRevisionMenu manquant");
});
test("HomeScreen.js a un bouton 'Réviser'", () => {
  assert(homeSrc.includes('Réviser'), "label 'Réviser' manquant");
});
test("HomeScreen.js a un bouton 'Démarrer' (renommage de 'Leçon')", () => {
  assert(homeSrc.includes('Démarrer'), "label 'Démarrer' manquant");
});

console.log("\n4. Router branche le flux révision");

const routerSrc = await readFile("./core/Router.js", "utf8");
test("Router.js a une méthode _computeSessionType", () => {
  assert(routerSrc.includes('_computeSessionType'), "méthode manquante");
});
test("Router.js passe sessionType à HomeScreen", () => {
  assert(routerSrc.includes('sessionType,') || routerSrc.includes('sessionType:'), "sessionType non passé");
});
test("Router.js déclare onStartRevision dans _mountHome", () => {
  assert(routerSrc.includes('onStartRevision:'), "callback onStartRevision manquant");
});

console.log("\n═════════════════════════════════════════════════════════════");
console.log(`Résultat : ${pass} OK · ${fail} échec(s)`);
console.log(fail === 0 ? "Tout passe ✓\n" : `${fail} test(s) en échec\n`);
process.exit(fail === 0 ? 0 : 1);
