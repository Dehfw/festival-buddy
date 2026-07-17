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
 *  - Da localStorage kein CAS kennt, ist die Fallback-Lease prinzipiell
 *    nicht rennfrei. Deshalb geht die Mutation-ID als clientMutationId
 *    mit an den Server, der bereits verarbeitete IDs als No-op
 *    bestätigt (Idempotenz-Backstop), und verlorene Enqueues werden
 *    über eigene Pending-Einträge + storage-Events wieder eingereiht.
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
      /** Erstellungszeit (epoch ms) – ordnet Einträge, fehlt bei Alt-Einträgen */
      at?: number;
      group: string;
      userId: string;
      slotId: string;
      status: SelectionStatus | null;
    }
  | {
      op: 'position';
      /** Eindeutige Mutation-ID; fehlt nur bei Alt-Einträgen früherer Versionen */
      id?: string;
      /** Erstellungszeit (epoch ms) – ordnet Einträge, fehlt bei Alt-Einträgen */
      at?: number;
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
  at?: number;
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
      // Erstellungszeit unverändert übernehmen (fehlt bei Alt-Einträgen;
      // sie zählen beim Sortieren als älteste und bleiben damit vorn).
      const at = typeof m.at === 'number' && Number.isFinite(m.at) ? m.at : undefined;
      if (m.op === 'selection') {
        // Alt-Einträge (attending: boolean) auf status umschreiben
        const status =
          m.status !== undefined ? m.status : m.attending ? 'going' : null;
        return { op: 'selection', id, at, group, userId: m.userId, slotId: m.slotId, status: status ?? null };
      }
      return {
        op: 'position',
        id,
        at,
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
  // clientMutationId = Idempotenz-Schlüssel: Der Server bestätigt eine
  // bereits verarbeitete ID als No-op. Nur so ist ein doppelter Versand
  // aus parallelen Tabs (Fallback ohne Web Locks, nicht atomare Lease)
  // garantiert wirkungslos – auch wenn er verspätet eintrifft.
  const idempotency = m.id ? { clientMutationId: m.id } : {};
  switch (m.op) {
    case 'selection':
      return {
        slotId: m.slotId,
        status: m.status,
        ...(m.group ? { group: m.group } : {}),
        ...idempotency,
      };
    case 'position':
      return {
        slotId: m.slotId,
        x: m.x,
        y: m.y,
        ...(m.group ? { group: m.group } : {}),
        ...idempotency,
      };
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
 *    Requests laufen strikt nacheinander in Queue-Reihenfolge (FIFO
 *    nach Erstellungszeit).
 *  - Write-Lock: kurzes Lock um jedes Read-Modify-Write der Queue
 *    (Einreihen, Entfernen), damit konkurrierende Tabs keine Einträge
 *    verlieren.
 * Web Locks gibt der Browser beim Schließen/Absturz eines Tabs
 * automatisch frei; dieser Pfad ist vollständig atomar. Für Browser
 * ohne Web Locks gibt es KEINE rennfreie Sperre (localStorage kennt
 * kein Compare-and-Swap) – der Fallback ist deshalb mehrschichtig:
 *  1. localStorage-Lease mit Ablaufzeit, gehärtet durch doppeltes
 *     Zurücklesen mit kurzer Setzzeit (verkleinert das Rennfenster,
 *     schließt es nicht). Ein abgestürzter Tab hinterlässt nie eine
 *     permanente Sperre – die Lease läuft nach 15 s aus.
 *  2. Serverseitige Idempotenz als Backstop: Jede Mutation geht mit
 *     ihrer clientMutationId raus; senden zwei Lease-Gewinner dieselbe
 *     Mutation doppelt, wendet der Server sie genau einmal an und
 *     bestätigt das Duplikat als No-op (siehe payloadFor()).
 *  3. Verlorene Enqueues: Der Tab merkt sich seine eigenen noch
 *     offenen Einträge; überschreibt ein konkurrierender Write einen
 *     davon, reiht ihn die Reconciliation (storage-Event bzw. nächster
 *     Flush) per ID-Merge wieder ein – außer inzwischen existiert eine
 *     NEUERE Mutation fürs selbe Ziel oder der Eintrag wurde laut
 *     Erledigt-Liste bereits bestätigt.
 */
const FLUSH_LOCK = 'fb.queue.flush';
const WRITE_LOCK = 'fb.queue.write';
const FLUSH_LEASE_KEY = 'fb.queue.lock.v1';
const FLUSH_LEASE_MS = 15_000;
/** Setzzeit zwischen Lease-Schreiben und Zurücklesen (Fallback) */
const LEASE_SETTLE_MS = 25;
/** Erledigt-Liste (Fallback): kürzlich bestätigte/abgelehnte Mutation-IDs */
const DONE_KEY = 'fb.queue.done.v1';
const DONE_TTL_MS = 10 * 60_000;
const DONE_MAX = 64;
/** Zufällige Identität dieses Tabs für die Fallback-Lease */
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
  // Read-Modify-Write synchron. Das verbleibende Cross-Tab-Fenster wird
  // nicht durch eine Sperre geschlossen (unmöglich ohne CAS), sondern
  // durch ID-Merge beim Einreihen, die Erledigt-Liste und die
  // Reconciliation eigener offener Einträge abgefangen.
  return fn();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

/**
 * Fallback-Lease erwerben (Browser ohne Web Locks). Read-Check-Write über
 * localStorage ist nicht atomar; das doppelte Zurücklesen mit kurzer,
 * gejitterter Setzzeit sorgt dafür, dass bei nahezu gleichzeitigem
 * Schreiben zweier Tabs praktisch immer nur der zuletzt geschriebene
 * Eintrag gewinnt. Das RESTRISIKO eines doppelten Gewinners bleibt –
 * dann senden beide Tabs dieselbe Mutation, und die serverseitige
 * Idempotenz (clientMutationId) macht den zweiten Versand zum No-op.
 */
async function acquireFlushLease(): Promise<boolean> {
  const current = readFlushLease();
  if (current && current.owner !== TAB_ID && current.expires > Date.now()) return false;
  writeFlushLease();
  // Setzzeit mit Jitter: Ein konkurrierender Tab, der „gleichzeitig“
  // geschrieben hat, bekommt Zeit zu landen – beide sehen danach
  // denselben letzten Schreiber.
  await sleep(LEASE_SETTLE_MS + Math.random() * LEASE_SETTLE_MS);
  if (readFlushLease()?.owner !== TAB_ID) return false;
  // Zweites Zurücklesen nach erneuter Wartezeit: fängt einen Schreiber,
  // der erst nach dem ersten Zurücklesen gelandet ist.
  await sleep(LEASE_SETTLE_MS);
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
  if (!(await acquireFlushLease())) return 0;
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

/** Erstellungsreihenfolge; Alt-Einträge ohne `at` zählen als älteste. */
function byCreation(a: Mutation, b: Mutation): number {
  return (a.at ?? 0) - (b.at ?? 0);
}

/**
 * Eintrag per ID-Merge in die Queue übernehmen: ein evtl. schon
 * vorhandener Eintrag derselben ID wird ersetzt (nie doppelt), sortiert
 * wird stabil nach Erstellungszeit – so bleibt die FIFO-Reihenfolge auch
 * dann definiert, wenn ein verlorener älterer Eintrag nachträglich
 * wieder eingereiht wird.
 */
function insertSorted(queue: Mutation[], entry: Mutation): Mutation[] {
  const merged = queue.filter((q) => q.id === undefined || q.id !== entry.id);
  merged.push(entry);
  merged.sort(byCreation);
  return merged;
}

/*
 * Fallback ohne Web Locks: Weil Queue-Writes dort nicht atomar sind,
 * merkt sich jeder Tab seine EIGENEN noch offenen Einträge (Map unten)
 * und der Flush-Writer protokolliert endgültig erledigte IDs in einer
 * kurzen Erledigt-Liste in localStorage. Die Reconciliation kann damit
 * unterscheiden: Eintrag fehlt in der Queue, weil er bestätigt wurde
 * (Erledigt-Liste) – oder weil ihn ein konkurrierender Write
 * überschrieben hat (dann wieder einreihen).
 */
type DoneEntry = {
  id: string;
  at: number;
  op: Mutation['op'];
  userId: string;
  slotId: string;
  group: string;
  doneAt: number;
};

/** Eigene, noch nicht endgültig erledigte Einträge dieses Tabs (id -> Mutation) */
const ownedPending = new Map<string, Mutation>();

function loadDoneList(): DoneEntry[] {
  return safeParse<DoneEntry[]>(localStorage.getItem(DONE_KEY)) ?? [];
}

function recordDone(m: Mutation) {
  if (!m.id) return;
  const now = Date.now();
  const list = loadDoneList().filter((d) => d.id !== m.id && now - d.doneAt < DONE_TTL_MS);
  list.push({
    id: m.id,
    at: m.at ?? 0,
    op: m.op,
    userId: m.userId,
    slotId: m.slotId,
    group: m.group,
    doneAt: now,
  });
  localStorage.setItem(DONE_KEY, JSON.stringify(list.slice(-DONE_MAX)));
}

/**
 * Eigene offene Einträge mit der geteilten Queue abgleichen (nur im
 * Fallback ohne Web Locks nötig). Ein Eintrag, der aus der Queue
 * verschwunden ist, wird:
 *  - vergessen, wenn ihn die Erledigt-Liste als bestätigt/abgelehnt führt;
 *  - vergessen, wenn inzwischen eine NEUERE Mutation fürs selbe Ziel
 *    existiert (die neueste Benutzerabsicht darf nicht von einem wieder
 *    auferstandenen älteren Eintrag überschrieben werden);
 *  - sonst per ID-Merge wieder eingereiht (er wurde von einem
 *    konkurrierenden Write überschrieben).
 * Gibt true zurück, wenn mindestens ein Eintrag wieder eingereiht wurde.
 */
function reconcileOwnPending(): boolean {
  if (webLocks()) return false; // mit Web Locks geht kein Enqueue verloren
  if (ownedPending.size === 0) return false;
  const done = loadDoneList();
  const doneIds = new Set(done.map((d) => d.id));
  let reasserted = false;
  for (const [id, m] of ownedPending) {
    const queue = loadQueueFor(m.userId);
    if (queue.some((q) => q.id === id)) continue; // liegt (wieder) in der Queue
    if (doneIds.has(id)) {
      ownedPending.delete(id);
      continue;
    }
    const at = m.at ?? 0;
    const sameTarget = (t: { op: Mutation['op']; userId: string; slotId: string; group: string }) =>
      t.op === m.op && t.userId === m.userId && t.slotId === m.slotId && t.group === m.group;
    const newerExists =
      queue.some((q) => sameTarget(q) && (q.at ?? 0) > at) ||
      done.some((d) => sameTarget(d) && d.at > at);
    if (newerExists) {
      ownedPending.delete(id);
      continue;
    }
    saveQueueFor(m.userId, insertSorted(queue, m));
    reasserted = true;
  }
  return reasserted;
}

/**
 * Von außen (storage-Event im Store) angestoßener Abgleich: Hat ein
 * anderer Tab die Queue verändert und dabei einen eigenen offenen
 * Eintrag überschrieben, wird er wieder eingereiht und sofort geflusht.
 */
export async function reconcileQueue(): Promise<void> {
  if (reconcileOwnPending()) await flushQueue();
}

/**
 * Genau diese (bestätigte bzw. abgelehnte) Mutation aus der frisch
 * gelesenen Queue entfernen – nicht blind das erste Element: Ein anderer
 * Tab kann seit dem Lesen bereits weitere Einträge angehängt haben.
 * Im Fallback ohne Web Locks wird die ID zusätzlich in der
 * Erledigt-Liste protokolliert (auch wenn der Eintrag in der Queue schon
 * fehlt!), damit kein Tab einen bereits verarbeiteten Eintrag über die
 * Reconciliation wiederbelebt.
 */
function removeFromQueueFor(userId: string, m: Mutation) {
  const queue = loadQueueFor(userId);
  const idx = queue.findIndex((q) => isSameMutation(q, m));
  if (idx !== -1) {
    queue.splice(idx, 1);
    saveQueueFor(userId, queue);
  }
  if (!webLocks() && m.id) {
    recordDone(m);
    ownedPending.delete(m.id);
  }
}

/** Gehört dieser localStorage-Key zur Offline-Queue? (für storage-Events) */
export function isQueueStorageKey(key: string | null): boolean {
  return (
    key !== null &&
    (key.startsWith(QUEUE_KEY_PREFIX) || key === LEGACY_QUEUE_KEY || key === DONE_KEY)
  );
}

/**
 * Mutation ausführen: IMMER erst in die Warteschlange, dann sofort
 * flushen. Eine Mutation verlässt die Queue erst, wenn der Server sie
 * bestätigt hat – so kann ein parallel laufender Poll den optimistischen
 * Zustand nie "zurückdrehen" (fetchData wendet die Queue wieder an).
 * Gibt true zurück, wenn die Queue danach leer ist (alles gesynct).
 */
export async function sendOrEnqueue(m: Mutation): Promise<boolean> {
  // Eindeutige ID vergeben (nur anhand dieser ID wird der Eintrag nach
  // der Server-Bestätigung wieder entfernt und der Server erkennt
  // Duplikate) sowie die Erstellungszeit für die Sortierung festhalten.
  const entry: Mutation = { ...m, id: m.id ?? newMutationId(), at: m.at ?? Date.now() };
  // Immer in die Queue des Nutzers, der die Mutation ausgelöst hat –
  // niemals in eine fremde. Das Read-Modify-Write läuft unter dem
  // Write-Lock (Web Locks), damit ein parallel einreihender Tab nicht
  // überschrieben wird. Im Fallback ohne Web Locks schreibt der
  // ID-Merge (insertSorted) die Union aus frisch gelesener Queue und
  // eigenem Eintrag; verliert er das verbleibende Rennfenster doch,
  // reiht die Reconciliation (ownedPending + storage-Event) den Eintrag
  // wieder ein.
  const locks = webLocks();
  if (!locks && entry.id) ownedPending.set(entry.id, entry);
  await withQueueWrite(() => {
    saveQueueFor(entry.userId, insertSorted(loadQueueFor(entry.userId), entry));
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
  // Vor jedem Flush eigene, von konkurrierenden Writes überschriebene
  // Einträge wieder einreihen (No-op mit Web Locks) – auch dann, wenn
  // gleich ein anderer Tab die Lease hält und dieser Tab nicht flusht.
  reconcileOwnPending();
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
    // Ältesten Eintrag zuerst (defensiv sortiert – gespeicherte Queues
    // sind bereits nach Erstellungszeit geordnet): Für denselben Slot
    // erreicht so immer die neueste Benutzerabsicht den Server zuletzt.
    const m = [...queue].sort(byCreation)[0];
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
