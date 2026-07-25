'use client';

import { useEffect, type RefObject } from 'react';

/**
 * Android-Back-Button-Support für Bottom-Sheets (BandSheet,
 * AnnouncementsSheet): Beim Öffnen wird ein History-Eintrag gepusht,
 * sodass "Zurück" das Sheet schließt statt die (PWA-)App zu beenden.
 * Wird das Sheet anders geschlossen (Backdrop, Swipe, Escape), entfernt
 * ein history.back() den Eintrag wieder.
 *
 * Verschachtelung: Öffnet über einem Sheet ein weiteres Overlay mit
 * eigenem History-Eintrag (Mitteilungs-Detail über dem
 * AnnouncementsSheet), schließt "Zurück" nur die oberste Ebene. Dafür
 * führt das Modul einen Stack der offenen Ebenen – alle popstate-Listener
 * feuern, aber nur der oberste reagiert. Räumt eine Ebene ihren Eintrag
 * selbst per history.back() ab (z. B. Popup per Escape geschlossen),
 * wird dieser Pop unterdrückt, damit die darunterliegende Ebene ihn
 * nicht als Zurück-Geste deutet und sich mit schließt.
 *
 * StrictMode-fest (wichtig für `npm run dev`): reactStrictMode mountet
 * Effekte doppelt (Setup -> Cleanup -> Setup). Ein naives pushState/
 * back()-Paar pusht dabei zweimal, und das asynchrone back() aus dem
 * ersten Cleanup poppt den frischen Eintrag wieder weg – der popstate-
 * Handler schließt das Sheet direkt nach dem Öffnen. Deshalb wird das
 * Cleanup-back() um einen Tick aufgeschoben und modulweit gemerkt: Ein
 * unmittelbar folgender (Re-)Mount storniert es und übernimmt den
 * vorhandenen History-Eintrag, statt neu zu pushen. Modulweit statt pro
 * Instanz, damit auch Schließen + sofortiges Wiederöffnen (oder der
 * Wechsel zwischen zwei Sheets) keinen verwaisten back()-Sprung erzeugt
 * – es schließt bzw. öffnet ohnehin höchstens eine Ebene pro Tick.
 *
 * @param onCloseRef Ref auf den aktuellen onClose-Handler der Ebene.
 */

let pendingHistoryBack: ReturnType<typeof setTimeout> | null = null;

/** Offene Ebenen in Öffnungs-Reihenfolge – die oberste "besitzt" Zurück. */
const layers: object[] = [];

/**
 * Anzahl Pops aus eigenen Aufräum-back()-Aufrufen, die die verbleibende
 * oberste Ebene ignorieren muss statt sich selbst zu schließen.
 */
let suppressedPops = 0;

export function useSheetHistory(onCloseRef: RefObject<() => void>): void {
  useEffect(() => {
    if (pendingHistoryBack !== null) {
      clearTimeout(pendingHistoryBack);
      pendingHistoryBack = null;
    } else {
      window.history.pushState({ sheet: true }, '');
    }
    const layer = {};
    layers.push(layer);
    let closedByPop = false;
    const onPop = () => {
      // Nur die oberste Ebene reagiert – und genau sie verbraucht auch
      // die Unterdrückung, damit sie exakt einmal greift.
      if (layers[layers.length - 1] !== layer) return;
      if (suppressedPops > 0) {
        suppressedPops--;
        return;
      }
      closedByPop = true;
      onCloseRef.current();
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      const idx = layers.indexOf(layer);
      if (idx !== -1) layers.splice(idx, 1);
      // Aufgeschoben, damit ein sofortiger Remount es oben stornieren kann.
      if (!closedByPop) {
        pendingHistoryBack = setTimeout(() => {
          pendingHistoryBack = null;
          // Bleibt eine Ebene übrig (Popup zu, Sheet weiter offen), muss
          // sie diesen Pop ignorieren; ohne Ebene hört ihn niemand mehr.
          if (layers.length > 0) suppressedPops++;
          window.history.back();
        }, 0);
      }
    };
  }, [onCloseRef]);
}
