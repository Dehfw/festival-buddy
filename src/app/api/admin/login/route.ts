import { NextResponse } from 'next/server';
import { getAdminPassword } from '@/lib/admin';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (typeof body?.password !== 'string' || body.password !== getAdminPassword()) {
    return NextResponse.json({ error: 'Falsches Passwort' }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
