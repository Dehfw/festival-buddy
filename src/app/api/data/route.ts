import { NextResponse } from 'next/server';
import { readSessionUserId } from '@/lib/auth';
import {
  defaultBlueprint,
  getFirstGroupIdForUser,
  getState,
  getTimetable,
} from '@/lib/db';
import type { DataPayload } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * Kompletter Datenstand für die aktive Gruppe (?group=g-…): Timetable des
 * Gruppen-Festivals, Mitglieder, deren Auswahlen/Positionen, Blueprints.
 * Ohne gültige Session gibt es nichts mehr (früher: anonymer Volldump).
 * Alt-Clients ohne ?group= bekommen ihre erste Gruppe.
 */
export async function GET(req: Request) {
  const userId = readSessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 });
  }
  const url = new URL(req.url);
  const groupId = url.searchParams.get('group') || (await getFirstGroupIdForUser(userId));
  if (!groupId) {
    return NextResponse.json(
      { error: 'Noch in keiner Gruppe', code: 'no-group' },
      { status: 403 }
    );
  }

  const state = await getState(groupId, userId);
  if (!state) {
    return NextResponse.json(
      { error: 'Kein Mitglied dieser Gruppe', code: 'not-member' },
      { status: 403 }
    );
  }
  const timetable = await getTimetable(state.festivalId);
  if (!timetable) {
    return NextResponse.json({ error: 'Festival nicht gefunden' }, { status: 500 });
  }

  // Bühnen ohne gepflegten Grundriss (frisch importiertes Festival)
  // bekommen einen generischen Blueprint, damit die Karte nie fehlt.
  const blueprints = { ...state.blueprints };
  for (const stage of timetable.stages) {
    if (!blueprints[stage.id]) blueprints[stage.id] = defaultBlueprint(stage.name);
  }

  const payload: DataPayload = {
    timetable,
    users: state.users,
    selections: state.selections,
    positions: state.positions,
    blueprints,
    group: state.group,
    rev: state.rev,
    serverTime: new Date().toISOString(),
  };
  return NextResponse.json(payload, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
