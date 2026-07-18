import { NextResponse } from 'next/server';
import { readSessionUserId } from '@/lib/auth';
import {
  getFirstGroupIdForUser,
  getGroupContextForUser,
  getTimetable,
  setSelection,
} from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Band-Teilnahme setzen/entfernen: { group, slotId, status: 'going' |
 * 'interested' | null }. Alt-Clients senden noch { slotId, attending }
 * ohne group – wird gemappt bzw. auf die erste Gruppe aufgelöst.
 * Wer das ist, entscheidet die Passkey-Session; das Festival kommt aus
 * der Gruppe (Slot-IDs sind nur pro Festival eindeutig).
 */
export async function POST(req: Request) {
  const userId = await readSessionUserId(req);
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

  const groupId =
    typeof body?.group === 'string' && body.group
      ? body.group
      : await getFirstGroupIdForUser(userId);
  if (!groupId) {
    return NextResponse.json({ error: 'Noch in keiner Gruppe' }, { status: 403 });
  }
  const ctx = await getGroupContextForUser(groupId, userId);
  if (!ctx) {
    return NextResponse.json({ error: 'Kein Mitglied dieser Gruppe' }, { status: 403 });
  }
  const timetable = await getTimetable(ctx.festivalId);
  if (!timetable?.slots.some((s) => s.id === slotId)) {
    return NextResponse.json({ error: 'Unbekannter Slot' }, { status: 404 });
  }

  const ok = await setSelection(userId, ctx.festivalId, slotId, status);
  if (!ok) {
    return NextResponse.json({ error: 'Unbekannter Nutzer' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
