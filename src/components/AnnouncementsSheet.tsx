'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useApp } from '@/lib/client/store';
import { useLanguage } from '@/lib/client/i18n';
import { useModalDialog } from '@/lib/client/useModalDialog';
import { useSheetDrag } from '@/lib/client/useSheetDrag';
import { useSheetHistory } from '@/lib/client/useSheetHistory';
import { formatAgo, type Announcement } from '@/lib/types';

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
  const [toast, setToast] = useState<Announcement | null>(null);
  // Neueste Mitteilung beim App-Start – nur was DANACH reinkommt, toastet
  const toastBaselineRef = useRef<string | null>(null);

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

  // Trifft WÄHREND der Nutzung eine neue Mitteilung ein (7s-Polling),
  // blendet oben kurz ein Toast ein – der Punkt an der Glocke allein ist
  // leicht zu übersehen. Beim App-Start wird nicht getoastet (dafür gibt
  // es den Ungelesen-Punkt), bei offenem Sheet auch nicht.
  useEffect(() => {
    if (!newest) return;
    if (toastBaselineRef.current === null) {
      toastBaselineRef.current = newest;
      return;
    }
    if (newest <= toastBaselineRef.current) return;
    toastBaselineRef.current = newest;
    if (!open) setToast(announcements[0] ?? null);
  }, [newest, open, announcements]);

  // Toast nach ein paar Sekunden von selbst ausblenden
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 8000);
    return () => window.clearTimeout(timer);
  }, [toast]);

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
      {toast && !open && (
        <div className="fixed inset-x-3 top-[calc(3.4rem+env(safe-area-inset-top))] z-50 mx-auto max-w-lg">
          <div
            role="status"
            className="flex items-start gap-2.5 rounded-2xl border border-blood/40 bg-steel p-3.5 shadow-2xl shadow-black/60"
          >
            <span className="text-xl leading-none" aria-hidden>
              🔔
            </span>
            <button
              onClick={() => {
                setToast(null);
                setOpen(true);
              }}
              className="min-w-0 flex-1 text-left"
            >
              <span className="block truncate text-sm font-bold text-bone">
                {toast.title}
              </span>
              <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-ash">
                {toast.body}
              </span>
            </button>
            <button
              onClick={() => setToast(null)}
              aria-label="Ausblenden"
              className="-mr-1 -mt-1 p-1 text-ash"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// Mehr macht das Sheet unübersichtlich – ältere Mitteilungen sind auf
// Wunsch per "ältere anzeigen" weiterhin erreichbar.
const MAX_VISIBLE = 10;

function AnnouncementsSheet({ onClose }: { onClose: () => void }) {
  const { data } = useApp();
  const [showOlder, setShowOlder] = useState(false);
  // Angetippte Mitteilung – öffnet das Detail-Popup mit dem vollen Text
  const [detail, setDetail] = useState<Announcement | null>(null);
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

  // Swipe-down zum Schließen – der Griff-Balken oben ist sonst nur Deko
  useSheetDrag(sheetRef, onCloseRef);

  useModalDialog({
    onClose,
    dialogRef: sheetRef,
    containerRef: overlayRef,
    initialFocusRef: titleRef,
    enabled: true,
  });

  const announcements = data?.announcements ?? [];
  // Neueste zuerst (Server-Sortierung): nur die letzten 10 direkt zeigen
  const recent = announcements.slice(0, MAX_VISIBLE);
  const older = announcements.slice(MAX_VISIBLE);

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
            {recent.map((a) => (
              <AnnouncementItem key={a.id} announcement={a} onSelect={() => setDetail(a)} />
            ))}
            {older.length > 0 && !showOlder && (
              <li>
                <button
                  onClick={() => setShowOlder(true)}
                  className="w-full rounded-xl border border-dashed border-rivet px-3 py-2.5 text-sm font-bold text-ash"
                >
                  {older.length === 1
                    ? '1 ältere Mitteilung anzeigen'
                    : `${older.length} ältere Mitteilungen anzeigen`}
                </button>
              </li>
            )}
            {showOlder &&
              older.map((a) => (
                <AnnouncementItem key={a.id} announcement={a} onSelect={() => setDetail(a)} />
              ))}
          </ul>
        )}
      </div>

      {detail && (
        <AnnouncementDetailDialog announcement={detail} onClose={() => setDetail(null)} />
      )}
    </div>
  );
}

// Mehr Zeilen pro Eintrag machen die Liste unüberschaubar – der volle
// Text steht im Detail-Popup (Tippen auf die Karte).
const BODY_CLAMP_CLASS = 'line-clamp-3';

function AnnouncementItem({
  announcement: a,
  onSelect,
}: {
  announcement: Announcement;
  onSelect: () => void;
}) {
  const bodyRef = useRef<HTMLSpanElement>(null);
  const [clamped, setClamped] = useState(false);

  // "Ganze Nachricht lesen" nur zeigen, wenn wirklich etwas abgeschnitten
  // ist – gemessen statt an der Zeichenzahl geraten (Umbrüche!). Der
  // ResizeObserver deckt Breitenänderungen (Rotation) und späte Fonts ab.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const check = () => setClamped(el.scrollHeight > el.clientHeight + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-haspopup="dialog"
        className="w-full rounded-xl border border-rivet bg-steel-2 p-3.5 text-left transition active:scale-[0.99]"
      >
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 text-sm font-bold text-bone">
            {a.title}
          </span>
          <span className="shrink-0 text-[10px] text-ash/70">
            {formatAgo(a.createdAt)}
          </span>
        </span>
        <span
          ref={bodyRef}
          className={`mt-1 block whitespace-pre-line text-xs leading-relaxed text-ash ${BODY_CLAMP_CLASS}`}
        >
          {a.body}
        </span>
        {clamped && (
          <span className="mt-1.5 block text-[11px] font-bold text-blood">
            Ganze Nachricht lesen
          </span>
        )}
        {a.festivalId === null && (
          <span className="mt-2 inline-block rounded-full bg-rivet px-2 py-0.5 text-[10px] font-bold text-ash">
            Festival Buddy Team
          </span>
        )}
      </button>
    </li>
  );
}

/**
 * Zentriertes Popup mit dem vollen Text einer Mitteilung. Liegt als
 * Geschwister ÜBER dem Sheet im selben Overlay: useModalDialog schaltet
 * das Sheet dahinter inert, der Dialog-Stack sorgt dafür, dass Escape
 * nur das Popup schließt (nicht das Sheet gleich mit). Gleiches gilt für
 * den Android-Back-Button über den Ebenen-Stack von useSheetHistory.
 */
function AnnouncementDetailDialog({
  announcement: a,
  onClose,
}: {
  announcement: Announcement;
  onClose: () => void;
}) {
  const { locale } = useLanguage();
  const dialogRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Eigener History-Eintrag: "Zurück" schließt nur das Popup, nicht das
  // Sheet darunter.
  useSheetHistory(onCloseRef);

  useModalDialog({
    onClose,
    dialogRef,
    containerRef,
    initialFocusRef: titleRef,
    enabled: true,
  });

  // In der Liste reicht "vor X Min." – hier gibt es Platz fürs volle Datum
  const createdLabel = new Date(a.createdAt).toLocaleString(locale === 'en' ? 'en-GB' : 'de-DE', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-10 flex items-center justify-center p-4"
    >
      <div aria-hidden="true" className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[80dvh] w-full max-w-md flex-col rounded-2xl border border-rivet bg-steel p-4 shadow-2xl shadow-black/60"
      >
        <div className="flex items-start gap-2">
          <h3
            ref={titleRef}
            id={titleId}
            tabIndex={-1}
            className="min-w-0 flex-1 text-base font-bold leading-snug text-bone outline-none"
          >
            {a.title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-rivet bg-steel-2 text-sm text-ash transition active:scale-[0.97]"
          >
            ✕
          </button>
        </div>
        <p className="mt-0.5 text-[11px] text-ash/70">{createdLabel} Uhr</p>
        <div className="mt-3 min-h-0 overflow-y-auto overscroll-contain">
          <p className="whitespace-pre-line text-sm leading-relaxed text-ash">
            {a.body}
          </p>
          {a.festivalId === null && (
            <span className="mt-3 inline-block rounded-full bg-rivet px-2 py-0.5 text-[10px] font-bold text-ash">
              Festival Buddy Team
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
