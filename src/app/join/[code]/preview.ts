import { getGroupPreviewByCode, type GroupPreviewData } from '@/lib/db';
import { normalizeInviteCode } from '@/lib/types';

/**
 * Gruppen-Vorschau für die Link-Vorschau des Einladungslinks (Metadaten
 * und OpenGraph-Bild teilen sich das). Läuft VOR dem Login, wenn WhatsApp
 * & Co. den Link crawlen – deshalb nur per Code und fehlertolerant: ein
 * kaputter Code oder eine weggebrochene Datenbank liefert null, die
 * Vorschau fällt dann auf die generische Variante zurück.
 */
export async function loadInvitePreview(
  rawCode: string
): Promise<GroupPreviewData | null> {
  try {
    const code = normalizeInviteCode(decodeURIComponent(rawCode));
    if (code.length !== 8) return null;
    return await getGroupPreviewByCode(code);
  } catch {
    return null;
  }
}
