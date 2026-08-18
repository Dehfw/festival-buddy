'use client';

function SpotifyIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="currentColor" aria-hidden>
      <path d="M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12 12-5.37 12-12S18.63 0 12 0zm5.5 17.3c-.22.36-.68.47-1.04.25-2.85-1.74-6.44-2.13-10.66-1.17-.41.1-.82-.16-.91-.57-.1-.41.16-.82.57-.91 4.62-1.06 8.59-.6 11.79 1.36.36.22.47.68.25 1.04zm1.47-3.27c-.28.45-.86.59-1.31.31-3.26-2-8.23-2.58-12.09-1.41-.5.15-1.04-.13-1.19-.64-.15-.5.13-1.04.64-1.19 4.41-1.34 9.89-.69 13.64 1.62.45.28.59.86.31 1.31zm.13-3.41C15.24 8.3 8.82 8.08 5.09 9.21c-.6.18-1.24-.16-1.42-.76-.18-.6.16-1.24.76-1.42 4.28-1.3 11.39-1.05 15.9 1.63.54.32.72 1.02.4 1.56-.32.54-1.02.72-1.56.4z" />
    </svg>
  );
}

/**
 * „Auf Spotify anhören" – der Link zum Artist-Profil, den Band-Sheet und
 * Lineup-Sheet teilen. Ohne hinterlegte Artist-ID gibt es keinen Button
 * (nicht jede Band hat ein Profil, siehe scripts/spotify-ids.mjs).
 *
 * Bewusst ein Link und kein eingebetteter Player: Ein iframe würde die
 * Content-Security-Policy in next.config.mjs öffnen müssen.
 */
export function SpotifyLink({ artistId }: { artistId?: string }) {
  if (!artistId) return null;
  return (
    <a
      href={`https://open.spotify.com/artist/${artistId}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-full bg-[#1DB954] px-4 py-2 text-sm font-bold text-black transition active:scale-[0.97]"
    >
      <SpotifyIcon />
      Auf Spotify anhören
    </a>
  );
}
