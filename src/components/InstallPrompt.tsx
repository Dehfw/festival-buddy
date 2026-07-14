'use client';

import { useEffect, useState } from 'react';

/**
 * Install-Popup für die PWA: fragt einmalig, ob die App auf dem
 * Homescreen/Desktop installiert werden soll.
 *
 *  - Chrome/Edge/Android: natives beforeinstallprompt-Event abfangen und
 *    hinter unserem eigenen Popup auslösen.
 *  - iOS Safari kennt das Event nicht -> Anleitung "Teilen > Zum
 *    Home-Bildschirm" anzeigen.
 *  - Läuft die App schon standalone (installiert) oder wurde das Popup
 *    weggeklickt, kommt es nicht wieder.
 */

const DISMISS_KEY = 'fb.installDismissed.v1';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

export function InstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [iosGuide, setIosGuide] = useState(false);

  useEffect(() => {
    if (isStandalone() || localStorage.getItem(DISMISS_KEY)) return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    const onInstalled = () => {
      localStorage.setItem(DISMISS_KEY, new Date().toISOString());
      setShow(false);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

    // iOS Safari: kein beforeinstallprompt -> nach kurzer Schonfrist
    // die Anleitung zeigen
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    let timer: number | undefined;
    if (isIos) {
      timer = window.setTimeout(() => {
        setIosGuide(true);
        setShow(true);
      }, 3000);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
      if (timer) clearTimeout(timer);
    };
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, new Date().toISOString());
    setShow(false);
  };

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    // Egal wie entschieden wurde: nicht weiter nerven
    await installEvent.userChoice.catch(() => undefined);
    localStorage.setItem(DISMISS_KEY, new Date().toISOString());
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-lg">
      <div className="rounded-2xl border border-blood/40 bg-steel p-4 shadow-2xl shadow-black/60">
        <div className="flex items-start gap-3">
          <span className="text-2xl leading-none">🤘</span>
          <div className="min-w-0 flex-1">
            <div className="font-metal text-sm font-black uppercase tracking-wide text-bone">
              Als App installieren?
            </div>
            {iosGuide ? (
              <p className="mt-1 text-xs leading-relaxed text-ash">
                Hol dir den Festival Buddy auf den Home-Bildschirm: Tippe in
                Safari auf <b className="text-bone">Teilen</b>{' '}
                <span aria-hidden>(📤)</span> und dann auf{' '}
                <b className="text-bone">„Zum Home-Bildschirm“</b> – startet
                schneller und läuft auch offline im Infield.
              </p>
            ) : (
              <p className="mt-1 text-xs leading-relaxed text-ash">
                Festival Buddy auf Homescreen bzw. Desktop installieren –
                startet schneller und läuft auch offline im Infield.
              </p>
            )}
            <div className="mt-3 flex gap-2">
              {!iosGuide && (
                <button
                  onClick={() => void install()}
                  className="rounded-lg bg-blood px-4 py-2 text-sm font-bold text-black transition active:scale-[0.97]"
                >
                  Installieren
                </button>
              )}
              <button
                onClick={dismiss}
                className="rounded-lg border border-rivet bg-steel-2 px-4 py-2 text-sm font-semibold text-ash transition active:scale-[0.97]"
              >
                {iosGuide ? 'Alles klar' : 'Später'}
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
