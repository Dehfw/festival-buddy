import { NextResponse } from 'next/server';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import {
  AUTH_CHALLENGE_COOKIE,
  CHALLENGE_MAX_AGE_S,
  getRpConfig,
  sealToken,
  setAuthCookie,
} from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Schritt 1 des Logins: WebAuthn-Request-Options ohne allowCredentials –
 * das Gerät bietet passende (discoverable) Passkeys von selbst an,
 * auch im Autofill/Conditional-UI-Modus.
 */
export async function POST(req: Request) {
  const rp = getRpConfig(req);
  const options = await generateAuthenticationOptions({
    rpID: rp.rpID,
    userVerification: 'preferred',
    allowCredentials: [],
  });

  const res = NextResponse.json({ options });
  setAuthCookie(
    res,
    rp,
    AUTH_CHALLENGE_COOKIE,
    sealToken({ challenge: options.challenge }, CHALLENGE_MAX_AGE_S),
    { path: '/api/webauthn', maxAge: CHALLENGE_MAX_AGE_S }
  );
  return res;
}
