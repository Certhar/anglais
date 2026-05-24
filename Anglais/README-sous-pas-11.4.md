# Sous-pas 11.4 — Nettoyage final (Pas 11 terminé)

## Fichiers à remplacer dans le projet

- `core/Router.js`
- `test_pas8_smoke.mjs`
- `test_pas11_revision.mjs`
- `Anglais/BIBLE.md`

## Fichier à SUPPRIMER

- `screens/RevisionPlaceholderScreen.js`

(C'est le seul fichier supprimé du projet. Plus aucune référence ne pointe vers lui.)

## Validation

Une fois les fichiers en place, relancer la suite. Attendu :

```
test_UserStateService.mjs        46/47   (caillou §8.3, préexistant)
test_RebrassageService.mjs       47/47
test_OrdonnanceurService.mjs     45/45
test_SessionComposerService.mjs  18/18
test_SessionRecorderService.mjs  32/32
test_pas7_cabling.mjs            11/11
test_pas8_smoke.mjs              14/14   (réduit de 20 : 6 tests placeholder retirés)
test_pas9_cabling.mjs            15/15
test_pas10_2_buildQueueLeger.mjs 27/27
test_pas10_3_buildQueueSeance.mjs 14/14
test_pas10_4_cabling.mjs         19/19
test_pas11_revision.mjs          23/23

TOTAL : 311 / 312
```

## Résumé du Pas 11 complet

Le Pas 11 (sous-pas 11.1 à 11.4) a unifié l'UX révision sur la même
mécanique que l'UX normale :

- **11.1** : `_composerSeanceNormale` renommé en `_composerSeance` (méthode
  unifiée qui marche pour les deux types de séance).
- **11.2** : `onStartRevision` rebranché sur `_composerSeance` + navigation
  vers `cold-lesson`.
- **11.3** : HomeScreen mode révision affiche deux boutons "Réviser" +
  "Exercices" (verrou identique à normale) avec greeting enrichi
  "Aujourd'hui, révision." (nouvelle classe CSS `home-screen-greeting-mode`).
  Test `test_pas11_revision.mjs` écrit (23 tests).
- **11.4** : Suppression de `RevisionPlaceholderScreen`, nettoyage des
  références (import, case switch, méthode, en-tête commentaire), mise à
  jour BIBLE (statut, tableaux, ajout décision D-11a).
