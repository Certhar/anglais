/**
 * core/Router.js
 *
 * Routeur applicatif : orchestre les transitions entre les écrans.
 *
 * ─────────────────────────────────────────────────────────────────────
 * RÔLE
 * ─────────────────────────────────────────────────────────────────────
 *
 * Chaque écran (HomeScreen, ColdLessonScreen, ExerciseScreen, ResultScreen)
 * expose des CALLBACKS d'intention : "l'utilisateur a cliqué Leçon",
 * "la session est terminée", "l'enfant veut refaire les mots à revoir".
 * Les écrans NE SAVENT PAS où aller ensuite.
 *
 * Le Router est l'unique endroit qui sait :
 *   - quel écran montrer après quel callback
 *   - quel payload passer (les mots de la leçon, les résultats à afficher)
 *   - quand marquer un état utilisateur (leçon parcourue, etc.)
 *
 * ─────────────────────────────────────────────────────────────────────
 * FLUX PRINCIPAL
 * ─────────────────────────────────────────────────────────────────────
 *
 *   HomeScreen
 *     ├─ onStartLesson(childId)          [mode normale, bouton "Démarrer"]
 *     ├─ onStartRevision(childId)        [mode révision, bouton "Réviser"]
 *     │   │
 *     │   └─→ ColdLessonScreen            (les deux mènent ici)
 *     │        ├─ onFinish()              → marque leçon vue, retour Home
 *     │        ├─ onContinueToExercises() → marque leçon vue, va aux Exos
 *     │        └─ onAbort()               → retour Home (sans marquer)
 *     │
 *     └─ onStartExercises(childId)       [les deux modes, bouton "Exercices"]
 *         └─→ ExerciseScreen
 *              ├─ onComplete(results) → ResultScreen
 *              │                         ├─ onFinish() → Home
 *              │                         └─ onRetryFailed(words) → ExerciseScreen
 *              └─ onAbort() → Home
 *
 * ─────────────────────────────────────────────────────────────────────
 * RESPONSABILITÉS PARTAGÉES
 * ─────────────────────────────────────────────────────────────────────
 *
 *   Router :         orchestration + transitions + composition de session
 *   Écrans :         affichage + intentions (callbacks)
 *   UserStateService : persistance des flags utilisateur
 *   WordRepository : accès aux données
 *
 * ─────────────────────────────────────────────────────────────────────
 * NOTE : composition des leçons
 * ─────────────────────────────────────────────────────────────────────
 *
 * Le Router DÉLÈGUE la composition au `SessionComposerService` (injecté
 * via les options). Le composer renvoie des ids de mots ; le Router se
 * charge de :
 *   - calculer la date du jour (dateISO)
 *   - appeler `composer.composerSeance(childId, dateISO)`
 *   - traiter les 2 types de séance renvoyés ("normale" / "revision")
 *   - résoudre les ids en objets Word via `wordRepo.getByIds(...)` pour
 *     les passer aux écrans (qui attendent des objets Word complets,
 *     pas des ids)
 *
 * Le type de séance est aussi propagé à HomeScreen au moment du
 * montage, pour qu'il affiche le bon menu :
 *   - "normale"  → boutons "Démarrer" + "Exercices"
 *   - "revision" → boutons "Réviser"  + "Exercices"
 *
 * Dans les deux modes, la structure est identique (deux boutons, le
 * second verrouillé tant que la ColdLesson n'a pas été parcourue).
 * Seuls changent le label et l'icône du premier bouton, et le greeting
 * qui informe l'enfant en révision ("Aujourd'hui, révision.") — les
 * jours de révision pouvant être plus chargés que les jours normaux.
 *
 * ─────────────────────────────────────────────────────────────────────
 * API
 * ─────────────────────────────────────────────────────────────────────
 *
 *   const router = new Router(container, { children: [...], composer });
 *   await router.start();   // monte HomeScreen
 *
 *   // Aussi appelable de l'extérieur si besoin :
 *   router.navigate('home', { childId: 'julie' });
 */

import { HomeScreen }                from '../screens/HomeScreen.js';
import { ColdLessonScreen }          from '../screens/ColdLessonScreen.js';
import { ExerciseScreen }            from '../screens/ExerciseScreen.js';
import { ResultScreen }              from '../screens/ResultScreen.js';
import { userState }                 from '../services/UserStateService.js';
import { wordRepo }                  from '../repositories/WordRepository.js';
import { exerciseService }           from '../services/ExerciseService.js';


export class Router {

  /**
   * @param {HTMLElement} container - élément racine où monter les écrans
   * @param {Object} options
   * @param {Array<{id:string,name:string}>} options.children - enfants gérés par l'app
   * @param {SessionComposerService} options.composer - compose la séance du jour
   * @param {SessionRecorderService} options.recorder - persiste les résultats de séance
   */
  constructor(container, options = {}) {
    if (!container) {
      throw new Error("Router : container requis");
    }
    if (!options.composer) {
      throw new Error("Router : composer requis (SessionComposerService)");
    }
    if (!options.recorder) {
      throw new Error("Router : recorder requis (SessionRecorderService)");
    }
    this.container = container;
    this.children = options.children || [];
    this._composer = options.composer;
    this._recorder = options.recorder;

    // Écran courant
    this._currentScreen = null;

    // Enfant courant : on tente de pré-remplir depuis la préférence
    // persistée "dernier enfant utilisé". Si elle existe ET correspond
    // à un enfant connu de cette instance, on l'utilise. Sinon, null
    // → HomeScreen affichera la vue 1 (choix d'enfant).
    //
    // Le filtrage par `children` évite qu'un childId périmé (enfant
    // retiré de la liste depuis le dernier lancement) ne provoque un
    // affichage incohérent.
    const lastId = userState.getLastChildId();
    const knownChild = lastId
      ? this.children.find(c => c.id === lastId)
      : null;
    this._currentChildId = knownChild ? knownChild.id : null;
  }

  /**
   * Point d'entrée : charge le corpus et monte HomeScreen.
   */
  async start() {
    await wordRepo.load();
    this.navigate('home');
  }

  /**
   * Détruit l'écran courant et monte le suivant.
   *
   * Cette méthode est volontairement le SEUL endroit qui sait quel
   * écran instancier — les écrans entre eux ne se connaissent pas.
   *
   * @param {string} name - 'home' | 'cold-lesson' | 'exercises' | 'result'
   * @param {Object} [payload] - dépend de l'écran (voir _mount* méthodes)
   */
  navigate(name, payload = {}) {
    // Démonter l'écran courant s'il existe
    if (this._currentScreen) {
      this._currentScreen.destroy();
      this._currentScreen = null;
    }
    this.container.innerHTML = "";

    switch (name) {
      case 'home':                  this._mountHome(payload); break;
      case 'cold-lesson':           this._mountColdLesson(payload); break;
      case 'exercises':             this._mountExercises(payload); break;
      case 'result':                this._mountResult(payload); break;
      default:
        throw new Error(`Router : écran inconnu "${name}"`);
    }
  }

  // ───────────────────────────────────────────────────────────────────
  // Montage des écrans (un par un, pour rester lisible)
  // ───────────────────────────────────────────────────────────────────

  /**
   * Monte HomeScreen.
   *
   * Passe `initialChildId` à l'écran : si on a déjà un enfant courant
   * (cas d'un retour après une leçon ou des exercices), on évite de
   * lui redemander qui il est et on l'amène direct à son menu (vue 2).
   * Au tout premier démarrage (ou après "Changer de profil"), childId
   * vaut null → HomeScreen affiche la vue 1 (choix d'enfant).
   *
   * Persistance de la préférence "dernier enfant" :
   *   - Quand l'enfant démarre une activité (leçon ou exos) → on mémorise
   *     son childId via `userState.setLastChildId`. Au prochain démarrage
   *     de l'app, on retombera direct sur son menu.
   *   - Quand l'enfant clique "Changer de profil" → on efface la préférence
   *     via `userState.clearLastChildId`. Au prochain démarrage, retour
   *     à l'écran "Qui es-tu ?".
   *
   * @private
   */
  /**
   * Monte HomeScreen.
   *
   * Le `sessionType` ("normale" ou "revision") est calculé en appelant
   * le composer, pour que HomeScreen affiche le bon menu (Démarrer +
   * Exercices, ou Réviser seul). Il faut un childId pour calculer le
   * sessionType, donc :
   *   - Si on a déjà un `_currentChildId` (cas du retour après leçon ou
   *     après reload avec préférence persistée), on calcule directement.
   *   - Sinon (premier démarrage, ou retour de "Changer de profil"),
   *     on n'a pas de childId encore : on monte HomeScreen en mode
   *     "normale" par défaut (vue 1, le sessionType ne sera pas affiché),
   *     puis on capte le clic sur un enfant via `onChildPicked` et on
   *     re-monte avec le bon sessionType.
   *
   * @private
   */
  _mountHome() {
    const sessionType = this._currentChildId
      ? this._computeSessionType(this._currentChildId)
      : "normale";

    this._currentScreen = new HomeScreen({
      children: this.children,
      initialChildId: this._currentChildId,
      sessionType,

      // Appelé par HomeScreen quand l'enfant clique sur son nom en vue 1.
      // On en profite pour re-monter avec le sessionType calculé pour
      // cet enfant. Si on tombe sur "normale" (cas courant), le re-mount
      // est invisible côté UX (même vue, même contenu).
      onChildPicked: (childId) => {
        const expectedType = this._computeSessionType(childId);
        // Optimisation : on ne re-mount que si le type diffère du
        // défaut "normale" déjà monté (cas "revision"). Sinon HomeScreen
        // affiche déjà la bonne vue, pas besoin de re-rendre.
        if (expectedType !== "normale") {
          this._currentChildId = childId;
          this.navigate('home');
        }
      },

      onStartLesson: (childId) => {
        this._currentChildId = childId;
        userState.setLastChildId(childId);
        const composition = this._composerSeance(childId);
        // null = corpus terminé OU incohérence : alert/warn déjà émis,
        // on reste sur Home.
        if (composition === null) return;
        // Cas dégénéré : pas de ColdLesson mais des exos quand même
        // (par exemple, tout est acquiredToday sauf des J+1 d'hier). Il
        // n'y a rien à montrer en Leçon ; on amène l'enfant directement
        // aux exos pour ne pas le bloquer sur un écran vide.
        if (composition.coldWords.length === 0) {
          if (composition.exerciseQueue.length > 0) {
            this.navigate('exercises', { queue: composition.exerciseQueue });
          }
          return;
        }
        this.navigate('cold-lesson', { words: composition.coldWords });
      },

      onStartExercises: (childId) => {
        this._currentChildId = childId;
        userState.setLastChildId(childId);
        const composition = this._composerSeance(childId);
        if (composition === null) return;
        // Cas dégénéré : composition non-nulle mais exerciseQueue vide
        // (tout en ColdLesson, aucun exo à faire — peu probable mais on
        // se défend). On laisse l'enfant sur Home plutôt que d'ouvrir
        // un écran d'exos sans contenu.
        if (composition.exerciseQueue.length === 0) {
          console.warn("Router : onStartExercises sans exos à passer, retour Home");
          return;
        }
        this.navigate('exercises', { queue: composition.exerciseQueue });
      },

      // En mode révision, l'UX est analogue au mode normale : un bouton
      // "Réviser" (équivalent de "Démarrer" qui ouvre la ColdLesson) et
      // un bouton "Exercices" (verrouillé tant que la ColdLesson n'a pas
      // été parcourue). `onStartRevision` est donc l'équivalent de
      // `onStartLesson` en révision et passe par la même mécanique
      // unifiée `_composerSeance`. Le bouton "Exercices" en révision
      // appelle le `onStartExercises` ci-dessus, inchangé.
      onStartRevision: (childId) => {
        this._currentChildId = childId;
        userState.setLastChildId(childId);
        const composition = this._composerSeance(childId);
        // null = corpus terminé OU incohérence : alert/warn déjà émis,
        // on reste sur Home.
        if (composition === null) return;
        // Cas dégénéré théorique : pas de ColdLesson mais des exos. En
        // pratique impossible en révision (chaque mot d'un palier long a
        // sa ColdLesson) ; on protège par symétrie avec onStartLesson.
        if (composition.coldWords.length === 0) {
          if (composition.exerciseQueue.length > 0) {
            this.navigate('exercises', { queue: composition.exerciseQueue });
          }
          return;
        }
        this.navigate('cold-lesson', { words: composition.coldWords });
      },

      onSwitchChild: () => {
        // "Logout" léger : on oublie l'enfant courant et la préférence
        // persistée. HomeScreen gère lui-même le passage à sa vue 1 ;
        // pas besoin de re-navigate.
        this._currentChildId = null;
        userState.clearLastChildId();
      },

      // Bouton "reset" des profils débug (cf. flag `isDebugProfile` dans
      // CHILDREN). HomeScreen gère la confirmation native, on n'arrive
      // ici QUE si l'utilisateur a confirmé. On vide l'état de cet enfant
      // et on re-monte HomeScreen pour rafraîchir l'affichage (verrou
      // exos, etc.) — l'enfant reste sélectionné, on ne l'éjecte pas
      // vers la vue "Qui es-tu ?".
      onResetChild: (childId) => {
        userState.clearChild(childId);
        this._currentChildId = childId;
        this.navigate('home');
      },
    });
    this._currentScreen.render(this.container);
  }

  /**
   * Calcule le type de la séance du jour pour un enfant, en appelant
   * le composer. Renvoie "normale" ou "revision".
   *
   * Utilisé pour décider quel menu HomeScreen doit afficher.
   *
   * @param {string} childId
   * @returns {"normale"|"revision"}
   * @private
   */
  _computeSessionType(childId) {
    const seance = this._composer.composerSeance(
      childId, this._dateISOAujourdhui()
    );
    return seance.type;
  }

  /**
   * Monte ColdLessonScreen.
   * @private
   * @param {Object} payload
   * @param {Array} payload.words - mots de la leçon
   */
  _mountColdLesson({ words }) {
    if (!words || words.length === 0) {
      console.warn("Router : ColdLessonScreen sans mots, retour à Home");
      this.navigate('home');
      return;
    }
    const childId = this._currentChildId;

    this._currentScreen = new ColdLessonScreen(words, {

      // "Terminé" : la leçon est marquée comme parcourue, retour Home
      onFinish: () => {
        userState.markLessonViewed(childId);
        this.navigate('home');
      },

      // "Passer aux exercices" : la leçon est marquée comme parcourue,
      // on recompose la séance pour obtenir une queue à jour et on
      // enchaîne directement sur les exos.
      // D-10.4c : on régénère à neuf à chaque entrée dans Exercices,
      // pas de réutilisation d'une queue mise en cache. Si l'enfant a
      // mis du temps entre Leçon et Exos, ou si une autre session a
      // touché à `acquiredToday`, on en tient compte automatiquement.
      onContinueToExercises: () => {
        userState.markLessonViewed(childId);
        const composition = this._composerSeance(childId);
        if (composition === null) return;
        if (composition.exerciseQueue.length === 0) {
          // Rien à faire en exos (cas dégénéré). Retour Home.
          console.warn(
            "Router : onContinueToExercises sans exos à passer, retour Home"
          );
          this.navigate('home');
          return;
        }
        this.navigate('exercises', { queue: composition.exerciseQueue });
      },

      // Croix : on NE marque PAS la leçon comme parcourue (l'enfant a
      // explicitement abandonné). Retour Home, les exos resteront
      // verrouillés. Cf. decisions-en-attente.md n°5.
      onAbort: () => {
        this.navigate('home');
      },
    });
    this._currentScreen.render(this.container);
  }

  /**
   * Monte ExerciseScreen.
   *
   * Deux modes d'appel selon la provenance :
   *   - Avec `{ queue }` : queue d'exos déjà construite et filtrée (sans
   *     cold_lesson — D-10.4a). Cas séance (normale ou révision) orchestré
   *     par le Router via `_composerSeance`.
   *   - Avec `{ words }` : liste de mots bruts à passer en exos lourds.
   *     Cas "Refaire les mots à revoir" depuis ResultScreen, qui ne sait
   *     que les mots ratés et délègue la construction à ExerciseScreen.
   *
   * Les deux payloads sont mutuellement exclusifs. Si les deux sont
   * fournis, `queue` l'emporte.
   *
   * @private
   * @param {Object} payload
   * @param {Array<{word,mode}>} [payload.queue]
   * @param {Array<Object>} [payload.words]
   */
  _mountExercises({ queue, words }) {
    // Cas "queue fournie" prioritaire. On déduit les `words` à partir
    // de la queue (utile pour les vues de debug / fallback dans
    // ExerciseScreen). `words` peut être déduit comme l'ensemble des
    // mots distincts présents dans la queue, dans leur ordre de première
    // apparition.
    if (Array.isArray(queue) && queue.length > 0) {
      const seen = new Set();
      const wordsFromQueue = [];
      for (const item of queue) {
        if (item.word && !seen.has(item.word.id)) {
          seen.add(item.word.id);
          wordsFromQueue.push(item.word);
        }
      }
      if (wordsFromQueue.length === 0) {
        console.warn("Router : ExerciseScreen sans mots déduits de queue, retour à Home");
        this.navigate('home');
        return;
      }
      this._mountExercisesWith(wordsFromQueue, queue);
      return;
    }

    // Cas "words" (retry depuis ResultScreen) : ExerciseScreen rebuild
    // une queue lourde en interne via buildQueueLourd.
    if (!words || words.length === 0) {
      console.warn("Router : ExerciseScreen sans mots ni queue, retour à Home");
      this.navigate('home');
      return;
    }
    this._mountExercisesWith(words, null);
  }

  /**
   * Variante interne : monte ExerciseScreen avec un set de mots ET
   * éventuellement une queue préconstruite. Factorise le câblage des
   * callbacks (onAnswer, onComplete, onAbort), commun aux deux cas.
   *
   * @private
   * @param {Array<Object>} words
   * @param {Array<{word,mode}>|null} queue
   */
  _mountExercisesWith(words, queue) {
    // Date "aujourd'hui" capturée au montage. On la fige pour toute
    // la séance : si l'enfant joue à minuit pile, on ne veut pas que
    // le stream et le batch tombent sur deux dates différentes (ce
    // qui désynchroniserait exosProgress et acquiredToday).
    const dateSession = this._dateISOAujourdhui();
    const childId = this._currentChildId;

    const screenOptions = {

      // STREAM : à chaque réponse, persistance intra-jour via le
      // Recorder. Indispensable pour la reprise après crash.
      onAnswer: (word, mode, success) => {
        this._recorder.recordExo(childId, word.id, mode, success, dateSession);
      },

      // Session d'exos terminée → batch fin de séance, puis ResultScreen
      onComplete: (results) => {
        this._enregistrerSeanceSafe(childId, results, dateSession);
        this.navigate('result', { results, aborted: false });
      },

      // Croix : l'enfant abandonne. On va quand même sur ResultScreen
      // pour montrer ce qui a été fait (avec aborted=true qui adapte
      // le message), plutôt que de retourner direct sur Home (frustrant
      // après plusieurs exos déjà réussis).
      // → Le Recorder est appelé AUSSI en cas d'abort : les exos déjà
      //   faits méritent de compter dans le cycle (cf. D6 N1 : abort
      //   = fin de séance).
      onAbort: () => {
        const partial = this._currentScreen?.results || [];
        this._enregistrerSeanceSafe(childId, partial, dateSession);
        this.navigate('result', { results: partial, aborted: true });
      },
    };

    if (queue) {
      screenOptions.queue = queue;
    }

    this._currentScreen = new ExerciseScreen(words, screenOptions);
    this._currentScreen.render(this.container);
  }

  /**
   * Appelle recorder.enregistrerSeance en avalant les exceptions :
   * le but est de NE JAMAIS bloquer la navigation vers ResultScreen
   * à cause d'un problème de persistance. Une erreur ici signifie
   * un bug à corriger (mot en palier long mal branché, etc.), mais
   * pas une raison de bloquer l'enfant devant un écran cassé.
   *
   * @private
   */
  _enregistrerSeanceSafe(childId, results, dateISO) {
    try {
      this._recorder.enregistrerSeance(childId, results, dateISO);
    } catch (err) {
      console.error(
        "[Router] enregistrerSeance a échoué — la séance n'a pas été " +
        "persistée dans le cycle. Détail :", err
      );
    }
  }

  /**
   * Monte ResultScreen.
   * @private
   * @param {Object} payload
   * @param {Array} payload.results - résultats produits par ExerciseScreen
   * @param {boolean} [payload.aborted]
   */
  _mountResult({ results, aborted }) {
    this._currentScreen = new ResultScreen(results, {
      aborted: aborted === true,

      // "Terminer" → retour Home
      onFinish: () => {
        this.navigate('home');
      },

      // "Refaire les mots à revoir" → nouvelle ExerciseScreen avec
      // seulement les mots non acquis
      onRetryFailed: (wordsToRetry) => {
        this.navigate('exercises', { words: wordsToRetry });
      },
    });
    this._currentScreen.render(this.container);
  }

  // ───────────────────────────────────────────────────────────────────
  // Composition de session — délégation au SessionComposerService
  // ───────────────────────────────────────────────────────────────────

  /**
   * Compose la séance du jour pour un enfant — normale OU révision.
   *
   * Délègue au `SessionComposerService` pour obtenir la liste d'ids,
   * puis à `ExerciseService.buildQueueSeance` pour assembler la queue
   * complète. Sépare ensuite la queue en deux flux :
   *   - `coldWords` : les mots de la ColdLesson (chutes + nouveaux en
   *     mode normale ; mots des paliers longs en mode révision),
   *     destinés à `ColdLessonScreen`.
   *   - `exerciseQueue` : tout le reste (mcq, typing_fr, audio_to_text,
   *     text_to_audio, forms_*) destiné à `ExerciseScreen`.
   *
   * Conforme à D-10.4a : la queue passée à `ExerciseScreen` ne contient
   * aucune entrée `mode: "cold_lesson"`.
   *
   * Conforme à D-10.4b : la même mécanique sert aux séances normales et
   * aux séances révision. En révision, les ColdLessons sont déjà agrégées
   * en tête de queue par `_buildQueueSeanceRevision` — le split par
   * `mode === "cold_lesson"` les sépare correctement.
   *
   * Conforme à D-10.4c : cette méthode est appelée à CHAQUE entrée dans
   * un flux (Leçon ou Exercices), pas mise en cache. Le `SessionComposerService`
   * exclut au passage les mots dans `acquiredToday` — ainsi la reprise
   * après interruption repart automatiquement sur les mots restants.
   *
   * Cette méthode est appelée par les callbacks "Démarrer"/"Réviser"
   * et "Exercices" de HomeScreen, dans les deux modes (normale et
   * révision). Elle ne fait aucune supposition sur le type de séance
   * tant qu'il est connu.
   *
   * @param {string} childId - identifiant de l'enfant ("max", "julie")
   * @returns {{coldWords: Array<Object>, exerciseQueue: Array<Object>}|null}
   *   `null` si aucune navigation n'est attendue (incohérence ou corpus
   *   épuisé). Sinon, paire `{ coldWords, exerciseQueue }` cohérente :
   *   les deux extraits du MÊME appel à `composerSeance`.
   * @private
   */
  _composerSeance(childId) {
    const dateISO = this._dateISOAujourdhui();
    const seance = this._composer.composerSeance(childId, dateISO);

    if (seance.type !== "normale" && seance.type !== "revision") {
      // Type inconnu — défense par construction.
      console.warn(`Router : type de séance inconnu "${seance.type}"`);
      alert("Erreur inattendue dans la composition de la séance. Voir la console.");
      return null;
    }

    // Construction de la queue complète puis split cold / exos.
    const queue = exerciseService.buildQueueSeance(seance, wordRepo);

    const coldWords = queue
      .filter(item => item.mode === "cold_lesson")
      .map(item => item.word);

    const exerciseQueue = queue.filter(item => item.mode !== "cold_lesson");

    // Cas extrême : corpus complètement épuisé (aucune chute, aucun
    // nouveau, aucun J+1 dû). La queue serait vide ET il n'y aurait pas
    // de ColdLesson. On le signale à l'enfant et on bloque la navigation.
    if (coldWords.length === 0 && exerciseQueue.length === 0) {
      alert("Bravo, tu as fait tout le travail disponible aujourd'hui ✓");
      return null;
    }

    return { coldWords, exerciseQueue };
  }

  /**
   * Date du jour au format YYYY-MM-DD (fuseau local).
   *
   * On utilise les composants locaux plutôt que `toISOString()` pour
   * éviter le décalage de fuseau (toISOString() renvoie UTC, ce qui
   * peut donner la date de la veille en soirée en heure française).
   *
   * @returns {string} ex: "2026-05-19"
   * @private
   */
  _dateISOAujourdhui() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const j = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${j}`;
  }
}
