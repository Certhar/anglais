/**
 * Tests pour SessionComposerService.
 *
 * Lancer : node test_SessionComposerService.mjs
 *
 * Mock localStorage en amont pour que UserStateService fonctionne en Node.
 * On utilise les vrais UserStateService et RebrassageService (intégration),
 * mais on mock WordRepository et OrdonnanceurService (pas besoin de tester
 * leur logique ici).
 */

class FakeLocalStorage {
  constructor() { this._data = new Map(); }
  getItem(k) { return this._data.has(k) ? this._data.get(k) : null; }
  setItem(k, v) { this._data.set(k, String(v)); }
  removeItem(k) { this._data.delete(k); }
  clear() { this._data.clear(); }
}
globalThis.localStorage = new FakeLocalStorage();

const { userState } = await import("./UserStateService.js");
const { rebrassage } = await import("./RebrassageService.js");
const { SessionComposerService } = await import("./SessionComposerService.js");

// ─── Mini framework ────────────────────────────────────────────────────
let passed = 0, failed = 0;
const failures = [];
function test(name, fn) {
  userState.clear();
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (err) { failed++; failures.push({ name, err }); console.log(`  ✗ ${name}\n      ${err.message}`); }
}
function group(name) { console.log(`\n${name}`); }
function eq(a, b, msg) {
  const aStr = JSON.stringify(a), bStr = JSON.stringify(b);
  if (aStr !== bStr) throw new Error(`${msg || "égalité"} — attendu ${bStr}, reçu ${aStr}`);
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion échouée"); }

// ─── Mocks WordRepo + Ordonnanceur ────────────────────────────────────

function makeMockWordRepo() {
  // Pas utilisé pour la logique de composition, juste exigé par le constructeur.
  return { /* noop pour l'instant */ };
}

/**
 * Crée un mock d'Ordonnanceur configurable : on contrôle ce que renvoie
 * tirerNouveaux pour chaque appel.
 */
function makeMockOrdonnanceur(nouveauxParAppel) {
  let calls = 0;
  return {
    tirerNouveaux(childId, slots, dateISO) {
      const sortie = nouveauxParAppel[calls] ?? [];
      calls++;
      // On respecte le contrat : longueur ≤ slots
      return sortie.slice(0, slots);
    },
    _calls: () => calls,
  };
}

function makeComposer(opts = {}) {
  return new SessionComposerService({
    userState,
    wordRepo: makeMockWordRepo(),
    rebrassage,
    ordonnanceur: opts.ordonnanceur ?? makeMockOrdonnanceur([]),
  });
}

// Calendrier de référence (mai 2026) :
//   Lun 18, Mar 19, MER 20, Jeu 21, Ven 22, Sam 23, Dim 24, Lun 25, Mar 26, MER 27

// ═══════════════════════════════════════════════════════════════════════
// GROUPE 1 — Construction & validation
// ═══════════════════════════════════════════════════════════════════════
group("1. Construction & validation");

test("Crash si userState manquant", () => {
  let err;
  try { new SessionComposerService({ wordRepo: {}, rebrassage: {}, ordonnanceur: {} }); }
  catch (e) { err = e; }
  assert(err && /userState/.test(err.message));
});

test("Crash si wordRepo manquant", () => {
  let err;
  try { new SessionComposerService({ userState: {}, rebrassage: {}, ordonnanceur: {} }); }
  catch (e) { err = e; }
  assert(err && /wordRepo/.test(err.message));
});

test("Crash si rebrassage manquant", () => {
  let err;
  try { new SessionComposerService({ userState: {}, wordRepo: {}, ordonnanceur: {} }); }
  catch (e) { err = e; }
  assert(err && /rebrassage/.test(err.message));
});

test("Crash si ordonnanceur manquant", () => {
  let err;
  try { new SessionComposerService({ userState: {}, wordRepo: {}, rebrassage: {} }); }
  catch (e) { err = e; }
  assert(err && /ordonnanceur/.test(err.message));
});

// ═══════════════════════════════════════════════════════════════════════
// GROUPE 2 — Mercredi sans long dû = jour normal
// ═══════════════════════════════════════════════════════════════════════
// (Anciennement "cas 'rien'". Le type "rien" a été supprimé : un mercredi
//  sans révision longue est désormais traité comme n'importe quel autre
//  jour. Les paliers longs restent ancrés sur le mercredi via
//  alignerSurJourPivot, donc en pratique les révisions tomberont surtout
//  les mercredis — mais le composer ne décide plus en fonction du jour.)
group("2. Mercredi sans long dû = jour normal");

test("Mercredi sans aucun mot (corpus vide) → type 'normale', coldLesson vide", () => {
  const composer = makeComposer();
  const r = composer.composerSeance("max", "2026-05-20"); // mercredi
  eq(r.type, "normale");
  eq(r.coldLesson, []);
  eq(r.chutes, []);
  eq(r.j1, []);
  eq(r.nouveaux, []);
  eq(r.longs, []);
});

test("Mercredi avec un j1 dû → 'normale', j1 intégré à la séance", () => {
  // Un j1 dû le mercredi 20 mai
  userState.setWordProgress("max", 42, {
    etape: "j1", dateIntroduction: "2026-05-19",
    dateProchainRebrassage: "2026-05-20", historique: [],
  });
  const composer = makeComposer();
  const r = composer.composerSeance("max", "2026-05-20");
  eq(r.type, "normale");
  eq(r.j1, [42]);
});

test("Mercredi avec une chute j0 dûe → 'normale', chute intégrée à la coldLesson", () => {
  userState.setWordProgress("max", 42, {
    etape: "j0", dateIntroduction: "2026-05-19",
    dateProchainRebrassage: "2026-05-20", historique: [],
  });
  const composer = makeComposer();
  const r = composer.composerSeance("max", "2026-05-20");
  eq(r.type, "normale");
  eq(r.chutes, [42]);
  // La chute apparaît bien dans coldLesson (en tête)
  if (!r.coldLesson.includes(42)) {
    throw new Error("La chute devrait être dans coldLesson");
  }
});

// ═══════════════════════════════════════════════════════════════════════
// GROUPE 3 — Cas "revision" (révision longue : j7/j30/j90 dûs)
// ═══════════════════════════════════════════════════════════════════════
group("3. Cas 'revision' (Pas 5)");

test("Mercredi avec un j7 dû → type 'revision', longs=[id]", () => {
  userState.setWordProgress("max", 7, {
    etape: "j7", dateIntroduction: "2026-05-13",
    dateProchainRebrassage: "2026-05-20", historique: [],
  });
  const composer = makeComposer();
  const r = composer.composerSeance("max", "2026-05-20");
  eq(r.type, "revision");
  eq(r.longs, [7]);
  eq(r.coldLesson, []);
  eq(r.chutes, []);
  eq(r.j1, []);
  eq(r.nouveaux, []);
});

test("Mercredi avec j7+j30+j90 dûs → tous dans longs", () => {
  userState.setWordProgress("max", 7,  { etape: "j7",  dateIntroduction: "2026-05-13", dateProchainRebrassage: "2026-05-20", historique: [] });
  userState.setWordProgress("max", 30, { etape: "j30", dateIntroduction: "2026-04-20", dateProchainRebrassage: "2026-05-20", historique: [] });
  userState.setWordProgress("max", 90, { etape: "j90", dateIntroduction: "2026-02-20", dateProchainRebrassage: "2026-05-20", historique: [] });
  const composer = makeComposer();
  const r = composer.composerSeance("max", "2026-05-20");
  eq(r.type, "revision");
  eq(r.longs.sort((a,b)=>a-b), [7, 30, 90]);
});

test("Révision : on n'appelle pas l'ordonnanceur (pas de nouveaux)", () => {
  userState.setWordProgress("max", 7, {
    etape: "j7", dateIntroduction: "2026-05-13",
    dateProchainRebrassage: "2026-05-20", historique: [],
  });
  const ord = makeMockOrdonnanceur([[1, 2, 3]]);
  const composer = makeComposer({ ordonnanceur: ord });
  composer.composerSeance("max", "2026-05-20");
  assert(ord._calls() === 0, "L'ordonnanceur ne doit PAS être appelé en révision longue");
});

test("Rattrapage : un jeudi après mercredi manqué, le j7 reste dû → 'revision'", () => {
  // Le j7 était dû mercredi 20, l'enfant ne s'est pas connecté.
  // Jeudi 21 : la date 20 ≤ 21 donc le j7 est toujours dû.
  // Bascule auto en révision longue, alors qu'on est jeudi.
  userState.setWordProgress("max", 7, {
    etape: "j7", dateIntroduction: "2026-05-13",
    dateProchainRebrassage: "2026-05-20", historique: [],
  });
  const composer = makeComposer();
  const r = composer.composerSeance("max", "2026-05-21"); // jeudi
  eq(r.type, "revision");
  eq(r.longs, [7]);
});

test("Révision : un j1 dû en même temps est ignoré (pas dans la séance)", () => {
  userState.setWordProgress("max", 7, {
    etape: "j7", dateIntroduction: "2026-05-13",
    dateProchainRebrassage: "2026-05-20", historique: [],
  });
  userState.setWordProgress("max", 99, {
    etape: "j1", dateIntroduction: "2026-05-19",
    dateProchainRebrassage: "2026-05-20", historique: [],
  });
  const composer = makeComposer();
  const r = composer.composerSeance("max", "2026-05-20");
  eq(r.type, "revision");
  eq(r.longs, [7]);
  eq(r.j1, []); // 99 PAS dans la séance malgré être dû
});

// ═══════════════════════════════════════════════════════════════════════
// GROUPE 4 — Cas "normale" (Pas 6)
// ═══════════════════════════════════════════════════════════════════════
group("4. Cas 'normale' (Pas 6)");

test("Jour normal sans rien → type 'normale', nouveaux remplissent jusqu'à 10", () => {
  const ord = makeMockOrdonnanceur([[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]]);
  const composer = makeComposer({ ordonnanceur: ord });
  const r = composer.composerSeance("max", "2026-05-18"); // lundi
  eq(r.type, "normale");
  eq(r.chutes, []);
  eq(r.nouveaux, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  eq(r.j1, []);
  eq(r.coldLesson, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]); // chutes + nouveaux
  eq(r.longs, []);
});

test("Jour normal avec 3 chutes → 7 slots pour nouveaux", () => {
  // 3 chutes dûes le 18
  for (const id of [11, 12, 13]) {
    userState.setWordProgress("max", id, {
      etape: "j0", dateIntroduction: "2026-05-17",
      dateProchainRebrassage: "2026-05-18", historique: [],
    });
  }
  const ord = makeMockOrdonnanceur([[21, 22, 23, 24, 25, 26, 27]]);
  const composer = makeComposer({ ordonnanceur: ord });
  const r = composer.composerSeance("max", "2026-05-18");
  eq(r.type, "normale");
  eq(r.chutes.sort((a,b)=>a-b), [11, 12, 13]);
  eq(r.nouveaux, [21, 22, 23, 24, 25, 26, 27]);
  eq(r.coldLesson.length, 10); // 3 chutes + 7 nouveaux
});

test("Jour normal avec 10 chutes → 0 slots pour nouveaux (ordonnanceur pas appelé)", () => {
  for (let i = 1; i <= 10; i++) {
    userState.setWordProgress("max", i, {
      etape: "j0", dateIntroduction: "2026-05-17",
      dateProchainRebrassage: "2026-05-18", historique: [],
    });
  }
  const ord = makeMockOrdonnanceur([[99, 98]]);
  const composer = makeComposer({ ordonnanceur: ord });
  const r = composer.composerSeance("max", "2026-05-18");
  eq(r.chutes.length, 10);
  eq(r.nouveaux, []);
  assert(ord._calls() === 0, "ordonnanceur ne doit pas être appelé si l'enveloppe lourde est pleine");
});

test("Jour normal : les J+1 atterrissent dans j1, PAS dans coldLesson", () => {
  // 2 j1 dûs
  userState.setWordProgress("max", 50, { etape: "j1", dateIntroduction: "2026-05-17", dateProchainRebrassage: "2026-05-18", historique: [] });
  userState.setWordProgress("max", 51, { etape: "j1", dateIntroduction: "2026-05-17", dateProchainRebrassage: "2026-05-18", historique: [] });
  const ord = makeMockOrdonnanceur([[1, 2, 3]]);
  const composer = makeComposer({ ordonnanceur: ord });
  const r = composer.composerSeance("max", "2026-05-18");
  eq(r.type, "normale");
  eq(r.j1.sort((a,b)=>a-b), [50, 51]);
  eq(r.coldLesson, [1, 2, 3]); // PAS les j1
  eq(r.nouveaux, [1, 2, 3]);
});

test("Jour normal : l'ordonnanceur peut rendre MOINS que demandé (corpus épuisé)", () => {
  // 3 chutes, on demande 7, ordonnanceur ne rend que 4 → cold = 3+4
  for (const id of [11, 12, 13]) {
    userState.setWordProgress("max", id, {
      etape: "j0", dateIntroduction: "2026-05-17",
      dateProchainRebrassage: "2026-05-18", historique: [],
    });
  }
  const ord = makeMockOrdonnanceur([[21, 22, 23, 24]]);
  const composer = makeComposer({ ordonnanceur: ord });
  const r = composer.composerSeance("max", "2026-05-18");
  eq(r.chutes.length, 3);
  eq(r.nouveaux.length, 4);
  eq(r.coldLesson.length, 7); // 3 + 4
});

// ═══════════════════════════════════════════════════════════════════════
// GROUPE 4bis — Fix Anglais 25 : mode relecture (cf. BIBLE §11.4)
// ═══════════════════════════════════════════════════════════════════════
group("4bis. Mode relecture (Anglais 25)");

test("séance terminée + acquiredToday non vide → coldLesson = acquiredToday", () => {
  // Scénario : papa a fini sa séance, les 5 mots sont dans acquiredToday.
  // Pas de chutes, pas de j1, ordonnanceur renvoie [] (puisque filtré).
  // Le composer doit reconstituer la coldLesson à partir de acquiredToday.
  userState._getOrInit("papa");
  for (const id of [101, 102, 103, 104, 105]) {
    userState.markWordAcquiredToday("papa", id);
  }
  const ord = makeMockOrdonnanceur([[]]); // ordonnanceur filtre acquiredToday
  const composer = makeComposer({ ordonnanceur: ord });
  const r = composer.composerSeance("papa", "2026-05-24");
  eq(r.type, "normale");
  eq(r.chutes, []);
  eq(r.nouveaux, []);
  eq(r.j1, []);
  eq(r.coldLesson.sort((a,b)=>a-b), [101, 102, 103, 104, 105]);
});

test("séance terminée + acquiredToday vide → coldLesson vraiment vide", () => {
  // Scénario dégénéré : aucun mot acquis ce jour (corpus déjà épuisé,
  // tout en révision longue, etc.). On ne déclenche pas la relecture.
  const ord = makeMockOrdonnanceur([[]]);
  const composer = makeComposer({ ordonnanceur: ord });
  const r = composer.composerSeance("papa", "2026-05-24");
  eq(r.coldLesson, []);
  eq(r.chutes, []);
  eq(r.nouveaux, []);
});

test("séance en cours (j1 non vide) → PAS de mode relecture", () => {
  // Scénario : il y a des J+1 à faire aujourd'hui mais aucun nouveau
  // (corpus épuisé par exemple). On ne déclenche PAS la relecture,
  // la séance normale tourne avec coldLesson vide et j1 non vide.
  userState.setWordProgress("papa", 50, {
    etape: "j1", dateIntroduction: "2026-05-23",
    dateProchainRebrassage: "2026-05-24", historique: [],
  });
  // Quelques acquiredToday (mais on est en milieu de séance) — ils ne
  // doivent PAS atterrir dans coldLesson tant que j1 n'est pas vide.
  userState.markWordAcquiredToday("papa", 999);
  const ord = makeMockOrdonnanceur([[]]);
  const composer = makeComposer({ ordonnanceur: ord });
  const r = composer.composerSeance("papa", "2026-05-24");
  eq(r.j1, [50]);
  eq(r.coldLesson, []); // pas de relecture déclenchée
});


// ═══════════════════════════════════════════════════════════════════════
// GROUPE 5 — Étanchéité entre enfants
// ═══════════════════════════════════════════════════════════════════════
group("5. Étanchéité entre enfants");

test("La séance de Max ne contient pas les mots de Julie", () => {
  userState.setWordProgress("max", 1, { etape: "j0", dateIntroduction: "2026-05-17", dateProchainRebrassage: "2026-05-18", historique: [] });
  userState.setWordProgress("julie", 2, { etape: "j0", dateIntroduction: "2026-05-17", dateProchainRebrassage: "2026-05-18", historique: [] });
  const composer = makeComposer({ ordonnanceur: makeMockOrdonnanceur([[]]) });
  const r = composer.composerSeance("max", "2026-05-18");
  eq(r.chutes, [1]);
});

// ═══════════════════════════════════════════════════════════════════════

console.log("\n" + "═".repeat(60));
console.log(`Résultat : ${passed} OK · ${failed} échec(s)`);
if (failed > 0) {
  console.log("\nDétails des échecs :");
  for (const f of failures) console.log(`  ✗ ${f.name}\n      ${f.err.stack || f.err.message}`);
  process.exit(1);
}
console.log("Tout passe ✓");
