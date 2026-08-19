import { NextResponse } from 'next/server';
import { readSessionUserId } from '@/lib/auth';
import {
  getFirstGroupIdForUser,
  getGroupContextForUser,
  getTimetable,
  setBandInterest,
} from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Band aus der Lineup-Ansicht merken: { group, slug, interested }.
 * Das Gegenstück zu /api/selection für die Zeit vor dem Timetable – die
 * Merkung hängt am Band-Slug statt an einer Slot-ID und übersteht
 * deshalb den späteren Import der Running Order.
 */
export async function POST(req: Request) {
  const userId = readSessionUserId(req);
  if (!userId) {
    return NextResponse.json(
      { error: 'Nicht eingeloggt – bitte mit Passkey anmelden' },
      { status: 401 }
    );
  }
  const body = await req.json().catch(() => null);
  const slug = body?.slug;
  const interested = body?.interested;
  if (typeof slug !== 'string' || !slug || typeof interested !== 'boolean') {
    return NextResponse.json({ error: 'Ungültige Anfrage' }, { status: 400 });
  }

  const groupId =
    typeof body?.group === 'string' && body.group
      ? body.group
      : await getFirstGroupIdForUser(userId);
  if (!groupId) {
    return NextResponse.json({ error: 'Noch in keiner Gruppe' }, { status: 403 });
  }
  const ctx = await getGroupContextForUser(groupId, userId);
  if (!ctx) {
    return NextResponse.json({ error: 'Kein Mitglied dieser Gruppe' }, { status: 403 });
  }
  // Merken nur für Bands aus dem Pool des Gruppen-Festivals – sonst
  // sammelt die Tabelle Slugs, zu denen es nie eine Band gab (Tippfehler,
  // Alt-Client nach einem Lineup-Update).
  //
  // Das Entfernen wird bewusst NICHT geprüft: Fliegt eine Band aus dem
  // Lineup oder ändert sich ihre Schreibweise, käme sonst niemand mehr
  // aus seiner Merkung heraus. Die Zeile bliebe für immer stehen – und
  // sobald der alte Slug zurückkehrt (Re-Import mit alter Schreibweise),
  // wäre die Band plötzlich wieder gemerkt. Ein DELETE mit unbekanntem
  // Slug löscht dagegen einfach nichts.
  if (interested) {
    const timetable = await getTimetable(ctx.festivalId);
    if (!timetable?.bands.some((b) => b.slug === slug)) {
      return NextResponse.json({ error: 'Unbekannte Band' }, { status: 404 });
    }
  }

  const ok = await setBandInterest(userId, ctx.festivalId, slug, interested);
  if (!ok) {
    return NextResponse.json({ error: 'Unbekannter Nutzer' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
