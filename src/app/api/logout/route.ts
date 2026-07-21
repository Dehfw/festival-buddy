import { NextResponse } from 'next/server';
import { clearAuthCookie, getRpConfig, revokeCurrentSession, SESSION_COOKIE } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Sitzung serverseitig widerrufen und Session-Cookie löschen; der Passkey
 * auf dem Gerät bleibt natürlich. Der Widerruf sorgt dafür, dass eine vor
 * dem Logout kopierte Cookie-Version nicht weiter akzeptiert wird (#36).
 */
export async function POST(req: Request) {
  await revokeCurrentSession(req);
  const res = NextResponse.json({ ok: true });
  res.headers.set('Cache-Control', 'no-store');
  clearAuthCookie(res, getRpConfig(req), SESSION_COOKIE);
  return res;
}
