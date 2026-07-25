import { NextResponse } from 'next/server';
import { readSessionUserId } from '@/lib/auth';
import { getWebauthnCredentialsForUser } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Eigene Passkeys auflisten (Bereich "Login & Sicherheit"). Nur ID +
 * Anlegedatum – mehr weiß der Server über einen Passkey ohnehin nicht.
 */
export async function GET(req: Request) {
  const userId = readSessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 });
  }
  const credentials = await getWebauthnCredentialsForUser(userId);
  return NextResponse.json({ credentials });
}
