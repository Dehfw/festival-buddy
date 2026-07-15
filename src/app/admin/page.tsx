'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StageMap } from '@/components/StageMap';
import {
  POI_META,
  type Blueprint,
  type BlueprintElementType,
  type FestivalSummary,
  type PoiType,
  type Timetable,
} from '@/lib/types';

const ELEMENT_TYPES: BlueprintElementType[] = ['stage', 'foh', 'barrier', 'tent'];
const ELEMENT_LABELS: Record<BlueprintElementType, string> = {
  stage: 'Bühne',
  foh: 'FOH/Turm',
  barrier: 'Absperrung',
  tent: 'Zelt',
};

interface AdminState {
  festivals: FestivalSummary[];
  festivalId: string;
  timetable: Timetable;
  blueprints: Record<string, Blueprint>;
}

/**
 * Admin-Panel: Blueprints & POIs pro Festival pflegen. Globales
 * Betreiber-Tool (Passwort), hängt bewusst nicht an einer Gruppe –
 * eigene Datenquelle /api/admin/state statt /api/data.
 */
function AdminInner() {
<<<<<<< HEAD
  const [adminKey, setAdminKey] = useState<string | null>(null);
=======
  const { data, refresh } = useApp();
  // null = Session wird noch geprüft, false = Login nötig, true = eingeloggt.
  const [authed, setAuthed] = useState<boolean | null>(null);
>>>>>>> origin/main
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [state, setState] = useState<AdminState | null>(null);
  const [festivalId, setFestivalId] = useState<string | null>(null);
  const [stageId, setStageId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Blueprint | null>(null);
  const [tool, setTool] = useState<PoiType | 'select' | null>('select');
  const [selectedPoi, setSelectedPoi] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  // Auth-Status kommt vom Server (httpOnly-Cookie kann der Client nicht lesen).
  useEffect(() => {
    let alive = true;
    fetch('/api/admin/me')
      .then((res) => alive && setAuthed(res.ok))
      .catch(() => alive && setAuthed(false));
    return () => {
      alive = false;
    };
  }, []);

  // Admin-Datenstand fürs gewählte Festival laden
  const loadState = useCallback(
    async (key: string, festival?: string | null) => {
      try {
        const qs = festival ? `?festival=${encodeURIComponent(festival)}` : '';
        const res = await fetch(`/api/admin/state${qs}`, {
          headers: { 'x-admin-key': key },
          cache: 'no-store',
        });
        if (res.status === 401) {
          sessionStorage.removeItem(ADMIN_KEY_STORAGE);
          setAdminKey(null);
          return;
        }
        if (!res.ok) return;
        const next = (await res.json()) as AdminState;
        setState(next);
        setFestivalId(next.festivalId);
        setStageId((prev) =>
          prev && next.timetable.stages.some((s) => s.id === prev)
            ? prev
            : (next.timetable.stages[0]?.id ?? null)
        );
      } catch {
        setStatus('Keine Verbindung – Admin braucht Netz');
      }
    },
    []
  );

  useEffect(() => {
    if (adminKey) void loadState(adminKey, festivalId);
    // festivalId ist hier bewusst KEIN Dependency: Wechsel lädt explizit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminKey, loadState]);

  // Draft laden, wenn Bühne wechselt oder Daten ankommen
  const serverBlueprint = stageId ? state?.blueprints[stageId] : undefined;
  useEffect(() => {
    if (serverBlueprint) {
      setDraft(JSON.parse(JSON.stringify(serverBlueprint)) as Blueprint);
      setSelectedPoi(null);
    } else {
      setDraft(null);
    }
  }, [serverBlueprint, stageId]);

  const stage = useMemo(
    () => state?.timetable.stages.find((s) => s.id === stageId),
    [state, stageId]
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
      if (res.status === 429) {
        setLoginError('Zu viele Versuche – bitte später erneut');
        return;
      }
      if (!res.ok) {
        setLoginError('Falsches Passwort');
        return;
      }
      // Server hat das httpOnly-Session-Cookie gesetzt – kein Passwort im Browser.
      setPassword('');
      setAuthed(true);
    } catch {
      setLoginError('Keine Verbindung – Admin braucht Netz');
    }
  };

<<<<<<< HEAD
  const switchFestival = (id: string) => {
    if (!adminKey || id === festivalId) return;
    setStageId(null);
    setState(null);
    setFestivalId(id);
    void loadState(adminKey, id);
  };

  const save = async () => {
    if (!draft || !adminKey || !stageId || !festivalId) return;
=======
  const logout = async () => {
    try {
      await fetch('/api/admin/logout', { method: 'POST' });
    } catch {
      // Cookie ist httpOnly; ohne Netz bleibt die Session bis zum Ablauf.
    }
    setAuthed(false);
  };

  const save = async () => {
    if (!draft) return;
>>>>>>> origin/main
    setStatus('Speichere …');
    try {
      const res = await fetch('/api/admin/blueprint', {
        method: 'POST',
<<<<<<< HEAD
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey,
        },
        body: JSON.stringify({ festivalId, stageId, blueprint: draft }),
=======
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stageId, blueprint: draft }),
>>>>>>> origin/main
      });
      if (res.status === 401) {
        setStatus('');
        setAuthed(false);
        return;
      }
      setStatus(res.ok ? '✓ Gespeichert – für alle sichtbar' : 'Fehler beim Speichern');
      if (res.ok) void loadState(adminKey, festivalId);
    } catch {
      setStatus('Keine Verbindung – Admin braucht Netz');
    }
    setTimeout(() => setStatus(''), 2500);
  };

  const onMapTap = (x: number, y: number) => {
    if (!draft || !stageId) return;
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

  if (authed === null) {
    return (
      <main className="flex min-h-dvh items-center justify-center text-ash">
        Lade …
      </main>
    );
  }

  if (!authed) {
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
            className="w-full rounded-xl bg-blood px-4 py-3 font-bold uppercase text-black"
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

  if (!state) {
    return (
      <main className="flex min-h-dvh items-center justify-center text-ash">
        Lade …
      </main>
    );
  }

  const selected = draft?.pois.find((p) => p.id === selectedPoi);

  return (
    <main className="mx-auto max-w-lg px-4 pb-24 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <div className="flex items-center justify-between">
        <h1 className="font-metal text-xl font-black uppercase">
          Admin · Blueprints
        </h1>
        <div className="flex items-center gap-3">
          <button onClick={logout} className="text-sm text-ash underline">
            Abmelden
          </button>
          <Link href="/" className="text-sm text-ash underline">
            ← App
          </Link>
        </div>
      </div>

      {/* Festival-Umschalter */}
      <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
        {state.festivals.map((f) => (
          <button
            key={f.id}
            onClick={() => switchFestival(f.id)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold uppercase ${
              f.id === festivalId
                ? 'border-blood bg-blood/15 text-bone'
                : 'border-rivet bg-steel text-ash'
            }`}
          >
            {f.name}
          </button>
        ))}
      </div>
      <p className="mt-1 text-xs text-ash/70">
        {state.timetable.dataVersion || 'Noch kein Lineup importiert'}
      </p>

      {state.timetable.stages.length === 0 ? (
        <p className="mt-6 rounded-xl border border-rivet bg-steel px-4 py-4 text-sm text-ash">
          Für dieses Festival gibt es noch keine Bühnen – erst das Lineup
          importieren (scripts/import-festival.mjs), dann lassen sich hier
          Blueprints pflegen.
        </p>
      ) : (
        <>
          {/* Bühnen-Auswahl */}
          <div className="-mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 pb-1 scrollbar-thin">
            {state.timetable.stages.map((s) => (
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

          {draft && stage && (
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
          )}

          {/* POI-Detail */}
          {draft && selected && (
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
          {draft && (
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
          )}

          {/* Speichern */}
          <div className="fixed inset-x-0 bottom-0 border-t border-rivet bg-steel px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
            <div className="mx-auto flex max-w-lg items-center gap-3">
              <button
                onClick={save}
                className="flex-1 rounded-xl bg-blood px-4 py-3 font-metal uppercase text-black active:scale-[0.98]"
              >
                Speichern
              </button>
              {status && <span className="text-xs text-ash">{status}</span>}
            </div>
          </div>
        </>
      )}
    </main>
  );
}

export default function AdminPage() {
  return <AdminInner />;
}
