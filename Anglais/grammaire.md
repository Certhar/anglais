# Grammaire — chantiers et frontière avec Vocabulaire

> Document de référence stable. Décrit **ce qui ne relève pas du vocabulaire** et doit être traité par un dispositif grammatical à part (manuel, leçon de classe, ou futur module logiciel).
>
> Statut : posé le 17 mai 2026 lors de la refonte du corpus.
> À mettre à jour à chaque nouvelle décision impactant la frontière vocabulaire ↔ grammaire.

---

## 1. Principe directeur

Le projet Vocabulaire est un outil pour enseigner **le lexique** : des mots qui ont une vie autonome et qui peuvent être appris isolément avec une traduction stable.

Tout ce qui relève de **systèmes grammaticaux**, de **règles de construction**, ou de **mots dont l'emploi exige obligatoirement un contexte syntaxique**, n'a pas sa place dans Vocabulaire. Ces apprentissages doivent être traités par un autre dispositif : manuel, leçon en classe, ou éventuellement un module logiciel complémentaire (à concevoir).

**Critère opérationnel** : un mot va en grammaire dès qu'au moins un des deux critères suivants est rempli :
- (1) il n'a pas de traduction stable hors contexte (`for`, `at`, `must`, `not`...)
- (2) il appartient à un système qui se comprend mieux comme un tout que pièce par pièce (pronoms, possessifs, modaux, nombres, degrés de comparaison...)

Le principe d'inclusion en grammaire **n'implique pas systématiquement** une sortie du corpus Vocabulaire. Pour certains systèmes (degrés de comparaison, pluriels réguliers...), la règle est enseignée en grammaire mais les briques lexicales restent au corpus parce qu'elles ont une vie autonome utile (`good`, `better`, `best` restent enseignables seuls).

---

## 2. Chantiers grammaire identifiés

Sept chantiers sont à ce jour identifiés. Pour chacun :
- **Quoi enseigner** : la matière grammaticale à couvrir
- **Sortie du corpus** : entrées Vocabulaire concernées (qui partent en grammaire)
- **Statut** : décidé / en attente / en discussion

### 2.1 Système verbal : pronoms sujet + auxiliaires + temps

**Quoi enseigner** :
- les 7 pronoms personnels sujet
- la conjugaison de `to be` et `to have` (irrégulière, à mémoriser)
- la construction du présent simple (3ᵉ pers. sing. en `-s`)
- la construction du futur avec `will` (`I will go / I'll go / Will I go?`)
- la construction du conditionnel avec `would`
- le concept d'auxiliaire (do/does/did pour questions et négations)

**Sortie du corpus** : 7 entrées

| id | mot | trad |
|---|---|---|
| 1379 | I | je |
| 1380 | you | tu, vous |
| 1381 | he | il (personne) |
| 1382 | she | elle |
| 1383 | it | il, elle (chose) |
| 1384 | we | nous |
| 1385 | they | ils, elles |

**Restent au corpus** :
- `to be`, `to have`, `to do` (ids 1, 2, 3) — apprentissage lexical du sens, la grammaire couvre la conjugaison
- les 6 pronoms personnels **objet** (ids 1386-1391 : `me, you, him, her, us, them`) — traduction stable, vie autonome

**Statut** : ✅ Décidé.

---

### 2.2 Négation et interrogation

**Quoi enseigner** :
- la négation : `don't / doesn't / didn't / isn't / aren't / can't / not really / not yet`
- l'interrogation simple par inversion : `Is he? / Do you?`
- l'interrogation à mot question : `What/Who/Where/When/Why/How + auxiliaire + sujet + verbe`
- l'usage des collocations idiomatiques liées (`at home, on Monday, in summer, at 5 o'clock`...)

**Sortie du corpus** : 1 entrée

| id | mot | raison |
|---|---|---|
| 1253 | not | inenseignable seul, toujours dans `don't/isn't/can't/not really` |

**Restent au corpus** :
- les mots questions `why, how, when, where, what, who, which` (ids 1213-1220) — traduction stable, vie autonome
- `whose` (1219) reste également, son usage en grammaire ne le rend pas inenseignable seul

**Statut** : ✅ Décidé.

---

### 2.3 Système possessif (déterminants + pronoms)

**Quoi enseigner** :
- la table complète déterminants ↔ pronoms

| | Déterminant | Pronom |
|---|---|---|
| 1ʳᵉ sg | my | mine |
| 2ᵉ | your | yours |
| 3ᵉ masc | his | his |
| 3ᵉ fém | her | hers |
| 3ᵉ neutre | its | (pas de pronom) |
| 1ʳᵉ pl | our | ours |
| 3ᵉ pl | their | theirs |

- l'accord en français du déterminant (genre du nom français + voyelle initiale : `mon amie` malgré le féminin)
- les emplois des pronoms (`Whose is this? — Mine. / A friend of mine`)

**Sortie du corpus** : 12 entrées

| id | mot | trad |
|---|---|---|
| 1392 | my | mon, ma, mes |
| 1393 | your | ton, ta, tes, votre |
| 1394 | his | son, sa, ses (homme) |
| 1395 | her | son, sa, ses (femme) |
| 1396 | its | son, sa, ses (chose) |
| 1397 | our | notre, nos |
| 1398 | their | leur, leurs |
| 1399 | mine | le mien, la mienne |
| 1400 | yours | le tien, le vôtre |
| 1401 | hers | le sien (à elle) |
| 1402 | ours | le nôtre |
| 1403 | theirs | le leur |

**Note technique majeure** : les déterminants seront enseignés en pratique dans Vocabulaire **par exposition ambiante** via le `DeterminerService` (voir `architecture.md` et synthèses). L'enfant verra `my mother / your father / our house` à travers les exercices sur les noms, ce qui constitue un renforcement systématique de ce que la grammaire formalisera.

**Statut** : ✅ Décidé.

---

### 2.4 Modaux

**Quoi enseigner** :
- le système modal complet (9 modaux + leurs équivalents périphrastiques)
- la défectivité (pas de `to`, pas de `-s` à la 3ᵉ pers.)
- les paires temporelles : `can/could`, `will/would`, `may/might`, `shall/should`
- les substituts pour les temps manquants : `to have to` (passé/futur de `must`), `to be able to` (passé/futur de `can`)
- les sens des modaux (capacité, permission, obligation, conseil, probabilité)

**Sortie du corpus** : 9 entrées

| id | mot | trad |
|---|---|---|
| 1463 | can | pouvoir |
| 1464 | could | pouvoir (passé/conditionnel) |
| 1465 | may | pouvoir (permission), peut-être |
| 1466 | might | peut-être (faible) |
| 1467 | must | devoir (obligation, déduction) |
| 1468 | should | devrait |
| 1469 | will | futur, volonté |
| 1470 | would | conditionnel |
| 1471 | shall | futur 1ère personne (UK) |

**Restent au corpus** : `to have to` (1472) et `to be able to` (1473) — verbes complets, conjugables à tous les temps et toutes les personnes, distincts des modaux purs qui sont défectifs. Un MCQ `to have to → devoir, falloir` est honnête. Ils joueront un rôle didactique de complément aux modaux (équivalents temporels) lors de la leçon de grammaire.

**Statut** : ✅ Décidé.

---

### 2.5 Prépositions polyvalentes

**Quoi enseigner** :
- les collocations idiomatiques (`at home, at school, on Monday, in summer, by car, with me`...)
- la non-correspondance avec les prépositions françaises (l'enfant doit désapprendre le calque)
- les phrasal verbs sont une question liée mais distincte (voir 2.7)

**Sortie du corpus** : 9 entrées

| id | mot | trad approchée |
|---|---|---|
| 1230 | for | pour, pendant |
| 1231 | to | à, vers |
| 1232 | from | de, depuis |
| 1233 | in | dans, en |
| 1234 | on | sur |
| 1235 | at | à (point précis) |
| 1236 | by | par, près de |
| 1237 | with | avec |
| 1247 | about | à propos de, environ, vers |

**Restent au corpus** :
- **Prépositions spatiales univoques** (`under, over, above, below, between, among, through, against, without, near, in front of, next to` — ids 1238-1246, 1496-1500) — traduction stable, sens concret
- **Prépositions/conjonctions temporelles** (`before, after, until, since, during, while` — ids 1224-1229) — traduction stable

**Statut** : ✅ Décidé.

---

### 2.6 Nombres et construction du nombre

**Quoi enseigner** :
- les cardinaux 0-12 (irréguliers, à mémoriser)
- la règle `-teen` (13-19) et ses exceptions orthographiques (`thirteen, fifteen, eighteen`)
- la règle `-ty` (20-90) et ses exceptions (`twenty, thirty, forty, fifty`)
- la discrimination orale `-teen / -ty` (accent tonique)
- `hundred / thousand / million` toujours au singulier précédés d'un nombre (`three hundred` et non `*three hundreds`)
- la composition (`twenty-three`, `one hundred and twelve`)
- les ordinaux (`first, second, third` irréguliers, `-th` régulier avec `fifth, ninth` particuliers)
- l'expression de l'âge : `I'm twelve` ou `I'm twelve years old` mais **jamais** `*I have twelve` (calque français à proscrire)
- la lecture des années (`nineteen eighty-five` vs `twenty twenty-five`)
- les fractions, décimaux, dates ordinales (`the third of May`)

**Sortie du corpus** : 22 entrées

| id | mots |
|---|---|
| 1321-1338 | zero, one→thirteen, twenty, hundred, thousand, million |
| 1339-1341 | first, second, third |
| 1489 | a number (doublon de 1320, à supprimer) |

**Statut** : ✅ Décidé.

---

### 2.7 Degrés de comparaison (comparatif et superlatif)

**Quoi enseigner** :
- la règle régulière courte : `-er / -est` (`fast / faster / fastest`)
- la règle régulière longue : `more / most + adj` (`interesting / more interesting / most interesting`)
- les irréguliers : `good / better / best`, `bad / worse / worst`, `far / further / furthest`, `little / less / least`
- les structures `as ... as`, `not as ... as`, `the more ... the more ...`

**Sortie du corpus** : aucune.

Toutes les briques restent au corpus parce qu'elles ont une vie autonome utile :
- `good, bad, better, worse, best, worst, more, less, far` (ids 1357-1364, 1496)

**Statut** : ✅ Décidé. C'est le premier chantier grammaire qui ne sort aucune entrée du corpus — modèle de "règle pure, briques gardées".

---

## 3. Chantiers grammaire identifiés mais non encore formalisés

Ces chantiers sont prévisibles et suivront la même logique "règle pure, briques gardées" (catégorie 2.7) :

- **Pluriels réguliers** (`-s, -es, -ies`) et irréguliers (`children, men, women, feet, teeth, mice...`) — corpus inchangé
- **Construction des phrases** (ordre SVO, position des adverbes, place du complément...) — corpus inchangé
- **Genitive `'s`** (`John's car, the children's books`) — corpus inchangé
- **Articles** (`a / an / the / Ø`) — le `DeterminerService` les gère automatiquement, voir architecture.md
- **Temps verbaux complets** (present simple vs present continuous, present perfect, past simple...) — au-delà du seul futur déjà couvert

À formaliser au fur et à mesure que les décisions correspondantes sont prises.

---

## 4. Hors-grammaire mais hors-vocabulaire : 4 entrées refusées

Ces 4 entrées étaient dans le corpus initial mais sortent **sans aller en grammaire** non plus. Elles sont jugées non pédagogiquement rentables comme entrées de vocab :

| id | mot | raison |
|---|---|---|
| 1252 | both...and | structure grammaticale, pas un mot |
| 1313 | Merry Christmas | viendra par exposition naturelle (vu 1× par an) |
| 1314 | Happy New Year | idem |
| 1319 | Cheers | registre adulte, sera croisé au bon moment |
| 1284 | What? | doublon de `what` (1217), le `?` ne justifie pas une entrée |

---

## 5. Déplacements thématiques (ni grammaire ni suppression)

Distincts des sorties grammaire : entrées qui restent **dans Vocabulaire** mais changent de thème pour rationaliser l'ordre du corpus.

### Pays & nationalités — nouveau thème à créer

10 entrées initialement dans "Compléments" → à déplacer vers un nouveau thème dédié.

| id | mot | trad |
|---|---|---|
| 1474 | a Frenchman | un Français |
| 1475 | an Englishman | un Anglais |
| 1476 | an American | un Américain |
| 1477 | the UK | le Royaume-Uni |
| 1478 | the USA | les États-Unis |
| 1479 | France | la France |
| 1480 | Belgium | la Belgique |
| 1481 | Spanish | l'espagnol, espagnol |
| 1482 | German | l'allemand, allemand |
| 1483 | Italian | l'italien, italien |

Le thème pourra être enrichi ultérieurement (`Spain, Portugal, Belgian, Dutch, Chinese...`) pour atteindre une masse pédagogique cohérente.

---

## 6. Bilan quantitatif

Sur les **333 entrées** du fichier de travail (sous-corpus des 5 thèmes fondamentaux : Verbes essentiels 1/2, Expressions, Mots-outils, Compléments) :

| Destination | Nombre | % |
|---|---|---|
| Conservées au corpus | 259 | 78% |
| Sorties en grammaire | 59 | 18% |
| Déplacées vers Pays & nationalités | 10 | 3% |
| Refusées du corpus | 4 | 1% |
| Doublons à supprimer | 1 (What?) | <1% |

Détail des sorties grammaire (59 entrées) :
- Pronoms personnels sujet : 7
- Négation `not` : 1
- Système possessif (déterminants + pronoms) : 12
- Modaux : 9
- Prépositions polyvalentes : 9
- Nombres + ordinaux : 22 (dont 1 doublon `a number`)
- Verbes-piliers vus en grammaire (`I'm...`) : 1

Cette proportion (~78% conservé, ~22% redirigé) est cohérente avec une opération de rationalisation : ni trop conservatrice (qui laisserait passer les incohérences), ni trop radicale (qui viderait le corpus de sa substance).

---

## 7. Articulation avec Vocabulaire

Ce document définit **ce qui n'est pas du ressort de Vocabulaire**. L'app Vocabulaire continue de couvrir :
- l'apprentissage du lexique (noms, verbes, adjectifs, adverbes à traduction stable)
- les expressions sociales figées (`Hello, Thank you, How are you?...`)
- les phrasal verbs comme **verbes pleins** (`to give up, to look after, to come back...`)
- les pronoms personnels **objet** (`me, you, him, her, us, them`)
- les mots questions (`what, who, where, when, why, how, which, whose`)

Et bénéficie de mécaniques internes qui prennent en charge **automatiquement** certains points grammaticaux sans qu'ils sortent du corpus :
- le `DeterminerService` génère dynamiquement les déterminants `a/an/the/my/your/his/her/our/their` devant les noms (voir `architecture.md` section à venir)
- l'exposition au pluriel et aux conjugaisons se fait via les modes `forms_plural` et `forms_verb`

Ainsi, le corpus Vocabulaire reste lexical tout en exposant l'enfant aux structures grammaticales **en pratique** — pendant que la grammaire (manuel, leçon, autre dispositif) couvre la **règle explicite**.

---

## 8. Chantier annexe : le devenir du thème "Compléments"

Une fois les sorties grammaire et les déplacements effectués, le thème "Compléments" reste un fourre-tout sémantique. À horizon moyen, deux options sont possibles :

- **A.** Éclatement en thèmes plus fins (verbes complémentaires, noms-pivots, connecteurs, adverbes...)
- **B.** Conservation assumée comme catégorie ouverte recevant les ajouts ultérieurs au corpus

Décision à prendre plus tard, hors session de refonte.
