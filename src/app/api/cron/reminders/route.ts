import { NextResponse } from 'next/server';
import { runReminderSweep } from '@/lib/reminders';

export const dynamic = 'force-dynamic';
// Der Sweep muss vor der Response fertig sein (Serverless).
export const maxDuration = 60;

/**
 * Zeitgesteuerter Einstieg für die Band-Erinnerungen, gedacht für einen
 * Aufruf alle ~5 Minuten. Vercel Cron (vercel.json) schickt CRON_SECRET
 * automatisch als Bearer-Header mit; ein externer Trigger (cron-job.org,
 * GitHub Actions – nötig auf dem Vercel-Hobby-Plan, der nur tägliche Crons
 * erlaubt) setzt denselben Header. Ohne CRON_SECRET bleibt die Route zu.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET nicht gesetzt' }, { status: 503 });
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Kein Zugriff' }, { status: 401 });
  }
  const result = await runReminderSweep(new Date());
  return NextResponse.json(result);
}
