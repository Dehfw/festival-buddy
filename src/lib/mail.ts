/**
 * Mail-Versand über die SendGrid-v3-API per fetch – kein SDK nötig.
 * Braucht SENDGRID_API_KEY und MAIL_FROM (bei SendGrid verifizierte
 * Absenderadresse). Ist beides nicht gesetzt, schlägt der Versand
 * kontrolliert fehl; die aufrufenden Routen antworten trotzdem neutral,
 * damit kein E-Mail-Orakel entsteht.
 */

async function sendMail(to: string, subject: string, text: string): Promise<boolean> {
  const apiKey = process.env.SENDGRID_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!apiKey || !from) {
    console.error('Mail-Versand nicht konfiguriert: SENDGRID_API_KEY / MAIL_FROM fehlen');
    return false;
  }
  try {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: from, name: 'Festival Buddy' },
        subject,
        content: [{ type: 'text/plain', value: text }],
      }),
    });
    if (!res.ok) {
      console.error(
        `SendGrid-Fehler ${res.status}: ${await res.text().catch(() => '')}`
      );
      return false;
    }
    return true;
  } catch (err) {
    console.error('SendGrid nicht erreichbar:', err);
    return false;
  }
}

export function sendPasswordResetMail(
  to: string,
  resetUrl: string,
  locale: 'de' | 'en' = 'de'
): Promise<boolean> {
  if (locale === 'en') {
    return sendMail(
      to,
      'Festival Buddy – Reset your password',
      [
        'Hi!',
        '',
        'A password reset was requested for your Festival Buddy account.',
        'Use this link to set a new password (valid for 30 minutes):',
        '',
        resetUrl,
        '',
        'If this was not you, simply ignore this email – your password',
        'will remain unchanged.',
        '',
        'Rock on! 🤘',
      ].join('\n')
    );
  }
  return sendMail(
    to,
    'Festival Buddy – Passwort zurücksetzen',
    [
      'Moin!',
      '',
      'Für dein Festival-Buddy-Konto wurde ein Passwort-Reset angefordert.',
      'Mit diesem Link setzt du ein neues Passwort (30 Minuten gültig):',
      '',
      resetUrl,
      '',
      'Wenn du das nicht warst, ignorier diese Mail einfach – dein Passwort',
      'bleibt unverändert.',
      '',
      'Rock on! 🤘',
    ].join('\n')
  );
}
