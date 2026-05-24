/**
 * test_pas11_revision.mjs
 *
 * Test d'intégration du Pas 11 : vrai écran de révision.
 *
 * En sortie du Pas 10.4, le mode révision menait encore à un écran
 * provisoire (RevisionPlaceholderScreen) via un callback unique
 * `onStartRevision` qui appelait le composer directement. Le Pas 11
 * unifie l'UX révision sur la même mécanique que normale :
 *
 *   - HomeScreen en mode "revision" affiche DEUX boutons :
 *     "Réviser" (équivalent du "Démarrer" normale, mène à la ColdLesson)
 *     et "Exercices" (verrouillé tant que la ColdLesson n'a pas été
 *     parcourue, exactement comme en normale).
 *   - Le greeting est enrichi : "Bonjour [enfant] ! Aujourd'hui, révision."
 *     pour prévenir l'enfant qu'on est en jour de révision (les paliers
 *     longs peuvent contenir beaucoup plus de mots qu'un jour normal,
 *     savoir ce qui se passe évite la panique).
 *   - `_composerSeanceNormale` est renommé en `_composerSeance` et perd
 *     sa garde "type === revision" : la méthode marche pour les deux
 *     types de séance.
 *   - `onStartRevision` du Router est branché sur `_composerSeance` et
 *     navigue vers `cold-lesson` (et non plus `revision-placeholder`).
 *
 * Couvre :
 *   - Câblage Router : nouveau nom de méthode unifiée + nouvelle cible
 *     de navigation pour onStartRevision.
 *   - HomeScreen : structure HTML du menu révision (deux boutons,
 *     greeting enrichi, verrou identique).
 *   - Comportement fonctionnel : _composerSeance marche pour les deux
 *     types et le split cold/exos est correct en révision (D-10.4a).
 *   - Non-régression : recomposition à chaque entrée (D-10.4c) toujours
 *     en place.
 *
 * Lancer : node test_pas11_revision.mjs
 */

import { readFile } from "node:fs/promises";

// --- Polyfill localStorage (requis par UserStateService et certains imports) ---
if (typeof globalThis.localStorage === "undefined") {
  const _store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (_store.has(k) ? _store.get(k) : null),
    setItem: (k, v) => _store.set(k, String(v)),
    removeItem: (k) => _store.delete(k),
    clear: () => _store.clear(),
  };
}

// --- Polyfill window (requis par AudioService qui s'instancie au chargement) ---
if (typeof globalThis.window === "undefined") {
  globalThis.window = {
    speechSynthesis: null,
    SpeechSynthesisUtterance: function () {},
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

/**
 * Extrait le corps d'un callback assigné dans un objet options
 * (forme : `nomCallback: (args) => { ... }`).
 * Comptage d'accolades, même logique que extractMethodBody.
 *
 * @param {string} src
 * @param {string} callbackName - ex: "onStartRevision"
 * @returns {string|null}
 */
function extractCallbackBody(src, callbackName) {
  const re = new RegExp(
    `${callbackName}\\s*:\\s*\\([^)]*\\)\\s*=>\\s*\\{`,
    "g"
  );
  const m = re.exec(src);
  if (!m) return null;
  const start = m.index + m[0].length - 1;
  let depth = 0;
  let i = start;
  let inString = null;
  while (i < src.length) {
    const c = src[i];
    if (inString) {
      if (c === "\\") { i += 2; continue; }
      if (c === inString) inString = null;
    } else {
      if (c === '"' || c === "'" || c === "`") inString = c;
      else if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) return src.slice(start, i + 1);
      }
    }
    i++;
  }
  return null;
}

/**
 * Extrait le corps d'une méthode JS par comptage d'accolades.
 * Plus fiable qu'une regex greedy (qui s'arrêtait à la première
 * `\n  }` interne, par exemple à la fin d'un template literal).
 *
 * @param {string} src - code source complet
 * @param {string} methodName - nom de la méthode (ex: "_renderRevisionMenu")
 * @returns {string|null} corps complet de la méthode (de `{` à `}` inclus)
 *   ou null si la déclaration n'est pas trouvée.
 */
function extractMethodBody(src, methodName) {
  // Pattern: début de ligne + indentation + nom + ( + ...)+ espaces + {
  // On veut la DÉCLARATION, pas un appel comme `this._renderRevisionMenu(...)`.
  const re = new RegExp(
    `(^|\\n)\\s{2}${methodName}\\s*\\([^)]*\\)\\s*\\{`,
    "g"
  );
  const m = re.exec(src);
  if (!m) return null;
  const start = m.index + m[0].length - 1; // position du `{` ouvrant
  // Compteur d'accolades en ignorant les littéraux de chaîne et backticks
  let depth = 0;
  let i = start;
  let inString = null; // null | '"' | "'" | '`'
  while (i < src.length) {
    const c = src[i];
    if (inString) {
      if (c === "\\") { i += 2; continue; }
      if (c === inString) inString = null;
    } else {
      if (c === '"' || c === "'" || c === "`") {
        inString = c;
      } else if (c === "{") {
        depth++;
      } else if (c === "}") {
        depth--;
        if (depth === 0) {
          return src.slice(start, i + 1);
        }
      }
    }
    i++;
  }
  return null;
}

// ════════════════════════════════════════════════════════════════════════
// 1. Sources : lecture des fichiers à inspecter
// ════════════════════════════════════════════════════════════════════════
console.log("\n1. Lecture des sources");

const routerSrc     = await readFile("./core/Router.js", "utf8");
const homeScreenSrc = await readFile("./screens/HomeScreen.js", "utf8");

test("core/Router.js lu",         () => assert(routerSrc.length > 0, "vide"));
test("screens/HomeScreen.js lu",  () => assert(homeScreenSrc.length > 0, "vide"));

// ════════════════════════════════════════════════════════════════════════
// 2. Router : la méthode unifiée _composerSeance existe et remplace
//    _composerSeanceNormale
// ════════════════════════════════════════════════════════════════════════
console.log("\n2. Router : _composerSeance unifié");

test("Router déclare _composerSeance(childId)", () => {
  // La déclaration de méthode : `_composerSeance(childId) {`
  const m = /_composerSeance\s*\(\s*childId\s*\)\s*\{/.test(routerSrc);
  assert(m, "déclaration _composerSeance(childId) introuvable");
});

test("Router : _composerSeance ne bloque plus en cas de type 'revision'", () => {
  const body = extractMethodBody(routerSrc, "_composerSeance");
  assert(body, "corps de _composerSeance introuvable");
  // Heuristique : on cherche la garde "type === 'revision' suivi de
  // return null" que l'on a levée au sous-pas 11.1. Elle ne doit plus
  // exister.
  const hasOldGuard =
    /seance\.type\s*===\s*["']revision["'][\s\S]{0,200}return\s+null/.test(body);
  assert(!hasOldGuard, "garde 'seance.type === revision → return null' encore présente");
});

test("Router : _composerSeance accepte normale ET revision (type inconnu = défense)", () => {
  const body = extractMethodBody(routerSrc, "_composerSeance");
  // Le filet "type inconnu" doit rester : on cherche un test qui
  // accepte les deux types et rejette les autres. Heuristique souple :
  // soit un `!== "normale" && !== "revision"`, soit un test inverse.
  const accepts =
    /["']normale["'][\s\S]{0,80}["']revision["']|["']revision["'][\s\S]{0,80}["']normale["']/.test(body);
  assert(accepts, "filet 'type inconnu' (mention conjointe normale+revision) introuvable");
});

test("L'ancien nom _composerSeanceNormale n'est plus utilisé dans Router", () => {
  assert(
    !/_composerSeanceNormale/.test(routerSrc),
    "_composerSeanceNormale référencé quelque part dans Router.js"
  );
});

// ════════════════════════════════════════════════════════════════════════
// 3. Router : onStartRevision est branché sur _composerSeance et
//    navigue vers cold-lesson
// ════════════════════════════════════════════════════════════════════════
console.log("\n3. Router : onStartRevision branché sur la nouvelle chaîne");

test("Router déclare onStartRevision dans _mountHome", () => {
  assert(
    /onStartRevision\s*:\s*\(\s*childId\s*\)\s*=>/.test(routerSrc),
    "callback onStartRevision introuvable dans _mountHome"
  );
});

test("onStartRevision appelle _composerSeance(childId)", () => {
  const body = extractCallbackBody(routerSrc, "onStartRevision");
  assert(body, "corps de onStartRevision introuvable");
  assert(
    /this\._composerSeance\s*\(\s*childId\s*\)/.test(body),
    "onStartRevision n'appelle pas this._composerSeance(childId)"
  );
});

test("onStartRevision navigue vers 'cold-lesson' (et non plus 'revision-placeholder')", () => {
  const body = extractCallbackBody(routerSrc, "onStartRevision");
  assert(body, "corps de onStartRevision introuvable");
  const goesToCold = /navigate\s*\(\s*['"]cold-lesson['"]/.test(body);
  const goesToPlaceholder = /navigate\s*\(\s*['"]revision-placeholder['"]/.test(body);
  assert(goesToCold, "onStartRevision ne navigue pas vers 'cold-lesson'");
  assert(!goesToPlaceholder, "onStartRevision navigue encore vers 'revision-placeholder'");
});

// ════════════════════════════════════════════════════════════════════════
// 4. HomeScreen : mode révision affiche DEUX boutons (Réviser + Exercices)
// ════════════════════════════════════════════════════════════════════════
console.log("\n4. HomeScreen : deux boutons en mode révision");

test("_renderRevisionMenu contient un bouton data-action='revision' (Réviser)", () => {
  const body = extractMethodBody(homeScreenSrc, "_renderRevisionMenu");
  assert(body, "_renderRevisionMenu introuvable");
  assert(
    /data-action="revision"/.test(body),
    "bouton data-action=\"revision\" absent du menu révision"
  );
  assert(
    /Réviser/.test(body),
    "label 'Réviser' absent du menu révision"
  );
});

test("_renderRevisionMenu contient AUSSI un bouton data-action='exercises'", () => {
  const body = extractMethodBody(homeScreenSrc, "_renderRevisionMenu");
  assert(body, "_renderRevisionMenu introuvable");
  assert(
    /data-action="exercises"/.test(body),
    "bouton data-action=\"exercises\" absent du menu révision"
  );
  assert(
    /Exercices/.test(body),
    "label 'Exercices' absent du menu révision"
  );
});

test("_renderRevisionMenu applique le verrou (locked/disabled) sur Exercices", () => {
  // Le verrou doit fonctionner comme en mode normale : on cherche
  // soit `exercisesUnlocked`, soit `isLessonViewed`, soit `locked`/`disabled`.
  const body = extractMethodBody(homeScreenSrc, "_renderRevisionMenu");
  assert(body, "_renderRevisionMenu introuvable");
  assert(
    /exercisesUnlocked|isLessonViewed/.test(body),
    "calcul de l'état du verrou (exercisesUnlocked / isLessonViewed) absent"
  );
  assert(
    /locked|disabled/.test(body),
    "marquage du verrou (class 'locked' ou attribut 'disabled') absent"
  );
});

test("_renderRevisionMenu câble le bouton 'Réviser' sur onStartRevision", () => {
  const body = extractMethodBody(homeScreenSrc, "_renderRevisionMenu");
  assert(body, "_renderRevisionMenu introuvable");
  // On cherche un addEventListener sur le bouton revision qui appelle
  // onStartRevision (peu importe la syntaxe exacte, avec child.id ou
  // _selectedChildId).
  assert(
    /\[data-action="revision"\][\s\S]{0,200}onStartRevision/.test(body),
    "listener du bouton revision ne câble pas onStartRevision"
  );
});

test("_renderRevisionMenu câble le bouton 'Exercices' sur onStartExercises (déverrouillé)", () => {
  const body = extractMethodBody(homeScreenSrc, "_renderRevisionMenu");
  assert(body, "_renderRevisionMenu introuvable");
  assert(
    /\[data-action="exercises"\][\s\S]{0,300}onStartExercises/.test(body),
    "listener du bouton exercises ne câble pas onStartExercises"
  );
});

// ════════════════════════════════════════════════════════════════════════
// 5. HomeScreen : greeting enrichi en mode révision
// ════════════════════════════════════════════════════════════════════════
console.log("\n5. HomeScreen : greeting enrichi en révision");

test("_renderRevisionMenu mentionne 'Aujourd'hui, révision' dans le greeting", () => {
  const body = extractMethodBody(homeScreenSrc, "_renderRevisionMenu");
  assert(body, "_renderRevisionMenu introuvable");
  // On tolère "révision" ou "Révision", avec ou sans point/exclamation.
  // L'important : le mot et la mention "aujourd'hui".
  assert(
    /[Aa]ujourd'hui[^<]{0,30}[Rr]évision/.test(body),
    "mention 'Aujourd'hui, révision' absente du greeting révision"
  );
});

test("_renderNormalMenu n'a PAS le sous-titre 'Aujourd'hui, révision' (par symétrie)", () => {
  // On ne se sert pas de extractMethodBody ici car _renderNormalMenu
  // contient un template literal imbriqué (lignes ~212-214) que notre
  // parser d'accolades simple ne sait pas équilibrer. À la place, on
  // localise la zone de _renderNormalMenu à la main (entre sa
  // déclaration et la déclaration suivante).
  const startIdx = homeScreenSrc.indexOf("\n  _renderNormalMenu(");
  assert(startIdx >= 0, "_renderNormalMenu introuvable");
  // Fin = début de la prochaine méthode ou bloc commentaire JSDoc
  // suivant. On cherche le prochain "\n  /**" OU "\n  _" (autre méthode).
  const after = homeScreenSrc.slice(startIdx + 25);
  const nextMethodOffset = after.search(/\n  \/\*\*|\n  _[a-z]/i);
  const endIdx = nextMethodOffset >= 0
    ? startIdx + 25 + nextMethodOffset
    : homeScreenSrc.length;
  const zone = homeScreenSrc.slice(startIdx, endIdx);
  assert(
    !/[Aa]ujourd'hui[^<]{0,30}[Rr]évision/.test(zone),
    "mention 'Aujourd'hui, révision' présente à tort dans _renderNormalMenu"
  );
});

// ════════════════════════════════════════════════════════════════════════
// 6. Comportement fonctionnel : _composerSeance marche pour les deux types
// ════════════════════════════════════════════════════════════════════════
console.log("\n6. Comportement fonctionnel : _composerSeance accepte revision");

// On va importer dynamiquement Router et son écosystème, et faire tourner
// la méthode _composerSeance en injectant un composer mock.
const { Router }         = await import("./core/Router.js");
const { exerciseService } = await import("./services/ExerciseService.js");
const { wordRepo }       = await import("./repositories/WordRepository.js");

// Mots de test avec étapes (palette suffisante pour une séance révision)
const wordsByEtape = {
  10: { id: 10, en: "house", fr: "maison",  nature: "n", etape: "j7"  },
  11: { id: 11, en: "tree",  fr: "arbre",   nature: "n", etape: "j30" },
  12: { id: 12, en: "river", fr: "rivière", nature: "n", etape: "j90" },
};

// Patch léger du wordRepo pour le test (on remplace getByIds pour
// renvoyer nos mots de test).
const originalGetByIds = wordRepo.getByIds.bind(wordRepo);
function patchWordRepo() {
  wordRepo.getByIds = (ids) =>
    ids.map(id => wordsByEtape[id]).filter(Boolean);
}
function restoreWordRepo() {
  wordRepo.getByIds = originalGetByIds;
}

// Composer mock qui renvoie une séance révision contrôlée
function makeRevisionComposer(longsIds = [10, 11, 12]) {
  return {
    composerSeance: (childId, dateISO) => ({
      type: "revision",
      longs: longsIds,
    }),
  };
}

function makeNormaleComposer(coldIds = [10, 11], chuteIds = [], nouveauxIds = [], j1Ids = []) {
  return {
    composerSeance: (childId, dateISO) => ({
      type: "normale",
      coldLesson: coldIds,
      chutes: chuteIds,
      nouveaux: nouveauxIds,
      j1: j1Ids,
    }),
  };
}

// Recorder mock minimal (le Router en exige un au constructor mais ne
// l'appelle pas dans _composerSeance, donc no-op suffit).
function makeRecorder() {
  return {
    recordExo:    () => {},
    recordSeance: () => {},
  };
}

// Container DOM minimal (innerHTML noop + querySelector noop) pour ne
// pas avoir besoin de jsdom.
function makeFakeContainer() {
  return {
    innerHTML: "",
    querySelector: () => ({ addEventListener: () => {} }),
    querySelectorAll: () => [],
    appendChild: () => {},
    removeChild: () => {},
  };
}

test("_composerSeance(childId) renvoie {coldWords, exerciseQueue} en mode révision", () => {
  patchWordRepo();
  try {
    const router = new Router(makeFakeContainer(), {
      children: [{ id: "max", name: "Max" }],
      composer: makeRevisionComposer([10, 11, 12]),
      recorder: makeRecorder(),
    });
    const composition = router._composerSeance("max");
    assert(composition !== null, "_composerSeance renvoie null en mode révision (régression)");
    assert(Array.isArray(composition.coldWords), "coldWords doit être un tableau");
    assert(Array.isArray(composition.exerciseQueue), "exerciseQueue doit être un tableau");
    // En révision avec 3 mots longs, on attend 3 ColdLessons.
    assert(
      composition.coldWords.length === 3,
      `coldWords doit contenir 3 mots, reçu ${composition.coldWords.length}`
    );
    // Et au moins quelques exos lourds (les paliers longs déclenchent
    // buildQueueLourd via _buildQueueSeanceRevision).
    assert(
      composition.exerciseQueue.length > 0,
      "exerciseQueue ne devrait pas être vide en révision (paliers longs)"
    );
  } finally {
    restoreWordRepo();
  }
});

test("_composerSeance : la queue exos en révision ne contient PAS de cold_lesson (D-10.4a)", () => {
  patchWordRepo();
  try {
    const router = new Router(makeFakeContainer(), {
      children: [{ id: "max", name: "Max" }],
      composer: makeRevisionComposer([10, 11, 12]),
      recorder: makeRecorder(),
    });
    const composition = router._composerSeance("max");
    const hasColdInExos = composition.exerciseQueue.some(
      item => item.mode === "cold_lesson"
    );
    assert(!hasColdInExos, "exerciseQueue contient encore des items 'cold_lesson'");
  } finally {
    restoreWordRepo();
  }
});

test("_composerSeance : marche aussi en mode normale (non-régression)", () => {
  patchWordRepo();
  try {
    const router = new Router(makeFakeContainer(), {
      children: [{ id: "max", name: "Max" }],
      composer: makeNormaleComposer([10, 11], [], [], []),
      recorder: makeRecorder(),
    });
    const composition = router._composerSeance("max");
    assert(composition !== null, "_composerSeance renvoie null en mode normale");
    assert(composition.coldWords.length === 2, "coldWords doit contenir 2 mots en normale");
  } finally {
    restoreWordRepo();
  }
});

// ════════════════════════════════════════════════════════════════════════
// 7. Non-régression : recomposition à chaque entrée (D-10.4c)
// ════════════════════════════════════════════════════════════════════════
console.log("\n7. D-10.4c — recomposition à chaque entrée (rappel)");

test("Le composer est appelé à chaque appel de _composerSeance", () => {
  patchWordRepo();
  try {
    let nbAppels = 0;
    const composer = {
      composerSeance: (childId, dateISO) => {
        nbAppels++;
        return { type: "revision", longs: [10, 11] };
      },
    };
    const router = new Router(makeFakeContainer(), {
      children: [{ id: "max", name: "Max" }],
      composer,
      recorder: makeRecorder(),
    });
    router._composerSeance("max");
    router._composerSeance("max");
    router._composerSeance("max");
    assert(nbAppels === 3, `composerSeance appelé ${nbAppels} fois au lieu de 3 (cache détecté ?)`);
  } finally {
    restoreWordRepo();
  }
});

// ════════════════════════════════════════════════════════════════════════
// 8. Nettoyage placeholder (sous-pas 11.4)
// ════════════════════════════════════════════════════════════════════════
console.log("\n8. Nettoyage placeholder (sous-pas 11.4)");

test("RevisionPlaceholderScreen n'est plus importé dans Router", () => {
  assert(
    !/RevisionPlaceholderScreen/.test(routerSrc),
    "RevisionPlaceholderScreen est encore référencé dans Router.js"
  );
});

test("Router n'a plus de case 'revision-placeholder' dans son switch navigate", () => {
  assert(
    !/revision-placeholder/.test(routerSrc),
    "case 'revision-placeholder' encore présent dans Router.js"
  );
});

test("Router n'a plus de méthode _mountRevisionPlaceholder", () => {
  assert(
    !/_mountRevisionPlaceholder/.test(routerSrc),
    "méthode _mountRevisionPlaceholder encore présente dans Router.js"
  );
});

// ════════════════════════════════════════════════════════════════════════
// Bilan
// ════════════════════════════════════════════════════════════════════════

await Promise.all(pendingTests);

console.log("\n" + "═".repeat(60));
console.log(`Résultat : ${pass} OK · ${fail} échec(s)`);
if (fail === 0) console.log("Tout passe ✓");
process.exit(fail === 0 ? 0 : 1);
