'use client';

import { useMemo, useState } from 'react';
import {
  formatTime,
  isValidTime,
  toMinutes,
  type FestivalDay,
  type Slot,
  type SlotSelectionCounts,
  type Stage,
  type Timetable,
} from '@/lib/types';

/**
 * Formular-basierte Editoren für Tage, Bühnen und Slots im
 * Veranstalter-Bereich. Jede Mutation geht an /api/organizer/* und
 * liefert den frischen Timetable zurück (kein Refetch nötig).
 *
 * Löschen läuft IMMER über einen Bestätigungs-Dialog – und der warnt
 * ausdrücklich, wenn an den betroffenen Slots bereits Besucher-Einträge
 * (Zusagen/Interessen samt Positionsmarkern) hängen, denn die werden
 * unwiderruflich mit gelöscht.
 *
 * Auch das Verschieben eines Slots (Zeit/Tag/Bühne) mit Besucher-Einträgen
 * bestätigt der Veranstalter vorher: Der Dialog nennt, wie viele
 * Eingetragene die automatische Push-Mitteilung zur Änderung bekommen, und
 * nach dem Speichern meldet der Editor das Versand-Ergebnis zurück.
 */

export interface EditorApi {
  festivalId: string;
  timetable: Timetable;
  /** Zusagen/Interessen pro Slot-ID, getrennt (über alle Gruppen des Festivals) */
  selectionCounts: Record<string, SlotSelectionCounts>;
  /**
   * Sind serverseitig VAPID-Keys gesetzt? Ohne Push entfällt der
   * Verschiebe-Dialog – er würde eine Benachrichtigung versprechen, die
   * das Deployment gar nicht senden kann.
   */
  pushConfigured: boolean;
  onTimetable: (t: Timetable) => void;
}

/** Summe für die Lösch-Warnungen – da zählt jeder Eintrag, egal welcher Status */
function totalSelections(counts: SlotSelectionCounts | undefined): number {
  return counts ? counts.going + counts.interested : 0;
}

type ApiResult =
  | {
      ok: true;
      timetable: Timetable;
      id?: string;
      /** Verschobener Slot: so viele Personen sind dort eingetragen */
      audience?: number;
      /** … und so viele davon hat der Push wirklich erreicht (mind. 1 Gerät) */
      notified?: number;
      /** Versand-Ergebnis auf Geräte-Ebene (siehe /api/organizer/slot) */
      push?: { sent: number; gone: number; failed: number };
    }
  | { ok: false; error: string };

async function callApi(path: string, method: string, body: unknown): Promise<ApiResult> {
  try {
    const res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.timetable) {
      return { ok: false, error: data?.error ?? 'Fehler beim Speichern' };
    }
    return {
      ok: true,
      timetable: data.timetable as Timetable,
      id: data.id,
      audience: typeof data.audience === 'number' ? data.audience : undefined,
      notified: typeof data.notified === 'number' ? data.notified : undefined,
      push: data.push,
    };
  } catch {
    return { ok: false, error: 'Keine Verbindung – der Editor braucht Netz' };
  }
}

/* ------------------------------------------------------------------ */
/* Bestätigungs-Dialog                                                 */
/* ------------------------------------------------------------------ */

export interface ConfirmRequest {
  title: string;
  message: string;
  /** Besucher-Einträge, die mit gelöscht würden – > 0 gibt eine deutliche Warnung */
  affectedSelections: number;
  /** Hinweis ohne Lösch-Drama (z. B. "X Eingetragene bekommen einen Push") */
  notice?: string;
  confirmLabel: string;
  onConfirm: () => void;
}

function ConfirmDialog({
  req,
  onClose,
}: {
  req: ConfirmRequest;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-rivet bg-steel p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-metal text-lg font-black uppercase">{req.title}</h3>
        <p className="mt-2 text-sm text-ash">{req.message}</p>
        {req.affectedSelections > 0 && (
          <p className="mt-3 rounded-xl border border-blood/60 bg-blood/10 px-3 py-2 text-sm font-bold text-blood">
            ⚠️ Daran hängen bereits {req.affectedSelections}{' '}
            {req.affectedSelections === 1 ? 'Eintrag' : 'Einträge'} von Besuchern
            (Zusagen/Interessen samt Treffpunkt-Markern) – die werden
            unwiderruflich mit gelöscht!
          </p>
        )}
        {req.notice && (
          <p className="mt-3 rounded-xl border border-ember/60 bg-ember/10 px-3 py-2 text-sm font-bold text-ember">
            {req.notice}
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-rivet px-4 py-2.5 text-sm font-bold text-ash"
          >
            Abbrechen
          </button>
          <button
            onClick={() => {
              req.onConfirm();
              onClose();
            }}
            className="flex-1 rounded-xl bg-blood px-4 py-2.5 text-sm font-bold uppercase text-black"
          >
            {req.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputClass =
  'w-full rounded-lg border border-rivet bg-steel-2 px-3 py-2 text-sm text-bone outline-none focus:border-blood';

/* ------------------------------------------------------------------ */
/* Tage                                                                */
/* ------------------------------------------------------------------ */

function DayForm({
  initial,
  onSubmit,
  onCancel,
  busy,
}: {
  initial?: FestivalDay;
  onSubmit: (input: { id?: string; label: string; longLabel: string; date: string }) => void;
  onCancel?: () => void;
  busy: boolean;
}) {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [longLabel, setLongLabel] = useState(initial?.longLabel ?? '');
  const [date, setDate] = useState(initial?.date ?? '');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ ...(initial ? { id: initial.id } : {}), label, longLabel, date });
      }}
      className="mt-2 grid grid-cols-2 gap-2"
    >
      <input
        type="text"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Kurz (z. B. Fr)"
        maxLength={8}
        required
        className={inputClass}
      />
      <input
        type="text"
        value={longLabel}
        onChange={(e) => setLongLabel(e.target.value)}
        placeholder="Lang (z. B. Freitag)"
        maxLength={20}
        required
        className={inputClass}
      />
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        required
        className={inputClass}
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="flex-1 rounded-lg bg-blood px-3 py-2 text-sm font-bold uppercase text-black disabled:opacity-50"
        >
          Speichern
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-rivet px-3 py-2 text-sm font-bold text-ash"
          >
            ✕
          </button>
        )}
      </div>
    </form>
  );
}

export function DaysEditor({ api }: { api: EditorApi }) {
  const { festivalId, timetable, selectionCounts, onTimetable } = api;
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);

  const save = async (input: { id?: string; label: string; longLabel: string; date: string }) => {
    setBusy(true);
    setError('');
    const result = await callApi('/api/organizer/day', 'PUT', { festivalId, day: input });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onTimetable(result.timetable);
    setEditing(null);
    setAdding(false);
  };

  const requestDelete = (day: FestivalDay) => {
    const slots = timetable.slots.filter((s) => s.dayId === day.id);
    const selections = slots.reduce((sum, s) => sum + totalSelections(selectionCounts[s.id]), 0);
    setConfirm({
      title: 'Tag löschen?',
      message:
        `${day.longLabel} (${day.date}) wird entfernt` +
        (slots.length > 0
          ? ` – inklusive ${slots.length} ${slots.length === 1 ? 'Slot' : 'Slots'} an diesem Tag.`
          : '.'),
      affectedSelections: selections,
      confirmLabel: 'Löschen',
      onConfirm: () => {
        void (async () => {
          setBusy(true);
          setError('');
          const result = await callApi('/api/organizer/day', 'DELETE', {
            festivalId,
            dayId: day.id,
          });
          setBusy(false);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          onTimetable(result.timetable);
        })();
      },
    });
  };

  return (
    <section className="mt-4">
      {timetable.days.length === 0 && (
        <p className="rounded-xl border border-rivet bg-steel px-4 py-3 text-sm text-ash">
          Noch keine Festivaltage – lege den ersten Tag an, danach kannst du
          Slots im Timetable planen.
        </p>
      )}
      <ul className="space-y-2 md:grid md:grid-cols-2 md:items-start md:gap-2 md:space-y-0">
        {timetable.days.map((day) => {
          const slotCount = timetable.slots.filter((s) => s.dayId === day.id).length;
          return (
            <li key={day.id} className="rounded-xl border border-rivet bg-steel p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="font-bold text-bone">{day.longLabel}</span>{' '}
                  <span className="text-sm text-ash">
                    ({day.label}) · {day.date} · {slotCount}{' '}
                    {slotCount === 1 ? 'Slot' : 'Slots'}
                  </span>
                </div>
                <div className="flex shrink-0 gap-2 text-xs font-bold">
                  <button
                    onClick={() => {
                      setAdding(false);
                      setEditing(editing === day.id ? null : day.id);
                    }}
                    className="text-ash underline"
                  >
                    {editing === day.id ? 'Zuklappen' : 'Bearbeiten'}
                  </button>
                  <button onClick={() => requestDelete(day)} className="text-blood">
                    🗑 Löschen
                  </button>
                </div>
              </div>
              {editing === day.id && (
                <DayForm
                  initial={day}
                  onSubmit={save}
                  onCancel={() => setEditing(null)}
                  busy={busy}
                />
              )}
            </li>
          );
        })}
      </ul>
      {adding ? (
        <div className="mt-2 rounded-xl border border-rivet bg-steel p-3 md:max-w-xl">
          <DayForm onSubmit={save} onCancel={() => setAdding(false)} busy={busy} />
        </div>
      ) : (
        <button
          onClick={() => {
            setEditing(null);
            setAdding(true);
          }}
          className="mt-2 w-full rounded-xl border border-dashed border-rivet py-2.5 text-sm font-bold text-ash"
        >
          + Tag hinzufügen
        </button>
      )}
      {error && <p className="mt-2 text-sm text-blood">{error}</p>}
      {confirm && <ConfirmDialog req={confirm} onClose={() => setConfirm(null)} />}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Bühnen                                                              */
/* ------------------------------------------------------------------ */

function StageForm({
  initial,
  onSubmit,
  onCancel,
  busy,
}: {
  initial?: Stage;
  onSubmit: (input: { id?: string; name: string; short: string; color: string }) => void;
  onCancel?: () => void;
  busy: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [short, setShort] = useState(initial?.short ?? '');
  const [color, setColor] = useState(initial?.color ?? '#ff5a17');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ ...(initial ? { id: initial.id } : {}), name, short, color });
      }}
      className="mt-2 grid grid-cols-2 gap-2"
    >
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name (z. B. Faster)"
        maxLength={40}
        required
        className={`${inputClass} col-span-2`}
      />
      <input
        type="text"
        value={short}
        onChange={(e) => setShort(e.target.value.toUpperCase())}
        placeholder="Kürzel (z. B. FSTR)"
        maxLength={5}
        required
        className={inputClass}
      />
      <label className="flex items-center gap-2 text-sm text-ash">
        Farbe
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="h-9 w-full rounded-lg border border-rivet bg-steel-2"
        />
      </label>
      <div className="col-span-2 flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="flex-1 rounded-lg bg-blood px-3 py-2 text-sm font-bold uppercase text-black disabled:opacity-50"
        >
          Speichern
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-rivet px-3 py-2 text-sm font-bold text-ash"
          >
            ✕
          </button>
        )}
      </div>
    </form>
  );
}

export function StagesEditor({ api }: { api: EditorApi }) {
  const { festivalId, timetable, selectionCounts, onTimetable } = api;
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);

  const save = async (input: { id?: string; name: string; short: string; color: string }) => {
    setBusy(true);
    setError('');
    const result = await callApi('/api/organizer/stage', 'PUT', { festivalId, stage: input });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onTimetable(result.timetable);
    setEditing(null);
    setAdding(false);
  };

  const requestDelete = (stage: Stage) => {
    const slots = timetable.slots.filter((s) => s.stageId === stage.id);
    const selections = slots.reduce((sum, s) => sum + totalSelections(selectionCounts[s.id]), 0);
    setConfirm({
      title: 'Bühne löschen?',
      message:
        `"${stage.name}" wird entfernt – inklusive Bühnenplan` +
        (slots.length > 0
          ? ` und ${slots.length} ${slots.length === 1 ? 'Slot' : 'Slots'} auf dieser Bühne.`
          : '.'),
      affectedSelections: selections,
      confirmLabel: 'Löschen',
      onConfirm: () => {
        void (async () => {
          setBusy(true);
          setError('');
          const result = await callApi('/api/organizer/stage', 'DELETE', {
            festivalId,
            stageId: stage.id,
          });
          setBusy(false);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          onTimetable(result.timetable);
        })();
      },
    });
  };

  return (
    <section className="mt-4">
      {timetable.stages.length === 0 && (
        <p className="rounded-xl border border-rivet bg-steel px-4 py-3 text-sm text-ash">
          Noch keine Bühnen – lege die erste Bühne an, danach kannst du Slots
          planen und den Bühnenplan bearbeiten.
        </p>
      )}
      <ul className="space-y-2 md:grid md:grid-cols-2 md:items-start md:gap-2 md:space-y-0">
        {timetable.stages.map((stage) => {
          const slotCount = timetable.slots.filter((s) => s.stageId === stage.id).length;
          return (
            <li key={stage.id} className="rounded-xl border border-rivet bg-steel p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: stage.color }}
                  />
                  <span className="truncate font-bold text-bone">{stage.name}</span>
                  <span className="shrink-0 text-sm text-ash">
                    ({stage.short}) · {slotCount} {slotCount === 1 ? 'Slot' : 'Slots'}
                  </span>
                </div>
                <div className="flex shrink-0 gap-2 text-xs font-bold">
                  <button
                    onClick={() => {
                      setAdding(false);
                      setEditing(editing === stage.id ? null : stage.id);
                    }}
                    className="text-ash underline"
                  >
                    {editing === stage.id ? 'Zuklappen' : 'Bearbeiten'}
                  </button>
                  <button onClick={() => requestDelete(stage)} className="text-blood">
                    🗑 Löschen
                  </button>
                </div>
              </div>
              {editing === stage.id && (
                <StageForm
                  initial={stage}
                  onSubmit={save}
                  onCancel={() => setEditing(null)}
                  busy={busy}
                />
              )}
            </li>
          );
        })}
      </ul>
      {adding ? (
        <div className="mt-2 rounded-xl border border-rivet bg-steel p-3 md:max-w-xl">
          <StageForm onSubmit={save} onCancel={() => setAdding(false)} busy={busy} />
        </div>
      ) : (
        <button
          onClick={() => {
            setEditing(null);
            setAdding(true);
          }}
          className="mt-2 w-full rounded-xl border border-dashed border-rivet py-2.5 text-sm font-bold text-ash"
        >
          + Bühne hinzufügen
        </button>
      )}
      {error && <p className="mt-2 text-sm text-blood">{error}</p>}
      {confirm && <ConfirmDialog req={confirm} onClose={() => setConfirm(null)} />}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Slots (Timetable)                                                   */
/* ------------------------------------------------------------------ */

interface SlotDraft {
  id?: string;
  dayId: string;
  stageId: string;
  band: string;
  start: string;
  end: string;
  confirmed: boolean;
  spotifyArtistId: string;
}

function SlotForm({
  draft,
  timetable,
  onChange,
  onSubmit,
  onCancel,
  busy,
}: {
  draft: SlotDraft;
  timetable: Timetable;
  onChange: (d: SlotDraft) => void;
  onSubmit: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  // Nicht blockierende Überschneidungs-Warnung (gleiche Bühne, gleicher Tag)
  const overlap = useMemo(() => {
    if (!/^\d{1,2}:\d{2}$/.test(draft.start) || !/^\d{1,2}:\d{2}$/.test(draft.end)) {
      return null;
    }
    const start = toMinutes(draft.start);
    const end = toMinutes(draft.end);
    return (
      timetable.slots.find(
        (s) =>
          s.id !== draft.id &&
          s.dayId === draft.dayId &&
          s.stageId === draft.stageId &&
          toMinutes(s.start) < end &&
          toMinutes(s.end) > start
      ) ?? null
    );
  }, [draft, timetable.slots]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="mt-2 space-y-2"
    >
      <input
        type="text"
        value={draft.band}
        onChange={(e) => onChange({ ...draft, band: e.target.value })}
        placeholder="Band"
        maxLength={80}
        required
        className={inputClass}
      />
      <div className="grid grid-cols-2 gap-2">
        <select
          value={draft.dayId}
          onChange={(e) => onChange({ ...draft, dayId: e.target.value })}
          className={inputClass}
        >
          {timetable.days.map((d) => (
            <option key={d.id} value={d.id}>
              {d.longLabel}
            </option>
          ))}
        </select>
        <select
          value={draft.stageId}
          onChange={(e) => onChange({ ...draft, stageId: e.target.value })}
          className={inputClass}
        >
          {timetable.stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <input
          type="text"
          inputMode="numeric"
          value={draft.start}
          onChange={(e) => onChange({ ...draft, start: e.target.value })}
          placeholder="Beginn (17:30)"
          pattern="\d{1,2}:\d{2}"
          required
          className={inputClass}
        />
        <input
          type="text"
          inputMode="numeric"
          value={draft.end}
          onChange={(e) => onChange({ ...draft, end: e.target.value })}
          placeholder="Ende (18:30)"
          pattern="\d{1,2}:\d{2}"
          required
          className={inputClass}
        />
      </div>
      <p className="text-[11px] text-ash/70">
        Sets nach Mitternacht mit Stunden ≥ 24 eintragen (z. B. 25:30 = 01:30
        am Folgetag).
      </p>
      {overlap && (
        <p className="rounded-lg border border-ember/60 bg-ember/10 px-3 py-2 text-xs font-bold text-ember">
          ⚠ Überschneidet sich auf dieser Bühne mit „{overlap.band}“ (
          {formatTime(overlap.start)}–{formatTime(overlap.end)}) – speichern
          geht trotzdem.
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label className="flex items-center gap-2 text-sm text-ash">
          <input
            type="checkbox"
            checked={draft.confirmed}
            onChange={(e) => onChange({ ...draft, confirmed: e.target.checked })}
          />
          Bestätigt
        </label>
        <input
          type="text"
          value={draft.spotifyArtistId}
          onChange={(e) => onChange({ ...draft, spotifyArtistId: e.target.value })}
          placeholder="Spotify-Artist-ID (optional)"
          maxLength={40}
          className={inputClass}
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="flex-1 rounded-lg bg-blood px-3 py-2 text-sm font-bold uppercase text-black disabled:opacity-50"
        >
          Speichern
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-rivet px-3 py-2 text-sm font-bold text-ash"
        >
          ✕
        </button>
      </div>
    </form>
  );
}

export function SlotsEditor({ api }: { api: EditorApi }) {
  const { festivalId, timetable, selectionCounts, pushConfigured, onTimetable } = api;
  const [dayId, setDayId] = useState(timetable.days[0]?.id ?? '');
  const [draft, setDraft] = useState<SlotDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);

  const activeDayId = timetable.days.some((d) => d.id === dayId)
    ? dayId
    : (timetable.days[0]?.id ?? '');

  if (timetable.days.length === 0 || timetable.stages.length === 0) {
    return (
      <p className="mt-4 rounded-xl border border-rivet bg-steel px-4 py-3 text-sm text-ash">
        Slots brauchen mindestens einen Festivaltag und eine Bühne – beides
        legst du in den Tabs „Tage“ und „Bühnen“ an.
      </p>
    );
  }

  const startEdit = (slot: Slot) => {
    setError('');
    setInfo('');
    setDraft({
      id: slot.id,
      dayId: slot.dayId,
      stageId: slot.stageId,
      band: slot.band,
      start: slot.start,
      end: slot.end,
      confirmed: slot.confirmed,
      spotifyArtistId: slot.spotifyArtistId ?? '',
    });
  };

  const startNew = () => {
    setError('');
    setInfo('');
    setDraft({
      dayId: activeDayId,
      stageId: timetable.stages[0].id,
      band: '',
      start: '',
      end: '',
      confirmed: true,
      spotifyArtistId: '',
    });
  };

  const doSave = async () => {
    if (!draft) return;
    setBusy(true);
    setError('');
    setInfo('');
    const result = await callApi('/api/organizer/slot', 'PUT', {
      festivalId,
      slot: {
        ...(draft.id ? { id: draft.id } : {}),
        dayId: draft.dayId,
        stageId: draft.stageId,
        band: draft.band,
        start: draft.start,
        end: draft.end,
        confirmed: draft.confirmed,
        ...(draft.spotifyArtistId.trim()
          ? { spotifyArtistId: draft.spotifyArtistId.trim() }
          : {}),
      },
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (result.audience !== undefined) {
      // Ehrliche Zählung: `audience` = Eingetragene gesamt, `notified` = wer
      // davon wirklich mindestens ein Gerät per Push erreicht hat. `failed`
      // unterscheidet "kein Push aktiv" von "Versand fehlgeschlagen" – ohne
      // Fehler heißt "0 erreicht" wirklich: keine aktiven Abos.
      const audience = result.audience;
      const reached = result.notified ?? 0;
      const devices = result.push?.sent ?? 0;
      const failed = result.push?.failed ?? 0;
      if (audience === 0) {
        setInfo('Änderung gespeichert – niemand war hier eingetragen, kein Push nötig.');
      } else if (reached === 0) {
        setInfo(
          failed > 0
            ? `⚠️ Änderung gespeichert, aber der Push-Versand schlug fehl (${failed} ${
                failed === 1 ? 'Zustellung' : 'Zustellungen'
              }); die Eingetragenen sehen die neue Zeit nur in der App.`
            : `Änderung gespeichert – von ${audience} Eingetragenen hat niemand Push aktiv; sie sehen die neue Zeit nur in der App.`
        );
      } else if (reached === audience) {
        setInfo(
          `🔔 Push zur Änderung ist raus an ${
            audience === 1 ? 'die eine eingetragene Person' : `alle ${audience} Eingetragenen`
          } (${devices} ${devices === 1 ? 'Gerät' : 'Geräte'} erreicht).${
            failed > 0
              ? ` ⚠️ ${failed} ${
                  failed === 1 ? 'Geräte-Zustellung schlug' : 'Geräte-Zustellungen schlugen'
                } trotzdem fehl.`
              : ''
          }`
        );
      } else {
        setInfo(
          failed > 0
            ? `🔔 Push ist raus an ${reached} von ${audience} Eingetragenen – beim Rest ist kein Push aktiv oder die Zustellung schlug fehl (${failed}×); sie sehen die Änderung nur in der App.`
            : `🔔 Push ist raus an ${reached} von ${audience} Eingetragenen – der Rest hat kein Push aktiv und sieht die Änderung nur in der App.`
        );
      }
    }
    onTimetable(result.timetable);
    setDraft(null);
  };

  /** Beschreibung "Fr 17:30–18:30 · FSTR" für den Verschiebe-Dialog */
  const describe = (slot: { dayId: string; start: string; end: string; stageId: string }) => {
    const day = timetable.days.find((d) => d.id === slot.dayId);
    const stage = timetable.stages.find((s) => s.id === slot.stageId);
    return [day?.label, `${formatTime(slot.start)}–${formatTime(slot.end)}`, stage?.short]
      .filter(Boolean)
      .join(' · ');
  };

  const save = async () => {
    if (!draft) return;
    // Verschiebt der Edit den Slot (Zeit/Tag/Bühne) und sind schon Besucher
    // eingetragen? Dann erst bestätigen lassen – der Server pusht die
    // Änderung danach automatisch an alle Eingetragenen.
    const original = draft.id ? timetable.slots.find((s) => s.id === draft.id) : undefined;
    const affected = draft.id ? totalSelections(selectionCounts[draft.id]) : 0;
    const start = draft.start.trim();
    const end = draft.end.trim();
    // Ungültige Zeiten (z. B. 99:99 – das HTML-Pattern lässt sie durch)
    // gar nicht erst bestätigen lassen: describe() würde Unsinn anzeigen
    // und der Server lehnt den Save gleich mit einer klaren Meldung ab.
    // Zeiten über Minuten vergleichen – "9:30" und "09:30" sind gleich.
    const moved =
      original &&
      isValidTime(start) &&
      isValidTime(end) &&
      (toMinutes(original.start) !== toMinutes(start) ||
        toMinutes(original.end) !== toMinutes(end) ||
        original.dayId !== draft.dayId ||
        original.stageId !== draft.stageId);
    // Ohne konfiguriertes Push (VAPID) gäbe der Dialog ein Versprechen ab,
    // das der Server nicht einlösen kann – dann einfach speichern.
    if (!moved || affected === 0 || !pushConfigured) {
      await doSave();
      return;
    }
    setConfirm({
      title: 'Slot verschieben?',
      message: `"${original.band}" wandert von ${describe(original)} auf ${describe(draft)}.`,
      affectedSelections: 0,
      notice: `🔔 ${
        affected === 1
          ? 'Die eine hier eingetragene Person wird'
          : `Die ${affected} hier eingetragenen Personen werden`
      } automatisch per Push informiert – erreicht wird dabei nur, wer Mitteilungen aktiviert hat.`,
      confirmLabel: 'Speichern & Senden',
      onConfirm: () => {
        void doSave();
      },
    });
  };

  const requestDelete = (slot: Slot) => {
    setConfirm({
      title: 'Slot löschen?',
      message: `"${slot.band}" (${formatTime(slot.start)}–${formatTime(slot.end)}) wird aus dem Timetable entfernt.`,
      affectedSelections: totalSelections(selectionCounts[slot.id]),
      confirmLabel: 'Löschen',
      onConfirm: () => {
        void (async () => {
          setBusy(true);
          setError('');
          const result = await callApi('/api/organizer/slot', 'DELETE', {
            festivalId,
            slotId: slot.id,
          });
          setBusy(false);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          onTimetable(result.timetable);
          setDraft(null);
        })();
      },
    });
  };

  return (
    <section className="mt-3">
      {/* Tages-Auswahl */}
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 scrollbar-thin md:mx-0 md:px-0">
        {timetable.days.map((d) => (
          <button
            key={d.id}
            onClick={() => setDayId(d.id)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold uppercase ${
              d.id === activeDayId
                ? 'border-blood bg-blood/15 text-bone'
                : 'border-rivet bg-steel text-ash'
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      {draft && !draft.id ? (
        <div className="mt-2 rounded-xl border border-rivet bg-steel p-3 md:max-w-xl">
          <p className="text-sm font-bold text-bone">Neuer Slot</p>
          <SlotForm
            draft={draft}
            timetable={timetable}
            onChange={setDraft}
            onSubmit={save}
            onCancel={() => setDraft(null)}
            busy={busy}
          />
        </div>
      ) : (
        <button
          onClick={startNew}
          className="mt-2 w-full rounded-xl border border-dashed border-rivet py-2.5 text-sm font-bold text-ash"
        >
          + Slot hinzufügen
        </button>
      )}
      {error && <p className="mt-2 text-sm text-blood">{error}</p>}
      {info && <p className="mt-2 text-sm font-bold text-ember">{info}</p>}

      {/* Slots des Tages, gruppiert nach Bühne – am Desktop nebeneinander
          als Spalten-Board, damit die Breite genutzt wird */}
      <div className="md:grid md:grid-cols-2 md:items-start md:gap-x-6 xl:grid-cols-3">
        {timetable.stages.map((stage) => {
          const slots = timetable.slots
            .filter((s) => s.dayId === activeDayId && s.stageId === stage.id)
            .sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
          return (
            <div key={stage.id} className="mt-4">
              <h3
                className="text-xs font-black uppercase tracking-wide"
                style={{ color: stage.color }}
              >
                {stage.name}
              </h3>
              {slots.length === 0 ? (
                <p className="mt-1 text-xs text-ash/70">Keine Slots an diesem Tag.</p>
              ) : (
                <ul className="mt-1 space-y-1.5">
                  {slots.map((slot) => {
                    const going = selectionCounts[slot.id]?.going ?? 0;
                    const interested = selectionCounts[slot.id]?.interested ?? 0;
                    return (
                      <li key={slot.id} className="rounded-xl border border-rivet bg-steel p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <button
                            onClick={() =>
                              draft?.id === slot.id ? setDraft(null) : startEdit(slot)
                            }
                            className="min-w-0 flex-1 text-left"
                          >
                            <span className="text-sm font-bold text-bone">
                              {formatTime(slot.start)}–{formatTime(slot.end)}
                            </span>{' '}
                            <span className="truncate text-sm text-bone">{slot.band}</span>
                            {!slot.confirmed && (
                              <span className="ml-1.5 text-[10px] font-bold uppercase text-ember">
                                unbestätigt
                              </span>
                            )}
                            {going > 0 && (
                              <span
                                title={`${going} ${going === 1 ? 'feste Zusage' : 'feste Zusagen'}`}
                                className="ml-1.5 rounded-full bg-rivet px-1.5 py-0.5 text-[10px] font-bold text-ash"
                              >
                                🤘 {going}
                              </span>
                            )}
                            {interested > 0 && (
                              <span
                                title={`${interested} interessiert (unverbindlich)`}
                                className="ml-1.5 rounded-full border border-dashed border-ember/60 px-1.5 py-0.5 text-[10px] font-bold text-ember"
                              >
                                🤔 {interested}
                              </span>
                            )}
                          </button>
                          <button
                            onClick={() => requestDelete(slot)}
                            className="shrink-0 text-xs font-bold text-blood"
                          >
                            🗑
                          </button>
                        </div>
                        {draft?.id === slot.id && (
                          <SlotForm
                            draft={draft}
                            timetable={timetable}
                            onChange={setDraft}
                            onSubmit={save}
                            onCancel={() => setDraft(null)}
                            busy={busy}
                          />
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      {confirm && <ConfirmDialog req={confirm} onClose={() => setConfirm(null)} />}
    </section>
  );
}
