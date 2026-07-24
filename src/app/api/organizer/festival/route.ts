import { NextResponse } from 'next/server';
import { updateFestivalMeta } from '@/lib/db';
import { canManageFestival } from '@/lib/organizer';

export const dynamic = 'force-dynamic';

/** Festival-Metadaten ändern: { festivalId, name?, edition? } */
export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null);
  const festivalId = typeof body?.festivalId === 'string' ? body.festivalId : '';
  if (!festivalId) {
    return NextResponse.json({ error: 'festivalId fehlt' }, { status: 400 });
  }
  const auth = await canManageFestival(req, festivalId);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'Nicht eingeloggt' : 'Kein Zugriff' },
      { status: auth.status }
    );
  }
  const patch: { name?: string; edition?: string } = {};
  if (typeof body?.name === 'string') patch.name = body.name.trim();
  if (typeof body?.edition === 'string') patch.edition = body.edition.trim();
  const result = await updateFestivalMeta(festivalId, patch);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, rev: result.rev, timetable: result.timetable });
}
