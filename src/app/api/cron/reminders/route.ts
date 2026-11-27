import { timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { runReminderSweep } from '@/lib/reminders';

export const dynamic = 'force-dynamic';

/**
 * Manueller/externer Einstieg für die Band-Erinnerungen. Im Normalbetrieb
 * überflüssig: Der Server stößt den Sweep selbst jede Minute an
 * (src/instrumentation.ts). Nützlich zum Testen oder wenn der eingebaute
 * Takt per REMINDER_SCHEDULER=off abgeschaltet und z. B. durch einen
 * Coolify-Scheduled-Task ersetzt ist. Aufruf mit
 * `Authorization: Bearer <CRON_SECRET>`; ohne CRON_SECRET bleibt die Route zu.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET nicht gesetzt' }, { status: 503 });
  }
  const got = Buffer.from(req.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${secret}`);
  if (got.length !== want.length || !timingSafeEqual(got, want)) {
    return NextResponse.json({ error: 'Kein Zugriff' }, { status: 401 });
  }
  const result = await runReminderSweep(new Date());
  return NextResponse.json(result);
}
