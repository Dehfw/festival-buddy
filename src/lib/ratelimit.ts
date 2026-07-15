/**
 * Kleine In-Memory-Brute-Force-Bremse für Code-Rate-Versuche
 * (join/preview). Auf Serverless ist das best effort – jede Instanz
 * zählt für sich –, aber bei 32^8 möglichen Einladungscodes und ein
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

/** Client-IP hinter Proxy/Vercel (erster Eintrag in x-forwarded-for) */
export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}
