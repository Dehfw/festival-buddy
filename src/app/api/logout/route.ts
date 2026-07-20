import { NextResponse } from 'next/server';
import { revokeSession } from '@/lib/db';
import { clearAuthCookie, getCookie, getRpConfig, noStore, openToken, SESSION_COOKIE } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Session server-seitig widerrufen (nicht nur das Cookie löschen) – sonst
 * bleibt ein vor dem Logout kopiertes Cookie bis zum HMAC-Ablauf gültig.
 * Der Passkey auf dem Gerät bleibt natürlich bestehen.
 */
export async function POST(req: Request) {
  const pending = openToken<{ sid: string }>(getCookie(req, SESSION_COOKIE));
  if (typeof pending?.sid === 'string') {
    await revokeSession(pending.sid);
  }
  const res = NextResponse.json({ ok: true });
  clearAuthCookie(res, getRpConfig(req), SESSION_COOKIE);
  return noStore(res);
}
