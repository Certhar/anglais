/**
 * Tests pour RebrassageService.
 *
 * Lancer : node test_RebrassageService.mjs
 *
 * Comme pour UserStateService, on mock localStorage en amont pour que
 * la persistance fonctionne en Node.
 */

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
const { rebrassage, RebrassageService } = await import("./RebrassageService.js");

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

// ─── Aides date pour les tests ─────────────────────────────────────────

// Calendrier de référence pour les tests (vérifié à la main) :
//   2026-05-17 = dimanche
//   2026-05-18 = lundi
//   2026-05-19 = mardi
//   2026-05-20 = mercredi ← JOUR PIVOT
//   2026-05-21 = jeudi
//   2026-05-22 = vendredi
//   2026-05-23 = samedi
//   2026-05-24 = dimanche
//   2026-05-25 = lundi
//   2026-05-27 = mercredi suivant
//   2026-06-10 = mercredi
//   2026-07-15 = mercredi

// ═══════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════

group("1. Helpers de date (alignerSurJourPivot, calculerDateProchainPalier)");

test("alignerSurJourPivot : un mercredi reste mercredi", () => {
  eq(rebrassage.alignerSurJourPivot("2026-05-20"), "2026-05-20");
});

test("alignerSurJourPivot : jeudi → mercredi précédent (-1)", () => {
  eq(rebrassage.alignerSurJourPivot("2026-05-21"), "2026-05-20");
});

test("alignerSurJourPivot : mardi → mercredi suivant (+1)", () => {
  eq(rebrassage.alignerSurJourPivot("2026-05-19"), "2026-05-20");
});

test("alignerSurJourPivot : vendredi → mercredi précédent (-2)", () => {
  eq(rebrassage.alignerSurJourPivot("2026-05-22"), "2026-05-20");
});

test("alignerSurJourPivot : lundi → mercredi suivant (+2)", () => {
  eq(rebrassage.alignerSurJourPivot("2026-05-25"), "2026-05-27");
});

test("alignerSurJourPivot : samedi → mercredi précédent (-3)", () => {
  eq(rebrassage.alignerSurJourPivot("2026-05-23"), "2026-05-20");
});

test("alignerSurJourPivot : dimanche → ÉGALITÉ → mercredi SUIVANT (+3)", () => {
  // distBack=4 (dim → mer précédent), distForward=3 (dim → mer suivant)
  // Donc en fait pas d'égalité parfaite : 3 < 4, mercredi suivant.
  // (Note : il n'y a pas de cas d'égalité parfaite avec un mercredi
  //  comme pivot, car 7 jours est impair. L'algorithme est néanmoins
  //  écrit pour gérer l'égalité au cas où le pivot deviendrait
  //  configurable un jour.)
  eq(rebrassage.alignerSurJourPivot("2026-05-24"), "2026-05-27");
});

test("alignerSurJourPivot : date invalide → inchangée", () => {
  eq(rebrassage.alignerSurJourPivot("pas une date"), "pas une date");
});

test("calculerDateProchainPalier j0 → j1 : lendemain BRUT (pas d'alignement)", () => {
  // Mardi 19 → +1 = mercredi 20. j1 est court, on stocke brut.
  // Conséquence : si demain est un mercredi, le j1 sera ignoré ce
  // jour-là (séance révision longue) et apparaîtra le jeudi.
  eq(rebrassage.calculerDateProchainPalier("j0", "2026-05-19"), "2026-05-20");
});

test("calculerDateProchainPalier j0 → j1 : lendemain brut un jour normal", () => {
  // Lundi 18 → +1 = mardi 19, pas d'alignement.
  eq(rebrassage.calculerDateProchainPalier("j0", "2026-05-18"), "2026-05-19");
});

test("calculerDateProchainPalier j1 → j7 : aligné sur mercredi le plus proche", () => {
  // Lundi 18 mai → +6 = dimanche 24 → aligné mer suivant (27 mai)
  eq(rebrassage.calculerDateProchainPalier("j1", "2026-05-18"), "2026-05-27");
});

test("calculerDateProchainPalier j1 → j7 : déjà un mercredi naturel", () => {
  // Jeudi 21 mai → +6 = mercredi 27 → on garde tel quel
  eq(rebrassage.calculerDateProchainPalier("j1", "2026-05-21"), "2026-05-27");
});

test("calculerDateProchainPalier j7 → j30 : tombe pile un mercredi", () => {
  // Lundi 18 mai → +23 = mercredi 10 juin (cf calendrier) → on garde
  eq(rebrassage.calculerDateProchainPalier("j7", "2026-05-18"), "2026-06-10");
});

test("calculerDateProchainPalier j7 → j30 : invariant mercredi quelle que soit la date d'entrée", () => {
  // On teste tous les jours de la semaine pour s'assurer que la date
  // de sortie est TOUJOURS un mercredi pour les paliers longs.
  for (const d of ["2026-05-17", "2026-05-18", "2026-05-19", "2026-05-20",
                   "2026-05-21", "2026-05-22", "2026-05-23"]) {
    const result = rebrassage.calculerDateProchainPalier("j7", d);
    const [y, m, dd] = result.split("-").map(Number);
    const dow = new Date(y, m - 1, dd).getDay();
    assert(dow === 3, `j7 réussi le ${d} → ${result} devrait être un mercredi (jour ${dow})`);
  }
});

test("calculerDateProchainPalier j30 → j90 : invariant mercredi", () => {
  // 17 mai (dim) + 60 = 16 juillet (jeu) → mer le plus proche = 15 juillet
  eq(rebrassage.calculerDateProchainPalier("j30", "2026-05-17"), "2026-07-15");
});

test("calculerDateProchainPalier j90 réussi → null (mot acquis, plus de date)", () => {
  eq(rebrassage.calculerDateProchainPalier("j90", "2026-05-18"), null);
});

test("calculerDateProchainPalier date invalide → null", () => {
  eq(rebrassage.calculerDateProchainPalier("j0", "hier"), null);
});

group("2. introduireMot");

test("introduireMot success=true → etape j1, prochain rebrassage demain", () => {
  // Lundi 18 mai → demain = mardi 19
  rebrassage.introduireMot("max", 42, "2026-05-18", true);
  const e = userState.getWordProgress("max", 42);
  eq(e.etape, "j1");
  eq(e.dateIntroduction, "2026-05-18");
  eq(e.dateProchainRebrassage, "2026-05-19");
  eq(e.historique.length, 1);
  eq(e.historique[0], { date: "2026-05-18", statut: "j0", resultat: "ok" });
});

test("introduireMot success=true un mardi → demain = mercredi BRUT (pas d'alignement)", () => {
  // Mardi 19 → demain = mercredi 20. j1 est court, on stocke le
  // lendemain brut. Le mercredi étant jour de révision longue, ce
  // j1 sera ignoré ce jour-là et réapparaîtra naturellement le jeudi.
  rebrassage.introduireMot("max", 42, "2026-05-19", true);
  const e = userState.getWordProgress("max", 42);
  eq(e.dateProchainRebrassage, "2026-05-20");
});

test("introduireMot success=false (chute) → reste j0, revient demain", () => {
  rebrassage.introduireMot("max", 42, "2026-05-18", false);
  const e = userState.getWordProgress("max", 42);
  eq(e.etape, "j0");
  eq(e.dateIntroduction, "2026-05-18");
  eq(e.dateProchainRebrassage, "2026-05-19");
  eq(e.historique.length, 1);
  eq(e.historique[0].resultat, "chute");
});

test("introduireMot chute un mardi → demain = mercredi BRUT", () => {
  // Idem succès : lendemain brut, pas d'alignement (j0 est court).
  rebrassage.introduireMot("max", 42, "2026-05-19", false);
  const e = userState.getWordProgress("max", 42);
  eq(e.dateProchainRebrassage, "2026-05-20");
});

test("introduireMot avec date invalide → no-op", () => {
  rebrassage.introduireMot("max", 42, "demain", true);
  eq(userState.getWordProgress("max", 42), null);
});

group("3. enregistrerRebrassage : succès aux différents paliers");

test("j1 réussi → passe j7, dateIntroduction préservée, date alignée mercredi", () => {
  // Mise en place : mot en j1, introduit le 18, qu'on rebrasse le 19
  rebrassage.introduireMot("max", 42, "2026-05-18", true);
  rebrassage.enregistrerRebrassage("max", 42, "2026-05-19", true);
  const e = userState.getWordProgress("max", 42);
  eq(e.etape, "j7");
  eq(e.dateIntroduction, "2026-05-18"); // PRÉSERVÉE
  // 19 mai (mar) + 6 = 25 mai (lun) → aligné mer suivant = 27 mai
  eq(e.dateProchainRebrassage, "2026-05-27");
  eq(e.historique.length, 2);
  eq(e.historique[1], { date: "2026-05-19", statut: "j1", resultat: "ok" });
});

test("j7 réussi → passe j30, date alignée mercredi", () => {
  // On force directement l'état pour gagner du temps
  userState.setWordProgress("max", 42, {
    etape: "j7",
    dateIntroduction: "2026-05-10",
    dateProchainRebrassage: "2026-05-17",
    historique: [{ date: "2026-05-10", statut: "j0", resultat: "ok" }],
  });
  // Rebrassage j7 réussi le 17 mai (dimanche)
  rebrassage.enregistrerRebrassage("max", 42, "2026-05-17", true);
  const e = userState.getWordProgress("max", 42);
  eq(e.etape, "j30");
  eq(e.dateIntroduction, "2026-05-10");
  // 17 mai (dim) + 23 = 9 juin (mar) → aligné mer = 10 juin
  eq(e.dateProchainRebrassage, "2026-06-10");
});

test("j30 réussi → passe j90, date alignée mercredi", () => {
  userState.setWordProgress("max", 42, {
    etape: "j30",
    dateIntroduction: "2026-04-10",
    dateProchainRebrassage: "2026-05-17",
    historique: [],
  });
  rebrassage.enregistrerRebrassage("max", 42, "2026-05-17", true);
  const e = userState.getWordProgress("max", 42);
  eq(e.etape, "j90");
  // 17 mai (dim) + 60 = 16 juillet (jeu) → mer le plus proche = 15 juillet
  eq(e.dateProchainRebrassage, "2026-07-15");
});

test("j90 réussi → mot ACQUIS, dateProchainRebrassage = null", () => {
  userState.setWordProgress("max", 42, {
    etape: "j90",
    dateIntroduction: "2026-02-10",
    dateProchainRebrassage: "2026-05-17",
    historique: [],
  });
  rebrassage.enregistrerRebrassage("max", 42, "2026-05-17", true);
  const e = userState.getWordProgress("max", 42);
  eq(e.etape, "acquis");
  eq(e.dateProchainRebrassage, null);
});

group("4. enregistrerRebrassage : chutes (reset complet)");

test("Chute en j1 → RESET : retour j0, dateIntroduction écrasée à aujourd'hui", () => {
  rebrassage.introduireMot("max", 42, "2026-05-10", true);
  // Plusieurs jours après, rebrassage j1 → chute
  rebrassage.enregistrerRebrassage("max", 42, "2026-05-18", false);
  const e = userState.getWordProgress("max", 42);
  eq(e.etape, "j0");
  eq(e.dateIntroduction, "2026-05-18"); // ÉCRASÉE
  eq(e.dateProchainRebrassage, "2026-05-19");
  // Historique préservé : l'enfant peut avoir l'historique complet de ses
  // tentatives, c'est précieux pour les stats
  eq(e.historique.length, 2);
  eq(e.historique[1].resultat, "chute");
});

test("Chute en j7 → RESET pareil", () => {
  userState.setWordProgress("max", 42, {
    etape: "j7",
    dateIntroduction: "2026-05-01",
    dateProchainRebrassage: "2026-05-17",
    historique: [{ date: "2026-05-01", statut: "j0", resultat: "ok" }],
  });
  rebrassage.enregistrerRebrassage("max", 42, "2026-05-18", false);
  const e = userState.getWordProgress("max", 42);
  eq(e.etape, "j0");
  eq(e.dateIntroduction, "2026-05-18");
  eq(e.historique.length, 2);
});

test("Chute en j30 → RESET", () => {
  userState.setWordProgress("max", 42, {
    etape: "j30",
    dateIntroduction: "2026-04-01",
    dateProchainRebrassage: "2026-05-18",
    historique: [],
  });
  rebrassage.enregistrerRebrassage("max", 42, "2026-05-18", false);
  eq(userState.getWordProgress("max", 42).etape, "j0");
});

test("Chute en j90 → RESET (le mot perd son acquisition)", () => {
  userState.setWordProgress("max", 42, {
    etape: "j90",
    dateIntroduction: "2026-02-01",
    dateProchainRebrassage: "2026-05-18",
    historique: [],
  });
  rebrassage.enregistrerRebrassage("max", 42, "2026-05-18", false);
  eq(userState.getWordProgress("max", 42).etape, "j0");
});

group("5. Cas limites");

test("enregistrerRebrassage sur un mot acquis = no-op silencieux", () => {
  userState.setWordProgress("max", 42, {
    etape: "acquis",
    dateIntroduction: "2026-01-01",
    dateProchainRebrassage: null,
    historique: [],
  });
  rebrassage.enregistrerRebrassage("max", 42, "2026-05-18", false);
  // Toujours acquis
  eq(userState.getWordProgress("max", 42).etape, "acquis");
});

test("enregistrerRebrassage sur un mot inconnu = no-op (avec warn)", () => {
  // On capte les console.warn pour ne pas polluer
  const origWarn = console.warn;
  let warned = false;
  console.warn = () => { warned = true; };
  try {
    rebrassage.enregistrerRebrassage("max", 999, "2026-05-18", true);
  } finally {
    console.warn = origWarn;
  }
  eq(userState.getWordProgress("max", 999), null);
  assert(warned, "un warn devrait être loggué");
});

test("enregistrerRebrassage avec date invalide = no-op", () => {
  rebrassage.introduireMot("max", 42, "2026-05-18", true);
  rebrassage.enregistrerRebrassage("max", 42, "demain", false);
  // L'état reste celui d'après introduireMot
  const e = userState.getWordProgress("max", 42);
  eq(e.etape, "j1");
});

group("6. getMotsDus : séparation j1 / lourds");

function seedScenario() {
  // Mot 1 : j1 dû aujourd'hui (léger)
  userState.setWordProgress("max", 1, {
    etape: "j1", dateIntroduction: "2026-05-17",
    dateProchainRebrassage: "2026-05-18", historique: [],
  });
  // Mot 2 : j7 dû aujourd'hui (lourd)
  userState.setWordProgress("max", 2, {
    etape: "j7", dateIntroduction: "2026-05-11",
    dateProchainRebrassage: "2026-05-18", historique: [],
  });
  // Mot 3 : j0 (chute) dû aujourd'hui (lourd)
  userState.setWordProgress("max", 3, {
    etape: "j0", dateIntroduction: "2026-05-17",
    dateProchainRebrassage: "2026-05-18", historique: [],
  });
  // Mot 4 : j30 en retard depuis le 15 (lourd, dette consolidation)
  userState.setWordProgress("max", 4, {
    etape: "j30", dateIntroduction: "2026-04-15",
    dateProchainRebrassage: "2026-05-15", historique: [],
  });
  // Mot 5 : j7 pas encore dû (le 25)
  userState.setWordProgress("max", 5, {
    etape: "j7", dateIntroduction: "2026-05-18",
    dateProchainRebrassage: "2026-05-25", historique: [],
  });
  // Mot 6 : acquis
  userState.setWordProgress("max", 6, {
    etape: "acquis", dateIntroduction: "2026-01-01",
    dateProchainRebrassage: null, historique: [],
  });
}

test("getMotsDus sépare j1 et lourds correctement", () => {
  seedScenario();
  const dus = rebrassage.getMotsDus("max", "2026-05-18");
  eq(dus.j1.sort(), [1]);
  eq(dus.lourds.sort(), [2, 3, 4]);
});

test("getMotsDus exclut les mots pas encore dus et les acquis", () => {
  seedScenario();
  const dus = rebrassage.getMotsDus("max", "2026-05-18");
  // 5 (pas dû) et 6 (acquis) absents
  assert(!dus.j1.includes(5) && !dus.lourds.includes(5));
  assert(!dus.j1.includes(6) && !dus.lourds.includes(6));
});

test("getMotsDus avec date future englobe tout sauf acquis", () => {
  seedScenario();
  const dus = rebrassage.getMotsDus("max", "9999-12-31");
  eq(dus.j1.sort(), [1]);
  eq(dus.lourds.sort(), [2, 3, 4, 5]); // 5 inclus, 6 acquis exclu
});

test("getMotsDus avec date invalide → vide", () => {
  seedScenario();
  const dus = rebrassage.getMotsDus("max", "n'importe quoi");
  eq(dus, { j1: [], lourds: [] });
});

group("7. hasDetteConsolidation");

test("hasDetteConsolidation true si un j7/j30/j90 est dû", () => {
  seedScenario();
  assert(rebrassage.hasDetteConsolidation("max", "2026-05-18"));
});

test("hasDetteConsolidation false avec seulement j1 dus", () => {
  userState.clear();
  userState.setWordProgress("max", 1, {
    etape: "j1", dateIntroduction: "2026-05-17",
    dateProchainRebrassage: "2026-05-18", historique: [],
  });
  assert(!rebrassage.hasDetteConsolidation("max", "2026-05-18"));
});

test("hasDetteConsolidation false avec seulement j0 (chutes)", () => {
  userState.clear();
  userState.setWordProgress("max", 1, {
    etape: "j0", dateIntroduction: "2026-05-17",
    dateProchainRebrassage: "2026-05-18", historique: [],
  });
  assert(!rebrassage.hasDetteConsolidation("max", "2026-05-18"),
    "j0 ne doit PAS déclencher de dette de consolidation");
});

test("hasDetteConsolidation false si rien à jour", () => {
  userState.clear();
  assert(!rebrassage.hasDetteConsolidation("max", "2026-05-18"));
});

group("8. Cycle complet d'un mot (intégration)");

test("Trajet nominal j0 → j1 → j7 → j30 → j90 → acquis", () => {
  // Helper local pour vérifier qu'une date est un mercredi
  const isMercredi = (d) => {
    const [y, m, dd] = d.split("-").map(Number);
    return new Date(y, m - 1, dd).getDay() === 3;
  };

  // J+0 lundi 18 mai 2026
  rebrassage.introduireMot("max", 42, "2026-05-18", true);
  let e = userState.getWordProgress("max", 42);
  eq(e.etape, "j1");
  const date_j1 = e.dateProchainRebrassage; // mardi 19 (lendemain brut, j1 court)
  eq(date_j1, "2026-05-19");

  rebrassage.enregistrerRebrassage("max", 42, date_j1, true);
  e = userState.getWordProgress("max", 42);
  eq(e.etape, "j7");
  const date_j7 = e.dateProchainRebrassage; // 19 + 6 = 25 (lun) → mer suivant = 27
  assert(isMercredi(date_j7), `date_j7=${date_j7} doit être un mercredi`);

  rebrassage.enregistrerRebrassage("max", 42, date_j7, true);
  e = userState.getWordProgress("max", 42);
  eq(e.etape, "j30");
  const date_j30 = e.dateProchainRebrassage;
  assert(isMercredi(date_j30), `date_j30=${date_j30} doit être un mercredi`);

  rebrassage.enregistrerRebrassage("max", 42, date_j30, true);
  e = userState.getWordProgress("max", 42);
  eq(e.etape, "j90");
  const date_j90 = e.dateProchainRebrassage;
  assert(isMercredi(date_j90), `date_j90=${date_j90} doit être un mercredi`);

  rebrassage.enregistrerRebrassage("max", 42, date_j90, true);
  e = userState.getWordProgress("max", 42);
  eq(e.etape, "acquis");
  eq(e.dateProchainRebrassage, null);

  // dateIntroduction n'a JAMAIS bougé
  eq(e.dateIntroduction, "2026-05-18");

  // Et l'historique compte 5 passages tous "ok"
  eq(e.historique.length, 5);
  for (const h of e.historique) {
    eq(h.resultat, "ok");
  }
});

test("Trajet avec une chute à mi-parcours = reset complet du cycle", () => {
  rebrassage.introduireMot("max", 42, "2026-05-18", true);
  let e = userState.getWordProgress("max", 42);
  rebrassage.enregistrerRebrassage("max", 42, e.dateProchainRebrassage, true);
  e = userState.getWordProgress("max", 42);
  // À ce stade : j7. On chute.
  const chuteDate = e.dateProchainRebrassage;
  rebrassage.enregistrerRebrassage("max", 42, chuteDate, false);
  e = userState.getWordProgress("max", 42);
  // Reset : j0, dateIntroduction = chuteDate
  eq(e.etape, "j0");
  eq(e.dateIntroduction, chuteDate);
  // Historique : 3 entrées (j0 ok, j1 ok, j7 chute)
  eq(e.historique.length, 3);
  eq(e.historique[2], { date: chuteDate, statut: "j7", resultat: "chute" });
});

group("9. Étanchéité entre enfants");

test("Le cycle d'un enfant n'affecte pas l'autre", () => {
  rebrassage.introduireMot("max", 42, "2026-05-18", true);
  eq(userState.getWordProgress("julie", 42), null);
  rebrassage.introduireMot("julie", 42, "2026-05-18", false);
  eq(userState.getWordProgress("max", 42).etape, "j1");
  eq(userState.getWordProgress("julie", 42).etape, "j0");
});

group("10. Invariant mercredi (régression sur la spec §7.5)");

test("Tout mot écrit en j7/j30/j90 a une dateProchainRebrassage mercredi", () => {
  // On simule 14 jours différents d'introduction pour vérifier que
  // peu importe la date d'entrée, on tombe toujours sur un mercredi
  // après le passage en palier long.
  const isMercredi = (d) => {
    const [y, m, dd] = d.split("-").map(Number);
    return new Date(y, m - 1, dd).getDay() === 3;
  };
  for (let offset = 0; offset < 14; offset++) {
    const date0 = new Date(2026, 4, 18); // 18 mai 2026 = lundi
    date0.setDate(date0.getDate() + offset);
    const y = date0.getFullYear();
    const m = String(date0.getMonth() + 1).padStart(2, "0");
    const d = String(date0.getDate()).padStart(2, "0");
    const dateISO = `${y}-${m}-${d}`;

    userState.clear();
    rebrassage.introduireMot("max", 1, dateISO, true);
    let e = userState.getWordProgress("max", 1);
    // j1 = lendemain brut, peut être n'importe quel jour
    rebrassage.enregistrerRebrassage("max", 1, e.dateProchainRebrassage, true);
    e = userState.getWordProgress("max", 1);
    // Maintenant on est en j7 : date DOIT être un mercredi
    eq(e.etape, "j7");
    assert(
      isMercredi(e.dateProchainRebrassage),
      `Introduction ${dateISO} → j7 le ${e.dateProchainRebrassage} (devrait être un mercredi)`
    );

    rebrassage.enregistrerRebrassage("max", 1, e.dateProchainRebrassage, true);
    e = userState.getWordProgress("max", 1);
    eq(e.etape, "j30");
    assert(
      isMercredi(e.dateProchainRebrassage),
      `j30 le ${e.dateProchainRebrassage} (devrait être un mercredi)`
    );

    rebrassage.enregistrerRebrassage("max", 1, e.dateProchainRebrassage, true);
    e = userState.getWordProgress("max", 1);
    eq(e.etape, "j90");
    assert(
      isMercredi(e.dateProchainRebrassage),
      `j90 le ${e.dateProchainRebrassage} (devrait être un mercredi)`
    );
  }
});

test("Filet de sécurité : warn si on tente d'écrire un j7 non-mercredi (via setWordProgress direct)", () => {
  // On ne peut atteindre cet état qu'en bypassant calculerDateProchainPalier,
  // mais le filet doit attraper un futur bug du genre.
  // En l'occurrence, le filet est dans la branche success de enregistrerRebrassage.
  // Pour le tester, on force un j1 puis on monkey-patche temporairement
  // alignerSurJourPivot pour le faire échouer.
  rebrassage.introduireMot("max", 1, "2026-05-18", true);

  const origAlign = rebrassage.alignerSurJourPivot;
  rebrassage.alignerSurJourPivot = (d) => d; // identité = ne fait rien

  const origWarn = console.warn;
  let warnMsg = "";
  console.warn = (...args) => { warnMsg = args.join(" "); };

  try {
    // 19 mai (mar) + 6 = 25 mai (lun), monkey-patch fait que ça reste 25 mai
    rebrassage.enregistrerRebrassage("max", 1, "2026-05-19", true);
  } finally {
    rebrassage.alignerSurJourPivot = origAlign;
    console.warn = origWarn;
  }

  assert(
    warnMsg.includes("invariant mercredi"),
    `Le warn devrait mentionner l'invariant mercredi, reçu : "${warnMsg}"`
  );
});

test("Pas de warn en fonctionnement normal (sanity check)", () => {
  // On vérifie qu'aucun warn n'est émis sur un cycle complet normal.
  const origWarn = console.warn;
  let warned = false;
  console.warn = () => { warned = true; };
  try {
    rebrassage.introduireMot("max", 1, "2026-05-18", true);
    let e = userState.getWordProgress("max", 1);
    rebrassage.enregistrerRebrassage("max", 1, e.dateProchainRebrassage, true); // j1→j7
    e = userState.getWordProgress("max", 1);
    rebrassage.enregistrerRebrassage("max", 1, e.dateProchainRebrassage, true); // j7→j30
    e = userState.getWordProgress("max", 1);
    rebrassage.enregistrerRebrassage("max", 1, e.dateProchainRebrassage, true); // j30→j90
  } finally {
    console.warn = origWarn;
  }
  assert(!warned, "Aucun warn ne devrait être émis sur un cycle nominal");
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
