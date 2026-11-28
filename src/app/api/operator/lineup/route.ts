import { NextResponse } from 'next/server';
import {
  addLineupBands,
  getFestivalAudienceUserIds,
  getTimetableFresh,
  renameLineupBand,
  type LineupBandInput,
} from '@/lib/db';
import { lineupAnnouncementText } from '@/lib/lineupNews';
import { operatorGuard } from '@/lib/operatorAuth';
import { sendPushToUsers, type PushFanoutResult } from '@/lib/push';

export const dynamic = 'force-dynamic';

/**
 * Betreiber-API für die Lineup-Watch: neue Bands in den Lineup-Pool eines
 * Festivals einpflegen und alle Mitglieder aller Gruppen dieses Festivals
 * darüber informieren (Mitteilung in der App + Push).
 *
 * Zugang über das Betreiber-Secret, siehe operatorGuard(). Ein neues
 * Festival legt die Nachbar-Route /api/operator/festival an.
 */

/**
 * So viele Bands pro Anfrage – dasselbe Limit wie der Pool selbst
 * (MAX_BANDS in src/lib/db.ts): Die Watch schickt immer das komplette
 * Lineup, ein kleineres Limit hier würde sie bei großen Festivals blockieren.
 */
const MAX_BANDS_PER_REQUEST = 2000;
const DATA_VERSION_MAX = 120;

/**
 * Live-Stand des Band-Pools (?festival=…) – damit die Watch ohne
 * Datenbank-Zugang sieht, was schon eingepflegt ist.
 */
export async function GET(req: Request) {
  const denied = operatorGuard(req);
  if (denied) return denied;
  const festivalId = new URL(req.url).searchParams.get('festival') || '';
  if (!festivalId) {
    return NextResponse.json({ error: 'festival fehlt' }, { status: 400 });
  }
  const timetable = await getTimetableFresh(festivalId);
  if (!timetable) {
    return NextResponse.json({ error: 'Unbekanntes Festival' }, { status: 404 });
  }
  return NextResponse.json(
    {
      festivalId,
      festival: timetable.festival,
      edition: timetable.edition,
      dataVersion: timetable.dataVersion,
      hasTimetable: timetable.slots.length > 0,
      bands: timetable.bands,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

function parseBands(raw: unknown): LineupBandInput[] | string {
  if (!Array.isArray(raw) || raw.length === 0) return 'bands fehlt oder ist leer';
  if (raw.length > MAX_BANDS_PER_REQUEST) {
    return `Höchstens ${MAX_BANDS_PER_REQUEST} Bands pro Anfrage`;
  }
  const bands: LineupBandInput[] = [];
  for (const entry of raw) {
    const name = typeof entry === 'string' ? entry : entry?.name;
    if (typeof name !== 'string') return 'Jede Band braucht einen Namen';
    const spotify = typeof entry === 'string' ? undefined : entry?.spotifyArtistId;
    if (spotify !== undefined && typeof spotify !== 'string') {
      return `Ungültige Spotify-Artist-ID bei "${name}"`;
    }
    bands.push({ name, ...(spotify ? { spotifyArtistId: spotify } : {}) });
  }
  return bands;
}

/**
 * { festivalId, bands: [{ name, spotifyArtistId? }], dataVersion?, dryRun?, notify? }
 *
 * Pflegt ein, was am Live-Stand gemessen neu ist, und benachrichtigt genau
 * über diese Bands. Bekannte Bands sind kein Fehler – die Watch darf immer
 * das komplette Lineup schicken. `dryRun` zeigt nur, was neu wäre;
 * `notify: false` pflegt still ein (Nachtrag ohne Mitteilung).
 */
export async function POST(req: Request) {
  const denied = operatorGuard(req);
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const festivalId = typeof body?.festivalId === 'string' ? body.festivalId : '';
  if (!festivalId) {
    return NextResponse.json({ error: 'festivalId fehlt' }, { status: 400 });
  }
  const bands = parseBands(body?.bands);
  if (typeof bands === 'string') {
    return NextResponse.json({ error: bands }, { status: 400 });
  }
  const dataVersion =
    typeof body?.dataVersion === 'string' ? body.dataVersion.trim() : undefined;
  if (dataVersion !== undefined && dataVersion.length > DATA_VERSION_MAX) {
    return NextResponse.json(
      { error: `dataVersion darf höchstens ${DATA_VERSION_MAX} Zeichen lang sein` },
      { status: 400 }
    );
  }
  const dryRun = body?.dryRun === true;
  const notify = body?.notify !== false;

  const result = await addLineupBands(festivalId, bands, {
    dataVersion: dataVersion || undefined,
    dryRun,
    announce: notify ? lineupAnnouncementText : undefined,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  // Versand vor der Antwort komplett abwarten: Der Aufrufer ist ein Script,
  // das ehrlich berichten soll, wen die Nachricht erreicht hat.
  // Ab hier ist alles gespeichert (Bands + Mitteilung). Scheitert der Versand
  // als Ganzes, darf die Antwort deshalb kein Fehler sein – ein Aufrufer, der
  // daraufhin wiederholt, fände "nichts Neues" und wüsste nicht, dass die
  // Bands längst live sind. Stattdessen: ok + pushFailed.
  let push: PushFanoutResult | undefined;
  let audience: number | undefined;
  let pushFailed = false;
  if (result.announcement) {
    try {
      const userIds = await getFestivalAudienceUserIds(festivalId);
      audience = userIds.length;
      push = await sendPushToUsers(userIds, {
        type: 'announcement',
        title: `${result.festival}: ${result.announcement.title}`,
        body: result.announcement.body,
        url: `/app?announcement=${result.announcement.id}`,
        tag: result.announcement.id,
      });
    } catch (err) {
      pushFailed = true;
      console.error('Lineup-Mitteilung: Push-Versand fehlgeschlagen', err);
    }
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    festival: result.festival,
    added: result.added,
    enriched: result.enriched,
    total: result.total,
    ...(result.announcement
      ? { announcement: result.announcement, audience, push, pushFailed }
      : {}),
  });
}

/**
 * { festivalId, from, to, spotifyArtistId?, dryRun? }
 *
 * Benennt eine Band im Lineup-Pool um und zieht die gemerkten Bands der
 * Nutzer auf den neuen Namen mit (renameLineupBand). Keine Mitteilung, kein
 * Push: Eine Umbenennung ist keine neue Band. `dryRun` zeigt, was passieren
 * würde – inklusive der Zahl der Merkungen, die am alten Namen hängen.
 */
export async function PATCH(req: Request) {
  const denied = operatorGuard(req);
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const festivalId = typeof body?.festivalId === 'string' ? body.festivalId : '';
  const from = typeof body?.from === 'string' ? body.from : '';
  const to = typeof body?.to === 'string' ? body.to : '';
  if (!festivalId) {
    return NextResponse.json({ error: 'festivalId fehlt' }, { status: 400 });
  }
  if (!from.trim() || !to.trim()) {
    return NextResponse.json({ error: 'from und to (alter und neuer Bandname) fehlen' }, { status: 400 });
  }
  const spotify = body?.spotifyArtistId;
  if (spotify !== undefined && typeof spotify !== 'string') {
    return NextResponse.json({ error: 'Ungültige Spotify-Artist-ID' }, { status: 400 });
  }
  const dryRun = body?.dryRun === true;

  const result = await renameLineupBand(festivalId, from, to, {
    spotifyArtistId: spotify || undefined,
    dryRun,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({
    ok: true,
    dryRun,
    festival: result.festival,
    from: result.from,
    to: result.to,
    slugChanged: result.slugChanged,
    interests: result.interests,
  });
}
