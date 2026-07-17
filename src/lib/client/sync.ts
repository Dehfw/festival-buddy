'use client';

import type { DataPayload, GroupSummary, SelectionStatus, User } from '../types';

/**
 * Offline-first Sync:
 *  - Der Datenstand der aktiven Gruppe liegt als Snapshot in localStorage
 *    (überlebt Reloads offline); Cache-Key pro Gruppe, damit ein
 *    Gruppenwechsel offline nicht die falschen Leute zeigt.
 *  - Mutationen laufen durch sendOrEnqueue(): sofort optimistisch
 *    anwenden, an den Server senden – schlägt das Netz fehl, landet die
 *    Mutation in einer Warteschlange und wird beim nächsten Kontakt
 *    gesynct.
 *  - Nach jedem Server-Fetch werden noch offene Mutationen erneut auf den
 *    Snapshot angewendet, damit die UI nicht "zurückspringt".
 *  - Mehrere Tabs teilen sich dieselbe Queue: Browserweit flusht immer
 *    nur ein Tab (Web Locks, Fallback: localStorage-Lease), Queue-Writes
 *    laufen unter einem kurzen Lock und bestätigte Mutationen werden
 *    anhand ihrer eindeutigen ID entfernt – nie positionsbasiert.
 */

const DATA_KEY_PREFIX = 'fb.data.v2:'; // v2: Payload enthält jetzt `group`
const LEGACY_DATA_KEY = 'fb.data.v1';
const QUEUE_KEY_PREFIX = 'fb.queue.v2:'; // v2: Queue pro Nutzer isoliert (Nutzerwechsel!)
const LEGACY_QUEUE_KEY = 'fb.queue.v1';
const USER_KEY = 'fb.user.v1';
const GROUPS_KEY = 'fb.groups.v1';
const ACTIVE_GROUP_KEY = 'fb.group.v1';
const PENDING_INVITE_KEY = 'fb.pendingInvite';

// userId dient dem optimistischen Update und bestimmt, in welcher
// Nutzer-Queue die Mutation liegt – serverseitig zählt weiterhin
// ausschließlich die Passkey-Session (Cookie). Damit eine Mutation nie
// unter der Session eines anderen Nutzers landet, wird sie nur geflusht,
// solange ihr Besitzer der angemeldete Nutzer ist. group bestimmt, in
// welchem Gruppen-/Festival-Kontext die Mutation gilt ('' = Alt-Eintrag,
// der Server nimmt dann die erste Gruppe).
export type Mutation =
  | {
      op: 'selection';
      /** Eindeutige Mutation-ID; fehlt nur bei Alt-Einträgen früherer Versionen */
      id?: string;
      group: string;
      userId: string;
      slotId: string;
      status: SelectionStatus | null;
    }
  | {
      op: 'position';
      /** Eindeutige Mutation-ID; fehlt nur bei Alt-Einträgen früherer Versionen */
      id?: string;
      group: string;
      userId: string;
      slotId: string;
      x: number | null;
      y: number | null;
    };

/** Queue-Einträge älterer App-Versionen */
type LegacyMutation = {
  op: 'selection' | 'position';
  id?: string;
  userId: string;
  slotId: string;
  group?: string;
  attending?: boolean;
  status?: SelectionStatus | null;
  x?: number | null;
  y?: number | null;
};

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

export function loadCachedData(groupId: string): DataPayload | null {
  const data = safeParse<DataPayload>(localStorage.getItem(DATA_KEY_PREFIX + groupId));
  // Snapshot ohne group-Block (sollte es unter v2 nicht geben) verwerfen
  if (!data || !data.group) return null;
  return data;
}

export function saveCachedData(groupId: string, data: DataPayload) {
  localStorage.setItem(DATA_KEY_PREFIX + groupId, JSON.stringify(data));
}

export function clearCachedData(groupId: string) {
  localStorage.removeItem(DATA_KEY_PREFIX + groupId);
}

/**
 * Alle Gruppen-Snapshots entfernen (Logout/Session-Ende): private
 * Gruppendaten dürfen die Session nicht überleben. Die Offline-Queue
 * (fb.queue.v2:<userId>) bleibt bewusst liegen – sie ist pro Nutzer
 * isoliert und wird erst unter dessen eigener Session wieder gesendet.
 */
export function clearAllCachedData() {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(DATA_KEY_PREFIX)) keys.push(key);
  }
  for (const key of keys) localStorage.removeItem(key);
  localStorage.removeItem(LEGACY_DATA_KEY);
}

/** Cache aus der Ein-Gruppen-Ära wegräumen (Payload-Form hat sich geändert) */
export function cleanupLegacyCache() {
  localStorage.removeItem(LEGACY_DATA_KEY);
}

export function loadUser(): User | null {
  return safeParse<User>(localStorage.getItem(USER_KEY));
}

export function saveUser(user: User | null) {
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  else localStorage.removeItem(USER_KEY);
}

export function loadGroups(): GroupSummary[] | null {
  return safeParse<GroupSummary[]>(localStorage.getItem(GROUPS_KEY));
}

export function saveGroups(groups: GroupSummary[] | null) {
  if (groups) localStorage.setItem(GROUPS_KEY, JSON.stringify(groups));
  else localStorage.removeItem(GROUPS_KEY);
}

export function loadActiveGroup(): string | null {
  return localStorage.getItem(ACTIVE_GROUP_KEY);
}

export function saveActiveGroup(groupId: string | null) {
  if (groupId) localStorage.setItem(ACTIVE_GROUP_KEY, groupId);
  else localStorage.removeItem(ACTIVE_GROUP_KEY);
}

/**
 * Einladungscode aus einem /join/<code>-Link, der den Passkey-Login
 * überleben muss (sessionStorage: gilt nur für diesen Tab/Besuch).
 */
export function loadPendingInvite(): string | null {
  try {
    return sessionStorage.getItem(PENDING_INVITE_KEY);
  } catch {
    return null;
  }
}

export function savePendingInvite(code: string | null) {
  try {
    if (code) sessionStorage.setItem(PENDING_INVITE_KEY, code);
    else sessionStorage.removeItem(PENDING_INVITE_KEY);
  } catch {
    // Safari Private Mode o. Ä. – dann eben ohne Merken
  }
}

function parseQueue(raw: string | null): Mutation[] {
  const queue = safeParse<LegacyMutation[]>(raw) ?? [];
  return queue
    .filter((m) => m.op === 'selection' || m.op === 'position')
    .map((m): Mutation => {
      const group = typeof m.group === 'string' ? m.group : '';
      // Alt-Einträge ohne ID bleiben ohne ID (werden über ihre Feldwerte
      // identifiziert) – eine bei jedem Parse neu erfundene ID wäre nicht
      // stabil und würde die Bestätigung anhand der ID unmöglich machen.
      const id = typeof m.id === 'string' && m.id ? m.id : undefined;
      if (m.op === 'selection') {
        // Alt-Einträge (attending: boolean) auf status umschreiben
        const status =
          m.status !== undefined ? m.status : m.attending ? 'going' : null;
        return { op: 'selection', id, group, userId: m.userId, slotId: m.slotId, status: status ?? null };
      }
      return {
        op: 'position',
        id,
        group,
        userId: m.userId,
        slotId: m.slotId,
        x: m.x ?? null,
        y: m.y ?? null,
      };
    });
}

/**
 * Eindeutige Mutation-ID: Bestätigte Einträge werden anhand dieser ID aus
 * der Queue entfernt – nie positionsbasiert, denn ein anderer Tab kann die
 * Queue seit dem Lesen bereits verändert haben.
 */
function newMutationId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
      return crypto.randomUUID();
  } catch {
    // kein Secure Context o. Ä. -> Fallback unten
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Besitzer der aktiven Queue = lokal gespeicherter Nutzer. Der stammt
 * immer vom Server (Passkey-Login bzw. /api/me) und wird bei Logout/401
 * gelöscht – die Queue folgt also der tatsächlichen Session.
 */
function queueOwnerId(): string | null {
  return loadUser()?.id ?? null;
}

function queueKeyFor(userId: string): string {
  return QUEUE_KEY_PREFIX + userId;
}

function loadQueueFor(userId: string): Mutation[] {
  return parseQueue(localStorage.getItem(queueKeyFor(userId)));
}

function saveQueueFor(userId: string, queue: Mutation[]) {
  if (queue.length === 0) localStorage.removeItem(queueKeyFor(userId));
  else localStorage.setItem(queueKeyFor(userId), JSON.stringify(queue));
}

/** Warteschlange des aktuell angemeldeten Nutzers (leer, wenn keiner angemeldet ist). */
export function loadQueue(): Mutation[] {
  const owner = queueOwnerId();
  if (!owner) return [];
  return loadQueueFor(owner);
}

/**
 * Alte globale Queue (fb.queue.v1) auf benutzerspezifische Queues
 * verteilen: Jede Mutation wandert anhand ihrer userId in die Queue
 * ihres Besitzers und wird erst wieder gesendet, wenn genau dieser
 * Nutzer angemeldet ist. Einträge ohne userId sind niemandem sicher
 * zuordenbar und werden verworfen, statt sie unter einer womöglich
 * fremden Session zu senden.
 */
export function migrateLegacyQueue() {
  const raw = localStorage.getItem(LEGACY_QUEUE_KEY);
  if (raw === null) return;
  localStorage.removeItem(LEGACY_QUEUE_KEY);
  const byUser = new Map<string, Mutation[]>();
  for (const m of parseQueue(raw)) {
    if (!m.userId) continue;
    const list = byUser.get(m.userId) ?? loadQueueFor(m.userId);
    list.push(m);
    byUser.set(m.userId, list);
  }
  for (const [userId, queue] of byUser) saveQueueFor(userId, queue);
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
      if (m.status)
        next.selections.push({ userId: m.userId, slotId: m.slotId, status: m.status });
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
      return { slotId: m.slotId, status: m.status, ...(m.group ? { group: m.group } : {}) };
    case 'position':
      return { slotId: m.slotId, x: m.x, y: m.y, ...(m.group ? { group: m.group } : {}) };
  }
}

type PostResult =
  | { kind: 'ok' }
  /** Dauerhaft abgelehnt (z. B. 400/403/404) – Wiederholen ändert nichts */
  | { kind: 'rejected' }
  /** Temporärer Fehler (z. B. 5xx/429) – Mutation behalten, später erneut */
  | { kind: 'retry'; retryAfterMs: number | null }
  | { kind: 'offline' };

/**
 * Temporäre, potenziell wiederherstellbare Fehler: Timeouts, Rate-Limits
 * und Serverfehler (Deploy, Überlastung, Proxy, DB-Schluckauf …). Solche
 * Antworten bestätigen die Mutation nicht – sie muss in der Queue bleiben.
 * 401 zählt ebenfalls dazu: Da ist die Session weg, nicht die Mutation
 * ungültig – der Poll (fetchData) stößt den Login-Fluss an und nach
 * erneuter Anmeldung desselben Nutzers wird die Queue normal geflusht.
 */
function isTransientStatus(status: number): boolean {
  return status === 401 || status === 408 || status === 425 || status === 429 || status >= 500;
}

/** Retry-After-Header (Sekunden oder HTTP-Datum) in Millisekunden. */
function parseRetryAfter(res: Response): number | null {
  const raw = res.headers.get('Retry-After');
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(raw);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return null;
}

async function post(m: Mutation): Promise<PostResult> {
  try {
    const res = await fetch(ENDPOINTS[m.op], {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadFor(m)),
    });
    if (res.ok) return { kind: 'ok' };
    if (isTransientStatus(res.status))
      return { kind: 'retry', retryAfterMs: parseRetryAfter(res) };
    // Übrige 4xx: dauerhaft abgelehnt (ungültige Payload, keine
    // Gruppenberechtigung, Slot weg) -> nicht endlos wiederholen
    return { kind: 'rejected' };
  } catch {
    return { kind: 'offline' };
  }
}

/*
 * Browserweite Koordination (parallele Tabs):
 * Alle Tabs eines Profils teilen sich dieselbe localStorage-Queue, die
 * tablokale flushing-Variable wirkt aber nur innerhalb eines Tabs. Ohne
 * weitere Sperre könnten zwei Tabs dieselbe Mutation doppelt senden,
 * sich beim Read-Modify-Write der Queue gegenseitig Einträge
 * überschreiben und eine ältere, verspätete Anfrage könnte eine neuere
 * Benutzeraktion beim Server überschreiben. Deshalb:
 *  - Flush-Lock: browserweit höchstens ein aktiver Queue-Writer, alle
 *    Requests laufen strikt nacheinander in Queue-Reihenfolge (FIFO).
 *  - Write-Lock: kurzes Lock um jedes Read-Modify-Write der Queue
 *    (Einreihen, Entfernen), damit konkurrierende Tabs keine Einträge
 *    verlieren.
 * Web Locks gibt der Browser beim Schließen/Absturz eines Tabs
 * automatisch frei. Für Browser ohne Web Locks dient eine
 * localStorage-Lease mit Ablaufzeit als Fallback – ein abgestürzter Tab
 * hinterlässt also nie eine permanente Sperre.
 */
const FLUSH_LOCK = 'fb.queue.flush';
const WRITE_LOCK = 'fb.queue.write';
const FLUSH_LEASE_KEY = 'fb.queue.lock.v1';
const FLUSH_LEASE_MS = 15_000;
/** Identität dieses Tabs für die Fallback-Lease */
const TAB_ID = newMutationId();

type FlushLease = { owner: string; expires: number };

function webLocks(): LockManager | null {
  if (typeof navigator === 'undefined') return null;
  const locks = navigator.locks;
  return locks && typeof locks.request === 'function' ? locks : null;
}

/** Kurzes browserweites Lock um ein Read-Modify-Write der Queue. */
async function withQueueWrite<T>(fn: () => T): Promise<T> {
  const locks = webLocks();
  if (locks) return locks.request(WRITE_LOCK, async () => fn());
  // Ohne Web Locks direkt ausführen: Innerhalb des Tabs ist das
  // Read-Modify-Write synchron; das verbleibende Cross-Tab-Fenster ist
  // minimal und wird durch den Single-Flush-Writer zusätzlich begrenzt.
  return fn();
}

function readFlushLease(): FlushLease | null {
  return safeParse<FlushLease>(localStorage.getItem(FLUSH_LEASE_KEY));
}

function writeFlushLease() {
  localStorage.setItem(
    FLUSH_LEASE_KEY,
    JSON.stringify({ owner: TAB_ID, expires: Date.now() + FLUSH_LEASE_MS })
  );
}

function acquireFlushLease(): boolean {
  const current = readFlushLease();
  if (current && current.owner !== TAB_ID && current.expires > Date.now()) return false;
  writeFlushLease();
  // Zurücklesen: Haben zwei Tabs gleichzeitig geschrieben, gewinnt der
  // zuletzt gespeicherte Eintrag – nur dieser Tab darf flushen.
  return readFlushLease()?.owner === TAB_ID;
}

function releaseFlushLease() {
  if (readFlushLease()?.owner === TAB_ID) localStorage.removeItem(FLUSH_LEASE_KEY);
}

/**
 * Browserweit exklusiver Flush. Mit Web Locks warten weitere Tabs, bis
 * der aktive Writer fertig ist, und übernehmen dann die restliche Queue.
 * Der Fallback nutzt eine localStorage-Lease: Ist sie vergeben,
 * überspringt der Tab den Flush – der nächste Poll bzw. das nächste
 * online-Event versucht es erneut; stürzt der Halter ab, läuft die Lease
 * spätestens nach 15 s aus und ein anderer Tab kann übernehmen.
 */
async function withFlushLock(fn: () => Promise<number>): Promise<number> {
  const locks = webLocks();
  if (locks) return locks.request(FLUSH_LOCK, () => fn());
  if (!acquireFlushLease()) return 0;
  // Lease während eines langen Flushs regelmäßig verlängern, damit sie
  // nicht mitten in der Abarbeitung abläuft.
  const renew = setInterval(() => {
    if (readFlushLease()?.owner === TAB_ID) writeFlushLease();
  }, Math.floor(FLUSH_LEASE_MS / 3));
  try {
    return await fn();
  } finally {
    clearInterval(renew);
    releaseFlushLease();
  }
}

/**
 * Identität einer Mutation: bevorzugt über die eindeutige ID; Alt-Einträge
 * ohne ID werden über ihre vollständigen Feldwerte verglichen.
 */
function isSameMutation(a: Mutation, b: Mutation): boolean {
  if (a.id !== undefined || b.id !== undefined) return a.id === b.id;
  if (a.group !== b.group || a.userId !== b.userId || a.slotId !== b.slotId) return false;
  if (a.op === 'selection' && b.op === 'selection') return a.status === b.status;
  if (a.op === 'position' && b.op === 'position') return a.x === b.x && a.y === b.y;
  return false;
}

/**
 * Genau diese (bestätigte bzw. abgelehnte) Mutation aus der frisch
 * gelesenen Queue entfernen – nicht blind das erste Element: Ein anderer
 * Tab kann seit dem Lesen bereits weitere Einträge angehängt haben.
 */
function removeFromQueueFor(userId: string, m: Mutation) {
  const queue = loadQueueFor(userId);
  const idx = queue.findIndex((q) => isSameMutation(q, m));
  if (idx === -1) return;
  queue.splice(idx, 1);
  saveQueueFor(userId, queue);
}

/** Gehört dieser localStorage-Key zur Offline-Queue? (für storage-Events) */
export function isQueueStorageKey(key: string | null): boolean {
  return key !== null && (key.startsWith(QUEUE_KEY_PREFIX) || key === LEGACY_QUEUE_KEY);
}

/**
 * Mutation ausführen: IMMER erst in die Warteschlange, dann sofort
 * flushen. Eine Mutation verlässt die Queue erst, wenn der Server sie
 * bestätigt hat – so kann ein parallel laufender Poll den optimistischen
 * Zustand nie "zurückdrehen" (fetchData wendet die Queue wieder an).
 * Gibt true zurück, wenn die Queue danach leer ist (alles gesynct).
 */
export async function sendOrEnqueue(m: Mutation): Promise<boolean> {
  // Eindeutige ID vergeben: Nur anhand dieser ID wird der Eintrag nach
  // der Server-Bestätigung wieder entfernt.
  const entry: Mutation = { ...m, id: m.id ?? newMutationId() };
  // Immer in die Queue des Nutzers, der die Mutation ausgelöst hat –
  // niemals in eine fremde. Das Read-Modify-Write läuft unter dem
  // Write-Lock, damit ein parallel einreihender Tab nicht überschrieben
  // wird.
  await withQueueWrite(() => {
    const queue = loadQueueFor(entry.userId);
    queue.push(entry);
    saveQueueFor(entry.userId, queue);
  });
  await flushQueue();
  return loadQueueFor(entry.userId).length === 0;
}

// Backoff nach temporären Serverfehlern: Vor Ablauf der Wartezeit startet
// flushQueue() keinen Sende-Versuch – kein enger Retry-Loop, wenn der
// Server 5xx/429 liefert. Getrieben wird der Retry vom bestehenden
// Poll-/online-/visibilitychange-Zyklus, der flushQueue() ohnehin
// regelmäßig aufruft; die Wartezeit verdoppelt sich pro Fehlschlag bis
// zur Obergrenze, mit Jitter gegen gleichzeitige Retries vieler Clients.
const RETRY_BASE_MS = 5_000;
const RETRY_MAX_MS = 5 * 60_000;
let retryNotBefore = 0;
let retryFailures = 0;

function scheduleRetry(retryAfterMs: number | null) {
  const capped = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.min(retryFailures, 10));
  // 50–100 % der Backoff-Zeit (Jitter); ein Retry-After des Servers
  // (z. B. bei 429/503) gilt als Untergrenze und wird nie unterschritten.
  const jittered = capped * (0.5 + Math.random() * 0.5);
  retryNotBefore = Date.now() + Math.max(jittered, retryAfterMs ?? 0);
  retryFailures++;
}

// Nur ein Flush gleichzeitig pro Tab (Poll + Tap); browserweit sorgt
// zusätzlich withFlushLock dafür, dass höchstens ein Tab die geteilte
// Queue abarbeitet – keine Doppel-POSTs, keine vertauschte Reihenfolge.
let flushing: Promise<number> | null = null;

/** Warteschlange abarbeiten (FIFO). Bricht ab, sobald das Netz weg ist. */
export function flushQueue(): Promise<number> {
  if (flushing) return flushing;
  flushing = withFlushLock(doFlush).finally(() => {
    flushing = null;
  });
  return flushing;
}

async function doFlush(): Promise<number> {
  // Besitzer beim Start festhalten: Es wird ausschließlich die Queue
  // des gerade angemeldeten Nutzers gesendet.
  const owner = queueOwnerId();
  if (!owner) return 0;
  // Backoff nach temporärem Serverfehler noch aktiv? Dann jetzt keinen
  // Versuch starten – der nächste Poll nach Ablauf übernimmt den Retry.
  if (Date.now() < retryNotBefore) return 0;

  let flushed = 0;
  while (true) {
    // Zwischenzeitlicher Logout/Nutzerwechsel? Dann sofort aufhören –
    // die restliche Queue bleibt beim ursprünglichen Besitzer liegen
    // und wird erst bei dessen erneuter Anmeldung gesendet.
    if (queueOwnerId() !== owner) break;
    const queue = loadQueueFor(owner);
    if (queue.length === 0) break;
    const m = queue[0];
    const result = await post(m);
    if (result.kind === 'offline') break;
    if (result.kind === 'retry') {
      // Temporärer Fehler (5xx, 429, Session weg): Die Mutation bleibt
      // an der Spitze der Queue (FIFO), der Flush endet und ein
      // späterer Versuch bekommt eine Backoff-Wartezeit verpasst.
      scheduleRetry(result.retryAfterMs);
      break;
    }
    if (result.kind === 'rejected') {
      // Dauerhaft abgelehnt (z. B. 400/403/404): Eintrag verwerfen,
      // damit er die Queue nicht ewig blockiert. Der nächste Poll holt
      // den Server-Stand, die UI zeigt wieder die bestätigte Wahrheit.
      await withQueueWrite(() => removeFromQueueFor(owner, m));
      continue;
    }
    // Vom Server bestätigt -> genau diese Mutation (per ID) aus der
    // frisch gelesenen Queue nehmen, Backoff zurücksetzen
    retryFailures = 0;
    retryNotBefore = 0;
    await withQueueWrite(() => removeFromQueueFor(owner, m));
    flushed++;
  }
  return flushed;
}

export type FetchResult =
  | { kind: 'ok'; data: DataPayload }
  /** Session weg/abgelaufen -> zurück zum Passkey-Login */
  | { kind: 'unauthorized' }
  /** Kein Mitglied (mehr) dieser Gruppe -> Mitgliedschaften neu laden */
  | { kind: 'forbidden' }
  | { kind: 'offline' };

/** Frische Daten der Gruppe holen; wendet offene Mutationen wieder an. */
export async function fetchData(groupId: string): Promise<FetchResult> {
  try {
    const res = await fetch(`/api/data?group=${encodeURIComponent(groupId)}`, {
      cache: 'no-store',
    });
    if (res.status === 401) return { kind: 'unauthorized' };
    if (res.status === 403) return { kind: 'forbidden' };
    if (!res.ok) return { kind: 'offline' }; // 5xx wie Funkloch behandeln
    let data = (await res.json()) as DataPayload;
    for (const m of loadQueue()) {
      if (m.group === groupId || m.group === '') data = applyMutation(data, m);
    }
    saveCachedData(groupId, data);
    return { kind: 'ok', data };
  } catch {
    return { kind: 'offline' };
  }
}
