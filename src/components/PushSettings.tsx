'use client';

import { useEffect, useState } from 'react';
import {
  disablePush,
  enablePush,
  getActiveSubscription,
  getPushPermission,
  getPushSupport,
  type PushSupport,
} from '@/lib/client/push';

/**
 * Konto-Karte "Mitteilungen": Push auf diesem Gerät an-/abschalten.
 * Rendert nichts, wenn Push auf dem Server nicht konfiguriert ist (kein
 * VAPID-Key) oder der Browser es nicht kann – außer auf iOS im Safari-Tab,
 * wo stattdessen der Hinweis auf die installierte App steht.
 */
export function PushSettings() {
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const s = getPushSupport();
    setSupport(s);
    setPermission(getPushPermission());
    fetch('/api/push/vapid')
      .then((res) => setConfigured(res.ok))
      .catch(() => setConfigured(false));
    if (s === 'ok') {
      void getActiveSubscription().then((sub) => setEnabled(Boolean(sub)));
    }
  }, []);

  // Server ohne VAPID-Keys oder Browser ohne jede Chance -> Karte weglassen
  if (support === null || configured === null) return null;
  if (!configured || support === 'unsupported') return null;

  const toggle = async () => {
    setBusy(true);
    setError('');
    if (enabled) {
      await disablePush();
      setEnabled(false);
    } else {
      const result = await enablePush();
      setPermission(getPushPermission());
      if (result === 'enabled') setEnabled(true);
      else if (result === 'denied') {
        // Hinweis unten übernimmt (permission === 'denied')
      } else {
        setError('Aktivieren hat nicht geklappt – später nochmal versuchen.');
      }
    }
    setBusy(false);
  };

  return (
    <div className="mb-3 rounded-xl border border-rivet bg-steel p-3.5">
      <div className="flex items-center gap-2.5">
        <span className="text-2xl leading-none" aria-hidden>
          🔔
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-bone">Mitteilungen</div>
          <div className="text-[11px] text-ash">
            Durchsagen vom Festival & Erinnerungen an deine Bands – auch bei
            geschlossener App
          </div>
        </div>
      </div>
      {support === 'ios-needs-install' ? (
        <p className="mt-3 text-xs leading-relaxed text-ash">
          Auf dem iPhone gibt&apos;s Mitteilungen nur für die installierte App:
          Tippe in Safari auf <b className="text-bone">Teilen</b>{' '}
          <span aria-hidden>(📤)</span> und dann auf{' '}
          <b className="text-bone">„Zum Home-Bildschirm“</b> – danach kannst du
          sie hier aktivieren.
        </p>
      ) : permission === 'denied' && !enabled ? (
        <p className="mt-3 text-xs leading-relaxed text-ash">
          Mitteilungen sind im Browser blockiert. Erlaube sie in den
          Website-Einstellungen deines Browsers, dann kannst du sie hier
          aktivieren.
        </p>
      ) : (
        <div className="mt-3">
          {enabled ? (
            <div className="flex items-center gap-2">
              <span className="flex-1 text-xs font-semibold text-bone">
                Auf diesem Gerät aktiviert ✓
              </span>
              <button
                onClick={() => void toggle()}
                disabled={busy}
                className="rounded-lg border border-rivet bg-steel-2 px-4 py-2 text-sm font-semibold text-ash transition active:scale-[0.97] disabled:opacity-50"
              >
                Deaktivieren
              </button>
            </div>
          ) : (
            <button
              onClick={() => void toggle()}
              disabled={busy}
              className="rounded-lg bg-blood px-4 py-2 text-sm font-bold text-black transition active:scale-[0.97] disabled:opacity-50"
            >
              Mitteilungen aktivieren
            </button>
          )}
          {error && <p className="mt-2 text-xs text-blood">{error}</p>}
        </div>
      )}
    </div>
  );
}
