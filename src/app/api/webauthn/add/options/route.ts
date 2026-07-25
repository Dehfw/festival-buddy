import { NextResponse } from 'next/server';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import {
  ADD_CHALLENGE_COOKIE,
  CHALLENGE_MAX_AGE_S,
  getRpConfig,
  readSessionUserId,
  sealToken,
  setAuthCookie,
} from '@/lib/auth';
import { getUserById, getWebauthnCredentialsForUser } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Schritt 1 von "Passkey zum bestehenden Konto hinzufügen" (eingeloggt,
 * typisch: Passwort-Nutzer, die auf Passkey umsteigen wollen). Anders als
 * die Registrierung entsteht hier KEIN neuer Nutzer – die Challenge wird
 * im eigenen fb_wa_add-Cookie an die Session-Identität gebunden.
 */
export async function POST(req: Request) {
  const userId = readSessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 });
  }
  const user = await getUserById(userId);
  if (!user) {
    return NextResponse.json({ error: 'Nutzer existiert nicht mehr' }, { status: 401 });
  }
  const existing = await getWebauthnCredentialsForUser(userId);

  const rp = getRpConfig(req);
  const options = await generateRegistrationOptions({
    rpName: rp.rpName,
    rpID: rp.rpID,
    userName: user.name,
    userDisplayName: user.name,
    userID: new TextEncoder().encode(userId),
    attestationType: 'none',
    // Authenticator soll nicht doppelt registrieren – bereits bekannte
    // Credentials ausschließen (ergibt clientseitig InvalidStateError)
    excludeCredentials: existing.map((c) => ({ id: c.id })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
  });

  const res = NextResponse.json({ options });
  setAuthCookie(
    res,
    rp,
    ADD_CHALLENGE_COOKIE,
    sealToken({ challenge: options.challenge, addUid: userId }, CHALLENGE_MAX_AGE_S),
    { path: '/api/webauthn', maxAge: CHALLENGE_MAX_AGE_S }
  );
  return res;
}
