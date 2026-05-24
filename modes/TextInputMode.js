/**
 * modes/TextInputMode.js
 * 
 * Classe abstraite pour tous les modes basés sur la saisie texte.
 * 
 * Logique commune factorisée :
 *   - Affichage de la prompt (à fournir par les sous-classes via _renderPrompt)
 *   - Champ de saisie + bouton Valider
 *   - Compteur d'essais avec liste des saisies ratées affichées
 *   - Classification des erreurs (typo vs ignorance) via Levenshtein
 *   - Révélation automatique au 3e essai OU sur bouton "J'abandonne"
 *   - Phase de recopie après révélation
 * 
 * Les sous-classes définissent uniquement :
 *   - _getExpected() : ce qu'on attend comme réponse
 *   - _renderPrompt() : ce qu'on affiche en haut (mot anglais, audio, etc.)
 *   - _getLanguage() : "fr" ou "en" pour l'attribut lang du champ
 *   - modeId : identifiant unique du mode
 */

import { BaseEngine } from '../core/BaseEngine.js';
import { compareAnswers, normalize } from '../core/helpers.js';
import { events } from '../core/EventBus.js';
import { flag } from '../ui/icons.js';


// Configuration : seuils
const MAX_ATTEMPTS_BEFORE_REVEAL = 3;  // après N essais ratés, on révèle
const TYPO_DISTANCE_THRESHOLD = 1;     // distance Levenshtein ≤ N = faute de frappe


/**
 * Calcule la distance de Levenshtein entre deux chaînes.
 * Utilisée UNIQUEMENT pour classifier le type d'erreur, jamais pour valider.
 */
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[a.length][b.length];
}


/**
 * Classe abstraite pour les modes de saisie texte.
 */
export class TextInputMode extends BaseEngine {

  constructor(word, options = {}) {
    super(word, options);
    this._failedAttempts = [];   // liste des saisies ratées (pour affichage)
    this._hasFlagged = false;    // true si l'erreur d'ignorance a été détectée
    this._revealed = false;      // true après révélation
    this._completed = false;     // true quand l'exercice est terminé
  }

  // =========================================================================
  // À surcharger par les sous-classes
  // =========================================================================

  /**
   * @returns {string} la réponse attendue (texte exact)
   */
  _getExpected() {
    throw new Error(`${this.constructor.name} doit implémenter _getExpected()`);
  }

  /**
   * Génère le HTML de la prompt (zone supérieure de la carte).
   * @returns {string} HTML
   */
  _renderPrompt() {
    throw new Error(`${this.constructor.name} doit implémenter _renderPrompt()`);
  }

  /**
   * @returns {string} "fr" ou "en"
   */
  _getLanguage() {
    throw new Error(`${this.constructor.name} doit implémenter _getLanguage()`);
  }

  /**
   * Hook optionnel : appelé après _render() pour des actions
   * spécifiques au mode (ex : auto-play audio).
   */
  _onAfterRender() {
    // default: rien
  }

  /**
   * Hook optionnel : appelé après que la révélation a été affichée
   * (passage en phase recopie). Permet aux sous-classes de réagir,
   * par exemple en rejouant l'audio du mot.
   */
  _onAfterReveal() {
    // default: rien
  }

  /**
   * Hook optionnel : appelé juste après la validation d'une réponse correcte
   * (= exercice terminé avec succès), après l'émission de exercise:answered
   * mais AVANT le callback options.onAnswered.
   *
   * Permet aux sous-classes de finaliser l'expérience pédagogique avant que
   * l'orchestrateur n'enchaîne (ex : rejouer l'audio à vitesse normale pour
   * ancrer la prononciation).
   *
   * Note : cet ordre (hook AVANT onAnswered) permet à l'orchestrateur de
   * décider d'attendre un délai avant de passer au mot suivant, sans risquer
   * de couper une animation/audio en cours.
   */
  _onAfterSuccess() {
    // default: rien
  }

  // =========================================================================
  // Logique commune
  // =========================================================================

  _render() {
    // Mapping langue → code drapeau : "fr" → drapeau français, "en" → Union Jack.
    // Cf. BIBLE §11.6 — drapeaux encadrant le champ pour ancrer visuellement
    // la langue de réponse à l'endroit exact où l'enfant va taper.
    const langCode = this._getLanguage();
    const flagCode = langCode === "fr" ? "fr" : "gb";

    this.container.innerHTML = `
      <div class="card">
        ${this._renderPrompt()}
        <div class="text-input-history" data-role="history"></div>
        <div class="text-input-revelation hidden" data-role="revelation"></div>
        <div class="typing-input-row">
          <span class="typing-input-flag">${flag(flagCode)}</span>
          <input type="text"
                 class="typing-input"
                 data-role="input"
                 lang="${langCode}"
                 autocomplete="off"
                 autocorrect="off"
                 autocapitalize="off"
                 spellcheck="false"
                 inputmode="text"
                 data-form-type="other"
                 data-1p-ignore
                 data-lpignore="true" />
          <span class="typing-input-flag">${flag(flagCode)}</span>
        </div>
        <div class="text-input-actions">
          <button class="btn btn-large" data-action="validate">Valider</button>
          <button class="btn-give-up hidden" data-action="give-up">Je donne ma langue au chat</button>
        </div>
      </div>
    `;

    this._inputEl = this.container.querySelector('[data-role="input"]');
    this._validateBtn = this.container.querySelector('[data-action="validate"]');
    this._giveUpBtn = this.container.querySelector('[data-action="give-up"]');
    this._historyEl = this.container.querySelector('[data-role="history"]');
    this._revelationEl = this.container.querySelector('[data-role="revelation"]');

    this._validateBtn.addEventListener('click', () => this._onValidate());
    this._giveUpBtn.addEventListener('click', () => this._onGiveUp());

    this._inputEl.addEventListener('keydown', e => {
      if (e.key === "Enter") this._onValidate();
    });

    this._setTimeout(() => this._inputEl.focus(), 100);

    this._onAfterRender();
  }

  _onValidate() {
    if (this._completed) return;
    const userInput = this._inputEl.value.trim();
    if (!userInput) return;

    if (this._revealed) {
      // Phase recopie : on attend juste la réponse exacte
      this._handleCopyAttempt(userInput);
    } else {
      // Phase essais : on classifie et on gère
      this._handleAttempt(userInput);
    }
  }

  _onGiveUp() {
    if (this._completed || this._revealed) return;
    // Abandon = flag + révélation
    if (!this._hasFlagged) {
      this._hasFlagged = true;
    }
    this._reveal();
  }

  /**
   * Gère un essai pendant la phase d'évaluation (avant révélation).
   */
  _handleAttempt(userInput) {
    const expected = this._getExpected();

    // Vérification 1 : strict via compareAnswers (cosmétique tolérée : casse, accents, articles)
    if (compareAnswers(userInput, expected)) {
      // Réponse correcte
      this._validateAndComplete(userInput, true);
      return;
    }

    // Vérification 2 : classification via Levenshtein sur les chaînes normalisées.
    // On applique la même règle "article requis" que compareAnswers : si la
    // réponse attendue commence par un article fr, on désactive le strip
    // des articles pour la mesure de distance aussi. Sinon "épouse" vs
    // "une épouse" donnerait distance 0 (paradoxe avec compareAnswers).
    const expectedHasArticle = /^(le |la |les |l'|un |une |des |du |de la |de l')/i
      .test((expected || "").trim().toLowerCase());
    const normOpts = { stripArticles: !expectedHasArticle };
    const dist = levenshtein(
      normalize(userInput, normOpts),
      normalize(expected, normOpts)
    );
    const isTypo = dist <= TYPO_DISTANCE_THRESHOLD;

    // Émettre un événement pour le suivi (utile en debug et pour dashboard parent)
    events.emit('text-input:attempt-failed', {
      word: this.word,
      mode: this.constructor.modeId,
      userInput,
      expected,
      distance: dist,
      isTypo,
      attemptNumber: this._failedAttempts.length + 1,
    });

    // Si c'est une erreur d'ignorance et qu'on n'a pas encore flag → flag
    if (!isTypo && !this._hasFlagged) {
      this._hasFlagged = true;
    }

    // Ajouter à l'historique des essais ratés
    this._failedAttempts.push({ text: userInput, isTypo });
    this._renderHistory();

    // Vider le champ et refocus
    this._inputEl.value = "";
    this._inputEl.focus();

    // Afficher le bouton "J'abandonne" dès le 1er essai raté
    this._giveUpBtn.classList.remove('hidden');

    // Vérifier si on doit révéler
    if (this._failedAttempts.length >= MAX_ATTEMPTS_BEFORE_REVEAL) {
      this._reveal();
    }
  }

  /**
   * Gère la saisie pendant la phase de recopie (après révélation).
   */
  _handleCopyAttempt(userInput) {
    const expected = this._getExpected();
    if (compareAnswers(userInput, expected)) {
      // Recopie correcte → on passe
      this._validateAndComplete(userInput, false);
    } else {
      // Recopie fausse : pas de pénalité, juste on redemande
      events.emit('text-input:copy-failed', {
        word: this.word,
        mode: this.constructor.modeId,
        userInput,
      });
      // On flash brièvement le champ rouge sans rien stocker
      this._inputEl.classList.add('wrong');
      this._setTimeout(() => {
        this._inputEl.classList.remove('wrong');
        this._inputEl.value = "";
        this._inputEl.focus();
      }, 600);
    }
  }

  /**
   * Affiche la révélation et passe en phase recopie.
   */
  _reveal() {
    this._revealed = true;
    const expected = this._getExpected();

    events.emit('text-input:revealed', {
      word: this.word,
      mode: this.constructor.modeId,
      attemptsBeforeReveal: this._failedAttempts.length,
    });

    this._revelationEl.innerHTML = `
      <div class="text-input-revelation-label">La réponse :</div>
      <div class="text-input-revelation-answer">${expected}</div>
      <div class="text-input-revelation-hint">Recopie-la pour passer à la suite</div>
    `;
    this._revelationEl.classList.remove('hidden');

    // Cacher le bouton "J'abandonne"
    this._giveUpBtn.classList.add('hidden');

    // Vider le champ et refocus
    this._inputEl.value = "";
    this._inputEl.focus();

    // Hook pour sous-classes (ex : rejouer l'audio à la révélation)
    this._onAfterReveal();
  }

  /**
   * Valide la réponse et termine l'exercice.
   * @param {string} userInput
   * @param {boolean} firstShotSuccess - true si réussi sans tâtonnement
   */
  _validateAndComplete(userInput, firstShotSuccess) {
    this._completed = true;
    this._inputEl.disabled = true;
    this._validateBtn.disabled = true;
    this._giveUpBtn.classList.add('hidden');
    this._inputEl.classList.add('correct');

    // Le mot est marqué comme raté SI on a flag d'ignorance pendant les essais
    // Une succession de typos seules ne flag pas (l'enfant connaît le mot)
    const success = !this._hasFlagged;

    // Émettre l'événement
    events.emit('exercise:answered', {
      word: this.word,
      mode: this.constructor.modeId,
      success,
      userInput,
      expected: this._getExpected(),
      hadFailure: !firstShotSuccess,
      attempts: this._failedAttempts.length + 1,
      revealed: this._revealed,
    });

    // Feedback final
    const fb = document.createElement('div');
    fb.className = 'feedback correct';
    fb.innerHTML = '✓ Bravo !';
    this.container.querySelector('.card').appendChild(fb);

    // Hook pour sous-classes (ex : rejouer l'audio à vitesse normale).
    // Placé AVANT onAnswered pour laisser l'orchestrateur décider du timing
    // d'enchaînement sans couper une animation/audio en cours.
    this._onAfterSuccess();

    if (this.options.onAnswered) {
      this.options.onAnswered(success);
    }
  }

  /**
   * Affiche la liste des essais ratés.
   * Distinction visuelle : rouge pour ignorance, orange pour typo.
   */
  _renderHistory() {
    if (this._failedAttempts.length === 0) {
      this._historyEl.innerHTML = "";
      return;
    }
    this._historyEl.innerHTML = this._failedAttempts.map(att => `
      <div class="text-input-failed-attempt ${att.isTypo ? 'typo' : 'ignorance'}">
        ${this._escapeHtml(att.text)}
      </div>
    `).join("");
  }

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
