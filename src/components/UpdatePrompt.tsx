'use client';

import { usePathname } from 'next/navigation';
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
  const pathname = usePathname();
  // Das Website-Embed (/embed) läuft im iframe fremder Seiten: dort weder
  // den Service Worker registrieren noch ein Update-Banner einblenden.
  const isEmbed = pathname?.startsWith('/embed') ?? false;
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [applying, setApplying] = useState(false);
  const applyingRef = useRef(false);
  const fallbackRef = useRef<number | null>(null);

  useEffect(() => {
    if (isEmbed) return;
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
      if (fallbackRef.current !== null) clearTimeout(fallbackRef.current);
      document.removeEventListener('visibilitychange', onVisible);
      navigator.serviceWorker.removeEventListener(
        'controllerchange',
        onControllerChange
      );
    };
  }, [isEmbed]);

  if (isEmbed || !waiting) return null;

  const reload = () => {
    if (applyingRef.current) return;
    applyingRef.current = true;
    setApplying(true);
    waiting.postMessage({ type: 'SKIP_WAITING' });
    // Falls controllerchange ausbleibt (SW hängt, Message verloren), laden
    // wir trotzdem neu, damit der Dialog nicht dauerhaft blockiert bleibt.
    fallbackRef.current = window.setTimeout(() => window.location.reload(), 8000);
  };

  return (
    // data-inert-exempt + z-[60]: Der Hinweis schwebt auch über offenen
    // Sheets (z. B. BandSheet, z-50) und muss dort tippbar bleiben – ohne
    // die Ausnahme schaltet useModalDialog ihn mit dem restlichen
    // Hintergrund inert und "Neu laden" verschluckt jeden Tap.
    <div
      data-inert-exempt
      className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[60] mx-auto max-w-lg"
    >
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
                type="button"
                onClick={reload}
                disabled={applying}
                className="flex items-center gap-2 rounded-lg bg-blood px-4 py-2 text-sm font-bold text-black transition active:scale-[0.97] disabled:opacity-70"
              >
                {applying && (
                  <span
                    aria-hidden
                    className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-black/30 border-t-black"
                  />
                )}
                {applying ? 'Lädt neu …' : 'Neu laden'}
              </button>
              <button
                type="button"
                onClick={() => setWaiting(null)}
                disabled={applying}
                className="rounded-lg border border-rivet bg-steel-2 px-4 py-2 text-sm font-semibold text-ash transition active:scale-[0.97] disabled:opacity-40"
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
