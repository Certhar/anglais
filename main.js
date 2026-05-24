/**
 * main.js
 *
 * Point d'entrée de l'application Vocabulaire.
 *
 * Rôle :
 *   - Récupère le conteneur DOM racine (#app dans index.html)
 *   - Instancie la pile de services (Ordonnanceur, Composer ; Rebrassage
 *     et UserState/WordRepo sont des singletons exportés par leurs modules)
 *   - Instancie le Router avec la liste des enfants et le composer
 *   - Démarre l'application (charge le corpus, monte HomeScreen)
 *
 * Tout le reste (orchestration des écrans, transitions, persistance...)
 * vit ailleurs dans des modules dédiés.
 *
 * ─────────────────────────────────────────────────────────────────────
 * NOTE : pourquoi câbler les services ici plutôt que dans le Router
 * ─────────────────────────────────────────────────────────────────────
 * Le Router est l'orchestrateur des écrans. Le câblage de la pile de
 * services applicatifs (Composer, Ordonnanceur) est un concern de
 * démarrage, séparé de l'orchestration. Le faire ici :
 *   - laisse le Router agnostique de la chaîne de dépendances
 *   - permet de remplacer un service par un mock dans un futur harness
 *     de test du Router (router.spec.html)
 *   - aligne le projet sur la convention déjà utilisée pour `children`
 *     (la config vit dans main.js, pas dans Router)
 *
 * ─────────────────────────────────────────────────────────────────────
 * NOTE : configuration des enfants
 * ─────────────────────────────────────────────────────────────────────
 * Pour l'instant, la liste des enfants est codée en dur ici. Plus tard,
 * elle viendra d'un `UserStateService` ou d'un futur `ParentScreen`
 * où l'adulte pourra gérer les profils.
 */

import { Router } from './core/Router.js';
import { userState } from './services/UserStateService.js';
import { wordRepo } from './repositories/WordRepository.js';
import { rebrassage } from './services/RebrassageService.js';
import { OrdonnanceurService } from './services/OrdonnanceurService.js';
import { SessionComposerService } from './services/SessionComposerService.js';
import { SessionRecorderService } from './services/SessionRecorderService.js';


// ─────────────────────────────────────────────────────────────────────
// Utilisateurs.
//
// Julie et Max : les vrais apprenants.
// Papa et Mamy : ajoutés pour la phase de béta (mai 2026).
//   - Papa  → compte de test de Gauthier (pour valider sans polluer la
//             progression des enfants).
//   - Mamy  → démonstration à montrer à maman.
// À retirer (ou à reclasser) après la béta, selon retour terrain.
// ─────────────────────────────────────────────────────────────────────
const CHILDREN = [
  { id: 'julie', name: 'Julie' },
  { id: 'max',   name: 'Max'   },
  { id: 'papa',  name: 'Papa'  }, // TODO béta : compte de test, à retirer après validation
  { id: 'mamy',  name: 'Mamy'  }, // TODO béta : démo maman, à retirer après validation
];


// ─── Câblage de la pile de services ───────────────────────────────────
//
// Note sur l'ordre : aucun service ne lit le corpus dans son constructeur.
// L'appel à `wordRepo.load()` est fait par `router.start()` plus bas,
// AVANT la première utilisation. Donc l'ordre d'instanciation ici n'a
// pas d'impact tant que les références sont en place.
//
// Note sur les noms : OrdonnanceurService attend `wordRepository` (nom
// long), SessionComposerService attend `wordRepo` (nom court). C'est
// une asymétrie historique du projet, on ne la corrige pas ici.

// Source de données : corpus complet enrichi avec ordo_file/phase/bracket.
// L'Ordonnanceur gère seul la progression boot → post_boot → thèmes via
// le champ `phase` du corpus. setDataPath doit être appelé AVANT
// router.start() (qui déclenche le chargement effectif via wordRepo.load()).
wordRepo.setDataPath('./data/words.canonical.json');

const ordonnanceur = new OrdonnanceurService({
  wordRepository: wordRepo,
  userState,
});

const composer = new SessionComposerService({
  userState,
  wordRepo,
  rebrassage,
  ordonnanceur,
});

// SessionRecorderService : miroir d'écriture du composer.
// C'est l'UNIQUE point d'écriture vers le cycle de rebrassage (et vers
// les structures intra-jour exosProgress / acquiredToday). Le Router
// l'utilise dans _mountExercises pour persister les résultats des
// séances normales. Pas utilisé en séance révision tant que le
// RevisionPlaceholderScreen est en place (cf. Pas 11).
const recorder = new SessionRecorderService({
  userState,
  rebrassage,
});


// ─── Démarrage ────────────────────────────────────────────────────────

const appEl = document.getElementById('app');
if (!appEl) {
  throw new Error("Élément #app introuvable dans le DOM. Vérifie index.html.");
}

const router = new Router(appEl, {
  children: CHILDREN,
  composer,
  recorder,
});

router.start().catch(err => {
  console.error("Erreur au démarrage de l'application :", err);
  appEl.innerHTML = `
    <div style="padding:2rem;text-align:center;color:#a00;">
      <h2>Oups, l'application n'a pas pu démarrer.</h2>
      <p>Ouvre la console (F12) pour voir le détail.</p>
    </div>
  `;
});


// Exposé pour debug en dev : window.app permet d'accéder au router et
// à la pile de services depuis la console (pratique pour appeler
// composer.composerSeance('max', '2026-05-19') et inspecter le résultat).
if (typeof window !== 'undefined') {
  window.app = { router, composer, recorder, ordonnanceur, rebrassage, userState, wordRepo };
}
