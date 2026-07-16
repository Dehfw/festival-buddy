import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Datenschutz – DEFƎKT Festival Buddy',
  description: 'Wie der Festival Buddy mit deinen Daten umgeht.',
  robots: { index: false, follow: false },
};

/**
 * Datenschutzerklärung (DSGVO Art. 13). Privates, nicht-kommerzielles
 * Crew-Tool ohne Impressumspflicht – Verantwortlicher wird daher nur mit
 * E-Mail genannt, ohne Postanschrift. Statisch, kein Login nötig.
 */
export default function DatenschutzPage() {
  return (
    <main className="defekt-grid min-h-dvh px-6 py-12">
      <div className="mx-auto w-full max-w-lg">
        <div className="flex items-center justify-between">
          <h1 className="font-metal text-3xl font-black uppercase">
            Datenschutz
          </h1>
          <Link href="/" className="text-sm text-ash underline">
            ← Zurück
          </Link>
        </div>

        <div className="mt-8 space-y-8 text-sm leading-relaxed text-bone">
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ash">
              Verantwortlicher
            </h2>
            <p className="mt-2">
              Festival Buddy ist ein privates, nicht-kommerzielles Tool für
              unsere Crew. Verantwortlich im Sinne der DSGVO:
            </p>
            <p className="mt-2">
              David Schiminski
              <br />
              E-Mail:{' '}
              <a
                href="mailto:moin@festivalbuddy.app"
                className="text-blood underline"
              >
                moin@festivalbuddy.app
              </a>
            </p>
          </section>

          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ash">
              Welche Daten verarbeitet werden
            </h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-ash">
              <li>
                <span className="text-bone">Anzeigename</span> – den du selbst
                wählst (muss nicht dein echter Name sein).
              </li>
              <li>
                <span className="text-bone">Passkey</span> – ein öffentlicher
                Anmelde-Schlüssel (WebAuthn). Dein privater Schlüssel bleibt
                immer auf deinem Gerät; wir speichern nur den öffentlichen Teil,
                um dich wiederzuerkennen.
              </li>
              <li>
                <span className="text-bone">Gruppen &amp; Rollen</span> – in
                welchen Gruppen du bist und ob du Mitglied, Admin oder Owner
                bist.
              </li>
              <li>
                <span className="text-bone">Band- &amp; Timetable-Auswahl</span>{' '}
                – welche Bands du markierst, damit die Crew sieht, wer wohin
                geht.
              </li>
              <li>
                <span className="text-bone">Positionsmarker</span> (optional) –
                wenn du deinen Standort im Publikum auf der Bühnenkarte setzt.
              </li>
              <li>
                <span className="text-bone">Gruppenbild</span> (optional) – wenn
                ein Admin eines hochlädt.
              </li>
              <li>
                <span className="text-bone">Session-Cookie</span> – ein
                technisch notwendiges, signiertes Cookie, das dich nach dem
                Passkey-Login angemeldet hält.
              </li>
            </ul>
            <p className="mt-2 text-ash">
              Die IP-Adresse wird kurzzeitig verarbeitet, um Anfragen gegen
              Missbrauch zu begrenzen (Rate-Limiting). Ein dauerhaftes Profil
              wird daraus nicht erstellt. Es gibt kein Tracking, keine Werbung
              und keine Weitergabe an Dritte zu Werbezwecken.
            </p>
          </section>

          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ash">
              Rechtsgrundlage &amp; Zweck
            </h2>
            <p className="mt-2 text-ash">
              Die Verarbeitung erfolgt zur Bereitstellung der App und ihrer
              Funktionen (Art. 6 Abs. 1 lit. b DSGVO) sowie aus dem berechtigten
              Interesse an einem funktionierenden, missbrauchssicheren Dienst
              für die Crew (Art. 6 Abs. 1 lit. f DSGVO). Ohne diese Daten
              funktioniert die App nicht.
            </p>
          </section>

          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ash">
              Speicherung &amp; Löschung
            </h2>
            <p className="mt-2 text-ash">
              Deine Daten liegen in einer Datenbank, die für den Betrieb der App
              gehostet wird, und bleiben gespeichert, solange du die App nutzt.
              Verlässt du alle Gruppen bzw. wird dein Konto entfernt, werden die
              zugehörigen Daten gelöscht. Auf Wunsch löschen wir dein Konto und
              alle Daten – schreib uns einfach eine E-Mail.
            </p>
          </section>

          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ash">
              Deine Rechte
            </h2>
            <p className="mt-2 text-ash">
              Du hast das Recht auf Auskunft, Berichtigung, Löschung,
              Einschränkung der Verarbeitung, Datenübertragbarkeit und
              Widerspruch (Art. 15–21 DSGVO). Melde dich dafür unter der oben
              genannten E-Mail-Adresse. Außerdem hast du das Recht, dich bei
              einer Datenschutz-Aufsichtsbehörde zu beschweren.
            </p>
          </section>
        </div>

        <p className="mt-12 text-center font-mono text-[9px] uppercase tracking-[0.25em] text-ash/50">
          © 2026 DEFƎKT — Alle Rechte defekt.
        </p>
      </div>
    </main>
  );
}
