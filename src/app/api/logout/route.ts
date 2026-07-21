import { NextResponse } from 'next/server';
import { clearAuthCookie, getCookie, getRpConfig, openToken, SESSION_COOKIE } from '@/lib/auth';
import { revokeSessionForUser } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Session-Cookie löschen und die Server-Session widerrufen (siehe #36) –
 * sonst bleibt ein vor dem Logout kopiertes Token bis zum Ablaufdatum
 * gültig. Der Passkey auf dem Gerät bleibt natürlich bestehen.
 */
export async function POST(req: Request) {
  const data = openToken<{ uid: string; sid: string }>(getCookie(req, SESSION_COOKIE));
  if (typeof data?.uid === 'string' && typeof data.sid === 'string') {
    await revokeSessionForUser(data.uid, data.sid).catch(() => {});
  }
  const res = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  clearAuthCookie(res, getRpConfig(req), SESSION_COOKIE);
  return res;
}
