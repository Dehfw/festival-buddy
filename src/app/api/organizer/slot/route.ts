import { NextResponse } from 'next/server';
import { deleteSlot, upsertSlot, type SlotInput } from '@/lib/db';
import { canManageFestival } from '@/lib/organizer';

export const dynamic = 'force-dynamic';

function authError(status: 401 | 403) {
  return NextResponse.json(
    { error: status === 401 ? 'Nicht eingeloggt' : 'Kein Zugriff' },
    { status }
  );
}

/**
 * Slot anlegen/ändern:
 * { festivalId, slot: { id?, dayId, stageId, band, start, end, confirmed, spotifyArtistId? } }
 */
export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  const festivalId = typeof body?.festivalId === 'string' ? body.festivalId : '';
  const slot = body?.slot;
  if (!festivalId || typeof slot !== 'object' || slot === null) {
    return NextResponse.json({ error: 'festivalId/slot fehlt' }, { status: 400 });
  }
  const auth = await canManageFestival(req, festivalId);
  if (!auth.ok) return authError(auth.status);
  const input: SlotInput = {
    ...(typeof slot.id === 'string' ? { id: slot.id } : {}),
    dayId: typeof slot.dayId === 'string' ? slot.dayId : '',
    stageId: typeof slot.stageId === 'string' ? slot.stageId : '',
    band: typeof slot.band === 'string' ? slot.band : '',
    start: typeof slot.start === 'string' ? slot.start.trim() : '',
    end: typeof slot.end === 'string' ? slot.end.trim() : '',
    confirmed: slot.confirmed === true,
    ...(typeof slot.spotifyArtistId === 'string' && slot.spotifyArtistId !== ''
      ? { spotifyArtistId: slot.spotifyArtistId.trim() }
      : {}),
  };
  const result = await upsertSlot(festivalId, input);
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

/** Slot löschen (Auswahlen/Positionen dazu werden mitgelöscht): { festivalId, slotId } */
export async function DELETE(req: Request) {
  const body = await req.json().catch(() => null);
  const festivalId = typeof body?.festivalId === 'string' ? body.festivalId : '';
  const slotId = typeof body?.slotId === 'string' ? body.slotId : '';
  if (!festivalId || !slotId) {
    return NextResponse.json({ error: 'festivalId/slotId fehlt' }, { status: 400 });
  }
  const auth = await canManageFestival(req, festivalId);
  if (!auth.ok) return authError(auth.status);
  const result = await deleteSlot(festivalId, slotId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, rev: result.rev, timetable: result.timetable });
}
