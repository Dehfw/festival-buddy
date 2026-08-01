import { NextResponse } from 'next/server';
import { readSessionUserId } from '@/lib/auth';
import {
  getFirstGroupIdForUser,
  getGroupContextForUser,
  getGroupMemberUserIdsExcept,
  getPositionUpdatedAt,
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
// Push an die Gruppe muss vor der Response fertig ge-awaitet sein (Serverless).
export const maxDuration = 60;

/**
 * Karenzzeit für die Standort-Pushes: Erst wenn der eigene Marker so lange
 * nicht angefasst wurde, gibt es beim nächsten Setzen wieder eine
 * Benachrichtigung. Nachjustieren des ✕ spammt die Gruppe also nicht,
 * ein erneutes Teilen nach längerer Zeit meldet sich wieder.
 */
const NOTIFY_COOLDOWN_MIN = 30;

/**
 * „📍 Max steht bei <Band>“ an alle anderen Gruppenmitglieder pushen.
 * null = nichts gesendet (Slot unbekannt oder niemand sonst in der Gruppe).
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
    getGroupMemberUserIdsExcept(groupId, userId),
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
 * Passkey-Session, das Festival aus der Gruppe. Beim Setzen bekommen alle
 * anderen Gruppenmitglieder eine Push-Benachrichtigung (mit Karenzzeit).
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
  const prev =
    !remove && isPushConfigured()
      ? await getPositionUpdatedAt(userId, ctx.festivalId, slotId)
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

  // Standort geteilt -> alle anderen in der Gruppe benachrichtigen. Best
  // effort: Die Position ist gespeichert, ein Push-Fehler ändert daran nichts.
  let push: PushSendResult | null = null;
  if (shouldNotify) {
    push = await notifyGroup(groupId, ctx.festivalId, userId, slotId).catch(() => null);
  }
  return NextResponse.json(push ? { ok: true, push } : { ok: true });
}
