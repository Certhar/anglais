/**
 * core/EventBus.js
 * 
 * Bus d'événements global pour communication inter-composants
 * sans couplage direct.
 * 
 * Pattern : Observer / PubSub.
 * 
 * Utilisation :
 *   import { events } from './core/EventBus.js';
 *   
 *   // S'abonner
 *   const unsubscribe = events.on('progress:changed', (data) => {
 *     console.log('Progression mise à jour:', data);
 *   });
 *   
 *   // Émettre
 *   events.emit('progress:changed', { userId: 'max', wordId: 12 });
 *   
 *   // Se désabonner
 *   unsubscribe();
 * 
 * Convention de nommage des événements :
 *   "domaine:action" en kebab-case
 *   - "progress:changed"
 *   - "session:started"
 *   - "user:switched"
 *   - "data:exported"
 * 
 * NOTE : ce module est volontairement minimaliste. Pas de wildcards,
 * pas de priorités, pas de "once". Si un jour on a besoin, on étend.
 */


class EventBus {
  constructor() {
    this._listeners = new Map();  // eventName → Set de callbacks
  }

  /**
   * S'abonne à un événement.
   * 
   * @param {string} eventName - nom de l'événement
   * @param {Function} callback - fonction appelée à chaque émission
   * @returns {Function} fonction de désabonnement
   */
  on(eventName, callback) {
    if (!this._listeners.has(eventName)) {
      this._listeners.set(eventName, new Set());
    }
    this._listeners.get(eventName).add(callback);

    // Retourne une fonction qui désabonne
    return () => this.off(eventName, callback);
  }

  /**
   * Désabonne un callback d'un événement.
   * 
   * @param {string} eventName 
   * @param {Function} callback 
   */
  off(eventName, callback) {
    const set = this._listeners.get(eventName);
    if (set) {
      set.delete(callback);
      if (set.size === 0) {
        this._listeners.delete(eventName);
      }
    }
  }

  /**
   * Émet un événement vers tous les abonnés.
   * Les erreurs dans les callbacks sont attrapées (un callback raté
   * ne doit pas empêcher les autres de s'exécuter).
   * 
   * @param {string} eventName 
   * @param {*} data - données passées aux callbacks
   */
  emit(eventName, data = null) {
    const set = this._listeners.get(eventName);
    if (!set) return;

    for (const callback of set) {
      try {
        callback(data);
      } catch (err) {
        console.error(`Erreur dans listener de "${eventName}":`, err);
      }
    }
  }

  /**
   * Retire tous les listeners. Utile pour les tests.
   */
  clear() {
    this._listeners.clear();
  }
}


// Singleton exporté : il n'y a qu'un seul bus dans l'app
export const events = new EventBus();

// Export aussi de la classe au cas où on veut un bus local (tests, isolation)
export { EventBus };
