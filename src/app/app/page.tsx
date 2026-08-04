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
 *   sonst                -> App
 */
function Gate() {
  const { ready, user, groups, data } = useApp();
  const [pendingInvite, setPendingInvite] = useState<string | null>(null);
  // Vorauswahl-Overlay für Nutzer, die SCHON Gruppen haben: Ohne Gruppe
  // übernimmt die Vollbild-GroupGate – mit Gruppen zeigt die Kaskade sonst
  // direkt die App, und der "Crew starten"-Klick von der Landingpage
  // liefe ins Leere. Also legt sich die GroupGate als Overlay darüber.
  const [festivalOverlay, setFestivalOverlay] = useState(false);

  // Festival-Landingpages (z. B. /partysan) verlinken auf
  // /app?festival=<id>: Vorauswahl merken, damit sie den Passkey-Login
  // überlebt, und den Parameter aus der URL nehmen (Reload/Bookmark).
  // Läuft vor dem ersten Gate-Render – GroupGate liest sie beim Mount.
  useEffect(() => {
    const festival = new URLSearchParams(window.location.search).get('festival');
    if (festival) {
      savePendingFestival(festival);
      window.history.replaceState(null, '', window.location.pathname);
    }
    setPendingInvite(loadPendingInvite());
  }, []);

  // Erst entscheiden, wenn Session UND Gruppen geladen sind. Nach einer
  // Gründung über die Vollbild-Gate ist die Vorauswahl bereits verbraucht
  // (savePendingFestival(null) vor adoptGroup) – dann öffnet sich nichts.
  useEffect(() => {
    if (!ready || !user || pendingInvite) return;
    if (!groups || groups.length === 0) return;
    if (loadPendingFestival()) setFestivalOverlay(true);
  }, [ready, user, groups, pendingInvite]);

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
      {festivalOverlay && (
        <GroupGate
          onClose={() => {
            // Schließen ohne Gründen = Vorauswahl verwerfen, sonst poppt
            // das Overlay beim nächsten /app-Besuch in diesem Tab wieder auf
            setFestivalOverlay(false);
            savePendingFestival(null);
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
