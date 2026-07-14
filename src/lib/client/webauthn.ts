'use client';

import {
  browserSupportsWebAuthn,
  browserSupportsWebAuthnAutofill,
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser';
import type { User } from '../types';

/**
 * Browser-Seite des Passkey-Logins. Zwei Flows:
 *  - registerWithPasskey(name): Passkey anlegen -> Nutzer entsteht serverseitig
 *  - loginWithPasskey({ conditional }): bestehenden Passkey benutzen;
 *    conditional = Autodiscovery über das Namensfeld (iOS/Android bieten
 *    den Passkey von selbst an), sonst der klassische Modal-Dialog.
 */

export { browserSupportsWebAuthn, browserSupportsWebAuthnAutofill };

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

export async function registerWithPasskey(name: string): Promise<User> {
  const { options } = await post<{ options: never }>('/api/webauthn/register/options', {
    name,
  });
  const response = await startRegistration({ optionsJSON: options });
  const { user } = await post<{ user: User }>('/api/webauthn/register/verify', {
    response,
  });
  return user;
}

export async function loginWithPasskey(
  opts: { conditional?: boolean } = {}
): Promise<User> {
  const { options } = await post<{ options: never }>('/api/webauthn/login/options');
  const response = await startAuthentication({
    optionsJSON: options,
    useBrowserAutofill: opts.conditional === true,
  });
  const { user } = await post<{ user: User }>('/api/webauthn/login/verify', { response });
  return user;
}

/**
 * Abbruch durch Nutzer oder durch einen neu gestarteten WebAuthn-Call
 * (SimpleWebAuthn bricht laufende Conditional-UI-Requests automatisch ab) –
 * beides ist kein anzeigewürdiger Fehler.
 */
export function isWebAuthnAbort(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === 'AbortError' || err.name === 'NotAllowedError')
  );
}
