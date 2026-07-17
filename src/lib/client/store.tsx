'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { DataPayload, GroupSummary, SelectionStatus, User } from '../types';
import {
  applyMutation,
  cleanupLegacyCache,
  clearAllCachedData,
  clearCachedData,
  fetchData,
  flushQueue,
  isQueueStorageKey,
  loadActiveGroup,
  loadCachedData,
  loadGroups,
  loadQueue,
  loadUser,
  migrateLegacyQueue,
  saveActiveGroup,
  saveCachedData,
  saveGroups,
  saveUser,
  sendOrEnqueue,
  type Mutation,
} from './sync';
import { ensurePrivateCachesPurged, purgePrivateCaches } from './swCache';

/** Alle paar Sekunden neue Daten holen (Anforderung: Live-Sync der Gruppe) */
const POLL_MS = 7000;
/**
 * Obergrenze für den Lese-Backoff: Ist der Server nicht erreichbar,
 * wächst der Abstand zwischen den Poll-Versuchen exponentiell (mit
 * Jitter) bis zu dieser Grenze, statt weiter alle 7 Sekunden ins
 * Funkloch zu funken. Der erste erfolgreiche Read kehrt zu POLL_MS
 * zurück, das online-Event startet sofort einen neuen Versuch.
 */
const POLL_BACKOFF_MAX_MS = 60_000;

interface AppState {
  ready: boolean;
  user: User | null;
  /** Meine Gruppen; null = noch nie geladen (Offline-Erststart) */
  groups: GroupSummary[] | null;
  activeGroupId: string | null;
  data: DataPayload | null;
  online: boolean;
  pending: number;
  /** Nach erfolgreichem Passkey-Login/-Registrierung übernehmen */
  loginAs: (user: User) => void;
  logout: () => void;
  /** Nutzer + Gruppenliste vom Server neu laden (/api/me) */
  refreshMe: () => Promise<void>;
  /** Nach Erstellen/Beitreten: Gruppe übernehmen und aktiv schalten */
  adoptGroup: (group: GroupSummary) => void;
  setActiveGroup: (groupId: string) => void;
  /** null = austragen, sonst neuen Status setzen */
  setSelection: (slotId: string, status: SelectionStatus | null) => void;
  setPosition: (slotId: string, x: number | null, y: number | null) => void;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp außerhalb von AppProvider');
  return ctx;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [groups, setGroups] = useState<GroupSummary[] | null>(null);
  const [activeGroupId, setActiveGroupIdState] = useState<string | null>(null);
  const [data, setData] = useState<DataPayload | null>(null);
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const dataRef = useRef<DataPayload | null>(null);
  dataRef.current = data;
  const activeRef = useRef<string | null>(null);
  activeRef.current = activeGroupId;
  // In-Flight-Sperre fürs Read-Polling: pro Provider läuft höchstens
  // ein Refresh gleichzeitig; parallele Auslöser teilen sich höchstens
  // EINEN eingereihten Folgelauf (siehe refresh()).
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const refreshQueuedRef = useRef<Promise<void> | null>(null);
  /** Aufeinanderfolgende Offline-Reads – steuert den Poll-Backoff */
  const pollFailuresRef = useRef(0);

  const syncPending = useCallback(() => {
    setPending(loadQueue().length);
  }, []);

  /**
   * Session + Gruppenliste prüfen. Sagt der Server 401, fliegt der lokale
   * Nutzer raus und die NameGate übernimmt. Offline bleibt der lokale
   * Stand gültig. Validiert auch die aktive Gruppe (rausgeflogen/gelöscht
   * -> auf die erste verbliebene Gruppe wechseln).
   */
  const refreshMe = useCallback(async () => {
    try {
      const res = await fetch('/api/me', { cache: 'no-store' });
      if (res.status === 401 || res.status === 403) {
        const hadUser = loadUser() !== null;
        saveUser(null);
        setUser(null);
        saveGroups(null);
        setGroups(null);
        if (hadUser) {
          // Session serverseitig beendet -> private Daten der Session räumen
          // (Snapshots + SW-Daten-Cache), bevor jemand anderes übernimmt.
          clearAllCachedData();
          void purgePrivateCaches();
        }
        return;
      }
      if (res.ok) {
        const { user: serverUser, groups: serverGroups } = (await res.json()) as {
          user: User;
          groups: GroupSummary[];
        };
        saveUser(serverUser);
        setUser(serverUser);
        saveGroups(serverGroups);
        setGroups(serverGroups);
        const active = activeRef.current;
        if (!active || !serverGroups.some((g) => g.id === active)) {
          const next = serverGroups[0]?.id ?? null;
          saveActiveGroup(next);
          activeRef.current = next;
          setActiveGroupIdState(next);
          if (!next) setData(null);
        }
      }
    } catch {
      // kein Netz – lokaler Nutzer/Gruppenstand bleibt
    }
  }, []);

  /** Eigentlicher Refresh-Durchlauf – nur über refresh() starten. */
  const doRefresh = useCallback(async () => {
    await flushQueue();
    const groupId = activeRef.current;
    // Ohne aktive Gruppe oder angemeldeten Nutzer gibt es nichts zu
    // lesen – kein /api/data-Request (der Queue-Flush oben ist ohne
    // Besitzer ohnehin ein No-op).
    if (!groupId || !loadUser()) {
      syncPending();
      return;
    }
    const result = await fetchData(groupId);
    // Nur echte Netz-/Serverausfälle zählen für den Poll-Backoff; jede
    // Server-Antwort (auch 401/403) setzt ihn zurück.
    pollFailuresRef.current =
      result.kind === 'offline' ? pollFailuresRef.current + 1 : 0;
    if (result.kind === 'ok') {
      // Zwischenzeitlicher Gruppenwechsel? Dann Ergebnis verwerfen.
      if (activeRef.current === groupId) {
        setData(result.data);
        setOnline(true);
      }
    } else if (result.kind === 'offline') {
      setOnline(navigator.onLine ?? false);
    } else if (result.kind === 'unauthorized') {
      const hadUser = loadUser() !== null;
      saveUser(null);
      setUser(null);
      if (hadUser) {
        // Session abgelaufen/beendet: gecachte Gruppendaten gehören zur
        // alten Session und dürfen offline nicht mehr abrufbar sein.
        clearAllCachedData();
        void purgePrivateCaches();
      }
    } else if (result.kind === 'forbidden') {
      // Aus der Gruppe entfernt oder Gruppe gelöscht
      clearCachedData(groupId);
      if (activeRef.current === groupId) setData(null);
      await refreshMe();
    }
    syncPending();
  }, [refreshMe, syncPending]);

  /**
   * Read-Refresh mit In-Flight-Sperre: Pro Provider läuft höchstens ein
   * Durchlauf gleichzeitig – ein langsamer /api/data-Request kann sich
   * nie mit dem nächsten überlappen. Weitere Aufrufer während eines
   * laufenden Durchlaufs (Poll-Timer, online-/visibilitychange-Event,
   * Gruppenwechsel) teilen sich genau EINEN eingereihten Folgelauf, der
   * erst nach Abschluss startet und dann den aktuellen Zustand (aktive
   * Gruppe!) liest – kein Request-Burst, kein verlorener Gruppenwechsel.
   */
  const refresh = useCallback((): Promise<void> => {
    const start = (): Promise<void> => {
      const run = doRefresh().finally(() => {
        refreshInFlightRef.current = null;
      });
      refreshInFlightRef.current = run;
      return run;
    };
    // Es wartet bereits ein Folgelauf? Dann teilen wir uns den.
    const queued = refreshQueuedRef.current;
    if (queued) return queued;
    const inFlight = refreshInFlightRef.current;
    if (!inFlight) return start();
    const next = inFlight
      .catch(() => {
        // Fehler des laufenden Durchlaufs gehören dessen Aufrufern
      })
      .then(() => {
        refreshQueuedRef.current = null;
        return start();
      });
    refreshQueuedRef.current = next;
    return next;
  }, [doRefresh]);

  // Initial: lokalen Stand sofort anzeigen, dann Netz versuchen; Poll-Loop.
  useEffect(() => {
    cleanupLegacyCache();
    // Alte globale Queue auf Nutzer-Queues verteilen, bevor irgendetwas
    // geflusht wird – sonst könnten fremde Mutationen unter der
    // aktuellen Session rausgehen.
    migrateLegacyQueue();
    setUser(loadUser());
    const cachedGroups = loadGroups();
    setGroups(cachedGroups);
    const storedActive = loadActiveGroup();
    const active =
      storedActive && cachedGroups?.some((g) => g.id === storedActive)
        ? storedActive
        : (cachedGroups?.[0]?.id ?? null);
    activeRef.current = active;
    setActiveGroupIdState(active);
    if (active) {
      const cached = loadCachedData(active);
      if (cached) setData(cached);
    }
    setReady(true);

    // Poll-Loop als setTimeout-Kette statt setInterval: Der nächste
    // Lauf wird erst NACH Abschluss des vorherigen geplant (keine
    // überlappenden Reads bei langsamen Antworten), im ausgeblendeten
    // Tab pausiert das Read-Polling komplett (Akku/Funk/Serverlast)
    // und bei nicht erreichbarem Server wächst der Abstand mit
    // begrenztem Backoff. Die Offline-Queue verliert dadurch nichts:
    // Geflusht wird weiterhin bei jedem Poll, beim online-Event (auch
    // verdeckt) und beim Sichtbarwerden.
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const clearTimer = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };
    const nextDelayMs = () => {
      const failures = pollFailuresRef.current;
      if (failures === 0) return POLL_MS;
      // Begrenzter exponentieller Backoff mit Jitter (50–100 %), damit
      // nach einem Ausfall nicht alle Clients im Gleichtakt anklopfen.
      const capped = Math.min(POLL_BACKOFF_MAX_MS, POLL_MS * 2 ** Math.min(failures, 5));
      return capped * (0.5 + Math.random() * 0.5);
    };
    const schedule = () => {
      // Ausgeblendet oder unmounted? Dann keinen neuen Read-Poll
      // planen – visibilitychange/online starten die Kette später neu.
      if (stopped || document.visibilityState === 'hidden') return;
      clearTimer();
      timer = setTimeout(() => {
        timer = null;
        pollNow();
      }, nextDelayMs());
    };
    // Genau EIN sofortiger Refresh (In-Flight-Sperre in refresh());
    // der nächste Poll wird erst nach dessen Abschluss geplant – ein
    // alter Timer kann keinen Doppel-Request erzeugen.
    const pollNow = () => {
      clearTimer();
      void refresh()
        .catch(() => {
          // Netzfehler meldet refresh() über den Online-Status
        })
        .finally(schedule);
    };

    // Eine beim letzten Logout fehlgeschlagene Cache-Bereinigung nachholen,
    // BEVOR der erste Datenabruf den SW-Daten-Cache wieder anfasst – sonst
    // könnte diese Session private Daten der vorherigen übernehmen.
    void ensurePrivateCachesPurged().then(() => {
      pollNow();
      void refreshMe();
    });

    const onOnline = () => {
      // Netz zurück: genau ein sofortiger Sync-Versuch (flusht auch
      // die Offline-Queue) – bewusst auch im ausgeblendeten Tab, damit
      // ausstehende Mutationen nicht aufs Sichtbarwerden warten müssen.
      // Regelmäßig weitergepollt wird nur sichtbar (schedule prüft das).
      pollNow();
    };
    const onVisibilityChange = () => {
      // Verdeckt läuft kein Read-Polling; beim Sichtbarwerden gibt es
      // genau einen sofortigen Refresh und erst nach dessen Abschluss
      // wieder einen regulären Poll-Zyklus.
      if (document.visibilityState === 'visible') pollNow();
      else clearTimer();
    };
    // Queue-Änderungen anderer Tabs (Einreihen/Flush) sofort in der
    // Pending-Anzeige spiegeln – alle Tabs zeigen denselben Sync-Zustand.
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || isQueueStorageKey(e.key)) syncPending();
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('storage', onStorage);
    return () => {
      stopped = true;
      clearTimer();
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('storage', onStorage);
    };
  }, [refresh, refreshMe, syncPending]);

  // Service-Worker-Registrierung + Update-Hinweis: siehe <UpdatePrompt />
  // (global im Root-Layout gemountet, damit es auf allen Seiten greift).

  const applyLocal = useCallback((m: Mutation) => {
    const current = dataRef.current;
    if (current) {
      const next = applyMutation(current, m);
      setData(next);
      if (activeRef.current) saveCachedData(activeRef.current, next);
    }
  }, []);

  const loginAs = useCallback(
    (nextUser: User) => {
      saveUser(nextUser);
      setUser(nextUser);
      // Nutzerwechsel: eine evtl. hängengebliebene Bereinigung des
      // Vorgänger-Caches nachholen, bevor der erste Datenabruf läuft.
      // Danach Gruppenliste nachladen (frisch registriert = leer -> GroupGate)
      void ensurePrivateCachesPurged()
        .then(() => refreshMe())
        .then(() => refresh());
    },
    [refreshMe, refresh]
  );

  const logout = useCallback(() => {
    saveUser(null);
    setUser(null);
    saveGroups(null);
    setGroups(null);
    saveActiveGroup(null);
    activeRef.current = null;
    setActiveGroupIdState(null);
    setData(null);
    // Private Gruppendaten dürfen den Logout nicht überleben: alle
    // localStorage-Snapshots (fb.data.v2:*) und die /api/data-Antworten
    // im Service-Worker-Cache (fb-data-*) löschen. Schlägt die
    // SW-Bereinigung fehl, bleibt ein Merker stehen und sie wird vor dem
    // nächsten Datenabruf nachgeholt – nie still übernommen.
    clearAllCachedData();
    void purgePrivateCaches();
    // Noch nicht gesyncte Mutationen bleiben in der Nutzer-Queue
    // (fb.queue.v2:<userId>) liegen und werden erst gesendet, wenn sich
    // derselbe Nutzer wieder anmeldet – nie unter einer fremden Session.
    syncPending();
    // Session-Cookie serverseitig löschen; der Passkey bleibt auf dem Gerät
    void fetch('/api/logout', { method: 'POST' }).catch(() => {});
  }, [syncPending]);

  const setActiveGroup = useCallback(
    (groupId: string) => {
      saveActiveGroup(groupId);
      activeRef.current = groupId;
      setActiveGroupIdState(groupId);
      setData(loadCachedData(groupId));
      void refresh();
    },
    [refresh]
  );

  const adoptGroup = useCallback(
    (group: GroupSummary) => {
      setGroups((prev) => {
        const next = [...(prev ?? []).filter((g) => g.id !== group.id), group];
        saveGroups(next);
        return next;
      });
      setActiveGroup(group.id);
    },
    [setActiveGroup]
  );

  const setSelection = useCallback(
    (slotId: string, status: SelectionStatus | null) => {
      if (!user || !activeRef.current) return;
      const m: Mutation = {
        op: 'selection',
        group: activeRef.current,
        userId: user.id,
        slotId,
        status,
      };
      applyLocal(m);
      void sendOrEnqueue(m).then((sent) => {
        if (!sent) setOnline(navigator.onLine ?? false);
        syncPending();
      });
    },
    [user, applyLocal, syncPending]
  );

  const setPosition = useCallback(
    (slotId: string, x: number | null, y: number | null) => {
      if (!user || !activeRef.current) return;
      const m: Mutation = {
        op: 'position',
        group: activeRef.current,
        userId: user.id,
        slotId,
        x,
        y,
      };
      applyLocal(m);
      void sendOrEnqueue(m).then((sent) => {
        if (!sent) setOnline(navigator.onLine ?? false);
        syncPending();
      });
    },
    [user, applyLocal, syncPending]
  );

  return (
    <Ctx.Provider
      value={{
        ready,
        user,
        groups,
        activeGroupId,
        data,
        online,
        pending,
        loginAs,
        logout,
        refreshMe,
        adoptGroup,
        setActiveGroup,
        setSelection,
        setPosition,
        refresh,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
