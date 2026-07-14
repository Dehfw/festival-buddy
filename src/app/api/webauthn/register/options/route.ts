import { NextResponse } from 'next/server';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { randomUUID } from 'crypto';
import { findAdoptableUser, isNameTaken } from '@/lib/db';
import {
  CHALLENGE_MAX_AGE_S,
  getRpConfig,
  REG_CHALLENGE_COOKIE,
  sealToken,
  setAuthCookie,
} from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Schritt 1 der Registrierung: { name } -> WebAuthn-Creation-Options.
 * Die Challenge (plus designierte Nutzer-ID) wandert signiert in ein
 * kurzlebiges Cookie und wird beim Verify-Schritt geprüft.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (name.length < 2 || name.length > 30) {
    return NextResponse.json(
      { error: 'Name muss 2–30 Zeichen lang sein' },
      { status: 400 }
    );
  }

  // Alt-Account aus der Nur-Name-Ära übernehmen, sonst frische Zufalls-ID.
  // Namen, an denen schon ein Passkey hängt, sind vergeben.
  const adopt = await findAdoptableUser(name);
  if (!adopt && (await isNameTaken(name))) {
    return NextResponse.json(
      { error: 'Name ist schon vergeben – nimm einen anderen' },
      { status: 409 }
    );
  }
  const userId = adopt?.id ?? `u-${randomUUID()}`;

  const rp = getRpConfig(req);
  const options = await generateRegistrationOptions({
    rpName: rp.rpName,
    rpID: rp.rpID,
    userName: name,
    userDisplayName: name,
    userID: new TextEncoder().encode(userId),
    attestationType: 'none',
    // Discoverable Credential, damit iPhone/Android den Passkey beim
    // Login von selbst anbieten (Conditional UI / Autodiscovery)
    authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
  });

  const res = NextResponse.json({ options });
  setAuthCookie(
    res,
    rp,
    REG_CHALLENGE_COOKIE,
    sealToken({ challenge: options.challenge, userId, name }, CHALLENGE_MAX_AGE_S),
    { path: '/api/webauthn', maxAge: CHALLENGE_MAX_AGE_S }
  );
  return res;
}
