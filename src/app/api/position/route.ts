import { after, NextResponse } from 'next/server';
import { readSessionUserId } from '@/lib/auth';
import {
  getFirstGroupIdForUser,
  getGroupContextForUser,
  getPositionUpdatedAt,
  getSlotAttendeeUserIdsInGroup,
  getTimetable,
  getUserById,
  setPosition,
} from '@/lib/db';
import {
  isPushConfigured,
  PUSH_TITLE_MAX,
  sendPushToUsers,
  type PushSendResult,
} from '@/lib/push';

export const dynamic = 'force-dynamic';
// Der Push-Fan-out läuft NACH der Antwort (next/server after) – maxDuration
// gibt ihm den nötigen Spielraum, die Antwort selbst bleibt sofort.
export const maxDuration = 60;

/**
 * Karenzzeit für die Standort-Pushes: Erst wenn der eigene Marker so lange
 * nicht angefasst wurde, gibt es beim nächsten Setzen wieder eine
 * Benachrichtigung. Nachjustieren des ✕ spammt die Gruppe also nicht,
 * ein erneutes Teilen nach längerer Zeit meldet sich wieder.
 */
const NOTIFY_COOLDOWN_MIN = 30;

/**
 * „📍 Max steht bei <Band>“ an die Gruppenmitglieder pushen, die bei der
 * Band selbst eingetragen sind ('going' oder 'interested') – wen die Band
 * nicht interessiert, den interessiert auch der Standort dort nicht.
 * null = nichts gesendet (Slot unbekannt oder niemand eingetragen).
 */
async function notifyGroup(
  groupId: string,
  festivalId: string,
  userId: string,
  slotId: string
): Promise<PushSendResult | null> {
  const [user, timetable, audience] = await Promise.all([
    getUserById(userId),
    getTimetable(festivalId),
    getSlotAttendeeUserIdsInGroup(groupId, festivalId, slotId, userId),
  ]);
  const slot = timetable?.slots.find((s) => s.id === slotId);
  if (!user || !slot || audience.length === 0) return null;
  const stage = timetable?.stages.find((s) => s.id === slot.stageId);
  return sendPushToUsers(audience, {
    type: 'position',
    title: `📍 ${user.name} steht bei ${slot.band}`.slice(0, PUSH_TITLE_MAX),
    body: `${stage ? `${stage.name} – ` : ''}Standort auf der Karte markiert`,
    url: '/app',
    // Gleicher Tag pro (Gruppe, Nutzer, Slot): erneutes Teilen ersetzt die
    // noch sichtbare Notification statt zu stapeln.
    tag: `position-${groupId}-${userId}-${slotId}`,
  });
}

/**
 * Position im Publikum markieren: { group, slotId, x, y } (Prozent 0..100).
 * x/y = null entfernt die Markierung. Der Nutzer kommt aus der
 * Passkey-Session, das Festival aus der Gruppe. Beim Setzen bekommen die
 * bei der Band eingetragenen Gruppenmitglieder eine Push-Benachrichtigung
 * (mit Karenzzeit).
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
  const { slotId, x, y } = body ?? {};
  if (typeof slotId !== 'string') {
    return NextResponse.json({ error: 'Ungültige Anfrage' }, { status: 400 });
  }
  const remove = x === null || y === null;
  if (!remove && (typeof x !== 'number' || typeof y !== 'number' || x < 0 || x > 100 || y < 0 || y > 100)) {
    return NextResponse.json({ error: 'Koordinaten müssen 0–100 sein' }, { status: 400 });
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

  // Karenz-Check VOR dem Schreiben – setPosition überschreibt updated_at.
  // Best effort: Schlägt der Check fehl, gilt der Marker als frisch geteilt;
  // das Speichern der Position scheitert daran nie.
  const prev =
    !remove && isPushConfigured()
      ? await getPositionUpdatedAt(userId, ctx.festivalId, slotId).catch(() => null)
      : null;
  const shouldNotify =
    !remove &&
    isPushConfigured() &&
    (!prev || Date.now() - prev.getTime() > NOTIFY_COOLDOWN_MIN * 60_000);

  const result = await setPosition(
    userId,
    ctx.festivalId,
    slotId,
    remove ? null : x,
    remove ? null : y
  );
  if (result === 'not-attending') {
    return NextResponse.json(
      { error: 'Erst bei der Band eintragen, dann Position markieren' },
      { status: 409 }
    );
  }

  // Standort geteilt -> die bei der Band Eingetragenen benachrichtigen.
  // Bewusst NACH der Antwort (after): Das Eintragen wartet nie auf den
  // Push-Fan-out – ein langsamer oder hängender Push-Dienst kann das
  // Speichern der Position weder verzögern noch scheitern lassen.
  if (shouldNotify) {
    after(async () => {
      await notifyGroup(groupId, ctx.festivalId, userId, slotId).catch(() => {});
    });
  }
  return NextResponse.json({ ok: true });
}
