import { timingSafeEqual } from 'crypto';
import { getCookie, openToken, sealToken } from './auth';

/** httpOnly-Cookie mit der signierten Admin-Session (kein Passwort im Browser). */
export const ADMIN_SESSION_COOKIE = 'fb_admin';
/** Admin-Session hält einen Arbeitstag, danach neu einloggen. */
export const ADMIN_SESSION_MAX_AGE_S = 12 * 60 * 60;

/**
 * Admin-Passwort aus der Umgebung. In der Produktion gibt es bewusst KEINEN
 * eingebauten Default mehr: Ohne gesetztes `ADMIN_PASSWORD` ist der
 * Admin-Bereich schlicht deaktiviert (fail closed) – so kann ein vergessenes
 * Env kein bekanntes Standard-Passwort offenlegen. Nur für die lokale
 * Entwicklung existiert ein Fallback.
 */
export function getAdminPassword(): string | null {
  const fromEnv = process.env.ADMIN_PASSWORD;
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  if (process.env.NODE_ENV !== 'production') return 'wacken2026';
  return null;
}

/** Ist der Admin-Bereich in dieser Umgebung überhaupt scharfgeschaltet? */
export function isAdminEnabled(): boolean {
  return getAdminPassword() !== null;
}

/** String-Vergleich in konstanter Zeit (kein Timing-Seitenkanal). */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Kandidat gegen das konfigurierte Admin-Passwort prüfen. */
export function verifyAdminPassword(candidate: unknown): boolean {
  const expected = getAdminPassword();
  if (!expected || typeof candidate !== 'string') return false;
  return safeEqual(candidate, expected);
}

/** Signiertes, ablaufendes Admin-Session-Token für das httpOnly-Cookie. */
export function issueAdminSessionToken(): string {
  return sealToken({ admin: true }, ADMIN_SESSION_MAX_AGE_S);
}

/**
 * Ist der Request durch eine gültige Admin-Session legitimiert? Geprüft wird
 * das signierte httpOnly-Cookie – nicht mehr ein vom Client mitgeschicktes
 * Passwort. Ist Admin in dieser Umgebung deaktiviert, wird immer abgelehnt.
 */
export function isAdminRequest(req: Request): boolean {
  if (!isAdminEnabled()) return false;
  const token = openToken<{ admin?: boolean }>(getCookie(req, ADMIN_SESSION_COOKIE));
  return token?.admin === true;
}
