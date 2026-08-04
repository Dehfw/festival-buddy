import { NextResponse } from 'next/server';
import { deleteSlot, getSlotSelectionUserIds, upsertSlot, type SlotInput } from '@/lib/db';
import { canManageFestival } from '@/lib/organizer';
import { isPushConfigured, PUSH_TITLE_MAX, sendPushToUsers } from '@/lib/push';
import { formatTime, toMinutes, type Slot, type Timetable } from '@/lib/types';

export const dynamic = 'force-dynamic';
// Bei Zeit-/Tag-/Bühnen-Änderungen wird der Push-Fan-out an die
// eingetragenen Besucher vor der Antwort komplett ge-awaitet (Serverless!).
export const maxDuration = 60;

function authError(status: 401 | 403) {
  return NextResponse.json(
    { error: status === 401 ? 'Nicht eingeloggt' : 'Kein Zugriff' },
    { status }
  );
}

/** "9:30" und "09:30" sind dieselbe Zeit – Vergleich deshalb über Minuten */
function timeDiffers(prev: Slot, next: Slot): boolean {
  return (
    toMinutes(prev.start) !== toMinutes(next.start) ||
    toMinutes(prev.end) !== toMinutes(next.end)
  );
}

/** Hat sich geändert, WANN oder WO die Band spielt? (Nur das wird gepusht.) */
function scheduleChanged(prev: Slot, next: Slot): boolean {
  return timeDiffers(prev, next) || prev.dayId !== next.dayId || prev.stageId !== next.stageId;
}

/**
 * Push-Text für eine Programm-Änderung: neuer Stand zuerst, alter Stand in
 * der Klammer – Tag/Bühne nur da, wo sie sich wirklich geändert haben.
 */
function schedulePush(prev: Slot, next: Slot, timetable: Timetable) {
  const day = (id: string) => timetable.days.find((d) => d.id === id)?.longLabel;
  const stage = (id: string) => timetable.stages.find((s) => s.id === id)?.name;
  const dayChanged = prev.dayId !== next.dayId;
  const stageChanged = prev.stageId !== next.stageId;
  const timeChanged = timeDiffers(prev, next);

  const part = (dayId: string, from: string, to: string, stageId: string) =>
    [
      dayChanged ? day(dayId) : null,
      timeChanged || dayChanged ? `${formatTime(from)}–${formatTime(to)}` : null,
      stageChanged ? stage(stageId) : null,
    ]
      .filter(Boolean)
      .join(' · ');

  const title =
    stageChanged && !timeChanged && !dayChanged
      ? `🎪 ${next.band}: neue Bühne`
      : `🕒 ${next.band}: neue Zeit`;
  return {
    title: title.slice(0, PUSH_TITLE_MAX),
    body: `Jetzt ${part(next.dayId, next.start, next.end, next.stageId)} (vorher ${part(prev.dayId, prev.start, prev.end, prev.stageId)})`,
  };
}

/**
 * Slot anlegen/ändern:
 * { festivalId, slot: { id?, dayId, stageId, band, start, end, confirmed, spotifyArtistId? } }
 *
 * Ändert ein Edit Zeit, Tag oder Bühne, bekommen alle beim Slot
 * eingetragenen Besucher ('going'/'interested', über alle Gruppen) eine
 * Push-Mitteilung; die Antwort meldet dem Editor `audience` (Eingetragene
 * gesamt), `notified` (davon per Push wirklich erreichte Personen – wer
 * kein Push aktiviert hat, zählt nicht) und `push` ({ sent, gone, failed }
 * auf Geräte-Ebene) zurück.
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

  // Verschoben? Dann die Eingetragenen informieren – ge-awaitet vor der
  // Antwort, damit der Veranstalter das Versand-Ergebnis als Bestätigung
  // sieht. Gleicher Tag pro Slot: Nachjustieren ersetzt eine noch
  // sichtbare Notification statt zu stapeln.
  const next = input.id ? result.timetable.slots.find((s) => s.id === input.id) : undefined;
  if (result.previous && next && scheduleChanged(result.previous, next) && isPushConfigured()) {
    const audience = await getSlotSelectionUserIds(festivalId, next.id);
    const push = await sendPushToUsers(audience, {
      type: 'schedule',
      ...schedulePush(result.previous, next, result.timetable),
      url: '/app',
      tag: `schedule-${festivalId}-${next.id}`,
    });
    return NextResponse.json({
      ok: true,
      rev: result.rev,
      timetable: result.timetable,
      id: result.id,
      audience: audience.length,
      notified: push.users,
      push,
    });
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
