'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ConfirmDialog,
  type ConfirmRequest,
} from '@/components/ConfirmDialog';
import { formatAgo, type AnnouncementWithAuthor } from '@/lib/types';

/** Muss zu PUSH_TITLE_MAX/PUSH_BODY_MAX in src/lib/push.ts passen. */
const TITLE_MAX = 80;
const BODY_MAX = 500;

/**
 * Veranstalter-Tab "Mitteilungen": Durchsage an alle Mitglieder aller
 * Gruppen des Festivals verfassen. Der Server persistiert sie (in-App für
 * alle sichtbar, mit oder ohne Push) und pusht an alle Abos; als Absender
 * erscheint der Festivalname. Darunter der Verlauf bisheriger Mitteilungen –
 * hier (und nur hier) mit dem Konto, das gesendet hat, plus Löschen:
 * Gelöschte Mitteilungen verschwinden beim nächsten Poll aus der App aller
 * Nutzer; bereits zugestellte Pushes lassen sich nicht zurückholen.
 */
export function AnnouncementComposer({ festivalId }: { festivalId: string }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<AnnouncementWithAuthor[] | null>(null);
  // In-App-Bestätigung statt window.confirm – siehe ConfirmDialog.tsx
  const [confirmReq, setConfirmReq] = useState<ConfirmRequest | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/organizer/announcement?festival=${encodeURIComponent(festivalId)}`,
        { cache: 'no-store' }
      );
      if (!res.ok) return;
      const data = (await res.json()) as { announcements: AnnouncementWithAuthor[] };
      setHistory(data.announcements);
    } catch {
      // Verlauf ist nice-to-have – Senden funktioniert auch ohne
    }
  }, [festivalId]);

  useEffect(() => {
    setHistory(null);
    void loadHistory();
  }, [loadHistory]);

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    setConfirmReq({
      title: 'An alle senden?',
      message:
        'Diese Mitteilung geht an ALLE Mitglieder aller Gruppen dieses Festivals – in der App und als Push.',
      confirmLabel: 'Senden',
      onConfirm: () => void doSend(),
    });
  };

  const doSend = async () => {
    setBusy(true);
    setStatus('Sende …');
    try {
      const res = await fetch('/api/organizer/announcement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ festivalId, title, body }),
      });
      const data = await res.json().catch(() => null);
      if (res.status === 429) {
        setStatus('Zu viele Mitteilungen – bitte kurz warten');
      } else if (!res.ok) {
        setStatus(data?.error ?? 'Fehler beim Senden');
      } else {
        const sent = data?.push?.sent ?? 0;
        setStatus(
          `✓ Gesendet – ${sent} Push-Gerät${sent === 1 ? '' : 'e'} erreicht; in der App sehen sie alle.`
        );
        setTitle('');
        setBody('');
        void loadHistory();
      }
    } catch {
      setStatus('Keine Verbindung');
    }
    setBusy(false);
  };

  const remove = (a: AnnouncementWithAuthor) => {
    setConfirmReq({
      title: 'Mitteilung löschen?',
      message: `„${a.title}“ für alle löschen? Die Mitteilung verschwindet aus der App aller Nutzer – bereits zugestellte Push-Benachrichtigungen lassen sich aber nicht zurückholen.`,
      confirmLabel: 'Löschen',
      onConfirm: () => void doRemove(a),
    });
  };

  const doRemove = async (a: AnnouncementWithAuthor) => {
    try {
      const res = await fetch(
        `/api/organizer/announcement?festival=${encodeURIComponent(festivalId)}&id=${encodeURIComponent(a.id)}`,
        { method: 'DELETE' }
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setStatus(data?.error ?? 'Löschen fehlgeschlagen');
        return;
      }
      setHistory((prev) => (prev ? prev.filter((x) => x.id !== a.id) : prev));
    } catch {
      setStatus('Keine Verbindung');
    }
  };

  return (
    // Desktop: Formular links, Verlauf rechts daneben statt darunter
    <div className="mt-4 md:grid md:grid-cols-2 md:items-start md:gap-8 lg:gap-10">
      <form onSubmit={send} className="space-y-3">
        <label className="block text-sm text-ash">
          Titel
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={TITLE_MAX}
            required
            placeholder="z. B. Programmänderung Faster Stage"
            className="mt-1 w-full rounded-lg border border-rivet bg-steel-2 px-3 py-2 text-sm text-bone outline-none focus:border-blood"
          />
        </label>
        <label className="block text-sm text-ash">
          Text
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={BODY_MAX}
            required
            rows={4}
            placeholder="Was sollen alle wissen?"
            className="mt-1 w-full rounded-lg border border-rivet bg-steel-2 px-3 py-2 text-sm text-bone outline-none focus:border-blood"
          />
          <span className="mt-0.5 block text-right text-[10px] text-ash/60">
            {body.length}/{BODY_MAX}
          </span>
        </label>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-blood px-4 py-2.5 text-sm font-bold uppercase text-black disabled:opacity-50"
          >
            An alle senden
          </button>
          {status && <span className="min-w-0 flex-1 text-xs text-ash">{status}</span>}
        </div>
      </form>

      <div>
        <div className="mb-2 mt-8 flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.3em] text-ash/60 md:mt-0">
          <span className="h-px flex-1 bg-rivet" />
          Bisherige Mitteilungen
          <span className="h-px flex-1 bg-rivet" />
        </div>
        {history === null ? (
          <p className="text-center text-sm text-ash">Lade …</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-ash">Noch keine Mitteilungen gesendet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {history.map((a) => (
              <li key={a.id} className="rounded-xl border border-rivet bg-steel p-3">
                <div className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 text-sm font-bold text-bone">
                    {a.title}
                  </span>
                  <span className="shrink-0 text-[10px] text-ash/70">
                    {formatAgo(a.createdAt)}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-ash">
                  {a.body}
                </p>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-[10px] text-ash/70">
                    {a.festivalId === null
                      ? 'Festival Buddy Team (app-weit)'
                      : `gesendet von ${a.authorName ?? 'gelöschtem Konto'}`}
                  </span>
                  {/* App-weite Betreiber-Nachrichten kann nur der Betreiber löschen */}
                  {a.festivalId !== null && (
                    <button
                      onClick={() => remove(a)}
                      className="shrink-0 text-[10px] font-bold text-blood"
                    >
                      🗑 Löschen
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {confirmReq && (
        <ConfirmDialog req={confirmReq} onClose={() => setConfirmReq(null)} />
      )}
    </div>
  );
}
