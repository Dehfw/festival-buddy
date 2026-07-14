import { NextResponse } from 'next/server';
import { getState, getTimetable } from '@/lib/db';
import type { DataPayload } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  const state = await getState();
  const payload: DataPayload = {
    timetable: getTimetable(),
    users: state.users,
    selections: state.selections,
    positions: state.positions,
    blueprints: state.blueprints,
    rev: state.rev,
    serverTime: new Date().toISOString(),
  };
  return NextResponse.json(payload, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
