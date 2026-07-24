import { NextResponse } from 'next/server';
import { sealToken } from '@/lib/auth';
import { getUserByEmail } from '@/lib/db';
import { sendPasswordResetMail } from '@/lib/mail';
import {
  normalizeEmail,
  passwordFingerprint,
  RESET_TOKEN_MAX_AGE_S,
} from '@/lib/password';
import { clientIp, rateLimit } from '@/lib/ratelimit';
import { resolveSiteUrl } from '@/lib/siteUrl';

export const dynamic = 'force-dynamic';

/**
 * "Passwort vergessen": { email } -> antwortet IMMER { ok: true }, damit
 * niemand per Antwort ausspähen kann, welche Adressen ein Konto haben.
 * Existiert das Konto, geht eine Mail mit Reset-Link raus. Das Token ist
 * ein sealToken mit Fingerprint des aktuellen Hashes – keine Token-
 * Tabelle nötig, nach Passwortänderung automatisch wertlos. Der Token
 * steckt im URL-Fragment (#...), damit er nicht in Server-Logs landet.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = normalizeEmail(body?.email);
  const neutral = NextResponse.json({ ok: true });
  if (!email) return neutral;
  // Limit erreicht? Auch dann neutral antworten und einfach nichts senden.
  if (!rateLimit(`pw-forgot:${clientIp(req)}`, 5, 15 * 60_000)) return neutral;

  const stored = await getUserByEmail(email);
  if (stored) {
    const token = sealToken(
      {
        ruid: stored.user.id,
        pf: passwordFingerprint(stored.passwordHash),
        t: 'pwreset',
      },
      RESET_TOKEN_MAX_AGE_S
    );
    const base = await resolveSiteUrl();
    await sendPasswordResetMail(email, `${base}/passwort-reset#${token}`);
  }
  return neutral;
}
