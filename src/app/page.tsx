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
 *   kein Nutzer          -> NameGate (Passkey)
 *   gemerkte Einladung   -> JoinGate (Vorschau + Beitreten)
 *   keine Gruppe         -> GroupGate (gründen oder Code eingeben)
 *   sonst                -> App
 */
function Gate() {
  const { ready, user, groups, data } = useApp();
  const [pendingInvite, setPendingInvite] = useState<string | null>(null);

  useEffect(() => {
    setPendingInvite(loadPendingInvite());
  }, []);

  if (!ready) return null;
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
