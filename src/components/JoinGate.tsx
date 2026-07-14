'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/lib/client/store';
import { savePendingInvite } from '@/lib/client/sync';
import type { GroupPreview, GroupSummary } from '@/lib/types';
import { GroupAvatar } from './GroupAvatar';

/**
 * Bestätigungs-Screen für einen gemerkten Einladungslink (/join/<code>):
 * zeigt die Gruppen-Vorschau und tritt auf Wunsch bei. Wird nach dem
 * Passkey-Login angezeigt – der Code hat den Login in der
 * sessionStorage überlebt.
 */
export function JoinGate({ code, onDone }: { code: string; onDone: () => void }) {
  const { adoptGroup } = useApp();
  const [preview, setPreview] = useState<GroupPreview | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'invalid'>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/groups/preview?code=${encodeURIComponent(code)}`,
          { cache: 'no-store' }
        );
        if (cancelled) return;
        if (res.status === 404) {
          setState('invalid');
          return;
        }
        if (!res.ok) throw new Error();
        const { preview: p } = (await res.json()) as { preview: GroupPreview };
        setPreview(p);
        setState('ready');
      } catch {
        if (!cancelled) setError('Vorschau konnte nicht geladen werden – Netz?');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  const dismiss = () => {
    savePendingInvite(null);
    onDone();
  };

  const join = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/groups/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Serverfehler (${res.status})`);
      savePendingInvite(null);
      adoptGroup(data.group as GroupSummary);
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <main className="defekt-grid flex min-h-dvh flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm text-center">
        <div className="mb-6 inline-flex items-center gap-2 border border-blood/20 bg-blood/5 px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.3em] text-blood">
          <span className="opacity-50">//</span> Einladung
        </div>

        {state === 'invalid' ? (
          <>
            <p className="rounded-xl border border-blood/40 bg-blood/10 px-4 py-3 text-sm text-bone">
              Dieser Einladungslink ist ungültig oder wurde erneuert. Frag
              nach einem frischen Link!
            </p>
            <button
              onClick={dismiss}
              className="mt-5 w-full rounded-xl border border-rivet bg-steel px-4 py-3 text-sm font-semibold uppercase tracking-wider text-bone"
            >
              Weiter zur App
            </button>
          </>
        ) : (
          <>
            <div className="rounded-2xl border border-rivet bg-steel p-6">
              {state === 'loading' ? (
                <p className="text-sm text-ash">Lade Gruppen-Info …</p>
              ) : (
                <>
                  <div className="flex justify-center">
                    <GroupAvatar
                      name={preview!.name}
                      imageDataUrl={preview!.imageDataUrl}
                      size={72}
                    />
                  </div>
                  <h1 className="mt-3 font-metal text-2xl font-black leading-tight">
                    {preview!.name}
                  </h1>
                  <p className="mt-1 text-sm text-ash">
                    {preview!.festivalName}
                    <br />
                    {preview!.memberCount}{' '}
                    {preview!.memberCount === 1 ? 'Mitglied' : 'Mitglieder'}
                  </p>
                </>
              )}
            </div>
            {error && (
              <p className="mt-4 rounded-xl border border-blood/40 bg-blood/10 px-4 py-3 text-sm text-blood">
                {error}
              </p>
            )}
            <button
              onClick={join}
              disabled={state !== 'ready' || busy}
              className="mt-5 w-full rounded-xl bg-blood px-4 py-3.5 font-metal text-lg uppercase tracking-wide text-black transition active:scale-[0.98] disabled:opacity-40"
            >
              {busy ? 'Moment …' : 'Beitreten 🤘'}
            </button>
            <button
              onClick={dismiss}
              disabled={busy}
              className="mt-3 w-full text-center text-xs text-ash/60 underline"
            >
              Doch nicht – Einladung verwerfen
            </button>
          </>
        )}
      </div>
    </main>
  );
}
