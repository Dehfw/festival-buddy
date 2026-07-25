import { NextResponse } from 'next/server';
import { readSessionUserId } from '@/lib/auth';
import { deletePushSubscription, upsertPushSubscription } from '@/lib/db';
import { clientIp, rateLimit } from '@/lib/ratelimit';

export const dynamic = 'force-dynamic';

/** base64url, wie PushSubscription.toJSON() die Schlüssel liefert */
const KEY_RE = /^[A-Za-z0-9_-]{1,256}$/;

function parseSubscription(
  raw: unknown
): { endpoint: string; p256dh: string; auth: string } | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const sub = raw as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const endpoint = typeof sub.endpoint === 'string' ? sub.endpoint : '';
  const p256dh = typeof sub.keys?.p256dh === 'string' ? sub.keys.p256dh : '';
  const auth = typeof sub.keys?.auth === 'string' ? sub.keys.auth : '';
  if (!endpoint || endpoint.length > 2048 || !endpoint.startsWith('https://')) return null;
  if (!KEY_RE.test(p256dh) || !KEY_RE.test(auth)) return null;
  return { endpoint, p256dh, auth };
}

/**
 * Push-Abo dieses Geräts speichern: { subscription: { endpoint, keys } }.
 * Idempotent (Upsert auf endpoint) – der Client darf beim App-Start
 * bedenkenlos re-syncen.
 */
export async function POST(req: Request) {
  const userId = readSessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 });
  }
  if (!rateLimit(`push-sub:${clientIp(req)}`, 10, 60_000)) {
    return NextResponse.json({ error: 'Zu viele Versuche' }, { status: 429 });
  }
  const body = await req.json().catch(() => null);
  const sub = parseSubscription(body?.subscription);
  if (!sub) {
    return NextResponse.json({ error: 'Ungültige Subscription' }, { status: 400 });
  }
  const userAgent = (req.headers.get('user-agent') || '').slice(0, 255);
  await upsertPushSubscription(userId, sub.endpoint, sub.p256dh, sub.auth, userAgent);
  return NextResponse.json({ ok: true });
}

/** Abo dieses Geräts löschen: { endpoint }. Idempotent. */
export async function DELETE(req: Request) {
  const userId = readSessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : '';
  if (!endpoint) {
    return NextResponse.json({ error: 'endpoint fehlt' }, { status: 400 });
  }
  await deletePushSubscription(endpoint, userId);
  return NextResponse.json({ ok: true });
}
