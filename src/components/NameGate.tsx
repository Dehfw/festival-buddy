'use client';

import { useState } from 'react';
import { useApp } from '@/lib/client/store';
import { DefektLogo } from './DefektLogo';

export function NameGate() {
  const { login, data } = useApp();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const valid = name.trim().length >= 2;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    await login(name);
    setBusy(false);
  };

  return (
    <main className="defekt-grid flex min-h-dvh flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <div className="mb-8 inline-flex items-center gap-2 border border-blood/20 bg-blood/5 px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.3em] text-blood">
            <span className="opacity-50">//</span> Tja… Wacken 2026
          </div>
          <div>
            <DefektLogo variant="hero" />
          </div>
          <div className="mt-5 flex items-center justify-center gap-3 text-[13px] font-black uppercase tracking-[0.3em] text-bone">
            Stramm
            <span className="inline-block h-1.5 w-8 -skew-x-12 bg-blood" />
            Geplant
          </div>
          <p className="mt-4 text-sm text-ash">
            Festival Buddy · W:O:A · 26.07.–01.08.2026
            <br />
            Wer geht zu welcher Band? 🤘
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-ash">
              Dein Name (für die Crew sichtbar)
            </span>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z. B. Daniel"
              maxLength={30}
              className="w-full rounded-xl border border-rivet bg-steel px-4 py-3.5 text-lg text-bone outline-none placeholder:text-ash/50 focus:border-blood"
            />
          </label>
          <button
            type="submit"
            disabled={!valid || busy}
            className="w-full rounded-xl bg-blood px-4 py-3.5 font-metal text-lg uppercase tracking-wide text-black transition active:scale-[0.98] disabled:opacity-40"
          >
            {busy ? 'Moment …' : 'Rein ins Infield'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs leading-relaxed text-ash/70">
          Kein Passwort, kein Account – einfach Name eintippen.
          Gleicher Name = gleiche Auswahl auf jedem Gerät.
          {data ? ` · ${data.users.length} von 17 sind schon drin.` : ''}
        </p>

        <p className="mt-10 text-center font-mono text-[9px] uppercase tracking-[0.25em] text-ash/50">
          © 2026 DEFƎKT — Alle Rechte defekt.
        </p>
      </div>
    </main>
  );
}
