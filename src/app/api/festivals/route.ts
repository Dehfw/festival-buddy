import { NextResponse } from 'next/server';
import { getSelectableFestivals } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Festival-Auswahl für die Gruppengründung (öffentlich, unkritisch).
 * Bereits beendete Festivals tauchen hier nicht mehr auf.
 */
export async function GET() {
  const festivals = await getSelectableFestivals();
  return NextResponse.json({ festivals }, { headers: { 'Cache-Control': 'no-store' } });
}
