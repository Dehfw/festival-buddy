import { NextResponse } from 'next/server';
import { revokeSession } from '@/lib/db';
import { clearAuthCookie, getRpConfig, readSessionId, SESSION_COOKIE } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Session-Cookie löschen UND die zugehörige Session serverseitig
 * widerrufen – ein zuvor kopiertes Token darf nach Logout nicht
 * weiterverwendbar bleiben.
 */
export async function POST(req: Request) {
  const sid = readSessionId(req);
  if (sid) await revokeSession(sid);
  const res = NextResponse.json({ ok: true });
  clearAuthCookie(res, getRpConfig(req), SESSION_COOKIE);
  return res;
}
