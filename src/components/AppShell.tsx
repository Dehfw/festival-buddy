'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useApp } from '@/lib/client/store';
import type { Slot } from '@/lib/types';
import { Avatar } from './Avatars';
import { BandSheet } from './BandSheet';
import { ListView } from './ListView';
import { StagesView } from './StagesView';
import { TimetableView } from './TimetableView';

type Tab = 'timetable' | 'list' | 'stages';

export function AppShell() {
  const { data, user, online, pending, logout } = useApp();
  const [tab, setTab] = useState<Tab>('timetable');
  const [dayId, setDayId] = useState('');
  const [activeSlot, setActiveSlot] = useState<Slot | null>(null);

  // Standard-Tag: während des Festivals "heute", sonst der erste Tag
  useEffect(() => {
    if (!data) return;
    const days = data.timetable.days;
    if (days.some((d) => d.id === dayId)) return;
    const now = new Date();
    const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    setDayId(days.find((d) => d.date === iso)?.id ?? days[0]?.id ?? '');
  }, [data, dayId]);

  if (!data || !user) return null;

  return (
    <div className="flex h-dvh flex-col">
      {/* Header */}
      <header className="steel-sheen flex items-center justify-between px-4 pb-2 pt-[max(0.6rem,env(safe-area-inset-top))]">
        <div className="flex items-baseline gap-2">
          <span className="font-metal text-lg font-black text-blood">W:O:A</span>
          <span className="font-metal text-sm font-black uppercase text-bone">
            Festival Buddy
          </span>
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
          <button onClick={logout} title={`${user.name} – abmelden`}>
            <Avatar user={user} size={30} ring />
          </button>
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
