/**
 * ui/icons.js
 *
 * Petits SVG inline pour les icônes UI qui doivent s'afficher partout
 * de manière identique — typiquement les drapeaux.
 *
 * POURQUOI SVG INLINE
 * ───────────────────
 * Les emojis drapeaux (🇫🇷, 🇬🇧) ne sont PAS rendus sur Chrome/Edge
 * Windows : le navigateur les affiche comme deux lettres ISO ("FR", "GB").
 * Très visible sur Android, invisible sur Windows. Inacceptable pour
 * une UI qui repose dessus pour communiquer la consigne.
 *
 * Le SVG inline règle ça : rendu identique sur toutes les plateformes,
 * pas de fichier externe à servir, pas de problème de cache ou de 404,
 * stylable via CSS (taille, ombre, etc.).
 *
 * USAGE
 * ─────
 *   import { flag } from '../ui/icons.js';
 *   container.innerHTML = `<div>Traduis en ${flag('fr')}</div>`;
 *
 * Pour ajouter un drapeau : ajouter une entrée dans FLAGS ci-dessous.
 */


// SVG drapeau français : 3 bandes verticales bleu/blanc/rouge.
// Proportions 3:2 (standard officiel). viewBox 0 0 3 2 pour permettre
// n'importe quelle taille via CSS.
const FLAG_FR = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3 2" class="flag flag-fr" aria-label="français" role="img">
  <rect width="1" height="2" x="0" fill="#0055A4"/>
  <rect width="1" height="2" x="1" fill="#FFFFFF"/>
  <rect width="1" height="2" x="2" fill="#EF4135"/>
</svg>`;


// SVG drapeau britannique (Union Jack) : version SIMPLIFIÉE.
// On n'est pas tenu à l'exactitude héraldique — l'objectif est juste
// que l'enfant reconnaisse instantanément le drapeau anglais.
// Proportions 5:3 (standard officiel). Trois croix superposées :
//   1. Fond bleu
//   2. Croix de Saint-André (X blanc puis rouge plus fin)
//   3. Croix de Saint-Georges (+ blanc puis rouge plus fin)
const FLAG_GB = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 36" class="flag flag-gb" aria-label="anglais" role="img">
  <!-- Fond bleu -->
  <rect width="60" height="36" fill="#012169"/>
  <!-- Croix de Saint-André blanche (les deux diagonales) -->
  <path d="M0,0 L60,36 M60,0 L0,36" stroke="#FFFFFF" stroke-width="7.2"/>
  <!-- Croix de Saint-André rouge plus fine, avec masquage par les quartiers -->
  <path d="M0,0 L60,36" stroke="#C8102E" stroke-width="2.4" clip-path="polygon(0 0, 50% 0, 50% 50%, 100% 50%, 100% 100%, 50% 100%, 50% 50%, 0 50%)"/>
  <path d="M60,0 L0,36" stroke="#C8102E" stroke-width="2.4" clip-path="polygon(50% 0, 100% 0, 100% 50%, 50% 50%, 0 50%, 0 100%, 50% 100%, 50% 50%)"/>
  <!-- Croix de Saint-Georges blanche (horizontale + verticale plus large) -->
  <path d="M30,0 V36 M0,18 H60" stroke="#FFFFFF" stroke-width="12"/>
  <!-- Croix de Saint-Georges rouge plus fine -->
  <path d="M30,0 V36 M0,18 H60" stroke="#C8102E" stroke-width="7.2"/>
</svg>`;


const FLAGS = {
  fr: FLAG_FR,
  gb: FLAG_GB,
};


/**
 * Retourne le SVG inline d'un drapeau.
 * @param {string} code - 'fr' ou 'gb'
 * @returns {string} le SVG sous forme de chaîne HTML
 */
export function flag(code) {
  const svg = FLAGS[code];
  if (!svg) {
    console.warn(`[icons] drapeau inconnu : "${code}"`);
    return "";
  }
  return svg;
}
