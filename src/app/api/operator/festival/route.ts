import { NextResponse } from 'next/server';
import { createFestival, getFestivals, getTimetableFresh } from '@/lib/db';
import { FESTIVAL_ID_PATTERN, parseNewFestival } from '@/lib/festivalCreate';
import { operatorGuard } from '@/lib/operatorAuth';

export const dynamic = 'force-dynamic';

/**
 * Betreiber-API: ein neues Festival anlegen, ohne Datenbank-Zugang – der
 * Weg für Claude-Sessions, die ein Lineup vorbereitet haben. Zugang über
 * das Betreiber-Secret (operatorGuard), dasselbe wie bei der
 * Lineup-Ergänzung.
 *
 * Angelegt wird nur, was es noch nicht gibt. Ein bestehendes Festival
 * lässt sich hier weder ersetzen noch ändern (409): Neue Bands gehen über
 * /api/operator/lineup, eine neue Running Order über den Voll-Import
 * (scripts/import-festival.mjs) bzw. den Veranstalter-Editor.
 */

/** Alle Festivals (auch vergangene) – damit eine Session sieht, was es gibt. */
export async function GET(req: Request) {
  const denied = operatorGuard(req);
  if (denied) return denied;
  const festivals = await getFestivals();
  return NextResponse.json({ festivals }, { headers: { 'Cache-Control': 'no-store' } });
}

/**
 * { festivalId, festival, edition, dataVersion?, days, stages?, slots?, bands?, dryRun? }
 *
 * Dasselbe Format wie die Importdatei unter data/<id>.json, plus
 * `festivalId`. Die Prüfung ist streng (parseNewFestival): Was der
 * Validator im Repo nur anmerkt, ist hier kein Thema, was er ablehnt,
 * lehnt auch der Endpunkt ab. `dryRun` prüft nur und legt nichts an.
 */
export async function POST(req: Request) {
  const denied = operatorGuard(req);
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const festivalId = typeof body?.festivalId === 'string' ? body.festivalId : '';
  if (!FESTIVAL_ID_PATTERN.test(festivalId)) {
    return NextResponse.json(
      { error: 'festivalId fehlt oder ist kein Slug (a–z, 0–9, Bindestrich; 2–40 Zeichen)' },
      { status: 400 }
    );
  }
  const parsed = parseNewFestival(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const festival = parsed.value;
  const summary = {
    festivalId,
    festival: festival.name,
    edition: festival.edition,
    dataVersion: festival.dataVersion,
    days: festival.days.length,
    stages: festival.stages.length,
    slots: festival.slots.length,
    bands: festival.bands.length,
  };
  const exists = () =>
    NextResponse.json(
      {
        error:
          'Das Festival gibt es schon – hier wird nur neu angelegt. Neue Bands: /api/operator/lineup, neue Running Order: Voll-Import oder Veranstalter-Editor',
      },
      { status: 409 }
    );

  const dryRun = body?.dryRun === true;
  if (dryRun) {
    if (await getTimetableFresh(festivalId)) return exists();
    return NextResponse.json({ ok: true, dryRun: true, created: false, ...summary });
  }

  // INSERT … ON CONFLICT DO NOTHING entscheidet atomar – zwei gleichzeitige
  // Anlagen derselben ID ergeben ein neues Festival und einen 409.
  if (!(await createFestival(festivalId, festival))) return exists();
  return NextResponse.json({ ok: true, dryRun: false, created: true, ...summary }, { status: 201 });
}
