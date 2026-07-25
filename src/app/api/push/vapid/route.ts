import { NextResponse } from 'next/server';
import { getVapidPublicKey } from '@/lib/push';

export const dynamic = 'force-dynamic';

/**
 * Öffentlicher VAPID-Key für pushManager.subscribe(). Bewusst zur Laufzeit
 * statt ins Bundle gebacken – so lässt sich das Schlüsselpaar rotieren,
 * ohne neu zu bauen. 503 = Push ist auf diesem Deployment nicht konfiguriert
 * (Client versteckt dann die Mitteilungs-Einstellungen).
 */
export async function GET() {
  const key = getVapidPublicKey();
  if (!key) {
    return NextResponse.json({ error: 'Push nicht konfiguriert' }, { status: 503 });
  }
  return NextResponse.json({ key });
}
