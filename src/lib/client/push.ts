/**
 * Web-Push-Abo aus Client-Sicht: Permission holen, beim Browser abonnieren,
 * Abo an den Server melden. Der Service Worker ist app-weit registriert
 * (siehe <UpdatePrompt /> im Root-Layout), navigator.serviceWorker.ready
 * löst also überall auf.
 *
 * iOS-Besonderheit: Safari kennt Web Push erst ab 16.4 und NUR für die
 * installierte Home-Screen-App – im Browser-Tab fehlen die APIs komplett.
 * Außerdem muss Notification.requestPermission() dort aus einer echten
 * Nutzer-Geste heraus laufen (Button-Tap), sonst wird sie still abgelehnt.
 */

export type PushSupport = 'ok' | 'unsupported' | 'ios-needs-install';

export type EnablePushResult = 'enabled' | 'denied' | 'unavailable' | 'error';

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

export function getPushSupport(): PushSupport {
  if (typeof window === 'undefined') return 'unsupported';
  const hasApis =
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (hasApis) return 'ok';
  // iOS zeigt die Push-APIs nur der installierten PWA – im Safari-Tab ist
  // "erst installieren" die richtige Ansage statt "nicht unterstützt".
  if (/iphone|ipad|ipod/i.test(navigator.userAgent) && !isStandalone()) {
    return 'ios-needs-install';
  }
  return 'unsupported';
}

export function getPushPermission(): NotificationPermission | null {
  if (typeof window === 'undefined' || !('Notification' in window)) return null;
  return Notification.permission;
}

/** applicationServerKey erwartet den VAPID-Key als Uint8Array */
function urlBase64ToUint8Array(base64url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function fetchVapidKey(): Promise<string | null> {
  try {
    const res = await fetch('/api/push/vapid');
    if (!res.ok) return null;
    const data = (await res.json()) as { key?: string };
    return typeof data.key === 'string' ? data.key : null;
  } catch {
    return null;
  }
}

async function postSubscription(sub: PushSubscription): Promise<boolean> {
  try {
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON() }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Mitteilungen aktivieren. MUSS aus einer Nutzer-Geste heraus aufgerufen
 * werden (Button-Handler) – iOS verweigert die Permission-Abfrage sonst.
 */
export async function enablePush(): Promise<EnablePushResult> {
  if (getPushSupport() !== 'ok') return 'unavailable';
  // Permission ZUERST – noch vor jedem await auf Netz. iOS bindet die
  // Abfrage an die "transient activation" des Taps; ein fetch davor kann
  // sie verfallen lassen und die Abfrage wird still abgelehnt.
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';
  const key = await fetchVapidKey();
  if (!key) return 'unavailable';
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ||
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
      }));
    return (await postSubscription(sub)) ? 'enabled' : 'error';
  } catch {
    return 'error';
  }
}

/** Mitteilungen auf diesem Gerät abschalten (Abo im Browser + Server weg). */
export async function disablePush(): Promise<void> {
  if (getPushSupport() !== 'ok') return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    const endpoint = sub.endpoint;
    await sub.unsubscribe().catch(() => undefined);
    await fetch('/api/push/subscribe', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint }),
    }).catch(() => undefined);
  } catch {
    // best effort – ein totes Abo räumt der Server beim nächsten 410 ab
  }
}

/** Ist auf diesem Gerät gerade ein Push-Abo aktiv? */
export async function getActiveSubscription(): Promise<PushSubscription | null> {
  if (getPushSupport() !== 'ok' || Notification.permission !== 'granted') return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/**
 * Vorhandenes Abo idempotent an den Server re-melden (Upsert): heilt einen
 * Nutzerwechsel auf geteiltem Gerät und verlorene DB-Zeilen. Einmal nach
 * App-Start aufrufen; ohne aktives Abo passiert nichts.
 */
export async function resyncPushSubscription(): Promise<void> {
  const sub = await getActiveSubscription();
  if (sub) await postSubscription(sub);
}
