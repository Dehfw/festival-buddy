'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/lib/client/store';
import {
  normalizeInviteCode,
  type FestivalSummary,
  type GroupSummary,
} from '@/lib/types';
import { DefektLogo } from './DefektLogo';

/** Vorbefüllte Wunsch-Mail, damit direkt alles Nötige drinsteht */
const MISSING_FESTIVAL_MAILTO =
  'mailto:moin@festivalbuddy.app' +
  `?subject=${encodeURIComponent('Festival-Wunsch für FestivalBuddy')}` +
  `&body=${encodeURIComponent(
    'Moin!\n\nMir fehlt ein Festival in der Auswahl:\n\nFestival: \nJahr: \nLink zum Lineup (falls vorhanden): \n\nDanke & 🤘',
  )}`;

/**
 * Zweites Gate nach dem Passkey-Login: Gruppe gründen (mit Festival-
 * Auswahl) oder per Einladungscode beitreten. Als Vollbild für Neue
 * ohne Gruppe – oder als Overlay ("+ weitere Gruppe") mit onClose.
 */
export function GroupGate({ onClose }: { onClose?: () => void }) {
  const { user, adoptGroup, logout } = useApp();
  const [festivals, setFestivals] = useState<FestivalSummary[] | null>(null);
  const [festivalId, setFestivalId] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missingOpen, setMissingOpen] = useState(false);

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
          setFestivalId((prev) => prev || list[0]?.id || '');
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

  return (
    <main
      className={`defekt-grid flex min-h-dvh flex-col items-center overflow-y-auto px-6 py-10 ${
        onClose ? 'fixed inset-0 z-50 bg-black/95' : ''
      }`}
    >
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          {onClose ? (
            <div className="flex items-center justify-between">
              <h1 className="font-metal text-xl font-black uppercase">
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
              <DefektLogo variant="hero" />
              <p className="mt-4 text-sm text-ash">
                Moin{user ? ` ${user.name}` : ''}! 🤘 Fast geschafft – du
                brauchst noch eine Crew: Gründe eine Gruppe oder tritt mit
                einem Einladungscode bei.
              </p>
            </>
          )}
        </div>

        {error && (
          <p className="mb-4 rounded-xl border border-blood/40 bg-blood/10 px-4 py-3 text-sm text-blood">
            {error}
          </p>
        )}

        {/* Beitreten */}
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

        <div className="my-5 flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.3em] text-ash/50">
          <span className="h-px flex-1 bg-rivet" />
          oder
          <span className="h-px flex-1 bg-rivet" />
        </div>

        {/* Gründen */}
        <form
          onSubmit={create}
          className="rounded-2xl border border-rivet bg-steel p-4"
        >
          <h2 className="text-xs font-black uppercase tracking-[0.2em] text-ash">
            Neue Gruppe gründen
          </h2>
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
                      {!f.hasLineup && ' · Lineup folgt'}
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setMissingOpen((v) => !v)}
                  aria-expanded={missingOpen}
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
                  <div className="rounded-xl border border-rivet bg-steel-2 px-3.5 py-3">
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
          <label className="mt-3 block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ash">
              Gruppenname
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z. B. DEFEKT"
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
