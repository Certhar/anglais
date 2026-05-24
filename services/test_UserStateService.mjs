/**
 * Tests unitaires pour UserStateService (extension progression par mot).
 *
 * Lancer : node test_UserStateService.mjs
 *
 * Mock localStorage minimal pour pouvoir exécuter en Node.
 * Le service détecte qu'il n'y a pas de localStorage natif et passerait
 * en mode mémoire-pure ; on lui fournit donc un faux localStorage AVANT
 * d'importer le module pour tester le vrai chemin de persistance.
 */

// ─── Mock localStorage (doit être en place AVANT l'import du service) ──
class FakeLocalStorage {
  constructor() { this._data = new Map(); }
  getItem(k) { return this._data.has(k) ? this._data.get(k) : null; }
  setItem(k, v) { this._data.set(k, String(v)); }
  removeItem(k) { this._data.delete(k); }
  clear() { this._data.clear(); }
}
globalThis.localStorage = new FakeLocalStorage();

// ─── Import du service après mise en place du mock ────────────────────
const { userState } = await import("./UserStateService.js");

// Import de la classe en plus du singleton pour les tests qui ont besoin
// de simuler un "reload" (nouvelle instance = nouveau _load() depuis storage).
const { UserStateService } = await import("./UserStateService.js");

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

// ═══════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════

group("1. Compatibilité avec l'API existante (non régression)");

test("markLessonViewed + isLessonViewed fonctionnent comme avant", () => {
  assert(!userState.isLessonViewed("max"), "pas vue au départ");
  userState.markLessonViewed("max");
  assert(userState.isLessonViewed("max"), "vue après mark");
});

test("setLastChildId / getLastChildId / clearLastChildId", () => {
  assert(userState.getLastChildId() === null);
  userState.setLastChildId("max");
  eq(userState.getLastChildId(), "max");
  userState.clearLastChildId();
  assert(userState.getLastChildId() === null);
});

test("comptes étanches entre enfants (rappel principe pédagogique)", () => {
  userState.markLessonViewed("max");
  assert(userState.isLessonViewed("max"));
  assert(!userState.isLessonViewed("julie"));
});

group("2. getWordProgress / setWordProgress");

test("getWordProgress renvoie null si rien stocké", () => {
  eq(userState.getWordProgress("max", 42), null);
});

test("setWordProgress + getWordProgress aller-retour", () => {
  const entry = {
    etape: "j0",
    dateIntroduction: "2026-05-17",
    dateProchainRebrassage: "2026-05-18",
    historique: [{date: "2026-05-17", statut: "j0", resultat: "ok"}],
  };
  userState.setWordProgress("max", 42, entry);
  eq(userState.getWordProgress("max", 42), entry);
});

test("setWordProgress accepte wordId number ou string indifféremment", () => {
  const entry = {
    etape: "j7",
    dateIntroduction: "2026-05-10",
    dateProchainRebrassage: "2026-05-17",
    historique: [],
  };
  userState.setWordProgress("max", 42, entry);
  // Lecture en number ET en string : même résultat
  eq(userState.getWordProgress("max", 42), entry);
  eq(userState.getWordProgress("max", "42"), entry);
});

test("setWordProgress refuse une entrée invalide (étape inconnue)", () => {
  userState.setWordProgress("max", 1, {
    etape: "j5", // ← invalide
    dateIntroduction: "2026-05-17",
    dateProchainRebrassage: null,
    historique: [],
  });
  eq(userState.getWordProgress("max", 1), null);
});

test("setWordProgress refuse une entrée invalide (date mal formée)", () => {
  userState.setWordProgress("max", 1, {
    etape: "j0",
    dateIntroduction: "17/05/2026", // ← mauvais format
    dateProchainRebrassage: null,
    historique: [],
  });
  eq(userState.getWordProgress("max", 1), null);
});

test("setWordProgress accepte dateProchainRebrassage=null (mot acquis)", () => {
  const entry = {
    etape: "acquis",
    dateIntroduction: "2026-01-01",
    dateProchainRebrassage: null,
    historique: [],
  };
  userState.setWordProgress("max", 99, entry);
  eq(userState.getWordProgress("max", 99), entry);
});

test("getWordProgress renvoie une COPIE (pas la référence interne)", () => {
  userState.setWordProgress("max", 1, {
    etape: "j0",
    dateIntroduction: "2026-05-17",
    dateProchainRebrassage: "2026-05-18",
    historique: [{date: "2026-05-17", statut: "j0", resultat: "ok"}],
  });
  const got = userState.getWordProgress("max", 1);
  got.etape = "j90"; // mutation côté appelant
  got.historique.push({date: "9999-99-99", statut: "j90", resultat: "ok"});
  // L'état stocké est intact :
  const got2 = userState.getWordProgress("max", 1);
  eq(got2.etape, "j0");
  eq(got2.historique.length, 1);
});

group("3. recordWordOutcome (création + append)");

test("recordWordOutcome crée l'entrée au premier passage", () => {
  userState.recordWordOutcome("max", 42, {
    date: "2026-05-17",
    statut: "j0",
    resultat: "ok",
  });
  const got = userState.getWordProgress("max", 42);
  eq(got.etape, "j0");
  eq(got.dateIntroduction, "2026-05-17");
  eq(got.dateProchainRebrassage, null);
  eq(got.historique.length, 1);
  eq(got.historique[0], {date: "2026-05-17", statut: "j0", resultat: "ok"});
});

test("recordWordOutcome append au passage suivant et met à jour l'étape", () => {
  userState.recordWordOutcome("max", 42, {
    date: "2026-05-17", statut: "j0", resultat: "ok"
  });
  userState.recordWordOutcome("max", 42, {
    date: "2026-05-18", statut: "j1", resultat: "ok"
  });
  const got = userState.getWordProgress("max", 42);
  eq(got.etape, "j1", "étape doit être mise à jour");
  eq(got.dateIntroduction, "2026-05-17", "dateIntroduction reste celle du j0");
  eq(got.historique.length, 2);
});

test("recordWordOutcome enregistre les chutes aussi", () => {
  userState.recordWordOutcome("max", 7, {
    date: "2026-05-17", statut: "j0", resultat: "chute"
  });
  const got = userState.getWordProgress("max", 7);
  eq(got.etape, "j0");
  eq(got.historique[0].resultat, "chute");
});

test("recordWordOutcome refuse silencieusement un outcome malformé", () => {
  userState.recordWordOutcome("max", 1, { date: "bad", statut: "j0", resultat: "ok" });
  userState.recordWordOutcome("max", 2, { date: "2026-05-17", statut: "j5", resultat: "ok" });
  userState.recordWordOutcome("max", 3, { date: "2026-05-17", statut: "j0", resultat: "pomme" });
  eq(userState.getWordProgress("max", 1), null);
  eq(userState.getWordProgress("max", 2), null);
  eq(userState.getWordProgress("max", 3), null);
});

group("4. Listings : getAllProgress, getWordsByEtape, getWordsDueOn");

function seedMax() {
  // Une petite zoo représentative
  userState.setWordProgress("max", 1, {
    etape: "j0", dateIntroduction: "2026-05-17",
    dateProchainRebrassage: "2026-05-18", historique: [],
  });
  userState.setWordProgress("max", 2, {
    etape: "j1", dateIntroduction: "2026-05-16",
    dateProchainRebrassage: "2026-05-23", historique: [],
  });
  userState.setWordProgress("max", 3, {
    etape: "j7", dateIntroduction: "2026-05-10",
    dateProchainRebrassage: "2026-05-17", historique: [], // dû AUJ
  });
  userState.setWordProgress("max", 4, {
    etape: "j30", dateIntroduction: "2026-04-17",
    dateProchainRebrassage: "2026-05-15", historique: [], // dû (en retard)
  });
  userState.setWordProgress("max", 5, {
    etape: "acquis", dateIntroduction: "2026-01-01",
    dateProchainRebrassage: null, historique: [],
  });
}

test("getAllProgress renvoie une Map avec clés Number", () => {
  seedMax();
  const all = userState.getAllProgress("max");
  assert(all instanceof Map);
  eq(all.size, 5);
  assert(all.has(1) && all.has(5));
  eq(all.get(1).etape, "j0");
  eq(all.get(5).etape, "acquis");
});

test("getAllProgress : mutation du résultat ne touche pas l'état", () => {
  seedMax();
  const all = userState.getAllProgress("max");
  all.get(1).etape = "mutated";
  all.delete(2);
  // État interne intact :
  eq(userState.getWordProgress("max", 1).etape, "j0");
  eq(userState.getAllProgress("max").size, 5);
});

test("getWordsByEtape filtre correctement", () => {
  seedMax();
  eq(userState.getWordsByEtape("max", "j0").sort(), [1]);
  eq(userState.getWordsByEtape("max", "j7").sort(), [3]);
  eq(userState.getWordsByEtape("max", "acquis").sort(), [5]);
  eq(userState.getWordsByEtape("max", "j90"), []);
});

test("getWordsByEtape avec étape invalide renvoie []", () => {
  seedMax();
  eq(userState.getWordsByEtape("max", "n'importe quoi"), []);
});

test("getWordsDueOn renvoie les mots dus à la date donnée ou avant", () => {
  seedMax();
  const due = userState.getWordsDueOn("max", "2026-05-17").sort();
  // mot 3 (dû aujourd'hui) + mot 4 (en retard depuis le 15)
  eq(due, [3, 4]);
});

test("getWordsDueOn exclut les mots acquis (dateProchainRebrassage=null)", () => {
  seedMax();
  const due = userState.getWordsDueOn("max", "9999-12-31");
  // Tout sauf le mot 5 (acquis) :
  eq(due.sort(), [1, 2, 3, 4]);
});

test("getWordsDueOn avec date invalide renvoie []", () => {
  seedMax();
  eq(userState.getWordsDueOn("max", "demain"), []);
});

group("5. removeWordProgress / clearProgress");

test("removeWordProgress supprime juste l'entrée ciblée", () => {
  seedMax();
  userState.removeWordProgress("max", 3);
  eq(userState.getWordProgress("max", 3), null);
  eq(userState.getAllProgress("max").size, 4);
});

test("removeWordProgress sur un mot absent = no-op silencieux", () => {
  seedMax();
  userState.removeWordProgress("max", 9999); // pas planter
  eq(userState.getAllProgress("max").size, 5);
});

test("clearProgress vide la progression mais préserve les autres flags", () => {
  seedMax();
  userState.markLessonViewed("max");
  userState.clearProgress("max");
  eq(userState.getAllProgress("max").size, 0);
  assert(userState.isLessonViewed("max"), "lessonViewed doit être préservé");
});

group("6. Étanchéité entre enfants");

test("La progression d'un enfant n'affecte pas l'autre", () => {
  userState.setWordProgress("max", 42, {
    etape: "j0", dateIntroduction: "2026-05-17",
    dateProchainRebrassage: "2026-05-18", historique: [],
  });
  eq(userState.getWordProgress("julie", 42), null);
  eq(userState.getAllProgress("julie").size, 0);
});

test("clearProgress(max) ne touche pas à julie", () => {
  userState.setWordProgress("max", 1, {
    etape: "j0", dateIntroduction: "2026-05-17",
    dateProchainRebrassage: "2026-05-18", historique: [],
  });
  userState.setWordProgress("julie", 1, {
    etape: "j7", dateIntroduction: "2026-05-10",
    dateProchainRebrassage: "2026-05-17", historique: [],
  });
  userState.clearProgress("max");
  eq(userState.getAllProgress("max").size, 0);
  eq(userState.getAllProgress("julie").size, 1);
});

test("clearChild remet un enfant à l'état vierge (table rase complète)", () => {
  // On met du contenu partout pour papa
  userState.setWordProgress("papa", 42, {
    etape: "j7", dateIntroduction: "2026-05-10",
    dateProchainRebrassage: "2026-05-17", historique: [],
  });
  userState.markLessonViewed("papa");
  userState.recordExoSuccess("papa", 42, "mcq");
  userState.markWordAcquiredToday("papa", 42);

  // Sanity check avant clear
  assert(userState.isLessonViewed("papa"), "lessonViewed posé avant clear");
  eq(userState.getAllProgress("papa").size, 1);
  eq(userState.getAcquiredToday("papa"), [42]);

  userState.clearChild("papa");

  // Après clear : tout est vierge, comme une première connexion.
  assert(!userState.isLessonViewed("papa"), "lessonViewed remis à false");
  eq(userState.getAllProgress("papa").size, 0);
  eq(userState.getAcquiredToday("papa"), []);
  eq(userState.getExosProgress("papa", 42), []);
});

test("clearChild(papa) ne touche pas aux autres enfants", () => {
  // Papa a des données
  userState.setWordProgress("papa", 1, {
    etape: "j0", dateIntroduction: "2026-05-17",
    dateProchainRebrassage: "2026-05-18", historique: [],
  });
  userState.markLessonViewed("papa");
  // Max et Julie aussi, on doit les retrouver intacts
  userState.setWordProgress("max", 7, {
    etape: "j30", dateIntroduction: "2026-04-01",
    dateProchainRebrassage: "2026-05-01", historique: [],
  });
  userState.markLessonViewed("max");
  userState.setWordProgress("julie", 99, {
    etape: "acquis", dateIntroduction: "2026-03-15",
    dateProchainRebrassage: null, historique: [],
  });

  userState.clearChild("papa");

  // Papa : vidé
  eq(userState.getAllProgress("papa").size, 0);
  assert(!userState.isLessonViewed("papa"));
  // Max : intact
  eq(userState.getAllProgress("max").size, 1);
  eq(userState.getWordProgress("max", 7).etape, "j30");
  assert(userState.isLessonViewed("max"), "max lessonViewed préservé");
  // Julie : intacte
  eq(userState.getAllProgress("julie").size, 1);
  eq(userState.getWordProgress("julie", 99).etape, "acquis");
});

test("clearChild sur un enfant inexistant = no-op silencieux", () => {
  // Aucun setup pour "fantome", on appelle directement clearChild.
  userState.clearChild("fantome"); // ne doit pas planter
  // Et ça ne crée pas d'entrée vide non plus
  const raw = JSON.parse(localStorage.getItem("vocabulaire.userState.v1") || "{}");
  assert(!("fantome" in raw), "pas d'entrée fantome créée");
});

group("7. Persistance (vérification du payload localStorage)");

test("Une écriture est immédiatement reflétée dans localStorage", () => {
  userState.setWordProgress("max", 42, {
    etape: "j7", dateIntroduction: "2026-05-10",
    dateProchainRebrassage: "2026-05-17",
    historique: [{date: "2026-05-10", statut: "j0", resultat: "ok"}],
  });
  const raw = JSON.parse(localStorage.getItem("vocabulaire.userState.v1"));
  eq(raw.max.progress["42"].etape, "j7");
  eq(raw.max.progress["42"].historique.length, 1);
});

test("recordWordOutcome aussi écrit immédiatement dans localStorage", () => {
  userState.recordWordOutcome("max", 7, {
    date: "2026-05-17", statut: "j0", resultat: "chute"
  });
  const raw = JSON.parse(localStorage.getItem("vocabulaire.userState.v1"));
  eq(raw.max.progress["7"].historique[0].resultat, "chute");
});

// Note : la vraie persistance "fermer l'onglet et rouvrir" est testée
// par le HTML harness (test_UserStateService.html) dans un navigateur réel.

group("8. Tolérance aux données corrompues");

test("Une entrée corrompue dans le storage est ignorée à la lecture", () => {
  // userState.clear() a déjà été appelé par test() : storage vide
  // On forge un état complet avec une entrée pourrie au milieu
  const forged = {
    max: {
      lessonViewed: false,
      lastUsedDate: "2026-05-17",
      progress: {
        "1": { etape: "j0", dateIntroduction: "2026-05-17", dateProchainRebrassage: "2026-05-18", historique: [] },
        "2": { /* objet pourri */ etape: "MARS", historique: "non" },
        "3": null,
      },
    },
  };
  localStorage.setItem("vocabulaire.userState.v1", JSON.stringify(forged));
  // Nouvelle instance = nouveau _load() depuis le storage forgé
  const fresh = new UserStateService();
  eq(fresh.getWordProgress("max", 1).etape, "j0");
  eq(fresh.getWordProgress("max", 2), null);
  eq(fresh.getWordProgress("max", 3), null);
  eq(fresh.getAllProgress("max").size, 1);
});

test("Migration douce : enfant existant SANS champ progress (vieux state)", () => {
  // Simule un état pré-extension : enfant créé avant l'ajout du champ
  // `progress`. La "migration douce" testée ici est STRUCTURELLE : le
  // service doit créer en silence les champs manquants (progress,
  // exosProgress, acquiredToday) à la première lecture, sans crash et
  // sans perdre les données existantes (lastUsedDate, _lastChildId).
  //
  // Note : on utilise la date du jour pour lastUsedDate afin de
  // neutraliser le rollover, qui n'est PAS le sujet de ce test. Le
  // rollover est testé séparément dans le groupe 12. Et `lessonViewed`
  // n'est plus testé ici : par construction (D4 N2), un nouveau jour
  // calendaire le remet à false, ce qui est le comportement voulu
  // pédagogiquement (la leçon se revoit chaque jour).
  const today = new Date().toISOString().slice(0, 10);
  const oldState = {
    max: { lessonViewed: false, lastUsedDate: today },
    _lastChildId: "max",
  };
  localStorage.setItem("vocabulaire.userState.v1", JSON.stringify(oldState));
  const fresh = new UserStateService();
  // Migration structurelle : pas de progress préexistant → map vide,
  // pas de crash.
  eq(fresh.getAllProgress("max").size, 0);
  // _lastChildId préservé (donnée existante non touchée par la migration)
  eq(fresh.getLastChildId(), "max");
  // Et on peut écrire dans le nouveau champ progress sans souci
  fresh.recordWordOutcome("max", 1, {
    date: "2026-05-17", statut: "j0", resultat: "ok"
  });
  eq(fresh.getWordProgress("max", 1).etape, "j0");
});

test("Une nouvelle instance relit bien ce qu'une autre a écrit (vrai reload)", () => {
  userState.setWordProgress("max", 42, {
    etape: "j7", dateIntroduction: "2026-05-10",
    dateProchainRebrassage: "2026-05-17",
    historique: [{date: "2026-05-10", statut: "j0", resultat: "ok"}],
  });
  // Nouvelle instance = simule la réouverture de l'app
  const fresh = new UserStateService();
  const got = fresh.getWordProgress("max", 42);
  eq(got.etape, "j7");
  eq(got.historique.length, 1);
});

// ═══════════════════════════════════════════════════════════════════════
// PAS 9a — État intra-jour (exosProgress, acquiredToday)
// ═══════════════════════════════════════════════════════════════════════

group("9. État intra-jour : recordExoSuccess / getExosProgress");

test("getExosProgress renvoie [] par défaut", () => {
  eq(userState.getExosProgress("max", 12), []);
});

test("recordExoSuccess + getExosProgress aller-retour", () => {
  userState.recordExoSuccess("max", 12, "mcq");
  userState.recordExoSuccess("max", 12, "textInput");
  eq(userState.getExosProgress("max", 12), ["mcq", "textInput"]);
});

test("recordExoSuccess est idempotent (pas de doublon)", () => {
  userState.recordExoSuccess("max", 12, "mcq");
  userState.recordExoSuccess("max", 12, "mcq");
  userState.recordExoSuccess("max", 12, "mcq");
  eq(userState.getExosProgress("max", 12), ["mcq"]);
});

test("recordExoSuccess accepte wordId number ou string indifféremment", () => {
  userState.recordExoSuccess("max", 12, "mcq");
  userState.recordExoSuccess("max", "12", "textInput");
  eq(userState.getExosProgress("max", 12), ["mcq", "textInput"]);
  eq(userState.getExosProgress("max", "12"), ["mcq", "textInput"]);
});

test("recordExoSuccess avec mode invalide est un no-op silencieux", () => {
  userState.recordExoSuccess("max", 12, "");          // string vide
  userState.recordExoSuccess("max", 12, null);        // null
  userState.recordExoSuccess("max", 12, undefined);   // undefined
  userState.recordExoSuccess("max", 12, 42);          // number
  eq(userState.getExosProgress("max", 12), []);
});

test("getExosProgress renvoie une COPIE (pas la référence interne)", () => {
  userState.recordExoSuccess("max", 12, "mcq");
  const got = userState.getExosProgress("max", 12);
  got.push("MUTATION");
  // La mutation n'a pas touché l'état interne
  eq(userState.getExosProgress("max", 12), ["mcq"]);
});

group("10. État intra-jour : markWordAcquiredToday / getAcquiredToday / isWordAcquiredToday");

test("getAcquiredToday renvoie [] par défaut", () => {
  eq(userState.getAcquiredToday("max"), []);
});

test("markWordAcquiredToday + getAcquiredToday aller-retour", () => {
  userState.markWordAcquiredToday("max", 12);
  userState.markWordAcquiredToday("max", 25);
  eq(userState.getAcquiredToday("max"), [12, 25]);
});

test("markWordAcquiredToday est idempotent", () => {
  userState.markWordAcquiredToday("max", 12);
  userState.markWordAcquiredToday("max", 12);
  userState.markWordAcquiredToday("max", 12);
  eq(userState.getAcquiredToday("max"), [12]);
});

test("isWordAcquiredToday renvoie le bon booléen", () => {
  userState.markWordAcquiredToday("max", 12);
  assert(userState.isWordAcquiredToday("max", 12), "12 acquis");
  assert(!userState.isWordAcquiredToday("max", 99), "99 pas acquis");
});

test("isWordAcquiredToday accepte wordId number ou string", () => {
  userState.markWordAcquiredToday("max", 12);
  assert(userState.isWordAcquiredToday("max", "12"), "string");
  assert(userState.isWordAcquiredToday("max", 12), "number");
});

test("getAcquiredToday renvoie une COPIE (pas la référence interne)", () => {
  userState.markWordAcquiredToday("max", 12);
  const got = userState.getAcquiredToday("max");
  got.push(999);
  eq(userState.getAcquiredToday("max"), [12]);
});

group("11. État intra-jour : étanchéité entre enfants");

test("L'état intra-jour de max et julie est étanche", () => {
  userState.recordExoSuccess("max", 12, "mcq");
  userState.recordExoSuccess("julie", 12, "textInput");
  userState.markWordAcquiredToday("max", 12);
  // max
  eq(userState.getExosProgress("max", 12), ["mcq"]);
  eq(userState.getAcquiredToday("max"), [12]);
  // julie : pas contaminée
  eq(userState.getExosProgress("julie", 12), ["textInput"]);
  eq(userState.getAcquiredToday("julie"), []);
});

group("12. État intra-jour : rollover de jour");

test("resetForNewDay efface exosProgress et acquiredToday", () => {
  userState.recordExoSuccess("max", 12, "mcq");
  userState.markWordAcquiredToday("max", 12);
  // Mais on garde une progression long-terme pour vérifier qu'elle survit
  userState.setWordProgress("max", 12, {
    etape: "j1", dateIntroduction: "2026-05-20",
    dateProchainRebrassage: "2026-05-21",
    historique: [{date: "2026-05-20", statut: "j0", resultat: "ok"}],
  });

  userState.resetForNewDay("max");

  // Flags intra-jour effacés…
  eq(userState.getExosProgress("max", 12), []);
  eq(userState.getAcquiredToday("max"), []);
  // …mais progression long-terme préservée
  eq(userState.getWordProgress("max", 12).etape, "j1");
});

test("Rollover automatique au changement de jour (via lastUsedDate forcée)", () => {
  userState.recordExoSuccess("max", 12, "mcq");
  userState.markWordAcquiredToday("max", 12);

  // On force la date stockée à hier pour simuler "l'enfant n'a pas
  // ouvert l'app depuis hier". Lecture directe de l'état interne pour
  // contourner la persistance (on triche pour tester le rollover).
  // L'astuce : on écrit dans localStorage un state où lastUsedDate
  // est dans le passé, puis on recrée une instance.
  const today = new Date();
  const raw = localStorage.getItem("vocabulaire.userState.v1");
  const parsed = JSON.parse(raw);
  parsed.max.lastUsedDate = "1999-01-01";  // date manifestement dépassée
  localStorage.setItem("vocabulaire.userState.v1", JSON.stringify(parsed));

  // Nouvelle instance → rollover détecté au premier _getOrInit
  const fresh = new UserStateService();
  eq(fresh.getExosProgress("max", 12), []);
  eq(fresh.getAcquiredToday("max"), []);
});

test("Migration douce : ancien state SANS exosProgress / acquiredToday", () => {
  // Simule un state datant d'avant le Pas 9a : enfant avec progression
  // mais sans les nouveaux champs intra-jour. Le service doit les
  // créer en douceur à la première lecture, sans rien casser.
  const oldState = {
    max: {
      lessonViewed: false,
      lastUsedDate: new Date().toISOString().slice(0, 10),  // aujourd'hui
      progress: {
        "12": { etape: "j1", dateIntroduction: "2026-05-19",
                dateProchainRebrassage: "2026-05-20", historique: [] },
      },
      // PAS d'exosProgress, PAS d'acquiredToday
    },
  };
  localStorage.setItem("vocabulaire.userState.v1", JSON.stringify(oldState));
  const fresh = new UserStateService();
  // Les nouvelles méthodes doivent fonctionner sans crash
  eq(fresh.getExosProgress("max", 12), []);
  eq(fresh.getAcquiredToday("max"), []);
  // Et on peut écrire dedans
  fresh.recordExoSuccess("max", 12, "mcq");
  eq(fresh.getExosProgress("max", 12), ["mcq"]);
  // Progression existante préservée
  eq(fresh.getWordProgress("max", 12).etape, "j1");
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
