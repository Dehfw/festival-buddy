'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { DataPayload, User } from '../types';
import {
  applyMutation,
  fetchData,
  flushQueue,
  loadCachedData,
  loadQueue,
  loadUser,
  saveCachedData,
  saveUser,
  sendOrEnqueue,
  type Mutation,
} from './sync';

/** Alle paar Sekunden neue Daten holen (Anforderung: Live-Sync der Gruppe) */
const POLL_MS = 7000;

interface AppState {
  ready: boolean;
  user: User | null;
  data: DataPayload | null;
  online: boolean;
  pending: number;
  /** Nach erfolgreichem Passkey-Login/-Registrierung übernehmen */
  loginAs: (user: User) => void;
  logout: () => void;
  toggleSelection: (slotId: string, attending: boolean) => void;
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
  const [data, setData] = useState<DataPayload | null>(null);
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const dataRef = useRef<DataPayload | null>(null);
  dataRef.current = data;

  const syncPending = useCallback(() => {
    setPending(loadQueue().length);
  }, []);

  const refresh = useCallback(async () => {
    await flushQueue();
    const fresh = await fetchData();
    if (fresh) {
      setData(fresh);
      setOnline(true);
    } else {
      setOnline(navigator.onLine ?? false);
    }
    syncPending();
  }, [syncPending]);

  // Initial: Cache sofort anzeigen, dann Netz versuchen; Poll-Loop starten.
  useEffect(() => {
    setUser(loadUser());
    const cached = loadCachedData();
    if (cached) setData(cached);
    setReady(true);
    void refresh();

    // Session prüfen: Identität hängt am Passkey-Cookie. Sagt der Server
    // 401 (abgelaufen oder Alt-Client aus der Nur-Name-Ära), fliegt der
    // lokale Nutzer raus und die NameGate übernimmt. Offline bleibt der
    // lokale Stand gültig.
    void (async () => {
      try {
        const res = await fetch('/api/me', { cache: 'no-store' });
        if (res.status === 401 || res.status === 403) {
          saveUser(null);
          setUser(null);
        } else if (res.ok) {
          const { user: serverUser } = (await res.json()) as { user: User };
          saveUser(serverUser);
          setUser(serverUser);
        }
      } catch {
        // kein Netz – lokaler Nutzer bleibt
      }
    })();

    const interval = setInterval(() => void refresh(), POLL_MS);
    const onOnline = () => void refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  // Service Worker registrieren (PWA / Offline-Shell)
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  const applyLocal = useCallback((m: Mutation) => {
    const current = dataRef.current;
    if (current) {
      const next = applyMutation(current, m);
      setData(next);
      saveCachedData(next);
    }
  }, []);

  const loginAs = useCallback(
    (nextUser: User) => {
      saveUser(nextUser);
      setUser(nextUser);
      void refresh();
    },
    [refresh]
  );

  const logout = useCallback(() => {
    saveUser(null);
    setUser(null);
    // Session-Cookie serverseitig löschen; der Passkey bleibt auf dem Gerät
    void fetch('/api/logout', { method: 'POST' }).catch(() => {});
  }, []);

  const toggleSelection = useCallback(
    (slotId: string, attending: boolean) => {
      if (!user) return;
      const m: Mutation = { op: 'selection', userId: user.id, slotId, attending };
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
      if (!user) return;
      const m: Mutation = { op: 'position', userId: user.id, slotId, x, y };
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
        data,
        online,
        pending,
        loginAs,
        logout,
        toggleSelection,
        setPosition,
        refresh,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
