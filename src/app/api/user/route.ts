import { NextResponse } from 'next/server';
import { mutateDb, readDb } from '@/lib/db';
import { colorForName, userIdFromName } from '@/lib/ids';
import type { User } from '@/lib/types';

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

  const id = userIdFromName(name);
  const existing = readDb().users.find((u) => u.id === id);
  if (existing) return NextResponse.json({ user: existing });

  const user = await mutateDb<User>((db) => {
    const again = db.users.find((u) => u.id === id);
    if (again) return again;
    const created: User = {
      id,
      name,
      color: colorForName(name),
      createdAt: new Date().toISOString(),
    };
    db.users.push(created);
    return created;
  });

  return NextResponse.json({ user });
}
