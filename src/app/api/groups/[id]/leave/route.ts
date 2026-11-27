import { NextResponse } from 'next/server';
import { readSessionUserId } from '@/lib/auth';
import { getMemberRole, leaveGroup } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Gruppe verlassen. Verlässt der letzte Owner die Gruppe, rückt das
 * dienstälteste Mitglied nach; das letzte Mitglied löscht die Gruppe mit.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await readSessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 });
  }
  const { id: groupId } = await params;
  if (!(await getMemberRole(groupId, userId))) {
    return NextResponse.json({ error: 'Kein Mitglied dieser Gruppe' }, { status: 403 });
  }
  await leaveGroup(groupId, userId);
  return NextResponse.json({ ok: true });
}
