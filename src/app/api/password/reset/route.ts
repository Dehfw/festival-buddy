import { NextResponse } from 'next/server';
import {
  getRpConfig,
  openToken,
  sealToken,
  SESSION_COOKIE,
  SESSION_MAX_AGE_S,
  setAuthCookie,
} from '@/lib/auth';
import {
  getPasswordCredentialForUser,
  getUserById,
  updatePasswordHash,
} from '@/lib/db';
import {
  hashPassword,
  passwordFingerprint,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '@/lib/password';
import { clientIp, rateLimit } from '@/lib/ratelimit';

export const dynamic = 'force-dynamic';

const INVALID =
  'Der Link ist abgelaufen oder wurde schon benutzt – fordere einfach einen neuen an.';

/**
 * Neues Passwort per Reset-Link setzen: { token, password }. Das Token
 * (aus der Mail) trägt Nutzer-ID + Fingerprint des alten Hashes; stimmt
 * der Fingerprint nicht mehr, wurde das Passwort zwischenzeitlich
 * geändert und das Token ist wertlos. Nach Erfolg ist man eingeloggt.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const token = typeof body?.token === 'string' ? body.token : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    return NextResponse.json(
      { error: `Passwort muss mindestens ${PASSWORD_MIN_LENGTH} Zeichen lang sein` },
      { status: 400 }
    );
  }
  if (!rateLimit(`pw-reset:${clientIp(req)}`, 10, 15 * 60_000)) {
    return NextResponse.json(
      { error: 'Zu viele Versuche – bitte kurz warten' },
      { status: 429 }
    );
  }

  // Bewusst ruid statt uid im Token: so kann ein Reset-Token nie als
  // Session-Cookie durchgehen (readSessionUserId liest nur uid).
  const data = openToken<{ ruid?: string; pf?: string; t?: string }>(token);
  if (
    !data ||
    data.t !== 'pwreset' ||
    typeof data.ruid !== 'string' ||
    typeof data.pf !== 'string'
  ) {
    return NextResponse.json({ error: INVALID }, { status: 400 });
  }
  const cred = await getPasswordCredentialForUser(data.ruid);
  if (!cred || passwordFingerprint(cred.passwordHash) !== data.pf) {
    return NextResponse.json({ error: INVALID }, { status: 400 });
  }

  if (!(await updatePasswordHash(data.ruid, await hashPassword(password)))) {
    return NextResponse.json({ error: INVALID }, { status: 400 });
  }
  const user = await getUserById(data.ruid);
  if (!user) {
    return NextResponse.json({ error: INVALID }, { status: 400 });
  }

  // Frisch gesetztes Passwort = bewiesener Kontozugriff -> direkt einloggen
  const rp = getRpConfig(req);
  const res = NextResponse.json({ user });
  setAuthCookie(res, rp, SESSION_COOKIE, sealToken({ uid: user.id }, SESSION_MAX_AGE_S), {
    maxAge: SESSION_MAX_AGE_S,
  });
  return res;
}
