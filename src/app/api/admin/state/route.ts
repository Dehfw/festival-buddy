import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin';
import { defaultBlueprint, getBlueprints, getFestivals, getTimetable } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Datenstand fürs Admin-Panel (?festival=…): Festival-Liste, Timetable
 * und Blueprints des gewählten Festivals. Das Panel ist ein globales
 * Betreiber-Tool und hängt bewusst NICHT an einer Gruppe.
 */
export async function GET(req: Request) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: 'Kein Zugriff' }, { status: 401 });
  }
  const festivals = await getFestivals();
  const url = new URL(req.url);
  const festivalId = url.searchParams.get('festival') || festivals[0]?.id;
  if (!festivalId) {
    return NextResponse.json({ error: 'Keine Festivals angelegt' }, { status: 404 });
  }
  const timetable = await getTimetable(festivalId);
  if (!timetable) {
    return NextResponse.json({ error: 'Festival nicht gefunden' }, { status: 404 });
  }
  const blueprints = await getBlueprints(festivalId);
  for (const stage of timetable.stages) {
    if (!blueprints[stage.id]) blueprints[stage.id] = defaultBlueprint(stage.name);
  }
  return NextResponse.json(
    { festivals, festivalId, timetable, blueprints },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
