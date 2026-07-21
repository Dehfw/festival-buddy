import { NextResponse } from 'next/server';
import { readSession } from '@/lib/auth';
import { revokeSessionForUser } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Eine andere eigene Session widerrufen (z. B. ein verlorenes Gerät oder ein
 * kopiertes Token; siehe #36). Scoped auf den eigenen Nutzer – niemand kann
 * fremde Session-IDs erraten und widerrufen.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await readSession(req);
  if (!session) {
    return NextResponse.json(
      { error: 'Nicht eingeloggt' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    );
  }
  const { id } = await params;
  await revokeSessionForUser(session.uid, id);
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
