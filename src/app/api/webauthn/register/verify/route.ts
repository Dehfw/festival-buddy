import { NextResponse } from 'next/server';
import {
  verifyRegistrationResponse,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { createUserWithCredential } from '@/lib/db';
import { colorForName } from '@/lib/ids';
import {
  clearAuthCookie,
  getCookie,
  getRpConfig,
  openToken,
  REG_CHALLENGE_COOKIE,
  SESSION_COOKIE,
  SESSION_MAX_AGE_S,
  setAuthCookie,
  startSession,
} from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Schritt 2 der Registrierung: Authenticator-Antwort prüfen, Nutzer +
 * Credential speichern, Session setzen. Identität hängt ab jetzt am
 * Passkey, nicht am Namen.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const response = body?.response as RegistrationResponseJSON | undefined;
  if (!response || typeof response !== 'object') {
    return NextResponse.json({ error: 'Ungültige Anfrage' }, { status: 400 });
  }

  const pending = openToken<{ challenge: string; userId: string; name: string }>(
    getCookie(req, REG_CHALLENGE_COOKIE)
  );
  if (!pending) {
    return NextResponse.json(
      { error: 'Registrierung abgelaufen – bitte nochmal versuchen' },
      { status: 400 }
    );
  }

  const rp = getRpConfig(req);
  let verified = false;
  let credential: {
    id: string;
    publicKey: Uint8Array;
    counter: number;
    transports?: string[];
  } | null = null;
  try {
    const result = await verifyRegistrationResponse({
      response,
      expectedChallenge: pending.challenge,
      expectedOrigin: rp.expectedOrigin,
      expectedRPID: rp.rpID,
      // Face ID/Fingerabdruck sind 'preferred', nicht Pflicht – ältere
      // Geräte ohne Biometrie sollen nicht ausgesperrt werden
      requireUserVerification: false,
    });
    verified = result.verified;
    credential = result.registrationInfo?.credential ?? null;
  } catch {
    verified = false;
  }
  if (!verified || !credential) {
    return NextResponse.json(
      { error: 'Passkey konnte nicht bestätigt werden' },
      { status: 400 }
    );
  }

  const user = await createUserWithCredential(
    { id: pending.userId, name: pending.name, color: colorForName(pending.name) },
    {
      id: credential.id,
      publicKey: credential.publicKey,
      counter: credential.counter,
      transports: credential.transports ?? [],
    }
  );
  if (!user) {
    return NextResponse.json(
      { error: 'Name ist inzwischen vergeben – bitte nochmal versuchen' },
      { status: 409 }
    );
  }

  const res = NextResponse.json({ user });
  setAuthCookie(res, rp, SESSION_COOKIE, await startSession(user.id), {
    maxAge: SESSION_MAX_AGE_S,
  });
  clearAuthCookie(res, rp, REG_CHALLENGE_COOKIE, '/api/webauthn');
  return res;
}
