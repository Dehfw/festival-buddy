import { createHash, createHmac, timingSafeEqual } from 'crypto';
import type { NextResponse } from 'next/server';
import { touchSession } from './db';

/**
 * Leichtgewichtige Auth-Schicht für den Passkey-Login:
 *  - HMAC-signierte Tokens (Challenge-Cookies + Session-Cookie), kein
 *    externer IdP.
 *  - Der Signatur-Schlüssel kommt aus AUTH_SECRET; ohne die Variable wird
 *    er deterministisch aus der DATABASE_URL abgeleitet, damit alle
 *    Serverless-Instanzen denselben Schlüssel benutzen.
 *  - Das Session-Cookie referenziert zusätzlich eine Zeile in der
 *    `sessions`-Tabelle (sid); Logout widerruft die Zeile serverseitig,
 *    statt sich auf ein rein clientseitiges Cookie-Löschen zu verlassen –
 *    ein kopiertes Token bliebe sonst bis zum Ablauf gültig.
 */

export const SESSION_COOKIE = 'fb_session';
export const REG_CHALLENGE_COOKIE = 'fb_wa_reg';
export const AUTH_CHALLENGE_COOKIE = 'fb_wa_auth';

/** Absolute Obergrenze einer Session, auch bei durchgehender Aktivität */
export const SESSION_MAX_AGE_S = 30 * 24 * 60 * 60;
/** Ohne Aktivität läuft die Session vorher ab (sliding window) */
export const SESSION_INACTIVITY_TIMEOUT_S = 7 * 24 * 60 * 60;
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

/**
 * Nutzer-ID aus dem Session-Cookie; null wenn nicht (mehr) eingeloggt.
 * Prüft zusätzlich zur Signatur/Ablauf des Tokens die zugehörige
 * `sessions`-Zeile (widerrufen? Inaktivitäts-Fenster überschritten?),
 * damit ein Logout auch kopierte Tokens sofort ungültig macht.
 */
export async function readSessionUserId(req: Request): Promise<string | null> {
  const data = openToken<{ uid: string; sid: string }>(getCookie(req, SESSION_COOKIE));
  if (typeof data?.uid !== 'string' || typeof data.sid !== 'string') return null;
  const userId = await touchSession(data.sid, SESSION_INACTIVITY_TIMEOUT_S);
  return userId === data.uid ? userId : null;
}

/** Session-ID aus dem Cookie lesen, ohne die DB anzufassen (für Logout). */
export function readSessionId(req: Request): string | null {
  const data = openToken<{ sid: string }>(getCookie(req, SESSION_COOKIE));
  return typeof data?.sid === 'string' ? data.sid : null;
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
