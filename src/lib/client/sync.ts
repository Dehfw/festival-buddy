'use client';

import type { DataPayload, User } from '../types';

/**
 * Offline-first Sync:
 *  - Alle Daten liegen als Snapshot in localStorage (überlebt Reloads offline).
 *  - Mutationen laufen durch mutate(): sofort optimistisch anwenden,
 *    an den Server senden – schlägt das Netz fehl, landet die Mutation
 *    in einer Warteschlange und wird beim nächsten Kontakt gesynct.
 *  - Nach jedem Server-Fetch werden noch offene Mutationen erneut auf den
 *    Snapshot angewendet, damit die UI nicht "zurückspringt".
 */

const DATA_KEY = 'fb.data.v1';
const QUEUE_KEY = 'fb.queue.v1';
const USER_KEY = 'fb.user.v1';

// userId steckt nur fürs optimistische Update drin – serverseitig zählt
// ausschließlich die Passkey-Session (Cookie).
export type Mutation =
  | { op: 'selection'; userId: string; slotId: string; attending: boolean }
  | { op: 'position'; userId: string; slotId: string; x: number | null; y: number | null };

const ENDPOINTS: Record<Mutation['op'], string> = {
  selection: '/api/selection',
  position: '/api/position',
};

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function loadCachedData(): DataPayload | null {
  return safeParse<DataPayload>(localStorage.getItem(DATA_KEY));
}

export function saveCachedData(data: DataPayload) {
  localStorage.setItem(DATA_KEY, JSON.stringify(data));
}

export function loadUser(): User | null {
  return safeParse<User>(localStorage.getItem(USER_KEY));
}

export function saveUser(user: User | null) {
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  else localStorage.removeItem(USER_KEY);
}

export function loadQueue(): Mutation[] {
  const queue = safeParse<Mutation[]>(localStorage.getItem(QUEUE_KEY)) ?? [];
  // Einträge aus der Nur-Name-Ära (op: 'user') aussortieren
  return queue.filter((m) => m.op === 'selection' || m.op === 'position');
}

export function saveQueue(queue: Mutation[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

/** Mutation lokal auf den Daten-Snapshot anwenden (optimistisches Update). */
export function applyMutation(data: DataPayload, m: Mutation): DataPayload {
  const next: DataPayload = {
    ...data,
    users: [...data.users],
    selections: [...data.selections],
    positions: [...data.positions],
  };
  switch (m.op) {
    case 'selection': {
      next.selections = next.selections.filter(
        (s) => !(s.userId === m.userId && s.slotId === m.slotId)
      );
      if (m.attending) next.selections.push({ userId: m.userId, slotId: m.slotId });
      else
        next.positions = next.positions.filter(
          (p) => !(p.userId === m.userId && p.slotId === m.slotId)
        );
      break;
    }
    case 'position': {
      next.positions = next.positions.filter(
        (p) => !(p.userId === m.userId && p.slotId === m.slotId)
      );
      if (m.x !== null && m.y !== null)
        next.positions.push({
          userId: m.userId,
          slotId: m.slotId,
          x: m.x,
          y: m.y,
          updatedAt: new Date().toISOString(),
        });
      break;
    }
  }
  return next;
}

function payloadFor(m: Mutation): unknown {
  switch (m.op) {
    case 'selection':
      return { slotId: m.slotId, attending: m.attending };
    case 'position':
      return { slotId: m.slotId, x: m.x, y: m.y };
  }
}

async function post(m: Mutation): Promise<'ok' | 'rejected' | 'offline'> {
  try {
    const res = await fetch(ENDPOINTS[m.op], {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadFor(m)),
    });
    if (res.ok) return 'ok';
    // 4xx/5xx: Server hat bewusst abgelehnt -> nicht endlos wiederholen
    return 'rejected';
  } catch {
    return 'offline';
  }
}

/**
 * Mutation ausführen: IMMER erst in die Warteschlange, dann sofort
 * flushen. Eine Mutation verlässt die Queue erst, wenn der Server sie
 * bestätigt hat – so kann ein parallel laufender Poll den optimistischen
 * Zustand nie "zurückdrehen" (fetchData wendet die Queue wieder an).
 * Gibt true zurück, wenn die Queue danach leer ist (alles gesynct).
 */
export async function sendOrEnqueue(m: Mutation): Promise<boolean> {
  const queue = loadQueue();
  queue.push(m);
  saveQueue(queue);
  await flushQueue();
  return loadQueue().length === 0;
}

// Nur ein Flush gleichzeitig – vermeidet Doppel-POSTs von Poll + Tap
let flushing: Promise<number> | null = null;

/** Warteschlange abarbeiten (FIFO). Bricht ab, sobald das Netz weg ist. */
export function flushQueue(): Promise<number> {
  if (flushing) return flushing;
  flushing = doFlush().finally(() => {
    flushing = null;
  });
  return flushing;
}

async function doFlush(): Promise<number> {
  let queue = loadQueue();
  if (queue.length === 0) return 0;

  let flushed = 0;
  while (true) {
    queue = loadQueue();
    if (queue.length === 0) break;
    const m = queue[0];
    const result = await post(m);
    if (result === 'offline') break;
    // ok ODER vom Server bewusst abgelehnt -> aus der Queue nehmen
    saveQueue(loadQueue().slice(1));
    flushed++;
  }
  return flushed;
}

/** Frische Daten vom Server holen; wendet offene Mutationen wieder an. */
export async function fetchData(): Promise<DataPayload | null> {
  try {
    const res = await fetch('/api/data', { cache: 'no-store' });
    if (!res.ok) return null;
    let data = (await res.json()) as DataPayload;
    for (const m of loadQueue()) data = applyMutation(data, m);
    saveCachedData(data);
    return data;
  } catch {
    return null;
  }
}
