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

/** Alle paar Sekunden neue Daten holen (Anforderung: Live-Sync der Gruppe) */
const POLL_MS = 7000;

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
        saveUser(null);
        setUser(null);
        saveGroups(null);
        setGroups(null);
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

  const refresh = useCallback(async () => {
    await flushQueue();
    const groupId = activeRef.current;
    if (!groupId) {
      syncPending();
      return;
    }
    const result = await fetchData(groupId);
    if (result.kind === 'ok') {
      // Zwischenzeitlicher Gruppenwechsel? Dann Ergebnis verwerfen.
      if (activeRef.current === groupId) {
        setData(result.data);
        setOnline(true);
      }
    } else if (result.kind === 'offline') {
      setOnline(navigator.onLine ?? false);
    } else if (result.kind === 'unauthorized') {
      saveUser(null);
      setUser(null);
    } else if (result.kind === 'forbidden') {
      // Aus der Gruppe entfernt oder Gruppe gelöscht
      clearCachedData(groupId);
      if (activeRef.current === groupId) setData(null);
      await refreshMe();
    }
    syncPending();
  }, [refreshMe, syncPending]);

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
    void refresh();
    void refreshMe();

    const interval = setInterval(() => void refresh(), POLL_MS);
    const onOnline = () => void refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    // Queue-Änderungen anderer Tabs (Einreihen/Flush) sofort in der
    // Pending-Anzeige spiegeln – alle Tabs zeigen denselben Sync-Zustand.
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || isQueueStorageKey(e.key)) syncPending();
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('storage', onStorage);
    return () => {
      clearInterval(interval);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
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
      // Gruppenliste nachladen (frisch registriert = leer -> GroupGate)
      void refreshMe().then(() => refresh());
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
