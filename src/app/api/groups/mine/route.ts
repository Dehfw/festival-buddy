import { NextResponse } from 'next/server';
import { readSessionUserId } from '@/lib/auth';
import { getGroupsForUser } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Meine Mitgliedschaften (für Gate & Gruppen-Switcher) */
export async function GET(req: Request) {
  const userId = readSessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 });
  }
  const groups = await getGroupsForUser(userId);
  return NextResponse.json({ groups }, { headers: { 'Cache-Control': 'no-store' } });
}
