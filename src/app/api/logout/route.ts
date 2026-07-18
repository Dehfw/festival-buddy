import { NextResponse } from 'next/server';
import { clearAuthCookie, endSession, getRpConfig, SESSION_COOKIE } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Session server-seitig widerrufen (nicht nur den Cookie löschen) – ein
 * vor dem Logout kopierter Token darf danach nicht mehr funktionieren.
 */
export async function POST(req: Request) {
  await endSession(req);
  const res = NextResponse.json({ ok: true });
  res.headers.set('Cache-Control', 'no-store');
  clearAuthCookie(res, getRpConfig(req), SESSION_COOKIE);
  return res;
}
