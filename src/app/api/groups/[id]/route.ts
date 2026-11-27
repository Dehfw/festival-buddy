import { NextResponse } from 'next/server';
import { readSessionUserId } from '@/lib/auth';
import { getGroupsForUser, getMemberRole, updateGroup, type GroupPatch } from '@/lib/db';
import { isGroupAdmin } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * Gruppe ändern (nur Owner/Admins): { name?, hotThreshold?, rotateCode? }.
 * hotThreshold steuert den Feuerrahmen 🔥 der Gruppe (0 = aus).
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await readSessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 });
  }
  const { id: groupId } = await params;
  if (!isGroupAdmin(await getMemberRole(groupId, userId))) {
    return NextResponse.json({ error: 'Nur Admins dürfen das' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const patch: GroupPatch = {};
  if (body?.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (name.length < 2 || name.length > 40) {
      return NextResponse.json(
        { error: 'Gruppenname muss 2–40 Zeichen lang sein' },
        { status: 400 }
      );
    }
    patch.name = name;
  }
  if (body?.hotThreshold !== undefined) {
    const t = Number(body.hotThreshold);
    if (!Number.isInteger(t) || t < 0 || t > 99) {
      return NextResponse.json(
        { error: 'Feuerrahmen-Schwelle muss 0–99 sein (0 = aus)' },
        { status: 400 }
      );
    }
    patch.hotThreshold = t;
  }
  if (body?.rotateCode === true) patch.rotateCode = true;

  const ok = await updateGroup(groupId, patch);
  if (!ok) {
    return NextResponse.json({ error: 'Gruppe existiert nicht mehr' }, { status: 404 });
  }
  const group = (await getGroupsForUser(userId)).find((g) => g.id === groupId) ?? null;
  return NextResponse.json({ ok: true, group });
}
