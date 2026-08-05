/**
 * Betreiber-Pings über einen Discord-Webhook (DISCORD_WEBHOOK_URL, in
 * Discord unter Servereinstellungen → Integrationen → Webhooks anlegen).
 * Ohne die Variable ist das Feature einfach aus. Die Aufrufer feuern die
 * Pings per after() nach der Antwort – ein Fehler hier darf also niemals
 * eine Nutzer-Aktion kaputt machen, deshalb wird nur geloggt.
 */

async function sendDiscord(content: string): Promise<void> {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content,
        // Nutzer-/Gruppennamen stecken im Text – niemand soll sich per
        // Name "@everyone" einen Server-weiten Ping erschleichen können.
        allowed_mentions: { parse: [] },
      }),
    });
    if (!res.ok) {
      console.error(
        `Discord-Webhook-Fehler ${res.status}: ${await res.text().catch(() => '')}`
      );
    }
  } catch (err) {
    console.error('Discord-Webhook nicht erreichbar:', err);
  }
}

/** Neues Konto angelegt – bewusst nur der Name, keine E-Mail-Adresse. */
export function notifyUserRegistered(
  name: string,
  method: 'Passkey' | 'Passwort'
): Promise<void> {
  return sendDiscord(`👤 Neuer Nutzer: **${name}** (per ${method})`);
}

/** Neue Gruppe gegründet. */
export function notifyGroupCreated(
  groupName: string,
  festivalName: string,
  ownerName: string
): Promise<void> {
  return sendDiscord(
    `🎪 Neue Gruppe: **${groupName}** für ${festivalName} (gegründet von ${ownerName})`
  );
}
