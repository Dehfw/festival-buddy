'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Avatar } from '@/components/Avatars';
import { BlueprintEditor } from '@/components/BlueprintEditor';
import { AnnouncementComposer } from '@/components/organizer/AnnouncementComposer';
import {
  DaysEditor,
  SlotsEditor,
  StagesEditor,
  type EditorApi,
} from '@/components/organizer/TimetableEditor';
import {
  formatInviteCode,
  normalizeInviteCode,
  type Blueprint,
  type FestivalGroupStats,
  type FestivalSummary,
  type OrganizerInfo,
  type SlotSelectionCounts,
  type Timetable,
} from '@/lib/types';

interface OrganizerState {
  festivalId: string;
  timetable: Timetable;
  blueprints: Record<string, Blueprint>;
  selectionCounts: Record<string, SlotSelectionCounts>;
  groupStats: FestivalGroupStats;
  organizers: OrganizerInfo[];
  /** Eigene User-ID – markiert „(du)“ in der Team-Liste */
  meId: string;
  /** Sind VAPID-Keys gesetzt? Ohne Push kein Verschiebe-Dialog im Editor */
  pushConfigured: boolean;
}

type Tab = 'meta' | 'days' | 'stages' | 'slots' | 'map' | 'message';

const TABS: { id: Tab; label: string }[] = [
  { id: 'slots', label: 'Timetable' },
  { id: 'stages', label: 'Bühnen' },
  { id: 'days', label: 'Tage' },
  { id: 'map', label: 'Bühnenplan' },
  { id: 'message', label: 'Mitteilungen' },
  { id: 'meta', label: 'Festival' },
];

/**
 * Veranstalter-Bereich: Nutzer mit Veranstalter-Zuweisung (per Code aus
 * scripts/organizer-code.mjs) pflegen hier Timetable, Tage, Bühnen,
 * Bühnenpläne und Metadaten IHRES Festivals. Eigenständige Seite wie
 * früher das Admin-Panel – authentifiziert über die normale
 * Passkey-Session (Cookie fb_session), autorisiert pro Festival.
 */
function VeranstalterInner() {
  // null = Session wird geprüft, false = Login nötig, true = eingeloggt
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [festivals, setFestivals] = useState<FestivalSummary[]>([]);
  const [festivalId, setFestivalId] = useState<string | null>(null);
  const [state, setState] = useState<OrganizerState | null>(null);
  const [tab, setTab] = useState<Tab>('slots');
  const [stageId, setStageId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [redeemStatus, setRedeemStatus] = useState('');
  const [loadError, setLoadError] = useState('');

  const loadMe = useCallback(async (): Promise<FestivalSummary[] | null> => {
    try {
      const res = await fetch('/api/organizer/me', { cache: 'no-store' });
      if (res.status === 401) {
        setAuthed(false);
        return null;
      }
      if (!res.ok) return null;
      const { festivals: list } = (await res.json()) as { festivals: FestivalSummary[] };
      setAuthed(true);
      setFestivals(list);
      return list;
    } catch {
      setLoadError('Keine Verbindung – der Veranstalter-Bereich braucht Netz');
      return null;
    }
  }, []);

  const loadState = useCallback(async (festival: string) => {
    setLoadError('');
    try {
      const res = await fetch(
        `/api/organizer/state?festival=${encodeURIComponent(festival)}`,
        { cache: 'no-store' }
      );
      if (res.status === 401) {
        setAuthed(false);
        return;
      }
      if (!res.ok) {
        setLoadError('Festival konnte nicht geladen werden');
        return;
      }
      const next = (await res.json()) as OrganizerState;
      setState(next);
      setStageId((prev) =>
        prev && next.timetable.stages.some((s) => s.id === prev)
          ? prev
          : (next.timetable.stages[0]?.id ?? null)
      );
    } catch {
      setLoadError('Keine Verbindung – der Veranstalter-Bereich braucht Netz');
    }
  }, []);

  // Beim Öffnen: ?code=… aus dem Einlöse-Link vorbefüllen, dann Session prüfen
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('code');
    if (fromUrl) setCode(formatInviteCode(normalizeInviteCode(fromUrl)));
    void loadMe().then((list) => {
      if (list && list.length > 0) {
        setFestivalId(list[0].id);
        void loadState(list[0].id);
      }
    });
  }, [loadMe, loadState]);

  const switchFestival = (id: string) => {
    if (id === festivalId) return;
    setFestivalId(id);
    setState(null);
    setStageId(null);
    void loadState(id);
  };

  const redeem = async (e: React.FormEvent) => {
    e.preventDefault();
    setRedeemStatus('');
    try {
      const res = await fetch('/api/organizer/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      if (res.status === 429) {
        setRedeemStatus('Zu viele Versuche – bitte später erneut');
        return;
      }
      if (!res.ok) {
        setRedeemStatus('Code ungültig');
        return;
      }
      const { festival } = (await res.json()) as { festival: FestivalSummary };
      setCode('');
      const list = await loadMe();
      const target = list?.some((f) => f.id === festival.id) ? festival.id : list?.[0]?.id;
      if (target) {
        setFestivalId(target);
        void loadState(target);
      }
    } catch {
      setRedeemStatus('Keine Verbindung – bitte später erneut');
    }
  };

  const saveBlueprint = async (bp: Blueprint): Promise<boolean> => {
    if (!festivalId || !stageId) return false;
    try {
      const res = await fetch('/api/organizer/blueprint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ festivalId, stageId, blueprint: bp }),
      });
      if (res.status === 401) {
        setAuthed(false);
        return false;
      }
      if (!res.ok) return false;
      setState((prev) =>
        prev ? { ...prev, blueprints: { ...prev.blueprints, [stageId]: bp } } : prev
      );
      return true;
    } catch {
      return false;
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
        <h1 className="font-metal text-2xl font-black uppercase">Veranstalter</h1>
        <p className="mt-2 text-sm text-ash">
          Hier pflegen Veranstalter Timetable, Bühnen und Bühnenpläne ihres
          Festivals. Dafür brauchst du ein normales Konto – bitte zuerst in der
          App mit deinem Passkey anmelden und dann hierher zurückkommen.
        </p>
        <Link
          href="/app"
          className="mt-6 rounded-xl bg-blood px-4 py-3 text-center font-bold uppercase text-black"
        >
          Zur App & anmelden
        </Link>
        <Link
          href="/fuer-veranstalter"
          className="mt-4 text-center text-sm text-ash underline"
        >
          Was kann der Veranstalter-Bereich?
        </Link>
      </main>
    );
  }

  // Eingeloggt, aber (noch) kein Veranstalter: nur Code-Einlösung zeigen
  if (festivals.length === 0) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
        <h1 className="font-metal text-2xl font-black uppercase">Veranstalter</h1>
        <p className="mt-2 text-sm text-ash">
          Löse deinen Veranstalter-Code ein, um den Timetable, die Bühnen und
          die Bühnenpläne deines Festivals zu pflegen. Den Code bekommst du vom
          Festival-Buddy-Team –{' '}
          <Link href="/fuer-veranstalter" className="underline">
            hier steht, wie das läuft
          </Link>
          .
        </p>
        <form onSubmit={redeem} className="mt-6 space-y-3">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Code (XXXX-XXXX)"
            autoCapitalize="characters"
            autoCorrect="off"
            className="w-full rounded-xl border border-rivet bg-steel px-4 py-3 text-center font-mono text-lg tracking-widest text-bone outline-none focus:border-blood"
          />
          {redeemStatus && <p className="text-sm text-blood">{redeemStatus}</p>}
          <button
            type="submit"
            className="w-full rounded-xl bg-blood px-4 py-3 font-bold uppercase text-black"
          >
            Code einlösen
          </button>
        </form>
        <Link href="/app" className="mt-6 text-center text-sm text-ash underline">
          ← Zurück zur App
        </Link>
      </main>
    );
  }

  const editorApi: EditorApi | null =
    state && festivalId
      ? {
          festivalId,
          timetable: state.timetable,
          selectionCounts: state.selectionCounts,
          pushConfigured: state.pushConfigured,
          onTimetable: (t) =>
            setState((prev) => (prev ? { ...prev, timetable: t } : prev)),
        }
      : null;

  const stage = state?.timetable.stages.find((s) => s.id === stageId) ?? null;

  return (
    <main className="mx-auto max-w-lg px-4 pb-16 pt-[max(0.75rem,env(safe-area-inset-top))] md:max-w-3xl lg:max-w-5xl xl:max-w-6xl">
      <div className="flex items-center justify-between">
        <h1 className="font-metal text-xl font-black uppercase md:text-2xl">Veranstalter</h1>
        <Link href="/app" className="text-sm text-ash underline">
          ← App
        </Link>
      </div>

      {/* Festival-Umschalter (nur bei mehreren Festivals) */}
      {festivals.length > 1 && (
        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
          {festivals.map((f) => (
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
      )}
      {state && (
        <p className="mt-1 text-xs text-ash/70">
          {state.timetable.festival} · {state.timetable.dataVersion || 'noch keine Daten'}
        </p>
      )}
      {state && <GroupStatsLine stats={state.groupStats} />}

      {/* Weiteren Code einlösen (z. B. zweites Festival) */}
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-ash underline">
          Weiteren Veranstalter-Code einlösen
        </summary>
        <form onSubmit={redeem} className="mt-2 flex gap-2">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="XXXX-XXXX"
            autoCapitalize="characters"
            autoCorrect="off"
            className="flex-1 rounded-lg border border-rivet bg-steel px-3 py-2 font-mono text-sm text-bone outline-none focus:border-blood"
          />
          <button
            type="submit"
            className="rounded-lg bg-blood px-3 py-2 text-sm font-bold uppercase text-black"
          >
            Einlösen
          </button>
        </form>
        {redeemStatus && <p className="mt-1 text-sm text-blood">{redeemStatus}</p>}
      </details>

      {/* Bereichs-Tabs */}
      <div className="-mx-4 mt-3 flex gap-1.5 overflow-x-auto border-b border-rivet px-4 pb-2 scrollbar-thin md:mx-0 md:px-0">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold uppercase md:px-4 md:py-2 md:text-sm ${
              t.id === tab
                ? 'border-blood bg-blood/15 text-bone'
                : 'border-rivet bg-steel text-ash'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loadError && <p className="mt-3 text-sm text-blood">{loadError}</p>}
      {!state && !loadError && <p className="mt-6 text-center text-ash">Lade …</p>}

      {editorApi && (
        <>
          {tab === 'slots' && <SlotsEditor api={editorApi} />}
          {tab === 'days' && <DaysEditor api={editorApi} />}
          {tab === 'stages' && <StagesEditor api={editorApi} />}
          {tab === 'message' && festivalId && (
            <AnnouncementComposer festivalId={festivalId} />
          )}
          {tab === 'meta' && festivalId && (
            <>
              <MetaEditor
                festivalId={festivalId}
                timetable={editorApi.timetable}
                onTimetable={editorApi.onTimetable}
                onRenamed={() => void loadMe()}
              />
              <OrganizerTeam organizers={state!.organizers} meId={state!.meId} />
            </>
          )}
          {tab === 'map' &&
            (state!.timetable.stages.length === 0 ? (
              <p className="mt-4 rounded-xl border border-rivet bg-steel px-4 py-3 text-sm text-ash">
                Für den Bühnenplan brauchst du zuerst eine Bühne (Tab „Bühnen“).
              </p>
            ) : (
              // Desktop: Karte begrenzen, sonst wird das Quadrat riesig
              <div className="md:max-w-2xl">
                <div className="-mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 pb-1 scrollbar-thin md:mx-0 md:px-0">
                  {state!.timetable.stages.map((s) => (
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
                {stage && state!.blueprints[stage.id] && (
                  <BlueprintEditor
                    stage={stage}
                    blueprint={state!.blueprints[stage.id]}
                    onSave={saveBlueprint}
                  />
                )}
              </div>
            ))}
        </>
      )}
    </main>
  );
}

/**
 * Menge-Anzeige unter dem Kopf, auf jedem Tab sichtbar: Wie viele Leute
 * haben sich schon in Gruppen für dieses Festival organisiert? Nur anonyme
 * Summen – welche Gruppen das sind und wer drinsteckt, bleibt privat.
 */
function GroupStatsLine({ stats }: { stats: FestivalGroupStats }) {
  if (stats.groups === 0) {
    return (
      <p className="mt-0.5 text-xs text-ash/70">👥 Noch keine Gruppen zu diesem Festival</p>
    );
  }
  return (
    <p className="mt-0.5 text-xs text-ash/70">
      👥 <span className="font-bold text-bone">{stats.people.toLocaleString('de-DE')}</span>{' '}
      {stats.people === 1 ? 'Person' : 'Leute'} in{' '}
      <span className="font-bold text-bone">{stats.groups.toLocaleString('de-DE')}</span>{' '}
      {stats.groups === 1 ? 'Gruppe' : 'Gruppen'}
    </p>
  );
}

/**
 * Team-Liste im Tab „Festival“: Wer darf dieses Festival außer mir noch
 * pflegen? Nur lesend – Zugänge entstehen per Einladungscode, entziehen
 * kann sie nur der Betreiber (scripts/organizer-code.mjs).
 */
function OrganizerTeam({
  organizers,
  meId,
}: {
  organizers: OrganizerInfo[];
  meId: string;
}) {
  return (
    <section className="mt-8 md:max-w-xl">
      <div className="mb-2 flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.3em] text-ash/60">
        <span className="h-px flex-1 bg-rivet" />
        Veranstalter-Team
        <span className="h-px flex-1 bg-rivet" />
      </div>
      <ul className="space-y-2">
        {organizers.map((o) => (
          <li
            key={o.id}
            className="flex items-center gap-2.5 rounded-xl border border-rivet bg-steel px-3 py-2.5"
          >
            <Avatar
              user={{ id: o.id, name: o.name, color: o.color, createdAt: o.since }}
              size={28}
            />
            <span className="min-w-0 flex-1 truncate text-sm font-bold text-bone">
              {o.name}
              {o.id === meId && (
                <span className="ml-1.5 text-xs font-normal text-ash">(du)</span>
              )}
            </span>
            <span className="shrink-0 text-[10px] text-ash/70">
              seit {new Date(o.since).toLocaleDateString('de-DE')}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] leading-relaxed text-ash/70">
        Weitere Veranstalter kommen per Einladungscode dazu; Zugänge entziehen
        kann nur das Festival-Buddy-Team.
      </p>
    </section>
  );
}

function MetaEditor({
  festivalId,
  timetable,
  onTimetable,
  onRenamed,
}: {
  festivalId: string;
  timetable: Timetable;
  onTimetable: (t: Timetable) => void;
  onRenamed: () => void;
}) {
  const [name, setName] = useState(timetable.festival);
  const [edition, setEdition] = useState(timetable.edition);
  const [status, setStatus] = useState('');

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('Speichere …');
    try {
      const res = await fetch('/api/organizer/festival', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ festivalId, name, edition }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.timetable) {
        setStatus(data?.error ?? 'Fehler beim Speichern');
        return;
      }
      onTimetable(data.timetable as Timetable);
      onRenamed();
      setStatus('✓ Gespeichert');
    } catch {
      setStatus('Keine Verbindung');
    }
    setTimeout(() => setStatus(''), 2500);
  };

  return (
    <form onSubmit={save} className="mt-4 space-y-3 md:max-w-xl">
      <label className="block text-sm text-ash">
        Festival-Name
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          required
          className="mt-1 w-full rounded-lg border border-rivet bg-steel-2 px-3 py-2 text-sm text-bone outline-none focus:border-blood"
        />
      </label>
      <label className="block text-sm text-ash">
        Edition/Untertitel (z. B. „30.07.–01.08.2026 · Wacken“)
        <input
          type="text"
          value={edition}
          onChange={(e) => setEdition(e.target.value)}
          maxLength={120}
          className="mt-1 w-full rounded-lg border border-rivet bg-steel-2 px-3 py-2 text-sm text-bone outline-none focus:border-blood"
        />
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="rounded-xl bg-blood px-4 py-2.5 text-sm font-bold uppercase text-black"
        >
          Speichern
        </button>
        {status && <span className="text-xs text-ash">{status}</span>}
      </div>
    </form>
  );
}

export default function VeranstalterPage() {
  return <VeranstalterInner />;
}
