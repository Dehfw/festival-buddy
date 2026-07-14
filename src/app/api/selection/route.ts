import { NextResponse } from 'next/server';
import { readSessionUserId } from '@/lib/auth';
import { getTimetable, setSelection } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Band-Teilnahme setzen/entfernen: { slotId, status: 'going' | 'interested' | null }.
 * Alt-Clients senden noch { slotId, attending: boolean } – wird gemappt.
 * Wer das ist, entscheidet die Passkey-Session – nicht der Request-Body.
 */
export async function POST(req: Request) {
  const userId = readSessionUserId(req);
  if (!userId) {
    return NextResponse.json(
      { error: 'Nicht eingeloggt – bitte mit Passkey anmelden' },
      { status: 401 }
    );
  }
  const body = await req.json().catch(() => null);
  const { slotId, attending } = body ?? {};
  const rawStatus: unknown =
    body?.status === undefined && typeof attending === 'boolean'
      ? attending
        ? 'going'
        : null
      : body?.status;
  const status =
    rawStatus === 'going' || rawStatus === 'interested' || rawStatus === null
      ? rawStatus
      : undefined;
  if (typeof slotId !== 'string' || status === undefined) {
    return NextResponse.json({ error: 'Ungültige Anfrage' }, { status: 400 });
  }
  if (!getTimetable().slots.some((s) => s.id === slotId)) {
    return NextResponse.json({ error: 'Unbekannter Slot' }, { status: 404 });
  }

  const ok = await setSelection(userId, slotId, status);
  if (!ok) {
    return NextResponse.json({ error: 'Unbekannter Nutzer' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
