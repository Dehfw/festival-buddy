'use client';

import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/lib/client/store';
import {
  browserSupportsWebAuthn,
  browserSupportsWebAuthnAutofill,
  isWebAuthnAbort,
  loginWithPasskey,
  registerWithPasskey,
} from '@/lib/client/webauthn';
import { DefektLogo } from './DefektLogo';

/**
 * Login-Gate: Identität = Passkey. Neue Leute tippen einmal ihren Namen
 * und legen einen Passkey an (Face ID / Fingerabdruck); Wiederkehrer
 * bekommen ihren Passkey per Autodiscovery direkt am Namensfeld
 * angeboten – oder über den "Ich hab schon einen Passkey"-Button.
 */
export function NameGate() {
  const { loginAs } = useApp();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);
  const valid = name.trim().length >= 2;
  const mounted = useRef(true);

  // Conditional UI: Passkey-Autofill im Hintergrund scharf schalten.
  // iOS/Android zeigen den gespeicherten Passkey dann von selbst an,
  // sobald das Namensfeld fokussiert wird.
  useEffect(() => {
    mounted.current = true;
    if (!browserSupportsWebAuthn()) {
      setSupported(false);
      return;
    }
    void (async () => {
      try {
        if (!(await browserSupportsWebAuthnAutofill())) return;
        const user = await loginWithPasskey({ conditional: true });
        if (mounted.current) loginAs(user);
      } catch (err) {
        // Abbruch (z. B. weil eine Registrierung startet) ist kein Fehler
        if (mounted.current && !isWebAuthnAbort(err)) {
          setError((err as Error).message);
        }
      }
    })();
    return () => {
      mounted.current = false;
    };
  }, [loginAs]);

  const register = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const user = await registerWithPasskey(name.trim());
      loginAs(user);
    } catch (err) {
      if (!isWebAuthnAbort(err)) setError((err as Error).message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const loginExisting = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const user = await loginWithPasskey();
      loginAs(user);
    } catch (err) {
      if (!isWebAuthnAbort(err)) setError((err as Error).message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  return (
    <main className="defekt-grid flex min-h-dvh flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <div className="mb-8 inline-flex items-center gap-2 border border-blood/20 bg-blood/5 px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.3em] text-blood">
            <span className="opacity-50">//</span> Tja… Festival-Saison 2026
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
            Festival Buddy · Wer geht zu welcher Band? 🤘
            <br />
            Nach dem Login gründest du eine Gruppe oder trittst einer bei.
          </p>
        </div>

        {supported ? (
          <form onSubmit={register} className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-ash">
                Dein Name (für die Crew sichtbar)
              </span>
              <input
                autoFocus
                type="text"
                name="username"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z. B. Daniel"
                maxLength={30}
                autoComplete="username webauthn"
                className="w-full rounded-xl border border-rivet bg-steel px-4 py-3.5 text-lg text-bone outline-none placeholder:text-ash/50 focus:border-blood"
              />
            </label>
            {error && (
              <p className="rounded-xl border border-blood/40 bg-blood/10 px-4 py-3 text-sm text-blood">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={!valid || busy}
              className="w-full rounded-xl bg-blood px-4 py-3.5 font-metal text-lg uppercase tracking-wide text-black transition active:scale-[0.98] disabled:opacity-40"
            >
              {busy ? 'Moment …' : 'Passkey anlegen & rein'}
            </button>
            <button
              type="button"
              onClick={loginExisting}
              disabled={busy}
              className="w-full rounded-xl border border-rivet bg-steel px-4 py-3.5 text-sm font-semibold uppercase tracking-wider text-bone transition active:scale-[0.98] disabled:opacity-40"
            >
              🔑 Ich hab schon einen Passkey
            </button>
          </form>
        ) : (
          <p className="rounded-xl border border-blood/40 bg-blood/10 px-4 py-3 text-sm text-bone">
            Dein Browser kann leider keine Passkeys. Bitte ein aktuelles
            iOS/Android oder einen aktuellen Browser (Safari, Chrome, Firefox,
            Edge) benutzen.
          </p>
        )}

        <p className="mt-6 text-center text-xs leading-relaxed text-ash/70">
          Kein Passwort: Dein Gerät merkt sich dich per Passkey
          (Face ID / Fingerabdruck). Der Name ist nur dein Anzeigename.
          Anderes Gerät? Beim Login einfach die QR-Code-Option nehmen.
        </p>

        <p className="mt-10 text-center font-mono text-[9px] uppercase tracking-[0.25em] text-ash/50">
          © 2026 DEFƎKT — Alle Rechte defekt.
        </p>
      </div>
    </main>
  );
}
