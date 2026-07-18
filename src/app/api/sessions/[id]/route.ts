import { NextResponse } from 'next/server';
import { readSessionUserId } from '@/lib/auth';
import { revokeSession } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Eine eigene Session widerrufen (z. B. ein verlorenes Gerät abmelden). */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await readSessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 });
  }
  const { id } = await params;
  const revoked = await revokeSession(id, userId);
  if (!revoked) {
    return NextResponse.json({ error: 'Session nicht gefunden' }, { status: 404 });
  }
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
