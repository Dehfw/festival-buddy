'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { PasswordAuth } from '@/components/PasswordAuth';
import { saveUser } from '@/lib/client/sync';
import { useModalDialog } from '@/lib/client/useModalDialog';
import type { User } from '@/lib/types';
import {
  browserSupportsWebAuthn,
  browserSupportsWebAuthnAutofill,
  cancelPendingPasskey,
  describeWebAuthnError,
  isWebAuthnAbort,
  loginWithPasskey,
  registerWithPasskey,
} from '@/lib/client/webauthn';

/**
 * Prominenter Login direkt in der Landing-Topbar. Öffnet ein kleines
 * Login-Panel (gleiche Flows wie die NameGate der App): Standard ist der
 * Passkey (Face ID / Fingerabdruck), alternativ E-Mail & Passwort – auch
 * als Ausweg für Browser ohne Passkey-Support. Nach Erfolg wird der
 * Nutzer lokal übernommen und es geht in die App unter /app – deren
 * AppProvider liest die Session dann weiter.
 */
export function LandingLogin() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);
  const [method, setMethod] = useState<'passkey' | 'password'>('passkey');
  const valid = name.trim().length >= 2;
  const mounted = useRef(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const titleId = useId();

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Modales Dialog-Verhalten: Fokus ins Namensfeld, Focus Trap, Escape
  // schließt, Hintergrund inert, Fokus zurück zum "Einloggen"-Button.
  useModalDialog({
    onClose: () => setOpen(false),
    dialogRef: panelRef,
    containerRef: overlayRef,
    initialFocusRef: inputRef,
    enabled: open,
  });

  // Passkey-Autofill (Conditional UI) erst scharf schalten, wenn das Panel
  // offen ist – iOS/Android bieten den gespeicherten Passkey dann am
  // Namensfeld von selbst an. Beim Wechsel aufs E-Mail+Passwort-Formular
  // oder Schließen des Panels wird die Anfrage abgebrochen, sonst bremst
  // iOS/WebKit (auch Chrome auf iOS) jeden Tastenanschlag mit einer
  // AutoFill-Abfrage aus.
  useEffect(() => {
    if (!open || method !== 'passkey') return;
    if (!browserSupportsWebAuthn()) {
      setSupported(false);
      return;
    }
    // AbortController statt cancelled-Flag: Das Signal wandert bis in
    // loginWithPasskey hinein, damit auch ein Abbruch WÄHREND des
    // Options-Requests greift – sonst startet die Ceremony erst nach dem
    // Cleanup und hinge dann dauerhaft im Hintergrund. Genau dieses
    // Fenster ist im Popup groß: Der Request läuft ab Panel-Öffnung, und
    // wer sich mit E-Mail registrieren will, tippt den Link sofort an.
    const abort = new AbortController();
    void (async () => {
      try {
        if (!(await browserSupportsWebAuthnAutofill())) return;
        if (abort.signal.aborted) return;
        const user = await loginWithPasskey({
          conditional: true,
          signal: abort.signal,
        });
        if (!abort.signal.aborted && mounted.current) enter(user);
      } catch (err) {
        if (!abort.signal.aborted && mounted.current && !isWebAuthnAbort(err)) {
          setError((err as Error).message);
        }
      }
    })();
    return () => {
      abort.abort();
      cancelPendingPasskey();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, method]);

  const enter = (user: User) => {
    saveUser(user);
    router.push('/app');
  };

  const register = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const user = await registerWithPasskey(name.trim());
      enter(user);
    } catch (err) {
      const msg = describeWebAuthnError(err);
      if (msg) setError(msg);
      if (mounted.current) setBusy(false);
    }
  };

  const loginExisting = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const user = await loginWithPasskey();
      enter(user);
    } catch (err) {
      const msg = describeWebAuthnError(err);
      if (msg) setError(msg);
      if (mounted.current) setBusy(false);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? panelId : undefined}
        className="rounded-lg bg-blood px-4 py-2 font-metal text-xs uppercase tracking-wider text-black transition active:scale-[0.98]"
      >
        🔑 Einloggen
      </button>

      {open && (
        <div ref={overlayRef}>
          {/* Klick daneben schließt das Panel – reines Pointer-Ziel,
              Tastatur schließt per Escape oder Schließen-Button. */}
          <div
            aria-hidden="true"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="absolute right-0 top-full z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-rivet bg-steel-2 p-4 shadow-2xl shadow-black/60"
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <p
                id={titleId}
                className="text-xs font-semibold uppercase tracking-wider text-ash"
              >
                {method === 'passkey' && supported
                  ? 'Rein per Passkey – ohne Passwort'
                  : 'Mit E-Mail & Passwort'}
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Schließen"
                className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-rivet text-xs text-ash transition active:scale-[0.97]"
              >
                ✕
              </button>
            </div>
            {supported && method === 'passkey' ? (
              <>
                <form onSubmit={register} className="space-y-2.5">
                  <input
                    ref={inputRef}
                    type="text"
                    name="username"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Dein Name, z. B. Daniel"
                    maxLength={30}
                    autoComplete="username webauthn"
                    className="w-full rounded-xl border border-rivet bg-steel px-3.5 py-3 text-base text-bone outline-none placeholder:text-ash/50 focus:border-blood"
                  />
                  {error && (
                    <p
                      role="alert"
                      className="rounded-lg border border-blood/40 bg-blood/10 px-3 py-2 text-xs text-blood"
                    >
                      {error}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={!valid || busy}
                    className="w-full rounded-xl bg-blood px-4 py-3 font-metal text-base uppercase tracking-wide text-black transition active:scale-[0.98] disabled:opacity-40"
                  >
                    {busy ? 'Moment …' : 'Passkey anlegen & rein'}
                  </button>
                  <button
                    type="button"
                    onClick={loginExisting}
                    disabled={busy}
                    className="w-full rounded-xl border border-rivet bg-steel px-4 py-3 text-xs font-semibold uppercase tracking-wider text-bone transition active:scale-[0.98] disabled:opacity-40"
                  >
                    🔑 Ich hab schon einen Passkey
                  </button>
                </form>
                <button
                  type="button"
                  onClick={() => setMethod('password')}
                  className="mt-3 text-xs text-ash underline underline-offset-2 hover:text-bone"
                >
                  Lieber mit E-Mail &amp; Passwort
                </button>
              </>
            ) : (
              <>
                {!supported && (
                  <p className="mb-2.5 rounded-lg border border-rivet bg-steel px-3 py-2 text-xs text-ash">
                    Dein Browser kann leider keine Passkeys – mit E-Mail &amp;
                    Passwort kommst du trotzdem rein.
                  </p>
                )}
                <PasswordAuth onSuccess={enter} initialName={name.trim()} />
                {supported && (
                  <button
                    type="button"
                    onClick={() => setMethod('passkey')}
                    className="mt-3 text-xs text-ash underline underline-offset-2 hover:text-bone"
                  >
                    🔑 Lieber mit Passkey
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
