'use client';

function BagIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4H6z" />
      <path d="M3 6h18" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
}

/**
 * „Merch der Band" – Link in den Webshop der Band, den Band-Sheet und
 * Lineup-Sheet teilen. Ohne hinterlegten Shop gibt es keinen Button; die
 * URLs pflegt der Betreiber per `npm run merch` (Tabelle band_merch,
 * siehe getTimetable in src/lib/db.ts).
 *
 * Bewusst als Outline-Button und nicht in Vollorange: Im Band-Sheet ist
 * „Ich bin dabei!" die Hauptaktion, der Shop darf ihr nicht die Aufmerk-
 * samkeit klauen.
 */
export function MerchLink({ url }: { url?: string }) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="inline-flex items-center gap-2 rounded-full border border-blood/50 bg-blood/10 px-4 py-2 text-sm font-bold text-blood transition active:scale-[0.97]"
    >
      <BagIcon />
      Merch der Band
    </a>
  );
}
