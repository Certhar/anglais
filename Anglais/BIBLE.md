# BIBLE — Vocabulaire (Anglais)

> **Document unique de référence** pour le projet Vocabulaire.
> Premier document à lire en début de session. Tout est dedans.
> Le détail technique profond reste dans `architecture.md`, à consulter à la demande.
>
> **Dernière mise à jour** : 24 mai 2026 (Anglais 25 — déployé sur GitHub Pages ; corpus 'to be' corrigé ; fix re-séance via mode relecture ; fix UX drapeaux + dark mode ; §11.4 à §11.6 ajoutées).
> **Statut du dépôt** : 319 / 319 tests verts. Pas 11 livré ; caillou §8.3 réglé ; audits pluriels et doublons appliqués ; corpus 'to be' corrigé (was/been au lieu de was/were/been) ; mode relecture implémenté (filtre acquiredToday + coldLesson rejouable) ; drapeaux agrandis et collés au mot, mode clair forcé ; main.js bascule sur words.canonical.json et expose 4 profils (Julie, Max, Papa, Mamy). App déployée à https://certhar.github.io/anglais/. Prochain travail : retours terrain de la béta, sujets §11.5.

---

## 1. Le projet en bref

Application web d'apprentissage du vocabulaire anglais pour Max (2nde) et son frère, conçue par Gauthier (Gogo). Cible : ~1400 mots A2 sur 4 mois. Stack : PWA HTML / CSS / JS vanilla, localStorage, pas de framework, pas de backend. S'inscrit dans la suite "Futur Simple" (cousine de Monstroclasse, Prosodie, etc.).

Le moteur pédagogique combine :
- **Une présentation quotidienne** (ColdLesson : on découvre les mots du jour).
- **Des exercices** déclinés en 8 modes (mcq, typing_fr, audio_to_text, text_to_audio, forms_verb, forms_plural, cold_lesson).
- **Un rebrassage espacé** sur 5 paliers : J+0 / J+1 / J+7 / J+30 / J+90. Les paliers longs (j7/j30/j90) sont alignés sur le mercredi.

L'enfant joue, il ne raisonne pas sur la mécanique.

---

## 2. Méthode de collaboration (obligatoire)

Lire et respecter avant toute action.

- **Petits pas testables, livrables téléchargeables.** Un fichier livré, validation, on enchaîne.
- **Questions en termes utilisateur**, pas en termes techniques. Pas "Map vs Set", mais "qu'est-ce que l'enfant doit voir si...".
- **Ne pas réinventer les décisions tranchées** (§7). Si Gauthier dit "c'est OK", c'est OK. La mécanique se cape souvent elle-même par construction.
- **État des lieux factuel en début de session** : lecture du dépôt + exécution des tests, avant toute proposition.
- **`Anglais/grammaire.md` ne se touche jamais** — c'est un chantier séparé.
- **Surveillance des tokens.** Mieux vaut s'arrêter trop tôt avec une bonne synthèse que trop tard avec une session morcelée.
- **Profil de Gauthier** : non-programmeur, instituteur, quadrilingue, 16 ans de terrain. Il décrit ce que l'utilisateur (ses enfants) doit voir ; Claude traduit en code. Méthodique, patient, bienveillant en cas d'erreur — une correction est un signal utile, pas un reproche.

---

## 3. Architecture en bref

Couches strictement étanches (une couche ne parle qu'à celle directement en-dessous) :

```
PRESENTATION (HTML/CSS/DOM)
SCREENS       (controllers d'écran)
SERVICES      (logique métier, pure, testable)
REPOSITORIES  (accès aux données)
STORAGE       (localStorage + JSON statique)
```

### Services principaux (dans `services/`)

| Service | Rôle en une ligne |
|---|---|
| `UserStateService` | Persistance par enfant (state, progress, exosProgress, acquiredToday, getAppDate avec rollover 3h). |
| `RebrassageService` | Cycle de vie d'un mot dans les 5 paliers. Alignement mercredi pour j7/j30/j90 (D2bis). |
| `OrdonnanceurService` | Ordre d'introduction des nouveaux mots (4 phases : boot, V-T-V, T-T-T, thèmes purs ; bracket comme clé). |
| `SessionComposerService` | Compose la séance du jour en ids de mots (lecture seule, pas d'écriture). |
| `SessionRecorderService` | Unique écrivain du cycle. Enregistre les résultats en fin de séance (D6). |
| `ExerciseService` | Construit la queue d'exos pour une liste de mots (lourd / léger / séance). |
| `AudioService`, `DeterminerService` | Audio Web Speech API ; choix a/an. |
| `ProgressService` | ⚠️ deprecated, à supprimer à terme. |

### Écrans (dans `screens/`)

`HomeScreen` (2 menus selon `sessionType` — voir §6) — `ColdLessonScreen` — `ExerciseScreen` — `ResultScreen`.

### Modes d'exercice (dans `modes/`)

`ColdLessonMode`, `McqMode`, `TextInputMode`, `TypingFrMode`, `AudioToTextMode`, `TextToAudioMode`, `FormsVerbMode`, `FormsPluralMode`.

Pour le détail (data flow complet, modèle de données, conventions JSDoc, etc.) → `architecture.md`.

---

## 4. Tableau des exos par palier (vérité de référence)

C'est l'arbitrage pédagogique de Gauthier. À respecter strictement.

| Exercice | J+0 | J+1 | J+7 | J+30 | J+90 |
|---|---|---|---|---|---|
| **ColdLesson** | ✅ | — | ✅ | ✅ | ✅ |
| **mcq** | ✅ | — | ✅ | — | ✅ |
| **typing_fr** | ✅ | — | — | — | — |
| **audio_to_text** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **text_to_audio** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **forms_verb** \* | ✅ | ✅ | ✅ | ✅ | ✅ |
| **forms_plural** \* | ✅ | — | — | — | — |

\* uniquement si le mot a la particularité (verbe irrégulier / pluriel notable)

### Décomptes pour un mot lambda (sans particularité)

| Palier | Nb d'exos | Composition |
|---|---|---|
| J+0 | **5** | ColdLesson + mcq + typing_fr + audio_to_text + text_to_audio |
| J+1 | **2** | audio_to_text + text_to_audio |
| J+7 | **4** | ColdLesson + mcq + audio_to_text + text_to_audio |
| J+30 | **3** | ColdLesson + audio_to_text + text_to_audio |
| J+90 | **4** | ColdLesson + mcq + audio_to_text + text_to_audio |

### Variantes pour mot avec particularité

- **Verbe irrégulier** (`note: "irrég: ..."`) : ajouter `forms_verb` à tous les paliers (J+0 à J+90 inclus).
- **Pluriel notable** (`note: "pluriel: ..."` ou `"irrég pluriel: ..."`) : ajouter `forms_plural` au J+0 uniquement (cf. §5.5).

---

## 5. Logiques pédagogiques sous-jacentes

### 5.1 L'oral est partout, l'écrit s'allège
`audio_to_text` et `text_to_audio` sont présents à **tous les paliers** — compétences orales à entretenir en permanence. À l'inverse, les modes "compréhension écrite → français" (`mcq`, `typing_fr`) s'allègent dans le temps : une fois le sens du mot ancré, inutile de le retraduire en boucle.

### 5.2 `typing_fr` disparaît dès J+1, sans retour
Choix délibéré. Une fois la traduction tapée au J+0, on ne la retape plus. On la **reconnaît** via `mcq` (J+7, J+90), et on **manipule** le mot à l'oral. La forme écrite anglaise est travaillée par `audio_to_text` (dictée).

### 5.3 Idiomes : pas d'exclusion
Décision 21 mai : les expressions idiomatiques (`nature: "idiom"`) suivent **le même traitement** que les autres mots, y compris `typing_fr`. La traduction française attendue est l'équivalent idiomatique ("il pleut des seaux") et non littérale ("il pleut des chats et des chiens"). L'enfant intériorise vite la convention. Le commentaire historique "À PRÉVOIR exclusion typing_fr pour idiom" a été supprimé de `ExerciseService.js` au sous-pas 10.1.

### 5.4 ColdLesson en J+1 : non
À J+1, le mot a été réussi la veille — l'enfant doit **se souvenir**, pas relire. Lui réafficher le mot rendrait les 2 exos triviaux. Les chutes (mots ratés la veille) auront leur ColdLesson de toute façon puisqu'elles reviennent à J+0.

### 5.5 `forms_plural` uniquement à J+0 : explication corpus
Deux types de pluriels irréguliers dans le corpus :

| Type | Exemples | Présence corpus | Pourquoi pas de rebrassage forms_plural |
|---|---|---|---|
| **"À pattern"** (-f→-ves, -y→-ies…) | wife/wives, leaf/leaves | Une seule entrée (le singulier, avec note) | La règle se rebrasse d'elle-même à travers tous les mots qui la suivent |
| **"Totalement uniques"** | child/children, mouse/mice | Deux entrées (singulier ET pluriel) | Le pluriel a sa propre vie dans le corpus, rebrassé comme un mot à part entière |

Dans les deux cas, le système n'a rien de spécial à faire au-delà du J+0.

### 5.6 `forms_verb` partout : explication pédagogique
Les 3 formes d'un verbe irrégulier (think / thought / thought) sont **vraiment** dures à retenir. Il faut les rabâcher à chaque palier, sinon elles s'oublient — contrairement à un pluriel qui se rencontre naturellement dans la langue.

### 5.7 Critère de réussite d'un mot à un palier
Un mot est "réussi" à un palier si **TOUS les exos prévus de ce palier sont réussis**. S'il en rate un seul, le mot **chute** (reset j0, redémarre le cycle).

**Précision** : la tolérance faute de frappe (Levenshtein dans `TextInputMode`) est intégralement conservée. Une typo n'est pas un échec — c'est `TextInputMode` qui décide en interne ce qui constitue `success: true`.

---

## 6. Modèle de séance et rythme hebdomadaire

### 6.1 Deux types de séance

Deux types seulement (le type `"rien"` du modèle initial a été supprimé le 20 mai 2026 — un mercredi sans révision longue est désormais traité comme un jour normal) :

- **`"normale"`** : chutes + nouveaux + J+1. Contient une `coldLesson` (chutes + nouveaux).
- **`"revision"`** : uniquement les mots j7/j30/j90 dûs ce jour-là. Pas de coldLesson au niveau séance.

### 6.2 Invariant mercredi

Toute date `dateProchainRebrassage` d'un mot en étape ∈ {j7, j30, j90} est, par construction, un mercredi. Mécanisme : à l'écriture, `RebrassageService.alignerSurJourPivot` aligne sur le mercredi le plus proche (équidistant → mercredi suivant). Filet de sécurité : `console.warn` si l'invariant est violé. Ne s'applique **qu'aux longs paliers**, pas aux courts (j0, j1).

### 6.3 Comportement d'absence

- **1 jour normal manqué** : chutes/J+1 attendent à la prochaine connexion. Aucun changement.
- **Mercredi manqué** : la prochaine connexion bascule en mode révision longue exclusif (pas de nouveaux, pas de chutes, pas de J+1 ce jour-là — uniquement les j7/30/90 dûs). Les chutes/J+1 anciens attendent encore une connexion.
- **Détection du mode révision longue** : par contenu (présence d'au moins un mot en étape j7/30/90 dû). Fiable grâce à l'invariant mercredi.
- **Absence très longue** : hors champ pour l'usage actuel. Le rythme est garanti par la présence parentale.

### 6.4 Composition

**Séance normale — 2 enveloppes :**

- **Enveloppe lourde** — N=10 mots maximum, set complet (5-7 exos par mot) :
  1. Chutes de la veille (priorité 1)
  2. Nouveaux pour compléter jusqu'à 10 (priorité 2)
- **Enveloppe légère** — jusqu'à 10 J+1 en sus, 2-3 exos par mot.

Volume max : 10 lourds + 10 légers = **20 mots**, ~80-100 exercices.

**Séance révision :**
- Tous les mots en étape {j7, j30, j90} avec `dateProchainRebrassage ≤ aujourd'hui`.
- Set complet selon palier (cf. tableau §4). Pas de cap, pas de tri, pas de priorité.
- Charge cognitive max : ~50 mots × ~4 exos = ~200 exos. Acceptable, le mercredi présentiel garantit le rythme.

### 6.5 Ordre dans la séance

**Séance normale** (concaténation dans cet ordre) :
1. **ColdLesson** : chutes + nouveaux (dans cet ordre)
2. **Exos lourds** : chutes (set complet) + nouveaux (set complet)
3. **Exos légers** : J+1 dûs (set court)

**Séance révision** :
1. **ColdLesson groupée** : tous les mots j7/j30/j90 dûs (ordre j7 → j30 → j90, cf. D-10.3b)
2. **Exos longs** : chacun avec le set de son palier (cf. tableau §4)

### 6.6 UX deux boutons (HomeScreen)

Mêmes deux boutons en séance normale ET en séance révision :
- **"Leçon"** : toujours disponible et accessible (peut être revue).
- **"Exercices"** : **grisé** tant que la ColdLesson n'a pas été parcourue, puis activé.

L'enfant ne raisonne pas sur "j'ai une séance révision aujourd'hui", il joue. La cohérence d'expérience est volontaire.

---

## 7. Décisions tranchées (référence rapide)

> Format : code — résumé en 3-4 lignes avec justification clé.
> Pour le détail complet et l'historique des arbitrages, voir les fichiers archivés dans `Anglais/archive/`.

### D1 — Format de sortie de `composerSeance()`
Ids purs (`Array<wordId>`), pas d'objets `Word` complets. Cohérence avec Rebrassage et Ordonnanceur, testabilité accrue, séparation propre (composition vs résolution).

### D2 — Sémantique du mercredi (retournement majeur 18 mai)
Mercredi = **jour app spécial révision longue** (et non plus jour off comme dans la bible initiale). Pas de nouveaux, pas de chutes, pas de J+1. Uniquement les rebrassages longs dûs ce jour-là. Permet au parent de faire le point avant la séance de grammaire présentielle.

### D2bis — Convergence des paliers longs sur le mercredi
À l'écriture de `dateProchainRebrassage` pour j7/30/90 : aligner sur le mercredi le plus proche (équidistant → mercredi suivant). `decalerSiJourOff` renommé en `alignerSurJourPivot` (logique inversée par rapport à la bible initiale).

### D2ter — Comportement d'absence
Cf. §6.3.

### D2quater — Chute en révision longue
Reset complet à j0 (comportement existant inchangé). `etape` retombe à `j0`, `dateIntroduction` écrasée à aujourd'hui (mercredi de la chute), `dateProchainRebrassage` devient le lendemain (jeudi). Historique préservé.

### D3 — Composition d'une journée normale (quota à 2 enveloppes)
Cf. §6.4. Pas de cap explicite sur les J+1 : par construction, on ne peut jamais avoir plus de N J+1 dûs.

### D3bis — Composition d'une journée révision longue
Cf. §6.4. Pas de cap, pas de tri, pas de priorité — on prend tout.

### D3ter — ColdLessonScreen
Journée normale : ColdLesson = chutes + nouveaux (sans les J+1). Journée révision : ColdLesson groupée en début (cf. D-10.4b).

### D4 — Reprise après abandon de session
- **N1 — Granularité** : au niveau du mot acquis (`acquiredToday`).
- **N2 — Expiration** : rollover à **3h du matin** (`getAppDate(now) = now - 3h`).
- **N3 — UX à la reprise** : conserver l'existante (2 boutons HomeScreen, accès direct aux mots restants en mode reprise).
- **N4 — ColdLesson à la reprise** : toujours accessible, pas obligatoire.

### D5 — Architecture des services
SessionComposer et SessionRecorder = services **injectés** (constructeur prend `{userState, wordRepo, rebrassage, ordonnanceur}`). Export double : classe pour tests + singleton câblé pour Router.

### D6 — Enregistrement des résultats
- **Quand** : en fin de séance (complete OU abort), depuis le Router.
- **Où** : `SessionRecorderService` injecté, miroir du Composer.
- **Vers Rebrassage** : si tous les modes prévus du mot réussis → `introduireMot` ou `enregistrerRebrassage`. Sinon → rien (le mot reste dans son état précédent).
- **Stockage intra-jour** : `exosProgress` (modes réussis par wordId) + `acquiredToday`.
- **Reprise après échec** : l'exo raté est **rejoué** (refaire un exo raté = répétition = apprentissage). `exosProgress` ne stocke que les succès.

### D-10.2a — ColdLesson dans la queue
La ColdLesson apparaît dans la queue produite par `buildQueueLeger`/`buildQueueLourd` sous forme d'entrée `mode: "cold_lesson"` (snake_case, cohérent avec les autres modes).

### D-10.2b — Modes en queue légère
`typing_fr` et `forms_plural` **jamais** en `buildQueueLeger`. `forms_verb` à tous les paliers légers en bonus si verbe irrégulier (cf. §5.6).

### D-10.2c — Ordre interne d'une queue légère
Phase par mode, mots à l'intérieur de chaque phase (identique à `buildQueueLourd`).

### D-10.3a — Composition `buildQueueSeance` normale
Chutes + nouveaux passés en un seul appel `buildQueueLourd([...chutes, ...nouveaux])` (entrelacés par mode, pas concaténés bloc par bloc).

### D-10.3b — Ordre des paliers en révision
Ordre : **j7 → j30 → j90**. Préoccupation : présenter les paliers du plus récent au plus ancien.

### D-10.3c — Mots sans `etape` valide
Mots sans `etape` valide dans `seance.longs` → `console.warn` + ignorés (filet de sécurité).

### D-10.4a — ColdLesson en séance normale : statu quo
UX existante conservée. Deux boutons HomeScreen ("Leçon" / "Exercices"), Exercices grisé tant que la ColdLesson n'a pas été parcourue. **La queue passée à `ExerciseScreen` ne doit PAS contenir d'entrées `mode: "cold_lesson"`** — elles sont consommées en amont par `ColdLessonScreen`.

### D-10.4b — ColdLesson en séance révision : groupée en début
Même UX que séance normale (deux boutons, Leçon groupée d'abord). Aucun changement de logique requis dans `_buildQueueSeanceRevision` (les ColdLessons sont déjà agrégées en tête de queue).

### D-10.4c — Reprise après interruption : filtrage par mots acquis
Reprise depuis le début, sans les mots déjà acquis. La queue est régénérée à neuf à chaque entrée dans l'écran d'exercices ; `SessionComposerService` exclut les mots dans `acquiredToday`. `exosProgress` **n'est pas utilisé** pour le filtrage au sous-pas 10.4 (mais reste écrit pour stats futures).

### D-11a — UX révision : greeting enrichi
En mode révision, HomeScreen affiche `"Bonjour [enfant] ! Aujourd'hui, révision."` (sous-titre discret sous le greeting principal). Justification : les jours de révision peuvent contenir beaucoup plus de mots qu'un jour normal (cumul des paliers j7/j30/j90), et l'enfant doit pouvoir s'y préparer mentalement. Une fois entré dans la ColdLesson ou les exos, l'expérience est identique entre normale et révision.

### D-12 — Traitement des pluriels dans le corpus (23 mai 2026)
Deux conventions, à respecter pour toute nouvelle entrée du corpus :

1. **Irréguliers réguliers** (pluriels en -ves, -ies, -es, -oes : `wives`, `families`, `dresses`, `tomatoes`…) : une seule entrée pour le singulier, avec mention `pluriel: <forme>` dans la note. Un mode `forms_plural` peut générer un exercice à partir de cette mention.
2. **Irréguliers irréguliers** (`children`, `feet`, `mice`, `men`, `women`, `teeth`, `geese`, `oxen`, `people`) : DEUX entrées distinctes, une pour le singulier (note `irrég pluriel: <forme>`) et une pour le pluriel (note `pluriel irrég de <forme>`), placées côte à côte dans `ordre_dans_theme`. Justification : ces formes méritent d'être croisées comme mots autonomes pour bien enfoncer le clou.

Le cas `person/people` suit la même convention que les autres irréguliers irréguliers, même si linguistiquement `people` n'est pas le pluriel morphologique de `person`. Pédagogiquement, c'est traité comme un couple pour la cohérence du schéma.

Audit appliqué le 23 mai 2026 : 38 mentions de pluriel ajoutées aux irréguliers réguliers oubliés, 3 entrées sœurs créées (`men`, `women`, `geese`, `oxen`, plus `a goose` et `an ox`), 1 suppression du doublon `a coach` (sens autocar peu utile).

### D-13 — Traitement des doublons `word_en` dans le corpus (23 mai 2026)

Quand un même mot anglais peut avoir deux entrées dans le corpus :

1. **Doublon légitime** : les deux entrées portent des sens vraiment distincts. La traduction française doit **désambiguïser le sens** (parenthèse type `clair (couleur)`, `une livre (£)` ; ou choix lexical comme `un couple` / `quelques-uns` pour `a couple`). Pas de doublons avec exactement la même traduction.
2. **Faux doublon** : si les deux entrées ont la même traduction ou sont des synonymes français du même sens anglais (cas `funny = drôle/marrant`, `a way = un moyen/une façon`), on n'en garde qu'une.
3. **Cas thèmes "outils" vs "expressions"** : un mot dupliqué entre `Mots-outils` et `Expressions conversation` est considéré comme un faux doublon. On garde l'entrée Mots-outils (avec sa nature grammaticale propre : `adv`, etc.) et on supprime l'entrée Expression (cas `maybe`, `of course`).

**Limite connue** : même pour les doublons légitimes, l'ambiguïté EN→FR subsiste (l'enfant qui voit `light` ne sait pas quel sens on attend). Sujet ouvert documenté en §10.1.

Audit appliqué le 23 mai 2026 : 5 suppressions (id 871 `music`, id 1122 `funny`, id 1421 `a way`, id 1302 `Maybe`, id 1300 `Of course`), 6 corrections (id 1175 `a couple` → "quelques-uns", id 1409 `a way` → "une manière", nettoyages divers), nettoyage de toutes les notes "déjà vu" résiduelles du corpus (24 entrées).

### Décisions Router prises en autonomie (mai 2026, provisoires)

- **5a — Abandon ColdLesson (croix)** : la leçon n'est PAS marquée comme parcourue. Justification : la croix est un abandon explicite ; marquer la leçon contournerait le verrou trop facilement.
- **5b — Abandon Exercices (croix)** : on amène l'enfant sur `ResultScreen` avec `aborted=true` et bilan partiel. Justification : retour direct sur Home après plusieurs exos serait frustrant.
- **5c — "Refaire les mots à revoir"** : relance une nouvelle `ExerciseScreen` avec uniquement les mots non acquis (ratés au moins une fois).

---

## 8. Statut d'avancement et tests

### 8.1 Avancement du plan (15 pas)

| # | Tâche | Statut |
|---|---|---|
| 0 | Doc §7.5/7.6/7.7 patchée | ✅ |
| 1 | RebrassageService v2 (alignement mercredi, JOUR_PIVOT) | ✅ |
| 2 | Tests Rebrassage | ✅ 47/47 |
| 3 | Squelette SessionComposerService | ✅ |
| 4 | Cas "rien" du composer | ✅ (puis supprimé au pas 8) |
| 5 | Cas "révision longue" | ✅ |
| 6 | Cas "normale" | ✅ 18/18 |
| 7 | Câblage Router | ✅ 11/11 |
| 8 | Refonte modèle 2 types + RevisionPlaceholderScreen | ✅ 20/20 |
| 9 | SessionRecorderService | ✅ 32/32 + 15/15 (cabling) |
| 10.1 | `buildQueue` → `buildQueueLourd` | ✅ |
| 10.2 | `buildQueueLeger` | ✅ 27/27 |
| 10.3 | `buildQueueSeance` | ✅ 14/14 |
| 10.4 | Brancher Router sur `buildQueueSeance` | ✅ 19/19 |
| **11** | **Vrai écran de révision (UX unifiée, suppression placeholder)** | ✅ **23/23** |
| 12 (option) | Extensions UserStateService | partiellement déjà fait |

### 8.2 Suites de tests à l'arrivée

| Suite | Attendu | Lieu |
|---|---|---|
| `test_UserStateService.mjs` | 47/47 | `services/` |
| `test_RebrassageService.mjs` | 47/47 | `services/` |
| `test_OrdonnanceurService.mjs` | 45/45 | `services/` |
| `test_SessionComposerService.mjs` | 18/18 | `services/` |
| `test_SessionRecorderService.mjs` | 32/32 | `services/` |
| `test_pas7_cabling.mjs` | 11/11 | **racine** |
| `test_pas8_smoke.mjs` | 14/14 (réduit de 20/20 au Pas 11 : suppression des tests placeholder) | **racine** |
| `test_pas9_cabling.mjs` | 15/15 | **racine** |
| `test_pas10_2_buildQueueLeger.mjs` | 27/27 | **racine** |
| `test_pas10_3_buildQueueSeance.mjs` | 14/14 | **racine** |
| `test_pas10_4_cabling.mjs` | 19/19 | **racine** |
| `test_pas11_revision.mjs` | 23/23 | **racine** |
| **Total** | **312 / 312** | — |

### 8.3 Caillou §8.3 — levé le 22 mai 2026

**État** : ✅ résolu. Suite `test_UserStateService.mjs` désormais à 47/47.

**Ce qui se passait**. Le test *"Migration douce : enfant existant SANS champ progress (vieux state)"* (ligne 390) forgeait dans `localStorage` un vieux state `{ max: { lessonViewed: true, lastUsedDate: "2026-05-17" } }`, puis appelait `isLessonViewed("max")` en attendant `true`. Le service voyait `lastUsedDate` (17 mai) différente de la date du jour, déclenchait le rollover prévu par **D4 N2**, remettait `lessonViewed` à `false`, et l'assertion échouait.

**Diagnostic**. Le code faisait son travail (rollover de jour calendaire = reset des flags du jour, c'est précisément la règle pédagogique « la leçon se revoit chaque jour »). Le test confondait deux notions :
- *migration douce structurelle* : créer les champs nouveaux manquants (`progress`, `exosProgress`, `acquiredToday`) dans un vieux state sans crash. C'est ce que le code fait correctement (testé séparément dans le groupe 12).
- *préservation des flags du jour à travers un changement de date* : volontairement **non** désirée — le rollover D4 N2 est une décision pédagogique tranchée.

**Décision** (Gauthier, 22 mai 2026, option A) : test faux, code juste. Test reformulé pour :
- utiliser `lastUsedDate` du jour (neutralise le rollover qui n'est pas le sujet),
- retirer l'assertion sur `lessonViewed` (qui contredisait D4 N2),
- recentrer l'invariant sur la migration *structurelle* (création de `progress`, préservation de `_lastChildId`, écriture possible via `recordWordOutcome`).

Le rollover automatique reste testé indépendamment dans le groupe 12 (« Rollover automatique au changement de jour » + « Migration douce SANS exosProgress / acquiredToday »).

---

## 9. Ce qui reste à faire

### Pas 12+ : à arbitrer avec Gauthier

L'application est désormais fonctionnelle de bout en bout pour les deux types de séance (normale et révision). Les pas suivants possibles ne sont plus dictés par une dépendance technique. Quelques chantiers ouverts, à hiérarchiser :

- **Extensions UserStateService** : déjà partiellement fait. Compléments éventuels : statistiques (jours d'utilisation, taux de réussite par mode), export/import des données, gestion fine du rollover de jour.
- **Persistance réelle des résultats de séance** : `SessionRecorderService` écrit aujourd'hui dans `localStorage` via `userState`. À vérifier que le filtrage `acquiredToday` survit au rechargement et que les paliers j7/j30/j90 se déclenchent correctement sur la durée.
- **Tester sur le terrain avec Max et son frère** : la mécanique est en place, il reste à valider que les ~30 secondes de "tu peux te lancer" tiennent leur promesse pédagogique.
- **Régler le caillou §8.3** ✅ levé le 22 mai 2026 (cf. §8.3).
- **Suppression du service `ProgressService.js`** (deprecated).
- **Audit doublons `word_en` du corpus** ✅ traité le 23 mai 2026. Résultat : 5 suppressions (id 587 `a coach` autocar, id 871 `music`, id 1122 `funny`, id 1421 `a way`, id 1302 `Maybe`, id 1300 `Of course`), 6 corrections de traductions/notes (id 1175 `a couple` → "quelques-uns", id 1409 `a way` → "une manière", nettoyages divers), nettoyage de toutes les notes "déjà vu" résiduelles. Reste 10 doublons légitimes (sens vraiment distincts, traductions désambiguïsées). Voir aussi §10.1 (ambiguïté EN→FR documentée comme sujet ouvert).

### Tâches de fond

- Fusionner les évolutions récentes (Pas 10 + Pas 11) dans `architecture.md` pour en refaire la bible unique technique. À faire en session dédiée.

---

## 10. Décisions en attente non-tranchées

Sujet de fond ouvert, à reprendre quand on aura le temps de le creuser proprement. Identifié par Gauthier le 23 mai 2026 en marge du chantier doublons.

### 10.1 Ambiguïté des homonymes en exercice EN→FR

**Le problème.** De nombreux mots anglais ont deux sens distincts et sont stockés dans le corpus comme deux entrées séparées (`light` = clair / léger ; `a couple` = un couple / quelques-uns ; `a pound` = monnaie / poids ; etc.). Côté français, la traduction porte souvent un contexte parenthésé (`clair (couleur)`, `une livre (£)`) qui désambiguïse au moment où l'enfant traduit FR→EN.

**Mais en EN→FR**, si l'exercice montre simplement le mot anglais `light` et demande la traduction française, l'enfant ne sait pas quel sens on attend. Et les sub_thèmes ne protègent pas : en révision, les paliers j7/j30/j90 cumulent les mots sans tenir compte des sub_thèmes, donc les deux entrées d'un même mot peuvent se retrouver le même jour dans la même séance.

**Portée.** Au moins 12 cas connus parmi les doublons audités (mai 2026). Probablement d'autres cas non encore détectés, notamment les mots stockés en une seule entrée avec une note "deux sens" (à explorer).

**Pistes de réflexion, non tranchées :**
- *Piste A — corpus* : enrichir les notes des entrées ambiguës avec un exemple contextualisant (`light` côté léger : `ex: a light bag = un sac léger`), et faire en sorte que les modes EN→FR affichent cette note pendant l'exercice.
- *Piste B — code* : détecter automatiquement les ambiguïtés (entrées partageant le même `en_base`) et adapter le mode (afficher un exemple, basculer FR→EN, accepter en QCM).
- *Piste C — modes* : interdire EN→FR pour les mots ambigus ; ils ne passent que par des modes où la direction est non ambiguë.

À discuter en session dédiée. Sujet sérieux qui mérite mieux qu'une réponse rapide.

---

## 11. Pour plus tard — sortie publique

Sujets qui n'existent **pas** dans l'usage actuel (app familiale, deux enfants, deux téléphones, données qui tiennent sans souci en `localStorage`). À reprendre **si et quand** l'app sort de la sphère familiale.

### 11.1 Modèle d'utilisateurs : multi-enfants partagés vs "un tel = un user"

Aujourd'hui non-sujet : Max et son frère utilisent l'app sur leurs propres téléphones, et le fix `_lastChildId` (Router se souvient du dernier enfant utilisé) suffit à supprimer l'irritant du choix à chaque ouverture.

Le vrai sujet apparaîtrait si l'app était distribuée à d'autres familles : faut-il garder le modèle multi-enfants partagés (vue 1 systématique), basculer en "un appareil = un user" (vue 2 directe), ou proposer un hybride configurable ? Décision liée à l'Étape PWA et à la sémantique de stockage côté serveur.

### 11.2 Suivi parental et écran admin/stats

**Aujourd'hui** : non-sujet. Gauthier voit la progression de ses enfants oralement (échange du soir) et, si besoin, en inspectant le `localStorage` de l'appareil concerné via les DevTools du navigateur. La présence parentale rend tout écran de stats redondant — et un compte de test (`Papa`, cf. `main.js`) permet à Gauthier d'éprouver les écrans sans polluer la progression réelle des enfants.

**Si sortie publique** : il faudra un véritable écran admin/parent, qui agrégerait au minimum :
- jours d'utilisation effectifs (avec ou sans trous) ;
- mots en cours par palier (j0 / j1 / j7 / j30 / j90) ;
- taux de réussite par mode d'exercice (où l'enfant coince — `typing_fr` ? `forms_verb` ?) ;
- mots qui chutent à répétition (signal pédagogique fort).

Décision liée à §11.1 (modèle d'utilisateurs) et à l'Étape PWA. Tant qu'on garde le modèle multi-enfants partagés, l'écran admin peut rester côté client (lecture du `localStorage` de chaque profil). Si on bascule en backend synchronisé, l'écran devient une vraie page web côté serveur.

### 11.3 Compatibilité plateformes

**Cible béta (mai 2026)** : **Chrome Android** + **Chrome desktop**. C'est sur ces plateformes que l'app a été éprouvée, et c'est ce que Max et son frère utiliseront. Toute autre cible est explicitement hors-périmètre béta.

**iOS / Safari** : non testé. Le code n'a aucune adhérence iOS-spécifique connue, et la Web Speech API y est en principe excellente (voix de qualité). **Mais** Safari impose qu'une première interaction utilisateur (tap) précède toute lecture audio — en pratique le bouton "Démarrer" suffit à débloquer, mais ce n'est pas vérifié. À reprendre dans une session de test dédiée si l'app sort de la sphère familiale.

**Firefox** : abandonné en cours de route. Le moteur `speechSynthesis` de Firefox est instable (événements `onend` en retard, perdus, ou émis pour des utterances annulées ; "moteur muet" après quelques speak/cancel). Plusieurs parades ont été tentées et **sont toujours dans `AudioService.js`** : système d'`_speakId` qui invalide les callbacks périmés, filet de sécurité qui déclenche `onEnd` manuellement après une durée estimée, watchdog `resume()` toutes les 7 secondes pour réveiller le "moteur muet". Le résultat n'a jamais atteint un niveau de fiabilité satisfaisant pour les enfants, donc **décision (Gauthier, mai 2026) d'avancer sans Firefox**.

**Pourquoi garder les parades dans le code** : elles ne nuisent pas sur Chrome (no-op si tout va bien) et serviront le jour où on reprendra Firefox. Les supprimer maintenant obligerait à les réécrire de zéro plus tard. À garder en l'état tant qu'il n'y a pas de bonne raison de nettoyer.

**À reprendre — checklist post-béta** :
- Test complet sur iOS Safari (iPhone récent et plus ancien).
- Audit Firefox : reprendre les bugs observés, voir si le moteur a évolué depuis mai 2026, décider si on relance l'effort ou si on documente Firefox comme non supporté.
- Test sur navigateurs alternatifs Android (Samsung Internet, Brave) — probablement OK puisqu'ils dérivent de Chromium, à confirmer.

### 11.4 Mode relecture — re-séance dans la journée (Anglais 25)

**Le problème observé** : après avoir terminé sa séance du jour, l'enfant qui re-cliquait "Démarrer" ou "Exercices" voyait une **nouvelle cold lesson démarrer** avec 10 nouveaux mots — soit l'équivalent d'une 2e séance dans la journée. Cassait le rythme du spaced repetition.

**La racine** : `OrdonnanceurService.getMotsDisponibles` filtrait sur `getWordProgress` (mot déjà en cycle d'apprentissage) mais **pas** sur `acquiredToday` (mot traité aujourd'hui). Donc juste après la séance, les mots du jour n'étaient pas encore en `wordProgress` (le rollover intervient au lendemain) et `tirerNouveaux` proposait simplement les 10 suivants de la file boot.

**Le fix (deux étages)** :

1. **`OrdonnanceurService.getMotsDisponibles`** : ajout d'un second filtre `!isWordAcquiredToday`. Empêche la re-introduction le jour même.

2. **`SessionComposerService._composerNormale`** : ajout d'une **phase 4 "relecture"**. Si après calcul, `chutes=[]`, `nouveaux=[]` et `j1=[]` (= séance terminée), mais que `acquiredToday` n'est pas vide, on reconstitue `coldLesson = acquiredToday`. L'enfant peut ainsi re-cliquer "Démarrer" pour revoir les mots du jour, ou "Exercices" pour refaire les exos.

3. **`ExerciseService._buildQueueSeanceNormale`** : ajout d'une branche `else if` qui régénère les exos lourds quand on est en mode relecture (coldLesson non vide, chutes/nouveaux/j1 vides).

**Pourquoi c'est sûr** : `SessionRecorderService` est déjà **idempotent** sur `acquiredToday` (ligne 269-273). Un mot déjà acquiredToday est skip lors de la sauvegarde de la nouvelle séance. Donc rejouer les exos n'a **aucun** effet pédagogique ni sur la progression, ni sur les paliers, ni sur le rollover.

**Comportement utilisateur final** :
- Pendant la séance du jour → comportement inchangé.
- À la fin de la séance → écran de résultat normal.
- L'enfant revient sur Home, voit le bouton "Démarrer" → si re-clic, **la même cold lesson** (mots du jour) se relance pour relecture.
- Bouton "Exercices" déverrouillé → exos régénérés sur les mots du jour, refaisables.
- À minuit, rollover normal : `acquiredToday` est vidé, le lendemain est un vrai nouveau jour.

**Tests ajoutés** (319/319 verts) :
- 2 dans `test_OrdonnanceurService.mjs` (filtre acquiredToday, scénario re-tirage).
- 2 dans `test_pas10_3_buildQueueSeance.mjs` (mode relecture côté ExerciseService).
- 3 dans `test_SessionComposerService.mjs` (composer en mode relecture, garde-fous).

### 11.5 Améliorations différées (issues du retour béta Anglais 25)

**Sujets identifiés par Gauthier au cours de la béta** mais non traités tout de suite, pour rester sur des petits pas testables.

**11.5.a — Switch "tous les exos / exos chutés"**

Pendant la relecture, l'enfant devrait pouvoir choisir entre :
- refaire **tous** les exos du jour (entraînement libre) ;
- refaire **seulement les exos chutés** (consolidation ciblée).

Décision UX : un switch en haut de l'écran exercices, **disponible uniquement quand la séance est terminée** (= mode relecture actif). Pas de switch en cours de séance pour ne pas induire de comportement avant que l'enfant ait fait l'exo une première fois.

**Ce qui existe déjà** : la notion de "mot chuté" est claire dans le code (mot j0 dû le lendemain = chute). Donc le filtre pédagogique est simple : `mots chutés du jour = mots où l'enfant a échoué`.

**Ce qui reste à concevoir** :
- Comment distinguer un "mot chuté du jour" d'un "mot validé du jour" à l'intérieur d'`acquiredToday` (qui contient les deux) ? Probablement via `historique` du `WordProgress` créé par `introduireMot`/`enregistrerRebrassage` : si le dernier passage du jour est `success=false`, c'est une chute.
- Où placer le switch dans l'UI ? Header du `ExerciseScreen` ? Toggle button ?
- Persistance du choix : doit-il être mémorisé entre re-clics ? Probablement non (chaque entrée = choix neuf).

**11.5.b — Message de fin de séance ("Bravo, c'est fini pour aujourd'hui !")**

Quand l'enfant termine sa séance, afficher une page de félicitation explicite plutôt que de juste enchaîner sur le ResultScreen normal. Objectif pédagogique : marquer la satisfaction du travail accompli, et signaler que **revenir est optionnel** (relecture = bonus, pas obligation).

**À concevoir** :
- Où dans le flux ? Probablement entre `ResultScreen` (dernier exo) et le retour Home — un écran intermédiaire "FelicitationsScreen".
- Quel critère "séance terminée" ? Le plus simple : si `acquiredToday` couvre tous les mots `coldLesson` initiaux (ou approximation similaire).
- À montrer une seule fois par jour, ou à chaque fois que l'enfant finit ? Probablement une seule fois (sinon devient pénible si l'enfant fait plusieurs aller-retours).
- Ne pas bloquer l'accès à la relecture pour autant.

**11.5.c — Erreur 'be' (mémo)**

Le corpus a été corrigé en Anglais 25 (`was/were/been` → `was/been`) pour produire `be / was / been` à l'exercice forms_verb. **Mais** le fichier `data/words.canonical.json` est auto-généré par `scripts/build_corpus.py` à partir de CSV. Si le pipeline est un jour relancé, la correction sera écrasée. À reporter dans `data/Fréquence_enrichi.csv` (ligne "to be") quand on remettra la main sur les sources et le script.

**11.5.d — Modélisation "exo chuté" vs "mot chuté"**

À l'occasion du switch (11.5.a), discuter avec Gauthier la granularité du suivi : aujourd'hui le système trace au niveau du **mot** (acquis/non-acquis). Si on veut un suivi plus fin ("Max rate systématiquement les `typing_fr` sur les noms féminins"), il faudra un nouveau service de stats par-exo. Probablement post-PWA, lié à §11.2 (suivi parental).

### 11.6 Fix UX drapeaux + dark mode Android (Anglais 25)

**Le problème observé** : sur Chrome Android (Samsung) en mode système dark, Gauthier rapportait :
1. Drapeaux **délavés** (bleu et rouge pâles, gris au milieu) — quasi invisibles sur fond noir.
2. **Erreurs de langue** (réponses en anglais quand on attendait français) parce que le drapeau était trop discret pour attirer l'attention.
3. **Drapeau hors écran** quand le clavier virtuel s'ouvrait : la zone visible se réduisait, le drapeau (placé au-dessus du mot) sortait par le haut.

**Diagnostic** :
- Cause de la désaturation : Samsung Internet / Chrome Android applique un **filtre dark mode auto** sur les pages qui ne déclarent pas de thème. Ce filtre désature les couleurs vives pour "respecter" le fond sombre. Les SVG du drapeau perdent ~60% de saturation.
- Cause du drapeau hors écran : structure HTML `consigne → drapeau → mot`. Quand le clavier ouvre, le mot reste visible (champ de saisie focusé) mais le drapeau au-dessus est repoussé hors viewport.
- Cause profonde du problème UX : le drapeau, **séparé** visuellement du mot, est en marge du flux de lecture. L'œil va directement au mot (gros, centré, contenu principal) et zappe le drapeau.

**Le fix (deux volets)** :

1. **Forcer le mode clair** :
   - Dans `index.html` : `<meta name="color-scheme" content="light">` + `<meta name="theme-color" content="#ffffff">`.
   - Dans `ui/styles.css` (html, body) : `color-scheme: light;`.
   Résultat : Android ne déclenche plus son filtre dark, les drapeaux retrouvent leurs vraies couleurs (bleu `#0055A4`, rouge `#EF4135`), toute la palette reprend sa vivacité.

2. **Drapeau au-dessus du mot AGRANDI + drapeaux encadrant le champ de saisie** :
   - Le drapeau standalone au-dessus du mot (`.exercise-prompt-flag`) est conservé mais agrandi de `1.7rem` à `2rem` (desktop) / `1.4rem` à `1.6rem` (mobile), avec une bordure renforcée pour mieux le détourer.
   - **Décision Gauthier (Anglais 25)** : nouveau marquage à l'endroit exact où l'enfant tape. Dans `TextInputMode._render()`, l'`<input>` est encadré par **deux drapeaux** (un avant, un après) dans une rangée `.typing-input-row`. Le mapping est trivial : `_getLanguage()` retourne `"fr"` ou `"en"`, mappé vers `flag('fr')` ou `flag('gb')`. Drapeaux solidaires de l'input → restent visibles avec lui même quand le clavier mobile pousse le contenu.
   - Modes touchés : `TypingFrMode` (drapeau 🇫🇷 ×2) et `AudioToTextMode` (drapeau 🇬🇧 ×2), tous deux via leur parent `TextInputMode`.
   - **Pas de drapeau ajouté sur** : `McqMode` (les options sont déjà en français en clair), `TextToAudioMode` (pas de champ de saisie texte), `FormsVerbMode` (3 formes verbales = anglais évident par construction), `FormsPluralMode` (idem). Décision de sobriété : drapeau uniquement là où il y a ambiguïté possible.

**Effets attendus** :
- Drapeau impossible à manquer (deux drapeaux qui encadrent le champ là où l'enfant va taper).
- Drapeaux restent visibles avec l'input même quand le clavier ouvre (solidaires en flex).
- Couleurs vives partout (bleus, rouges, verts retrouvent leur éclat).

**À tester en béta** :
- Mode clair forcé : aspect global de l'app sur Chrome Android (rendu général, pas seulement les drapeaux).
- Vérifier que les enfants distinguent bien la langue de réponse sur TypingFr et AudioToText après changement.
- Si le drapeau au-dessus du mot devient redondant avec les drapeaux encadrant le champ, le retirer (mais pour la béta, double exposition = filet de sécurité).

---

## 12. Annexe — pointeurs vers les docs profondes

- **`Anglais/architecture.md`** — Bible technique profonde (1384 lignes, dernière mise à jour 20 mai 2026). À consulter par section, jamais en bloc. Sections clés : §3 (couches), §4 (structure fichiers), §5 (modèle de données), §7.5 (rythme hebdo + révision), §8 (ordonnancement), §9 (modes). ⚠️ partiellement désynchronisée avec la BIBLE sur les exos par palier — c'est la BIBLE §4 qui fait foi.
- **`Anglais/fiche-prono-anglais.md`** — Référence pédagogique stable (Gauthier, 9 mai 2026) : règles de lecture des prononciations pour les enfants. Pas touchée par les sessions de code.
- **`Anglais/grammaire.md`** + **`grammaire-extracted.json`** — Chantier grammaire séparé. **Ne pas toucher.**
- **`Anglais/archive/`** — Documents historiques consolidés dans cette BIBLE :
  - `SESSION-decisions-SessionComposer.md` (détail D1-D6)
  - `PAS-10-cadrage.md`, `PAS-10-decisions.md`, `PAS-10-4-decisions.md`
  - `ETAT-DES-LIEUX-21-mai-2026.md` (instantané daté)
  - `decisions-en-attente.md` (versions antérieures des sujets §10)
  - `PROMPT-successeur.md` (ancien, remplacé)
  - `words_frequence.csv`, `words_themes.csv` (audit corpus, pas lus par le code)

---

**Fin de la BIBLE. Tout est dedans. Le successeur lit ce document en premier, le détail en seconde lecture si besoin.**
