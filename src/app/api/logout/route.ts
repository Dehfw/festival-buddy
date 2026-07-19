import { NextResponse } from 'next/server';
import { clearAuthCookie, getRpConfig, revokeCurrentSession, SESSION_COOKIE } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Session server-seitig widerrufen und Cookie löschen. Der Widerruf ist
 * der eigentliche Logout – eine zuvor kopierte Cookie-Version wird damit
 * sofort ungültig, nicht erst nach Ablauf der 180-Tage-Obergrenze.
 */
export async function POST(req: Request) {
  await revokeCurrentSession(req);
  const res = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  clearAuthCookie(res, getRpConfig(req), SESSION_COOKIE);
  return res;
}
