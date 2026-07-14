'use client';

import type { DataPayload, User } from '../types';
import { colorForName, userIdFromName } from '../ids';

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

export type Mutation =
  | { op: 'user'; name: string }
  | { op: 'selection'; userId: string; slotId: string; attending: boolean }
  | { op: 'position'; userId: string; slotId: string; x: number | null; y: number | null };

const ENDPOINTS: Record<Mutation['op'], string> = {
  user: '/api/user',
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
  return safeParse<Mutation[]>(localStorage.getItem(QUEUE_KEY)) ?? [];
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
    case 'user': {
      const id = userIdFromName(m.name);
      if (!next.users.some((u) => u.id === id)) {
        next.users.push({
          id,
          name: m.name,
          color: colorForName(m.name),
          createdAt: new Date().toISOString(),
        });
      }
      break;
    }
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
        next.positions.push({ userId: m.userId, slotId: m.slotId, x: m.x, y: m.y });
      break;
    }
  }
  return next;
}

function payloadFor(m: Mutation): unknown {
  switch (m.op) {
    case 'user':
      return { name: m.name };
    case 'selection':
      return { userId: m.userId, slotId: m.slotId, attending: m.attending };
    case 'position':
      return { userId: m.userId, slotId: m.slotId, x: m.x, y: m.y };
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
 * Mutation ausführen: sofort versuchen, sonst einreihen.
 * Gibt true zurück, wenn sie direkt beim Server angekommen ist.
 */
export async function sendOrEnqueue(m: Mutation): Promise<boolean> {
  const result = await post(m);
  if (result === 'ok') return true;
  if (result === 'offline') {
    const queue = loadQueue();
    queue.push(m);
    saveQueue(queue);
  }
  return false;
}

/** Warteschlange abarbeiten (FIFO). Bricht ab, sobald das Netz wieder weg ist. */
export async function flushQueue(): Promise<number> {
  let queue = loadQueue();
  if (queue.length === 0) return 0;

  // Sicherstellen, dass der Nutzer serverseitig existiert, bevor
  // Selections/Positions gesynct werden (idempotent).
  const user = loadUser();
  if (user) await post({ op: 'user', name: user.name });

  let flushed = 0;
  while (queue.length > 0) {
    const m = queue[0];
    const result = await post(m);
    if (result === 'offline') break;
    queue = queue.slice(1);
    saveQueue(queue);
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
