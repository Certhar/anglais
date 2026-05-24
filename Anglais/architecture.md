# Vocabulaire — Architecture technique

> **Projet** : Application d'apprentissage du vocabulaire anglais pour Max (2nde) et son frère
> **Cible** : ~1400 mots A2 sur 4 mois
> **Stack** : PWA (HTML / CSS / JS vanilla)
> **Statut** : Bible de référence active. Fusionne `architecture.md` (mai 2026),
> `synthese_rebrassage.md`, `synthese_ordonnancement.md` (mai 2026) et
> `SESSION-decisions-SessionComposer.md` (19 mai 2026).
> **Auteur** : Gauthier (Gogo) — design avec Claude
> **Dernière mise à jour** : 20 mai 2026

### Changelog

- **20 mai 2026** — Pas 7 (câblage Router) et Pas 8 (refonte du modèle de journée).
  - **Modèle de journée simplifié à 2 types** (au lieu de 3) :
    - `"normale"` : leçon + exercices ordinaires (chutes + nouveaux + J+1).
    - `"revision"` (anciennement `"revision_longue"`) : journée dédiée
      aux paliers longs j7/j30/j90.
    - Le type `"rien"` est SUPPRIMÉ. Un mercredi sans révision longue est
      désormais traité comme un jour normal. Les paliers longs restent
      ancrés sur le mercredi via `alignerSurJourPivot`, donc en pratique
      les révisions tomberont surtout les mercredis — mais le composer
      ne traite plus le mercredi comme un jour spécial.
  - Renommage `"revision_longue"` → `"revision"` (cohérent avec le label
    UI du bouton).
  - `SessionComposerService` : helpers `_estMercredi` et `_seanceVide`
    supprimés (code mort). Tests adaptés : 18/18 ✓.
  - `Router` : câble le composer pour de bon. `_composeLesson` simplifié
    à 2 cas (normale OK / revision déviée vers placeholder). Nouveau
    `_mountRevisionPlaceholder`, nouveau `_computeSessionType`. Date du
    jour calculée en fuseau local (helper `_dateISOAujourdhui`).
  - `HomeScreen` : 2 menus selon `sessionType` ("normale" → boutons
    Démarrer + Exercices ; "revision" → bouton unique Réviser). Nouveau
    callback `onChildPicked` qui permet au Router de re-monter avec le
    bon menu après le choix d'enfant. Renommage UI "Leçon" → "Démarrer".
  - `RevisionPlaceholderScreen` créé : écran provisoire pour le bouton
    "Réviser" en attendant l'ExerciseService spécial du Pas 11.
  - Tests : 141/141 ✓ (47 + 45 + 18 + 11 + 20).

- **19 mai 2026** — Pas 1 à 6 du plan SessionComposer.
  - `RebrassageService` : inversion de la logique mercredi. Les paliers
    longs (j7/j30/j90) sont désormais **alignés sur le mercredi le plus
    proche** à l'écriture (et non plus poussés hors mercredi). Renommages :
    `decalerSiJourOff` → `alignerSurJourPivot`, `JOUR_OFF` → `JOUR_PIVOT`.
    Filet de sécurité ajouté (`console.warn` si l'invariant est violé).
    Tests : 47/47 ✓.
  - `SessionComposerService` créé : compose la séance du jour sous
    forme d'ids de mots. Tests : 18/18 ✓.
  - Intégration des décisions D1 à D8 du document
    `SESSION-decisions-SessionComposer.md` dans ce fichier.
- **18 mai 2026** — Intégration des champs `ordo_file` et `bracket` du
  corpus.

---

## Sommaire

1. [Vision et principes directeurs](#1-vision-et-principes-directeurs)
2. [Stack technique](#2-stack-technique)
3. [Architecture en couches](#3-architecture-en-couches)
4. **[Intermède : glossaire technique pour Gauthier](#intermede-glossaire-technique-pour-gauthier)**
5. [Structure des fichiers](#4-structure-des-fichiers)
6. [Modèle de données](#5-modele-de-donnees)
7. [Cycle de vie d'une journée d'apprentissage](#6-cycle-de-vie-dune-journee-dapprentissage)
8. **[Moteur de rebrassage (J+1, J+7, J+30, J+90)](#7-moteur-de-rebrassage)**
9. **[Ordonnancement des introductions (boot → V-T-V → T-T-T → thèmes)](#8-ordonnancement-des-introductions)**
10. [Les modes d'exercice](#9-les-modes-dexercice)
11. [Configuration globale](#10-configuration-globale)
12. [Conventions de code](#11-conventions-de-code)
13. [Plan de développement](#12-plan-de-developpement)
14. [Hébergement, PWA, sync, dashboard parent](#13-hebergement-pwa-sync-dashboard-parent)
15. [Audio et stratégie hors-ligne](#14-audio-et-strategie-hors-ligne)
16. [Backup / export utilisateur](#15-backup--export-utilisateur)
17. [Compatibilité Monstrokid](#16-compatibilite-monstrokid)
18. [Décisions UX en réserve](#17-decisions-ux-en-reserve)

---

## 1. Vision et principes directeurs

### 1.1 Principes pédagogiques

- **L'enfant est acteur** : il choisit son rythme (1 séance/jour, refaire la même, etc.) mais ne choisit pas l'ordre des mots (progression imposée).
- **Double étape quotidienne** : leçon froide (découverte) + exercices (évaluation).
- **Échec ≠ punition** : les mots ratés (= "chutes") reviennent automatiquement le lendemain dans la pile.
- **Quota quotidien soutenable** : 10 items lourds maximum par jour. Une mauvaise journée ne plombe pas la suivante mais ralentit l'introduction de nouveauté.
- **Pas de compétition fratrie** : comptes étanches, statistiques individuelles uniquement.
- **Démarrage rapide** : ouvrir l'app et commencer en moins de 30 secondes (héritage UX Futur Simple).

### 1.2 Principes techniques

- **Factorisation maximale dès le départ** : pas de "on refactorera à la fin".
- **Source unique de vérité** : le corpus canonique (JSON dérivé des CSV éditables) est la référence.
- **Configuration externalisée** : pas de magic numbers, tout dans `app-config.js`.
- **Couches étanches** : l'UI ne parle pas au stockage, elle passe par les services.
- **Compatible Monstrokid** : structure JSON et conventions alignées sur l'écosystème Futur Simple.

### 1.3 Non-objectifs (volontairement)

- Pas de framework JS (React, Vue, Svelte) — JS vanilla suffit.
- Pas de backend pour le MVP — tout en local (localStorage, IndexedDB plus tard si nécessaire).
- Pas de reconnaissance vocale — affichage de la prononciation + auto-évaluation.
- Pas de compétition fratrie ni de leaderboard.
- Pas de monétisation, pas de tracking, pas d'analytics.

---

## 2. Stack technique

| Couche | Technologie | Justification |
|---|---|---|
| Markup | HTML5 | Standard, sémantique |
| Styles | CSS3 + variables CSS | Pas de Tailwind/SCSS — moins de dépendances |
| Logique | JavaScript ES6+ vanilla | Pas de framework — taille projet le justifie |
| Stockage local | localStorage (MVP), IndexedDB plus tard si besoin | Persistance simple à mettre en place |
| Audio | Web Speech API du navigateur (MVP), MP3 plus tard si qualité insuffisante | Gratuit en MVP |
| Installation | PWA (manifest + service worker) | Installable sur tel, marche offline |
| Hébergement | Netlify ou GitHub Pages | Gratuit, push git = déploiement |
| Build | Aucun (pas de bundler) | Modules ES6 natifs |

---

## 3. Architecture en couches

L'application respecte une **séparation stricte des responsabilités**. Une couche ne parle qu'à la couche immédiatement en-dessous.

```
┌─────────────────────────────────────────────────────────────┐
│  PRESENTATION                                                │
│  (HTML, CSS, rendering DOM)                                  │
│  → ne sait rien d'autre que comment s'afficher              │
├─────────────────────────────────────────────────────────────┤
│  SCREENS (controllers d'écran)                               │
│  (logique d'écran, événements UI, navigation)                │
│  → orchestre Presentation + Services                         │
├─────────────────────────────────────────────────────────────┤
│  SERVICES (logique métier)                                   │
│  → pur, testable, réutilisable                               │
│  → AudioService, DeterminerService, ExerciseService,         │
│    UserStateService, RebrassageService (à venir),            │
│    OrdonnanceurService (à venir),                            │
│    SessionComposerService (à venir)                          │
├─────────────────────────────────────────────────────────────┤
│  REPOSITORIES (accès aux données)                            │
│  → encapsule le stockage                                     │
│  → WordRepository                                            │
├─────────────────────────────────────────────────────────────┤
│  STORAGE                                                     │
│  → localStorage (données utilisateur),                       │
│    JSON statique (corpus figé)                               │
└─────────────────────────────────────────────────────────────┘
```

### 3.1 Règles d'or

1. **Une couche ne parle qu'à celle directement en-dessous.** L'UI n'accède jamais à localStorage directement.
2. **Une couche ne connaît pas les couches au-dessus.** Un Service ne sait pas s'il est utilisé par tel ou tel écran.
3. **Les flux remontants se font par événements ou callbacks**, jamais par appel direct.
4. **Les données traversent les couches sous forme de DTO** (Data Transfer Objects) bien définis.

---

## Intermède : glossaire technique pour Gauthier

> Ce glossaire est volontairement placé ici pour que tu puisses t'y référer en lisant la suite. Pas de honte à venir le relire à chaque retour de pause.

### Les mots du métier dans ce projet

| Terme | Ce que ça veut dire concrètement |
|---|---|
| **Couche** | Un étage de responsabilité. Comme dans un mille-feuilles : chaque étage fait UN truc et ne sait pas ce qui se passe à l'étage du dessus. |
| **Écran (screen)** | Une page complète que l'enfant voit. HomeScreen = page d'accueil, ExerciseScreen = page des exercices, etc. |
| **Mode** | Un "type" d'exercice. McqMode = QCM, TypingFrMode = saisie traduction française, etc. Un écran (ExerciseScreen) fait défiler plusieurs modes pour un même mot. |
| **Service** | Un module qui rend un service technique, sans interface visuelle. Comme un assistant qu'on appelle pour faire un boulot précis. *DeterminerService.decorate("mother", "a_an") → "a mother".* |
| **Repository** | Un module qui sait charger des données depuis un fichier ou une base, et qui sait les ranger. C'est le bibliothécaire du projet. |
| **Router** | Le module qui décide où aller après chaque clic. Quand un écran a fini son boulot, il appelle le Router et dit "j'ai terminé". Le Router décide quel écran afficher ensuite. |
| **DTO** | "Data Transfer Object" — un objet qui transporte des données entre les couches. Genre `{wordId: 42, success: true}`. Rien de magique, juste un objet plain. |
| **localStorage** | Une mini-base intégrée dans le navigateur. On y range des paires clé/valeur (string seulement). Persistant, mais lié au navigateur (si tu changes de navigateur ou que tu vides le cache, c'est perdu). |
| **PWA** | Progressive Web App. Une page web qui peut s'installer sur le téléphone comme une vraie app, et qui marche offline. C'est juste de la web bien configurée. |
| **Service Worker** | Un petit programme qui tourne en arrière-plan dans le navigateur et qui sert à faire marcher l'app hors-ligne (cache des fichiers, gestion offline). |
| **TTS** | "Text-To-Speech" — synthèse vocale. La voix qui prononce un mot à partir de son texte. |
| **MVP** | "Minimum Viable Product" — version minimale qui marche et apporte de la valeur. On ne fait pas tout d'un coup. |
| **SRS** | "Spaced Repetition System" — système de répétition espacée (Anki, etc.). Ce qu'on appelle ici "rebrassage". |

### Les "verbes" du moteur pédagogique

| Terme | Ce que ça veut dire |
|---|---|
| **Introduction (J+0)** | Première rencontre d'un mot. L'enfant le voit pour la première fois et fait un set complet d'exercices dessus. |
| **Chute** | L'enfant rate les exercices sur ce mot. Pas grave : le mot revient demain. |
| **Rebrassage** | Le mot revient à une date précise (J+1, J+7, J+30, J+90) pour consolider la mémoire. |
| **Acquis** | Le mot a passé toutes les étapes (J+0 → J+1 → J+7 → J+30 → J+90 sans chuter). Il sort du cycle. |
| **Reset complet** | Si l'enfant chute en rebrassage (par ex. au J+30), le cycle recommence à zéro. Le mot redevient un J+0 le lendemain. |
| **Journée découverte** | Journée normale : 10 mots lourds (chutes + nouveaux) + les J+1 légers de la veille. Type `"normale"` dans `SessionComposerService`. |
| **Journée révision** | Journée spéciale : uniquement les rebrassages J+7/30/90 dûs. Pas de nouveaux mots, pas de J+1. Type `"revision"`. Tombe sur un mercredi par défaut (alignement), ou un autre jour si l'enfant a manqué le mercredi (rattrapage automatique). |

---

## 4. Structure des fichiers

```
vocabulaire/
│
├── index.html                       # Point d'entrée unique
├── manifest.webmanifest              # Manifest PWA (à venir)
├── service-worker.js                 # Cache offline (à venir)
│
├── core/                            # Plomberie partagée
│   ├── Router.js                    # Navigation entre écrans (le metteur en scène)
│   ├── BaseEngine.js                # Classe mère pour tous les modes
│   ├── EventBus.js                  # Communication inter-composants
│   ├── ButtonStateManager.js        # Activation/désactivation groupée
│   └── helpers.js                   # Utilitaires (debounce, etc.)
│
├── services/                        # Logique métier
│   ├── AudioService.js              # ✅ TTS du navigateur (en place)
│   ├── DeterminerService.js         # ✅ "a/the/my/this" + accords FR (en place)
│   ├── ExerciseService.js           # ✅ Génère la file d'exos pour des mots (en place)
│   ├── UserStateService.js          # ✅ Qui est l'enfant, leçon vue, etc. (en place)
│   │
│   ├── RebrassageService.js         # 🔴 À CODER — cycle J+0/J+1/J+7/J+30/J+90
│   ├── OrdonnanceurService.js       # 🔴 À CODER — quels nouveaux mots (boot/V-T-V/T-T-T/thèmes)
│   └── SessionComposerService.js    # 🔴 À CODER — assemble la séance du jour
│
├── repositories/                    # Accès aux données
│   └── WordRepository.js            # ✅ Charge le corpus JSON, donne par thème/phase
│
├── modes/                           # Types d'exercices
│   ├── ColdLessonMode.js            # ✅ Leçon froide
│   ├── McqMode.js                   # ✅ QCM 4 choix
│   ├── TypingFrMode.js              # ✅ Saisie traduction française
│   ├── AudioToTextMode.js           # ✅ Audio → écrire le mot
│   ├── TextToAudioMode.js           # ✅ Texte → prononcer (auto-évaluation)
│   ├── FormsVerbMode.js             # ✅ 3 formes du verbe irrégulier
│   ├── FormsPluralMode.js           # ✅ Pluriel irrégulier
│   └── TextInputMode.js             # ✅ Classe abstraite partagée (saisie texte)
│
├── screens/                         # Écrans de l'application
│   ├── HomeScreen.js                # ✅ Accueil (choix enfant + menu)
│   ├── ColdLessonScreen.js          # ✅ Étape 1 du jour (apprentissage)
│   ├── ExerciseScreen.js            # ✅ Étape 2 du jour (évaluation)
│   └── ResultScreen.js              # ✅ Bilan de session
│
├── ui/                              # Composants UI réutilisables (à structurer)
│   └── styles/
│
├── data/                            # Données figées
│   ├── words.canonical.json         # ✅ Corpus officiel (1369 mots)
│   ├── words.boot.json              # ✅ Corpus de test (30 mots)
│   ├── words.json                   # ⚠️ Vieux corpus de 10 mots (à dépublier)
│   └── audio/                       # MP3 pré-générés (phase 2, optionnel)
│
└── config/
    └── app-config.js                # Configuration globale
```

**Légende** : ✅ en place et fonctionnel · 🔴 à coder · ⚠️ à nettoyer

---

## 5. Modèle de données

### 5.1 Structure d'un mot (words.canonical.json)

```json
{
  "id": 1,
  "word_en": "to be",
  "translation_fr": "être",
  "nature": "v",
  "level": "A1",
  "theme": "Verbes essentiels 1",
  "sub_theme": "auxiliaire",
  "note": "irrég: was/been",
  "prono": "tù bî",
  "audio": "audio/to_be.mp3",

  "ordo_file": "freq",
  "phase": "boot",
  "bracket": 1,
  "categorie_ordo": "V",
  "ordre_dans_phase": 1,
  "groupe_semantique": null,
  "ordre_theme": null,
  "ordre_dans_theme": null,

  "fr_gender": null,
  "fr_starts_vowel": false,
  "fr_number": "sg",
  "en_countability": null,
  "en_starts_vowel": false,
  "en_base": "be",
  "fr_base": "être"
}
```

**Note** : un mot appartient à **exactement une** des deux files :
- `ordo_file = "freq"` → les champs `phase` / `bracket` / `categorie_ordo` / `ordre_dans_phase` sont remplis, `ordre_theme` / `ordre_dans_theme` sont `null`.
- `ordo_file = "themes"` → l'inverse.

Le détail de chaque champ d'ordonnancement est en §8.4.

#### Convention de nature

| Tag       | Sens                                     | Exemple                       |
|-----------|------------------------------------------|-------------------------------|
| `n`       | nom                                      | a cat, a mother               |
| `v`       | verbe                                    | to go, to like                |
| `adj`     | adjectif                                 | big, blue                     |
| `adv`     | adverbe                                  | quickly, often                |
| `pron`    | pronom                                   | I, you, mine                  |
| `det`     | déterminant                              | the, this, my                 |
| `prep`    | préposition                              | in, on, under                 |
| `conj`    | conjonction                              | and, but, because             |
| `modal`   | verbe modal                              | can, must, should             |
| `num`     | nombre                                   | one, two, fifty               |
| `expr`    | formule / bloc prêt à l'emploi           | Hello, Thank you, How are you?|
| `idiom`   | expression idiomatique (réservé)         | (aucun pour l'instant)        |

Et quelques compositions hybrides : `n/adj`, `det/pron`, `prep/conj`, etc.

**Distinction `expr` vs `idiom`** : `expr` regroupe les formules sociales et locutions à sens transparent (Hello, Thanks, My name is...). Elles passent normalement par tous les modes. `idiom` est réservé pour les expressions au sens non déductible (`raining cats and dogs`). Pour `idiom`, `typing_fr` sera désactivé. Le corpus actuel ne contient aucun `idiom`.

#### Convention de note (verbes irréguliers, pluriels)

- **Verbes irréguliers** : `irrég: prétérit/participe` (forme courte) ou `irrég: base/prétérit/participe` (forme longue exceptionnelle).
  Cas particulier de `to be` : la note `irrég: was/been` ignore la distinction `was`/`were` (traitée en grammaire).
- **Pluriels notables** : `pluriel: <pluriel>` ou `irrég pluriel: <pluriel>`.
- **Ligne du pluriel lui-même** : `pluriel irrég de <singulier>` → pas d'exo généré, c'est l'entrée-pluriel autonome.

### 5.2 Structure d'un utilisateur (localStorage)

Par enfant :
```json
{
  "id": "max",
  "name": "Max",
  "created_at": "2026-05-09T12:00:00Z",
  "preferences": {
    "audio_enabled": true,
    "show_pronunciation": true
  }
}
```

### 5.3 Structure de progression (implémentée — UserStateService v1.1)

Stockée dans la clé localStorage `vocabulaire.userState.v1`, **imbriquée par enfant** sous une clé `progress` (objet `wordId → entry`) :

```js
{
  "max": {
    "lessonViewed": false,
    "lastUsedDate": "2026-05-18",
    "progress": {
      "42": {
        "etape": "j7",
        "dateIntroduction": "2026-05-10",
        "dateProchainRebrassage": "2026-05-17",
        "historique": [
          {"date": "2026-05-10", "statut": "j0", "resultat": "ok"},
          {"date": "2026-05-11", "statut": "j1", "resultat": "ok"}
        ]
      }
    }
  },
  "julie": { "...": "..." },
  "_lastChildId": "max"
}
```

**Étapes possibles** : `j0`, `j1`, `j7`, `j30`, `j90`, `acquis`.
**Résultats possibles** : `ok`, `chute`.

**Choix d'imbrication** : structure objet par enfant (et non un tableau plat de couples `user×word`) pour s'aligner sur le modèle existant de `UserStateService` et accélérer les lectures par enfant. La clé est `wordId` stringifiée (contrainte JSON), reconvertie en `Number` à la sortie par les getters de listes (`getAllProgress`, `getWordsByEtape`, `getWordsDueOn`).

**Migration douce** : un enfant déjà présent sans champ `progress` (créé avant l'ajout) est complété en silence au premier accès, sans bump de version de clé. Une entrée corrompue (étape inconnue, date malformée) est ignorée à la lecture sans casser le service.

**Persistance vs pédagogie** : `UserStateService` est de la pure persistance — il accepte et restitue ce qu'on lui donne, valide la structure, mais ne décide d'aucune transition d'étape ni d'aucune date. Toute la logique du cycle vit dans `RebrassageService` (cf. §7).

### 5.4 Structure d'une session (optionnel, pour l'historique)

```json
{
  "user_id": "max",
  "date": "2026-05-10",
  "type": "decouverte",
  "items_lourds": [{"word_id": 1, "success": true}, ...],
  "items_legers": [{"word_id": 12, "success": true}, ...]
}
```

---

## 6. Cycle de vie d'une journée d'apprentissage

### 6.1 Flux nominal

```
1. Max ouvre l'app
   → HomeScreen : son menu (le profil est déjà mémorisé)

2. Max voit deux boutons :
     📖 Leçon (toujours actif)
     ✏️ Exercices (verrouillé tant que la leçon du jour n'a pas été vue)

3. Max clique sur "📖 Leçon"
   → ColdLessonScreen
   → Présente les mots du jour, un par un, sans évaluation
   → Carte avec mot + traduction + prono + audio
   → À la fin : "Passer aux exercices →"

4. Max clique sur "✏️ Exercices"
   → ExerciseScreen
   → File d'exos générée par ExerciseService :
       - Items lourds (chutes + nouveaux) : 4-6 exos chacun
       - Items légers (J+1) : 2-3 exos rapides
   → Les ratés sont notés en "chute"
   → À la fin : ResultScreen avec stats

5. Le lendemain à minuit, le verrou se remet automatiquement.
```

### 6.2 Composition de la séance du jour

C'est le rôle du **SessionComposerService**. Le détail complet est en sections 7 (rebrassage) et 8 (ordonnancement).

---

## 7. Moteur de rebrassage

> Cette section spécifie **comment** les mots reviennent dans le temps. C'est le cœur pédagogique.

### 7.1 Concepts

| Terme | Définition |
|---|---|
| **Mot** | Une unité lexicale du corpus, identifiée par son `id`. |
| **Introduction (J+0)** | Première rencontre du mot. Set complet de 6 à 8 exercices. |
| **Chute** | Échec sur un mot. La logique de détection est **déjà codée** dans l'app (cf. `ExerciseScreen` + `ResultScreen.acquired`), à réutiliser. |
| **Rebrassage J+1** | Revisite légère, le lendemain, d'un mot **réussi**. 2-3 exos rapides. |
| **Rebrassage J+7 / J+30 / J+90** | Revisites programmées aux dates calendaires correspondantes. |
| **Cycle complet** | J+0 → J+1 → J+7 → J+30 → J+90. Toute chute en rebrassage = reset complet. |
| **Journée découverte** | Séance normale, nouveaux mots + rebrassages dus. Type `"normale"`. |
| **Journée révision** | Séance dédiée aux rebrassages longs (J+7/30/90), sans nouveaux ni J+1. Type `"revision"`. |

### 7.2 Règle fondamentale du quota quotidien

Pour chaque journée de découverte (lundi, mardi, jeudi, vendredi par défaut) :

#### Bloc "lourd" — quota STRICT de N items (N = 10 par défaut)

Ces N items, ordonnés par priorité :

1. **Chutes de la veille** : reprises avec un set complet d'exercices (6-8 exos). Elles entrent dans le quota.
2. **Nouveaux mots** : tirés du corpus par l'OrdonnanceurService, set complet de 6-8 exos. Complètent le quota jusqu'à N.

> **Conséquence centrale** : si l'enfant chute X mots un jour, il aura X chutes + (N - X) nouveaux mots le lendemain. Une mauvaise journée ne plombe pas la suivante mais ralentit l'introduction de nouveauté.

#### Bloc "léger" — rebrassages J+1, **HORS quota**

3. **Rebrassages J+1** : tous les mots **réussis** la veille reviennent avec 2-3 exos rapides chacun. Ces rebrassages s'ajoutent par-dessus le quota des N (ils ne le grignotent pas).

> **Conséquence** : la durée de séance varie. Une journée bien réussie la veille produit une séance plus longue le lendemain (plus de J+1), mais composée majoritairement de mots déjà connus → fluide à exécuter. Choix assumé.

### 7.3 Paramétrisation

| Paramètre | Valeur par défaut | Notes |
|---|---|---|
| `max_new_words_per_day` (N) | **10** | À calibrer empiriquement. Paramétrable par profil. |
| `nb_exos_introduction` | 6 à 8 | Existant côté app. |
| `nb_exos_chute` | identique à introduction | |
| `nb_exos_J1` | 2 à 3 | (zone d'hésitation, §7.7) |

### 7.4 Cycle de vie d'un mot

```
[Introduction J+0]
  ├─ Tous exos ratés ────────► Mot NON introduit, représenté "nouveau" demain (re-J+0)
  ├─ Chute partielle ────────► Mot en CHUTE, revient demain en set complet (quota)
  └─ Réussi ─────────────────► Programmation du J+1 calendaire

[Rebrassage J+1 — 2-3 exos]
  ├─ Chute ──────────────────► RESET COMPLET : retour à J+0 le lendemain
  └─ Réussi ─────────────────► Programmation du J+7 calendaire

[Rebrassage J+7 / J+30 / J+90]
  ├─ Chute ──────────────────► RESET COMPLET du cycle
  └─ Réussi ─────────────────► Programmation du palier suivant

[Après J+90 réussi] ──────────► Mot ACQUIS, sort du cycle.
```

**Cas particulier — introduction complètement ratée** : si tous les exos du J+0 sont ratés, le mot est "non introduit". Il revient comme nouveau le lendemain, occupant un slot du quota.

**Cas particulier — chutes répétées indéfiniment** : pas de mise en pause auto. Un mot qui chute chaque jour revient chaque jour. Gauthier intervient manuellement si nécessaire.

**Justification du reset complet** : un mot raté en rebrassage signale que la consolidation n'a pas pris. Le bon réflexe pédagogique est de **recommencer l'ancrage à zéro**, pas de bricoler.

**Sémantique précise du reset complet (implémentation RebrassageService)** : un reset écrase la `dateIntroduction` avec la date du jour de la chute. Le mot recommence sa vie comme s'il était nouveau, mais son historique de tentatives est préservé (utile pour les stats parents). Conséquence : si Max chute en j30 sur un mot introduit il y a 30 jours, après reset le mot affiche `dateIntroduction = aujourd'hui` et reviendra demain en j0.

**Sémantique précise des délais entre paliers** : les écarts (j0→j1 = +1j, j1→j7 = +6j, j7→j30 = +23j, j30→j90 = +60j) sont calculés **par rapport à la date du dernier rebrassage effectué**, pas par rapport à `dateIntroduction`. Conséquence pratique : si Max ouvre l'app en retard (j7 dû lundi, fait jeudi), le palier j30 est programmé 23 jours après le jeudi, pas 30 jours après l'introduction stricte. Le rythme suit le rythme réel de l'enfant et ne se "désynchronise" pas en cas d'absence. Cette sémantique est volontaire : les paliers sont des ordres de grandeur biologiques (consolidation par le sommeil), pas des dates précises sacrées.

**Nuance pour les paliers longs (j7, j30, j90)** : après ce calcul de base, la date obtenue est **alignée sur le mercredi le plus proche** (cf. §7.5 « Convergence des paliers longs sur le mercredi »). L'écart réel entre deux paliers peut donc varier de quelques jours par rapport au calcul théorique. Cette tolérance est compatible avec la nature même des paliers (ordres de grandeur biologiques) et permet à toutes les révisions longues de converger sur la journée révision hebdomadaire. Les paliers courts (j0→j1) ne subissent pas cet alignement.

### 7.5 Rythme hebdomadaire et journée révision

#### Logique calendaire — court terme vs long terme

Le système distingue deux régimes pour les rebrassages :

**Court terme (chutes j0 et rebrassages j1)** : géré en *jours de connexion*. Un mot chuté ou en attente de J+1 reste dû jusqu'à ce que l'enfant se connecte et le traite. Pas de pénalité d'absence : si l'enfant ne se connecte pas pendant trois jours, ses deux chutes du vendredi sont toujours là au retour, simplement complétées par 8 nouveaux pour faire un quota de 10. La date stockée dans `dateProchainRebrassage` est calendaire (le lendemain), mais le mécanisme de lecture (`getWordsDueOn(date ≤ aujourd'hui)`) traite naturellement les retards.

**Long terme (rebrassages j7, j30, j90)** : géré en *calendaire réel*. Les neurosciences de la consolidation par le sommeil s'appuient sur des durées biologiques réelles, pas sur la fréquence d'usage applicatif. Un j7 doit être 7 nuits de sommeil après le j1, peu importe combien de séances l'enfant a faites entre temps.

#### Le mercredi — jour préférentiel de révision longue, mais pas exclusif

**Modèle (depuis 20 mai 2026)** : il n'y a que deux types de séance, et c'est la **présence ou non d'un palier long (j7/j30/j90) dû** qui décide, pas le jour de la semaine :

- S'il y a au moins un palier long dû à `dateISO ≤ aujourd'hui` → **journée révision** : on prend tous les longs dûs, rien d'autre. Type `"revision"`.
- Sinon → **journée normale** : chutes + nouveaux + J+1 dûs. Type `"normale"`.

Le mercredi n'est plus traité comme un jour spécial par le composer. Cela dit, **les paliers longs sont alignés sur le mercredi à l'écriture** (cf. ci-dessous), donc en pratique les journées révision tomberont presque toujours un mercredi.

**Pourquoi cette simplification** : avec le modèle précédent à 3 types (`"normale"`, `"revision_longue"`, `"rien"`), un mercredi sans aucun palier long dû produisait une séance vide ("rien à faire aujourd'hui"). C'était cohérent avec un cadre "présentiel grammaire chaque mercredi", mais peu adapté à l'usage maison où l'enfant peut très bien vouloir faire son anglais ce jour-là. Désormais : si le cycle a quelque chose à proposer, on le propose ; sinon, l'enfant ne se connecte pas, c'est tout.

Conséquence sur le nombre de leçons hebdomadaires : au lieu de 6 leçons + 1 révision (modèle ancien), une semaine sans révision longue donnera 7 leçons (cas 5 ci-dessous).

#### Cinq scénarios de semaine type

Pour illustrer le comportement réel :

| Cas | Lu | Ma | Me | Je | Ve | Sa | Di |
|---|---|---|---|---|---|---|---|
| 1. Semaine normale (connexion tous les jours) | Leçon 1 | Leçon 2 | **Révision** | Leçon 3 | Leçon 4 | Leçon 5 | Leçon 6 |
| 2. Absence jours normaux | Leçon 1 | Leçon 2 | **Révision** | Leçon 3 | × | × | Leçon 4 |
| 3. Absence mercredi | Leçon 1 | Leçon 2 | × | **Révision** | Leçon 3 | Leçon 4 | Leçon 5 |
| 4. Absences multiples dont mercredi | Leçon 1 | × | × | × | **Révision** | Leçon 2 | Leçon 3 |
| 5. Rien à réviser le mercredi | Leçon 1 | Leçon 2 | Leçon 3 | Leçon 4 | Leçon 5 | Leçon 6 | Leçon 7 |

**Points-clés :**
- Le cas 3 montre le mécanisme de rattrapage : un mercredi raté ne fait pas perdre la révision, elle se reporte simplement à la prochaine connexion.
- Le cas 5 est nouveau : sans révision longue, le mercredi devient une leçon ordinaire.
- Les leçons s'enchaînent dans l'ordre de découverte, sans tenir compte du calendrier. Si l'enfant rate des jours, il ne "saute" pas les leçons correspondantes.
- **Une seule activité par jour** : après une révision, c'est terminé pour la journée (la leçon ordinaire suivante attendra le lendemain).

#### Convergence des paliers longs sur le mercredi

Pour que les j7/30/90 tombent effectivement un mercredi (et non n'importe quel jour de la semaine), **le calcul de la date du prochain palier est aligné** à l'écriture :

1. Calcul naturel : `dateDernierRebrassage + écart_du_palier` (j1→j7 = +6j, j7→j30 = +23j, j30→j90 = +60j)
2. Si la date obtenue est déjà un mercredi → on garde
3. Sinon → on **aligne sur le mercredi le plus proche** (avant ou après, distance minimale)
4. En cas d'égalité parfaite (distance identique au mercredi précédent et au suivant) → on choisit le **mercredi suivant** (pas de palier raccourci sans raison)

Conséquence : toute date `dateProchainRebrassage` d'un mot en étape ∈ {j7, j30, j90} est, **par construction**, un mercredi. C'est un **invariant du système**.

**Impact pédagogique du raccourcissement éventuel** : l'écart effectif entre paliers peut varier légèrement (un j7 peut être j+5 à j+9 réels). Acceptable : les durées de consolidation sont des ordres de grandeur biologiques, pas des dates précises sacrées.

#### Court terme — pas d'alignement spécial

Les paliers courts (chute → demain, j0 → j1) sont stockés au **lendemain calendaire**, sans alignement particulier. Si un j1 tombe mécaniquement un mercredi par hasard, il est traité normalement dans la journée si c'est une journée normale (intégré aux exos). S'il y a une révision dûe ce mercredi-là, le j1 attend simplement le lendemain (priorité à la révision).

#### Si l'enfant manque le mercredi

Si l'enfant ne se connecte pas un mercredi, **la révision se reporte automatiquement à la prochaine connexion**. Le jour de rattrapage (jeudi, vendredi, samedi…) devient **100 % révision** :

- Pas de nouveaux mots ce jour-là
- Pas de chutes du quota normal
- Pas de J+1 légers
- Uniquement les j7/30/90 qui étaient dûs

Les chutes/J+1 anciens (s'il y en a) attendent **encore** une connexion supplémentaire avant d'être traités.

**Détection** : un jour est en "mode révision" dès lors qu'il y a au moins un mot en étape {j7, j30, j90} dont `dateProchainRebrassage ≤ aujourd'hui`. Comme ces dates sont *par construction* des mercredis (cf. invariant ci-dessus), cette détection est fiable et la révision tombera presque toujours soit un mercredi, soit en rattrapage juste après.

> **Note de contexte d'usage** : l'auteur de l'application accompagne ses enfants chaque mercredi en présentiel. Le scénario "mercredi raté" est donc une mécanique de robustesse, pas un cas d'usage régulier. La même propriété ne tient pas dans une diffusion publique de l'app, où il faudra reconsidérer les seuils et les caps.

#### Sort d'une chute en révision

Si un mot est chuté pendant une séance révision (peu importe son palier j7, j30 ou j90), **il subit un reset complet du cycle** :

- `etape` retombe à `j0`
- `dateIntroduction` est écrasée à aujourd'hui (le mercredi de la chute)
- `dateProchainRebrassage` devient le lendemain (jeudi)
- L'historique est préservé

Concrètement, le lendemain il réapparaîtra comme une chute du quota normal (jeudi = jour normal, traitement classique). S'il est réussi le jeudi, il repartira proprement dans le cycle (j1 vendredi, puis j7 sur le mercredi le plus proche, etc.).

**Justification** : un mot dont la consolidation long terme n'a pas tenu signale un ancrage initial insuffisant. Le bon réflexe pédagogique est de recommencer l'ancrage à zéro plutôt que de bricoler.

#### Synthèse hebdomadaire

| Jour | Type de séance |
|---|---|
| N'importe quel jour | Si un palier long est dû → **journée révision**. Sinon → **journée normale**. |

En pratique, l'alignement mercredi des paliers longs fait que la révision tombera presque toujours un mercredi. Mais cette préférence est une conséquence du calcul, pas une règle imposée par le composer.

En cas d'absence un mercredi, la prochaine connexion bascule automatiquement en mode révision à sa place.

#### Composition d'une journée normale

Une journée normale combine **deux enveloppes** distinctes :

**Enveloppe lourde — N = 10 mots maximum, set complet d'exos (6-8 par mot)**

Par ordre de priorité :
1. **Chutes de la veille** : mots en étape j0 dûs aujourd'hui. Set complet d'exos.
2. **Nouveaux mots** : tirés par `OrdonnanceurService`, complètent l'enveloppe jusqu'à 10. Set complet d'exos.

**Enveloppe légère — jusqu'à 10 J+1 en sus, 2 exos par mot**

3. **Rebrassages J+1** : tous les mots en étape j1 dûs aujourd'hui. 2 exos rapides chacun.

> **Pourquoi pas de cap explicite sur les J+1** : le nombre de J+1 dûs un jour donné ne peut pas dépasser N par construction. Un J+1 ne peut exister que si un mot est passé en étape j1 lors d'une séance précédente, or chaque séance en passe au plus N (= la taille de l'enveloppe lourde). Le plafond de 10 J+1 est donc une **conséquence mécanique** du quota lourd, pas une règle à enforcer.

**Volume maximal d'une journée normale** : 10 lourds + 10 légers = **20 mots**, soit environ 60-80 + 20 = **80-100 exercices**.

#### Composition d'une journée révision

- Sélection : tous les mots en étape {j7, j30, j90} avec `dateProchainRebrassage ≤ aujourd'hui`
- Traitement : 2 exos par mot (nature à différencier par palier — voir §7.7, concerne ExerciseService, pas SessionComposer)
- **Pas de cap, pas de tri, pas de priorité** : on prend tout

**Charge cognitive** : une révision à 50 mots = 100 exercices, soit l'équivalent d'une journée normale plein régime. La charge perçue par l'enfant est même plus légère (aucun set complet de découverte, que du rafraîchissement). Le mercredi présentiel garantit en pratique que le volume reste raisonnable.

---

### 7.6 Retour après absence prolongée

Pour le **contexte d'usage actuel** (un parent qui accompagne ses enfants chaque mercredi en présentiel), le scénario d'absence prolongée n'arrive pas dans la pratique : le rythme hebdomadaire est garanti par la présence parentale.

Les mécanismes naturels du système couvrent tous les cas réalistes :

| Absence | Comportement |
|---|---|
| 1 jour normal manqué | Les chutes/J+1 dûs attendent la prochaine connexion. Aucun changement de séance. |
| 1 mercredi manqué | La prochaine connexion bascule en mode révision (cf. §7.5). |
| Quelques jours d'affilée | Cumul des deux effets ci-dessus, traités au retour, dans l'ordre : 1 séance révision d'abord, puis reprise normale. |

**Le cas "absence très longue" (semaines, mois) reste théoriquement possible** mais n'est pas un cas d'usage prévu. Si la révision de retour contient plusieurs dizaines de mots, c'est acceptable (cf. §7.5, charge cognitive). Au-delà de plusieurs centaines, le scénario sort du cadre d'utilisation actuelle.

> ⚠️ **À reconsidérer pour la version publique** : si l'app est diffusée hors du cercle familial, le contexte change. Il faudra alors trancher :
> - Un **cap** sur le nombre de paliers traités par séance révision (étalement multi-jours)
> - Une **politique de "purge"** au-delà d'un seuil (les paliers très en retard sont considérés comme perdus et le mot redémarre à j0)

---

### 7.7 Zones d'hésitation (à arbitrer à l'usage)

- **Nombre et nature des exercices par palier de rebrassage** : 2 exos par mot fixés. La **nature** peut varier (j1 rapide, j7 reconnaissance, j30 contexte, j90 production active). Le moteur doit être conçu pour permettre une **configuration par palier**. — *À trancher au moment de brancher `ExerciseService` sur le rebrassage. `RebrassageService` est volontairement agnostique sur ce point : il reçoit juste un booléen `success` calculé en amont.*
- **Valeur définitive de N** : 10 par défaut, peut monter à 15 si calibration le montre.
- **Politique pour absence très longue** : cf. §7.6, à reconsidérer pour version publique.

**Points tranchés** (sortis de cette liste) :
- ~~Critère exact de validation d'un rebrassage~~ → **zéro tolérance à l'erreur** (sauf tolérance fautes de frappe déjà gérée par `compareAnswers`). Cohérent avec la règle de chute existante.
- ~~Statut du week-end~~ → **samedi et dimanche = jours app normaux** (cf. §7.5).
- ~~Statut du mercredi~~ → **jour préférentiel de révision longue (par alignement des paliers), mais jour normal si rien à réviser** (cf. §7.5, décision 20 mai 2026).
- ~~Logique de décalage des j7/30/90~~ → **alignement sur le mercredi le plus proche** à l'écriture (cf. §7.5).
- ~~Position des J+1 dans le quota~~ → **enveloppe légère séparée, max 10 J+1, 2 exos par mot, en sus de l'enveloppe lourde** (cf. §7.5).
- ~~Cap éventuel du quota en mode révision~~ → **pas de cap dans la version actuelle**, le rythme mercredi présentiel rend le cas pathologique hors champ (cf. §7.6).
- ~~Nombre d'exos par J+1~~ → **2 fixés** (cf. §7.5).

---

### 7.8 Pseudo-code de composition d'une séance

Implémenté dans `services/SessionComposerService.js`. Algorithme :

```js
function composerSeance(childId, dateISO) {
    // 1. Y a-t-il au moins un mot j7/j30/j90 dû ?
    //    (la date d'un palier long étant TOUJOURS un mercredi par
    //    construction, cette détection joue aussi le rôle de
    //    "rattrapage" si l'enfant a manqué un mercredi)
    if (rebrassage.hasDetteConsolidation(childId, dateISO)) {
        // → Type "revision" : tous les longs dûs, rien d'autre.
        //   Pas de chutes, pas de J+1, pas de nouveaux. coldLesson vide.
        return {
            type: "revision",
            longs: tousLesMotsAvecEtapeLongueEtDateLeq(childId, dateISO),
            // chutes, j1, nouveaux, coldLesson → vides
        };
    }

    // 2. Jour normal (n'importe quel jour de semaine).
    //    Enveloppe lourde = chutes + nouveaux pour compléter jusqu'à QUOTA_LOURD.
    //    Enveloppe légère = tous les J+1 dûs.
    const dus = rebrassage.getMotsDus(childId, dateISO);
    const chutes = dus.lourds.filter(id => entryOf(id).etape === "j0");
    const slotsRestants = max(0, QUOTA_LOURD - chutes.length);
    const nouveaux = ordonnanceur.tirerNouveaux(childId, slotsRestants, dateISO);

    return {
        type: "normale",
        coldLesson: [...chutes, ...nouveaux],  // dans cet ordre
        chutes,
        j1: dus.j1,
        nouveaux,
        // longs → vide
    };
}
```

**Note** : ce service produit des **ids de mots** (`number[]`), pas des objets Word complets. La résolution id → Word et la sélection des exercices à présenter sont la responsabilité des couches en aval (Router et `ExerciseService`).

### 7.9 Synthèse en 5 règles

1. **Quota quotidien strict de 10 items lourds** = chutes de la veille (prioritaires) + nouveaux mots, set complet d'exos chacun.
2. **Rebrassages J+1 systématiques en sus**, 2-3 exos rapides par mot réussi la veille, hors quota.
3. **Deux types de séance** : `"revision"` si au moins un mot j7/j30/j90 est dû ; `"normale"` sinon. Le jour de la semaine ne change rien.
4. **Rebrassages J+7/30/90 alignés sur le mercredi le plus proche** à l'écriture (invariant : leur date stockée est toujours un mercredi). En pratique, les révisions tomberont donc presque toujours un mercredi. Si l'enfant manque un mercredi, les longs restent dûs et la prochaine connexion bascule automatiquement en révision.
5. **Toute chute en rebrassage = reset complet** du cycle (étape → j0, dateIntroduction → aujourd'hui).

### 7.10 API des services implémentés

Quatre services matérialisent ce moteur, tous couverts par tests (harness Node). Récapitulatif de leur surface publique.

#### `services/UserStateService.js` — persistance pure

```js
// Flags du jour
userState.markLessonViewed(childId)
userState.isLessonViewed(childId) → boolean
userState.resetForNewDay(childId)
userState.clear()

// Dernier enfant utilisé
userState.setLastChildId(childId)
userState.getLastChildId() → string|null
userState.clearLastChildId()

// Progression par mot (lecture)
userState.getWordProgress(childId, wordId) → entry | null
userState.getAllProgress(childId) → Map<wordId(Number), entry>   // copies
userState.getWordsByEtape(childId, etape) → number[]
userState.getWordsDueOn(childId, dateISO) → number[]

// Progression par mot (écriture)
userState.setWordProgress(childId, wordId, entry)
userState.recordWordOutcome(childId, wordId, {date, statut, resultat})
userState.removeWordProgress(childId, wordId)
userState.clearProgress(childId)
```

**Caractère** : pure persistance. Valide la structure des entrées (étapes ∈ `{j0,j1,j7,j30,j90,acquis}`, dates ISO `YYYY-MM-DD`), refuse silencieusement les inputs invalides, tolère les données corrompues à la lecture. **Ne décide d'aucune transition.** Toutes les lectures renvoient des copies (pas de fuite de référence interne).

#### `services/RebrassageService.js` — logique du cycle

```js
// Évolution du cycle sur outcome
rebrassage.introduireMot(childId, wordId, dateISO, success)
rebrassage.enregistrerRebrassage(childId, wordId, dateISO, success)

// Lectures pour le composer
rebrassage.getMotsDus(childId, dateISO) → {j1: number[], lourds: number[]}
rebrassage.hasDetteConsolidation(childId, dateISO) → boolean

// Utilitaires purs (exposés pour tests / debug)
rebrassage.calculerDateProchainPalier(etape, dateISO) → string|null
rebrassage.alignerSurJourPivot(dateISO) → string
```

**Caractère** : logique pure du cycle. Calcule les transitions et les dates de palier, **aligne les paliers longs (j7/j30/j90) sur le mercredi le plus proche à l'écriture** (cf. §7.5, invariant mercredi). Les paliers courts (j0→j1, lendemain après chute) sont stockés en lendemain calendaire brut, sans alignement. Le service **ne juge pas du succès** (l'appelant calcule le booléen `success` selon la règle "zéro tolérance"). Sépare proprement les rebrassages j1 (légers, hors quota) des paliers lourds dans `getMotsDus`.

**Filet de sécurité** : à chaque écriture d'un mot en palier long, un helper interne vérifie que la date stockée est bien un mercredi et émet un `console.warn` dans le cas contraire. C'est une garde-fou en cas de modification future qui oublierait l'alignement.

**Cas particuliers gérés en silence** :
- `enregistrerRebrassage` sur un mot acquis → no-op
- `enregistrerRebrassage` sur un mot inconnu → no-op + warn console
- date invalide → no-op
- chute en rebrassage à n'importe quel palier → reset complet (`dateIntroduction` écrasée à aujourd'hui, `etape` retour à j0, historique préservé)

#### `services/OrdonnanceurService.js` — choix des nouveaux mots

```js
new OrdonnanceurService({ wordRepository, userState })

ordonnanceur.tirerNouveaux(childId, slots, dateISO?) → number[]
ordonnanceur.getPhaseActuelle(childId)
  → "boot" | "post_boot_VTV" | "post_boot_TTT" | "themes_purs"
```

**Caractère** : décide *quels* nouveaux mots introduire (ids purs) en fonction de la phase courante (boot, post-boot V-T-V, post-boot T-T-T, thèmes purs — cf. §8.2). N'introduit pas les mots lui-même, ne tient pas compte du quota (c'est l'appelant qui calcule `slots = N - nb_chutes`).

#### `services/SessionComposerService.js` — composition de la séance du jour

```js
new SessionComposerService({ userState, wordRepo, rebrassage, ordonnanceur })

composer.composerSeance(childId, dateISO) → SeanceComposee
```

Où `SeanceComposee` a un schéma stable (champs toujours présents, vides si non pertinents) :

```js
{
  type: "normale" | "revision",
  coldLesson: number[],   // chutes + nouveaux pour "normale", vide en "revision"
  chutes:     number[],   // ids étape j0 dûs ("normale")
  j1:         number[],   // ids étape j1 dûs ("normale")
  nouveaux:   number[],   // ids tirés par OrdonnanceurService ("normale")
  longs:      number[],   // ids étape j7/j30/j90 dûs ("revision")
}
```

**Caractère** : assemble la séance du jour sous forme d'**ids de mots** (décision D1 : pas d'objets Word complets, la résolution id→Word est faite par le Router/écrans). Deux branches mutuellement exclusives :

1. Au moins un mot j7/j30/j90 dû → `"revision"` (prend tous les longs dûs, rien d'autre).
2. Sinon → `"normale"` (chutes prioritaires, complétées par des nouveaux jusqu'à `QUOTA_LOURD = 10`, plus tous les J+1 dûs séparément).

Le composer ne traite plus le mercredi comme un jour spécial (changement du 20 mai 2026). L'alignement des paliers longs sur le mercredi (via `RebrassageService.alignerSurJourPivot`) fait que les révisions tomberont presque toujours un mercredi, mais c'est une **conséquence du calcul**, pas une règle imposée par le composer.

Le service ne gère ni la nature des exercices par mot (→ `ExerciseService`), ni la persistance des résultats (→ `SessionRecorderService`, à venir, miroir de ce service), ni le filtrage des mots déjà acquis aujourd'hui (→ Router, après l'appel).

#### Hors scope (à venir)

- **`ExerciseService`** : génération de la file d'exercices pour un mot donné, configurable par palier (j0 set complet, j7 reconnaissance, j30 contexte, j90 production active). Pas encore branché sur le rebrassage. Le critère "zéro tolérance à l'erreur" pour calculer le `success` à transmettre au `RebrassageService` sera implémenté ici (ou dans l'écran).
- **`SessionRecorderService`** : miroir d'écriture du `SessionComposerService`. Reçoit les résultats d'une séance (mots réussis, chutés, exos faits) et appelle les bonnes méthodes de `RebrassageService` pour faire avancer le cycle. Permet de garder `SessionComposerService` pur en lecture.

---

## 8. Ordonnancement des introductions

> Cette section spécifie **quels mots** sont présentés comme nouveaux, jour après jour. Le rebrassage (§7) décide combien et quand revoir ; l'ordonnancement décide quels nouveaux mots tirer.

### 8.1 Vue d'ensemble

Les nouveaux mots sont alimentés par **deux files** :

- **File Fréquence** : mots structurants (verbes essentiels, mots-outils, expressions de base), à voir tôt indépendamment de tout thème.
- **File Thèmes** : mots organisés par champs sémantiques (Famille, Corps, Vêtements, etc.).

Le ratio de tirage varie selon **4 phases successives**.

### 8.2 Les 4 phases d'introduction

#### Phase 1 — Boot grammatical (jours 1 à 3)

**Objectif** : doter l'enfant, en 3 jours, du socle phrastique minimal pour produire des phrases dès la fin du jour 3.

- **Composition quotidienne** : 10 mots/jour, **100% file Fréquence** (sous-ensemble `phase=boot`).
- **Aucun mot thématique**.
- **30 mots au total** sur 3 jours.

Contenu du boot (verrouillé, ordre de présentation suggéré) :

| Jour | Mots |
|---|---|
| 1 | to be, to have, to do, and, what, who, no, yes, Hello, Hi |
| 2 | to go, to come, to get, to make, to take, to give, to see, to know, to think, to say |
| 3 | to want, to use, or, but, because, if, Thank you, Please, Sorry, to like |

> La répartition exacte sur les 3 jours n'est pas critique. Le boot est terminé quand les 30 mots ont été introduits.

#### Phase 2 — Post-boot V-T-V (jours 4 → épuisement des verbes Fréquence)

**Objectif** : ancrer les thèmes en parallèle d'une dose quotidienne de Fréquence.

- **Composition quotidienne** : 10 mots = **7 Thèmes** + **3 Fréquence**.
- **Pattern des 3 Fréquence** : **V - T - V** (verbe, truc, verbe).
  - V tiré de la pile `categorie_ordo=V`, sous-ensemble `phase=post_boot`, dans l'ordre `ordre_dans_phase`
  - T tiré de la pile `categorie_ordo=T`, sous-ensemble `phase=post_boot`, dans l'ordre `ordre_dans_phase`
- **Pattern des 7 Thèmes** : pioche séquentielle selon `ordre_theme` puis `ordre_dans_theme`.

**Durée estimée** : ~31 jours (62 verbes + 31 trucs).

> **Note pédagogique** : l'ordre de présentation à l'écran (V puis T puis V, ou entremêlé) est un choix d'UX, pas d'algo. Le contrat ici est que les 3 Fréquence du jour soient dans le pattern V-T-V.

#### Phase 3 — Post-boot T-T-T (épuisement des verbes → fin Fréquence)

- **Composition identique** : 7 Thèmes + 3 Fréquence.
- **Pattern des 3 Fréquence** : **T - T - T**.

**Durée estimée** : ~43 jours (~129 trucs restants).

#### Phase 4 — Thèmes purs (après épuisement total Fréquence)

- **Composition quotidienne** : 10 mots, 100% file Thèmes.
- Pioche séquentielle selon `ordre_theme` puis `ordre_dans_theme`.

**Durée disponible** : jusqu'à la fin de la période (4 mois cibles ou plus).

### 8.3 Parcours de la file Thèmes

#### Ordre des thèmes (logique concentrique → expansif)

1. Famille & relations
2. Corps & santé
3. Vêtements & apparence
4. Caractère & personnalité
5. Émotions & sentiments
6. École & études
7. Loisirs jeux & hobbies
8. Cuisine - aliments & boissons
9. Cuisine - verbes & expressions
10. Maison - pièces & meubles
11. Maison - objets quotidiens
12. Hygiène & soins
13. Animaux
14. Couleurs formes tailles
15. Temps dates calendrier
16. Météo & climat
17. Ville & lieux
18. Transports
19. Achats & argent
20. Voyages & vacances
21. Nature & paysages
22. Sports
23. Quantités mesures
24. Métiers & travail
25. Médias & technologie
26. Pays & nationalités

> **Justification** : on commence par l'enfant lui-même (Famille, Corps, Vêtements, Caractère, Émotions), puis son quotidien immédiat (École, Loisirs, Cuisine, Maison), puis le monde naturel proche, puis l'élargissement géographique, et enfin les thèmes abstraits/spécialisés.
>
> **Implication** : on n'épuisera vraisemblablement pas les 1117 mots thèmes en 4 mois. Les thèmes en fin de liste seront probablement sacrifiés. Cet ordre est donc aussi un ordre de priorité.

#### Pioche au sein d'un thème

Dans l'ordre `ordre_dans_theme`, qui respecte les regroupements par `sous_theme`. Apprendre `grandmother`, `grandfather`, `grandparents` ensemble est plus efficace qu'en ordre aléatoire.

#### Transition d'un thème au suivant

Passage **immédiat** au thème suivant, pas de transition spéciale.

**Exception possible** : si un thème compte moins de 7 mots restants un jour donné, deux options :
- (a) Déborder sur le thème suivant pour atteindre les 7 — **option par défaut**, simple
- (b) Faire une journée à 6 thèmes + 1 amorce du suivant

### 8.4 Métadonnées dans le corpus

#### Le champ pivot `ordo_file`

Chaque mot porte un champ `ordo_file` qui décide à quelle file il appartient :

| Valeur | Sens | Champs ordonnancement remplis |
|---|---|---|
| `"freq"` | mot Fréquence | `phase` + `bracket` + `categorie_ordo` + `ordre_dans_phase` |
| `"themes"` | mot Thème | `ordre_theme` + `ordre_dans_theme` |

La séparation est étanche : un même mot n'appartient jamais aux deux files.

#### Champs ordonnancement pour les mots Fréquence

| Champ | Valeurs | Usage |
|---|---|---|
| `phase` | `boot` / `post_boot` | Sélection phase 1 vs 2-3 |
| `bracket` | entier 1 à 5 | **Niveau de fréquence/utilité**. Plus le bracket est petit, plus le mot est fondamental. Cf. ci-dessous. |
| `categorie_ordo` | `V` (verbe) / `T` (truc) | Alternance V-T-V en phase 2 |
| `ordre_dans_phase` | entier | Position de tri **à l'intérieur d'un couple (bracket, categorie_ordo)** |
| `groupe_semantique` | texte ou vide | Regroupement à préserver (ex: "politesse") |

**Rôle du `bracket`** : c'est un gradient de fréquence d'usage. Les `bracket=1-2` couvrent les mots les plus essentiels (le boot et le tout début du post-boot) ; les `bracket=5` couvrent les mots plus rares ou plus avancés. Le bracket permet de garantir que l'enfant rencontre `to wait` (bracket 3) bien avant `to look forward to` (bracket 5), même si le pattern de tirage V-T-V brasse les deux catégories.

**Tri logique d'une sous-file** : pour tirer le prochain V (resp. T) en post-boot, on trie l'ensemble des mots `ordo_file=freq AND phase=post_boot AND categorie_ordo=V` (resp. T) par `(bracket croissant, ordre_dans_phase croissant, id croissant)`. Le `id croissant` est un tri secondaire défensif au cas où deux mots auraient le même `(bracket, ordre_dans_phase)` après un ajout manuel post-build.

**V et T progressent indépendamment** : à un instant donné, la sous-file V peut être en bracket 4 pendant que la sous-file T est encore en bracket 3 (ou inversement). Aucune synchronisation entre les deux. Conséquence pratique : c'est l'épuisement de **chaque** sous-file qui pilote les transitions de phase (phase 2 → 3 quand V est épuisée, phase 3 → 4 quand T l'est aussi).

#### Champs ordonnancement pour les mots Thèmes

| Champ | Valeurs | Usage |
|---|---|---|
| `ordre_theme` | entier (1 à 26) | Ordre des thèmes |
| `ordre_dans_theme` | entier | Ordre du mot au sein de son thème |

**Tri logique** : `(ordre_theme croissant, ordre_dans_theme croissant, id croissant)`. Le tri par `id` est défensif (cf. ci-dessus).

**Tolérance aux trous et aux doublons** : la numérotation `ordre_dans_theme` peut avoir des trous (mots supprimés du CSV après numérotation) ou des doublons mineurs (ajouts manuels post-build). L'ordonnanceur traverse la liste triée sans s'en soucier.

#### Extensibilité (ajout d'un mot en cours de route)

- Si le mot est ajouté avec un ordre déjà dépassé (ex : `ordre_dans_phase=15` alors qu'on est au 20e tirage), il sera tiré au prochain tirage suivant.
- Les ajouts manuels post-build peuvent utiliser des `id` réservés en plage haute (≥ 2000 dans le corpus actuel) pour ne pas casser l'auto-incrément du build.

### 8.5 Pseudo-code d'ordonnancement

```python
def composer_mots_nouveaux_du_jour(utilisateur, jour_phase, slots_nouveaux):
    """
    jour_phase : compteur incrémenté uniquement les jours où des mots
                 nouveaux ont été introduits (≠ date calendaire).
    slots_nouveaux : N - nb_chutes_de_la_veille.
    """
    # Détermination de la phase
    if jour_phase <= 3:
        phase = "boot"
    elif verbes_post_boot_disponibles(utilisateur):
        phase = "post_boot_VTV"
    elif trucs_post_boot_disponibles(utilisateur):
        phase = "post_boot_TTT"
    else:
        phase = "themes_purs"

    # PHASE BOOT : 100% Fréquence-boot
    # Tri : (bracket, ordre_dans_phase, id) — bracket et ordre_dans_phase
    # définissent l'ordre exact des 30 mots du boot.
    if phase == "boot":
        return tirer_freq(utilisateur, n=slots_nouveaux, phase_filter="boot")

    # POST-BOOT : 7 Thèmes + 3 Fréquence
    if phase in ("post_boot_VTV", "post_boot_TTT"):
        if slots_nouveaux == 10:
            nb_themes, nb_freq = 7, 3
        else:
            nb_freq = round(slots_nouveaux * 0.3)
            nb_themes = slots_nouveaux - nb_freq

        mots_themes = tirer_themes(utilisateur, n=nb_themes)

        # Pour les V et T : sous-file triée par (bracket, ordre_dans_phase, id).
        # V et T progressent indépendamment — on tire le prochain disponible
        # de la sous-file demandée, peu importe le bracket courant de l'autre.
        if phase == "post_boot_VTV":
            patterns = {3: ["V","T","V"], 2: ["V","T"], 1: ["V"]}
            pattern = patterns.get(nb_freq, [])
            mots_freq = [tirer_freq(utilisateur, n=1, cat=c)[0] for c in pattern]
            # Si la sous-file V est épuisée en cours de pattern : on retombe sur T.
        else:  # T-T-T
            mots_freq = tirer_freq(utilisateur, n=nb_freq, cat="T")

        return mots_themes + mots_freq

    # PHASE THÈMES PURS
    # Tri : (ordre_theme, ordre_dans_theme, id).
    if phase == "themes_purs":
        return tirer_themes(utilisateur, n=slots_nouveaux)
```

> **Important** : `jour_phase` ≠ `date_calendaire`. `jour_phase` est un compteur incrémenté uniquement les jours où l'enfant introduit de nouveaux mots (pas les jours de consolidation pure, pas les mercredis, pas les absences). `date_calendaire` sert au calcul des paliers J+7/30/90.

### 8.6 Interactions avec le moteur de rebrassage

| Rebrassage (§7) | Ordonnancement (§8) |
|---|---|
| Combien d'items dans la séance ? | Quels mots nouveaux exactement ? |
| Quel rythme de revisite ? | Quel ordre d'introduction ? |
| Quelle priorité chutes vs nouveaux ? | Quel ratio Fréquence vs Thèmes ? |

**Interface entre les deux** : le moteur de rebrassage demande `N - nb_chutes` mots nouveaux à l'ordonnanceur. L'ordonnanceur les fournit selon la logique ci-dessus. Le rebrassage agrège chutes + nouveaux + J+1 pour former la séance.

### 8.7 Zones d'hésitation

- **Ordre exact des thèmes** (§8.3) : discutable. Faut-il remonter `Animaux` plus tôt (concret, motivant) ? `Émotions` est-il trop abstrait en 5e ? À ajuster aux retours des ados.
- **Comportement en fin de pile V** (transition phase 2 → 3) : le jour où il ne reste qu'un seul verbe, pattern V-T-T (option a, par défaut), ou V-T-V avec un T à la place du 2e V (option b), ou basculer en T-T-T dès aujourd'hui (option c). **Suggestion par défaut : (a)**.

### 8.8 Synthèse en 4 règles

1. **Phase 1 (J1-J3)** : 10 mots/jour, 100% Fréquence-boot, 30 mots verrouillés.
2. **Phase 2 (J4 → fin verbes)** : 7 Thèmes + 3 Fréquence/jour, pattern V-T-V.
3. **Phase 3 (fin verbes → fin Fréquence)** : 7 Thèmes + 3 Fréquence/jour, pattern T-T-T.
4. **Phase 4 (après Fréquence)** : 10 Thèmes/jour, jusqu'à épuisement ou fin de période.

---

## 9. Les modes d'exercice

Chaque mode est une classe qui hérite d'une base commune (`BaseEngine` / `TextInputMode` pour les modes à saisie) et implémente un contrat homogène.

| Mode | Type | UI | Validation |
|---|---|---|---|
| **ColdLessonMode** | Présentation (pas d'évaluation) | Carte recto/verso | Aucune |
| **McqMode** | Reconnaissance | Mot anglais + 4 boutons traduction | Clic = validation immédiate |
| **TypingFrMode** | Production écrite | Mot anglais + champ saisie FR | Entrée ou "Valider" |
| **AudioToTextMode** | Compréhension orale | Bouton play + champ saisie EN | Matching exact (tolérance minime) |
| **TextToAudioMode** | Production orale auto-évaluée | Mot + révèle prono + audio | 2 boutons "J'ai bien dit" / "Pas tout à fait" |
| **FormsVerbMode** | Production formes irrégulières | Verbe à conjuguer | Saisie des 3 formes |
| **FormsPluralMode** | Production pluriel irrégulier | Singulier → pluriel | Saisie pluriel |
| **TextInputMode** | (Classe abstraite partagée) | — | — |

**Activation** : tous les modes sont actifs dès le départ. Configurable malgré tout par utilisateur dans `preferences.exercise_modes_enabled` au cas où.

---

## 10. Configuration globale

```javascript
// config/app-config.js
export const CONFIG = {
  // Quota et rebrassage
  MAX_NEW_WORDS_PER_DAY: 10,     // QUOTA_LOURD du SessionComposerService
  NB_EXOS_INTRODUCTION: 6,       // 4-6 selon nature du mot
  NB_EXOS_J1: 2,                 // 2-3
  REBRASSAGE_PALIERS_DAYS: [1, 7, 30, 90],
  JOUR_PIVOT: 3,                 // mercredi (jour d'alignement des paliers longs ; 0=dim, 3=mer)
  // Pas de SEUIL_CONSOLIDATION : en révision, on prend tous les longs
  // dûs. Le mercredi présentiel garantit un volume raisonnable.

  // Tolérance de saisie
  TYPING_TOLERANCE: {
    ignore_case: true,
    ignore_accents: true,
    ignore_leading_articles: true,
    levenshtein_threshold: 1
  },

  // Audio
  AUDIO_BASE_PATH: 'data/audio/',
  TTS_LANG_PREFERRED: 'en-GB',
  TTS_LANG_FALLBACK: 'en-US',

  // UI (thèmes par enfant)
  THEMES: {
    max:   { primary: '#4169E1', accent: '#87CEEB' }
    // ... pour le frère à compléter
  }
};
```

---

## 11. Conventions de code

### Nommage

| Élément | Convention | Exemple |
|---|---|---|
| Classes | PascalCase | `RebrassageService`, `BaseEngine` |
| Méthodes | camelCase | `composeSeance()`, `recordAnswer()` |
| Méthodes "privées" | _camelCase préfixé | `_validateInput()` |
| Constantes | UPPER_SNAKE | `MAX_NEW_WORDS_PER_DAY` |
| Fichiers classes | PascalCase.js | `RebrassageService.js` |
| Fichiers utilitaires | camelCase.js | `helpers.js` |
| Variables CSS | --kebab-case | `--color-primary` |

### Modules ES6

Tout en modules ES6 :
```javascript
// services/RebrassageService.js
export class RebrassageService { ... }
```
```javascript
// utilisateur
import { RebrassageService } from './services/RebrassageService.js';
```

### Async/await partout, pas de `.then()` chaînés.

### Documentation JSDoc sur chaque méthode publique.

### Pas de variables globales (sauf `window.app` pour debug en dev).

---

## 12. Plan de développement

Approche en **étapes courtes**, chacune produisant quelque chose de fonctionnel et testable.

### ✅ Faites

- Squelette applicatif complet (Home → Leçon → Exercices → Résultat)
- 8 modes d'exercice fonctionnels
- Verrou "leçon vue d'abord"
- Persistance basique (localStorage) via UserStateService
- DeterminerService (a/the/my/this mother, accords FR)
- Corpus 1369 mots + corpus boot 30 mots
- WordRepository avec API par thème / par phase
- **`UserStateService` étendu** — stockage de progression par mot (étape, dates, historique), validation stricte, migration douce, tolérance aux données corrompues. Tests : harness Node + harness HTML, 31 tests.
- **`RebrassageService`** — cycle complet J+0/J+1/J+7/J+30/J+90, gestion des chutes (reset complet), **alignement des paliers longs sur le mercredi le plus proche** (cf. §7.5), séparation j1/lourds pour le composer, détection de dette de consolidation, filet de sécurité d'invariant mercredi. Tests : 47 tests.
- **`OrdonnanceurService`** — choix des nouveaux mots selon la phase boot / V-T-V / T-T-T / thèmes purs (cf. §8). Tests : 45 tests.
- **`SessionComposerService`** — assemble la séance du jour sous forme d'ids. 2 branches mutuellement exclusives : `"revision"` (au moins un palier long dû) ou `"normale"` (tous les autres cas). S'appuie sur UserState + Rebrassage + Ordonnanceur. Tests : 18 tests.
- **Câblage Router** (Pas 7, 20 mai 2026) — Le Router instancie le composer dans `main.js`, l'injecte au constructeur. `_composeLesson(childId)` délègue désormais au composer pour le mode `"normale"`. Helper `_dateISOAujourdhui()` en fuseau local (évite le décalage UTC du soir). Tests : 11 tests d'intégration.
- **Refonte du modèle de journée** (Pas 8, 20 mai 2026) — Suppression du type `"rien"`, renommage `"revision_longue"` → `"revision"`. Le mercredi n'est plus traité comme un jour spécial : si le cycle a quelque chose à proposer, on le propose. `HomeScreen` dispose maintenant de 2 menus selon `sessionType` (Démarrer+Exercices en normale, Réviser seul en révision). `RevisionPlaceholderScreen` provisoire en attendant l'`ExerciseService` spécial. Tests : 20 tests d'intégration supplémentaires.

### 🔴 Reste à faire (priorité actuelle)

1. **`SessionRecorderService`** (miroir d'écriture du composer) : prend les résultats d'une séance et appelle `RebrassageService.enregistrerRebrassage` / `introduireMot` pour faire avancer le cycle. Sans ce service, l'app peut afficher les bonnes séances mais les résultats ne sont pas enregistrés (les paliers ne progressent pas).
2. **`ExerciseService`** : générer la file d'exercices selon le palier (j0 set complet, j7+ réduit/différencié), calculer le booléen `success` à transmettre selon la règle zéro tolérance. Avec ce service, on remplace aussi le `RevisionPlaceholderScreen` par un vrai écran de révision (2 exos par mot, pas de ColdLesson).
3. **Brancher les J+1 dans le flux exercices** : actuellement le composer renvoie bien `seance.j1`, mais le Router ne le propage pas aux écrans (la spec dit "2 exos par mot intégrés aux exos normaux", non implémenté). À faire en même temps que l'ExerciseService.
4. **Cas extrême "corpus épuisé"** : actuellement géré par une `alert()` provisoire ("Bravo, tu as fait tout le travail disponible aujourd'hui ✓"). À remplacer par un écran ou message dédié si le corpus complet (1369 mots) est utilisé.

### À suivre

- PWA (manifest + service worker)
- Audio MP3 si TTS jugé insuffisant
- Dashboard parent (mode caché, code à 4 chiffres)
- Export/import de progression

---

## 13. Hébergement, PWA, sync, dashboard parent

### 13.1 Hébergement gratuit

| Critère | GitHub Pages | Netlify |
|---|---|---|
| Gratuit | Oui | Oui (100 GB/mois) |
| HTTPS auto | Oui | Oui |
| Service Worker / PWA | Oui | Oui |
| Functions serverless | Non | Oui (en gratuit) |
| Simplicité | Très simple | Simple, plus de features |

**Recommandation** : Netlify (drag & drop possible, fonction serverless future, logs gratuits). GitHub Pages reste un choix légitime.

**Décision à prendre au moment du déploiement, pas avant.**

### 13.2 Mises à jour du code

Automatiques via la PWA :
1. `git push` → Netlify déploie en 30s
2. Service worker détecte la nouvelle version au prochain lancement avec connexion
3. Téléchargement en arrière-plan
4. Au lancement suivant, l'enfant a la nouvelle version

Aucune action requise des utilisateurs.

### 13.3 Synchronisation : MVP sans cloud

Le MVP fonctionne entièrement en local (localStorage par tel). Les données d'un enfant sont sur son tel. Pas de partage automatique entre appareils.

### 13.4 Dashboard parent local

Sur chaque tel d'enfant, un mode parent caché et protégé donne accès à un dashboard détaillé.

**Activation** :
- Appui long (3s) sur le titre de l'écran d'accueil, OU
- Bouton "⚙️" discret en bas de l'accueil
- Demande un code parent (4 chiffres, configuré au premier lancement)

**Contenu** :
- Stats globales (mots vus / acquis / en cours)
- Streak (jours consécutifs)
- Courbe de progression
- Mots problématiques (chutes répétées)
- Historique récent
- Bouton "Exporter mes données"
- Bouton "Réinitialiser la progression" (double confirmation)

### 13.5 Évolution future : sync centralisée

Quand le besoin se fera sentir (multi-tel, intégration Monstrokid), passage à une sync centralisée (Firebase, Supabase, ou backend Monstrokid). L'architecture est conçue pour basculer **sans douleur** :

1. Isolation du stockage dans une seule couche (StorageManager interface)
2. Pas de logique métier dans le storage
3. Format des données indépendant du backend
4. Identifiants stables et globaux
5. Export JSON dès le MVP
6. Hooks `onDataChange` dans les services (EventBus.emit)

→ Avec ces règles respectées, passage au scénario sync = **une journée de dev max**.

---

## 14. Audio et stratégie hors-ligne

### 14.1 Stratégie audio en deux phases

**Phase 1 — MVP (gratuit)** : Web Speech API (TTS du navigateur)
- 0€, dispo partout, multi-voix, vitesse réglable
- Qualité variable selon navigateur (excellente sur iOS, moyenne sur Android, OK sur desktop)
- Préfère `en-GB`, fallback `en-US`

**Phase 2 (si besoin)** : MP3 pré-générés
- Si Web Speech jugé insuffisant après quelques semaines
- Services : ElevenLabs (~10$), Google Cloud TTS (~5$), Azure (~5$) pour ~1400 mots

L'AudioService expose une API unifiée :
```javascript
class AudioService {
  async play(word) {
    // Si MP3 local → joue le MP3
    // Sinon → fallback Web Speech API
    // Si offline et pas de MP3 → fallback Web Speech (marche offline aussi)
  }
}
```

→ Passage Phase 1 → Phase 2 sans toucher au reste du code.

### 14.2 Stratégie hors-ligne

L'app **fonctionne entièrement hors-ligne** sauf téléchargement initial des MP3 (si Phase 2 active) :

| Ressource | Cache |
|---|---|
| HTML / CSS / JS | Cache complet au premier chargement |
| Corpus JSON | Cache complet au premier chargement |
| MP3 audio | Téléchargés à la demande quand en ligne |
| Données utilisateur (localStorage) | Toujours locales |

Comportement quand offline + audio non téléchargé : fallback automatique Web Speech (qui marche offline).

---

## 15. Backup / export utilisateur

Bouton "Exporter mes données" dans le dashboard parent (et accessible depuis le menu enfant).

```json
{
  "format_version": "1.0",
  "exported_at": "2026-05-09T14:30:00Z",
  "user": { ... },
  "progress": [ ... ],
  "sessions": [ ... ]
}
```

Bouton "Importer mes données" symétrique pour restaurer sur un autre appareil.

Coût d'implémentation : ~30 min.

---

## 16. Compatibilité Monstrokid

L'app respecte plusieurs conventions de Monstrokid pour faciliter une intégration ultérieure :

| Convention Monstrokid | Implémentation Vocabulaire |
|---|---|
| `BaseEngineData` | `BaseEngine.js` (mêmes méthodes) |
| `AudioManager` (Python) | `AudioService.js` (même API) |
| `ButtonStateManager` | `ButtonStateManager.js` (même API) |
| `config.json` par module | `app-config.js` (même rôle) |
| Format JSON exercices v1.2 | Convention compatible |

Le jour où Vocabulaire est porté dans Monstrokid :
- Format de données déjà compatible
- Logique métier dans des services purs, transposable presque ligne à ligne
- Module dédié `MonstrokidExporter` à prévoir (~30-60 min de dev)

---

## 17. Décisions UX en réserve

> **Statut** : pensées posées le 10 mai 2026, non implémentées. À déterrer au moment des écrans concernés.

### 17.1 Cap quotidien souple : 10 mots, ajustable par l'enfant

Cap quotidien fixe à 10, mais l'enfant peut **ajouter manuellement des mots** s'il en veut plus (par exemple parce qu'il connaît déjà certains).

- **Mot par mot**, pas par paquets. Carburant ludique.
- Ajout pendant la leçon froide ET en y retournant après. Pas pendant les exos directement.
- Leçon froide accessible pendant toute la session (icône livre 📖 dans le header des exos ?)
- Plafond de sécurité : à définir (15, 20, 25 ?), configurable par parent.
- Confirmation visuelle indispensable.
- Bouton "retirer un ajout récent" : **question ouverte**.

### 17.2 Règle de respiration : 10 mots non maîtrisés → leçon de révision

Si à la fin d'une session il reste **10 mots non maîtrisés** (toujours dans la pile "fail" après essais multiples), la leçon du lendemain est une **leçon de révision** des mots ratés, pas une nouvelle leçon.

- Évite l'accumulation toxique d'échecs cumulés
- Rythme respiratoire : avancer / consolider / avancer / consolider
- Probablement la règle clé du système à long terme

**Nuance importante** : "non maîtrisé" ≠ "raté en cours de route". Un mot raté qui finit par être réussi après 2 essais, c'est de l'apprentissage normal — pas un échec.

### 17.3 Stats valorisantes différenciées (dashboard parent et enfant)

Différencier l'affichage selon le profil de l'enfant.

**Profil "veut briller"** (Julie : attachée aux notes, veut progresser visiblement) : valoriser le dépassement et la progression.
- "Cette semaine, X a ajouté 12 mots en plus de ses leçons."
- "X mots maîtrisés depuis le début."

**Profil "ne se croit pas capable"** (Max : pense l'anglais inaccessible) : valoriser la présence et l'accessibilité plutôt que la performance.
- Pas de stats publiques qui pourraient brusquer
- Surface plutôt des petits déclics : "tu sais déjà 47 mots"

### 17.4 Hook "univers de l'enfant" — mots issus du gaming

Tagger certains mots/phrases avec une référence à l'univers culturel de l'enfant.
- Pour Max : *"you got this!"*, *"let's go!"*, *"loot"*, *"craft"*, *"build"*, *"spawn"*
- Pour son frère : à définir avec lui

L'apprentissage devient un **code de déchiffrement** de l'univers existant de l'enfant.

Implémentation : champ optionnel `word.tags = ["gaming", "minecraft"]`. Au début d'une session : *"5 mots aujourd'hui viennent de Minecraft 🎮"*.

### 17.5 Multi-utilisateur : caps et plafonds différenciés

Les valeurs (cap, plafond, seuil de respiration) sont stockées **par utilisateur**, pas en config globale.

### 17.6 Questions ouvertes à trancher au moment des écrans concernés

- Bouton "retirer un ajout récent" : oui/non ? Si oui, undo simple ou interface riche ?
- Valeur exacte du plafond de sécurité (15, 20, 25 ?)
- Icône, position, comportement du retour à la leçon froide pendant les exercices
- "Mot maîtrisé" pour la règle de respiration : 1 succès suffit ? Plusieurs ? Sans erreur ?
- Stats du dashboard : qui voit quoi ?
