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
 * Für die Hintergrund-Conditional-UI (Autofill am Namensfeld): dort feuert
 * ständig ein `AbortError` (neuer Request bricht den alten ab) oder ein
 * `NotAllowedError` (Nutzer tippt einfach weiter, statt den angebotenen
 * Passkey zu nehmen). Beides ist im Autofill-Modus kein anzeigewürdiger
 * Fehler und wird geschluckt.
 */
export function isWebAuthnAbort(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === 'AbortError' || err.name === 'NotAllowedError')
  );
}

/**
 * Fehlermeldung für einen *bewusst* per Button ausgelösten Passkey-Vorgang
 * ("Passkey anlegen" / "Ich hab schon einen Passkey"). Gibt `null` zurück,
 * wenn nichts angezeigt werden soll (echter Abbruch durch einen parallel
 * gestarteten Request).
 *
 * `NotAllowedError` ist auf Android besonders tückisch: der Browser wirft
 * ihn nicht nur bei "Nutzer hat abgebrochen", sondern auch, wenn der
 * System-Dialog gar nicht erst erscheint – typisch bei fehlender
 * Bildschirmsperre, veraltetem Chrome / Google Play Services oder in einem
 * In-App-Browser (WhatsApp/Instagram). Aus Nutzersicht "passiert dann
 * nichts" – deshalb hier ein konkreter Hinweis statt Stille.
 */
export function describeWebAuthnError(err: unknown): string | null {
  if (!(err instanceof Error)) return 'Unbekannter Fehler beim Passkey.';
  switch (err.name) {
    case 'AbortError':
      // Von einem neu gestarteten Request abgebrochen – nichts anzeigen.
      return null;
    case 'NotAllowedError':
      return (
        'Es kam keine Passkey-Abfrage durch. Häufigste Gründe auf Android: ' +
        'keine Bildschirmsperre (PIN / Muster / Fingerabdruck) eingerichtet, ' +
        'Chrome oder Google Play Services veraltet, oder die Seite läuft in ' +
        'einem In-App-Browser (z. B. aus WhatsApp/Instagram geöffnet – dann ' +
        'oben rechts „In Chrome öffnen“ wählen).'
      );
    case 'InvalidStateError':
      return 'Auf diesem Gerät hast du schon einen Passkey. Nimm „Ich hab schon einen Passkey“.';
    case 'SecurityError':
      return 'Passkeys gehen nur über eine sichere HTTPS-Verbindung mit passender Domain.';
    case 'NotSupportedError':
      return 'Dieses Gerät oder dieser Browser kann keine Passkeys. Bitte ein aktuelles Chrome benutzen.';
    default:
      return err.message || 'Passkey konnte nicht angelegt werden.';
  }
}
