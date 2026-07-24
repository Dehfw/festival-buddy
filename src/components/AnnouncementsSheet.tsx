'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useApp } from '@/lib/client/store';
import { useModalDialog } from '@/lib/client/useModalDialog';
import { useSheetHistory } from '@/lib/client/useSheetHistory';
import { formatAgo } from '@/lib/types';

/**
 * Glocke im App-Header + Bottom-Sheet mit den Mitteilungen (Veranstalter-
 * Durchsagen des Festivals und app-weite Betreiber-Nachrichten). Die Daten
 * kommen aus dem normalen /api/data-Payload – auch Nutzer ohne Push sehen
 * hier alles, offline inklusive (SW-Cache).
 *
 * Gelesen-Status bewusst nur in localStorage (neuester gesehener
 * createdAt-Stempel): kein Server-Roundtrip, gut genug für einen Badge.
 */

const SEEN_KEY = 'fb.annSeen.v1';

export function AnnouncementsBell() {
  const { data } = useApp();
  const [open, setOpen] = useState(false);
  const [seenAt, setSeenAt] = useState('');

  useEffect(() => {
    setSeenAt(localStorage.getItem(SEEN_KEY) || '');
  }, []);

  // Deep-Link aus der Push-Notification: /app?announcement=<id> öffnet das
  // Sheet; der Param verschwindet danach aus der URL.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.get('announcement')) return;
    setOpen(true);
    url.searchParams.delete('announcement');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  }, []);

  const announcements = data?.announcements ?? [];
  const newest = announcements[0]?.createdAt ?? '';
  const unread = Boolean(newest && newest > seenAt);

  // Öffnen = alles gesehen (ISO-Strings sortieren lexikografisch korrekt)
  useEffect(() => {
    if (!open || !newest || newest <= seenAt) return;
    localStorage.setItem(SEEN_KEY, newest);
    setSeenAt(newest);
  }, [open, newest, seenAt]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Mitteilungen"
        aria-label={unread ? 'Mitteilungen – neue vorhanden' : 'Mitteilungen'}
        className="relative flex h-8 w-8 items-center justify-center rounded-full border border-rivet bg-steel-2 text-base transition active:scale-[0.97]"
      >
        <span aria-hidden>🔔</span>
        {unread && (
          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-blood shadow-[0_0_6px_#ff5a17]" />
        )}
      </button>
      {open && <AnnouncementsSheet onClose={() => setOpen(false)} />}
    </>
  );
}

function AnnouncementsSheet({ onClose }: { onClose: () => void }) {
  const { data } = useApp();
  const sheetRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Android-Back-Button schließt das Sheet statt die PWA
  useSheetHistory(onCloseRef);

  useModalDialog({
    onClose,
    dialogRef: sheetRef,
    containerRef: overlayRef,
    initialFocusRef: titleRef,
    enabled: true,
  });

  const announcements = data?.announcements ?? [];

  return (
    <div ref={overlayRef} className="fixed inset-0 z-50 flex items-end justify-center">
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
        <div className="mb-3 flex items-center gap-2">
          <h2
            ref={titleRef}
            id={titleId}
            tabIndex={-1}
            className="font-metal text-2xl font-black leading-tight outline-none"
          >
            Mitteilungen
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-rivet bg-steel-2 text-sm text-ash transition active:scale-[0.97]"
          >
            ✕
          </button>
        </div>

        {announcements.length === 0 ? (
          <p className="pb-6 text-sm text-ash">
            Noch keine Mitteilungen – Durchsagen vom Festival landen hier.
          </p>
        ) : (
          <ul className="flex flex-col gap-3 pb-2">
            {announcements.map((a) => (
              <li key={a.id} className="rounded-xl border border-rivet bg-steel-2 p-3.5">
                <div className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 text-sm font-bold text-bone">
                    {a.title}
                  </span>
                  <span className="shrink-0 text-[10px] text-ash/70">
                    {formatAgo(a.createdAt)}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-ash">
                  {a.body}
                </p>
                {a.festivalId === null && (
                  <span className="mt-2 inline-block rounded-full bg-rivet px-2 py-0.5 text-[10px] font-bold text-ash">
                    Festival Buddy Team
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
