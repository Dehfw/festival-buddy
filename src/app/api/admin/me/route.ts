import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin';

export const dynamic = 'force-dynamic';

/**
 * Bin ich laut Admin-Session-Cookie eingeloggt? Da das Cookie httpOnly ist,
 * kann der Client seinen Auth-Status nicht selbst auslesen – er fragt hier
 * nach. 401 heißt: (kein) gültiger Admin – der Client zeigt dann den Login.
 */
export async function GET(req: Request) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: 'Kein Zugriff' }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
