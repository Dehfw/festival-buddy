'use client';

import { useMemo, useState } from 'react';
import { useApp } from '@/lib/client/store';
import { formatTime, type Slot } from '@/lib/types';
import { Avatar } from './Avatars';
import { StageMap, type MapMarker } from './StageMap';

/**
 * Bottom-Sheet mit Band-Details: Wer kommt mit? Eintragen/Austragen,
 * und Position im Publikum auf dem Bühnen-Blueprint markieren.
 */
export function BandSheet({ slot, onClose }: { slot: Slot; onClose: () => void }) {
  const { data, user, toggleSelection, setPosition } = useApp();
  const [mapMode, setMapMode] = useState(false);

  const stage = data?.timetable.stages.find((s) => s.id === slot.stageId);
  const day = data?.timetable.days.find((d) => d.id === slot.dayId);
  const blueprint = data?.blueprints[slot.stageId];

  const attendees = useMemo(() => {
    if (!data) return [];
    const ids = new Set(
      data.selections.filter((s) => s.slotId === slot.id).map((s) => s.userId)
    );
    return data.users.filter((u) => ids.has(u.id));
  }, [data, slot.id]);

  const iAttend = !!user && attendees.some((a) => a.id === user.id);
  const myPosition = data?.positions.find(
    (p) => p.slotId === slot.id && p.userId === user?.id
  );

  const markers: MapMarker[] = useMemo(() => {
    if (!data) return [];
    const out: MapMarker[] = [];
    for (const p of data.positions) {
      if (p.slotId !== slot.id) continue;
      const u = data.users.find((x) => x.id === p.userId);
      if (u) out.push({ user: u, x: p.x, y: p.y, mine: u.id === user?.id });
    }
    return out;
  }, [data, slot.id, user?.id]);

  if (!data || !stage || !day) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        aria-label="Schließen"
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
      />
      <div className="relative max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border-t border-x border-rivet bg-steel px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 shadow-2xl">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-rivet" />

        <div className="mb-1 flex items-center gap-2">
          <span
            className="rounded px-2 py-0.5 text-xs font-black uppercase tracking-wider text-black"
            style={{ backgroundColor: stage.color }}
          >
            {stage.name}
          </span>
          <span className="text-xs text-ash">
            {day.longLabel} · {formatTime(slot.start)}–{formatTime(slot.end)} Uhr
          </span>
        </div>
        <h2 className="font-metal text-2xl font-black leading-tight">{slot.band}</h2>
        {!slot.confirmed && (
          <p className="mt-1 text-[11px] text-ash/70">
            Slot unbestätigt – Zeiten können sich ändern
          </p>
        )}

        {!mapMode && (
          <>
            <div className="mt-5">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-ash">
                Dabei ({attendees.length})
              </div>
              {attendees.length === 0 ? (
                <p className="text-sm text-ash/70">
                  Noch niemand eingetragen – sei die/der Erste! 🤘
                </p>
              ) : (
                <ul className="space-y-2">
                  {attendees.map((a) => {
                    const pos = data.positions.find(
                      (p) => p.slotId === slot.id && p.userId === a.id
                    );
                    return (
                      <li key={a.id} className="flex items-center gap-2.5 text-sm">
                        <Avatar user={a} size={26} />
                        <span className="font-medium">{a.name}</span>
                        {pos && (
                          <span className="text-xs text-ash">📍 Position markiert</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="mt-6 space-y-2.5">
              <button
                onClick={() => toggleSelection(slot.id, !iAttend)}
                className={`w-full rounded-xl px-4 py-3.5 font-metal text-base font-black uppercase tracking-wide transition active:scale-[0.98] ${
                  iAttend
                    ? 'border border-rivet bg-steel-2 text-ash'
                    : 'bg-blood text-white'
                }`}
              >
                {iAttend ? 'Doch nicht – austragen' : 'Ich bin dabei!'}
              </button>
              {iAttend && blueprint && (
                <button
                  onClick={() => setMapMode(true)}
                  className="w-full rounded-xl border border-rivet bg-steel-2 px-4 py-3.5 text-sm font-semibold text-bone transition active:scale-[0.98]"
                >
                  📍 {myPosition ? 'Meine Position ändern' : 'Meine Position im Publikum markieren'}
                </button>
              )}
            </div>
          </>
        )}

        {mapMode && blueprint && (
          <div className="mt-4">
            <p className="mb-2 text-sm text-ash">
              Tippe auf die Karte, um dein <b className="text-bone">X</b> zu setzen –
              deine Crew sieht, wo du stehst.
            </p>
            <StageMap
              blueprint={blueprint}
              stageColor={stage.color}
              markers={markers}
              onTap={(x, y) => setPosition(slot.id, x, y)}
            />
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => setMapMode(false)}
                className="flex-1 rounded-xl bg-blood px-4 py-3 text-sm font-bold text-white active:scale-[0.98]"
              >
                Fertig
              </button>
              {myPosition && (
                <button
                  onClick={() => setPosition(slot.id, null, null)}
                  className="flex-1 rounded-xl border border-rivet bg-steel-2 px-4 py-3 text-sm font-semibold text-ash active:scale-[0.98]"
                >
                  Markierung löschen
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
