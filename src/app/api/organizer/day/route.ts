import { NextResponse } from 'next/server';
import { deleteDay, upsertDay, type DayInput } from '@/lib/db';
import { canManageFestival } from '@/lib/organizer';

export const dynamic = 'force-dynamic';

function authError(status: 401 | 403) {
  return NextResponse.json(
    { error: status === 401 ? 'Nicht eingeloggt' : 'Kein Zugriff' },
    { status }
  );
}

/** Festivaltag anlegen/ändern: { festivalId, day: { id?, label, longLabel, date } } */
export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  const festivalId = typeof body?.festivalId === 'string' ? body.festivalId : '';
  const day = body?.day;
  if (!festivalId || typeof day !== 'object' || day === null) {
    return NextResponse.json({ error: 'festivalId/day fehlt' }, { status: 400 });
  }
  const auth = await canManageFestival(req, festivalId);
  if (!auth.ok) return authError(auth.status);
  const input: DayInput = {
    ...(typeof day.id === 'string' ? { id: day.id } : {}),
    label: typeof day.label === 'string' ? day.label.trim() : '',
    longLabel: typeof day.longLabel === 'string' ? day.longLabel.trim() : '',
    date: typeof day.date === 'string' ? day.date.trim() : '',
  };
  const result = await upsertDay(festivalId, input);
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

/** Festivaltag löschen (nimmt seine Slots samt Nutzerdaten mit): { festivalId, dayId } */
export async function DELETE(req: Request) {
  const body = await req.json().catch(() => null);
  const festivalId = typeof body?.festivalId === 'string' ? body.festivalId : '';
  const dayId = typeof body?.dayId === 'string' ? body.dayId : '';
  if (!festivalId || !dayId) {
    return NextResponse.json({ error: 'festivalId/dayId fehlt' }, { status: 400 });
  }
  const auth = await canManageFestival(req, festivalId);
  if (!auth.ok) return authError(auth.status);
  const result = await deleteDay(festivalId, dayId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, rev: result.rev, timetable: result.timetable });
}
