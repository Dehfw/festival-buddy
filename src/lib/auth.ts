import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import type { NextResponse } from 'next/server';
import { revokeSession, touchSession } from './db';

/**
 * Leichtgewichtige Auth-Schicht für den Passkey-Login:
 *  - HMAC-signierte Tokens (Challenge-Cookies + Session-Cookie).
 *  - Das Session-Cookie trägt nur einen opaken, zufälligen Session-
 *    Identifier (sid); die eigentliche Sitzung (Nutzer, Ablauf, Widerruf)
 *    lebt serverseitig in der `sessions`-Tabelle (siehe db.ts), damit
 *    Logout und Inaktivitäts-Timeout auch bereits kopierte Cookie-
 *    Versionen entwerten (#36). Die Challenge-Cookies und das Admin-
 *    Cookie bleiben dagegen weiterhin rein selbstenthaltene, kurzlebige
 *    HMAC-Tokens.
 *  - Der Signatur-Schlüssel kommt aus AUTH_SECRET; ohne die Variable wird
 *    er deterministisch aus der DATABASE_URL abgeleitet, damit alle
 *    Serverless-Instanzen denselben Schlüssel benutzen.
 */

export const SESSION_COOKIE = 'fb_session';
export const REG_CHALLENGE_COOKIE = 'fb_wa_reg';
export const AUTH_CHALLENGE_COOKIE = 'fb_wa_auth';

/** Absolute Höchstlaufzeit: lang genug für die ganze Festival-Saison */
export const SESSION_MAX_AGE_S = 180 * 24 * 60 * 60;
/**
 * Inaktivitäts-Timeout: eine Sitzung ohne jede Aktivität wird serverseitig
 * abgelehnt, lange bevor die absolute Höchstlaufzeit erreicht ist. Das
 * begrenzt das Replay-Fenster eines kopierten Tokens auf 30 statt 180 Tage,
 * ohne aktive Nutzer während der Festivalsaison auszuloggen (#36).
 */
export const IDLE_TIMEOUT_S = 30 * 24 * 60 * 60;
/** Challenge muss innerhalb weniger Minuten beantwortet werden */
export const CHALLENGE_MAX_AGE_S = 5 * 60;

function getSecret(): Buffer {
  const seed =
    process.env.AUTH_SECRET ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    'festival-buddy-dev-secret';
  return createHash('sha256').update(`fb-auth:${seed}`).digest();
}

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}

function sign(payload: string): string {
  return b64url(createHmac('sha256', getSecret()).update(payload).digest());
}

/** Objekt als signiertes, ablaufendes Token verpacken: base64url(json).sig */
export function sealToken(data: object, maxAgeSeconds: number): string {
  const body = b64url(
    Buffer.from(
      JSON.stringify({ ...data, exp: Math.floor(Date.now() / 1000) + maxAgeSeconds })
    )
  );
  return `${body}.${sign(body)}`;
}

/** Token prüfen (Signatur + Ablauf); null bei jedem Fehler */
export function openToken<T extends object>(token: string | null | undefined): T | null {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString()) as T & {
      exp?: number;
    };
    if (typeof data.exp !== 'number' || data.exp < Date.now() / 1000) return null;
    return data;
  } catch {
    return null;
  }
}

export function getCookie(req: Request, name: string): string | null {
  const header = req.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(/;\s*/)) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq) === name) return decodeURIComponent(part.slice(eq + 1));
  }
  return null;
}

/** Neuen, kryptografisch zufälligen Session-Identifier erzeugen (roh, fürs Cookie). */
export function generateSessionId(): string {
  return b64url(randomBytes(32));
}

/** Session-Identifier gehasht, wie er in der `sessions`-Tabelle steht – der Rohwert verlässt nie die DB. */
export function hashSessionId(sessionId: string): string {
  return createHash('sha256').update(sessionId).digest('hex');
}

/**
 * Nutzer-ID aus dem Session-Cookie; null wenn nicht (mehr) eingeloggt.
 * Prüft neben Signatur/Ablauf des Cookies auch den serverseitigen
 * Sitzungsdatensatz (Widerruf, Inaktivitäts-Timeout) – ein vor dem Logout
 * kopiertes Cookie wird dadurch sofort ungültig (#36).
 */
export async function readSessionUserId(req: Request): Promise<string | null> {
  const data = openToken<{ sid: string }>(getCookie(req, SESSION_COOKIE));
  if (typeof data?.sid !== 'string') return null;
  const session = await touchSession(hashSessionId(data.sid), IDLE_TIMEOUT_S);
  return session?.userId ?? null;
}

/** Aktuelle Sitzung serverseitig widerrufen (Logout); no-op ohne gültiges Cookie. */
export async function revokeCurrentSession(req: Request): Promise<void> {
  const data = openToken<{ sid: string }>(getCookie(req, SESSION_COOKIE));
  if (typeof data?.sid === 'string') {
    await revokeSession(hashSessionId(data.sid));
  }
}

export interface RpConfig {
  rpID: string;
  rpName: string;
  expectedOrigin: string;
  secureCookies: boolean;
}

/**
 * Relying-Party-Konfiguration: per Env fest verdrahten (WEBAUTHN_RP_ID /
 * WEBAUTHN_ORIGIN) oder aus dem Request ableiten. Ein gefälschter Header
 * hilft Angreifern nicht – rpIdHash und Origin stecken signiert in der
 * Authenticator-Antwort und müssen zu diesen Werten passen.
 */
export function getRpConfig(req: Request): RpConfig {
  let origin = process.env.WEBAUTHN_ORIGIN || req.headers.get('origin') || '';
  if (!origin) {
    const host =
      req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost:3000';
    const proto =
      req.headers.get('x-forwarded-proto') ||
      (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
    origin = `${proto}://${host}`;
  }
  const rpID = process.env.WEBAUTHN_RP_ID || new URL(origin).hostname;
  return {
    rpID,
    rpName: 'Festival Buddy',
    expectedOrigin: origin,
    secureCookies: origin.startsWith('https'),
  };
}

interface CookieOpts {
  path?: string;
  maxAge?: number;
}

export function setAuthCookie(
  res: NextResponse,
  rp: RpConfig,
  name: string,
  value: string,
  opts: CookieOpts = {}
): void {
  res.cookies.set(name, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: rp.secureCookies,
    path: opts.path ?? '/',
    maxAge: opts.maxAge,
  });
}

export function clearAuthCookie(
  res: NextResponse,
  rp: RpConfig,
  name: string,
  path = '/'
): void {
  res.cookies.set(name, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: rp.secureCookies,
    path,
    maxAge: 0,
  });
}
