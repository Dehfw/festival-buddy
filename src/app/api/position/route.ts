import { NextResponse } from 'next/server';
import { setPosition } from '@/lib/db';

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

  const result = await setPosition(userId, slotId, remove ? null : x, remove ? null : y);
  if (result === 'not-attending') {
    return NextResponse.json(
      { error: 'Erst bei der Band eintragen, dann Position markieren' },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true });
}
