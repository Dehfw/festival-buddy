'use client';

import { useEffect, useId, useMemo, useRef } from 'react';
import { useApp } from '@/lib/client/store';
import { useModalDialog } from '@/lib/client/useModalDialog';
import { useSheetDrag } from '@/lib/client/useSheetDrag';
import { useSheetHistory } from '@/lib/client/useSheetHistory';
import { bandInterestUsers, type FestivalBand } from '@/lib/types';
import { Avatar } from './Avatars';
import { SpotifyLink } from './SpotifyLink';

/**
 * Bottom-Sheet einer Band aus der Lineup-Ansicht: reinhören, merken und
 * sehen, wer aus der Crew sie auch sehen will – alles schon ohne
 * Timetable. Spielzeiten kann es hier nicht geben: Die Lineup-Ansicht ist
 * genau die Zeit davor, mit der Running Order verschwindet sie. Die
 * verbindliche Zusage passiert dann im Band-Sheet am Slot.
 */
export function BandPreviewSheet({
  band,
  onClose,
}: {
  band: FestivalBand;
  onClose: () => void;
}) {
  const { data, user, setBandInterest } = useApp();
  const sheetRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Android-Back schließt das Sheet statt die App (wie im Band-Sheet)
  useSheetHistory(onCloseRef);
  useModalDialog({
    onClose,
    dialogRef: sheetRef,
    containerRef: overlayRef,
    initialFocusRef: titleRef,
    enabled: !!data,
  });
  useSheetDrag(sheetRef, onCloseRef, !!data);

  const fans = useMemo(
    () => bandInterestUsers(data?.users ?? [], data?.bandInterests ?? [], band.slug),
    [data?.users, data?.bandInterests, band.slug]
  );

  if (!data) return null;

  const mine = !!user && fans.some((f) => f.id === user.id);

  return (
    <div ref={overlayRef} className="fixed inset-0 z-50 flex items-end justify-center">
      <div aria-hidden="true" className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative max-h-[88dvh] w-full max-w-lg touch-pan-y overflow-y-auto overscroll-contain rounded-t-2xl border-t border-x border-rivet bg-steel px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 shadow-2xl"
      >
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-rivet" />

        <div className="mb-1 flex items-center gap-2">
          <span className="rounded bg-rivet px-2 py-0.5 text-xs font-black uppercase tracking-wider text-bone">
            Announced
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-rivet bg-steel-2 text-sm text-ash transition active:scale-[0.97]"
          >
            ✕
          </button>
        </div>
        <h2
          ref={titleRef}
          id={titleId}
          tabIndex={-1}
          className="font-metal text-2xl font-black leading-tight outline-none"
        >
          {band.name}
        </h2>
        <p className="mt-1 text-[11px] text-ash/70">
          Spielzeit steht noch nicht fest – kommt mit dem Timetable
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <SpotifyLink artistId={band.spotifyArtistId} />
          <button
            type="button"
            onClick={() => setBandInterest(band.slug, !mine)}
            aria-pressed={mine}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold transition active:scale-[0.97] ${
              mine
                ? 'border-ember bg-ember/15 text-ember'
                : 'border-rivet bg-steel-2 text-bone'
            }`}
          >
            {mine ? '🔖 Gemerkt' : '🔖 Merken'}
          </button>
        </div>
        {!band.spotifyArtistId && (
          <p className="mt-2 text-[11px] text-ash/70">
            Für diese Band ist kein Spotify-Profil hinterlegt.
          </p>
        )}

        <div className="mt-5">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-ash">
            Will die Crew sehen ({fans.length})
          </div>
          {fans.length === 0 ? (
            <p className="text-sm text-ash/70">
              Noch niemand aus der Crew – sei die/der Erste! 🤘
            </p>
          ) : (
            <ul className="space-y-2">
              {fans.map((f) => (
                <li key={f.id} className="flex items-center gap-2.5 text-sm">
                  <Avatar user={f} size={26} />
                  <span className="font-medium">{f.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
