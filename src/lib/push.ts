import webpush from 'web-push';
import {
  deletePushSubscriptionByEndpoint,
  getPushSubscriptionsForUsers,
  type PushSubscriptionRecord,
} from './db';

/**
 * Web Push (VAPID): Versand von Push-Nachrichten an die in der DB
 * gespeicherten Abos. Die Keys kommen aus der Umgebung
 * (VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT, einmalig erzeugt per
 * `npx web-push generate-vapid-keys`). Ohne Keys degradiert alles sauber:
 * isPushConfigured() = false, Mitteilungen werden nur persistiert.
 */

/** Titel-/Text-Limits: hält den Payload weit unter dem ~4-KB-Push-Limit. */
export const PUSH_TITLE_MAX = 80;
export const PUSH_BODY_MAX = 500;

/** So viele Pushes gleichzeitig unterwegs (kein extra Dependency-Pool). */
const SEND_CONCURRENCY = 10;

export interface PushPayload {
  type: 'announcement' | 'reminder' | 'position';
  title: string;
  body: string;
  /** Deep-Link, den der SW bei Klick öffnet (z. B. /app?announcement=…) */
  url: string;
  /** Gleicher Tag ersetzt eine noch sichtbare Notification statt zu stapeln */
  tag?: string;
}

export interface PushSendResult {
  /** erfolgreich zugestellt (an den Push-Dienst übergeben) */
  sent: number;
  /** tote Abos (404/410) – wurden aus der DB gelöscht */
  gone: number;
  /** sonstige Fehler (Abo bleibt bestehen) */
  failed: number;
}

let vapidConfigured = false;

export function isPushConfigured(): boolean {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_SUBJECT
  );
}

export function getVapidPublicKey(): string | null {
  return isPushConfigured() ? (process.env.VAPID_PUBLIC_KEY as string) : null;
}

function ensureVapid(): boolean {
  if (!isPushConfigured()) return false;
  if (!vapidConfigured) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT as string,
      process.env.VAPID_PUBLIC_KEY as string,
      process.env.VAPID_PRIVATE_KEY as string
    );
    vapidConfigured = true;
  }
  return true;
}

async function sendToSubscription(
  sub: PushSubscriptionRecord,
  json: string
): Promise<'sent' | 'gone' | 'failed'> {
  try {
    // timeout: web-push hat sonst KEINEN Socket-Timeout – ein hängender
    // Push-Dienst würde den ganzen Versand (und damit die wartende
    // API-Antwort) bis zum Funktions-Timeout blockieren.
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      json,
      { TTL: 3600, urgency: 'high', timeout: 10_000 }
    );
    return 'sent';
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      // Abo existiert beim Push-Dienst nicht mehr (App deinstalliert,
      // Site-Daten gelöscht) -> Karteileiche aus der DB entfernen.
      await deletePushSubscriptionByEndpoint(sub.endpoint).catch(() => {});
      return 'gone';
    }
    return 'failed';
  }
}

/**
 * Payload an alle Abos der genannten Nutzer senden. Muss vor der Response
 * fertig ge-awaitet sein – auf Vercel läuft nach ihr nichts mehr.
 */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload
): Promise<PushSendResult> {
  const result: PushSendResult = { sent: 0, gone: 0, failed: 0 };
  if (!ensureVapid() || userIds.length === 0) return result;

  const subs = await getPushSubscriptionsForUsers(userIds);
  if (subs.length === 0) return result;
  const json = JSON.stringify(payload);

  // Kleines Concurrency-Fenster: die Abos als gemeinsame Warteschlange,
  // aus der SEND_CONCURRENCY Worker parallel abarbeiten.
  let next = 0;
  const workers = Array.from(
    { length: Math.min(SEND_CONCURRENCY, subs.length) },
    async () => {
      while (next < subs.length) {
        const sub = subs[next++];
        result[await sendToSubscription(sub, json)]++;
      }
    }
  );
  await Promise.all(workers);
  return result;
}
