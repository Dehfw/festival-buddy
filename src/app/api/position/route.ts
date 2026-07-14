import { NextResponse } from 'next/server';
import { mutateDb, readDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Position im Publikum markieren: { userId, slotId, x, y } (Prozent 0..100).
 * x/y = null entfernt die Markierung.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const { userId, slotId, x, y } = body ?? {};
  if (typeof userId !== 'string' || typeof slotId !== 'string') {
    return NextResponse.json({ error: 'Ungültige Anfrage' }, { status: 400 });
  }
  const remove = x === null || y === null;
  if (!remove && (typeof x !== 'number' || typeof y !== 'number' || x < 0 || x > 100 || y < 0 || y > 100)) {
    return NextResponse.json({ error: 'Koordinaten müssen 0–100 sein' }, { status: 400 });
  }
  const attending = readDb().selections.some(
    (s) => s.userId === userId && s.slotId === slotId
  );
  if (!remove && !attending) {
    return NextResponse.json(
      { error: 'Erst bei der Band eintragen, dann Position markieren' },
      { status: 409 }
    );
  }

  const rev = await mutateDb((db) => {
    db.positions = db.positions.filter(
      (p) => !(p.userId === userId && p.slotId === slotId)
    );
    if (!remove) db.positions.push({ userId, slotId, x, y });
    return db.rev + 1;
  });

  return NextResponse.json({ ok: true, rev });
}
