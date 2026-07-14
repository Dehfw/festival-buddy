'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppProvider, useApp } from '@/lib/client/store';
import { StageMap } from '@/components/StageMap';
import {
  POI_META,
  type Blueprint,
  type BlueprintElementType,
  type PoiType,
} from '@/lib/types';

const ADMIN_KEY_STORAGE = 'fb.adminKey.v1';
const ELEMENT_TYPES: BlueprintElementType[] = ['stage', 'foh', 'barrier', 'tent'];
const ELEMENT_LABELS: Record<BlueprintElementType, string> = {
  stage: 'Bühne',
  foh: 'FOH/Turm',
  barrier: 'Absperrung',
  tent: 'Zelt',
};

function AdminInner() {
  const { data, refresh } = useApp();
  const [adminKey, setAdminKey] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [stageId, setStageId] = useState('faster');
  const [draft, setDraft] = useState<Blueprint | null>(null);
  const [tool, setTool] = useState<PoiType | 'select' | null>('select');
  const [selectedPoi, setSelectedPoi] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  useEffect(() => {
    setAdminKey(sessionStorage.getItem(ADMIN_KEY_STORAGE));
  }, []);

  // Draft laden, wenn Bühne wechselt oder Daten ankommen
  const serverBlueprint = data?.blueprints[stageId];
  useEffect(() => {
    if (serverBlueprint) {
      setDraft(JSON.parse(JSON.stringify(serverBlueprint)) as Blueprint);
      setSelectedPoi(null);
    }
  }, [serverBlueprint, stageId]);

  const stage = useMemo(
    () => data?.timetable.stages.find((s) => s.id === stageId),
    [data, stageId]
  );

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        setLoginError('Falsches Passwort');
        return;
      }
      sessionStorage.setItem(ADMIN_KEY_STORAGE, password);
      setAdminKey(password);
    } catch {
      setLoginError('Keine Verbindung – Admin braucht Netz');
    }
  };

  const save = async () => {
    if (!draft || !adminKey) return;
    setStatus('Speichere …');
    try {
      const res = await fetch('/api/admin/blueprint', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey,
        },
        body: JSON.stringify({ stageId, blueprint: draft }),
      });
      if (res.status === 401) {
        sessionStorage.removeItem(ADMIN_KEY_STORAGE);
        setAdminKey(null);
        return;
      }
      setStatus(res.ok ? '✓ Gespeichert – für alle sichtbar' : 'Fehler beim Speichern');
      if (res.ok) void refresh();
    } catch {
      setStatus('Keine Verbindung – Admin braucht Netz');
    }
    setTimeout(() => setStatus(''), 2500);
  };

  const onMapTap = (x: number, y: number) => {
    if (!draft) return;
    if (tool && tool !== 'select') {
      // Neuen POI platzieren
      const poi = {
        id: `${stageId}-poi-${Date.now().toString(36)}`,
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

  if (adminKey === null) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
        <h1 className="font-metal text-2xl font-black uppercase">Admin</h1>
        <p className="mt-1 text-sm text-ash">
          Bühnen-Blueprints & Points of Interest verwalten
        </p>
        <form onSubmit={login} className="mt-6 space-y-3">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Admin-Passwort"
            className="w-full rounded-xl border border-rivet bg-steel px-4 py-3 text-bone outline-none focus:border-blood"
          />
          {loginError && <p className="text-sm text-blood">{loginError}</p>}
          <button
            type="submit"
            className="w-full rounded-xl bg-blood px-4 py-3 font-bold uppercase text-white"
          >
            Entsperren
          </button>
        </form>
        <Link href="/" className="mt-6 text-center text-sm text-ash underline">
          ← Zurück zur App
        </Link>
      </main>
    );
  }

  if (!data || !draft || !stage) {
    return (
      <main className="flex min-h-dvh items-center justify-center text-ash">
        Lade …
      </main>
    );
  }

  const selected = draft.pois.find((p) => p.id === selectedPoi);

  return (
    <main className="mx-auto max-w-lg px-4 pb-24 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <div className="flex items-center justify-between">
        <h1 className="font-metal text-xl font-black uppercase">
          Admin · Blueprints
        </h1>
        <Link href="/" className="text-sm text-ash underline">
          ← App
        </Link>
      </div>
      <p className="mt-0.5 text-xs text-ash/70">{data.timetable.dataVersion}</p>

      {/* Bühnen-Auswahl */}
      <div className="-mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 pb-1 scrollbar-thin">
        {data.timetable.stages.map((s) => (
          <button
            key={s.id}
            onClick={() => setStageId(s.id)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold uppercase ${
              s.id === stageId
                ? 'border-transparent text-black'
                : 'border-rivet bg-steel text-ash'
            }`}
            style={s.id === stageId ? { backgroundColor: s.color } : undefined}
          >
            {s.name}
          </button>
        ))}
      </div>

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
      <div className="fixed inset-x-0 bottom-0 border-t border-rivet bg-steel px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <button
            onClick={save}
            className="flex-1 rounded-xl bg-blood px-4 py-3 font-metal font-black uppercase text-white active:scale-[0.98]"
          >
            Speichern
          </button>
          {status && <span className="text-xs text-ash">{status}</span>}
        </div>
      </div>
    </main>
  );
}

export default function AdminPage() {
  return (
    <AppProvider>
      <AdminInner />
    </AppProvider>
  );
}
