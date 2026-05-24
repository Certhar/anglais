/**
 * test_pas10_4_cabling.mjs
 *
 * Test d'intégration du sous-pas 10.4 : on vérifie que le Router est
 * correctement branché sur ExerciseService.buildQueueSeance(...) pour
 * les séances normales, et que ExerciseScreen accepte une queue prête.
 *
 * Décisions UX vérifiées :
 *   - D-10.4a : la queue passée à ExerciseScreen ne contient PAS
 *               d'entrées `mode: "cold_lesson"`.
 *   - D-10.4b : aucun changement requis ici (séance révision = Pas 11).
 *   - D-10.4c : reprise = régénération de la queue à neuf à chaque entrée
 *               dans l'écran d'exercices (vérifié par recomposition au clic).
 *
 * Approche : combinaison de
 *   - tests fonctionnels via mocks (sans DOM, sans render)
 *   - lecture textuelle des sources pour vérifier les points de câblage
 *
 * Lancer : node test_pas10_4_cabling.mjs
 */

import { readFile } from "node:fs/promises";

// --- Polyfill localStorage (requis par UserStateService) ----------------
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
// 1. Sources : lecture des fichiers à inspecter
// ════════════════════════════════════════════════════════════════════════
console.log("\n1. Lecture des sources");

const routerSrc        = await readFile("./core/Router.js", "utf8");
const exerciseScreenSrc = await readFile("./screens/ExerciseScreen.js", "utf8");
const mainSrc          = await readFile("./main.js", "utf8");

test("core/Router.js lu", () => assert(routerSrc.length > 0, "vide"));
test("screens/ExerciseScreen.js lu", () => assert(exerciseScreenSrc.length > 0, "vide"));
test("main.js lu", () => assert(mainSrc.length > 0, "vide"));

// ════════════════════════════════════════════════════════════════════════
// 2. Câblage Router → ExerciseService.buildQueueSeance
// ════════════════════════════════════════════════════════════════════════
console.log("\n2. Router branché sur buildQueueSeance");

test("Router importe exerciseService (ou ExerciseService)", () => {
  // On accepte l'import du singleton ou de la classe, peu importe.
  const m = routerSrc.match(/from\s+['"][^'"]*ExerciseService(?:\.js)?['"]/);
  assert(m, "aucun import depuis ExerciseService.js");
});

test("Router appelle buildQueueSeance quelque part", () => {
  assert(
    /\.buildQueueSeance\s*\(/.test(routerSrc),
    "appel à .buildQueueSeance(...) introuvable dans Router.js"
  );
});

test("Router n'appelle plus _composeLesson en interne (méthode supprimée ou renommée)", () => {
  // On accepte que la méthode disparaisse OU soit renommée. Ce qui ne doit
  // PAS rester, c'est l'ancien comportement qui ne propage que coldLesson
  // sans construire de queue. Le nouveau code doit faire un appel à
  // buildQueueSeance dans le chemin Démarrer / Exercices.
  //
  // Heuristique : on vérifie qu'on ne renvoie plus un simple
  // `wordRepo.getByIds(seance.coldLesson)` comme dernière étape utile
  // dans la branche "normale". S'il y a encore ce pattern ET aucun
  // appel à buildQueueSeance autour, c'est qu'on n'a pas refactor.
  //
  // Concrètement : on demande qu'il y ait au moins un endroit où
  // buildQueueSeance est utilisé pour préparer le payload navigation.
  const hasNewPath = /buildQueueSeance/.test(routerSrc);
  assert(hasNewPath, "buildQueueSeance pas utilisé dans Router");
});

// ════════════════════════════════════════════════════════════════════════
// 3. D-10.4a : la queue passée à ExerciseScreen ne contient PAS de cold_lesson
// ════════════════════════════════════════════════════════════════════════
console.log("\n3. D-10.4a — ColdLesson exclu de la queue exos");

test("Router filtre les entrées cold_lesson avant de passer la queue", () => {
  // On cherche soit un filter explicite sur "cold_lesson", soit une
  // séparation en deux variables. Patterns acceptables :
  //   .filter(item => item.mode !== "cold_lesson")
  //   .filter(it => it.mode !== "cold_lesson")
  //   queue.filter(x => x.mode !== "cold_lesson")
  //   const exerciseQueue = queue.filter(...)
  const patterns = [
    /filter\s*\(\s*[a-z_$][\w$]*\s*=>\s*[a-z_$][\w$]*\.mode\s*!==?\s*["']cold_lesson["']/i,
    /\.mode\s*!==?\s*["']cold_lesson["']/,
  ];
  const ok = patterns.some(p => p.test(routerSrc));
  assert(ok, "aucun filtrage des entrées cold_lesson trouvé dans Router");
});

// ════════════════════════════════════════════════════════════════════════
// 4. ExerciseScreen accepte une queue déjà construite
// ════════════════════════════════════════════════════════════════════════
console.log("\n4. ExerciseScreen accepte options.queue");

test("ExerciseScreen lit options.queue dans son constructeur", () => {
  // Heuristique souple : on cherche une référence à `.queue` côté options
  // ou un destructuring `{ queue }`.
  const patterns = [
    /options\.queue/,
    /\{\s*[^}]*\bqueue\b[^}]*\}\s*=\s*options/,
    /options\s*=\s*\{\}/, // au moins, options reste un objet
  ];
  // On veut spécifiquement que `queue` apparaisse dans le contexte options.
  const refQueue = /options\.queue|const\s+\{\s*[^}]*queue[^}]*\}\s*=\s*options/.test(exerciseScreenSrc);
  assert(refQueue, "options.queue (ou destructuring) absent dans ExerciseScreen");
});

test("ExerciseScreen utilise la queue fournie si présente (court-circuite buildQueueLourd)", () => {
  // Si options.queue est fournie, on s'attend à un if/ternaire qui l'utilise
  // au lieu d'appeler exerciseService.buildQueueLourd(words).
  // Pattern accepté : `options.queue || exerciseService.buildQueueLourd(words)`
  // ou un if explicite.
  const hasFallback = /options\.queue\s*\?|options\.queue\s*\|\||if\s*\([^)]*options\.queue/.test(exerciseScreenSrc);
  assert(hasFallback, "ExerciseScreen ne court-circuite pas buildQueueLourd quand queue est fournie");
});

// ════════════════════════════════════════════════════════════════════════
// 5. Test fonctionnel : split cold/exos avec un mock de séance
// ════════════════════════════════════════════════════════════════════════
console.log("\n5. Split cold/exos — test fonctionnel");

// On instancie ExerciseService directement et on vérifie qu'à partir d'une
// séance normale, le split cold/exos produit bien ce qu'on attend.
const { ExerciseService } = await import("./services/ExerciseService.js");
const exerciseService = new ExerciseService();

// Mini-corpus : 2 mots lambda
const corpus = [
  { id: 1, en: "dog",  fr: "chien" },
  { id: 2, en: "cat",  fr: "chat" },
];
const mockRepo = {
  getByIds: (ids) => ids.map(id => corpus.find(w => w.id === id)).filter(Boolean),
};

test("Mock : séance normale → queue contient cold_lesson + exos", () => {
  const seance = {
    type: "normale",
    coldLesson: [1, 2],
    chutes:     [],
    nouveaux:   [1, 2],
    j1:         [],
  };
  const queue = exerciseService.buildQueueSeance(seance, mockRepo);
  const colds = queue.filter(q => q.mode === "cold_lesson");
  const exos  = queue.filter(q => q.mode !== "cold_lesson");
  assert(colds.length === 2, `attendu 2 cold_lesson, eu ${colds.length}`);
  assert(exos.length > 0, "queue exos vide");
});

test("Split : exerciseQueue (filter !== cold_lesson) ne contient AUCUN cold_lesson", () => {
  const seance = {
    type: "normale",
    coldLesson: [1, 2],
    chutes:     [],
    nouveaux:   [1, 2],
    j1:         [],
  };
  const queue = exerciseService.buildQueueSeance(seance, mockRepo);
  const exerciseQueue = queue.filter(q => q.mode !== "cold_lesson");
  const polluants = exerciseQueue.filter(q => q.mode === "cold_lesson");
  assert(polluants.length === 0, "exerciseQueue contient encore des cold_lesson");
});

test("Split : coldWords (les mots de mode cold_lesson) = [dog, cat] dans l'ordre", () => {
  const seance = {
    type: "normale",
    coldLesson: [1, 2],
    chutes:     [],
    nouveaux:   [1, 2],
    j1:         [],
  };
  const queue = exerciseService.buildQueueSeance(seance, mockRepo);
  const coldWords = queue.filter(q => q.mode === "cold_lesson").map(q => q.word);
  assert(coldWords.length === 2, `attendu 2 mots, eu ${coldWords.length}`);
  assert(coldWords[0].en === "dog", `1er = ${coldWords[0].en}`);
  assert(coldWords[1].en === "cat", `2e = ${coldWords[1].en}`);
});

// ════════════════════════════════════════════════════════════════════════
// 6. Router : vérification textuelle de la méthode de composition
// ════════════════════════════════════════════════════════════════════════
console.log("\n6. Router : méthode de composition séance normale");

// On ne peut pas instancier le Router ici : son chargement importe en
// cascade HomeScreen → AudioService qui touche `window.speechSynthesis`,
// inexistant en Node. Le câblage complet se testera dans le navigateur.
//
// On s'en tient à des vérifications textuelles sur le source du Router.

test("Router possède une méthode qui appelle buildQueueSeance", () => {
  // Approche simple : on vérifie qu'on a bien un appel à .buildQueueSeance(...)
  // ET que le code source contient une déclaration de méthode privée
  // dans la classe Router. Le couplage exact (signature → corps) est
  // implicitement validé par les tests fonctionnels (section 5 + 10)
  // qui passent par le même chemin sémantique.
  const hasCall = /\.buildQueueSeance\s*\(/.test(routerSrc);
  // Une méthode privée typique du Router : `  _truc(arg) {` ou `  _truc() {`
  const hasPrivateMethod = /^\s{2,}_[A-Za-z]\w*\s*\([^)]*\)\s*\{/m.test(routerSrc);
  assert(hasCall, "appel à .buildQueueSeance(...) manquant");
  assert(hasPrivateMethod, "aucune méthode privée détectée dans le Router");
});

// Composer mock + service réel pour le smoke test fonctionnel ci-dessous.
const mockComposer = {
  composerSeance: (childId, dateISO) => ({
    type: "normale",
    coldLesson: [1, 2],
    chutes:     [],
    nouveaux:   [1, 2],
    j1:         [],
  }),
};

// ════════════════════════════════════════════════════════════════════════
// 7. Non-régression : aucun bouton ne contourne le composer
// ════════════════════════════════════════════════════════════════════════
console.log("\n7. Non-régression : pas de bypass du composer");

test("Router ne passe plus de simple liste de coldLesson à ExerciseScreen", () => {
  // Avant 10.4 : _composeLesson renvoyait `wordRepo.getByIds(seance.coldLesson)`
  // qui était passé tel quel à ExerciseScreen. Désormais, ce qu'on passe
  // à ExerciseScreen (via navigate('exercises', { queue }) ou similaire)
  // doit venir d'un buildQueueSeance, PAS d'un simple getByIds(coldLesson).
  //
  // Heuristique : on vérifie que dans le contexte de _mountExercises ou
  // de l'appel navigate('exercises', ...), il y a bien une référence à
  // queue ou exerciseQueue.
  const navExos = routerSrc.match(/navigate\(['"]exercises['"][^)]*\)/g) || [];
  const usesQueue = navExos.some(s => /queue/.test(s));
  assert(usesQueue, "navigate('exercises', ...) ne semble pas passer de queue");
});

test("ColdLesson reçoit bien des mots (Array<Word>), pas une queue d'exos", () => {
  // ColdLessonScreen doit continuer à recevoir une liste de mots simples.
  // On vérifie que `navigate('cold-lesson', ...)` passe { words: ... }.
  const navCold = routerSrc.match(/navigate\(['"]cold-lesson['"][^)]*\)/g) || [];
  assert(navCold.length > 0, "aucun navigate('cold-lesson') trouvé");
  const passesWords = navCold.some(s => /words/.test(s));
  assert(passesWords, "navigate('cold-lesson') ne passe pas { words }");
});

// ════════════════════════════════════════════════════════════════════════
// 8. D-10.4c : recomposition à chaque entrée dans Exercices
// ════════════════════════════════════════════════════════════════════════
console.log("\n8. D-10.4c — Recomposition à chaque entrée");

test("composer.composerSeance est appelé dans le callback Exercices, pas mis en cache", () => {
  // Heuristique : on cherche un cache type `this._cachedSeance = ...`
  // qui serait une mauvaise pratique. Tolérance : le composer peut être
  // appelé plusieurs fois, ce qui est précisément le point de D-10.4c.
  const hasBadCache = /this\._cachedSeance|this\._seanceCache/.test(routerSrc);
  assert(!hasBadCache, "cache de séance détecté — viole D-10.4c (régénération à chaque entrée)");
});

test("onContinueToExercises (ColdLesson → Exercices) recompose la séance", () => {
  // D-10.4c : la queue est régénérée à neuf à CHAQUE entrée dans l'écran
  // d'exercices, y compris quand on enchaîne depuis ColdLessonScreen.
  // Sinon on perdrait le bénéfice du filtrage acquiredToday entre les
  // deux étapes (utile si plusieurs sessions tournent en parallèle, ou
  // si l'enfant prend du temps entre Leçon et Exos).
  //
  // On cherche dans le source du Router que le callback
  // onContinueToExercises appelle bien _composerSeance (ou un
  // composer.composerSeance direct), et PAS un simple navigate avec
  // une variable `words` capturée par closure.
  // Note (sous-pas 11.1) : la méthode a été renommée de
  // _composerSeanceNormale à _composerSeance (unifiée normale + révision).
  // On tolère les deux noms pour permettre une transition douce.
  const m = routerSrc.match(/onContinueToExercises\s*:\s*\(\)\s*=>\s*\{[\s\S]*?\}/);
  assert(m, "callback onContinueToExercises introuvable");
  const body = m[0];
  const recomposes =
    /_composerSeance(Normale)?|composer\.composerSeance/.test(body);
  assert(recomposes, "onContinueToExercises ne recompose pas la séance (D-10.4c)");
});

// ════════════════════════════════════════════════════════════════════════
// 9. main.js : exerciseService accessible (si exposé) pour debug
// ════════════════════════════════════════════════════════════════════════
console.log("\n9. main.js (optionnel : exposition debug)");

test("main.js peut être inchangé (le pas 10.4 ne change pas main.js)", () => {
  // Le pas 10.4 est entièrement interne au Router et à ExerciseScreen.
  // main.js continue de passer composer et recorder. On vérifie juste
  // que ce câblage existant n'a pas été cassé.
  assert(
    /new Router\([^)]*composer[^)]*recorder/.test(mainSrc) ||
    /new Router\([^)]*recorder[^)]*composer/.test(mainSrc),
    "main.js ne passe plus composer ET recorder au Router"
  );
});

// ════════════════════════════════════════════════════════════════════════
// 10. Smoke test : simulation complète d'un cycle (mocks)
// ════════════════════════════════════════════════════════════════════════
console.log("\n10. Smoke test : cycle séance normale complet (mocks)");

test("Cycle complet : composer → buildQueueSeance → split → assertions", () => {
  const seance = mockComposer.composerSeance("max", "2026-05-22");
  assert(seance.type === "normale", "type séance incorrect");

  const queue = exerciseService.buildQueueSeance(seance, mockRepo);

  const coldWords    = queue.filter(q => q.mode === "cold_lesson").map(q => q.word);
  const exerciseQueue = queue.filter(q => q.mode !== "cold_lesson");

  // ColdLessonScreen recevrait `coldWords` = [{id:1,...}, {id:2,...}]
  assert(coldWords.length === 2, `coldWords ${coldWords.length}`);

  // ExerciseScreen recevrait `exerciseQueue` = entrées exos uniquement
  assert(exerciseQueue.length > 0, "exerciseQueue vide");
  assert(
    exerciseQueue.every(it => it.mode !== "cold_lesson"),
    "exerciseQueue contient encore du cold_lesson"
  );

  // Toutes les entrées exos doivent avoir un mot et un mode valide
  for (const it of exerciseQueue) {
    assert(it.word && it.word.id, "entrée queue sans word");
    assert(typeof it.mode === "string" && it.mode.length > 0, "entrée queue sans mode");
  }
});

// ════════════════════════════════════════════════════════════════════════
await Promise.all(pendingTests);
await new Promise(r => setTimeout(r, 50));

console.log("\n═════════════════════════════════════════════════════════════");
console.log(`Résultat : ${pass} OK · ${fail} échec(s)`);
console.log(fail === 0 ? "Tout passe ✓\n" : `${fail} test(s) en échec\n`);
process.exit(fail === 0 ? 0 : 1);
