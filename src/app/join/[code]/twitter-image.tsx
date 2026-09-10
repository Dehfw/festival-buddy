/**
 * twitter:image = og:image – gleiche Karte mit Gruppenname und Festival,
 * damit auch X/Twitter (und alles, was nur Twitter-Cards liest) die
 * Einladung korrekt anzeigt. (runtime wird bewusst nicht re-exportiert –
 * Next kann re-exportierte Config-Felder nicht statisch lesen und warnt
 * sonst beim Build; der Default ist ohnehin nodejs.)
 */
export { default, size, contentType, alt } from './opengraph-image';
