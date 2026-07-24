import { readSessionUserId } from './auth';
import { isFestivalOrganizer } from './db';

/**
 * Autorisierung für den Veranstalter-Bereich: Veranstalter sind normale
 * Passkey-Nutzer mit einem Eintrag in festival_organizers. Die Zuweisung
 * wird bei JEDER Anfrage gegen die DB geprüft (nichts davon steckt im
 * Session-Token) – ein per CLI entzogener Zugang wirkt damit sofort.
 */
export type ManageAuth =
  | { ok: true; userId: string }
  | { ok: false; status: 401 | 403 };

/** Darf dieser Request das Festival verwalten? 401 = keine Session, 403 = kein Veranstalter dieses Festivals. */
export async function canManageFestival(
  req: Request,
  festivalId: string
): Promise<ManageAuth> {
  const userId = readSessionUserId(req);
  if (!userId) return { ok: false, status: 401 };
  if (await isFestivalOrganizer(userId, festivalId)) return { ok: true, userId };
  return { ok: false, status: 403 };
}
