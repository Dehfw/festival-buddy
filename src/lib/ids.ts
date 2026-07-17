// Nutzer-IDs sind seit dem Passkey-Login zufällig (bzw. geerbt aus der
// Nur-Name-Ära); hier lebt nur noch die deterministische Farbwahl.

export function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}

/** 30 gut unterscheidbare Farben für die Freundes-Avatare */
export const USER_COLORS = [
  '#e63946', '#f77f00', '#fcbf49', '#84cc16', '#2a9d8f',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef', '#ec4899',
  '#f43f5e', '#fb923c', '#a3e635', '#34d399', '#22d3ee',
  '#818cf8', '#c084fc', '#f472b6', '#fbbf24', '#94a3b8',
  '#22c55e', '#0ea5e9', '#6366f1', '#a855f7', '#eab308',
  '#fb7185', '#facc15', '#5eead4', '#fdba74', '#d8b4fe',
] as const;

export function colorForName(name: string): string {
  return USER_COLORS[hashString(name.trim().toLowerCase()) % USER_COLORS.length];
}
