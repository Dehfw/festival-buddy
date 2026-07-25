import { NextResponse } from 'next/server';
import { readSessionUserId } from '@/lib/auth';
import { deleteWebauthnCredentialGuarded } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Eigenen Passkey löschen. Der letzte Login-Weg ist tabu: Die DB löscht
 * nur, wenn ein Passwort hinterlegt ist oder ein weiterer Passkey bleibt
 * – sonst 409, damit sich niemand aussperrt.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = readSessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 });
  }
  const { id } = await params;
  const deleted = await deleteWebauthnCredentialGuarded(userId, id);
  if (!deleted) {
    return NextResponse.json(
      {
        error:
          'Passkey nicht gefunden – oder es ist dein letzter Login-Weg. Richte erst E-Mail & Passwort (oder einen weiteren Passkey) ein.',
      },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true });
}
