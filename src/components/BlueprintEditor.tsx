'use client';

import { useEffect, useState } from 'react';
import { StageMap } from '@/components/StageMap';
import {
  POI_META,
  type Blueprint,
  type BlueprintElementType,
  type PoiType,
  type Stage,
} from '@/lib/types';

const ELEMENT_TYPES: BlueprintElementType[] = ['stage', 'foh', 'barrier', 'tent'];
const ELEMENT_LABELS: Record<BlueprintElementType, string> = {
  stage: 'Bühne',
  foh: 'FOH/Turm',
  barrier: 'Absperrung',
  tent: 'Zelt',
};

/**
 * Interaktiver Bühnenplan-Editor (Blueprint + POIs) – früher Teil des
 * Passwort-Admin-Panels, jetzt vom Veranstalter-Bereich genutzt. Hält
 * einen eigenen Draft; gespeichert wird über den onSave-Callback der
 * einbettenden Seite (die kennt Endpunkt und Festival-Scope).
 */
export function BlueprintEditor({
  stage,
  blueprint,
  onSave,
}: {
  stage: Stage;
  blueprint: Blueprint;
  /** Persistiert den Draft; true = gespeichert */
  onSave: (bp: Blueprint) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<Blueprint | null>(null);
  const [tool, setTool] = useState<PoiType | 'select'>('select');
  const [selectedPoi, setSelectedPoi] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  // Draft neu laden, wenn Bühne wechselt oder frische Serverdaten ankommen
  useEffect(() => {
    setDraft(JSON.parse(JSON.stringify(blueprint)) as Blueprint);
    setSelectedPoi(null);
    setTool('select');
  }, [blueprint, stage.id]);

  const save = async () => {
    if (!draft) return;
    setStatus('Speichere …');
    const ok = await onSave(draft);
    setStatus(ok ? '✓ Gespeichert – für alle sichtbar' : 'Fehler beim Speichern');
    setTimeout(() => setStatus(''), 2500);
  };

  const onMapTap = (x: number, y: number) => {
    if (!draft) return;
    if (tool !== 'select') {
      // Neuen POI platzieren
      const poi = {
        id: `${stage.id}-poi-${Date.now().toString(36)}`,
        type: tool,
        x: Math.round(x * 10) / 10,
        y: Math.round(y * 10) / 10,
        label: POI_META[tool].label,
      };
      setDraft({ ...draft, pois: [...draft.pois, poi] });
      setSelectedPoi(poi.id);
      setTool('select');
    } else if (selectedPoi) {
      // Ausgewählten POI verschieben
      setDraft({
        ...draft,
        pois: draft.pois.map((p) =>
          p.id === selectedPoi
            ? { ...p, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 }
            : p
        ),
      });
    }
  };

  if (!draft) return null;
  const selected = draft.pois.find((p) => p.id === selectedPoi);

  return (
    <div>
      {/* POI-Werkzeuge */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <button
          onClick={() => {
            setTool('select');
            setSelectedPoi(null);
          }}
          className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold ${
            tool === 'select' ? 'border-blood text-blood' : 'border-rivet text-ash'
          }`}
        >
          ✥ Auswählen/Verschieben
        </button>
        {(Object.keys(POI_META) as PoiType[]).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTool(t);
              setSelectedPoi(null);
            }}
            className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold ${
              tool === t ? 'border-blood text-bone' : 'border-rivet text-ash'
            }`}
          >
            {POI_META[t].icon} {POI_META[t].label}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-ash/70">
        {tool !== 'select'
          ? 'Auf die Karte tippen, um den POI zu platzieren.'
          : selectedPoi
            ? 'Auf die Karte tippen, um den ausgewählten POI dorthin zu verschieben.'
            : 'POI auf der Karte antippen, um ihn zu bearbeiten.'}
      </p>

      <StageMap
        blueprint={draft}
        stageColor={stage.color}
        onTap={onMapTap}
        onPoiTap={(id) => {
          setTool('select');
          setSelectedPoi(id);
        }}
        className="mt-2"
      />

      {/* POI-Detail */}
      {selected && (
        <div className="mt-3 rounded-xl border border-rivet bg-steel p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold">
              {POI_META[selected.type].icon} {POI_META[selected.type].label}
            </span>
            <button
              onClick={() => {
                setDraft({
                  ...draft,
                  pois: draft.pois.filter((p) => p.id !== selected.id),
                });
                setSelectedPoi(null);
              }}
              className="text-xs font-bold text-blood"
            >
              🗑 Löschen
            </button>
          </div>
          <input
            type="text"
            value={selected.label}
            maxLength={60}
            onChange={(e) =>
              setDraft({
                ...draft,
                pois: draft.pois.map((p) =>
                  p.id === selected.id ? { ...p, label: e.target.value } : p
                ),
              })
            }
            className="mt-2 w-full rounded-lg border border-rivet bg-steel-2 px-3 py-2 text-sm text-bone outline-none focus:border-blood"
            placeholder="Beschriftung"
          />
        </div>
      )}

      {/* Bühnen-Elemente */}
      <details className="mt-4 rounded-xl border border-rivet bg-steel p-3">
        <summary className="cursor-pointer text-sm font-bold text-ash">
          Bühnen-Elemente ({draft.elements.length})
        </summary>
        <div className="mt-2 space-y-2">
          {draft.elements.map((el, i) => (
            <div key={i} className="rounded-lg bg-steel-2 p-2 text-xs">
              <div className="flex items-center justify-between">
                <select
                  value={el.type}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      elements: draft.elements.map((x, j) =>
                        j === i
                          ? { ...x, type: e.target.value as BlueprintElementType }
                          : x
                      ),
                    })
                  }
                  className="rounded border border-rivet bg-steel px-1.5 py-1 text-bone"
                >
                  {ELEMENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {ELEMENT_LABELS[t]}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() =>
                    setDraft({
                      ...draft,
                      elements: draft.elements.filter((_, j) => j !== i),
                    })
                  }
                  className="font-bold text-blood"
                >
                  🗑
                </button>
              </div>
              <div className="mt-1.5 grid grid-cols-4 gap-1.5">
                {(['x', 'y', 'w', 'h'] as const).map((k) => (
                  <label key={k} className="flex items-center gap-1 text-ash">
                    {k.toUpperCase()}
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={el[k]}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          elements: draft.elements.map((x, j) =>
                            j === i ? { ...x, [k]: Number(e.target.value) } : x
                          ),
                        })
                      }
                      className="w-full rounded border border-rivet bg-steel px-1 py-0.5 text-bone"
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
          <button
            onClick={() =>
              setDraft({
                ...draft,
                elements: [
                  ...draft.elements,
                  { type: 'foh', x: 40, y: 40, w: 15, h: 8 },
                ],
              })
            }
            className="w-full rounded-lg border border-dashed border-rivet py-2 text-xs font-bold text-ash"
          >
            + Element hinzufügen
          </button>
          <label className="flex items-center gap-2 text-xs text-ash">
            Bühnen-Beschriftung
            <input
              type="text"
              value={draft.stageLabel}
              maxLength={30}
              onChange={(e) => setDraft({ ...draft, stageLabel: e.target.value })}
              className="flex-1 rounded border border-rivet bg-steel-2 px-2 py-1 text-bone"
            />
          </label>
        </div>
      </details>

      {/* Speichern */}
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={save}
          className="flex-1 rounded-xl bg-blood px-4 py-3 font-metal uppercase text-black active:scale-[0.98]"
        >
          Bühnenplan speichern
        </button>
        {status && <span className="text-xs text-ash">{status}</span>}
      </div>
    </div>
  );
}
