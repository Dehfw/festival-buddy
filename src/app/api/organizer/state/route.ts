import { NextResponse } from 'next/server';
import {
  defaultBlueprint,
  getBlueprints,
  getSelectionCountsForFestival,
  getTimetableFresh,
} from '@/lib/db';
import { canManageFestival } from '@/lib/organizer';

export const dynamic = 'force-dynamic';

/**
 * Datenstand für den Veranstalter-Editor (?festival=…): Timetable (frisch,
 * am Prozess-Cache vorbei), Blueprints (fehlende Bühnen bekommen einen
 * Default) und Auswahl-Zähler pro Slot – Letztere füttern die Warn-Dialoge
 * beim Löschen ("an diesem Slot hängen schon N Leute").
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const festivalId = url.searchParams.get('festival') ?? '';
  if (!festivalId) {
    return NextResponse.json({ error: 'festival fehlt' }, { status: 400 });
  }
  const auth = await canManageFestival(req, festivalId);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'Nicht eingeloggt' : 'Kein Zugriff' },
      { status: auth.status }
    );
  }
  const timetable = await getTimetableFresh(festivalId);
  if (!timetable) {
    return NextResponse.json({ error: 'Festival nicht gefunden' }, { status: 404 });
  }
  const [blueprints, selectionCounts] = await Promise.all([
    getBlueprints(festivalId),
    getSelectionCountsForFestival(festivalId),
  ]);
  for (const stage of timetable.stages) {
    if (!blueprints[stage.id]) blueprints[stage.id] = defaultBlueprint(stage.name);
  }
  return NextResponse.json(
    { festivalId, timetable, blueprints, selectionCounts },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
