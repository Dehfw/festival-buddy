'use client';

import { useEffect, useRef, type RefObject } from 'react';

/**
 * Android-Back-Button-Support für Bottom-Sheets: Beim Öffnen wird ein
 * History-Eintrag gepusht, sodass "Zurück" das Sheet schließt statt die
 * (PWA-)App zu beenden. Wird das Sheet anders geschlossen (Backdrop,
 * Swipe, Escape), entfernt ein history.back() den Eintrag wieder.
 *
 * StrictMode-fest (wichtig für `npm run dev`): React mountet Effekte im
 * Dev-StrictMode doppelt (mount → cleanup → mount). Ein naives
 * pushState/back-Paar feuert dabei ein verspätetes popstate vom eigenen
 * Cleanup-back(), das das frisch geöffnete Sheet sofort wieder schließt.
 * Deshalb läuft das Aufräum-back() über einen setTimeout(0), den der
 * synchron folgende Re-Mount wieder cancelt, und gepusht wird pro
 * Sheet-Instanz höchstens einmal (pushedRef).
 *
 * @param onCloseRef Ref auf den aktuellen onClose-Handler des Sheets.
 */
export function useSheetHistory(onCloseRef: RefObject<() => void>): void {
  const pushedRef = useRef(false);
  const backTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    // Ein vom StrictMode-Fake-Unmount geplantes back() abfangen – der
    // History-Eintrag gehört weiterhin dieser Sheet-Instanz.
    window.clearTimeout(backTimerRef.current);
    if (!pushedRef.current) {
      window.history.pushState({ sheet: true }, '');
      pushedRef.current = true;
    }
    let closedByPop = false;
    const onPop = () => {
      closedByPop = true;
      pushedRef.current = false;
      onCloseRef.current();
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      if (!closedByPop) {
        backTimerRef.current = window.setTimeout(() => {
          pushedRef.current = false;
          window.history.back();
        }, 0);
      }
    };
  }, [onCloseRef]);
}
