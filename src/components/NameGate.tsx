'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/lib/client/store';
import {
  browserSupportsWebAuthn,
  browserSupportsWebAuthnAutofill,
  cancelPendingPasskey,
  describeWebAuthnError,
  isWebAuthnAbort,
  loginWithPasskey,
  registerWithPasskey,
} from '@/lib/client/webauthn';
import { BrandLockup } from './Brand';
import { PasswordAuth } from './PasswordAuth';

/**
 * Login-Gate: Standard-Identität = Passkey. Neue Leute tippen einmal
 * ihren Namen und legen einen Passkey an (Face ID / Fingerabdruck);
 * Wiederkehrer bekommen ihren Passkey per Autodiscovery direkt am
 * Namensfeld angeboten – oder über den "Ich hab schon einen
 * Passkey"-Button. Alternativ (und als Ausweg für Browser ohne
 * Passkey-Support) gibt es E-Mail & Passwort.
 */
export function NameGate() {
  const { loginAs } = useApp();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);
  const [method, setMethod] = useState<'passkey' | 'password'>('passkey');
  const valid = name.trim().length >= 2;
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Conditional UI: Passkey-Autofill im Hintergrund scharf schalten.
  // iOS/Android zeigen den gespeicherten Passkey dann von selbst an,
  // sobald das Namensfeld fokussiert wird. Nur solange der Passkey-Modus
  // sichtbar ist – beim Wechsel aufs E-Mail+Passwort-Formular wird die
  // Anfrage abgebrochen, sonst bremst iOS/WebKit (auch Chrome auf iOS)
  // dort jeden Tastenanschlag mit einer AutoFill-Abfrage aus.
  useEffect(() => {
    if (method !== 'passkey') return;
    if (!browserSupportsWebAuthn()) {
      setSupported(false);
      return;
    }
    // AbortController statt cancelled-Flag: Das Signal wandert bis in
    // loginWithPasskey hinein, damit auch ein Abbruch WÄHREND des
    // Options-Requests greift – sonst startet die Ceremony erst nach dem
    // Cleanup und hinge dann dauerhaft im Hintergrund.
    const abort = new AbortController();
    void (async () => {
      try {
        if (!(await browserSupportsWebAuthnAutofill())) return;
        if (abort.signal.aborted) return;
        const user = await loginWithPasskey({
          conditional: true,
          signal: abort.signal,
        });
        if (!abort.signal.aborted && mounted.current) loginAs(user);
      } catch (err) {
        // Abbruch (z. B. weil eine Registrierung startet) ist kein Fehler
        if (!abort.signal.aborted && mounted.current && !isWebAuthnAbort(err)) {
          setError((err as Error).message);
        }
      }
    })();
    return () => {
      abort.abort();
      cancelPendingPasskey();
    };
  }, [method, loginAs]);

  const register = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const user = await registerWithPasskey(name.trim());
      loginAs(user);
    } catch (err) {
      const msg = describeWebAuthnError(err);
      if (msg) setError(msg);
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
      const msg = describeWebAuthnError(err);
      if (msg) setError(msg);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  return (
    <main className="brand-grid flex min-h-dvh flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <div className="mb-8 inline-flex items-center gap-2 border border-blood/20 bg-blood/5 px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.3em] text-blood">
            <span className="opacity-50">//</span> Tja… Festival-Saison 2026
          </div>
          <div>
            <BrandLockup variant="hero" />
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

        {supported && method === 'passkey' ? (
          <>
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
            <button
              type="button"
              onClick={() => setMethod('password')}
              className="mt-4 w-full text-center text-xs text-ash underline underline-offset-2 hover:text-bone"
            >
              Lieber mit E-Mail &amp; Passwort
            </button>
          </>
        ) : (
          <>
            {!supported && (
              <p className="mb-4 rounded-xl border border-rivet bg-steel px-4 py-3 text-xs text-ash">
                Dein Browser kann leider keine Passkeys – mit E-Mail &amp;
                Passwort kommst du trotzdem rein.
              </p>
            )}
            <PasswordAuth onSuccess={loginAs} initialName={name.trim()} />
            {supported && (
              <button
                type="button"
                onClick={() => setMethod('passkey')}
                className="mt-4 w-full text-center text-xs text-ash underline underline-offset-2 hover:text-bone"
              >
                🔑 Lieber mit Passkey
              </button>
            )}
          </>
        )}

        <p className="mt-6 text-center text-xs leading-relaxed text-ash/70">
          Empfohlen: Dein Gerät merkt sich dich per Passkey (Face ID /
          Fingerabdruck) – ganz ohne Passwort. Der Name ist nur dein
          Anzeigename. Anderes Gerät? Beim Login einfach die QR-Code-Option
          nehmen. Alternativ geht&apos;s klassisch mit E-Mail &amp; Passwort.
        </p>

        <p className="mt-10 text-center font-mono text-[9px] uppercase tracking-[0.25em] text-ash/50">
          © 2026 MerchMaster · Festival Buddy ist kostenlos und bleibt es.
        </p>
        <p className="mt-3 flex items-center justify-center gap-3 font-mono text-[9px] uppercase tracking-[0.25em] text-ash/50">
          <Link
            href="/impressum"
            className="underline underline-offset-2 hover:text-ash"
          >
            Impressum
          </Link>
          <span aria-hidden>·</span>
          <Link
            href="/datenschutz"
            className="underline underline-offset-2 hover:text-ash"
          >
            Datenschutz
          </Link>
        </p>
      </div>
    </main>
  );
}
