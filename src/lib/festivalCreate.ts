import type { FestivalBand, FestivalDay, Slot, Stage } from './types';
import { bandSlug, isValidTime, toMinutes } from './types';

/**
 * Prüfung einer kompletten Festival-Anlage (App-Timetable-Format, dieselbe
 * Datei wie für scripts/import-festival.mjs). Spiegelt die Regeln aus
 * scripts/validate-timetable.mjs und den Editor-Mutationen in db.ts – nur
 * dass hier nichts gewarnt, sondern alles Fragwürdige abgelehnt wird: Der
 * Aufrufer ist eine Maschine, und was einmal angelegt ist, lässt sich über
 * die Betreiber-API nicht mehr ersetzen.
 *
 * Ergebnis ist eine bereinigte Kopie: nur bekannte Felder, Band-Slugs
 * selbst berechnet (nie dem Aufrufer geglaubt), Bands sortiert.
 */

export const MAX_DAYS = 30;
export const MAX_STAGES = 40;
export const MAX_SLOTS = 2000;
export const MAX_BANDS = 2000;

export const FESTIVAL_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,39}$/;
/** Tag-/Bühnen-IDs sind Teil jeder Slot-ID (tag-buehne-bandslug) */
const PART_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;
const SLOT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,199}$/;
const SPOTIFY_ID_PATTERN = /^[A-Za-z0-9]{1,40}$/;

export interface NewFestival {
  name: string;
  edition: string;
  dataVersion: string;
  days: FestivalDay[];
  stages: Stage[];
  slots: Slot[];
  bands: FestivalBand[];
}

type Parsed = { ok: true; value: NewFestival } | { ok: false; error: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Gültiges Kalenderdatum? (Date.parse allein ließe den 31.02. durch) */
function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function text(v: unknown, min: number, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim().replace(/\s+/g, ' ');
  return t.length >= min && t.length <= max ? t : null;
}

export function parseNewFestival(body: unknown): Parsed {
  const fail = (error: string): Parsed => ({ ok: false, error });
  if (!isRecord(body)) return fail('JSON-Objekt erwartet');

  const name = text(body.festival, 1, 80);
  if (!name) return fail('"festival" (Anzeigename) muss 1–80 Zeichen haben');
  const edition = text(body.edition, 1, 120);
  if (!edition) return fail('"edition" (Datum/Ort) muss 1–120 Zeichen haben');
  const dataVersion = body.dataVersion === undefined ? '' : text(body.dataVersion, 0, 120);
  if (dataVersion === null) return fail('"dataVersion" muss Text mit höchstens 120 Zeichen sein');

  for (const key of ['days', 'stages', 'slots', 'bands'] as const) {
    if (body[key] !== undefined && !Array.isArray(body[key])) {
      return fail(`"${key}" ist kein Array`);
    }
  }
  const rawDays = (body.days as unknown[] | undefined) ?? [];
  const rawStages = (body.stages as unknown[] | undefined) ?? [];
  const rawSlots = (body.slots as unknown[] | undefined) ?? [];
  const rawBands = (body.bands as unknown[] | undefined) ?? [];

  /* ---------- Tage ---------- */
  if (rawDays.length === 0) return fail('Keine Tage – ohne Tage kann die App nichts anzeigen');
  if (rawDays.length > MAX_DAYS) return fail(`Höchstens ${MAX_DAYS} Tage möglich`);
  const days: FestivalDay[] = [];
  const dayIds = new Set<string>();
  const dayDates = new Set<string>();
  for (const [i, d] of rawDays.entries()) {
    const at = `days[${i}]`;
    if (!isRecord(d)) return fail(`${at}: Objekt erwartet`);
    if (typeof d.id !== 'string' || !PART_ID_PATTERN.test(d.id)) {
      return fail(`${at}: "id" fehlt oder ist kein Slug (a–z, 0–9, Bindestrich)`);
    }
    if (dayIds.has(d.id)) return fail(`${at}: Tag-ID "${d.id}" doppelt`);
    const label = text(d.label, 1, 8);
    if (!label) return fail(`${at}: "label" muss 1–8 Zeichen haben`);
    const longLabel = text(d.longLabel, 1, 20);
    if (!longLabel) return fail(`${at}: "longLabel" muss 1–20 Zeichen haben`);
    if (typeof d.date !== 'string' || !isRealDate(d.date)) {
      return fail(`${at}: "date" muss ein gültiges Datum im Format JJJJ-MM-TT sein`);
    }
    if (dayDates.has(d.date)) return fail(`${at}: Datum ${d.date} kommt doppelt vor`);
    dayIds.add(d.id);
    dayDates.add(d.date);
    days.push({ id: d.id, label, longLabel, date: d.date });
  }
  days.sort((a, b) => a.date.localeCompare(b.date));

  /* ---------- Bühnen ---------- */
  if (rawStages.length > MAX_STAGES) return fail(`Höchstens ${MAX_STAGES} Bühnen möglich`);
  const stages: Stage[] = [];
  const stageIds = new Set<string>();
  for (const [i, s] of rawStages.entries()) {
    const at = `stages[${i}]`;
    if (!isRecord(s)) return fail(`${at}: Objekt erwartet`);
    if (typeof s.id !== 'string' || !PART_ID_PATTERN.test(s.id)) {
      return fail(`${at}: "id" fehlt oder ist kein Slug (a–z, 0–9, Bindestrich)`);
    }
    if (stageIds.has(s.id)) return fail(`${at}: Bühnen-ID "${s.id}" doppelt`);
    const stageName = text(s.name, 1, 40);
    if (!stageName) return fail(`${at}: "name" muss 1–40 Zeichen haben`);
    const short = text(s.short, 1, 5);
    if (!short) return fail(`${at}: "short" muss 1–5 Zeichen haben`);
    if (typeof s.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(s.color)) {
      return fail(`${at}: "color" muss ein Hex-Wert wie #ff5a17 sein`);
    }
    stageIds.add(s.id);
    stages.push({ id: s.id, name: stageName, short, color: s.color });
  }

  /* ---------- Slots ---------- */
  if (rawSlots.length > MAX_SLOTS) return fail(`Höchstens ${MAX_SLOTS} Slots möglich`);
  const slots: Slot[] = [];
  const slotIds = new Set<string>();
  for (const [i, s] of rawSlots.entries()) {
    const at = `slots[${i}]`;
    if (!isRecord(s)) return fail(`${at}: Objekt erwartet`);
    if (typeof s.id !== 'string' || !SLOT_ID_PATTERN.test(s.id)) {
      return fail(`${at}: "id" fehlt oder ist kein Slug (tag-buehne-bandslug)`);
    }
    if (slotIds.has(s.id)) return fail(`${at}: Slot-ID "${s.id}" doppelt`);
    const band = text(s.band, 1, 80);
    if (!band) return fail(`${at}: "band" muss 1–80 Zeichen haben`);
    if (typeof s.dayId !== 'string' || !dayIds.has(s.dayId)) {
      return fail(`${at}: unbekannter "dayId"`);
    }
    if (typeof s.stageId !== 'string' || !stageIds.has(s.stageId)) {
      return fail(`${at}: unbekannter "stageId"`);
    }
    if (typeof s.confirmed !== 'boolean') return fail(`${at}: "confirmed" fehlt`);
    if (
      typeof s.start !== 'string' ||
      typeof s.end !== 'string' ||
      !isValidTime(s.start) ||
      !isValidTime(s.end)
    ) {
      return fail(`${at}: "start"/"end" bitte als HH:MM (nach Mitternacht z. B. 25:30)`);
    }
    if (toMinutes(s.end) <= toMinutes(s.start)) {
      return fail(`${at}: Ende (${s.end}) muss nach dem Beginn (${s.start}) liegen`);
    }
    if (
      s.spotifyArtistId !== undefined &&
      (typeof s.spotifyArtistId !== 'string' || !SPOTIFY_ID_PATTERN.test(s.spotifyArtistId))
    ) {
      return fail(`${at}: ungültige Spotify-Artist-ID`);
    }
    slotIds.add(s.id);
    slots.push({
      id: s.id,
      dayId: s.dayId,
      stageId: s.stageId,
      band,
      start: s.start,
      end: s.end,
      confirmed: s.confirmed,
      ...(s.spotifyArtistId ? { spotifyArtistId: s.spotifyArtistId as string } : {}),
    });
  }

  /* ---------- Bands (Lineup-Pool) ---------- */
  if (rawBands.length > MAX_BANDS) return fail(`Höchstens ${MAX_BANDS} Bands möglich`);
  const bands: FestivalBand[] = [];
  const slugs = new Set<string>();
  for (const [i, b] of rawBands.entries()) {
    const at = `bands[${i}]`;
    if (!isRecord(b)) return fail(`${at}: Objekt erwartet`);
    const bandName = text(b.name, 1, 80);
    if (!bandName) return fail(`${at}: "name" muss 1–80 Zeichen haben`);
    const slug = bandSlug(bandName);
    // Ein mitgeschickter Slug muss zum Namen passen – sonst stimmt die
    // Datei nicht mit dem überein, was die App aus dem Namen ableitet.
    if (b.slug !== undefined && b.slug !== slug) {
      return fail(`${at}: "slug" passt nicht zum Namen (erwartet "${slug}")`);
    }
    if (slugs.has(slug)) return fail(`${at}: Band "${bandName}" doppelt (Slug "${slug}")`);
    if (
      b.spotifyArtistId !== undefined &&
      (typeof b.spotifyArtistId !== 'string' || !SPOTIFY_ID_PATTERN.test(b.spotifyArtistId))
    ) {
      return fail(`${at}: ungültige Spotify-Artist-ID`);
    }
    slugs.add(slug);
    bands.push({
      slug,
      name: bandName,
      ...(b.spotifyArtistId ? { spotifyArtistId: b.spotifyArtistId as string } : {}),
    });
  }
  bands.sort((a, b) => a.name.localeCompare(b.name, 'de'));

  return { ok: true, value: { name, edition, dataVersion, days, stages, slots, bands } };
}
