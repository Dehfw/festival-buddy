import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import {
  getRpConfig,
  sealToken,
  SESSION_COOKIE,
  SESSION_MAX_AGE_S,
  setAuthCookie,
} from '@/lib/auth';
import { createUserWithPassword, findAdoptableUser } from '@/lib/db';
import { colorForName } from '@/lib/ids';
import {
  hashPassword,
  normalizeEmail,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '@/lib/password';
import { clientIp, rateLimit } from '@/lib/ratelimit';

export const dynamic = 'force-dynamic';

/**
 * Konto mit E-Mail+Passwort anlegen: { name, email, password } -> Nutzer
 * entsteht (oder Legacy-Übernahme per Name, gleiche Regel wie beim
 * Passkey-Register) und die Session wird direkt gesetzt. Die E-Mail wird
 * bewusst NICHT verifiziert – sie ist nur Login-Name und Empfänger der
 * "Passwort vergessen"-Mail.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const email = normalizeEmail(body?.email);
  const password = typeof body?.password === 'string' ? body.password : '';
  if (name.length < 2 || name.length > 30) {
    return NextResponse.json(
      { error: 'Name muss 2–30 Zeichen lang sein' },
      { status: 400 }
    );
  }
  if (!email) {
    return NextResponse.json(
      { error: 'Bitte eine gültige E-Mail-Adresse angeben' },
      { status: 400 }
    );
  }
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    return NextResponse.json(
      { error: `Passwort muss mindestens ${PASSWORD_MIN_LENGTH} Zeichen lang sein` },
      { status: 400 }
    );
  }
  if (!rateLimit(`pw-register:${clientIp(req)}`, 10, 15 * 60_000)) {
    return NextResponse.json(
      { error: 'Zu viele Versuche – bitte kurz warten' },
      { status: 429 }
    );
  }

  // Alt-Account aus der Nur-Name-Ära übernehmen, sonst frische Zufalls-ID
  // (siehe webauthn/register/options – hier gilt dieselbe Abwägung).
  const adopt =
    process.env.LEGACY_NAME_ADOPTION === 'off' ? null : await findAdoptableUser(name);
  const userId = adopt?.id ?? `u-${randomUUID()}`;

  const user = await createUserWithPassword(
    { id: userId, name, color: colorForName(name) },
    email,
    await hashPassword(password)
  );
  if (user === 'email-taken') {
    return NextResponse.json(
      {
        error:
          'Mit dieser E-Mail gibt es schon ein Konto – logg dich ein oder nutze „Passwort vergessen“.',
      },
      { status: 409 }
    );
  }
  if (!user) {
    return NextResponse.json(
      { error: 'Name ist inzwischen vergeben – bitte nochmal versuchen' },
      { status: 409 }
    );
  }

  const rp = getRpConfig(req);
  const res = NextResponse.json({ user });
  setAuthCookie(res, rp, SESSION_COOKIE, sealToken({ uid: user.id }, SESSION_MAX_AGE_S), {
    maxAge: SESSION_MAX_AGE_S,
  });
  return res;
}
