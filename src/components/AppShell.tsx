'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/lib/client/store';
import type { Slot } from '@/lib/types';
import { Avatar } from './Avatars';
import { BandSheet } from './BandSheet';
import { DefektLogo } from './DefektLogo';
import { GroupAvatar } from './GroupAvatar';
import { InstallPrompt } from './InstallPrompt';
import { ListView } from './ListView';
import { StagesView } from './StagesView';
import { TimetableView } from './TimetableView';

type Tab = 'timetable' | 'list' | 'stages';

/**
 * Datum des aktuellen FESTIVALtags: ein Festivaltag läuft bis 08:00 früh –
 * um 01:30 in der Nacht ist also noch der Vortag "heute" (Nacht-Sets!).
 */
function todayFestivalDate(): string {
  const d = new Date(Date.now() - 8 * 3600 * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function AppShell() {
  const { data, user, online, pending } = useApp();
  const [tab, setTab] = useState<Tab>('timetable');
  const [dayId, setDayId] = useState('');
  const [activeSlot, setActiveSlot] = useState<Slot | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;

  // Beim Öffnen: aktueller Festivaltag ausgewählt (vor dem Festival: Tag 1)
  useEffect(() => {
    if (!data) return;
    const days = data.timetable.days;
    if (days.some((d) => d.id === dayId)) return;
    const today = todayFestivalDate();
    setDayId(days.find((d) => d.date === today)?.id ?? days[0]?.id ?? '');
  }, [data, dayId]);

  // Kommt die App nach >= 1 h Pause wieder in den Vordergrund (PWA bleibt
  // oft tagelang offen), springt sie zurück auf den aktuellen Festivaltag.
  useEffect(() => {
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        return;
      }
      if (Date.now() - hiddenAt < 60 * 60 * 1000) return;
      const days = dataRef.current?.timetable.days ?? [];
      const today = days.find((d) => d.date === todayFestivalDate());
      if (today) setDayId(today.id);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  if (!data || !user) return null;

  return (
    <div className="flex h-dvh flex-col">
      {/* Header */}
      <header className="steel-sheen flex items-center justify-between px-4 pb-2 pt-[max(0.6rem,env(safe-area-inset-top))]">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-blood shadow-[0_0_10px_#ff5a17]" />
          <DefektLogo />
          {/* Aktive Gruppe: Tap öffnet die Gruppen-Seite */}
          <Link
            href="/gruppe"
            className="flex min-w-0 items-center gap-1.5 rounded-full border border-rivet bg-steel-2 py-0.5 pl-0.5 pr-2.5"
            title={`${data.group.name} · ${data.group.festivalName}`}
          >
            <GroupAvatar
              groupId={data.group.id}
              name={data.group.name}
              imageVersion={data.group.imageVersion}
              size={22}
            />
            <span className="max-w-[8.5rem] truncate text-xs font-bold text-bone">
              {data.group.name}
            </span>
          </Link>
        </div>
        <div className="flex items-center gap-2.5">
          {!online && (
            <span className="rounded-full bg-ember/20 px-2 py-0.5 text-[10px] font-bold text-ember">
              OFFLINE{pending > 0 ? ` · ${pending} ausstehend` : ''}
            </span>
          )}
          {online && pending > 0 && (
            <span className="rounded-full bg-rivet px-2 py-0.5 text-[10px] font-bold text-ash">
              Sync … {pending}
            </span>
          )}
          {/* Profilbild öffnet die Gruppen-Seite (Abmelden lebt dort) */}
          <Link href="/gruppe" title={`${user.name} – Gruppe & Konto`}>
            <Avatar user={user} size={30} ring />
          </Link>
        </div>
      </header>

      {/* Tages-Tabs (nur Timetable-Ansicht) */}
      {tab === 'timetable' && (
        <div className="flex overflow-x-auto border-b border-rivet bg-steel scrollbar-thin">
          {data.timetable.days.map((d) => (
            <button
              key={d.id}
              onClick={() => setDayId(d.id)}
              className={`min-w-[3.2rem] flex-1 shrink-0 py-2.5 text-center text-sm font-black uppercase tracking-wide transition ${
                d.id === dayId
                  ? 'border-b-2 border-blood text-bone'
                  : 'text-ash'
              }`}
            >
              {d.label}
              <span className="ml-1 text-[10px] font-semibold text-ash/60">
                {new Date(d.date).getDate()}.
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Inhalt */}
      <main className="min-h-0 flex-1">
        {tab === 'timetable' && (
          <TimetableView dayId={dayId} onSlotTap={setActiveSlot} />
        )}
        {tab === 'list' && <ListView onSlotTap={setActiveSlot} />}
        {tab === 'stages' && <StagesView />}
      </main>

      {/* Bottom-Navigation */}
      <nav className="flex border-t border-rivet bg-steel pb-[max(0.4rem,env(safe-area-inset-bottom))]">
        <TabButton
          active={tab === 'timetable'}
          onClick={() => setTab('timetable')}
          icon="🗓️"
          label="Timetable"
        />
        <TabButton
          active={tab === 'list'}
          onClick={() => setTab('list')}
          icon="🤘"
          label="Unsere Bands"
        />
        <TabButton
          active={tab === 'stages'}
          onClick={() => setTab('stages')}
          icon="🗺️"
          label="Bühnen"
        />
        <Link
          href="/admin"
          className="flex flex-1 flex-col items-center gap-0.5 py-2 text-ash"
        >
          <span className="text-lg leading-none">⚙️</span>
          <span className="text-[10px] font-semibold uppercase tracking-wide">
            Admin
          </span>
        </Link>
      </nav>

      {activeSlot && (
        <BandSheet slot={activeSlot} onClose={() => setActiveSlot(null)} />
      )}

      <InstallPrompt />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 flex-col items-center gap-0.5 py-2 transition ${
        active ? 'text-blood' : 'text-ash'
      }`}
    >
      <span className="text-lg leading-none">{icon}</span>
      <span className="text-[10px] font-semibold uppercase tracking-wide">{label}</span>
    </button>
  );
}
