'use client';

import type { User } from '../types';

/**
 * Browser-Seite des E-Mail+Passwort-Logins – dünne Wrapper um die
 * /api/password/*-Routen, gleiche Fehler-Konvention wie webauthn.ts:
 * Serverfehlermeldungen kommen als Error.message an und sind direkt
 * anzeigbar (deutsch, ohne Technik-Kauderwelsch).
 */

async function post<T>(url: string, body?: object): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      typeof data?.error === 'string' ? data.error : `Serverfehler (${res.status})`
    );
  }
  return data as T;
}

export async function registerWithPassword(
  name: string,
  email: string,
  password: string
): Promise<User> {
  const { user } = await post<{ user: User }>('/api/password/register', {
    name,
    email,
    password,
  });
  return user;
}

export async function loginWithPassword(email: string, password: string): Promise<User> {
  const { user } = await post<{ user: User }>('/api/password/login', {
    email,
    password,
  });
  return user;
}

/** Antwortet immer ok – ob die Adresse ein Konto hat, verrät der Server nicht */
export async function requestPasswordReset(email: string): Promise<void> {
  await post('/api/password/forgot', { email });
}

/** Neues Passwort per Token aus der Reset-Mail; loggt direkt ein */
export async function resetPassword(token: string, password: string): Promise<User> {
  const { user } = await post<{ user: User }>('/api/password/reset', {
    token,
    password,
  });
  return user;
}

/** E-Mail+Passwort ans eigene (eingeloggte) Konto hängen oder ändern */
export async function setPassword(opts: {
  email: string;
  password: string;
  currentPassword?: string;
}): Promise<string> {
  const { email } = await post<{ email: string }>('/api/password/set', opts);
  return email;
}

/** Passwort-Login entfernen; der Server schützt den letzten Login-Weg */
export async function removePassword(): Promise<void> {
  const res = await fetch('/api/password/set', { method: 'DELETE' });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      typeof data?.error === 'string' ? data.error : `Serverfehler (${res.status})`
    );
  }
}
