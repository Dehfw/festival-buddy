import {
  claimReminders,
  getFestivals,
  getReminderCandidates,
  getTimetable,
  type ReminderTarget,
} from './db';
import { isPushConfigured, sendPushToUsers, type PushSendResult } from './push';
import { FESTIVAL_TZ, formatTime, toMinutes, type Slot, type Timetable } from './types';

/**
 * Band-Erinnerungen: Ein Cron (alle ~5 Min.) pusht "Band startet gleich" an
 * Nutzer, die den Slot als Favorit markiert haben ('going'/'interested')
 * und Push aktiviert haben. Der Vorlauf ist pro Nutzer dynamisch (Anreise
 * vom Camp vs. schon auf dem Gelände, s. Konstanten). Pro (Nutzer,
 * Festival, Slot) genau eine Erinnerung – geclaimt über
 * push_reminders_sent, damit parallele Läufe nie doppelt senden.
 */

/**
 * Vorlauf, wenn der Nutzer vor dieser Band keine andere markiert hatte:
 * vermutlich Anreise vom Camp, also früh erinnern.
 */
const REMINDER_LEAD_FAR_MIN = 45;
/**
 * Vorlauf, wenn im Fenster davor schon eine andere markierte Band lief
 * bzw. läuft: Nutzer steht vermutlich schon auf dem Gelände.
 */
const REMINDER_LEAD_NEAR_MIN = 15;
/**
 * So viele Minuten vor Slot-Start zählt eine andere markierte Band als
 * "Nutzer ist schon vor Ort" (Überlappung reicht, Start dort egal).
 */
const NEARBY_WINDOW_MIN = 60;
/** Karenz nach hinten, falls ein Cron-Lauf ausfiel (Slot lief gerade an). */
const REMINDER_GRACE_MIN = 5;

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
  const windowEnd = now.getTime() + REMINDER_LEAD_FAR_MIN * 60_000;

  for (const festival of await getFestivals()) {
    const timetable = await getTimetable(festival.id);
    if (!timetable || timetable.slots.length === 0) continue;

    // Start/Ende aller Slots als UTC-Millisekunden; Ende über die Dauer aus
    // den Wandzeiten (negative/fehlende Dauer zählt als 0).
    const times = new Map<string, { startMs: number; endMs: number }>();
    for (const slot of timetable.slots) {
      const start = slotStartDate(timetable, slot);
      if (!start) continue;
      const startMs = start.getTime();
      const durMin = Math.max(0, toMinutes(slot.end) - toMinutes(slot.start));
      times.set(slot.id, { startMs, endMs: startMs + durMin * 60_000 });
    }

    // Potenziell fällige Slots samt der Slots, die im NEARBY-Fenster davor
    // (noch) laufen – egal auf welcher Bühne.
    const due = new Map<string, { slot: Slot; start: Date; nearby: string[] }>();
    for (const slot of timetable.slots) {
      const t = times.get(slot.id);
      if (!t || t.startMs < windowStart || t.startMs > windowEnd) continue;
      const nearbyFrom = t.startMs - NEARBY_WINDOW_MIN * 60_000;
      const nearby: string[] = [];
      for (const other of timetable.slots) {
        if (other.id === slot.id) continue;
        const o = times.get(other.id);
        if (o && o.startMs < t.startMs && o.endMs > nearbyFrom) nearby.push(other.id);
      }
      due.set(slot.id, { slot, start: new Date(t.startMs), nearby });
    }
    if (due.size === 0) continue;
    result.dueSlots += due.size;

    // Auswahl-Paare für fällige und Nachbar-Slots in einer Abfrage holen:
    // Paare auf fälligen Slots sind die Kandidaten, Paare auf Nachbar-Slots
    // entscheiden über den Vorlauf des jeweiligen Nutzers.
    const lookupIds = new Set(due.keys());
    for (const entry of due.values()) for (const id of entry.nearby) lookupIds.add(id);
    const pairs = await getReminderCandidates(festival.id, [...lookupIds]);
    const selected = new Set(pairs.map((p) => `${p.userId}:${p.slotId}`));

    const toClaim: ReminderTarget[] = [];
    for (const p of pairs) {
      const entry = due.get(p.slotId);
      if (!entry) continue; // Paar nur für den Nachbar-Lookup geholt
      const onSite = entry.nearby.some((id) => selected.has(`${p.userId}:${id}`));
      const leadMin = onSite ? REMINDER_LEAD_NEAR_MIN : REMINDER_LEAD_FAR_MIN;
      if (now.getTime() >= entry.start.getTime() - leadMin * 60_000) toClaim.push(p);
    }

    const claimed = await claimReminders(toClaim);
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
