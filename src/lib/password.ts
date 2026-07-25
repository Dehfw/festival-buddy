import { createHash, randomBytes, scrypt, timingSafeEqual } from 'crypto';

/**
 * Passwort-Hashing für den optionalen E-Mail+Passwort-Login: scrypt aus
 * node:crypto, bewusst ohne zusätzliche Dependency. Gespeichert wird
 *   scrypt$N$r$p$<salt base64url>$<hash base64url>
 * – die Kostenparameter stecken im Wert selbst, damit eine spätere
 * Erhöhung alte Hashes nicht bricht (verifyPassword liest N/r/p mit).
 */

const SCRYPT_N = 16384; // 2^14 – ~16 MB RAM, schnell genug für Serverless
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 32;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 200;

/** Reset-Links verfallen nach 30 Minuten (steht auch so in der Mail) */
export const RESET_TOKEN_MAX_AGE_S = 30 * 60;

function scryptAsync(
  password: string,
  salt: Buffer,
  N: number,
  r: number,
  p: number
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      KEY_LENGTH,
      // maxmem großzügig über dem Bedarf (128*N*r Bytes), sonst wirft Node
      { N, r, p, maxmem: 64 * 1024 * 1024 },
      (err, key) => (err ? reject(err) : resolve(key))
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P);
  return [
    'scrypt',
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  const salt = Buffer.from(parts[4], 'base64url');
  const expected = Buffer.from(parts[5], 'base64url');
  if (salt.length === 0 || expected.length === 0) return false;
  try {
    const key = await scryptAsync(password, salt, N, r, p);
    return key.length === expected.length && timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

// Wegwerf-Hash, gegen den der Login bei unbekannter E-Mail prüft, damit
// die Antwortzeit nicht verrät, ob die Adresse ein Konto hat. Lazy, um
// den Cold-Start nicht mit einem unnötigen scrypt-Lauf zu belasten.
let dummyHash: Promise<string> | null = null;

export async function verifyAgainstDummy(password: string): Promise<void> {
  dummyHash ??= hashPassword('festival-buddy-timing-equalizer');
  await verifyPassword(password, await dummyHash);
}

/**
 * Bindet ein Reset-Token an den aktuellen Passwort-Hash: Sobald sich das
 * Passwort ändert (auch durch den Reset selbst), passt der Fingerprint
 * nicht mehr und das Token ist wertlos – ganz ohne Token-Tabelle.
 */
export function passwordFingerprint(storedHash: string): string {
  return createHash('sha256').update(storedHash).digest('base64url').slice(0, 16);
}

export const EMAIL_MAX_LENGTH = 254;

/**
 * E-Mail normalisieren (trim + lowercase) und grob validieren – bewusst
 * locker: etwas vor dem @, ein Punkt in der Domain. Die echte Prüfung ist
 * die Reset-Mail, die ankommt (oder eben nicht).
 */
export function normalizeEmail(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const email = input.trim().toLowerCase();
  if (email.length < 5 || email.length > EMAIL_MAX_LENGTH) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}
