import { NextResponse } from 'next/server';
import {
  verifyRegistrationResponse,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import {
  ADD_CHALLENGE_COOKIE,
  clearAuthCookie,
  getCookie,
  getRpConfig,
  openToken,
  readSessionUserId,
} from '@/lib/auth';
import { addCredentialToUser } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Schritt 2 von "Passkey zum bestehenden Konto hinzufügen": Antwort des
 * Authenticators prüfen und das Credential an den Session-Nutzer binden.
 * Challenge-Cookie und Session müssen zum selben Nutzer gehören.
 */
export async function POST(req: Request) {
  const userId = readSessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const response = body?.response as RegistrationResponseJSON | undefined;
  if (!response || typeof response !== 'object') {
    return NextResponse.json({ error: 'Ungültige Anfrage' }, { status: 400 });
  }

  const pending = openToken<{ challenge: string; addUid: string }>(
    getCookie(req, ADD_CHALLENGE_COOKIE)
  );
  if (!pending || pending.addUid !== userId) {
    return NextResponse.json(
      { error: 'Vorgang abgelaufen – bitte nochmal versuchen' },
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

  const added = await addCredentialToUser(userId, {
    id: credential.id,
    publicKey: credential.publicKey,
    counter: credential.counter,
    transports: credential.transports ?? [],
  });
  if (!added) {
    return NextResponse.json(
      { error: 'Dieser Passkey ist schon registriert' },
      { status: 409 }
    );
  }

  const res = NextResponse.json({ ok: true });
  clearAuthCookie(res, rp, ADD_CHALLENGE_COOKIE, '/api/webauthn');
  return res;
}
