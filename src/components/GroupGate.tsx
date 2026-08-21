'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useApp } from '@/lib/client/store';
import { loadPendingFestival, savePendingFestival } from '@/lib/client/sync';
import { useModalDialog } from '@/lib/client/useModalDialog';
import {
  normalizeInviteCode,
  type FestivalSummary,
  type GroupSummary,
} from '@/lib/types';
import { BrandLockup } from './Brand';

/** Vorbefüllte Wunsch-Mail; Umbrüche als CRLF gemäß RFC 6068 */
const MISSING_FESTIVAL_MAILTO =
  'mailto:moin@festivalbuddy.app' +
  `?subject=${encodeURIComponent('Festival-Wunsch für FestivalBuddy')}` +
  `&body=${encodeURIComponent(
    'Moin!\r\n\r\nMir fehlt ein Festival in der Auswahl:\r\n\r\nFestival: \r\nJahr: \r\nLink zum Lineup (falls vorhanden): \r\n\r\nDanke & 🤘',
  )}`;

/**
 * Festival-Branding für Landingpage-Vorauswahlen: Wer über eine
 * Festival-Landingpage (z. B. /partysan) kommt, sieht hier das
 * Festival-Logo statt des Festival-Buddy-Lockups.
 */
const FESTIVAL_LOGOS: Record<string, { src: string; alt: string }> = {
  psoa2026: { src: '/partysan/psoa-logo.png', alt: 'Party.San Metal Open Air' },
};

/**
 * Zusatz zur Edition, solange kein Timetable da ist: Sind schon Bands
 * announced, ist das Festival kein leeres Versprechen mehr – die Crew
 * kann sofort durchhören und markieren.
 */
function festivalHint(bandCount: number): string {
  return bandCount > 0 ? ` · ${bandCount} Bands announced` : ' · Lineup folgt';
}

/**
 * Zweites Gate nach dem Passkey-Login: Gruppe gründen (mit Festival-
 * Auswahl) oder per Einladungscode beitreten. Als Vollbild für Neue
 * ohne Gruppe – oder als Overlay ("+ weitere Gruppe") mit onClose.
 *
 * Kommt jemand von einer Festival-Landingpage (/app?festival=<id>,
 * gemerkt in der sessionStorage), wird die Festival-Auswahl übersprungen:
 * Das Festival ist fest vorausgewählt und das Gründen-Formular rückt nach
 * oben – "Anderes Festival wählen" holt die normale Auswahl zurück.
 */
export function GroupGate({ onClose }: { onClose?: () => void }) {
  const { user, adoptGroup, logout } = useApp();
  const [festivals, setFestivals] = useState<FestivalSummary[] | null>(null);
  const [festivalId, setFestivalId] = useState('');
  // Vorauswahl sofort aus der sessionStorage lesen (Formular-Reihenfolge
  // steht damit ohne Flackern fest); nach dem Laden der Liste wird sie
  // validiert – unbekannte oder beendete Festivals fallen zurück auf die
  // normale Auswahl.
  const [lockedFestivalId, setLockedFestivalId] = useState<string | null>(() =>
    loadPendingFestival()
  );
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missingOpen, setMissingOpen] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();

  // Nur die Overlay-Variante (mit onClose) ist ein modaler Dialog: Fokus
  // auf den Titel, Focus Trap, Escape schließt, Seite darunter inert,
  // Fokus zurück zum "+ Gruppe"-Button. Die Full-Page-Variante für Neue
  // ohne Gruppe bleibt eine normale Seite.
  useModalDialog({
    onClose: () => onClose?.(),
    dialogRef,
    initialFocusRef: titleRef,
    enabled: !!onClose,
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/festivals', { cache: 'no-store' });
        if (!res.ok) throw new Error();
        const { festivals: list } = (await res.json()) as {
          festivals: FestivalSummary[];
        };
        if (!cancelled) {
          setFestivals(list);
          const pending = loadPendingFestival();
          const locked =
            pending && list.some((f) => f.id === pending) ? pending : null;
          if (pending && !locked) savePendingFestival(null);
          setLockedFestivalId(locked);
          setFestivalId((prev) => locked || prev || list[0]?.id || '');
        }
      } catch {
        if (!cancelled) setError('Festivals konnten nicht geladen werden – Netz?');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || name.trim().length < 2 || !festivalId) return;
    setBusy('create');
    setError(null);
    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), festivalId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Serverfehler (${res.status})`);
      // Vorauswahl ist verbraucht – spätere Gründungen starten wieder normal
      savePendingFestival(null);
      adoptGroup(data.group as GroupSummary);
      onClose?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizeInviteCode(code);
    if (busy || normalized.length !== 8) return;
    setBusy('join');
    setError(null);
    try {
      const res = await fetch('/api/groups/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: normalized }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Serverfehler (${res.status})`);
      adoptGroup(data.group as GroupSummary);
      onClose?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const codeValid = normalizeInviteCode(code).length === 8;

  // Vorausgewähltes Festival (null solange die Liste noch lädt) + Branding
  const lockedFestival =
    (lockedFestivalId && festivals?.find((f) => f.id === lockedFestivalId)) ||
    null;
  const lockedLogo = lockedFestivalId
    ? FESTIVAL_LOGOS[lockedFestivalId]
    : undefined;

  const unlockFestival = () => {
    setLockedFestivalId(null);
    savePendingFestival(null);
  };

  const joinForm = (
    <form
      onSubmit={join}
      className="rounded-2xl border border-rivet bg-steel p-4"
    >
      <h2 className="text-xs font-black uppercase tracking-[0.2em] text-ash">
        Code? Rein da!
      </h2>
      <p className="mt-1 text-xs text-ash/70">
        Den Code bekommst du von jemandem aus der Gruppe – als Link oder
        zum Abtippen.
      </p>
      <div className="mt-3 flex gap-2">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="z. B. 7KM9-Q2XP"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          maxLength={12}
          className="w-full rounded-xl border border-rivet bg-steel-2 px-4 py-3 font-mono text-base uppercase tracking-[0.15em] text-bone outline-none placeholder:text-ash/40 focus:border-blood"
        />
        <button
          type="submit"
          disabled={!codeValid || busy !== null}
          className="shrink-0 rounded-xl bg-blood px-4 py-3 font-metal text-sm uppercase text-black transition active:scale-[0.98] disabled:opacity-40"
        >
          {busy === 'join' ? '…' : 'Beitreten'}
        </button>
      </div>
    </form>
  );

  const createForm = (
    <form
      onSubmit={create}
      className="rounded-2xl border border-rivet bg-steel p-4"
    >
      <h2 className="text-xs font-black uppercase tracking-[0.2em] text-ash">
        Neue Gruppe gründen
      </h2>
      {lockedFestivalId ? (
        // Vorauswahl von der Landingpage: Festival steht fest, keine Liste
        <div className="mt-3">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ash">
            Festival
          </span>
          {lockedFestival ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-blood bg-blood/10 px-3.5 py-2.5">
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold text-bone">
                  {lockedFestival.name}
                </span>
                <span className="block text-[11px] text-ash">
                  {lockedFestival.edition}
                  {!lockedFestival.hasLineup && festivalHint(lockedFestival.bandCount)}
                </span>
              </span>
              <span aria-hidden className="text-lg text-blood">
                ✓
              </span>
            </div>
          ) : (
            <p className="text-sm text-ash/60">Lade Festivals …</p>
          )}
          <button
            type="button"
            onClick={unlockFestival}
            className="mt-1.5 text-xs text-ash/60 underline underline-offset-2"
          >
            Anderes Festival wählen
          </button>
        </div>
      ) : (
        <label className="mt-3 block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ash">
            Festival
          </span>
          {festivals === null ? (
            <p className="text-sm text-ash/60">Lade Festivals …</p>
          ) : (
            <div className="space-y-1.5">
              {festivals.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFestivalId(f.id)}
                  className={`w-full rounded-xl border px-3.5 py-2.5 text-left transition ${
                    f.id === festivalId
                      ? 'border-blood bg-blood/10'
                      : 'border-rivet bg-steel-2'
                  }`}
                >
                  <span className="block text-sm font-bold text-bone">
                    {f.name}
                  </span>
                  <span className="block text-[11px] text-ash">
                    {f.edition}
                    {!f.hasLineup && festivalHint(f.bandCount)}
                  </span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => setMissingOpen((v) => !v)}
                aria-expanded={missingOpen}
                aria-controls="missing-festival-panel"
                className={`w-full rounded-xl border border-dashed px-3.5 py-2.5 text-left transition ${
                  missingOpen
                    ? 'border-ash/70 bg-steel-2'
                    : 'border-rivet'
                }`}
              >
                <span className="block text-sm font-bold text-ash">
                  Dein Festival ist nicht dabei?
                </span>
                <span className="block text-[11px] text-ash/60">
                  Sag uns Bescheid – wir kümmern uns drum.
                </span>
              </button>
              {missingOpen && (
                <div
                  id="missing-festival-panel"
                  className="rounded-xl border border-rivet bg-steel-2 px-3.5 py-3"
                >
                  <p className="text-xs leading-relaxed text-ash">
                    Schreib uns kurz, welches Festival dir fehlt – am
                    besten mit Jahr und Link zum Lineup. Wir melden uns,
                    sobald es am Start ist. 🤘
                  </p>
                  <a
                    href={MISSING_FESTIVAL_MAILTO}
                    className="mt-2.5 block rounded-xl border border-blood/60 px-4 py-2.5 text-center text-sm font-black uppercase tracking-wide text-blood transition active:scale-[0.98]"
                  >
                    E-Mail schreiben
                  </a>
                  <p className="mt-1.5 text-center text-[10px] text-ash/50">
                    moin@festivalbuddy.app
                  </p>
                </div>
              )}
            </div>
          )}
        </label>
      )}
      <label className="mt-3 block">
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ash">
          Gruppenname
        </span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="z. B. Metal Crew"
          maxLength={40}
          className="w-full rounded-xl border border-rivet bg-steel-2 px-4 py-3 text-base text-bone outline-none placeholder:text-ash/40 focus:border-blood"
        />
      </label>
      <button
        type="submit"
        disabled={name.trim().length < 2 || !festivalId || busy !== null}
        className="mt-4 w-full rounded-xl bg-blood px-4 py-3.5 font-metal text-base uppercase tracking-wide text-black transition active:scale-[0.98] disabled:opacity-40"
      >
        {busy === 'create' ? 'Moment …' : 'Gruppe gründen'}
      </button>
      <p className="mt-2 text-[11px] leading-relaxed text-ash/60">
        Du wirst Owner und bekommst direkt einen Einladungscode, mit dem
        beliebig viele Leute beitreten können. Name, Gruppenbild und
        Feuerrahmen stellst du danach im Gruppen-Menü ein.
      </p>
    </form>
  );

  const divider = (
    <div className="my-5 flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.3em] text-ash/50">
      <span className="h-px flex-1 bg-rivet" />
      oder
      <span className="h-px flex-1 bg-rivet" />
    </div>
  );

  return (
    <main
      ref={dialogRef}
      role={onClose ? 'dialog' : undefined}
      aria-modal={onClose ? true : undefined}
      aria-labelledby={onClose ? titleId : undefined}
      className={`brand-grid flex min-h-dvh flex-col items-center overflow-y-auto px-6 py-10 ${
        onClose ? 'fixed inset-0 z-50 bg-black/95' : ''
      }`}
    >
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          {onClose ? (
            <div className="flex items-center justify-between">
              <h1
                ref={titleRef}
                id={titleId}
                tabIndex={-1}
                className="font-metal text-xl font-black uppercase outline-none"
              >
                Weitere Gruppe
              </h1>
              <button
                onClick={onClose}
                className="rounded-full border border-rivet px-3 py-1.5 text-xs font-bold uppercase text-ash"
              >
                Schließen
              </button>
            </div>
          ) : (
            <>
              {lockedLogo ? (
                <img
                  src={lockedLogo.src}
                  alt={lockedLogo.alt}
                  className="mx-auto w-64 max-w-full select-none"
                />
              ) : (
                <BrandLockup variant="hero" />
              )}
              <p className="mt-4 text-sm text-ash">
                Moin{user ? ` ${user.name}` : ''}! 🤘 Fast geschafft – du
                brauchst noch eine Crew
                {lockedFestival ? ` fürs ${lockedFestival.name}` : ''}: Gründe
                eine Gruppe oder tritt mit einem Einladungscode bei.
              </p>
            </>
          )}
        </div>

        {error && (
          <p
            role="alert"
            className="mb-4 rounded-xl border border-blood/40 bg-blood/10 px-4 py-3 text-sm text-blood"
          >
            {error}
          </p>
        )}

        {/* Mit Festival-Vorauswahl steht das Gründen oben – dafür kommen
            die Leute von der Landingpage ja her */}
        {lockedFestivalId ? (
          <>
            {createForm}
            {divider}
            {joinForm}
          </>
        ) : (
          <>
            {joinForm}
            {divider}
            {createForm}
          </>
        )}

        {!onClose && (
          <button
            onClick={logout}
            className="mt-6 w-full text-center text-xs text-ash/60 underline"
          >
            Nicht du? Abmelden
          </button>
        )}
      </div>
    </main>
  );
}
