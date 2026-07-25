'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { DefektLogo } from '@/components/DefektLogo';
import { resetPassword } from '@/lib/client/password';
import { saveUser } from '@/lib/client/sync';

/**
 * Landing für den Link aus der "Passwort vergessen"-Mail. Das Token
 * steckt im URL-Fragment (#...), damit es nicht in Server-Logs auftaucht
 * – deshalb ist die Seite rein clientseitig und liest location.hash erst
 * nach dem Mount. Nach erfolgreichem Reset ist man direkt eingeloggt.
 */
export default function PasswordResetPage() {
  const router = useRouter();
  // undefined = noch nicht gelesen (SSR/erster Render), '' = Link ohne Token
  const [token, setToken] = useState<string | undefined>(undefined);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setToken(window.location.hash.replace(/^#/, ''));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || busy) return;
    if (password !== confirm) {
      setError('Die Passwörter stimmen nicht überein');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const user = await resetPassword(token, password);
      saveUser(user);
      router.replace('/app');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
      setBusy(false);
    }
  };

  return (
    <main className="defekt-grid flex min-h-dvh flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <DefektLogo variant="hero" />
          <p className="mt-4 text-sm text-ash">Neues Passwort setzen</p>
        </div>

        {token === '' ? (
          <div className="space-y-4">
            <p className="rounded-xl border border-blood/40 bg-blood/10 px-4 py-3 text-sm text-bone">
              Der Link ist unvollständig – bitte den kompletten Link aus der
              Mail öffnen oder einen neuen anfordern.
            </p>
            <Link
              href="/"
              className="block text-center text-xs text-ash underline underline-offset-2 hover:text-bone"
            >
              ← Zur Startseite
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <input
              autoFocus
              type="password"
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Neues Passwort (mind. 8 Zeichen)"
              minLength={8}
              autoComplete="new-password"
              required
              className="w-full rounded-xl border border-rivet bg-steel px-4 py-3.5 text-lg text-bone outline-none placeholder:text-ash/50 focus:border-blood"
            />
            <input
              type="password"
              name="confirm"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Nochmal zur Sicherheit"
              minLength={8}
              autoComplete="new-password"
              required
              className="w-full rounded-xl border border-rivet bg-steel px-4 py-3.5 text-lg text-bone outline-none placeholder:text-ash/50 focus:border-blood"
            />
            {error && (
              <p
                role="alert"
                className="rounded-xl border border-blood/40 bg-blood/10 px-4 py-3 text-sm text-blood"
              >
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={busy || token === undefined}
              className="w-full rounded-xl bg-blood px-4 py-3.5 font-metal text-lg uppercase tracking-wide text-black transition active:scale-[0.98] disabled:opacity-40"
            >
              {busy ? 'Moment …' : 'Passwort setzen & rein'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
