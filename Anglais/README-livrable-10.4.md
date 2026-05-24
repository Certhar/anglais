# Livrable — Sous-pas 10.4

**Branche le `Router` sur `ExerciseService.buildQueueSeance(...)` pour les séances normales.**

## Fichiers à remplacer

| Fichier livré | Emplacement cible dans `Vocabulaire/` |
|---|---|
| `Router.js` | `core/Router.js` |
| `ExerciseScreen.js` | `screens/ExerciseScreen.js` |
| `test_pas10_4_cabling.mjs` | racine `Vocabulaire/` (nouveau fichier) |

## À tester après installation

```bash
cd Vocabulaire
node test_pas10_4_cabling.mjs        # attendu : 19 / 19 ✓
```

Puis non-régression complète :

```bash
node services/test_UserStateService.mjs            # 46/47 (caillou §8.3)
node services/test_RebrassageService.mjs           # 47/47
node services/test_OrdonnanceurService.mjs         # 45/45
node services/test_SessionComposerService.mjs      # 18/18
node services/test_SessionRecorderService.mjs      # 32/32
node test_pas7_cabling.mjs                         # 11/11
node test_pas8_smoke.mjs                           # 20/20
node test_pas9_cabling.mjs                         # 15/15
node test_pas10_2_buildQueueLeger.mjs              # 27/27
node test_pas10_3_buildQueueSeance.mjs             # 14/14
node test_pas10_4_cabling.mjs                      # 19/19  ← NOUVEAU
```

**Total attendu : 294 / 295** (le 1 manquant reste le caillou §8.3 préexistant).

## Résumé des changements

### `core/Router.js`
- **Ajout** de l'import `exerciseService` depuis `services/ExerciseService.js`.
- **Remplacement** de `_composeLesson(childId) → words` par `_composerSeanceNormale(childId) → { coldWords, exerciseQueue } | null`. La nouvelle méthode appelle `composer.composerSeance(...)` puis `exerciseService.buildQueueSeance(...)` puis splitte la queue par filtre `mode === "cold_lesson"` (option β : split côté Router, BIBLE §9 recommandation par défaut).
- **Adaptation** des trois callbacks qui consommaient l'ancienne méthode :
  - `onStartLesson` → utilise `coldWords` (et bascule directement aux exos si `coldWords` est vide mais `exerciseQueue` non vide, cas dégénéré).
  - `onStartExercises` → utilise `exerciseQueue`.
  - `onContinueToExercises` (ColdLessonScreen) → **recompose** à nouveau (D-10.4c : régénération à chaque entrée).
- **Refactor** `_mountExercises` rendu polymorphe : accepte `{ queue }` (cas séance normale orchestré par le Router) ou `{ words }` (cas "Refaire les mots à revoir" depuis ResultScreen). Logique commune extraite dans `_mountExercisesWith(words, queue)`.

### `screens/ExerciseScreen.js`
- Constructeur accepte `options.queue` (Array). Si fournie, la queue est utilisée telle quelle (avec filtre défensif anti-`cold_lesson`). Sinon, fallback historique : `exerciseService.buildQueueLourd(words)`. Préserve le chemin retry depuis ResultScreen.
- JSDoc et commentaire d'en-tête mis à jour.

### `test_pas10_4_cabling.mjs` (nouveau)
- 19 tests : 3 de lecture, 3 de câblage Router → buildQueueSeance, 1 filtrage D-10.4a, 2 acceptation options.queue, 3 split fonctionnel, 1 méthode Router, 2 non-régression cold/queue, 2 D-10.4c (cache absent + recomposition onContinue), 1 main.js inchangé, 1 smoke test cycle complet.
- Aucun import du Router (charge cascade `window.speechSynthesis`) : vérifications textuelles + tests fonctionnels avec mocks sur `ExerciseService` direct.

## Décisions UX respectées (BIBLE §7)

- **D-10.4a** ✓ La queue passée à `ExerciseScreen` est filtrée des entrées `cold_lesson` (ceinture côté Router + bretelle côté ExerciseScreen).
- **D-10.4b** ⏸️ Hors périmètre 10.4 : la séance révision reste sur `RevisionPlaceholderScreen` jusqu'au Pas 11 (qui devient trivial, BIBLE §9).
- **D-10.4c** ✓ Recomposition à chaque entrée dans Exercices (`onStartExercises` ET `onContinueToExercises`). Pas de cache. Le composer gère lui-même l'exclusion `acquiredToday`.

## Reste à faire après 10.4

- **Pas 11** : remplacer `RevisionPlaceholderScreen` et faire pointer `onStartRevision` (et plus largement, unifier l'UX révision avec l'UX normale, deux boutons). Devient trivial parce que `buildQueueSeance` gère déjà `seance.type === "revision"` (test 10.3 vert).
- BIBLE §9 tâches de fond : caillou §8.3, suppression `ProgressService`, fusion BIBLE/architecture.md.
