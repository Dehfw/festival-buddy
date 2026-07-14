import { NextResponse } from 'next/server';
import { getTimetable, readDb } from '@/lib/db';
import type { DataPayload } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = readDb();
  const payload: DataPayload = {
    timetable: getTimetable(),
    users: db.users,
    selections: db.selections,
    positions: db.positions,
    blueprints: db.blueprints,
    rev: db.rev,
    serverTime: new Date().toISOString(),
  };
  return NextResponse.json(payload, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
