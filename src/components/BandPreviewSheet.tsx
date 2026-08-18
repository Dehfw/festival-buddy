'use client';

import { useEffect, useId, useMemo, useRef } from 'react';
import { useApp } from '@/lib/client/store';
import { useModalDialog } from '@/lib/client/useModalDialog';
import { useSheetDrag } from '@/lib/client/useSheetDrag';
import { useSheetHistory } from '@/lib/client/useSheetHistory';
import {
  bandInterestUsers,
  formatTime,
  slotsForBand,
  type FestivalBand,
  type Slot,
} from '@/lib/types';
import { Avatar } from './Avatars';
import { SpotifyLink } from './SpotifyLink';

/**
 * Bottom-Sheet einer Band aus der Lineup-Ansicht: reinhören, merken und
 * sehen, wer aus der Crew sie auch sehen will – alles schon ohne
 * Timetable. Steht die Running Order, führt das Sheet zusätzlich zu den
 * Slots der Band, wo dann die verbindliche Zusage passiert.
 */
export function BandPreviewSheet({
  band,
  onClose,
  onSlotTap,
}: {
  band: FestivalBand;
  onClose: () => void;
  onSlotTap: (slot: Slot) => void;
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
  const slots = useMemo(
    () => (data ? slotsForBand(data.timetable, band.slug) : []),
    [data, band.slug]
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
            {slots.length > 0 ? 'Im Timetable' : 'Announced'}
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
        {slots.length === 0 && (
          <p className="mt-1 text-[11px] text-ash/70">
            Spielzeit steht noch nicht fest – kommt mit dem Timetable
          </p>
        )}

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

        {slots.length > 0 && (
          <div className="mt-5">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-ash">
              {slots.length === 1 ? 'Spielzeit' : 'Spielzeiten'}
            </div>
            <ul className="space-y-2">
              {slots.map((slot) => {
                const day = data.timetable.days.find((d) => d.id === slot.dayId);
                const stage = data.timetable.stages.find((s) => s.id === slot.stageId);
                return (
                  <li key={slot.id}>
                    <button
                      type="button"
                      onClick={() => onSlotTap(slot)}
                      className="flex w-full items-center gap-3 rounded-xl border border-rivet bg-steel-2 px-3 py-2.5 text-left transition active:scale-[0.99]"
                    >
                      <span
                        className="rounded px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-black"
                        style={{ backgroundColor: stage?.color ?? '#666' }}
                      >
                        {stage?.short ?? '?'}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {day?.longLabel ?? slot.dayId} · {formatTime(slot.start)}–
                        {formatTime(slot.end)} Uhr
                      </span>
                      <span className="shrink-0 text-xs font-bold text-blood">
                        Eintragen ›
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
