import { NextResponse } from 'next/server';
import { clearAuthCookie, getRpConfig, SESSION_COOKIE } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** Session-Cookie löschen; der Passkey auf dem Gerät bleibt natürlich. */
export async function POST(req: Request) {
  const res = NextResponse.json({ ok: true });
  clearAuthCookie(res, getRpConfig(req), SESSION_COOKIE);
  return res;
}
