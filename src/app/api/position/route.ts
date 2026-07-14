import { NextResponse } from 'next/server';
import { readSessionUserId } from '@/lib/auth';
import { setPosition } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Position im Publikum markieren: { slotId, x, y } (Prozent 0..100).
 * x/y = null entfernt die Markierung. Der Nutzer kommt aus der
 * Passkey-Session, nicht aus dem Request-Body.
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
  const { slotId, x, y } = body ?? {};
  if (typeof slotId !== 'string') {
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
