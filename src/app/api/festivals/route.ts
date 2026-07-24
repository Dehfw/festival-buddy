import { NextResponse } from 'next/server';
import { getFestivals } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Festival-Auswahl für die Gruppengründung (öffentlich, unkritisch).
 * Zeitlich sortiert: das nächste bzw. laufende Festival steht vorn,
 * vergangene am Ende – der erste Eintrag ist im GroupGate vorausgewählt.
 */
export async function GET() {
  const festivals = await getFestivals();
  return NextResponse.json({ festivals }, { headers: { 'Cache-Control': 'no-store' } });
}
