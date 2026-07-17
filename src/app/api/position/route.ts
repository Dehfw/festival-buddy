import { NextResponse } from 'next/server';
import { readSessionUserId } from '@/lib/auth';
import { getFirstGroupIdForUser, getGroupContextForUser, setPosition } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Position im Publikum markieren: { group, slotId, x, y } (Prozent 0..100).
 * x/y = null entfernt die Markierung. Der Nutzer kommt aus der
 * Passkey-Session, das Festival aus der Gruppe.
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
  // Idempotenz-Schlüssel des Offline-Clients (parallele Tabs können
  // dieselbe Mutation doppelt senden): bereits verarbeitete IDs werden
  // unten als No-op bestätigt. Fehlt bei Alt-Clients -> normal anwenden.
  const rawMutationId: unknown = body?.clientMutationId;
  const mutationId =
    typeof rawMutationId === 'string' && rawMutationId.length > 0 && rawMutationId.length <= 128
      ? rawMutationId
      : null;

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

  const result = await setPosition(
    userId,
    ctx.festivalId,
    slotId,
    remove ? null : x,
    remove ? null : y,
    mutationId
  );
  if (result === 'not-attending') {
    return NextResponse.json(
      { error: 'Erst bei der Band eintragen, dann Position markieren' },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true });
}
