import { NextResponse } from 'next/server';
import { readSessionUserId } from '@/lib/auth';
import { getPasswordCredentialForUser, upsertPasswordCredential } from '@/lib/db';
import {
  hashPassword,
  normalizeEmail,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  verifyPassword,
} from '@/lib/password';
import { rateLimit } from '@/lib/ratelimit';

export const dynamic = 'force-dynamic';

/**
 * E-Mail+Passwort als (zweiten) Login-Weg an das eigene Konto hängen
 * oder ändern – für eingeloggte Nutzer, typisch: Passkey-Nutzer, die
 * einen Fallback wollen. Gibt es schon ein Passwort, muss das aktuelle
 * mitgeschickt werden (currentPassword) – die Session allein reicht
 * nicht, um es still zu überschreiben.
 */
export async function POST(req: Request) {
  const userId = readSessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const email = normalizeEmail(body?.email);
  const password = typeof body?.password === 'string' ? body.password : '';
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
  if (!rateLimit(`pw-set:${userId}`, 10, 15 * 60_000)) {
    return NextResponse.json(
      { error: 'Zu viele Versuche – bitte kurz warten' },
      { status: 429 }
    );
  }

  const existing = await getPasswordCredentialForUser(userId);
  if (existing) {
    const current =
      typeof body?.currentPassword === 'string' ? body.currentPassword : '';
    if (!(await verifyPassword(current, existing.passwordHash))) {
      return NextResponse.json(
        { error: 'Das aktuelle Passwort ist falsch' },
        { status: 403 }
      );
    }
  }

  const result = await upsertPasswordCredential(userId, email, await hashPassword(password));
  if (result === 'email-taken') {
    return NextResponse.json(
      { error: 'Diese E-Mail gehört schon zu einem anderen Konto' },
      { status: 409 }
    );
  }
  return NextResponse.json({ email });
}
