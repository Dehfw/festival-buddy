'use client';

import { useState } from 'react';
import { useApp } from '@/lib/client/store';

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
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <div className="font-metal text-5xl font-black tracking-tight text-blood">
            W:O:A
          </div>
          <div className="font-metal mt-1 text-xl font-black uppercase text-bone">
            Festival Buddy
          </div>
          <p className="mt-3 text-sm text-ash">
            Wacken Open Air · 29.07.–01.08.2026
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
            className="w-full rounded-xl bg-blood px-4 py-3.5 font-metal text-lg font-black uppercase tracking-wide text-white transition active:scale-[0.98] disabled:opacity-40"
          >
            {busy ? 'Moment …' : 'Rein ins Infield'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs leading-relaxed text-ash/70">
          Kein Passwort, kein Account – einfach Name eintippen.
          Gleicher Name = gleiche Auswahl auf jedem Gerät.
          {data ? ` · ${data.users.length} von 17 sind schon drin.` : ''}
        </p>
      </div>
    </main>
  );
}
