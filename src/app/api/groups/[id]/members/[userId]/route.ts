import { NextResponse } from 'next/server';
import { readSessionUserId } from '@/lib/auth';
import { getMemberRole, removeMember } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Mitglied entfernen (nur Owner; sich selbst entfernt man über /leave). */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const sessionUserId = readSessionUserId(req);
  if (!sessionUserId) {
    return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 });
  }
  const { id: groupId, userId: targetUserId } = await params;
  if ((await getMemberRole(groupId, sessionUserId)) !== 'owner') {
    return NextResponse.json({ error: 'Nur der Owner darf das' }, { status: 403 });
  }
  if (targetUserId === sessionUserId) {
    return NextResponse.json(
      { error: 'Zum Austreten bitte „Gruppe verlassen“ benutzen' },
      { status: 400 }
    );
  }
  const removed = await removeMember(groupId, targetUserId);
  if (!removed) {
    return NextResponse.json({ error: 'Kein Mitglied dieser Gruppe' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
