import { NextResponse } from 'next/server';
import { readSessionUserId } from '@/lib/auth';
import { INSTALL_PLATFORMS, recordInstallPing, type InstallPlatform } from '@/lib/db';
import { clientIp, rateLimit } from '@/lib/ratelimit';

export const dynamic = 'force-dynamic';

/** Zufalls-ID aus dem localStorage der Installation (UUID oder Fallback-String) */
const INSTALL_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Lebenszeichen einer Installation:
 *   { installId, standalone, platform }
 *
 * Der Client schickt das beim App-Start (gedrosselt auf ~12 h, siehe
 * src/lib/client/install.ts). Daraus entsteht die Antwort auf "wie viele
 * Leute haben die PWA noch auf dem Home-Screen" – abfragbar per
 * `npm run stats:installs`.
 *
 * Login ist NICHT nötig: Wer ausgeloggt ist, hat die App trotzdem
 * installiert. Mit Session wird die Installation zusätzlich dem Nutzer
 * zugeordnet, damit sich Geräte zu Personen zusammenfassen lassen.
 */
export async function POST(req: Request) {
  if (!rateLimit(`install-ping:${clientIp(req)}`, 30, 60_000)) {
    return NextResponse.json({ error: 'Zu viele Versuche' }, { status: 429 });
  }
  const body = await req.json().catch(() => null);
  const installId = typeof body?.installId === 'string' ? body.installId : '';
  if (!INSTALL_ID_RE.test(installId)) {
    return NextResponse.json({ error: 'Ungültige installId' }, { status: 400 });
  }
  const standalone = body?.standalone === true;
  const platform: InstallPlatform = (INSTALL_PLATFORMS as readonly string[]).includes(
    body?.platform
  )
    ? (body.platform as InstallPlatform)
    : 'other';
  await recordInstallPing(installId, standalone, platform, readSessionUserId(req));
  return NextResponse.json({ ok: true });
}
