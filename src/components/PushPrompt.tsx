'use client';

import { useEffect, useState } from 'react';
import { enablePush, getPushPermission, getPushSupport } from '@/lib/client/push';
import { useApp } from '@/lib/client/store';

/**
 * Einmaliges Banner "Mitteilungen aktivieren?" im Stil von Install-/
 * UpdatePrompt. Erscheint nur, wenn es sofort klappen kann: eingeloggt und
 * in einer Gruppe, Browser kann Push, Server hat VAPID-Keys, Permission
 * noch unentschieden. Der Button ruft enablePush() direkt im Tap auf –
 * die Nutzer-Gesten-Kette (iOS-Pflicht) bleibt intakt.
 *
 * Damit es nicht mit dem InstallPrompt an derselben Stelle stapelt,
 * kommt es erst dran, wenn der Install-Hinweis erledigt ist (installiert
 * oder weggeklickt).
 */

const DISMISS_KEY = 'fb.pushPromptDismissed.v1';
const INSTALL_DISMISS_KEY = 'fb.installDismissed.v1';

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

export function PushPrompt() {
  const { data, user } = useApp();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!data || !user) return;
    if (localStorage.getItem(DISMISS_KEY)) return;
    if (getPushSupport() !== 'ok' || getPushPermission() !== 'default') return;
    if (!isStandalone() && !localStorage.getItem(INSTALL_DISMISS_KEY)) return;
    // Nur zeigen, wenn der Server Push überhaupt kann (VAPID konfiguriert)
    let cancelled = false;
    fetch('/api/push/vapid')
      .then((res) => {
        if (!cancelled && res.ok) setShow(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [data, user]);

  if (!show) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, new Date().toISOString());
    setShow(false);
  };

  const activate = async () => {
    setBusy(true);
    await enablePush();
    // Egal wie es ausging: nicht wieder nerven – der Schalter bleibt
    // jederzeit unter Gruppe & Konto erreichbar.
    localStorage.setItem(DISMISS_KEY, new Date().toISOString());
    setBusy(false);
    setShow(false);
  };

  return (
    <div className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-lg">
      <div className="rounded-2xl border border-blood/40 bg-steel p-4 shadow-2xl shadow-black/60">
        <div className="flex items-start gap-3">
          <span className="text-2xl leading-none">🔔</span>
          <div className="min-w-0 flex-1">
            <div className="font-metal text-sm font-black uppercase tracking-wide text-bone">
              Nichts mehr verpassen?
            </div>
            <p className="mt-1 text-xs leading-relaxed text-ash">
              Durchsagen vom Festival und Erinnerungen, bevor deine Bands
              starten – als Mitteilung direkt aufs Gerät, auch wenn die App
              zu ist.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => void activate()}
                disabled={busy}
                className="rounded-lg bg-blood px-4 py-2 text-sm font-bold text-black transition active:scale-[0.97] disabled:opacity-50"
              >
                Aktivieren
              </button>
              <button
                onClick={dismiss}
                className="rounded-lg border border-rivet bg-steel-2 px-4 py-2 text-sm font-semibold text-ash transition active:scale-[0.97]"
              >
                Später
              </button>
            </div>
          </div>
          <button
            onClick={dismiss}
            aria-label="Schließen"
            className="-mr-1 -mt-1 p-1 text-ash"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
