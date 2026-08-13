'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { computeLanesByStage } from '@/lib/timetableLayout';
import { formatTime, toMinutes, type FestivalDay, type Timetable } from '@/lib/types';

const GUTTER_W = 44;
const PX_PER_MIN = 1.0;
const COL_W = 116;
/** Update-Intervall des Embeds – Veranstalter-Änderungen kommen ohne Reload an */
const POLL_MS = 60_000;

/** Heutiges Datum (JJJJ-MM-TT) in der lokalen Zeit des Besuchers */
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

/** Läuft das Festival gerade/steht bevor, startet das Embed auf dem heutigen Tag */
function initialDayId(days: FestivalDay[]): string | null {
  if (days.length === 0) return null;
  const today = todayISO();
  return (days.find((d) => d.date === today) ?? days[0]).id;
}

/**
 * Öffentliches Website-Embed (/embed/[festivalId]): der Timetable des
 * Festivals als read-only Grid im Festival-Buddy-Look – Tag-Tabs, Bühnen
 * auf der X-Achse, Zeit auf der Y-Achse, Jetzt-Linie. Keine Gruppen, keine
 * Avatare, kein Login: Veranstalter binden das per iframe (public/embed.js)
 * auf ihrer eigenen Website ein.
 *
 * autoHeight (?height=auto): Die Seite wächst mit dem Inhalt und meldet ihre
 * Höhe per postMessage an die Eltern-Seite, damit der Loader das iframe ohne
 * inneres Scrollen passend zieht. Ohne autoHeight füllt das Embed das iframe
 * und scrollt selbst.
 */
export function EmbedTimetable({
  festivalId,
  initial,
  autoHeight,
}: {
  festivalId: string;
  initial: Timetable;
  autoHeight: boolean;
}) {
  const [timetable, setTimetable] = useState(initial);
  const [dayId, setDayId] = useState<string | null>(() => initialDayId(initial.days));
  const [nowMin, setNowMin] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrolledFor = useRef<string | null>(null);

  // Fällt der gewählte Tag nach einem Update weg, auf den ersten zurück
  const day =
    timetable.days.find((d) => d.id === dayId) ?? timetable.days[0] ?? null;

  const daySlots = useMemo(
    () => (day ? timetable.slots.filter((s) => s.dayId === day.id) : []),
    [timetable, day]
  );
  const slotLanes = useMemo(() => computeLanesByStage(daySlots), [daySlots]);

  const [startMin, endMin] = useMemo(() => {
    if (daySlots.length === 0) return [600, 1500];
    const starts = daySlots.map((s) => toMinutes(s.start));
    const ends = daySlots.map((s) => toMinutes(s.end));
    return [
      Math.floor(Math.min(...starts) / 60) * 60,
      Math.ceil(Math.max(...ends) / 60) * 60,
    ];
  }, [daySlots]);

  // Live-Updates: gepflegte Änderungen des Veranstalters ohne Seiten-Reload
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const res = await fetch(`/api/embed/${encodeURIComponent(festivalId)}`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const { timetable: next } = (await res.json()) as { timetable: Timetable };
        setTimetable((prev) =>
          JSON.stringify(prev) === JSON.stringify(next) ? prev : next
        );
      } catch {
        // Offline/Netzfehler: alter Stand bleibt stehen, nächster Tick probiert's neu
      }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [festivalId]);

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
    if (autoHeight || nowMin === null || !scrollRef.current || !day) return;
    if (autoScrolledFor.current === day.id) return;
    autoScrolledFor.current = day.id;
    const target = (nowMin - startMin) * PX_PER_MIN - scrollRef.current.clientHeight / 3;
    scrollRef.current.scrollTop = Math.max(0, target);
  }, [autoHeight, nowMin, day, startMin]);

  // Auto-Height: Inhaltshöhe an die einbettende Seite melden (public/embed.js).
  // Gemessen wird das Widget-Root (nicht der Body: dessen min-h-dvh würde ein
  // Schrumpfen verhindern). targetOrigin '*' ist ok – nur eine Pixelzahl.
  useEffect(() => {
    if (!autoHeight || typeof window === 'undefined' || window.parent === window) return;
    const el = rootRef.current;
    if (!el) return;
    const post = () =>
      window.parent.postMessage(
        {
          type: 'festival-buddy:height',
          festivalId,
          height: Math.ceil(el.getBoundingClientRect().height),
        },
        '*'
      );
    post();
    const ro = new ResizeObserver(post);
    ro.observe(el);
    return () => ro.disconnect();
  }, [autoHeight, festivalId]);

  const stages = timetable.stages;
  const minGridW = GUTTER_W + stages.length * COL_W;
  const hours: number[] = [];
  for (let m = startMin; m <= endMin; m += 60) hours.push(m);
  const bodyH = (endMin - startMin) * PX_PER_MIN;

  const appLink = `/app?festival=${encodeURIComponent(festivalId)}`;

  return (
    <div
      ref={rootRef}
      className={`bg-pit text-bone ${autoHeight ? 'flex flex-col' : 'flex h-dvh flex-col'}`}
    >
      {/* Kopf: Festival + Tag-Tabs */}
      <header className="steel-sheen shrink-0 px-3 pt-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="truncate font-metal text-sm uppercase tracking-wide text-bone">
            {timetable.festival}
            {timetable.edition && (
              <span className="ml-2 text-xs font-normal normal-case text-ash">
                {timetable.edition}
              </span>
            )}
          </h1>
          <a
            href={appLink}
            target="_blank"
            rel="noopener"
            className="shrink-0 rounded-md bg-blood px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-black"
          >
            Mit der Crew planen
          </a>
        </div>
        {timetable.days.length > 0 && (
          <div className="-mx-3 mt-2 flex gap-1.5 overflow-x-auto px-3 pb-2 scrollbar-thin">
            {timetable.days.map((d) => (
              <button
                key={d.id}
                onClick={() => setDayId(d.id)}
                className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-bold uppercase ${
                  day?.id === d.id
                    ? 'border-blood bg-blood/15 text-bone'
                    : 'border-rivet bg-steel text-ash'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* Grid */}
      {daySlots.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-6 py-16 text-center text-sm text-ash">
          Lineup folgt – schau bald wieder rein. 🤘
        </div>
      ) : (
        <div
          ref={scrollRef}
          className={
            autoHeight
              ? 'overflow-x-auto scrollbar-thin'
              : 'min-h-0 flex-1 overflow-auto scrollbar-thin'
          }
        >
          <div style={{ minWidth: minGridW }}>
            {/* Kopfzeile: Bühnennamen */}
            <div className="sticky top-0 z-30 flex steel-sheen">
              <div
                className="sticky left-0 z-40 shrink-0 steel-sheen"
                style={{ width: GUTTER_W }}
              />
              {stages.map((stage) => (
                <div
                  key={stage.id}
                  className="min-w-0 flex-1 border-l border-rivet px-1 py-2 text-center"
                >
                  <div
                    className="truncate font-metal text-[10px] font-black uppercase tracking-wider"
                    style={{ color: stage.color }}
                    title={stage.name}
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
                  style={{ top: (m - startMin) * PX_PER_MIN, left: GUTTER_W }}
                />
              ))}

              {/* Bühnen-Spalten mit Band-Slots */}
              {stages.map((stage) => (
                <div
                  key={stage.id}
                  className="relative min-w-0 flex-1 border-l border-rivet/60"
                >
                  {daySlots
                    .filter((s) => s.stageId === stage.id)
                    .map((slot) => {
                      const top = (toMinutes(slot.start) - startMin) * PX_PER_MIN;
                      const height = Math.max(
                        30,
                        (toMinutes(slot.end) - toMinutes(slot.start)) * PX_PER_MIN - 3
                      );
                      // Bei Überschneidungen teilen sich die Slots die Spaltenbreite
                      const { lane, lanes } = slotLanes.get(slot.id) ?? {
                        lane: 0,
                        lanes: 1,
                      };
                      return (
                        <div
                          key={slot.id}
                          className="absolute overflow-hidden rounded-md border border-rivet bg-steel-2"
                          style={{
                            top,
                            height,
                            left: `calc(${(lane / lanes) * 100}% + 2px)`,
                            width: `calc(${100 / lanes}% - 4px)`,
                            borderLeftWidth: 3,
                            borderLeftColor: stage.color,
                          }}
                        >
                          <div className="px-1.5 py-1">
                            <div className="line-clamp-2 text-[11px] font-bold leading-tight text-bone">
                              {slot.band}
                            </div>
                            <div className="text-[9px] text-ash">
                              {formatTime(slot.start)}–{formatTime(slot.end)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              ))}

              {/* Jetzt-Linie mit Uhrzeit-Badge */}
              {nowMin !== null && (
                <div
                  className="now-line pointer-events-none absolute right-0 z-10 border-t-2 border-blood"
                  style={{ top: (nowMin - startMin) * PX_PER_MIN, left: GUTTER_W }}
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
      )}

      {/* Fuß: Branding – so finden Besucher von der Festival-Website zur App */}
      <footer className="steel-sheen shrink-0 border-t border-rivet/40 px-3 py-1.5 text-right">
        <a
          href={appLink}
          target="_blank"
          rel="noopener"
          className="font-mono text-[9px] uppercase tracking-[0.2em] text-ash/70 hover:text-ash"
        >
          Powered by DEFƎKT Festival Buddy
        </a>
      </footer>
    </div>
  );
}
