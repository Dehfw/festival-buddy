/**
 * Kleine In-Memory-Brute-Force-Bremse für Code-Rate-Versuche
 * (join/preview). Best effort – jeder Server-Prozess zählt für sich und
 * ein Neustart setzt zurück –, aber bei 32^8 möglichen Einladungscodes und ein
 * paar hundert Gruppen ist Durchprobieren ohnehin aussichtslos; die
 * Bremse nimmt nur die Spitze raus.
 */

const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  // Gelegentlich aufräumen, damit die Map nicht unbegrenzt wächst
  if (buckets.size > 1000) {
    for (const [k, b] of buckets) if (b.resetAt < now) buckets.delete(k);
  }
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= max) return false;
  bucket.count += 1;
  return true;
}

/**
 * Client-IP hinter dem Reverse-Proxy (Coolify/Traefik): erster Eintrag in
 * x-forwarded-for. Traefik verwirft von Clients mitgeschickte
 * X-Forwarded-For-Header, solange forwardedHeaders.insecure nicht aktiv ist.
 */
export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}
