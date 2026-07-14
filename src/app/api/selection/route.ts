import { NextResponse } from 'next/server';
import { getTimetable, setSelection } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Band-Teilnahme setzen/entfernen: { userId, slotId, attending } */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const { userId, slotId, attending } = body ?? {};
  if (typeof userId !== 'string' || typeof slotId !== 'string' || typeof attending !== 'boolean') {
    return NextResponse.json({ error: 'Ungültige Anfrage' }, { status: 400 });
  }
  if (!getTimetable().slots.some((s) => s.id === slotId)) {
    return NextResponse.json({ error: 'Unbekannter Slot' }, { status: 404 });
  }

  const ok = await setSelection(userId, slotId, attending);
  if (!ok) {
    return NextResponse.json({ error: 'Unbekannter Nutzer' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
