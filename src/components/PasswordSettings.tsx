'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  removePassword,
  setPassword as apiSetPassword,
} from '@/lib/client/password';
import {
  addPasskey,
  browserSupportsWebAuthn,
  deletePasskey,
  describeWebAuthnError,
  listPasskeys,
  type PasskeySummary,
} from '@/lib/client/webauthn';

const inputCls =
  'w-full rounded-xl border border-rivet bg-steel px-3.5 py-3 text-base text-bone outline-none placeholder:text-ash/50 focus:border-blood';
const linkCls = 'shrink-0 text-xs text-ash underline underline-offset-2 hover:text-bone';

/**
 * Konto-Abschnitt "Login & Sicherheit": beide Login-Wege verwalten –
 * Passkeys auflisten/hinzufügen/löschen und E-Mail+Passwort einrichten,
 * ändern oder wieder entfernen. Der letzte verbliebene Login-Weg lässt
 * sich nie entfernen (Client blendet es aus, der Server erzwingt es).
 * Liest den Stand selbst aus /api/me + /api/webauthn/credentials, der
 * App-Store hält davon bewusst nichts vor.
 */
export function PasswordSettings() {
  // undefined = lädt noch, null = kein Passwort hinterlegt
  const [email, setEmail] = useState<string | null | undefined>(undefined);
  const [passkeys, setPasskeys] = useState<PasskeySummary[] | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [formEmail, setFormEmail] = useState('');
  const [password, setPasswordInput] = useState('');
  const [current, setCurrent] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  // Erst nach dem Mount prüfen – kein window beim Server-Render
  const [waSupported, setWaSupported] = useState(false);

  useEffect(() => {
    setWaSupported(browserSupportsWebAuthn());
  }, []);

  const reload = useCallback(async () => {
    const [meRes, keys] = await Promise.all([
      fetch('/api/me', { cache: 'no-store' })
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null),
      listPasskeys().catch(() => undefined),
    ]);
    setEmail((meRes as { passwordEmail?: string | null } | null)?.passwordEmail ?? null);
    if (keys) setPasskeys(keys);
    else setPasskeys((prev) => prev ?? []);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const hasPassword = typeof email === 'string';
  const passkeyCount = passkeys?.length ?? 0;
  const loading = email === undefined || passkeys === undefined;

  const showFlash = (msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(null), 2500);
  };

  /** Destruktive/async Aktionen einheitlich abwickeln */
  const run = async (fn: () => Promise<void>, okMsg: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
      await reload();
      showFlash(okMsg);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Keine Verbindung – dafür braucht es Netz'
      );
    } finally {
      setBusy(false);
    }
  };

  const onAddPasskey = () =>
    run(async () => {
      try {
        await addPasskey();
      } catch (err) {
        // WebAuthn-Fehler in verständliche Meldungen übersetzen;
        // null = bewusster Abbruch, kein anzeigewürdiger Fehler
        const msg = describeWebAuthnError(err);
        if (msg) throw new Error(msg);
      }
    }, 'Passkey angelegt');

  const onDeletePasskey = (id: string, label: string) => {
    if (!confirm(`${label} wirklich entfernen? Damit kannst du dich dann nicht mehr einloggen.`)) return;
    void run(() => deletePasskey(id), 'Passkey entfernt');
  };

  const onRemovePassword = () => {
    if (!confirm('Login mit E-Mail & Passwort wirklich entfernen? Du kommst dann nur noch per Passkey rein.'))
      return;
    void run(() => removePassword(), 'Passwort-Login entfernt');
  };

  const toggleForm = () => {
    setOpen((v) => !v);
    setError(null);
    setFormEmail(email ?? '');
    setPasswordInput('');
    setCurrent('');
  };

  const submitForm = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await apiSetPassword({
        email: formEmail.trim(),
        password,
        ...(hasPassword ? { currentPassword: current } : {}),
      });
      setOpen(false);
    }, 'Gespeichert – Login mit E-Mail & Passwort ist aktiv');
  };

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

  return (
    <div className="mb-3 rounded-xl border border-rivet bg-steel p-3.5">
      <div className="flex items-center gap-2.5">
        <span aria-hidden className="text-xl">
          🔐
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-bone">Login &amp; Sicherheit</div>
          <div className="text-[11px] text-ash">
            {loading
              ? 'Lade …'
              : `${passkeyCount} Passkey${passkeyCount === 1 ? '' : 's'}${
                  hasPassword ? ` · E-Mail & Passwort (${email})` : ''
                }`}
          </div>
        </div>
      </div>

      {flash && (
        <p className="mt-2.5 rounded-lg border border-rivet bg-steel-2 px-3 py-2 text-xs text-bone">
          {flash}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="mt-2.5 rounded-lg border border-blood/40 bg-blood/10 px-3 py-2 text-xs text-blood"
        >
          {error}
        </p>
      )}

      {!loading && (
        <>
          {/* --- Passkeys --- */}
          <div className="mt-3 space-y-1.5">
            {(passkeys ?? []).map((p, i) => {
              const label = `Passkey vom ${fmtDate(p.createdAt)}`;
              // Letzter Login-Weg? Dann kein Entfernen anbieten.
              const removable = hasPassword || passkeyCount > 1;
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-2 rounded-lg border border-rivet bg-steel-2 px-3 py-2"
                >
                  <span aria-hidden className="text-sm">
                    🔑
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-bone">
                    {label}
                    {passkeyCount > 1 ? ` (${i + 1}/${passkeyCount})` : ''}
                  </span>
                  {removable ? (
                    <button
                      onClick={() => onDeletePasskey(p.id, label)}
                      disabled={busy}
                      className={linkCls}
                    >
                      Entfernen
                    </button>
                  ) : (
                    <span className="shrink-0 text-[10px] text-ash/60">
                      einziger Login-Weg
                    </span>
                  )}
                </div>
              );
            })}
            {waSupported && (
              <button
                onClick={onAddPasskey}
                disabled={busy}
                className="w-full rounded-lg border border-dashed border-rivet px-3 py-2 text-xs font-semibold text-ash transition active:scale-[0.99] disabled:opacity-50"
              >
                + Passkey hinzufügen{passkeyCount === 0 ? ' (empfohlen)' : ''}
              </button>
            )}
          </div>

          {/* --- E-Mail & Passwort --- */}
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-rivet bg-steel-2 px-3 py-2">
            <span aria-hidden className="text-sm">
              ✉️
            </span>
            <span className="min-w-0 flex-1 truncate text-xs text-bone">
              {hasPassword ? `E-Mail & Passwort (${email})` : 'E-Mail & Passwort'}
            </span>
            <button onClick={toggleForm} disabled={busy} className={linkCls}>
              {open ? 'Abbrechen' : hasPassword ? 'Ändern' : 'Einrichten'}
            </button>
            {hasPassword &&
              !open &&
              (passkeyCount > 0 ? (
                <button onClick={onRemovePassword} disabled={busy} className={linkCls}>
                  Entfernen
                </button>
              ) : (
                <span className="shrink-0 text-[10px] text-ash/60">
                  einziger Login-Weg
                </span>
              ))}
          </div>

          {open && (
            <form onSubmit={submitForm} className="mt-3 space-y-2.5">
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
                placeholder={
                  hasPassword ? 'Neues Passwort (mind. 8 Zeichen)' : 'Passwort (mind. 8 Zeichen)'
                }
                minLength={8}
                autoComplete="new-password"
                required
                className={inputCls}
              />
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-xl bg-blood px-4 py-3 font-metal text-base uppercase tracking-wide text-black transition active:scale-[0.98] disabled:opacity-40"
              >
                {busy ? 'Moment …' : 'Speichern'}
              </button>
            </form>
          )}
        </>
      )}
    </div>
  );
}
