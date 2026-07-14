import { NextResponse } from 'next/server';
import { getTimetable, mutateDb, readDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Band-Teilnahme setzen/entfernen: { userId, slotId, attending } */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const { userId, slotId, attending } = body ?? {};
  if (typeof userId !== 'string' || typeof slotId !== 'string' || typeof attending !== 'boolean') {
    return NextResponse.json({ error: 'Ungültige Anfrage' }, { status: 400 });
  }
  if (!readDb().users.some((u) => u.id === userId)) {
    return NextResponse.json({ error: 'Unbekannter Nutzer' }, { status: 404 });
  }
  if (!getTimetable().slots.some((s) => s.id === slotId)) {
    return NextResponse.json({ error: 'Unbekannter Slot' }, { status: 404 });
  }

  const rev = await mutateDb((db) => {
    db.selections = db.selections.filter(
      (s) => !(s.userId === userId && s.slotId === slotId)
    );
    if (attending) {
      db.selections.push({ userId, slotId });
    } else {
      // Wer sich austrägt, verliert auch seine Positionsmarkierung
      db.positions = db.positions.filter(
        (p) => !(p.userId === userId && p.slotId === slotId)
      );
    }
    return db.rev + 1;
  });

  return NextResponse.json({ ok: true, rev });
}
