import { NextResponse } from 'next/server';
import { upsertUser } from '@/lib/db';
import { colorForName, userIdFromName } from '@/lib/ids';

export const dynamic = 'force-dynamic';

/**
 * Login ohne Passwort: Name eingeben, fertig. IDs und Farben sind
 * deterministisch aus dem Namen abgeleitet – derselbe Name ergibt auf
 * jedem Gerät (auch offline) denselben Nutzer.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (name.length < 2 || name.length > 30) {
    return NextResponse.json(
      { error: 'Name muss 2–30 Zeichen lang sein' },
      { status: 400 }
    );
  }

  const user = await upsertUser({
    id: userIdFromName(name),
    name,
    color: colorForName(name),
  });

  return NextResponse.json({ user });
}
