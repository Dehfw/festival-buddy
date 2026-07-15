'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Registriert den Service Worker und zeigt einen dezenten Hinweis, sobald
 * eine neue Version bereitsteht (der neue SW ist installiert und wartet).
 *
 *  - Auf "Neu laden" schicken wir dem wartenden SW {type:'SKIP_WAITING'}.
 *    Er aktiviert sich, übernimmt via clients.claim() -> controllerchange,
 *    und wir laden die Seite genau einmal neu.
 *  - Beim allerersten Besuch (noch kein Controller) gibt es keinen Hinweis
 *    und keinen automatischen Reload – nur echte Updates lösen ihn aus.
 *  - Alle paar Stunden und beim Zurückkommen in den Vordergrund fragen wir
 *    aktiv nach Updates (die PWA bleibt oft tagelang offen).
 */
export function UpdatePrompt() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const applyingRef = useRef(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let reg: ServiceWorkerRegistration | null = null;

    const trackInstalling = (sw: ServiceWorker | null) => {
      if (!sw) return;
      sw.addEventListener('statechange', () => {
        // "installed" + vorhandener Controller = es lief schon eine Version,
        // also ein echtes Update (kein Erstinstall).
        if (sw.state === 'installed' && navigator.serviceWorker.controller) {
          setWaiting(sw);
        }
      });
    };

    navigator.serviceWorker
      .register('/sw.js')
      .then((r) => {
        reg = r;
        if (r.waiting && navigator.serviceWorker.controller) setWaiting(r.waiting);
        r.addEventListener('updatefound', () => trackInstalling(r.installing));
      })
      .catch(() => {});

    const checkForUpdate = () => reg?.update().catch(() => {});
    const interval = window.setInterval(checkForUpdate, 60 * 60 * 1000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') checkForUpdate();
    };
    document.addEventListener('visibilitychange', onVisible);

    const onControllerChange = () => {
      // Nur neu laden, wenn WIR das Update angestoßen haben – nicht beim
      // Erstinstall (clients.claim löst controllerchange auch dort aus).
      if (applyingRef.current) window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      navigator.serviceWorker.removeEventListener(
        'controllerchange',
        onControllerChange
      );
    };
  }, []);

  if (!waiting) return null;

  const reload = () => {
    applyingRef.current = true;
    waiting.postMessage({ type: 'SKIP_WAITING' });
  };

  return (
    <div className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-lg">
      <div className="rounded-2xl border border-blood/40 bg-steel p-4 shadow-2xl shadow-black/60">
        <div className="flex items-start gap-3">
          <span className="text-2xl leading-none">⚡</span>
          <div className="min-w-0 flex-1">
            <div className="font-metal text-sm font-black uppercase tracking-wide text-bone">
              Neue Version verfügbar
            </div>
            <p className="mt-1 text-xs leading-relaxed text-ash">
              Es gibt ein Update vom Festival Buddy. Kurz neu laden, dann bist
              du auf dem neuesten Stand – deine Auswahl bleibt erhalten.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={reload}
                className="rounded-lg bg-blood px-4 py-2 text-sm font-bold text-black transition active:scale-[0.97]"
              >
                Neu laden
              </button>
              <button
                onClick={() => setWaiting(null)}
                className="rounded-lg border border-rivet bg-steel-2 px-4 py-2 text-sm font-semibold text-ash transition active:scale-[0.97]"
              >
                Später
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
