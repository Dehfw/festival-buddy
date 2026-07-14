'use client';

import { AppProvider, useApp } from '@/lib/client/store';
import { AppShell } from '@/components/AppShell';
import { NameGate } from '@/components/NameGate';

function Gate() {
  const { ready, user, data } = useApp();

  if (!ready) return null;
  if (!user) return <NameGate />;
  if (!data) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-8 text-center">
        <div className="font-metal text-3xl font-black text-blood">W:O:A</div>
        <p className="text-sm text-ash">
          Lade Timetable … Beim allerersten Start wird einmal Netz gebraucht,
          danach läuft alles auch offline.
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
