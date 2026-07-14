'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '@/lib/client/store';
import { formatTime, toMinutes, type Slot } from '@/lib/types';
import { AvatarStack } from './Avatars';

const GUTTER_W = 44;
const ZOOM_KEY = 'fb.zoom.v1';

type Zoom = 'compact' | 'detail';

/** Kompakte Übersicht (mehr Bühnen auf einen Blick) vs. Detail-Ansicht */
const ZOOMS: Record<
  Zoom,
  {
    pxPerMin: number;
    colW: number;
    avatar: number;
    maxAvatars: number;
    showTimes: boolean;
    /** Ab dieser Slot-Höhe passen Avatare unter den Bandnamen, darunter daneben */
    stackedMinH: number;
  }
> = {
  compact: { pxPerMin: 0.72, colW: 88, avatar: 16, maxAvatars: 3, showTimes: false, stackedMinH: 40 },
  detail: { pxPerMin: 1.05, colW: 128, avatar: 18, maxAvatars: 4, showTimes: true, stackedMinH: 54 },
};

/**
 * Hauptansicht 1: Timetable-Grid.
 * Y-Achse = Zeit, X-Achse = Bühnen, Tabs für die Festivaltage.
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
  const [zoom, setZoom] = useState<Zoom>(() => {
    if (typeof window === 'undefined') return 'compact';
    return localStorage.getItem(ZOOM_KEY) === 'detail' ? 'detail' : 'compact';
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrolledFor = useRef<string | null>(null);

  const z = ZOOMS[zoom];
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
    const t = setInterval(update, 30_000);
    return () => clearInterval(t);
  }, [day, startMin, endMin]);

  // Beim Öffnen des aktuellen Tags automatisch zur Jetzt-Linie scrollen
  useEffect(() => {
    if (nowMin === null || !scrollRef.current) return;
    const key = `${dayId}|${zoom}`;
    if (autoScrolledFor.current === key) return;
    autoScrolledFor.current = key;
    const target = (nowMin - startMin) * z.pxPerMin - scrollRef.current.clientHeight / 3;
    scrollRef.current.scrollTop = Math.max(0, target);
  }, [nowMin, dayId, zoom, startMin, z.pxPerMin]);

  if (!data || !day) return null;

  const stages = data.timetable.stages;
  const hours: number[] = [];
  for (let m = startMin; m <= endMin; m += 60) hours.push(m);
  const bodyH = (endMin - startMin) * z.pxPerMin;

  const attendeesOf = (slotId: string) => {
    const ids = new Set(
      data.selections.filter((s) => s.slotId === slotId).map((s) => s.userId)
    );
    return data.users.filter((u) => ids.has(u.id));
  };

  const toggleZoom = () => {
    const next: Zoom = zoom === 'compact' ? 'detail' : 'compact';
    setZoom(next);
    localStorage.setItem(ZOOM_KEY, next);
  };

  return (
    <div className="relative h-full">
      <div ref={scrollRef} className="h-full overflow-auto scrollbar-thin">
        <div style={{ width: GUTTER_W + stages.length * z.colW }}>
          {/* Kopfzeile: Bühnennamen */}
          <div className="sticky top-0 z-30 flex steel-sheen">
            <div
              className="sticky left-0 z-40 shrink-0 steel-sheen"
              style={{ width: GUTTER_W }}
            />
            {stages.map((stage) => (
              <div
                key={stage.id}
                className="shrink-0 border-l border-rivet px-1 py-2.5 text-center"
                style={{ width: z.colW }}
              >
                <div
                  className="truncate font-metal text-[10px] font-black uppercase tracking-wider"
                  style={{ color: stage.color }}
                  title={stage.name}
                >
                  {zoom === 'compact' ? stage.short : stage.name}
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
                  style={{ top: (m - startMin) * z.pxPerMin }}
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
                  top: (m - startMin) * z.pxPerMin,
                  left: GUTTER_W,
                }}
              />
            ))}

            {/* Bühnen-Spalten mit Band-Slots */}
            {stages.map((stage) => (
              <div
                key={stage.id}
                className="relative shrink-0 border-l border-rivet/60"
                style={{ width: z.colW }}
              >
                {daySlots
                  .filter((s) => s.stageId === stage.id)
                  .map((slot) => {
                    const top = (toMinutes(slot.start) - startMin) * z.pxPerMin;
                    const height = Math.max(
                      zoom === 'compact' ? 24 : 34,
                      (toMinutes(slot.end) - toMinutes(slot.start)) * z.pxPerMin - 3
                    );
                    const attendees = attendeesOf(slot.id);
                    const mine = !!user && attendees.some((a) => a.id === user.id);
                    // Kurze Slots: Avatare neben dem Namen, sonst würden sie abgeschnitten
                    const stacked = height >= z.stackedMinH;
                    // Zweite Namenszeile nur, wenn sie über den Avataren komplett Platz hat
                    const lineH = zoom === 'compact' ? 11 : 13;
                    const nameClamp =
                      attendees.length === 0 || height >= z.stackedMinH + lineH
                        ? 'line-clamp-2'
                        : 'line-clamp-1';
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
                        {stacked ? (
                          <div className="flex h-full flex-col px-1.5 py-1">
                            {/* Textbereich darf schrumpfen – die Avatare bleiben immer voll sichtbar */}
                            <div className="min-h-0 flex-1 overflow-hidden">
                              <div
                                className={`${nameClamp} font-bold leading-tight text-bone ${
                                  zoom === 'compact' ? 'text-[9px]' : 'text-[11px]'
                                }`}
                              >
                                {slot.band}
                              </div>
                              {z.showTimes && (
                                <div className="text-[9px] text-ash">
                                  {formatTime(slot.start)}–{formatTime(slot.end)}
                                </div>
                              )}
                            </div>
                            {attendees.length > 0 && (
                              <div className="flex shrink-0 items-center pb-0.5">
                                <AvatarStack
                                  users={attendees}
                                  size={z.avatar}
                                  max={z.maxAvatars}
                                />
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex h-full items-center gap-1 px-1.5">
                            <div className="min-w-0 flex-1">
                              <div
                                className={`font-bold leading-tight text-bone ${
                                  zoom === 'compact'
                                    ? 'line-clamp-2 text-[9px]'
                                    : 'line-clamp-1 text-[11px]'
                                }`}
                              >
                                {slot.band}
                              </div>
                              {z.showTimes && (
                                <div className="truncate text-[9px] text-ash">
                                  {formatTime(slot.start)}–{formatTime(slot.end)}
                                </div>
                              )}
                            </div>
                            {attendees.length > 0 && (
                              <div className="flex shrink-0 items-center">
                                <AvatarStack
                                  users={attendees}
                                  size={z.avatar}
                                  max={zoom === 'compact' ? 2 : z.maxAvatars}
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </button>
                    );
                  })}
              </div>
            ))}

            {/* Jetzt-Linie mit Uhrzeit-Badge */}
            {nowMin !== null && (
              <div
                className="now-line pointer-events-none absolute right-0 z-10 border-t-2 border-blood"
                style={{
                  top: (nowMin - startMin) * z.pxPerMin,
                  left: GUTTER_W,
                }}
              >
                <span className="absolute -top-2 left-1 rounded bg-blood px-1 py-px text-[9px] font-black leading-3 text-black">
                  {String(Math.floor(nowMin / 60) % 24).padStart(2, '0')}:
                  {String(Math.floor(nowMin % 60)).padStart(2, '0')}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Zoom-Umschalter: Übersicht <-> Detail */}
      <button
        onClick={toggleZoom}
        title={zoom === 'compact' ? 'Detail-Ansicht' : 'Kompakte Übersicht'}
        className="absolute bottom-3 right-3 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-rivet bg-steel/90 text-base shadow-lg backdrop-blur active:scale-95"
      >
        {zoom === 'compact' ? '🔍' : '🗓️'}
      </button>
    </div>
  );
}
