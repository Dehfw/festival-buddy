'use client';

import { useMemo } from 'react';
import { useApp } from '@/lib/client/store';
import {
  formatTime,
  HOT_SLOT_THRESHOLD,
  splitAttendees,
  toMinutes,
  type Slot,
} from '@/lib/types';
import { AvatarStack } from './Avatars';
import { FireFrame } from './FireFrame';

/**
 * Hauptansicht 2: Kompakte Liste – nur Bands, bei denen mindestens
 * ein Crew-Mitglied eingetragen oder interessiert ist, mit Personenanzahl.
 */
export function ListView({ onSlotTap }: { onSlotTap: (slot: Slot) => void }) {
  const { data, user } = useApp();

  const grouped = useMemo(() => {
    if (!data) return [];
    const counts = new Map<string, number>();
    for (const sel of data.selections) {
      counts.set(sel.slotId, (counts.get(sel.slotId) ?? 0) + 1);
    }
    return data.timetable.days
      .map((day) => ({
        day,
        slots: data.timetable.slots
          .filter((s) => s.dayId === day.id && (counts.get(s.id) ?? 0) > 0)
          .sort((a, b) => toMinutes(a.start) - toMinutes(b.start)),
      }))
      .filter((g) => g.slots.length > 0);
  }, [data]);

  if (!data) return null;

  const attendeesOf = (slotId: string) =>
    splitAttendees(data.users, data.selections, slotId);

  if (grouped.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <div className="text-4xl">🤘</div>
        <p className="mt-3 text-sm text-ash">
          Noch keine Band ausgewählt. Geh in den Timetable und trag dich bei
          deinen Bands ein – hier entsteht dann euer Crew-Plan.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-4 pb-6 scrollbar-thin">
      <div className="mx-auto w-full max-w-2xl">
      {grouped.map(({ day, slots }) => (
        <section key={day.id} className="mt-5">
          <h2 className="font-metal mb-2 text-sm font-black uppercase tracking-wider text-ash">
            {day.longLabel}{' '}
            <span className="text-ash/50">
              · {new Date(day.date).toLocaleDateString('de-DE', {
                day: '2-digit',
                month: '2-digit',
              })}
            </span>
          </h2>
          <ul className="space-y-2">
            {slots.map((slot) => {
              const stage = data.timetable.stages.find((s) => s.id === slot.stageId)!;
              const { going, interested } = attendeesOf(slot.id);
              const attendees = [...going, ...interested];
              const fadedIds = new Set(interested.map((u) => u.id));
              const iGo = !!user && going.some((a) => a.id === user.id);
              const iAmInterested =
                !!user && interested.some((a) => a.id === user.id);
              const hot = going.length >= HOT_SLOT_THRESHOLD;
              return (
                <li key={slot.id}>
                  <button
                    onClick={() => onSlotTap(slot)}
                    className={`relative flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition active:scale-[0.99] ${
                      iGo
                        ? 'border-blood/60 bg-blood/10'
                        : iAmInterested
                          ? 'border-dashed border-ember/60 bg-ember/5'
                          : 'border-rivet bg-steel'
                    }`}
                  >
                    {hot && <FireFrame className="inset-0 rounded-xl" />}
                    <div
                      className="flex h-11 w-13 shrink-0 flex-col items-center justify-center rounded-lg px-1"
                      style={{ backgroundColor: `${stage.color}22` }}
                    >
                      <span className="text-[11px] font-black" style={{ color: stage.color }}>
                        {formatTime(slot.start)}
                      </span>
                      <span
                        className="text-[8px] font-bold uppercase tracking-wide"
                        style={{ color: stage.color }}
                      >
                        {stage.short}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold">{slot.band}</div>
                      <div className="truncate text-[11px] text-ash">
                        {stage.name} · bis {formatTime(slot.end)} Uhr
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <AvatarStack users={attendees} size={20} max={4} fadedIds={fadedIds} />
                      <span className="min-w-5 rounded-full bg-rivet px-1.5 py-0.5 text-center text-[11px] font-bold text-bone">
                        {going.length}
                      </span>
                      {interested.length > 0 && (
                        <span
                          className="rounded-full border border-dashed border-ember/60 px-1.5 py-0.5 text-[11px] font-bold text-ember"
                          title={`${interested.length} interessiert`}
                        >
                          +{interested.length}
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      </div>
    </div>
  );
}
