import { NextResponse } from 'next/server';
import { hasBearer } from './bearer';
import { clientIp, rateLimit } from './ratelimit';

/**
 * Zugang zur Betreiber-API (/api/operator/*): kein Nutzerkonto, sondern
 * `Authorization: Bearer <LINEUP_API_SECRET>`. Die Endpunkte werden von
 * Claude-Sessions aufgerufen, die selbst keinen Datenbank-Zugang haben –
 * vom täglichen Lineup-Watch-Lauf und von Hand angestoßenen Sessions.
 * Ohne die Variable bleiben die Routen zu.
 *
 * Gibt die fertige Fehlerantwort zurück oder null, wenn der Aufruf darf.
 */
export function operatorGuard(req: Request): NextResponse | null {
  const secret = process.env.LINEUP_API_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'LINEUP_API_SECRET nicht gesetzt' }, { status: 503 });
  }
  // Bremse fürs Durchprobieren; ein Lauf braucht eine Handvoll Aufrufe.
  if (!rateLimit(`lineup-api:${clientIp(req)}`, 60, 10 * 60_000)) {
    return NextResponse.json({ error: 'Zu viele Anfragen' }, { status: 429 });
  }
  if (!hasBearer(req, secret)) {
    return NextResponse.json({ error: 'Kein Zugriff' }, { status: 401 });
  }
  return null;
}
