'use client';

import { useEffect, useState } from 'react';
import { enablePush, getPushPermission, getPushSupport } from '@/lib/client/push';
import { isInstallPromptVisible, onPromptSlotChange } from '@/lib/client/promptSlot';
import { useApp } from '@/lib/client/store';

/**
 * Aktives Opt-in-Banner "Mitteilungen aktivieren?" im Stil des
 * InstallPrompt: erscheint kurz nach dem App-Start einmalig für alle,
 * bei denen es sofort klappen kann – eingeloggt und in einer Gruppe,
 * Browser kann Push, Server hat VAPID-Keys, Permission noch
 * unentschieden. Der "Aktivieren"-Button ruft enablePush() direkt im
 * Tap auf, damit die Nutzer-Gesten-Kette (iOS-Pflicht) intakt bleibt.
 *
 * iOS im Safari-Tab bekommt dieses Banner bewusst NICHT: Dort gibt es
 * kein Web Push, solange die App nicht installiert ist. Den Hinweis
 * darauf sehen iOS-Nutzer stattdessen in der Install-Anleitung des
 * InstallPrompt und auf der Mitteilungs-Karte unter Gruppe & Konto.
 *
 * Install- und Push-Banner teilen sich dieselbe Position am unteren
 * Rand – der PushPrompt wartet deshalb, bis der Platz frei ist
 * (promptSlot), und kommt erst nach einer kurzen Schonfrist.
 */

const DISMISS_KEY = 'fb.pushPromptDismissed.v1';
/** Schonfrist nach App-Start bzw. nach dem Install-Banner */
const SHOW_DELAY_MS = 3000;

export function PushPrompt() {
  const { data, user } = useApp();
  const ready = Boolean(data && user);
  const [eligible, setEligible] = useState(false);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  // Kommt das Banner überhaupt in Frage? (einmalig, sobald Daten da sind)
  useEffect(() => {
    if (!ready || eligible) return;
    if (localStorage.getItem(DISMISS_KEY)) return;
    if (getPushSupport() !== 'ok' || getPushPermission() !== 'default') return;
    // Nur zeigen, wenn der Server Push überhaupt kann (VAPID konfiguriert)
    let cancelled = false;
    fetch('/api/push/vapid')
      .then((res) => {
        if (!cancelled && res.ok) setEligible(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [ready, eligible]);

  // Anzeigen, sobald der Banner-Platz frei ist – mit Verzögerung, damit
  // die App erst in Ruhe laden kann und nichts aufpoppt, während der
  // Nutzer gerade den Install-Hinweis liest.
  useEffect(() => {
    if (!eligible || show) return;
    let timer: number | undefined;
    const tryShow = () => {
      window.clearTimeout(timer);
      if (isInstallPromptVisible()) return;
      timer = window.setTimeout(() => {
        if (!isInstallPromptVisible()) setShow(true);
      }, SHOW_DELAY_MS);
    };
    const unsubscribe = onPromptSlotChange(tryShow);
    tryShow();
    return () => {
      unsubscribe();
      window.clearTimeout(timer);
    };
  }, [eligible, show]);

  if (!show) return null;

  // eligible muss mit zurück auf false: Der Anzeige-Effekt oben feuert bei
  // eligible && !show erneut und würde das Banner nach der Schonfrist
  // wieder einblenden – der Dismiss-Merker wird nur solange geprüft, wie
  // eligible noch nicht gesetzt ist.
  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, new Date().toISOString());
    setEligible(false);
    setShow(false);
  };

  const activate = async () => {
    setBusy(true);
    await enablePush();
    // Egal wie es ausging: nicht wieder nerven – der Schalter bleibt
    // jederzeit unter Gruppe & Konto erreichbar.
    localStorage.setItem(DISMISS_KEY, new Date().toISOString());
    setBusy(false);
    setEligible(false);
    setShow(false);
  };

  return (
    // data-inert-exempt: schwebt über offenen Sheets (BandSheet,
    // Mitteilungen – gleiche z-Ebene, aber später im DOM) und muss dort
    // tippbar bleiben statt von useModalDialog inert geschaltet zu werden.
    // Bewusst KEIN z-[60] wie beim UpdatePrompt: Beim GroupGate-Overlay
    // (liegt im DOM hinter der AppShell) ist der Coaster über den inerten
    // Vorfahren ohnehin deaktiviert und soll dann auch hinter dessen
    // Backdrop verschwinden statt tot darüber zu schweben.
    <div
      data-inert-exempt
      className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-lg"
    >
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
