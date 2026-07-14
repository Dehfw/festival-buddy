'use client';

import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/lib/client/store';
import { formatTime, toMinutes, type Slot } from '@/lib/types';
import { AvatarStack } from './Avatars';

const PX_PER_MIN = 1.05;
const COL_W = 128;
const GUTTER_W = 44;

/**
 * Hauptansicht 1: Timetable-Grid.
 * Y-Achse = Zeit, X-Achse = Bühnen, Tabs für die vier Festivaltage.
 */
export function TimetableView({
  dayId,
  onSlotTap,
}: {
  dayId: string;
  onSlotTap: (slot: Slot) => void;
}) {
  const { data, user } = useApp();
  const [nowMin, setNowMin] = useState<number | null>(null);

  const day = data?.timetable.days.find((d) => d.id === dayId);

  const daySlots = useMemo(
    () => (data ? data.timetable.slots.filter((s) => s.dayId === dayId) : []),
    [data, dayId]
  );

  const [startMin, endMin] = useMemo(() => {
    if (daySlots.length === 0) return [600, 1500];
    const starts = daySlots.map((s) => toMinutes(s.start));
    const ends = daySlots.map((s) => toMinutes(s.end));
    const lo = Math.floor(Math.min(...starts) / 60) * 60;
    const hi = Math.ceil(Math.max(...ends) / 60) * 60;
    return [lo, hi];
  }, [daySlots]);

  // "Jetzt"-Linie: Minuten seit 00:00 des angezeigten Festivaltags
  useEffect(() => {
    if (!day) return;
    const update = () => {
      const dayStart = new Date(`${day.date}T00:00:00`).getTime();
      const min = (Date.now() - dayStart) / 60000;
      setNowMin(min >= startMin && min <= endMin ? min : null);
    };
    update();
    const t = setInterval(update, 60_000);
    return () => clearInterval(t);
  }, [day, startMin, endMin]);

  if (!data || !day) return null;

  const stages = data.timetable.stages;
  const hours: number[] = [];
  for (let m = startMin; m <= endMin; m += 60) hours.push(m);
  const bodyH = (endMin - startMin) * PX_PER_MIN;

  const attendeesOf = (slotId: string) => {
    const ids = new Set(
      data.selections.filter((s) => s.slotId === slotId).map((s) => s.userId)
    );
    return data.users.filter((u) => ids.has(u.id));
  };

  return (
    <div className="h-full overflow-auto scrollbar-thin">
      <div style={{ width: GUTTER_W + stages.length * COL_W }}>
        {/* Kopfzeile: Bühnennamen */}
        <div className="sticky top-0 z-30 flex steel-sheen">
          <div
            className="sticky left-0 z-40 shrink-0 steel-sheen"
            style={{ width: GUTTER_W }}
          />
          {stages.map((stage) => (
            <div
              key={stage.id}
              className="shrink-0 border-l border-rivet px-2 py-2.5 text-center"
              style={{ width: COL_W }}
            >
              <div
                className="truncate font-metal text-[11px] font-black uppercase tracking-wider"
                style={{ color: stage.color }}
              >
                {stage.name}
              </div>
            </div>
          ))}
        </div>

        {/* Grid-Körper */}
        <div className="relative flex" style={{ height: bodyH }}>
          {/* Zeit-Spalte */}
          <div
            className="sticky left-0 z-20 shrink-0 bg-pit"
            style={{ width: GUTTER_W }}
          >
            {hours.map((m) => (
              <div
                key={m}
                className="absolute right-1.5 -translate-y-1/2 text-[10px] font-semibold text-ash"
                style={{ top: (m - startMin) * PX_PER_MIN }}
              >
                {String(Math.floor(m / 60) % 24).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {/* Stunden-Linien über alle Spalten */}
          {hours.map((m) => (
            <div
              key={`line-${m}`}
              className="pointer-events-none absolute right-0 border-t border-rivet/50"
              style={{
                top: (m - startMin) * PX_PER_MIN,
                left: GUTTER_W,
              }}
            />
          ))}

          {/* Bühnen-Spalten mit Band-Slots */}
          {stages.map((stage) => (
            <div
              key={stage.id}
              className="relative shrink-0 border-l border-rivet/60"
              style={{ width: COL_W }}
            >
              {daySlots
                .filter((s) => s.stageId === stage.id)
                .map((slot) => {
                  const top = (toMinutes(slot.start) - startMin) * PX_PER_MIN;
                  const height = Math.max(
                    34,
                    (toMinutes(slot.end) - toMinutes(slot.start)) * PX_PER_MIN - 3
                  );
                  const attendees = attendeesOf(slot.id);
                  const mine = !!user && attendees.some((a) => a.id === user.id);
                  return (
                    <button
                      key={slot.id}
                      onClick={() => onSlotTap(slot)}
                      className={`absolute inset-x-0.5 overflow-hidden rounded-md border text-left transition active:scale-[0.98] ${
                        mine
                          ? 'border-blood bg-blood/15'
                          : 'border-rivet bg-steel-2'
                      }`}
                      style={{
                        top,
                        height,
                        borderLeftWidth: 3,
                        borderLeftColor: stage.color,
                      }}
                    >
                      <div className="flex h-full flex-col justify-between px-1.5 py-1">
                        <div>
                          <div className="line-clamp-2 text-[11px] font-bold leading-tight text-bone">
                            {slot.band}
                          </div>
                          <div className="text-[9px] text-ash">
                            {formatTime(slot.start)}–{formatTime(slot.end)}
                          </div>
                        </div>
                        {attendees.length > 0 && (
                          <div className="pb-0.5">
                            <AvatarStack users={attendees} size={18} max={4} />
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
            </div>
          ))}

          {/* Jetzt-Linie */}
          {nowMin !== null && (
            <div
              className="now-line pointer-events-none absolute right-0 z-10 border-t-2 border-blood"
              style={{
                top: (nowMin - startMin) * PX_PER_MIN,
                left: GUTTER_W,
              }}
            >
              <span className="absolute -top-2 left-1 h-3 w-3 rounded-full bg-blood" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
