import { NextResponse } from 'next/server';
import { readSessionUserId } from '@/lib/auth';
import { getUserById, joinGroupByCode } from '@/lib/db';
import { clientIp, rateLimit } from '@/lib/ratelimit';
import { normalizeInviteCode } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * Gruppenbeitritt per Einladungscode – egal ob aus dem Link
 * (/join/<code>) oder manuell abgetippt; die Eingabe wird normalisiert.
 * Bewusst dieselbe Fehlermeldung für "gibt es nicht" und "Tippfehler".
 */
export async function POST(req: Request) {
  const userId = readSessionUserId(req);
  if (!userId || !(await getUserById(userId))) {
    return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 });
  }
  if (!rateLimit(`join:${clientIp(req)}`, 30, 10 * 60 * 1000)) {
    return NextResponse.json(
      { error: 'Zu viele Versuche – bitte kurz warten' },
      { status: 429 }
    );
  }
  const body = await req.json().catch(() => null);
  const code = normalizeInviteCode(typeof body?.code === 'string' ? body.code : '');
  if (code.length !== 8) {
    return NextResponse.json({ error: 'Code ungültig' }, { status: 404 });
  }
  const group = await joinGroupByCode(userId, code);
  if (!group) {
    return NextResponse.json({ error: 'Code ungültig' }, { status: 404 });
  }
  return NextResponse.json({ group });
}
