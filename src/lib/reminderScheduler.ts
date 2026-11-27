import { isPushConfigured } from './push';
import { runReminderSweep } from './reminders';

/**
 * In-Process-Takt für die Band-Erinnerungen (gestartet aus
 * src/instrumentation.ts). Jede Minute ein Sweep: Fällig ist eine
 * Erinnerung, sobald "jetzt >= Slot-Start − Vorlauf" gilt – je häufiger der
 * Lauf, desto pünktlicher kommt sie an. Ein Lauf, der noch nicht fertig ist,
 * wird nicht überholt.
 */
const INTERVAL_MS = 60_000;

const globalForScheduler = globalThis as unknown as { __fbReminderTimer?: NodeJS.Timeout };

export function startReminderScheduler(): void {
  if (globalForScheduler.__fbReminderTimer) return;
  if (!isPushConfigured()) {
    console.info('Band-Erinnerungen: VAPID-Keys fehlen – Takt nicht gestartet');
    return;
  }

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runReminderSweep(new Date());
    } catch (err) {
      console.error('Band-Erinnerungen: Lauf fehlgeschlagen', err);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => void tick(), INTERVAL_MS);
  // Den Prozess nicht allein wegen des Timers am Leben halten.
  timer.unref();
  globalForScheduler.__fbReminderTimer = timer;
  console.info('Band-Erinnerungen: Takt gestartet (alle 60 s)');
}
