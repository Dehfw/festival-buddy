import {
  claimReminders,
  getFestivals,
  getReminderCandidates,
  getTimetable,
} from './db';
import { isPushConfigured, sendPushToUsers, type PushSendResult } from './push';
import { formatTime, toMinutes, type Slot, type Timetable } from './types';

/**
 * Band-Erinnerungen: Ein Cron (alle ~5 Min.) pusht "Band startet gleich" an
 * Nutzer, die den Slot als Favorit markiert haben ('going'/'interested')
 * und Push aktiviert haben. Pro (Nutzer, Festival, Slot) genau eine
 * Erinnerung – geclaimt über push_reminders_sent, damit parallele Läufe
 * nie doppelt senden.
 */

/** Vorlauf: so viele Minuten vor Slot-Start wird erinnert. */
const REMINDER_LEAD_MIN = 15;
/** Karenz nach hinten, falls ein Cron-Lauf ausfiel (Slot lief gerade an). */
const REMINDER_GRACE_MIN = 5;

/**
 * Alle Slot-Zeiten sind lokale Festival-Zeiten; die unterstützten Festivals
 * liegen in Deutschland. Sollte je ein Festival in einer anderen Zeitzone
 * dazukommen, gehört die Zone ans Festival (Phase 2).
 */
const FESTIVAL_TZ = 'Europe/Berlin';

const tzFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: FESTIVAL_TZ,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Offset der Festival-Zeitzone (Wanduhr − UTC) zu diesem Zeitpunkt in ms. */
function tzOffsetMs(instant: Date): number {
  const parts: Record<string, string> = {};
  for (const p of tzFormat.formatToParts(instant)) parts[p.type] = p.value;
  const wallAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second)
  );
  return wallAsUtc - instant.getTime();
}

/**
 * Startzeitpunkt eines Slots als UTC-Date. Nutzt toMinutes(): Stunden < 8
 * zählen als "nach Mitternacht" und landen damit auf dem Folgetag des
 * Festival-Tags. null = Tag unbekannt oder Datum unparsebar.
 */
export function slotStartDate(timetable: Timetable, slot: Slot): Date | null {
  const day = timetable.days.find((d) => d.id === slot.dayId);
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day.date)) return null;
  const [y, m, d] = day.date.split('-').map(Number);
  // Wandzeit erst als UTC ansetzen, dann um den Zonen-Offset korrigieren
  // (eine Iteration reicht – DST-Kanten treffen keine Festival-Slots).
  const naive = Date.UTC(y, m - 1, d) + toMinutes(slot.start) * 60_000;
  return new Date(naive - tzOffsetMs(new Date(naive)));
}

export interface ReminderRunResult {
  configured: boolean;
  dueSlots: number;
  claimed: number;
  push: PushSendResult;
}

/** Ein Cron-Lauf: fällige Slots aller Festivals finden, claimen, pushen. */
export async function runReminderSweep(now: Date): Promise<ReminderRunResult> {
  const result: ReminderRunResult = {
    configured: isPushConfigured(),
    dueSlots: 0,
    claimed: 0,
    push: { sent: 0, gone: 0, failed: 0 },
  };
  if (!result.configured) return result;

  const windowStart = now.getTime() - REMINDER_GRACE_MIN * 60_000;
  const windowEnd = now.getTime() + REMINDER_LEAD_MIN * 60_000;

  for (const festival of await getFestivals()) {
    const timetable = await getTimetable(festival.id);
    if (!timetable || timetable.slots.length === 0) continue;

    const due = new Map<string, { slot: Slot; start: Date }>();
    for (const slot of timetable.slots) {
      const start = slotStartDate(timetable, slot);
      if (!start) continue;
      const t = start.getTime();
      if (t >= windowStart && t <= windowEnd) due.set(slot.id, { slot, start });
    }
    if (due.size === 0) continue;
    result.dueSlots += due.size;

    const candidates = await getReminderCandidates(festival.id, [...due.keys()]);
    const claimed = await claimReminders(candidates);
    result.claimed += claimed.length;

    // Pro Slot ein Payload (Band/Bühne/Restzeit), gesendet an alle Nutzer,
    // deren Erinnerung dieser Lauf geclaimt hat.
    const bySlot = new Map<string, string[]>();
    for (const c of claimed) {
      const list = bySlot.get(c.slotId) ?? [];
      list.push(c.userId);
      bySlot.set(c.slotId, list);
    }
    for (const [slotId, userIds] of bySlot) {
      const entry = due.get(slotId);
      if (!entry) continue;
      const stage = timetable.stages.find((s) => s.id === entry.slot.stageId);
      const minutes = Math.round((entry.start.getTime() - now.getTime()) / 60_000);
      const where = stage ? `${stage.name} – ` : '';
      const push = await sendPushToUsers(userIds, {
        type: 'reminder',
        title: `🤘 ${entry.slot.band} startet um ${formatTime(entry.slot.start)}`,
        body: minutes > 0 ? `${where}in ${minutes} Min.` : `${where}startet jetzt!`,
        url: '/app',
        tag: `reminder-${festival.id}-${slotId}`,
      });
      result.push.sent += push.sent;
      result.push.gone += push.gone;
      result.push.failed += push.failed;
    }
  }
  return result;
}
