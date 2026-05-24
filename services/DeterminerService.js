/**
 * services/DeterminerService.js
 *
 * Service stateless qui décore un nom avec un déterminant (a/an/the/my/your/
 * this/that...) en gardant la cohérence EN ↔ FR.
 *
 * ─────────────────────────────────────────────────────────────────────
 * CONCEPTS
 * ─────────────────────────────────────────────────────────────────────
 *
 * Une stratégie = une façon de décorer un nom. Cinq stratégies :
 *   - 'a_an'         : a mother / une mère ; an apple / une pomme
 *   - 'the'          : the mother / la mère
 *   - 'possessive'   : my/your/his/her/our/their mother / ma/ta/sa/notre/leur mère
 *   - 'demonstrative': this/that/these/those mother(s) / cette/ces mère(s)
 *   - 'none'         : mother / mère (sans déterminant)
 *
 * Chaque stratégie peut prendre un paramètre fin (ex: 'possessive' avec
 * person='my' force "my mother"). Sans paramètre, le service choisit au
 * hasard la sous-variante.
 *
 * ─────────────────────────────────────────────────────────────────────
 * COMPATIBILITÉ NOMS ↔ STRATÉGIES
 * ─────────────────────────────────────────────────────────────────────
 *
 *   - count       : toutes les stratégies sont applicables
 *   - uncount     : pas de 'a_an' (on ne dit pas "a hair"), pas de
 *                   demonstrative pluriel. Le reste OK.
 *   - plural_only : pas de 'a_an' (on ne dit pas "a parents"), pas de
 *                   demonstrative singulier. The/possessive/none OK.
 *
 * Si une stratégie demandée n'est pas compatible, le service fallback
 * sur une stratégie compatible (ordre de préférence : possessive → the
 * → none).
 *
 * ─────────────────────────────────────────────────────────────────────
 * PONDÉRATION DE TIRAGE
 * ─────────────────────────────────────────────────────────────────────
 *
 * Quand le SessionComposer appelle pickStrategy() sans imposer de
 * stratégie, le service tire au hasard selon une pondération.
 *
 * Pondération par défaut (cf. discussion Gauthier 17/05) :
 *   - 'a_an'         : 40%
 *   - 'the'          : 20%
 *   - 'possessive'   : 25%
 *   - 'demonstrative': 15%
 *   - 'none'         :  0% (utilisé uniquement quand explicite)
 *
 * Note : 'an' n'est PAS dans le tirage. Il sort automatiquement quand
 * on a tiré 'a_an' et que le nom commence par voyelle. C'est mécanique.
 *
 * ─────────────────────────────────────────────────────────────────────
 * USAGE
 * ─────────────────────────────────────────────────────────────────────
 *
 *   import { determinerService } from './DeterminerService.js';
 *
 *   // Décorer un nom avec une stratégie précise
 *   const word = { en_base: 'mother', fr_base: 'mère', fr_gender: 'f',
 *                  fr_starts_vowel: false, en_starts_vowel: false,
 *                  en_countability: 'count' };
 *   determinerService.decorate(word, 'a_an');
 *   // → { en: 'a mother', fr: 'une mère', strategy: 'a_an', detail: 'a/une' }
 *
 *   determinerService.decorate(word, 'possessive', {person: 'my'});
 *   // → { en: 'my mother', fr: 'ma mère', strategy: 'possessive', detail: 'my' }
 *
 *   // Laisser le service choisir une stratégie pondérée
 *   const strat = determinerService.pickStrategy(word);
 *   determinerService.decorate(word, strat);
 */

const FR_POSSESSIVE = {
  // Pour chaque possesseur EN, on a les formes FR selon (genre, voyelle, nombre)
  my: {
    sg: { m: 'mon', f: 'ma', vowel: 'mon' },  // mon ami(e) même au féminin
    pl: 'mes',
  },
  your: {
    sg: { m: 'ton', f: 'ta', vowel: 'ton' },
    pl: 'tes',
  },
  his: {
    sg: { m: 'son', f: 'sa', vowel: 'son' },
    pl: 'ses',
  },
  her: {
    sg: { m: 'son', f: 'sa', vowel: 'son' },
    pl: 'ses',
  },
  our: {
    sg: { m: 'notre', f: 'notre', vowel: 'notre' },
    pl: 'nos',
  },
  their: {
    sg: { m: 'leur', f: 'leur', vowel: 'leur' },
    pl: 'leurs',
  },
};

const FR_DEMONSTRATIVE = {
  this: { m: 'ce', f: 'cette', vowel_m: 'cet' },   // ce livre, cette table, cet ami
  that: { m: 'ce', f: 'cette', vowel_m: 'cet' },   // FR ne distingue pas this/that
  these: 'ces',
  those: 'ces',
};

const FR_DEFINITE = {
  // the → le/la/l'/les selon genre + voyelle + nombre
  sg: { m: 'le', f: 'la', vowel: "l'" },
  pl: 'les',
};

const FR_INDEFINITE = {
  // a/an → un/une selon genre
  m: 'un',
  f: 'une',
};

// Pondération par défaut du tirage de stratégie
const DEFAULT_WEIGHTS = {
  a_an: 40,
  the: 20,
  possessive: 25,
  demonstrative: 15,
  none: 0,  // jamais tiré, utilisable seulement en explicite
};

// Compatibilité stratégie ↔ countability
function isCompatible(strategy, countability) {
  // no_det : noms qui ne prennent JAMAIS de déterminant (jours, mois, midi/minuit)
  // → seule la stratégie 'none' est compatible
  if (countability === 'no_det') {
    return strategy === 'none';
  }
  if (strategy === 'a_an') {
    return countability === 'count';
  }
  // the/possessive/demonstrative/none acceptent count, uncount, plural_only
  return true;
}

// Ordre de préférence du fallback selon la countability
function getFallbackStrategy(countability) {
  if (countability === 'no_det') return 'none';
  // count, uncount, plural_only : fallback vers possessive (toujours utilisable)
  return 'possessive';
}

function tirageWeighted(weights) {
  const entries = Object.entries(weights).filter(([_, w]) => w > 0);
  const total = entries.reduce((s, [_, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [key, w] of entries) {
    r -= w;
    if (r <= 0) return key;
  }
  return entries[entries.length - 1][0];
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export class DeterminerService {
  constructor(weights = DEFAULT_WEIGHTS) {
    this.weights = { ...weights };
  }

  setWeights(weights) {
    this.weights = { ...weights };
  }

  /**
   * Choisit une stratégie de décoration pour un nom donné.
   * Respecte la pondération + filtre selon countability.
   *
   * @param {Object} word - mot normalisé (champs en_countability requis)
   * @returns {string} la stratégie choisie ('a_an', 'the', etc.)
   */
  pickStrategy(word) {
    const countability = word.en_countability || 'count';
    // Cas spécial : no_det → la seule option est 'none', pas de tirage à faire
    if (countability === 'no_det') {
      return 'none';
    }
    // Filtre des stratégies compatibles
    const compatibleWeights = {};
    for (const [strat, w] of Object.entries(this.weights)) {
      if (isCompatible(strat, countability) && w > 0) {
        compatibleWeights[strat] = w;
      }
    }
    // Si aucune stratégie pondérée n'est compatible, fallback
    if (Object.keys(compatibleWeights).length === 0) {
      return getFallbackStrategy(countability);
    }
    return tirageWeighted(compatibleWeights);
  }

  /**
   * Décore un nom avec une stratégie donnée.
   *
   * @param {Object} word - mot normalisé
   * @param {string} strategy - 'a_an' | 'the' | 'possessive' | 'demonstrative' | 'none'
   * @param {Object} [options]
   * @param {string} [options.person] - pour 'possessive' : 'my'|'your'|'his'|'her'|'our'|'their'
   * @param {string} [options.demo] - pour 'demonstrative' : 'this'|'that'|'these'|'those'
   * @returns {{en:string, fr:string, strategy:string, detail:string}}
   */
  decorate(word, strategy, options = {}) {
    // Si pas compatible, fallback contextuel
    const countability = word.en_countability || 'count';
    if (!isCompatible(strategy, countability)) {
      strategy = getFallbackStrategy(countability);
    }

    switch (strategy) {
      case 'a_an':
        return this._decorateAAn(word);
      case 'the':
        return this._decorateThe(word);
      case 'possessive':
        return this._decoratePossessive(word, options.person);
      case 'demonstrative':
        return this._decorateDemonstrative(word, options.demo);
      case 'none':
        return this._decorateNone(word);
      default:
        throw new Error(`Stratégie inconnue : ${strategy}`);
    }
  }

  _decorateAAn(word) {
    const det_en = word.en_starts_vowel ? 'an' : 'a';
    const det_fr = FR_INDEFINITE[word.fr_gender] || 'un';
    return {
      en: `${det_en} ${word.en_base}`,
      fr: `${det_fr} ${word.fr_base}`,
      strategy: 'a_an',
      detail: `${det_en}/${det_fr}`,
    };
  }

  _decorateThe(word) {
    const det_en = 'the';
    let det_fr;
    // Le pluriel FR est piloté par fr_number (indépendant de en_countability)
    const isFrPlural = (word.fr_number === 'pl');
    if (isFrPlural) {
      det_fr = FR_DEFINITE.pl;
    } else if (word.fr_starts_vowel) {
      det_fr = FR_DEFINITE.sg.vowel;
    } else {
      det_fr = FR_DEFINITE.sg[word.fr_gender] || FR_DEFINITE.sg.m;
    }
    // Élision : "l'" doit coller au mot sans espace
    const fr_form = det_fr === "l'" ? `l'${word.fr_base}` : `${det_fr} ${word.fr_base}`;
    return {
      en: `${det_en} ${word.en_base}`,
      fr: fr_form,
      strategy: 'the',
      detail: `the/${det_fr}`,
    };
  }

  _decoratePossessive(word, person) {
    // Si person non précisé : tirage aléatoire parmi les 6
    if (!person) {
      person = pickRandom(['my', 'your', 'his', 'her', 'our', 'their']);
    }
    const fr_table = FR_POSSESSIVE[person];
    let det_fr;
    // Pluriel FR piloté par fr_number
    const isFrPlural = (word.fr_number === 'pl');
    if (isFrPlural) {
      det_fr = fr_table.pl;
    } else if (word.fr_starts_vowel) {
      det_fr = fr_table.sg.vowel;
    } else {
      det_fr = fr_table.sg[word.fr_gender] || fr_table.sg.m;
    }
    return {
      en: `${person} ${word.en_base}`,
      fr: `${det_fr} ${word.fr_base}`,
      strategy: 'possessive',
      detail: `${person}/${det_fr}`,
    };
  }

  _decorateDemonstrative(word, demo) {
    // Cohérence EN : si l'EN est plural_only, on doit utiliser these/those
    const isEnPlural = (word.en_countability === 'plural_only');
    const isFrPlural = (word.fr_number === 'pl');
    // Si demo non précisé : tirage cohérent avec la countability EN
    if (!demo) {
      const choices = isEnPlural ? ['these', 'those'] : ['this', 'that'];
      demo = pickRandom(choices);
    }
    let det_fr;
    // Cas EN pluriel ou FR pluriel → ces
    if (demo === 'these' || demo === 'those' || isFrPlural) {
      det_fr = 'ces';
    } else {
      const table = FR_DEMONSTRATIVE[demo];
      if (word.fr_gender === 'm' && word.fr_starts_vowel) {
        det_fr = table.vowel_m;  // 'cet'
      } else {
        det_fr = table[word.fr_gender] || table.m;
      }
    }
    return {
      en: `${demo} ${word.en_base}`,
      fr: `${det_fr} ${word.fr_base}`,
      strategy: 'demonstrative',
      detail: `${demo}/${det_fr}`,
    };
  }

  _decorateNone(word) {
    return {
      en: word.en_base,
      fr: word.fr_base,
      strategy: 'none',
      detail: 'nu',
    };
  }
}

// Singleton exporté
export const determinerService = new DeterminerService();
