/**
 * test_pas9_cabling.mjs
 *
 * Test d'intégration du Pas 9 : on vérifie que le SessionRecorderService
 * est correctement instancié et câblé dans la chaîne main.js → Router →
 * ExerciseScreen.
 *
 * Comme pour test_pas7_cabling, on combine deux approches :
 *   - tests fonctionnels sur le service (instanciation, méthodes)
 *   - lecture textuelle des sources du Router / main.js / ExerciseScreen
 *     pour vérifier les points de câblage (pas de DOM ici, donc on ne
 *     peut pas faire d'instanciation complète de la chaîne).
 *
 * Lancer : node test_pas9_cabling.mjs
 */

import { readFile } from "node:fs/promises";
import { SessionRecorderService } from "./services/SessionRecorderService.js";
import { UserStateService } from "./services/UserStateService.js";
import { rebrassage } from "./services/RebrassageService.js";

// --- Polyfill localStorage ----------------------------------------------
if (typeof globalThis.localStorage === "undefined") {
  const _store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (_store.has(k) ? _store.get(k) : null),
    setItem: (k, v) => _store.set(k, String(v)),
    removeItem: (k) => _store.delete(k),
    clear: () => _store.clear(),
  };
}

// --- Mini framework -----------------------------------------------------
let pass = 0, fail = 0;
const pendingTests = [];
function test(label, fn) {
  try {
    const ret = fn();
    // Si fn renvoie une Promise (cas async), on la met en attente.
    if (ret && typeof ret.then === "function") {
      pendingTests.push(
        ret.then(
          () => { console.log(`  ✓ ${label}`); pass++; },
          (e) => { console.log(`  ✗ ${label}\n      ${e.message}`); fail++; }
        )
      );
    } else {
      console.log(`  ✓ ${label}`); pass++;
    }
  } catch (e) {
    console.log(`  ✗ ${label}\n      ${e.message}`); fail++;
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

// ════════════════════════════════════════════════════════════════════════
// 1. Le service SessionRecorderService est correctement défini
// ════════════════════════════════════════════════════════════════════════
console.log("\n1. SessionRecorderService — définition");

test("SessionRecorderService exige userState et rebrassage", () => {
  let threw = false;
  try { new SessionRecorderService({}); } catch { threw = true; }
  assert(threw, "le constructeur devrait throw sans deps");
});

test("SessionRecorderService s'instancie avec les deux dépendances", () => {
  const us = new UserStateService();
  const rec = new SessionRecorderService({ userState: us, rebrassage });
  assert(rec, "instance créée");
  assert(typeof rec.recordExo === "function", "méthode recordExo présente");
  assert(typeof rec.enregistrerSeance === "function", "méthode enregistrerSeance présente");
});

// ════════════════════════════════════════════════════════════════════════
// 2. Le Router câble bien le Recorder
// ════════════════════════════════════════════════════════════════════════
console.log("\n2. Câblage dans le Router");

const routerSrc = await readFile(new URL("./core/Router.js", import.meta.url), "utf8");

test("Router.js exige recorder dans les options", () => {
  assert(
    routerSrc.includes('options.recorder') &&
    routerSrc.includes('recorder requis'),
    "le Router ne vérifie pas la présence du recorder"
  );
});

test("Router.js stocke le recorder dans _recorder", () => {
  assert(routerSrc.includes('this._recorder = options.recorder'), "_recorder non stocké");
});

test("Router.js appelle recorder.recordExo en stream", () => {
  assert(
    routerSrc.includes('this._recorder.recordExo'),
    "le Router n'appelle pas recordExo en stream"
  );
});

test("Router.js appelle recorder.enregistrerSeance en fin de séance", () => {
  assert(
    routerSrc.includes('this._recorder.enregistrerSeance') ||
    routerSrc.includes('_enregistrerSeanceSafe'),
    "le Router ne déclenche pas enregistrerSeance en fin de séance"
  );
});

test("Router.js fige la date de la séance au montage", () => {
  // On vérifie que dateSession (ou nom équivalent) est capturée au montage
  // pour éviter les bugs à minuit pile.
  assert(
    routerSrc.includes('dateSession') ||
    routerSrc.includes('dateISOSeance'),
    "la date de séance ne semble pas figée au montage"
  );
});

// ════════════════════════════════════════════════════════════════════════
// 3. ExerciseScreen expose le callback onAnswer
// ════════════════════════════════════════════════════════════════════════
console.log("\n3. Câblage dans ExerciseScreen");

const exerciseSrc = await readFile(
  new URL("./screens/ExerciseScreen.js", import.meta.url), "utf8"
);

test("ExerciseScreen accepte une option onAnswer", () => {
  assert(
    exerciseSrc.includes('options.onAnswer'),
    "ExerciseScreen ne lit pas options.onAnswer"
  );
});

test("ExerciseScreen appelle this.onAnswer dans _onAnswered", () => {
  assert(
    exerciseSrc.includes('this.onAnswer('),
    "ExerciseScreen n'appelle pas this.onAnswer"
  );
});

test("ExerciseScreen protège l'appel onAnswer en try/catch", () => {
  // L'appel doit être en best-effort pour ne pas casser la séance si
  // le Recorder throw (cf. règle de robustesse côté UX).
  // On cherche le pattern try {  ... onAnswer ... } catch.
  const m = exerciseSrc.match(/try\s*\{[^}]*this\.onAnswer\([^}]*\}\s*catch/s);
  assert(m, "this.onAnswer n'est pas protégé par try/catch");
});

// ════════════════════════════════════════════════════════════════════════
// 4. main.js instancie et injecte le Recorder
// ════════════════════════════════════════════════════════════════════════
console.log("\n4. Câblage dans main.js");

const mainSrc = await readFile(new URL("./main.js", import.meta.url), "utf8");

test("main.js importe SessionRecorderService", () => {
  assert(
    mainSrc.includes("SessionRecorderService"),
    "import manquant"
  );
});

test("main.js instancie un SessionRecorderService", () => {
  assert(
    mainSrc.includes("new SessionRecorderService"),
    "instanciation manquante"
  );
});

test("main.js passe le recorder au Router", () => {
  // On cherche `recorder` (ou `recorder,`) dans le bloc d'options du Router.
  // Pattern : new Router(..., { ..., recorder, ... })
  const m = mainSrc.match(/new Router\([^)]*recorder[^)]*\)/s);
  assert(m, "recorder ne semble pas passé au Router");
});

test("main.js expose le recorder dans window.app pour debug", () => {
  assert(
    mainSrc.includes("recorder") && mainSrc.includes("window.app"),
    "recorder non exposé dans window.app"
  );
});

// ════════════════════════════════════════════════════════════════════════
// 5. Smoke test bout-en-bout : un scénario complet stream + batch
// ════════════════════════════════════════════════════════════════════════
console.log("\n5. Smoke test : scénario réaliste stream + batch");

test("Scénario complet d'une séance Max le 2026-05-21", () => {
  // ATTENTION : RebrassageService utilise le SINGLETON userState exporté
  // depuis UserStateService.js, pas une instance qu'on lui injecte. On
  // doit donc utiliser ce même singleton pour que les écritures du
  // Rebrassage soient visibles via nos lectures.
  return import("./services/UserStateService.js").then(({ userState: us }) => {
    us.clear();
    const rec = new SessionRecorderService({ userState: us, rebrassage });
    const date = "2026-05-21";

    // Pendant la séance : 4 exos stream (3 succès + 1 échec)
    rec.recordExo("max", 12, "mcq", true, date);
    rec.recordExo("max", 12, "typing_fr", true, date);
    rec.recordExo("max", 25, "mcq", false, date);   // échec ignoré
    rec.recordExo("max", 25, "mcq", true, date);    // réussite à la 2e tentative

    // exosProgress reflète les succès, pas les échecs
    assert(JSON.stringify(us.getExosProgress("max", 12)) === '["mcq","typing_fr"]',
      `exosProgress 12 incorrect : ${JSON.stringify(us.getExosProgress("max", 12))}`);
    assert(JSON.stringify(us.getExosProgress("max", 25)) === '["mcq"]',
      `exosProgress 25 incorrect : ${JSON.stringify(us.getExosProgress("max", 25))}`);
    // Cycle pas encore touché
    assert(us.getWordProgress("max", 12) === null,
      "cycle ne devrait pas être touché en stream");

    // Fin de séance : batch
    const ret = rec.enregistrerSeance("max", [
      { word: { id: 12 }, mode: "mcq", success: true },
      { word: { id: 12 }, mode: "typing_fr", success: true },
      { word: { id: 25 }, mode: "mcq", success: false },
      { word: { id: 25 }, mode: "mcq", success: true },
    ], date);

    assert(ret.processed === 2, `processed=${ret.processed} (attendu 2)`);
    // Critère TEMP Pas 10 : ≥1 succès → mot validé → passage en j1
    assert(us.getWordProgress("max", 12).etape === "j1",
      `12 devrait être en j1, est en ${us.getWordProgress("max", 12)?.etape}`);
    assert(us.getWordProgress("max", 25).etape === "j1",
      `25 devrait être en j1 (≥1 succès), est en ${us.getWordProgress("max", 25)?.etape}`);
    // Acquis aujourd'hui
    assert(us.isWordAcquiredToday("max", 12), "12 acquiredToday");
    assert(us.isWordAcquiredToday("max", 25), "25 acquiredToday");
  });
});

// Petit délai pour laisser le promise du dernier test se résoudre
await Promise.all(pendingTests);
await new Promise(r => setTimeout(r, 50));

console.log("\n═════════════════════════════════════════════════════════════");
console.log(`Résultat : ${pass} OK · ${fail} échec(s)`);
console.log(fail === 0 ? "Tout passe ✓\n" : `${fail} test(s) en échec\n`);
process.exit(fail === 0 ? 0 : 1);
