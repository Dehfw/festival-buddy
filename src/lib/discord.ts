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

  const safeContent = content.length > 2000 ? `${content.slice(0, 1997)}…` : content;
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 3_000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: abort.signal,
      body: JSON.stringify({
        content: safeContent,
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
  } finally {
    clearTimeout(timeout);
  }
}

const DISCORD_MD_ESCAPE_RE = /[\\`*_~]/g;
function escapeDiscordMarkdown(text: string): string {
  return text.replace(DISCORD_MD_ESCAPE_RE, '\\$&');
}

/** Neues Konto angelegt – bewusst nur der Name, keine E-Mail-Adresse. */
export function notifyUserRegistered(
  name: string,
  method: 'Passkey' | 'Passwort'
): Promise<void> {
  return sendDiscord(`👤 Neuer Nutzer: **${escapeDiscordMarkdown(name)}** (per ${method})`);
}

/** Neue Gruppe gegründet. */
export function notifyGroupCreated(
  groupName: string,
  festivalName: string,
  ownerName: string
): Promise<void> {
  return sendDiscord(
    `🎪 Neue Gruppe: **${escapeDiscordMarkdown(groupName)}** für ${escapeDiscordMarkdown(
      festivalName
    )} (gegründet von ${escapeDiscordMarkdown(ownerName)})`
  );
}
