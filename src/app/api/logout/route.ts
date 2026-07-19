import { NextResponse } from 'next/server';
import { clearAuthCookie, endSession, getRpConfig, SESSION_COOKIE } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Sitzung serverseitig widerrufen und Session-Cookie löschen. Der Passkey
 * auf dem Gerät bleibt natürlich bestehen. Der Widerruf sorgt dafür, dass
 * ein vor dem Logout kopierter Token danach nicht mehr funktioniert.
 */
export async function POST(req: Request) {
  await endSession(req);
  const res = NextResponse.json({ ok: true });
  clearAuthCookie(res, getRpConfig(req), SESSION_COOKIE);
  return res;
}
