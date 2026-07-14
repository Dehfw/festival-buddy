export interface FestivalDay {
  id: string;
  label: string;
  longLabel: string;
  date: string;
}

export interface Stage {
  id: string;
  name: string;
  short: string;
  color: string;
}

export interface Slot {
  id: string;
  dayId: string;
  stageId: string;
  band: string;
  /** "HH:MM"; Stunden >= 24 bedeuten nach Mitternacht (Folgetag) */
  start: string;
  end: string;
  confirmed: boolean;
  /** Spotify-Artist-ID aus dem offiziellen W:O:A-Export */
  spotifyArtistId?: string;
}

export interface Timetable {
  festival: string;
  edition: string;
  dataVersion: string;
  days: FestivalDay[];
  stages: Stage[];
  slots: Slot[];
}

export interface User {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

export interface Selection {
  userId: string;
  slotId: string;
}

export interface Position {
  userId: string;
  slotId: string;
  /** Prozent-Koordinaten 0..100 auf dem Blueprint */
  x: number;
  y: number;
  /** Wann die Markierung gesetzt/verschoben wurde (ISO) */
  updatedAt?: string;
}

/** Relative Zeitangabe: "gerade eben", "vor 5 Min.", "vor 2 Std." */
export function formatAgo(iso: string): string {
  const min = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return 'gerade eben';
  if (min < 60) return `vor ${min} Min.`;
  const h = Math.floor(min / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'vor 1 Tag' : `vor ${d} Tagen`;
}

/** Marker älter als 90 Min. gelten als "vielleicht längst weitergezogen" */
export function isStalePosition(iso?: string): boolean {
  if (!iso) return false;
  return Date.now() - new Date(iso).getTime() > 90 * 60 * 1000;
}

export type PoiType = 'toilet' | 'water' | 'merch' | 'medic' | 'entrance';

export interface Poi {
  id: string;
  type: PoiType;
  x: number;
  y: number;
  label: string;
}

export type BlueprintElementType = 'stage' | 'foh' | 'barrier' | 'tent';

export interface BlueprintElement {
  type: BlueprintElementType;
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
}

export interface Blueprint {
  stageLabel: string;
  elements: BlueprintElement[];
  pois: Poi[];
}

export interface Db {
  users: User[];
  selections: Selection[];
  positions: Position[];
  blueprints: Record<string, Blueprint>;
  rev: number;
}

/** Antwort von GET /api/data – alles, was der Client braucht (und offline cached) */
export interface DataPayload {
  timetable: Timetable;
  users: User[];
  selections: Selection[];
  positions: Position[];
  blueprints: Record<string, Blueprint>;
  rev: number;
  serverTime: string;
}

/** "HH:MM" (auch 24:30 etc.) -> Minuten seit 00:00 des Festivaltags */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  // Frühe Stunden (vor 08:00) sind Sets nach Mitternacht
  const hours = h < 8 ? h + 24 : h;
  return hours * 60 + m;
}

export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const hh = h % 24;
  return `${String(hh).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const POI_META: Record<PoiType, { label: string; icon: string; color: string }> = {
  toilet: { label: 'Toiletten', icon: '🚻', color: '#60a5fa' },
  water: { label: 'Wasser', icon: '💧', color: '#22d3ee' },
  merch: { label: 'Merch/Stand', icon: '🛍️', color: '#facc15' },
  medic: { label: 'Erste Hilfe', icon: '⛑️', color: '#f87171' },
  entrance: { label: 'Eingang', icon: '🚪', color: '#a3e635' },
};
