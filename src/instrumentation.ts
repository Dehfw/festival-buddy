/**
 * Next.js-Startup-Hook: läuft einmal beim Start des Node-Servers.
 *
 * Startet den Takt für die Band-Erinnerungen direkt im App-Prozess – die
 * App läuft als langlebiger Node-Server (Coolify), ein externer Cron ist
 * damit überflüssig. Die Route /api/cron/reminders bleibt für manuelle
 * bzw. externe Auslösung bestehen; doppelte Läufe (mehrere Container,
 * Rolling Deploy, zusätzlicher externer Cron) sind unschädlich, weil jede
 * Erinnerung über push_reminders_sent genau einmal geclaimt wird.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  // Nur im echten Server-Betrieb, nicht in `next dev` oder während `next build`.
  if (process.env.NODE_ENV !== 'production') return;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  if (process.env.REMINDER_SCHEDULER === 'off') return;

  const { startReminderScheduler } = await import('./lib/reminderScheduler');
  startReminderScheduler();
}
