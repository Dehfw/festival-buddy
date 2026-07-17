'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { GroupGate } from '@/components/GroupGate';
import { JoinGate } from '@/components/JoinGate';
import { NameGate } from '@/components/NameGate';
import { AppProvider, useApp } from '@/lib/client/store';
import { loadPendingInvite } from '@/lib/client/sync';

/**
 * Gate-Kaskade:
 *   Sicherheitsstopp     -> private Caches der Vorsession noch nicht bereinigt
 *   kein Nutzer          -> NameGate (Passkey)
 *   gemerkte Einladung   -> JoinGate (Vorschau + Beitreten)
 *   keine Gruppe         -> GroupGate (gründen oder Code eingeben)
 *   sonst                -> App
 */
function Gate() {
  const { ready, user, groups, data, purgeBlocked } = useApp();
  const [pendingInvite, setPendingInvite] = useState<string | null>(null);

  useEffect(() => {
    setPendingInvite(loadPendingInvite());
  }, []);

  if (!ready) return null;
  if (purgeBlocked) {
    // Fail-closed: Solange gespeicherte Daten der vorherigen Sitzung nicht
    // nachweislich vom Gerät entfernt sind, lädt die App keine Gruppendaten
    // (und bietet auch keinen Login an) – der Store wiederholt die
    // Bereinigung automatisch und gibt die App danach von selbst frei.
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-8 text-center">
        <div className="font-metal text-3xl font-black text-blood">⚠️</div>
        <p className="text-sm font-bold text-bone">Sicherheitsstopp</p>
        <p className="text-sm text-ash">
          Gespeicherte Daten der letzten Sitzung konnten noch nicht
          vollständig von diesem Gerät entfernt werden. Aus Sicherheitsgründen
          werden bis dahin keine Gruppendaten geladen. Die App versucht es
          automatisch weiter – einen Moment bitte oder App neu starten.
        </p>
      </main>
    );
  }
  if (!user) return <NameGate />;
  if (pendingInvite) {
    return (
      <JoinGate
        code={pendingInvite}
        onDone={() => setPendingInvite(loadPendingInvite())}
      />
    );
  }
  if (groups !== null && groups.length === 0) return <GroupGate />;
  if (!data) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-8 text-center">
        <div className="font-metal text-3xl font-black text-blood">🤘</div>
        <p className="text-sm text-ash">
          Lade deine Gruppe … Beim allerersten Start wird einmal Netz
          gebraucht, danach läuft alles auch offline.
        </p>
      </main>
    );
  }
  return <AppShell />;
}

export default function Page() {
  return (
    <AppProvider>
      <Gate />
    </AppProvider>
  );
}
