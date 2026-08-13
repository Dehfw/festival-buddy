'use client';

import { useId, useRef } from 'react';
import { useModalDialog } from '@/lib/client/useModalDialog';

/**
 * In-App-Bestätigungsdialog für alle destruktiven bzw. weitreichenden
 * Aktionen (Löschen, Mitteilung an alle, Gruppe verlassen, Abmelden, …).
 *
 * Bewusst KEIN window.confirm(): Installierte PWAs (Standalone-Modus,
 * v. a. iOS-Homescreen) unterdrücken native Dialoge teils stumm –
 * confirm() liefert dann sofort false und der Tap auf den auslösenden
 * Button bewirkt scheinbar gar nichts. Desktop-Browser schalten confirm()
 * außerdem dauerhaft ab, sobald jemand einmal „weitere Dialoge
 * verhindern“ angehakt hat. Deshalb bestätigt die App grundsätzlich über
 * dieses Overlay.
 */
export interface ConfirmRequest {
  title: string;
  /** Folge der Aktion; entfällt, wenn der Titel schon alles sagt */
  message?: string;
  /** Besucher-Einträge, die mit gelöscht würden – > 0 gibt eine deutliche Warnung */
  affectedSelections?: number;
  /** Hinweis ohne Lösch-Drama (z. B. "X Eingetragene bekommen einen Push") */
  notice?: string;
  confirmLabel: string;
  onConfirm: () => void;
}

export function ConfirmDialog({
  req,
  onClose,
}: {
  req: ConfirmRequest;
  onClose: () => void;
}) {
  const titleId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // Fokus-Falle, Escape, Hintergrund inert, Scroll-Sperre – wie die Sheets
  useModalDialog({ onClose, dialogRef, containerRef });

  const affected = req.affectedSelections ?? 0;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-sm rounded-2xl border border-rivet bg-steel p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id={titleId} className="font-metal text-lg font-black uppercase">
          {req.title}
        </h3>
        {req.message && <p className="mt-2 text-sm text-ash">{req.message}</p>}
        {affected > 0 && (
          <p className="mt-3 rounded-xl border border-blood/60 bg-blood/10 px-3 py-2 text-sm font-bold text-blood">
            ⚠️ Daran hängen bereits {affected}{' '}
            {affected === 1 ? 'Eintrag' : 'Einträge'} von Besuchern
            (Zusagen/Interessen samt Treffpunkt-Markern) – die werden
            unwiderruflich mit gelöscht!
          </p>
        )}
        {req.notice && (
          <p className="mt-3 rounded-xl border border-ember/60 bg-ember/10 px-3 py-2 text-sm font-bold text-ember">
            {req.notice}
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-rivet px-4 py-2.5 text-sm font-bold text-ash"
          >
            Abbrechen
          </button>
          <button
            onClick={() => {
              req.onConfirm();
              onClose();
            }}
            className="flex-1 rounded-xl bg-blood px-4 py-2.5 text-sm font-bold uppercase text-black"
          >
            {req.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
