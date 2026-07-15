import { NextResponse } from 'next/server';
import { getFestivals } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Festival-Auswahl für die Gruppengründung (öffentlich, unkritisch) */
export async function GET() {
  const festivals = await getFestivals();
  return NextResponse.json({ festivals }, { headers: { 'Cache-Control': 'no-store' } });
}
