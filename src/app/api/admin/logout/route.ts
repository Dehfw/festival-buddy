import { NextResponse } from 'next/server';
import { ADMIN_SESSION_COOKIE } from '@/lib/admin';
import { clearAuthCookie, getRpConfig } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** Admin-Session-Cookie löschen. */
export async function POST(req: Request) {
  const res = NextResponse.json({ ok: true });
  clearAuthCookie(res, getRpConfig(req), ADMIN_SESSION_COOKIE);
  return res;
}
