import { NextResponse } from 'next/server';
import {
  getRpConfig,
  sealToken,
  SESSION_COOKIE,
  SESSION_MAX_AGE_S,
  setAuthCookie,
} from '@/lib/auth';
import { getUserByEmail } from '@/lib/db';
import {
  normalizeEmail,
  PASSWORD_MAX_LENGTH,
  verifyAgainstDummy,
  verifyPassword,
} from '@/lib/password';
import { clientIp, rateLimit } from '@/lib/ratelimit';

export const dynamic = 'force-dynamic';

/** Eine Antwort für alle Fehlschläge – kein Orakel, ob die E-Mail existiert */
const WRONG = 'E-Mail oder Passwort ist falsch';

/** Login per E-Mail+Passwort: { email, password } -> Session-Cookie. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = normalizeEmail(body?.email);
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!email || password.length === 0 || password.length > PASSWORD_MAX_LENGTH) {
    return NextResponse.json({ error: WRONG }, { status: 401 });
  }
  if (!rateLimit(`pw-login:${clientIp(req)}:${email}`, 10, 15 * 60_000)) {
    return NextResponse.json(
      { error: 'Zu viele Versuche – bitte kurz warten' },
      { status: 429 }
    );
  }

  const stored = await getUserByEmail(email);
  if (!stored) {
    // Unbekannte Adresse: trotzdem einen scrypt-Lauf machen, damit die
    // Antwortzeit nicht verrät, ob es das Konto gibt.
    await verifyAgainstDummy(password);
    return NextResponse.json({ error: WRONG }, { status: 401 });
  }
  if (!(await verifyPassword(password, stored.passwordHash))) {
    return NextResponse.json({ error: WRONG }, { status: 401 });
  }

  const rp = getRpConfig(req);
  const res = NextResponse.json({ user: stored.user });
  setAuthCookie(
    res,
    rp,
    SESSION_COOKIE,
    sealToken({ uid: stored.user.id }, SESSION_MAX_AGE_S),
    { maxAge: SESSION_MAX_AGE_S }
  );
  return res;
}
