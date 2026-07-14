import { NextResponse } from 'next/server';
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE_S,
  issueAdminSessionToken,
  verifyAdminPassword,
} from '@/lib/admin';
import { getRpConfig, setAuthCookie } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Einfache Brute-Force-Bremse pro IP. In-Memory und damit pro
 * Serverless-Instanz – kein perfekter Schutz, aber genug Reibung gegen
 * automatisiertes Durchprobieren eines Passworts.
 */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILURES = 8;
const failures = new Map<string, { count: number; first: number }>();

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

function isBlocked(ip: string): boolean {
  const entry = failures.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.first > WINDOW_MS) {
    failures.delete(ip);
    return false;
  }
  return entry.count >= MAX_FAILURES;
}

function recordFailure(ip: string): void {
  const now = Date.now();
  const entry = failures.get(ip);
  if (!entry || now - entry.first > WINDOW_MS) {
    failures.set(ip, { count: 1, first: now });
  } else {
    entry.count += 1;
  }
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (isBlocked(ip)) {
    return NextResponse.json(
      { error: 'Zu viele Versuche – bitte später erneut' },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!verifyAdminPassword(body?.password)) {
    recordFailure(ip);
    return NextResponse.json({ error: 'Falsches Passwort' }, { status: 401 });
  }

  failures.delete(ip);
  const res = NextResponse.json({ ok: true });
  setAuthCookie(res, getRpConfig(req), ADMIN_SESSION_COOKIE, issueAdminSessionToken(), {
    maxAge: ADMIN_SESSION_MAX_AGE_S,
  });
  return res;
}
