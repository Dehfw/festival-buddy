import { NextResponse } from 'next/server';
import { readSessionUserId } from '@/lib/auth';
import { getMemberRole, removeMember, setMemberRole } from '@/lib/db';
import { isGroupAdmin } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * Gemeinsame Vorprüfung beider Methoden: eingeloggt, Admin der Gruppe,
 * nicht der eigene Account (dafür gibt es /leave), Ziel ist Mitglied und
 * nicht der Owner (der ist unantastbar).
 */
async function checkMemberAction(
  req: Request,
  groupId: string,
  targetUserId: string
): Promise<NextResponse | null> {
  const sessionUserId = await readSessionUserId(req);
  if (!sessionUserId) {
    return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 });
  }
  if (!isGroupAdmin(await getMemberRole(groupId, sessionUserId))) {
    return NextResponse.json({ error: 'Nur Admins dürfen das' }, { status: 403 });
  }
  if (targetUserId === sessionUserId) {
    return NextResponse.json(
      { error: 'Die eigene Rolle lässt sich nicht ändern – zum Austreten bitte „Gruppe verlassen“ benutzen' },
      { status: 400 }
    );
  }
  const targetRole = await getMemberRole(groupId, targetUserId);
  if (!targetRole) {
    return NextResponse.json({ error: 'Kein Mitglied dieser Gruppe' }, { status: 404 });
  }
  if (targetRole === 'owner') {
    return NextResponse.json({ error: 'Der Owner ist unantastbar' }, { status: 403 });
  }
  return null;
}

/** Mitglied entfernen (nur Owner/Admins; sich selbst entfernt man über /leave). */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const { id: groupId, userId: targetUserId } = await params;
  const denied = await checkMemberAction(req, groupId, targetUserId);
  if (denied) return denied;
  const removed = await removeMember(groupId, targetUserId);
  if (!removed) {
    return NextResponse.json({ error: 'Kein Mitglied dieser Gruppe' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * Rolle ändern (nur Owner/Admins): { role: 'admin' | 'member' }.
 * Admins dürfen die Gruppe bearbeiten und Mitglieder entfernen.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const { id: groupId, userId: targetUserId } = await params;
  const denied = await checkMemberAction(req, groupId, targetUserId);
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const role = body?.role;
  if (role !== 'admin' && role !== 'member') {
    return NextResponse.json(
      { error: 'Rolle muss "admin" oder "member" sein' },
      { status: 400 }
    );
  }
  const changed = await setMemberRole(groupId, targetUserId, role);
  if (!changed) {
    return NextResponse.json({ error: 'Kein Mitglied dieser Gruppe' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
