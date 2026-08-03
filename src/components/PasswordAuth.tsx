'use client';

import { useEffect, useState } from 'react';
import {
  loginWithPassword,
  registerWithPassword,
  requestPasswordReset,
} from '@/lib/client/password';
import { cancelPendingPasskey } from '@/lib/client/webauthn';
import type { User } from '@/lib/types';

type Mode = 'login' | 'register' | 'forgot';

const inputCls =
  'w-full rounded-xl border border-rivet bg-steel px-3.5 py-3 text-base text-bone outline-none placeholder:text-ash/50 focus:border-blood';
const primaryCls =
  'w-full rounded-xl bg-blood px-4 py-3 font-metal text-base uppercase tracking-wide text-black transition active:scale-[0.98] disabled:opacity-40';
const linkCls = 'text-xs text-ash underline underline-offset-2 hover:text-bone';

/**
 * E-Mail+Passwort-Formulare für beide Login-Gates (Landing-Panel und
 * NameGate): Einloggen, Konto anlegen und "Passwort vergessen" in einem
 * kompakten Block. Nach Erfolg wird der Nutzer per onSuccess übergeben –
 * die Session-Cookies hat der Server dann schon gesetzt.
 */
export function PasswordAuth({
  onSuccess,
  initialName = '',
}: {
  onSuccess: (user: User) => void;
  /** Name aus dem Passkey-Formular übernehmen, wenn schon getippt */
  initialName?: string;
}) {
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  // Sicherheitsnetz: Sobald das Passwort-Formular sichtbar ist, hat eine
  // Passkey-Abfrage nichts mehr zu suchen. Eine noch hängende
  // Conditional-Anfrage würde auf iOS/WebKit (auch Chrome auf iOS) jeden
  // Tastenanschlag in diesen Feldern mit einer AutoFill-Abfrage
  // ausbremsen – hier wird sie deshalb hart abgebrochen, egal wie sie
  // gestartet wurde.
  useEffect(() => {
    cancelPendingPasskey();
  }, []);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setResetSent(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') {
        onSuccess(await loginWithPassword(email.trim(), password));
      } else if (mode === 'register') {
        onSuccess(await registerWithPassword(name.trim(), email.trim(), password));
      } else {
        await requestPasswordReset(email.trim());
        setResetSent(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'forgot' && resetSent) {
    return (
      <div className="space-y-2.5">
        <p className="rounded-lg border border-rivet bg-steel px-3 py-2.5 text-xs text-bone">
          Wenn es zu dieser E-Mail ein Konto gibt, ist gerade eine Mail mit
          dem Reset-Link rausgegangen (30 Minuten gültig). Schau auch im
          Spam-Ordner nach.
        </p>
        <button type="button" onClick={() => switchMode('login')} className={linkCls}>
          ← Zurück zum Login
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-2.5">
      {mode === 'register' && (
        <input
          type="text"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Dein Name, z. B. Daniel"
          maxLength={30}
          autoComplete="username"
          required
          className={inputCls}
        />
      )}
      <input
        type="email"
        name="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="E-Mail"
        autoComplete="email"
        required
        className={inputCls}
      />
      {mode !== 'forgot' && (
        <input
          type="password"
          name="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={mode === 'register' ? 'Passwort (mind. 8 Zeichen)' : 'Passwort'}
          minLength={mode === 'register' ? 8 : undefined}
          autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          required
          className={inputCls}
        />
      )}
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-blood/40 bg-blood/10 px-3 py-2 text-xs text-blood"
        >
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className={primaryCls}>
        {busy
          ? 'Moment …'
          : mode === 'login'
            ? 'Einloggen'
            : mode === 'register'
              ? 'Konto anlegen & rein'
              : 'Reset-Link schicken'}
      </button>
      <div className="flex items-center justify-between gap-2">
        {mode === 'login' ? (
          <>
            <button type="button" onClick={() => switchMode('forgot')} className={linkCls}>
              Passwort vergessen?
            </button>
            <button
              type="button"
              onClick={() => switchMode('register')}
              className={linkCls}
            >
              Neu hier? Konto anlegen
            </button>
          </>
        ) : (
          <button type="button" onClick={() => switchMode('login')} className={linkCls}>
            ← Ich hab schon ein Konto
          </button>
        )}
      </div>
    </form>
  );
}
