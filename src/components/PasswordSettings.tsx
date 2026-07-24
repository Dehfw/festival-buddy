'use client';

import { useEffect, useState } from 'react';
import { setPassword as apiSetPassword } from '@/lib/client/password';

const inputCls =
  'w-full rounded-xl border border-rivet bg-steel px-3.5 py-3 text-base text-bone outline-none placeholder:text-ash/50 focus:border-blood';

/**
 * Konto-Abschnitt "Login & Sicherheit": E-Mail+Passwort als zweiten
 * Login-Weg einrichten oder ändern – gedacht für Passkey-Nutzer, die
 * einen Fallback fürs fremde Gerät (oder den Geräteverlust) wollen.
 * Liest den aktuellen Stand (hinterlegte E-Mail) selbst aus /api/me,
 * der App-Store hält passwordEmail bewusst nicht vor.
 */
export function PasswordSettings() {
  // undefined = lädt noch, null = kein Passwort hinterlegt
  const [email, setEmail] = useState<string | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [formEmail, setFormEmail] = useState('');
  const [password, setPasswordInput] = useState('');
  const [current, setCurrent] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/me', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { passwordEmail?: string | null } | null) => {
        if (!cancelled) setEmail(data?.passwordEmail ?? null);
      })
      .catch(() => {
        if (!cancelled) setEmail(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const hasPassword = typeof email === 'string';

  const toggle = () => {
    setOpen((v) => !v);
    setError(null);
    setSaved(false);
    setFormEmail(email ?? '');
    setPasswordInput('');
    setCurrent('');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const nextEmail = await apiSetPassword({
        email: formEmail.trim(),
        password,
        ...(hasPassword ? { currentPassword: current } : {}),
      });
      setEmail(nextEmail);
      setOpen(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Keine Verbindung – dafür braucht es Netz'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-3 rounded-xl border border-rivet bg-steel p-3.5">
      <div className="flex items-center gap-2.5">
        <span aria-hidden className="text-xl">
          🔐
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-bone">Login &amp; Sicherheit</div>
          <div className="text-[11px] text-ash">
            {email === undefined
              ? 'Lade …'
              : hasPassword
                ? `E-Mail & Passwort hinterlegt (${email})`
                : 'E-Mail & Passwort als zweiter Login-Weg neben dem Passkey'}
          </div>
        </div>
        {email !== undefined && (
          <button
            onClick={toggle}
            className="shrink-0 text-xs text-ash underline underline-offset-2 hover:text-bone"
          >
            {open ? 'Abbrechen' : hasPassword ? 'Ändern' : 'Einrichten'}
          </button>
        )}
      </div>

      {saved && (
        <p className="mt-2.5 rounded-lg border border-rivet bg-steel-2 px-3 py-2 text-xs text-bone">
          Gespeichert – du kannst dich jetzt auch mit E-Mail &amp; Passwort
          einloggen.
        </p>
      )}

      {open && (
        <form onSubmit={submit} className="mt-3 space-y-2.5">
          <input
            type="email"
            name="email"
            value={formEmail}
            onChange={(e) => setFormEmail(e.target.value)}
            placeholder="E-Mail"
            autoComplete="email"
            required
            className={inputCls}
          />
          {hasPassword && (
            <input
              type="password"
              name="currentPassword"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              placeholder="Aktuelles Passwort"
              autoComplete="current-password"
              required
              className={inputCls}
            />
          )}
          <input
            type="password"
            name="password"
            value={password}
            onChange={(e) => setPasswordInput(e.target.value)}
            placeholder={hasPassword ? 'Neues Passwort (mind. 8 Zeichen)' : 'Passwort (mind. 8 Zeichen)'}
            minLength={8}
            autoComplete="new-password"
            required
            className={inputCls}
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
            disabled={busy}
            className="w-full rounded-xl bg-blood px-4 py-3 font-metal text-base uppercase tracking-wide text-black transition active:scale-[0.98] disabled:opacity-40"
          >
            {busy ? 'Moment …' : 'Speichern'}
          </button>
        </form>
      )}
    </div>
  );
}
