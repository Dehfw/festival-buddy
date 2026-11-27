import { timingSafeEqual } from 'crypto';

/**
 * Prüft `Authorization: Bearer <secret>` in konstanter Zeit – für die
 * Maschinen-Endpunkte (Cron, Betreiber-API), die kein Nutzerkonto kennen.
 */
export function hasBearer(req: Request, secret: string): boolean {
  const got = Buffer.from(req.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}
