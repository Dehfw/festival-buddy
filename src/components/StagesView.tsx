'use client';

import { useState } from 'react';
import { useApp } from '@/lib/client/store';
import { POI_META, type PoiType } from '@/lib/types';
import { StageMap } from './StageMap';

/** Bühnen-Blueprints mit allen Points of Interest (für alle sichtbar) */
export function StagesView() {
  const { data } = useApp();
  const [stageId, setStageId] = useState<string | null>(null);

  if (!data) return null;
  const stages = data.timetable.stages;
  const active = stageId ?? stages[0]?.id;
  const stage = stages.find((s) => s.id === active);
  const blueprint = stage ? data.blueprints[stage.id] : undefined;

  return (
    <div className="h-full overflow-y-auto px-4 pb-6 scrollbar-thin">
      <div className="mx-auto w-full max-w-md">
      <div className="-mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4 pb-2 scrollbar-thin">
        {stages.map((s) => (
          <button
            key={s.id}
            onClick={() => setStageId(s.id)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition ${
              s.id === active
                ? 'border-transparent text-black'
                : 'border-rivet bg-steel text-ash'
            }`}
            style={s.id === active ? { backgroundColor: s.color } : undefined}
          >
            {s.name}
          </button>
        ))}
      </div>

      {stage && blueprint && (
        <>
          <StageMap blueprint={blueprint} stageColor={stage.color} className="mt-2" />
          <div className="mt-4 grid grid-cols-2 gap-2">
            {(Object.keys(POI_META) as PoiType[]).map((type) => {
              const pois = blueprint.pois.filter((p) => p.type === type);
              if (pois.length === 0) return null;
              const meta = POI_META[type];
              return (
                <div
                  key={type}
                  className="rounded-xl border border-rivet bg-steel px-3 py-2.5"
                >
                  <div className="text-xs font-bold" style={{ color: meta.color }}>
                    {meta.icon} {meta.label}
                  </div>
                  <ul className="mt-1 space-y-0.5 text-[11px] text-ash">
                    {pois.map((p) => (
                      <li key={p.id}>{p.label}</li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </>
      )}
      </div>
    </div>
  );
}
