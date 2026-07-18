import { NextResponse } from 'next/server';
import {
  verifyAuthenticationResponse,
  type AuthenticationResponseJSON,
} from '@simplewebauthn/server';
import { getCredentialWithUser, updateCredentialCounter } from '@/lib/db';
import {
  AUTH_CHALLENGE_COOKIE,
  clearAuthCookie,
  getCookie,
  getRpConfig,
  openToken,
  SESSION_COOKIE,
  SESSION_MAX_AGE_S,
  setAuthCookie,
  startSession,
} from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Schritt 2 des Logins: Assertion prüfen, Credential in der DB
 * nachschlagen und die Session auf den zugehörigen Nutzer setzen.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const response = body?.response as AuthenticationResponseJSON | undefined;
  if (!response || typeof response !== 'object' || typeof response.id !== 'string') {
    return NextResponse.json({ error: 'Ungültige Anfrage' }, { status: 400 });
  }

  const pending = openToken<{ challenge: string }>(getCookie(req, AUTH_CHALLENGE_COOKIE));
  if (!pending) {
    return NextResponse.json(
      { error: 'Login abgelaufen – bitte nochmal versuchen' },
      { status: 400 }
    );
  }

  const stored = await getCredentialWithUser(response.id);
  if (!stored) {
    return NextResponse.json(
      { error: 'Passkey hier unbekannt – bitte erst registrieren' },
      { status: 404 }
    );
  }

  const rp = getRpConfig(req);
  let verified = false;
  let newCounter = stored.credential.counter;
  try {
    const result = await verifyAuthenticationResponse({
      response,
      expectedChallenge: pending.challenge,
      expectedOrigin: rp.expectedOrigin,
      expectedRPID: rp.rpID,
      credential: {
        id: stored.credential.id,
        publicKey: stored.credential.publicKey,
        counter: stored.credential.counter,
        transports: stored.credential.transports as never,
      },
      requireUserVerification: false,
    });
    verified = result.verified;
    newCounter = result.authenticationInfo?.newCounter ?? newCounter;
  } catch {
    verified = false;
  }
  if (!verified) {
    return NextResponse.json(
      { error: 'Passkey konnte nicht bestätigt werden' },
      { status: 401 }
    );
  }

  await updateCredentialCounter(stored.credential.id, newCounter);

  const res = NextResponse.json({ user: stored.user });
  res.headers.set('Cache-Control', 'no-store');
  setAuthCookie(res, rp, SESSION_COOKIE, await startSession(stored.user.id), {
    maxAge: SESSION_MAX_AGE_S,
  });
  clearAuthCookie(res, rp, AUTH_CHALLENGE_COOKIE, '/api/webauthn');
  return res;
}
