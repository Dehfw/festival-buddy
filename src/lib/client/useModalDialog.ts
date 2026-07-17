'use client';

import { useEffect, useRef, type RefObject } from 'react';

/**
 * Tastaturfokussierbare Elemente innerhalb eines Dialogs (kein positives
 * tabindex im Projekt, daher entspricht DOM-Reihenfolge der Tab-Reihenfolge).
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/** Sichtbare, fokussierbare Elemente im Dialog in Tab-Reihenfolge. */
function focusablesIn(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.getClientRects().length > 0
  );
}

/**
 * Alles außerhalb des Overlays inert schalten: vom Overlay-Container aus
 * werden auf jeder Ebene bis zum <body> alle Geschwister deaktiviert.
 * Gibt eine Funktion zurück, die genau die selbst gesetzten inert-Attribute
 * wieder entfernt (bereits inerte Elemente bleiben unberührt).
 */
function inertSiblings(el: HTMLElement): () => void {
  const made: HTMLElement[] = [];
  for (
    let node: HTMLElement = el;
    node.parentElement && node !== document.body;
    node = node.parentElement
  ) {
    for (const sib of Array.from(node.parentElement.children)) {
      if (sib === node || !(sib instanceof HTMLElement)) continue;
      if (sib.hasAttribute('inert')) continue;
      sib.setAttribute('inert', '');
      made.push(sib);
    }
  }
  return () => {
    for (const sib of made) sib.removeAttribute('inert');
  };
}

/**
 * Gemeinsames Verhalten für modale Overlays (WAI-ARIA Modal-Dialog-Pattern):
 *
 * - merkt sich den Auslöser (document.activeElement) und gibt ihm beim
 *   Schließen den Fokus zurück – egal ob per Escape, Backdrop, Swipe oder
 *   Android-Back geschlossen wurde (Fallback: ist der Auslöser inzwischen
 *   aus dem DOM entfernt, bleibt der Fokus am <body>);
 * - setzt den initialen Fokus in den Dialog (initialFocusRef, sonst das
 *   erste fokussierbare Element, sonst der Dialog selbst);
 * - hält Tab/Shift+Tab innerhalb des Dialogs (Focus Trap);
 * - schließt per Escape;
 * - schaltet den Hintergrund inert (nicht fokussier-/klickbar);
 * - sperrt das Scrollen des <body>.
 *
 * `role="dialog"`, `aria-modal` und die Beschriftung setzt die jeweilige
 * Komponente selbst auf dem Element hinter `dialogRef`.
 *
 * @param dialogRef      Element mit der Dialogrolle; Grenze des Focus Traps.
 * @param containerRef   Optional: äußerster Overlay-Container (z. B. mit
 *                       Backdrop). Alles außerhalb wird inert; ohne Angabe
 *                       gilt das Dialog-Element selbst als Grenze.
 * @param initialFocusRef Optional: Element, das beim Öffnen den Fokus erhält.
 * @param enabled        false deaktiviert das komplette Verhalten (z. B. für
 *                       die nicht-modale Full-Page-Variante des GroupGate).
 */
export function useModalDialog({
  onClose,
  dialogRef,
  containerRef,
  initialFocusRef,
  enabled = true,
}: {
  onClose: () => void;
  dialogRef: RefObject<HTMLElement | null>;
  containerRef?: RefObject<HTMLElement | null>;
  initialFocusRef?: RefObject<HTMLElement | null>;
  enabled?: boolean;
}): void {
  // onClose in einer Ref halten, damit der Effekt nicht bei jedem Render
  // neu registriert wird (onClose kommt oft als Inline-Arrow rein).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!enabled) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    // Auslöser merken, bevor der Fokus in den Dialog wandert.
    const trigger =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const initial = initialFocusRef?.current ?? focusablesIn(dialog)[0] ?? dialog;
    initial.focus();

    const restoreInert = inertSiblings(containerRef?.current ?? dialog);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const el = dialogRef.current;
      if (!el) return;
      const items = focusablesIn(el);
      if (items.length === 0) {
        e.preventDefault();
        el.focus();
        return;
      }
      const active = document.activeElement;
      const idx = active instanceof HTMLElement ? items.indexOf(active) : -1;
      // Mitten in der Liste: der Browser-Standard bleibt im Dialog.
      if (e.shiftKey ? idx > 0 : idx !== -1 && idx < items.length - 1) return;
      e.preventDefault();
      if (idx !== -1) {
        // Am Rand der Liste: zyklisch weiterreichen.
        (e.shiftKey ? items[items.length - 1] : items[0]).focus();
        return;
      }
      // Fokus liegt auf keinem tab-baren Element (z. B. Titel mit
      // tabIndex=-1, der Dialog selbst oder außerhalb): das in DOM-
      // Reihenfolge nächste bzw. vorherige Element wählen, sonst zyklisch.
      const before = (a: Node, b: Node) =>
        !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
      const target = e.shiftKey
        ? (active instanceof Node &&
            [...items].reverse().find((it) => before(it, active))) ||
          items[items.length - 1]
        : (active instanceof Node && items.find((it) => before(active, it))) ||
          items[0];
      target.focus();
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      // Erst den Hintergrund reaktivieren, dann fokussieren –
      // inerte Elemente können keinen Fokus annehmen.
      restoreInert();
      document.body.style.overflow = prevOverflow;
      if (trigger?.isConnected) trigger.focus();
    };
  }, [enabled, dialogRef, containerRef, initialFocusRef]);
}
