import { NextResponse } from 'next/server';
import {
  createAnnouncement,
  deleteAnnouncement,
  getAnnouncementsWithAuthor,
  getFestivalAudienceUserIds,
  getTimetable,
} from '@/lib/db';
import { canManageFestival } from '@/lib/organizer';
import { PUSH_BODY_MAX, PUSH_TITLE_MAX, sendPushToUsers } from '@/lib/push';
import { rateLimit } from '@/lib/ratelimit';

export const dynamic = 'force-dynamic';
// Push-Fan-out an alle Abos des Festivals muss vor der Response fertig sein.
export const maxDuration = 60;

function authError(status: 401 | 403) {
  return NextResponse.json(
    { error: status === 401 ? 'Nicht eingeloggt' : 'Kein Zugriff' },
    { status }
  );
}

/**
 * Mitteilung an alle Mitglieder aller Gruppen des Festivals:
 * { festivalId, title, body }. Persistiert immer (in-App sichtbar über
 * /api/data) und pusht zusätzlich an alle Abos. Als Absender erscheint das
 * Festival, nicht das Veranstalter-Konto.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const festivalId = typeof body?.festivalId === 'string' ? body.festivalId : '';
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  const text = typeof body?.body === 'string' ? body.body.trim() : '';
  if (!festivalId) {
    return NextResponse.json({ error: 'festivalId fehlt' }, { status: 400 });
  }
  if (!title || title.length > PUSH_TITLE_MAX) {
    return NextResponse.json(
      { error: `Titel fehlt oder länger als ${PUSH_TITLE_MAX} Zeichen` },
      { status: 400 }
    );
  }
  if (!text || text.length > PUSH_BODY_MAX) {
    return NextResponse.json(
      { error: `Text fehlt oder länger als ${PUSH_BODY_MAX} Zeichen` },
      { status: 400 }
    );
  }
  const auth = await canManageFestival(req, festivalId);
  if (!auth.ok) return authError(auth.status);
  if (!rateLimit(`announce:${auth.userId}:${festivalId}`, 5, 10 * 60_000)) {
    return NextResponse.json(
      { error: 'Zu viele Mitteilungen – bitte kurz warten' },
      { status: 429 }
    );
  }

  const timetable = await getTimetable(festivalId);
  if (!timetable) {
    return NextResponse.json({ error: 'Festival nicht gefunden' }, { status: 404 });
  }
  const announcement = await createAnnouncement(festivalId, auth.userId, title, text);
  const audience = await getFestivalAudienceUserIds(festivalId);
  const push = await sendPushToUsers(audience, {
    type: 'announcement',
    title: `${timetable.festival}: ${title}`,
    body: text,
    url: `/app?announcement=${announcement.id}`,
    tag: announcement.id,
  });
  return NextResponse.json({ ok: true, announcement, push });
}

/** Verlauf für den Composer (?festival=…) – inklusive Absender-Namen. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const festivalId = url.searchParams.get('festival') || '';
  if (!festivalId) {
    return NextResponse.json({ error: 'festival fehlt' }, { status: 400 });
  }
  const auth = await canManageFestival(req, festivalId);
  if (!auth.ok) return authError(auth.status);
  const announcements = await getAnnouncementsWithAuthor(festivalId, 50);
  return NextResponse.json({ announcements });
}

/**
 * Mitteilung zurückziehen (?festival=…&id=…): verschwindet aus der App
 * aller Nutzer (nächster Daten-Poll). Bereits zugestellte Push-
 * Benachrichtigungen lassen sich naturgemäß nicht zurückholen.
 */
export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const festivalId = url.searchParams.get('festival') || '';
  const id = url.searchParams.get('id') || '';
  if (!festivalId || !id) {
    return NextResponse.json({ error: 'festival oder id fehlt' }, { status: 400 });
  }
  const auth = await canManageFestival(req, festivalId);
  if (!auth.ok) return authError(auth.status);
  const deleted = await deleteAnnouncement(festivalId, id);
  if (!deleted) {
    return NextResponse.json({ error: 'Mitteilung nicht gefunden' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
