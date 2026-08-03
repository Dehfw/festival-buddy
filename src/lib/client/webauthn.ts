'use client';

import {
  browserSupportsWebAuthn,
  browserSupportsWebAuthnAutofill,
  startAuthentication,
  startRegistration,
  WebAuthnAbortService,
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

/**
 * Die noch offene Passkey-Abfrage abbrechen – gedacht für die
 * Hintergrund-Conditional-UI, sobald sie nicht mehr gebraucht wird
 * (Wechsel aufs E-Mail+Passwort-Formular, Panel zu, Unmount).
 *
 * Ohne den Abbruch bleibt `navigator.credentials.get({ mediation:
 * 'conditional' })` einfach hängen, und iOS/WebKit (auch Chrome auf iOS)
 * klopft dann bei jedem Tastenanschlag in beliebigen Formularfeldern die
 * offene Anfrage für AutoFill-Vorschläge ab – die Registrierung mit
 * E-Mail und Passwort fühlt sich dadurch pro Zeichen um ~0,5 s verzögert
 * an. Der ausgelöste `AbortError` wird von den Aufrufern über
 * `isWebAuthnAbort` geschluckt.
 */
export function cancelPendingPasskey(): void {
  WebAuthnAbortService.cancelCeremony();
}

async function post<T>(url: string, body?: object, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
    signal,
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
  opts: { conditional?: boolean; signal?: AbortSignal } = {}
): Promise<User> {
  const { options } = await post<{ options: never }>(
    '/api/webauthn/login/options',
    undefined,
    opts.signal
  );
  // Der Aufrufer kann während des Options-Requests längst abgebrochen
  // haben (z. B. Wechsel aufs E-Mail+Passwort-Formular). Dann darf die
  // Ceremony gar nicht erst starten: Ein cancelPendingPasskey() aus dem
  // Cleanup wäre schon verpufft, die Conditional-Anfrage bliebe hängen
  // und iOS würde wieder jeden Tastenanschlag ausbremsen.
  if (opts.signal?.aborted) {
    throw new DOMException('Passkey-Anfrage abgebrochen', 'AbortError');
  }
  const response = await startAuthentication({
    optionsJSON: options,
    useBrowserAutofill: opts.conditional === true,
  });
  const { user } = await post<{ user: User }>('/api/webauthn/login/verify', { response });
  return user;
}

/* --------------- Passkey-Verwaltung (Login & Sicherheit) ------------ */

export interface PasskeySummary {
  id: string;
  createdAt: string;
}

export async function listPasskeys(): Promise<PasskeySummary[]> {
  const res = await fetch('/api/webauthn/credentials', { cache: 'no-store' });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      typeof data?.error === 'string' ? data.error : `Serverfehler (${res.status})`
    );
  }
  return (data as { credentials: PasskeySummary[] }).credentials;
}

/** Weiteren Passkey ans eingeloggte Konto hängen (kein neuer Nutzer) */
export async function addPasskey(): Promise<void> {
  const { options } = await post<{ options: never }>('/api/webauthn/add/options');
  const response = await startRegistration({ optionsJSON: options });
  await post('/api/webauthn/add/verify', { response });
}

/** Eigenen Passkey löschen; der Server schützt den letzten Login-Weg */
export async function deletePasskey(id: string): Promise<void> {
  const res = await fetch(`/api/webauthn/credentials/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      typeof data?.error === 'string' ? data.error : `Serverfehler (${res.status})`
    );
  }
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
