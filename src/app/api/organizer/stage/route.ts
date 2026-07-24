import { NextResponse } from 'next/server';
import { deleteStage, upsertStage, type StageInput } from '@/lib/db';
import { canManageFestival } from '@/lib/organizer';

export const dynamic = 'force-dynamic';

function authError(status: 401 | 403) {
  return NextResponse.json(
    { error: status === 401 ? 'Nicht eingeloggt' : 'Kein Zugriff' },
    { status }
  );
}

/** Bühne anlegen/ändern: { festivalId, stage: { id?, name, short, color } } */
export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  const festivalId = typeof body?.festivalId === 'string' ? body.festivalId : '';
  const stage = body?.stage;
  if (!festivalId || typeof stage !== 'object' || stage === null) {
    return NextResponse.json({ error: 'festivalId/stage fehlt' }, { status: 400 });
  }
  const auth = await canManageFestival(req, festivalId);
  if (!auth.ok) return authError(auth.status);
  const input: StageInput = {
    ...(typeof stage.id === 'string' ? { id: stage.id } : {}),
    name: typeof stage.name === 'string' ? stage.name.trim() : '',
    short:
      typeof stage.short === 'string' ? stage.short.trim().toUpperCase() : '',
    color: typeof stage.color === 'string' ? stage.color.trim() : '',
  };
  const result = await upsertStage(festivalId, input);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({
    ok: true,
    rev: result.rev,
    timetable: result.timetable,
    id: result.id,
  });
}

/** Bühne löschen (nimmt Slots samt Nutzerdaten + Blueprint mit): { festivalId, stageId } */
export async function DELETE(req: Request) {
  const body = await req.json().catch(() => null);
  const festivalId = typeof body?.festivalId === 'string' ? body.festivalId : '';
  const stageId = typeof body?.stageId === 'string' ? body.stageId : '';
  if (!festivalId || !stageId) {
    return NextResponse.json({ error: 'festivalId/stageId fehlt' }, { status: 400 });
  }
  const auth = await canManageFestival(req, festivalId);
  if (!auth.ok) return authError(auth.status);
  const result = await deleteStage(festivalId, stageId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, rev: result.rev, timetable: result.timetable });
}
