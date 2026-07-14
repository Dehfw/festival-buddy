/**
 * Deterministische Nutzer-ID aus dem Namen: dadurch erzeugt ein Offline-Login
 * auf dem Handy exakt denselben Nutzer wie der Server – Sync bleibt konfliktfrei.
 */
export function userIdFromName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `u-${slug || 'anonym'}`;
}

export function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}

/** 20 gut unterscheidbare Farben für die Freundes-Avatare */
export const USER_COLORS = [
  '#e63946', '#f77f00', '#fcbf49', '#84cc16', '#2a9d8f',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef', '#ec4899',
  '#f43f5e', '#fb923c', '#a3e635', '#34d399', '#22d3ee',
  '#818cf8', '#c084fc', '#f472b6', '#fbbf24', '#94a3b8',
] as const;

export function colorForName(name: string): string {
  return USER_COLORS[hashString(name.trim().toLowerCase()) % USER_COLORS.length];
}
