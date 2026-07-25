'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { GroupGate } from '@/components/GroupGate';
import { JoinGate } from '@/components/JoinGate';
import { NameGate } from '@/components/NameGate';
import { AppProvider, useApp } from '@/lib/client/store';
import {
  loadPendingFestival,
  loadPendingInvite,
  savePendingFestival,
} from '@/lib/client/sync';

/**
 * Gate-Kaskade:
 *   kein Nutzer          -> NameGate (Passkey)
 *   gemerkte Einladung   -> JoinGate (Vorschau + Beitreten)
 *   keine Gruppe         -> GroupGate (gründen oder Code eingeben)
 *   sonst                -> App; kommt jemand mit Festival-Merker von
 *                           einer Landingpage (z. B. /partysan), öffnet
 *                           sich das "Gruppe gründen"-Overlay von selbst
 */
function Gate() {
  const { ready, user, groups, data } = useApp();
  const [pendingInvite, setPendingInvite] = useState<string | null>(null);
  const [createOverlay, setCreateOverlay] = useState(false);

  useEffect(() => {
    setPendingInvite(loadPendingInvite());
  }, []);

  // Festival-Vorauswahl von einer Landingpage: Wer noch keine Gruppe hat,
  // landet ohnehin im Vollbild-GroupGate (das den Merker konsumiert) –
  // wer schon Gruppen hat, würde sonst nur in der App landen und nichts
  // davon merken. Deshalb hier das Gründen-Overlay direkt aufmachen.
  useEffect(() => {
    if (groups && groups.length > 0 && loadPendingFestival()) {
      setCreateOverlay(true);
    }
  }, [groups]);

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
  return (
    <>
      <AppShell />
      {createOverlay && (
        <GroupGate
          onClose={() => {
            // Merker auch beim Abbrechen aufräumen (falls die Festival-
            // Liste nie geladen wurde und ihn nicht konsumiert hat)
            savePendingFestival(null);
            setCreateOverlay(false);
          }}
        />
      )}
    </>
  );
}

export default function Page() {
  return (
    <AppProvider>
      <Gate />
    </AppProvider>
  );
}
