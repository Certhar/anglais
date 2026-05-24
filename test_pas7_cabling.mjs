/**
 * test_pas7_cabling.mjs
 *
 * Test d'intégration du Pas 7 : on vérifie sans DOM que la pile de
 * services s'instancie correctement et que le Router accepte bien un
 * composer injecté.
 *
 * On simule un DOM minimal et un wordRepo mocké (le vrai charge un
 * JSON via fetch, indisponible en Node sans serveur).
 *
 * Lancer : node test_pas7_cabling.mjs
 */

import { SessionComposerService } from "./services/SessionComposerService.js";
import { OrdonnanceurService } from "./services/OrdonnanceurService.js";
import { rebrassage } from "./services/RebrassageService.js";
import { UserStateService } from "./services/UserStateService.js";

// --- Polyfills ultra-légers pour faire tourner les modules en Node ---

if (typeof globalThis.localStorage === "undefined") {
  const _store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (_store.has(k) ? _store.get(k) : null),
    setItem: (k, v) => _store.set(k, String(v)),
    removeItem: (k) => _store.delete(k),
    clear: () => _store.clear(),
    get length() { return _store.size; },
    key: (i) => Array.from(_store.keys())[i] ?? null,
  };
}

// --- Tests ---

let pass = 0, fail = 0;
function test(label, fn) {
  try { fn(); console.log(`  ✓ ${label}`); pass++; }
  catch (e) { console.log(`  ✗ ${label}\n      ${e.message}`); fail++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

// WordRepo mocké minimal. Méthodes appelées par OrdonnanceurService :
// getFrequenceByPhase, getThemesQueue. Méthodes appelées par le composer
// et le Router : getById, getByIds. Pour la robustesse on enveloppe le
// tout dans un Proxy qui renvoie une fonction "return []" pour toute
// méthode inattendue (évite que ce test casse si l'ordonnanceur évolue).
const _baseWordRepo = {
  _byId: new Map([
    [1, { id: 1, word: "cat", trad: "chat" }],
    [2, { id: 2, word: "dog", trad: "chien" }],
  ]),
  getById(id) { return this._byId.get(id) || null; },
  getByIds(ids) { return ids.map(id => this._byId.get(id)).filter(Boolean); },
  getAll() { return Array.from(this._byId.values()); },
  getFrequenceByPhase() { return []; },
  getThemesQueue() { return []; },
};
const fakeWordRepo = new Proxy(_baseWordRepo, {
  get(target, prop) {
    if (prop in target) return target[prop];
    // Toute méthode imprévue → fonction renvoyant []
    return () => [];
  },
});

const userState = new UserStateService();

console.log("\n═════ Test Pas 7 — câblage Router/Composer ═════\n");

console.log("1. Instanciation de la pile de services");

test("OrdonnanceurService s'instancie avec wordRepo + userState", () => {
  const o = new OrdonnanceurService({ wordRepository: fakeWordRepo, userState });
  assert(o, "ordonnanceur null");
});

test("SessionComposerService s'instancie avec les 4 deps", () => {
  const ordo = new OrdonnanceurService({ wordRepository: fakeWordRepo, userState });
  const c = new SessionComposerService({
    userState, wordRepo: fakeWordRepo, rebrassage, ordonnanceur: ordo,
  });
  assert(c, "composer null");
});

console.log("\n2. Comportement du composer pour les 2 types");

const ordo = new OrdonnanceurService({ wordRepository: fakeWordRepo, userState });
const composer = new SessionComposerService({
  userState, wordRepo: fakeWordRepo, rebrassage, ordonnanceur: ordo,
});

test("Un mercredi vierge (corpus vide) → type 'normale' (le mercredi n'est plus spécial)", () => {
  // 2026-05-20 est un mercredi
  const s = composer.composerSeance("max", "2026-05-20");
  assert(s.type === "normale", `attendu 'normale', reçu '${s.type}'`);
  assert(Array.isArray(s.coldLesson) && s.coldLesson.length === 0, "coldLesson devrait être []");
  assert(Array.isArray(s.longs) && s.longs.length === 0, "longs devrait être []");
});

test("Un jour normal vierge → type 'normale' avec coldLesson vide (corpus vide)", () => {
  // 2026-05-19 est un mardi
  const s = composer.composerSeance("max", "2026-05-19");
  assert(s.type === "normale", `attendu 'normale', reçu '${s.type}'`);
  assert(Array.isArray(s.coldLesson), "coldLesson devrait être un tableau");
  assert(Array.isArray(s.chutes) && s.chutes.length === 0, "chutes devrait être []");
});

console.log("\n3. Le Router accepte le composer en option");

// Le Router importe Screen.js qui importent des trucs DOM — on ne va
// pas l'importer ici, juste vérifier que sa signature de constructeur
// est ce qu'on attend en lisant le fichier.
import { readFile } from "node:fs/promises";
const routerSrc = await readFile(new URL("./core/Router.js", import.meta.url), "utf8");

test("Router.js exige composer dans les options", () => {
  assert(
    routerSrc.includes('options.composer') &&
    routerSrc.includes('composer requis'),
    "le Router ne vérifie pas la présence du composer"
  );
});

test("Router.js a une méthode _composeLesson qui appelle composer.composerSeance", () => {
  assert(
    routerSrc.includes('this._composer.composerSeance'),
    "le Router n'appelle pas composer.composerSeance"
  );
});

test("Router.js gère les 2 types de séance ('normale', 'revision')", () => {
  assert(routerSrc.includes('"normale"') || routerSrc.includes("'normale'"), "type 'normale' manquant");
  assert(routerSrc.includes('"revision"') || routerSrc.includes("'revision'"), "type 'revision' manquant");
});

test("Router.js n'a plus de référence au type 'rien' ni à 'revision_longue'", () => {
  // Les anciens types ont été supprimés. On les cherche dans les
  // chaînes JS uniquement (pas dans les commentaires explicatifs).
  assert(
    !routerSrc.match(/seance\.type\s*===\s*["']rien["']/),
    "le Router teste encore type === 'rien' (devrait être supprimé)"
  );
  assert(
    !routerSrc.match(/seance\.type\s*===\s*["']revision_longue["']/),
    "le Router teste encore type === 'revision_longue' (renommé en 'revision')"
  );
});

test("Router.js résout les ids via wordRepo.getByIds", () => {
  assert(routerSrc.includes('wordRepo.getByIds'), "résolution id→Word manquante");
});

test("Router.js a une méthode _dateISOAujourdhui pour le fuseau local", () => {
  assert(routerSrc.includes('_dateISOAujourdhui'), "helper de date manquant");
});

test("main.js injecte le composer dans le Router", () => {
  // on lit main.js
  return readFile(new URL("./main.js", import.meta.url), "utf8").then(src => {
    assert(src.includes('new SessionComposerService'), "composer non instancié dans main.js");
    assert(src.includes('composer,') || src.includes('composer ,') || src.includes('composer\n'), "composer non passé au Router");
  });
});

// Petit délai pour laisser le promise du dernier test se résoudre
await new Promise(r => setTimeout(r, 50));

console.log("\n═════════════════════════════════════════════════════════════");
console.log(`Résultat : ${pass} OK · ${fail} échec(s)`);
console.log(fail === 0 ? "Tout passe ✓\n" : `${fail} test(s) en échec\n`);
process.exit(fail === 0 ? 0 : 1);
