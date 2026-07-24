'use client';

import { useEffect, type RefObject } from 'react';

/**
 * Android-Back-Button-Support für Bottom-Sheets (BandSheet,
 * AnnouncementsSheet): Beim Öffnen wird ein History-Eintrag gepusht,
 * sodass "Zurück" das Sheet schließt statt die (PWA-)App zu beenden.
 * Wird das Sheet anders geschlossen (Backdrop, Swipe, Escape), entfernt
 * ein history.back() den Eintrag wieder.
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
 * – es ist ohnehin höchstens ein Sheet gleichzeitig offen.
 *
 * @param onCloseRef Ref auf den aktuellen onClose-Handler des Sheets.
 */

let pendingHistoryBack: ReturnType<typeof setTimeout> | null = null;

export function useSheetHistory(onCloseRef: RefObject<() => void>): void {
  useEffect(() => {
    if (pendingHistoryBack !== null) {
      clearTimeout(pendingHistoryBack);
      pendingHistoryBack = null;
    } else {
      window.history.pushState({ sheet: true }, '');
    }
    let closedByPop = false;
    const onPop = () => {
      closedByPop = true;
      onCloseRef.current();
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      // Aufgeschoben, damit ein sofortiger Remount es oben stornieren kann.
      if (!closedByPop) {
        pendingHistoryBack = setTimeout(() => {
          pendingHistoryBack = null;
          window.history.back();
        }, 0);
      }
    };
  }, [onCloseRef]);
}
