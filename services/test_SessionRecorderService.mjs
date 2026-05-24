/**
 * Tests unitaires pour SessionRecorderService.
 *
 * Lancer : node test_SessionRecorderService.mjs
 *
 * Stratégie : on utilise les VRAIS UserStateService et RebrassageService
 * (pas de mocks), parce qu'ils sont déjà couverts par leurs propres
 * tests et que la valeur du recorder est précisément qu'il fait jouer
 * ces deux services correctement ENSEMBLE. Doubler avec des mocks
 * masquerait des bugs d'intégration.
 *
 * Mock localStorage minimal pour pouvoir exécuter en Node, identique
 * aux autres suites.
 */

// ─── Mock localStorage (doit être en place AVANT l'import des services) ─
class FakeLocalStorage {
  constructor() { this._data = new Map(); }
  getItem(k) { return this._data.has(k) ? this._data.get(k) : null; }
  setItem(k, v) { this._data.set(k, String(v)); }
  removeItem(k) { this._data.delete(k); }
  clear() { this._data.clear(); }
}
globalThis.localStorage = new FakeLocalStorage();

// ─── Imports après mock ─────────────────────────────────────────────────
const { userState } = await import("./UserStateService.js");
const { rebrassage } = await import("./RebrassageService.js");
const { SessionRecorderService } = await import("./SessionRecorderService.js");

// ─── Mini framework de test ────────────────────────────────────────────
let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  // Reset complet avant chaque test pour l'isolation
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

function group(name) {
  console.log(`\n${name}`);
}

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

function shouldThrow(fn, msgMatch) {
  let threw = false;
  let actualMsg = "";
  try { fn(); } catch (err) { threw = true; actualMsg = err.message; }
  if (!threw) throw new Error("aurait dû lever une exception");
  if (msgMatch && !actualMsg.includes(msgMatch)) {
    throw new Error(`message attendu contient "${msgMatch}", reçu "${actualMsg}"`);
  }
}

// Aide : crée un résultat ExerciseScreen-compatible
function r(wordId, mode, success) {
  return { word: { id: wordId }, mode, success };
}

// Aide : crée un Recorder avec les VRAIS services (mais isolé via clear)
function makeRecorder() {
  return new SessionRecorderService({ userState, rebrassage });
}

// ═══════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════

group("1. Construction et validation des dépendances");

test("Constructeur sans userState lève une erreur explicite", () => {
  shouldThrow(
    () => new SessionRecorderService({ rebrassage }),
    "userState"
  );
});

test("Constructeur sans rebrassage lève une erreur explicite", () => {
  shouldThrow(
    () => new SessionRecorderService({ userState }),
    "rebrassage"
  );
});

test("Constructeur avec les deux dépendances réussit", () => {
  const rec = new SessionRecorderService({ userState, rebrassage });
  assert(rec instanceof SessionRecorderService);
});

// ─────────────────────────────────────────────────────────────────────
group("2. recordExo (mode stream)");

test("recordExo stocke un succès dans exosProgress", () => {
  const rec = makeRecorder();
  rec.recordExo("max", 12, "mcq", true, "2026-05-21");
  eq(userState.getExosProgress("max", 12), ["mcq"]);
});

test("recordExo n'enregistre PAS les échecs (D6 N3c)", () => {
  const rec = makeRecorder();
  rec.recordExo("max", 12, "mcq", false, "2026-05-21");
  eq(userState.getExosProgress("max", 12), []);
});

test("recordExo en stream : plusieurs modes pour un même mot", () => {
  const rec = makeRecorder();
  rec.recordExo("max", 12, "mcq", true, "2026-05-21");
  rec.recordExo("max", 12, "textInput", true, "2026-05-21");
  rec.recordExo("max", 12, "audio", false, "2026-05-21");  // ignoré
  eq(userState.getExosProgress("max", 12), ["mcq", "textInput"]);
});

test("recordExo est idempotent (succès du même mode rejoué)", () => {
  const rec = makeRecorder();
  rec.recordExo("max", 12, "mcq", true, "2026-05-21");
  rec.recordExo("max", 12, "mcq", true, "2026-05-21");
  eq(userState.getExosProgress("max", 12), ["mcq"]);
});

test("recordExo avec date invalide est un no-op silencieux", () => {
  const rec = makeRecorder();
  rec.recordExo("max", 12, "mcq", true, "bidon");
  rec.recordExo("max", 12, "mcq", true, "");
  rec.recordExo("max", 12, "mcq", true, null);
  eq(userState.getExosProgress("max", 12), []);
});

test("recordExo avec mode invalide est un no-op silencieux", () => {
  const rec = makeRecorder();
  rec.recordExo("max", 12, "", true, "2026-05-21");
  rec.recordExo("max", 12, null, true, "2026-05-21");
  rec.recordExo("max", 12, 42, true, "2026-05-21");
  eq(userState.getExosProgress("max", 12), []);
});

test("recordExo n'a AUCUN effet sur le cycle de rebrassage", () => {
  const rec = makeRecorder();
  rec.recordExo("max", 12, "mcq", true, "2026-05-21");
  rec.recordExo("max", 12, "textInput", true, "2026-05-21");
  // Le cycle n'est jamais touché par recordExo
  eq(userState.getWordProgress("max", 12), null);
});

// ─────────────────────────────────────────────────────────────────────
group("3. enregistrerSeance — validation des inputs");

test("date invalide → exception", () => {
  const rec = makeRecorder();
  shouldThrow(
    () => rec.enregistrerSeance("max", [], "bidon"),
    "date invalide"
  );
});

test("results non-tableau → exception", () => {
  const rec = makeRecorder();
  shouldThrow(
    () => rec.enregistrerSeance("max", "pas un tableau", "2026-05-21"),
    "tableau"
  );
});

test("childId manquant → exception", () => {
  const rec = makeRecorder();
  shouldThrow(
    () => rec.enregistrerSeance("", [], "2026-05-21"),
    "childId"
  );
});

test("results vide est valide (séance abort sans aucun exo)", () => {
  const rec = makeRecorder();
  const ret = rec.enregistrerSeance("max", [], "2026-05-21");
  eq(ret, { processed: 0, skipped: 0 });
});

// ─────────────────────────────────────────────────────────────────────
group("4. enregistrerSeance — J+0 inaugural (mot jamais introduit)");

test("Mot nouveau réussi → introduit en j1 le lendemain", () => {
  const rec = makeRecorder();
  const ret = rec.enregistrerSeance("max", [r(12, "mcq", true)], "2026-05-21");
  eq(ret, { processed: 1, skipped: 0 });
  const p = userState.getWordProgress("max", 12);
  eq(p.etape, "j1");
  eq(p.dateIntroduction, "2026-05-21");
  eq(p.dateProchainRebrassage, "2026-05-22");
});

test("Mot nouveau raté → reste en j0, revient demain", () => {
  const rec = makeRecorder();
  rec.enregistrerSeance("max", [r(12, "mcq", false)], "2026-05-21");
  const p = userState.getWordProgress("max", 12);
  eq(p.etape, "j0");
  eq(p.dateProchainRebrassage, "2026-05-22");
});

test("Marquage acquiredToday après une séance réussie", () => {
  const rec = makeRecorder();
  rec.enregistrerSeance("max", [r(12, "mcq", true)], "2026-05-21");
  assert(userState.isWordAcquiredToday("max", 12), "12 acquis aujourd'hui");
});

test("Marquage acquiredToday même en cas d'échec (= traité aujourd'hui)", () => {
  const rec = makeRecorder();
  rec.enregistrerSeance("max", [r(12, "mcq", false)], "2026-05-21");
  assert(userState.isWordAcquiredToday("max", 12), "12 traité aujourd'hui");
});

// ─────────────────────────────────────────────────────────────────────
group("5. enregistrerSeance — agrégation par mot");

test("Plusieurs modes pour un même mot : ≥1 succès → success agrégé", () => {
  const rec = makeRecorder();
  // Critère TEMP Pas 10 : ≥1 réussi sur les 3 → mot validé
  rec.enregistrerSeance("max", [
    r(12, "mcq", false),
    r(12, "textInput", true),
    r(12, "audio", false),
  ], "2026-05-21");
  eq(userState.getWordProgress("max", 12).etape, "j1");  // passé à j1
});

test("Plusieurs modes pour un même mot : 0 succès → échec agrégé", () => {
  const rec = makeRecorder();
  rec.enregistrerSeance("max", [
    r(12, "mcq", false),
    r(12, "textInput", false),
  ], "2026-05-21");
  eq(userState.getWordProgress("max", 12).etape, "j0");  // reste j0
});

test("Plusieurs mots dans une même séance, traités indépendamment", () => {
  const rec = makeRecorder();
  const ret = rec.enregistrerSeance("max", [
    r(12, "mcq", true),
    r(25, "mcq", false),
    r(33, "mcq", true),
  ], "2026-05-21");
  eq(ret.processed, 3);
  eq(userState.getWordProgress("max", 12).etape, "j1");
  eq(userState.getWordProgress("max", 25).etape, "j0");
  eq(userState.getWordProgress("max", 33).etape, "j1");
});

// ─────────────────────────────────────────────────────────────────────
group("6. enregistrerSeance — mot déjà en cycle (J+1)");

test("Mot en j1 réussi → passe à j7 (via enregistrerRebrassage)", () => {
  const rec = makeRecorder();
  // Pré-condition : mot déjà introduit, à j1
  userState.setWordProgress("max", 12, {
    etape: "j1",
    dateIntroduction: "2026-05-20",
    dateProchainRebrassage: "2026-05-21",
    historique: [{ date: "2026-05-20", statut: "j0", resultat: "ok" }],
  });
  rec.enregistrerSeance("max", [r(12, "mcq", true)], "2026-05-21");
  eq(userState.getWordProgress("max", 12).etape, "j7");
});

test("Mot en j1 raté → reset complet à j0 (cf. spec §7.4)", () => {
  const rec = makeRecorder();
  userState.setWordProgress("max", 12, {
    etape: "j1",
    dateIntroduction: "2026-05-20",
    dateProchainRebrassage: "2026-05-21",
    historique: [{ date: "2026-05-20", statut: "j0", resultat: "ok" }],
  });
  rec.enregistrerSeance("max", [r(12, "mcq", false)], "2026-05-21");
  // Spec §7.4 : chute = retour j0, date intro écrasée
  eq(userState.getWordProgress("max", 12).etape, "j0");
});

// ─────────────────────────────────────────────────────────────────────
group("7. Idempotence (double appel à enregistrerSeance)");

test("Deuxième appel sur le même mot → skip", () => {
  const rec = makeRecorder();
  rec.enregistrerSeance("max", [r(12, "mcq", true)], "2026-05-21");
  const stateApres1er = JSON.stringify(userState.getWordProgress("max", 12));

  const ret = rec.enregistrerSeance("max", [r(12, "mcq", true)], "2026-05-21");
  eq(ret, { processed: 0, skipped: 1 });

  // L'état du mot n'a PAS bougé entre les deux appels
  eq(JSON.stringify(userState.getWordProgress("max", 12)), stateApres1er);
});

test("Idempotence partielle : nouveaux mots traités, anciens skippés", () => {
  const rec = makeRecorder();
  rec.enregistrerSeance("max", [r(12, "mcq", true)], "2026-05-21");

  // Deuxième séance : 12 (déjà fait) + 25 (nouveau)
  const ret = rec.enregistrerSeance("max", [
    r(12, "mcq", true),
    r(25, "mcq", true),
  ], "2026-05-21");
  eq(ret, { processed: 1, skipped: 1 });
  eq(userState.getWordProgress("max", 25).etape, "j1");
});

// ─────────────────────────────────────────────────────────────────────
group("8. Garde-fou séance révision (filet de sécurité Pas 11)");

test("Mot en j7 dans une séance normale → exception explicite", () => {
  const rec = makeRecorder();
  userState.setWordProgress("max", 12, {
    etape: "j7",
    dateIntroduction: "2026-05-10",
    dateProchainRebrassage: "2026-05-17",
    historique: [],
  });
  shouldThrow(
    () => rec.enregistrerSeance("max", [r(12, "mcq", true)], "2026-05-21"),
    "séance révision non supportée"
  );
});

test("Mot en j30 dans une séance normale → exception explicite", () => {
  const rec = makeRecorder();
  userState.setWordProgress("max", 12, {
    etape: "j30",
    dateIntroduction: "2026-04-01",
    dateProchainRebrassage: "2026-05-01",
    historique: [],
  });
  shouldThrow(
    () => rec.enregistrerSeance("max", [r(12, "mcq", true)], "2026-05-21"),
    "j30"
  );
});

test("Mot en j90 dans une séance normale → exception explicite", () => {
  const rec = makeRecorder();
  userState.setWordProgress("max", 12, {
    etape: "j90",
    dateIntroduction: "2026-02-01",
    dateProchainRebrassage: "2026-05-01",
    historique: [],
  });
  shouldThrow(
    () => rec.enregistrerSeance("max", [r(12, "mcq", true)], "2026-05-21"),
    "j90"
  );
});

test("Mot 'acquis' dans une séance normale → skip silencieux (pas d'exception)", () => {
  const rec = makeRecorder();
  // Mot déjà sorti du cycle (cas anormal mais non bloquant)
  userState.setWordProgress("max", 12, {
    etape: "acquis",
    dateIntroduction: "2026-02-01",
    dateProchainRebrassage: null,
    historique: [],
  });
  const ret = rec.enregistrerSeance("max", [r(12, "mcq", true)], "2026-05-21");
  eq(ret, { processed: 0, skipped: 1 });
  // Mot toujours acquis, pas réintroduit
  eq(userState.getWordProgress("max", 12).etape, "acquis");
});

// ─────────────────────────────────────────────────────────────────────
group("9. Tolérance aux entrées malformées dans results");

test("Entrées malformées dans results sont ignorées", () => {
  const rec = makeRecorder();
  const ret = rec.enregistrerSeance("max", [
    null,                                  // ignoré
    "string",                              // ignoré
    { word: null },                        // ignoré
    { word: {} },                          // pas d'id, ignoré
    { word: { id: "abc" }, mode: "mcq", success: true },  // id non numérique
    { word: { id: 12 } },                  // pas de mode, ignoré
    { word: { id: 12 }, mode: 42, success: true },  // mode non-string
    { word: { id: 12 }, mode: "mcq", success: "yes" }, // success non-bool
    r(12, "mcq", true),                    // ← seul résultat valide
  ], "2026-05-21");
  eq(ret, { processed: 1, skipped: 0 });
  eq(userState.getWordProgress("max", 12).etape, "j1");
});

// ─────────────────────────────────────────────────────────────────────
group("10. Étanchéité entre enfants");

test("La séance de max n'affecte pas julie", () => {
  const rec = makeRecorder();
  rec.enregistrerSeance("max", [r(12, "mcq", true)], "2026-05-21");
  eq(userState.getWordProgress("max", 12).etape, "j1");
  eq(userState.getWordProgress("julie", 12), null);
  assert(!userState.isWordAcquiredToday("julie", 12));
});

// ─────────────────────────────────────────────────────────────────────
group("11. Combinaison stream + batch (scénario réaliste)");

test("Stream pendant la séance + batch en fin → exosProgress ET cycle", () => {
  const rec = makeRecorder();

  // Pendant la séance : 3 exos réussis stream
  rec.recordExo("max", 12, "mcq", true, "2026-05-21");
  rec.recordExo("max", 12, "textInput", true, "2026-05-21");
  rec.recordExo("max", 25, "mcq", true, "2026-05-21");

  // Vérif intermédiaire : exosProgress en place, cycle pas encore touché
  eq(userState.getExosProgress("max", 12), ["mcq", "textInput"]);
  eq(userState.getExosProgress("max", 25), ["mcq"]);
  eq(userState.getWordProgress("max", 12), null);  // cycle pas touché

  // Fin de séance : batch
  rec.enregistrerSeance("max", [
    r(12, "mcq", true),
    r(12, "textInput", true),
    r(25, "mcq", true),
  ], "2026-05-21");

  // Maintenant le cycle a avancé
  eq(userState.getWordProgress("max", 12).etape, "j1");
  eq(userState.getWordProgress("max", 25).etape, "j1");
  // Et exosProgress est toujours en place (cohérent avec acquiredToday)
  eq(userState.getExosProgress("max", 12), ["mcq", "textInput"]);
});

// ═══════════════════════════════════════════════════════════════════════
// SYNTHÈSE
// ═══════════════════════════════════════════════════════════════════════

console.log("\n" + "═".repeat(60));
console.log(`Résultat : ${passed} OK · ${failed} échec(s)`);
if (failed > 0) {
  console.log("\nDétails des échecs :");
  for (const f of failures) {
    console.log(`  ✗ ${f.name}`);
    console.log(`      ${f.err.stack || f.err.message}`);
  }
  process.exit(1);
}
console.log("Tout passe ✓");
