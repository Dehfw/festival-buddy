'use client';

import { useEffect, type RefObject } from 'react';

/**
 * Swipe-down zum Schließen für Bottom-Sheets (BandSheet,
 * AnnouncementsSheet): Das Sheet folgt dem Finger, ab genug Weg oder
 * Geschwindigkeit wird geschlossen, sonst schnappt es zurück. Gezogen
 * wird nur, wenn klar nach unten gewischt wird und der Inhalt ganz oben
 * steht – sonst bleibt das normale Scrollen im Sheet unberührt.
 *
 * @param sheetRef   Das Sheet-Element (der scrollbare Dialog-Container).
 * @param onCloseRef Ref auf den aktuellen onClose-Handler des Sheets.
 * @param enabled    false, solange das Sheet noch nicht gerendert ist.
 */
export function useSheetDrag(
  sheetRef: RefObject<HTMLElement | null>,
  onCloseRef: RefObject<() => void>,
  enabled = true
): void {
  useEffect(() => {
    if (!enabled) return;
    const el = sheetRef.current;
    if (!el) return;
    let startY = 0;
    let lastY = 0;
    let lastT = 0;
    let velocity = 0; // px/ms
    let offset = 0;
    let tracking = false;
    let dragging = false;

    const settle = (transform: string) => {
      el.style.transition = 'transform 0.2s ease';
      el.style.transform = transform;
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      tracking = true;
      dragging = false;
      startY = lastY = e.touches[0].clientY;
      lastT = e.timeStamp;
      velocity = 0;
      offset = 0;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!tracking) return;
      const y = e.touches[0].clientY;
      const dy = y - startY;
      if (!dragging) {
        // Erst ziehen, wenn klar nach unten gewischt wird und der Inhalt
        // ganz oben steht – sonst normales Scrollen zulassen.
        if (dy > 10 && el.scrollTop <= 0) {
          dragging = true;
          startY = y;
          el.style.transition = 'none';
        } else if (dy < -10 || el.scrollTop > 0) {
          tracking = false;
          return;
        } else {
          return;
        }
      }
      e.preventDefault();
      const dt = e.timeStamp - lastT;
      if (dt > 0) velocity = (y - lastY) / dt;
      lastY = y;
      lastT = e.timeStamp;
      offset = Math.max(0, y - startY);
      el.style.transform = `translateY(${offset}px)`;
    };

    const onTouchEnd = () => {
      tracking = false;
      if (!dragging) return;
      dragging = false;
      if (offset > 96 || velocity > 0.5) {
        settle('translateY(105%)');
        setTimeout(() => onCloseRef.current(), 180);
      } else {
        settle('');
      }
    };

    const onTouchCancel = () => {
      tracking = false;
      if (!dragging) return;
      dragging = false;
      settle('');
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    // passive: false, damit preventDefault() das Scrollen/Pull-to-Refresh
    // während des Ziehens unterbindet.
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchCancel);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchCancel);
    };
  }, [enabled, sheetRef, onCloseRef]);
}
