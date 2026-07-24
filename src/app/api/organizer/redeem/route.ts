import { NextResponse } from 'next/server';
import { readSessionUserId } from '@/lib/auth';
import { getUserById, redeemOrganizerInvite } from '@/lib/db';
import { clientIp, rateLimit } from '@/lib/ratelimit';
import { normalizeInviteCode } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * Veranstalter-Code einlösen (Codes erzeugt der Betreiber per
 * scripts/organizer-code.mjs). Bewusst dieselbe Fehlermeldung für
 * unbekannt, bereits eingelöst und widerrufen – kein Orakel für Rater;
 * dazu eine strengere Bremse als beim Gruppenbeitritt.
 */
export async function POST(req: Request) {
  const userId = readSessionUserId(req);
  if (!userId || !(await getUserById(userId))) {
    return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 });
  }
  if (!rateLimit(`org-redeem:${clientIp(req)}`, 10, 10 * 60 * 1000)) {
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
  const festival = await redeemOrganizerInvite(userId, code);
  if (!festival) {
    return NextResponse.json({ error: 'Code ungültig' }, { status: 404 });
  }
  return NextResponse.json({ festival });
}
