'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useApp } from '@/lib/client/store';
import { useModalDialog } from '@/lib/client/useModalDialog';
import {
  DEFAULT_HOT_THRESHOLD,
  formatAgo,
  formatTime,
  isHotSlot,
  isStalePosition,
  splitAttendees,
  type Slot,
} from '@/lib/types';
import { Avatar } from './Avatars';
import { StageMap, type MapMarker } from './StageMap';

function SpotifyIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="currentColor" aria-hidden>
      <path d="M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12 12-5.37 12-12S18.63 0 12 0zm5.5 17.3c-.22.36-.68.47-1.04.25-2.85-1.74-6.44-2.13-10.66-1.17-.41.1-.82-.16-.91-.57-.1-.41.16-.82.57-.91 4.62-1.06 8.59-.6 11.79 1.36.36.22.47.68.25 1.04zm1.47-3.27c-.28.45-.86.59-1.31.31-3.26-2-8.23-2.58-12.09-1.41-.5.15-1.04-.13-1.19-.64-.15-.5.13-1.04.64-1.19 4.41-1.34 9.89-.69 13.64 1.62.45.28.59.86.31 1.31zm.13-3.41C15.24 8.3 8.82 8.08 5.09 9.21c-.6.18-1.24-.16-1.42-.76-.18-.6.16-1.24.76-1.42 4.28-1.3 11.39-1.05 15.9 1.63.54.32.72 1.02.4 1.56-.32.54-1.02.72-1.56.4z" />
    </svg>
  );
}

/**
 * Bottom-Sheet mit Band-Details: Wer kommt mit? Eintragen/Austragen,
 * Spotify-Link und Position im Publikum auf dem Bühnen-Blueprint markieren.
 */
export function BandSheet({ slot, onClose }: { slot: Slot; onClose: () => void }) {
  const { data, user, setSelection, setPosition } = useApp();
  const [mapMode, setMapMode] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();

  // onClose in einer Ref halten, damit die Effekte unten nicht bei jedem
  // Render neu registriert werden (onClose kommt als Inline-Arrow rein).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Android-Back-Button: beim Öffnen einen History-Eintrag pushen, sodass
  // "Zurück" das Sheet schließt statt die (PWA-)App zu beenden.
  useEffect(() => {
    window.history.pushState({ bandSheet: true }, '');
    let closedByPop = false;
    const onPop = () => {
      closedByPop = true;
      onCloseRef.current();
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      // Wurde das Sheet anders geschlossen (Backdrop, Swipe), den
      // gepushten Eintrag wieder entfernen.
      if (!closedByPop) window.history.back();
    };
  }, []);

  // Sheet gilt als gerendert, sobald die Slot-Daten vorhanden sind.
  const rendered = !!(data && data.timetable.stages.some((s) => s.id === slot.stageId));

  // Modales Dialog-Verhalten: Fokus in das Sheet (auf den Bandtitel),
  // Focus Trap, Escape schließt, Hintergrund inert, Fokus zurück zum
  // auslösenden Slot. Der Backdrop bleibt für Pointer klickbar.
  useModalDialog({
    onClose,
    dialogRef: sheetRef,
    containerRef: overlayRef,
    initialFocusRef: titleRef,
    enabled: rendered,
  });

  // Swipe-down zum Schließen: Sheet folgt dem Finger, ab genug Weg oder
  // Geschwindigkeit wird geschlossen, sonst schnappt es zurück.
  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    let startY = 0;
    let lastY = 0;
    let lastT = 0;
    let velocity = 0; // px/ms
    let offset = 0;
    let tracking = false;
    let dragging = false;

    const settle = (transform: string) => {
      el.style.transition = 'transform 0.2s ease';
      el.style.transform = transform;
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      tracking = true;
      dragging = false;
      startY = lastY = e.touches[0].clientY;
      lastT = e.timeStamp;
      velocity = 0;
      offset = 0;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!tracking) return;
      const y = e.touches[0].clientY;
      const dy = y - startY;
      if (!dragging) {
        // Erst ziehen, wenn klar nach unten gewischt wird und der Inhalt
        // ganz oben steht – sonst normales Scrollen zulassen.
        if (dy > 10 && el.scrollTop <= 0) {
          dragging = true;
          startY = y;
          el.style.transition = 'none';
        } else if (dy < -10 || el.scrollTop > 0) {
          tracking = false;
          return;
        } else {
          return;
        }
      }
      e.preventDefault();
      const dt = e.timeStamp - lastT;
      if (dt > 0) velocity = (y - lastY) / dt;
      lastY = y;
      lastT = e.timeStamp;
      offset = Math.max(0, y - startY);
      el.style.transform = `translateY(${offset}px)`;
    };

    const onTouchEnd = () => {
      tracking = false;
      if (!dragging) return;
      dragging = false;
      if (offset > 96 || velocity > 0.5) {
        settle('translateY(105%)');
        setTimeout(() => onCloseRef.current(), 180);
      } else {
        settle('');
      }
    };

    const onTouchCancel = () => {
      tracking = false;
      if (!dragging) return;
      dragging = false;
      settle('');
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    // passive: false, damit preventDefault() das Scrollen/Pull-to-Refresh
    // während des Ziehens unterbindet.
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchCancel);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchCancel);
    };
  }, [rendered]);

  const stage = data?.timetable.stages.find((s) => s.id === slot.stageId);
  const day = data?.timetable.days.find((d) => d.id === slot.dayId);
  const blueprint = data?.blueprints[slot.stageId];

  const { going, interested } = useMemo(
    () =>
      data
        ? splitAttendees(data.users, data.selections, slot.id)
        : { going: [], interested: [] },
    [data, slot.id]
  );

  const iGo = !!user && going.some((a) => a.id === user.id);
  const iAmInterested = !!user && interested.some((a) => a.id === user.id);
  const hot = isHotSlot(
    going.length,
    data?.group?.hotThreshold ?? DEFAULT_HOT_THRESHOLD
  );
  const myPosition = data?.positions.find(
    (p) => p.slotId === slot.id && p.userId === user?.id
  );

  const markers: MapMarker[] = useMemo(() => {
    if (!data) return [];
    const out: MapMarker[] = [];
    for (const p of data.positions) {
      if (p.slotId !== slot.id) continue;
      const u = data.users.find((x) => x.id === p.userId);
      if (u)
        out.push({
          user: u,
          x: p.x,
          y: p.y,
          mine: u.id === user?.id,
          agoLabel: p.updatedAt ? formatAgo(p.updatedAt) : undefined,
          stale: isStalePosition(p.updatedAt),
        });
    }
    return out;
  }, [data, slot.id, user?.id]);

  if (!data || !stage || !day) return null;

  return (
    <div ref={overlayRef} className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop: reines Pointer-Ziel – Tastatur schließt per Escape,
          Screenreader über den sichtbaren Schließen-Button im Sheet. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative max-h-[88dvh] w-full max-w-lg touch-pan-y overflow-y-auto overscroll-contain rounded-t-2xl border-t border-x border-rivet bg-steel px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 shadow-2xl"
      >
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-rivet" />

        <div className="mb-1 flex items-center gap-2">
          <span
            className="rounded px-2 py-0.5 text-xs font-black uppercase tracking-wider text-black"
            style={{ backgroundColor: stage.color }}
          >
            {stage.name}
          </span>
          <span className="text-xs text-ash">
            {day.longLabel} · {formatTime(slot.start)}–{formatTime(slot.end)} Uhr
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
          {slot.band}
        </h2>
        {!slot.confirmed && (
          <p className="mt-1 text-[11px] text-ash/70">
            Slot unbestätigt – Zeiten können sich ändern
          </p>
        )}
        {slot.spotifyArtistId && (
          <a
            href={`https://open.spotify.com/artist/${slot.spotifyArtistId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#1DB954] px-4 py-2 text-sm font-bold text-black transition active:scale-[0.97]"
          >
            <SpotifyIcon />
            Auf Spotify anhören
          </a>
        )}

        {!mapMode && (
          <>
            <div className="mt-5">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ash">
                <span>Dabei ({going.length})</span>
                {hot && (
                  <span className="rounded-full bg-blood/20 px-2 py-0.5 text-[10px] font-black normal-case tracking-normal text-blood">
                    🔥 Hot Slot
                  </span>
                )}
              </div>
              {going.length === 0 ? (
                <p className="text-sm text-ash/70">
                  Noch niemand fest eingetragen – sei die/der Erste! 🤘
                </p>
              ) : (
                <ul className="space-y-2">
                  {going.map((a) => {
                    const pos = data.positions.find(
                      (p) => p.slotId === slot.id && p.userId === a.id
                    );
                    return (
                      <li key={a.id} className="flex items-center gap-2.5 text-sm">
                        <Avatar user={a} size={26} />
                        <span className="font-medium">{a.name}</span>
                        {pos && (
                          <span
                            className={`text-xs ${
                              isStalePosition(pos.updatedAt)
                                ? 'text-ash/50'
                                : 'text-ash'
                            }`}
                          >
                            📍 {pos.updatedAt ? formatAgo(pos.updatedAt) : 'Position markiert'}
                            {isStalePosition(pos.updatedAt) && ' – evtl. weitergezogen'}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {interested.length > 0 && (
                <>
                  <div className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wider text-ash">
                    Interessiert ({interested.length})
                  </div>
                  <ul className="space-y-2">
                    {interested.map((a) => (
                      <li
                        key={a.id}
                        className="flex items-center gap-2.5 text-sm opacity-70"
                      >
                        <Avatar user={a} size={26} />
                        <span className="font-medium">{a.name}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            <div className="mt-6 space-y-2.5">
              <button
                onClick={() => setSelection(slot.id, iGo ? null : 'going')}
                className={`w-full rounded-xl px-4 py-3.5 font-metal text-base uppercase tracking-wide transition active:scale-[0.98] ${
                  iGo
                    ? 'border border-rivet bg-steel-2 text-ash'
                    : 'bg-blood text-black'
                }`}
              >
                {iGo ? 'Doch nicht – austragen' : 'Ich bin dabei!'}
              </button>
              <button
                onClick={() => setSelection(slot.id, iAmInterested ? null : 'interested')}
                className={`w-full rounded-xl px-4 py-3 text-sm font-semibold transition active:scale-[0.98] ${
                  iAmInterested
                    ? 'border border-rivet bg-steel-2 text-ash'
                    : 'border border-dashed border-ember/70 bg-ember/10 text-ember'
                }`}
              >
                {iAmInterested
                  ? 'Interesse zurückziehen'
                  : '🤔 Ich bin interessiert (unverbindlich)'}
              </button>
              {iGo && blueprint && (
                <button
                  onClick={() => setMapMode(true)}
                  className="w-full rounded-xl border border-rivet bg-steel-2 px-4 py-3.5 text-sm font-semibold text-bone transition active:scale-[0.98]"
                >
                  📍 {myPosition ? 'Meine Position ändern' : 'Meine Position im Publikum markieren'}
                </button>
              )}
            </div>
          </>
        )}

        {mapMode && blueprint && (
          <div className="mt-4">
            <p className="mb-2 text-sm text-ash">
              Tippe auf die Karte, um dein <b className="text-bone">X</b> zu setzen –
              deine Crew sieht, wo du stehst.
            </p>
            <StageMap
              blueprint={blueprint}
              stageColor={stage.color}
              markers={markers}
              onTap={(x, y) => setPosition(slot.id, x, y)}
            />
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => setMapMode(false)}
                className="flex-1 rounded-xl bg-blood px-4 py-3 text-sm font-bold text-black active:scale-[0.98]"
              >
                Fertig
              </button>
              {myPosition && (
                <button
                  onClick={() => setPosition(slot.id, null, null)}
                  className="flex-1 rounded-xl border border-rivet bg-steel-2 px-4 py-3 text-sm font-semibold text-ash active:scale-[0.98]"
                >
                  Markierung löschen
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
