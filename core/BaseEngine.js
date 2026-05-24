/**
 * core/BaseEngine.js
 * 
 * Classe mère pour tous les "modes d'exercice" (équivalent JS de
 * BaseEngineData en Python/Monstrokid).
 * 
 * Définit le contrat commun à tous les modes :
 *   - render(container)  : affiche dans le DOM
 *   - destroy()          : nettoie
 *   - validate()         : appelé quand l'utilisateur valide
 *   - cleanup()          : appelé avant destruction (overridable)
 * 
 * Émet via EventBus :
 *   - "exercise:answered" { word, success, mode } → quand l'utilisateur valide
 *   - "exercise:completed" { word, mode }         → quand l'exercice se ferme
 * 
 * Les sous-classes implémentent _render() et _validateInput().
 * 
 * Pattern : Template Method (la classe mère orchestre, les filles remplissent).
 * 
 * ─────────────────────────────────────────────────────────────────────
 * API DE TIMERS TRAQUÉS (this._setTimeout / this._clearTimeout)
 * ─────────────────────────────────────────────────────────────────────
 * 
 * Les modes doivent UTILISER this._setTimeout(fn, ms) au lieu de
 * setTimeout(fn, ms) pour TOUT timer lié au cycle de vie du mode.
 * 
 * Raison : un setTimeout global n'est PAS annulé quand le mode est
 * détruit. Sa closure peut s'exécuter dans le contexte d'un NOUVEAU
 * mode, déclenchant des effets indésirables (audio du précédent mot
 * qui se rejoue dans l'exo suivant, etc.).
 * 
 * Avec this._setTimeout :
 *   - les timers sont enregistrés sur l'instance
 *   - destroy() les annule tous automatiquement
 *   - un timer armé après destroy() est ignoré silencieusement
 * 
 * USAGE :
 *   this._setTimeout(() => this._playAudio(), 300);
 * 
 * Pas de handle retourné : si tu as besoin d'annuler manuellement un
 * timer particulier avant destroy(), utilise this._clearTimeout(id) où
 * id est le retour de this._setTimeout (qui retourne quand même l'id
 * natif, pour ceux qui veulent).
 */

import { events } from './EventBus.js';


/**
 * Classe abstraite pour un mode d'exercice.
 */
export class BaseEngine {
  /**
   * @param {Object} word - mot à exercer (objet du WordRepository)
   * @param {Object} options - options spécifiques au mode (ex: forms, expected)
   */
  constructor(word, options = {}) {
    if (new.target === BaseEngine) {
      throw new Error("BaseEngine est abstrait, ne peut pas être instancié directement");
    }
    this.word = word;
    this.options = options;
    this.container = null;
    this._destroyed = false;

    // Registre des timers actifs (Set d'IDs natifs setTimeout)
    this._activeTimers = new Set();
  }

  /**
   * Identifiant du mode (à surcharger dans chaque fille).
   * Utilisé pour les stats et les logs.
   * @returns {string}
   */
  static get modeId() {
    throw new Error("Chaque mode doit définir static get modeId()");
  }

  /**
   * Rendu dans le DOM. Stocke le container et délègue à _render().
   * 
   * @param {HTMLElement} container - élément où rendre l'exercice
   */
  render(container) {
    if (this._destroyed) {
      throw new Error("Impossible de render un mode détruit");
    }
    this.container = container;
    this._render();
  }

  /**
   * Méthode à implémenter par les sous-classes.
   * Doit produire le DOM dans this.container.
   * @protected
   */
  _render() {
    throw new Error(`${this.constructor.name} doit implémenter _render()`);
  }

  /**
   * Valide la réponse de l'utilisateur.
   * Délègue à _validateInput() pour la logique spécifique.
   * Émet "exercise:answered" avec le résultat.
   * 
   * @param {*} userInput - ce que l'utilisateur a saisi/cliqué
   * @returns {{success: boolean, expected: string}}
   */
  validate(userInput) {
    if (this._destroyed) return { success: false, expected: null };

    const result = this._validateInput(userInput);

    events.emit('exercise:answered', {
      word: this.word,
      mode: this.constructor.modeId,
      success: result.success,
      userInput,
      expected: result.expected,
    });

    return result;
  }

  /**
   * Méthode à implémenter par les sous-classes.
   * Doit retourner { success: bool, expected: string }.
   * @protected
   */
  _validateInput(userInput) {
    throw new Error(`${this.constructor.name} doit implémenter _validateInput()`);
  }

  /**
   * Détruit l'exercice : annule les timers, nettoie le DOM, appelle cleanup().
   * Émet "exercise:completed".
   */
  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;

    // 1. Annuler tous les timers traqués AVANT cleanup()
    //    pour qu'un cleanup qui en armerait encore (rare mais possible)
    //    ne soit pas pris par surprise.
    this._clearAllTimers();

    this.cleanup();

    if (this.container) {
      this.container.innerHTML = "";
      this.container = null;
    }

    events.emit('exercise:completed', {
      word: this.word,
      mode: this.constructor.modeId,
    });
  }

  /**
   * Hook pour nettoyage spécifique (listeners externes, audio, etc.).
   * À surcharger si besoin.
   * 
   * Note : les timers traqués via this._setTimeout sont déjà annulés
   * AVANT cet appel. Pas besoin de les gérer ici.
   * @protected
   */
  cleanup() {
    // Default: rien à faire
  }

  // ===========================================================================
  // API TIMERS TRAQUÉS
  // ===========================================================================

  /**
   * Drop-in remplacement de setTimeout, mais traqué par l'instance.
   * Le timer est automatiquement annulé lors de destroy().
   * 
   * Si appelé sur un mode déjà détruit, retourne null et n'arme rien.
   * 
   * @param {Function} fn - callback à exécuter
   * @param {number} ms - délai en millisecondes
   * @returns {number|null} l'ID natif du timer, ou null si mode détruit
   * @protected
   */
  _setTimeout(fn, ms) {
    if (this._destroyed) return null;

    const id = setTimeout(() => {
      // Auto-désinscription quand le timer s'exécute
      this._activeTimers.delete(id);
      // Garde-fou final : si on a été détruit pendant le délai, ne rien faire
      if (this._destroyed) return;
      fn();
    }, ms);

    this._activeTimers.add(id);
    return id;
  }

  /**
   * Annule un timer précédemment armé avec this._setTimeout.
   * Utile dans les rares cas où on veut annuler avant destroy().
   * 
   * @param {number} id - ID retourné par this._setTimeout
   * @protected
   */
  _clearTimeout(id) {
    if (id == null) return;
    clearTimeout(id);
    this._activeTimers.delete(id);
  }

  /**
   * Annule tous les timers actifs. Appelé automatiquement par destroy().
   * @private
   */
  _clearAllTimers() {
    for (const id of this._activeTimers) {
      clearTimeout(id);
    }
    this._activeTimers.clear();
  }
}
