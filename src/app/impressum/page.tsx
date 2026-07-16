import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Impressum – DEFƎKT Festival Buddy',
  description: 'Anbieterkennzeichnung gemäß § 5 DDG.',
  robots: { index: false, follow: false },
};

/**
 * Impressum (Anbieterkennzeichnung nach § 5 DDG / § 18 Abs. 2 MStV).
 * Statisch gerendert, kein Login nötig – erreichbar über den Footer der
 * Startseite. Ladungsfähige Anschrift.
 */
export default function ImpressumPage() {
  return (
    <main className="defekt-grid min-h-dvh px-6 py-12">
      <div className="mx-auto w-full max-w-lg">
        <div className="flex items-center justify-between">
          <h1 className="font-metal text-3xl font-black uppercase">Impressum</h1>
          <Link href="/" className="text-sm text-ash underline">
            ← Zurück
          </Link>
        </div>

        <div className="mt-8 space-y-8 text-sm leading-relaxed text-bone">
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ash">
              Angaben gemäß § 5 DDG
            </h2>
            <p className="mt-2">
              David Schiminski
              <br />
              Lechstraße 24
              <br />
              90451 Nürnberg
              <br />
              Deutschland
            </p>
          </section>

          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ash">
              Kontakt
            </h2>
            <p className="mt-2">
              E-Mail:{' '}
              <a
                href="mailto:da.schiminski@gmail.com"
                className="text-blood underline"
              >
                da.schiminski@gmail.com
              </a>
            </p>
          </section>

          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ash">
              Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV
            </h2>
            <p className="mt-2">
              David Schiminski
              <br />
              Lechstraße 24
              <br />
              90451 Nürnberg
            </p>
          </section>

          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ash">
              Haftung für Inhalte
            </h2>
            <p className="mt-2 text-ash">
              Festival Buddy ist ein nicht-kommerzielles Tool für Festival-Crews.
              Für eigene Inhalte auf diesen Seiten sind wir nach den allgemeinen
              Gesetzen verantwortlich. Nutzergenerierte Inhalte (z. B. Namen,
              Gruppen, Band-Auswahl) geben die Ansicht der jeweiligen Mitglieder
              wieder. Bandnamen, Timetable und Logos sind Eigentum der jeweiligen
              Rechteinhaber.
            </p>
          </section>

          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ash">
              Datenschutz
            </h2>
            <p className="mt-2 text-ash">
              Wie wir mit deinen Daten umgehen, steht in der{' '}
              <Link href="/datenschutz" className="text-blood underline">
                Datenschutzerklärung
              </Link>
              .
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
