/**
 * services/ProgressService.js
 *
 * @deprecated DÉPRÉCIÉ — 17 mai 2026
 *
 * ─────────────────────────────────────────────────────────────────────
 * NE PAS UTILISER. NE PAS IMPORTER. À SUPPRIMER QUAND LES NOUVEAUX
 * SERVICES SERONT EN PLACE.
 * ─────────────────────────────────────────────────────────────────────
 *
 * Pourquoi ce fichier existe encore ?
 *
 * Ce service était un PROTOTYPE écrit tôt dans le projet, avant que la
 * spec de rebrassage (J+1/J+7/J+30/J+90) ne soit posée. Il gère
 * "mots ratés du jour / mots ratés de la veille" avec une rotation
 * quotidienne basique, en mono-utilisateur, sur localStorage en accès
 * direct.
 *
 * Il n'est appelé NULLE PART dans le code actuel. Aucun import, aucun
 * usage. C'est un mort qui dort.
 *
 * Il est remplacé par les services à venir :
 *   - RebrassageService    (cycle J+0/J+1/J+7/J+30/J+90, multi-enfants)
 *   - UserStateService     (étendu pour stocker la progression par mot)
 *   - SessionComposerService (orchestre la séance du jour)
 *
 * Voir architecture.md §7 (Moteur de rebrassage) pour la spec complète.
 *
 * Quand supprimer ? Quand le RebrassageService sera en place et testé.
 * On supprime alors ce fichier physiquement.
 *
 * ─────────────────────────────────────────────────────────────────────
 * Contenu historique préservé ci-dessous à titre documentaire.
 * ─────────────────────────────────────────────────────────────────────
 *
 * Gère la progression de l'utilisateur :
 *   - Mots ratés du jour
 *   - Mots ratés de la veille (à retravailler)
 *   - Rotation quotidienne (today_failed → yesterday_failed)
 *   - État de pause/reprise d'une session
 *
 * Persistance : localStorage pour le MVP.
 * Mono-utilisateur (pas de préfixage par userId).
 */

import { todayISO, isNewDay } from '../core/helpers.js';
import { events } from '../core/EventBus.js';


// Clés localStorage
const KEYS = {
  YESTERDAY_FAILED: "voc_yesterday_failed",
  TODAY_FAILED: "voc_today_failed",
  TODAY_DATE: "voc_today_date",
  RESUME_STATE: "voc_resume_state",
};


/**
 * Wrapper localStorage avec gestion d'erreurs.
 */
const Store = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) {
      console.warn(`[ProgressService] Lecture ${key} échouée:`, e);
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error(`[ProgressService] Écriture ${key} échouée:`, e);
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn(`[ProgressService] Suppression ${key} échouée:`, e);
    }
  },
};


export class ProgressService {
  constructor() {
    this._rotateIfNewDay();
  }

  /**
   * Vérifie si on a changé de jour. Si oui, déplace today → yesterday.
   * Appelée au démarrage et avant chaque opération sensible au temps.
   * @private
   */
  _rotateIfNewDay() {
    const lastDate = Store.get(KEYS.TODAY_DATE);
    const today = todayISO();

    if (lastDate && isNewDay(lastDate)) {
      const todayFailed = Store.get(KEYS.TODAY_FAILED, []);
      if (todayFailed.length > 0) {
        // On fusionne avec ce qui restait de la veille (rare mais possible)
        const oldYesterday = Store.get(KEYS.YESTERDAY_FAILED, []);
        const merged = [...new Set([...oldYesterday, ...todayFailed])];
        Store.set(KEYS.YESTERDAY_FAILED, merged);
      }
      Store.set(KEYS.TODAY_FAILED, []);
    }

    Store.set(KEYS.TODAY_DATE, today);
  }

  /**
   * Marque un mot comme raté aujourd'hui.
   * Émet "progress:failed".
   * @param {number} wordId 
   */
  markFailed(wordId) {
    this._rotateIfNewDay();
    const failed = new Set(Store.get(KEYS.TODAY_FAILED, []));
    failed.add(wordId);
    Store.set(KEYS.TODAY_FAILED, [...failed]);
    events.emit('progress:failed', { wordId });
  }

  /**
   * Marque un mot comme réussi : le retire des "à retravailler" si présent.
   * Émet "progress:succeeded".
   * @param {number} wordId 
   */
  markSucceeded(wordId) {
    this._rotateIfNewDay();
    const yesterday = new Set(Store.get(KEYS.YESTERDAY_FAILED, []));
    if (yesterday.has(wordId)) {
      yesterday.delete(wordId);
      Store.set(KEYS.YESTERDAY_FAILED, [...yesterday]);
    }
    events.emit('progress:succeeded', { wordId });
  }

  /**
   * @returns {Array<number>} ids des mots à retravailler (ratés la veille)
   */
  getYesterdayFailedIds() {
    this._rotateIfNewDay();
    return Store.get(KEYS.YESTERDAY_FAILED, []);
  }

  /**
   * @returns {Array<number>} ids des mots ratés aujourd'hui
   */
  getTodayFailedIds() {
    this._rotateIfNewDay();
    return Store.get(KEYS.TODAY_FAILED, []);
  }

  /* =========================================================================
     ÉTAT DE REPRISE DE SESSION
     ========================================================================= */

  /**
   * Sauvegarde l'état de session pour permettre la reprise.
   * @param {Object} state - état arbitraire (queue, currentIndex, stats...)
   */
  saveResumeState(state) {
    Store.set(KEYS.RESUME_STATE, {
      ...state,
      timestamp: Date.now(),
    });
  }

  /**
   * @returns {Object|null} l'état sauvegardé, ou null si rien
   */
  loadResumeState() {
    return Store.get(KEYS.RESUME_STATE);
  }

  /**
   * Efface l'état de reprise (session terminée ou abandonnée).
   */
  clearResumeState() {
    Store.remove(KEYS.RESUME_STATE);
  }

  /* =========================================================================
     UTILITAIRES
     ========================================================================= */

  /**
   * Réinitialise toute la progression (debug / reset utilisateur).
   * À utiliser avec précaution.
   */
  resetAll() {
    Store.remove(KEYS.YESTERDAY_FAILED);
    Store.remove(KEYS.TODAY_FAILED);
    Store.remove(KEYS.TODAY_DATE);
    Store.remove(KEYS.RESUME_STATE);
    events.emit('progress:reset');
  }
}


// Singleton exporté
export const progress = new ProgressService();
