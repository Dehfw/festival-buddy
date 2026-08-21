import type { Metadata } from 'next';
import Link from 'next/link';
import { BrandLockup, MerchMasterLogo, MERCHMASTER_URL } from '@/components/Brand';
import { resolveSiteUrl } from '@/lib/siteUrl';

const TITLE = 'Festival Buddy für Bands – deine Fans planen dich ein | MerchMaster';
const DESCRIPTION =
  'Deine Slots stehen im Timetable, deine Fans markieren dich und werden vor dem Auftritt erinnert. Festival Buddy ist kostenlos – gebaut von MerchMaster, der App für den Merch-Stand.';

const CONTACT_MAILTO =
  'mailto:moin@festivalbuddy.app?subject=Unsere%20Band%20spielt%20auf%20einem%20Festival';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    'Festival App für Bands',
    'Band Merch verkaufen',
    'Merch-Stand App',
    'Merch Abrechnung Show',
    'Kartenzahlung Merch',
    'Festival Timetable Band',
    'Festival Buddy',
    'MerchMaster',
  ],
  alternates: { canonical: '/bands' },
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    url: '/bands',
    siteName: 'Festival Buddy by MerchMaster',
    locale: 'de_DE',
    title: TITLE,
    description: DESCRIPTION,
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'Festival Buddy für Bands – deine Fans planen dich ein.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: ['/og.png'],
  },
};

/** Strukturierte Daten für Google: Unterseite der Festival-Buddy-Website */
async function jsonLd() {
  const base = await resolveSiteUrl();
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: TITLE,
    url: `${base}/bands`,
    description: DESCRIPTION,
    inLanguage: 'de',
    isPartOf: { '@type': 'WebSite', name: 'Festival Buddy by MerchMaster', url: base },
  });
}

/* ------------------------------------------------------------------ */
/* Öffentliche Band-Seite (/bands). Die Brücke zwischen dem       */
/* kostenlosen Besucher-Tool und MerchMaster: Bands sehen zuerst, was  */
/* Festival Buddy für ihren Auftritt tut, und danach, womit wir das    */
/* Ganze bezahlen – der App für ihren Merch-Stand.                     */
/* ------------------------------------------------------------------ */

const BUDDY_FEATURES: { icon: string; title: string; body: string }[] = [
  {
    icon: '🤘',
    title: 'Fans markieren euch',
    body: 'Jede Crew plant ihren Festivaltag über den Timetable. Wer euch antippt, hat euren Slot fest im Plan – und alle in seiner Gruppe sehen es.',
  },
  {
    icon: '⏰',
    title: 'Erinnerung vor dem Auftritt',
    body: 'Kurz vor Beginn kommt eine Push-Nachricht aufs Handy. Niemand steht mehr am falschen Ende des Geländes, wenn ihr anfangt.',
  },
  {
    icon: '🔥',
    title: 'Hot Slots zeigen Zugkraft',
    body: 'Sagen genug aus einer Crew fest zu, fängt euer Slot in der App an zu brennen. Das ist der Termin, den keiner mehr sausen lässt.',
  },
  {
    icon: '🎧',
    title: 'Reinhören mit einem Tipp',
    body: 'Zu jeder Band führt ein Link direkt aufs Spotify-Profil. Wer euch noch nicht kennt, hört rein, bevor er sich entscheidet.',
  },
];

const MERCH_FEATURES: { icon: string; title: string; body: string }[] = [
  {
    icon: '📦',
    title: 'Bestand im Blick',
    body: 'Welche Größe ist noch da, was ist durch? Der Bestand läuft mit, statt auf einem Zettel im Case zu liegen.',
  },
  {
    icon: '💳',
    title: 'Kartenzahlung am Stand',
    body: 'Karte und kontaktlos direkt am Merch-Tisch, mit dem SumUp-Reader. Kein extra Kassensystem, nur euer Handy.',
  },
  {
    icon: '🧾',
    title: 'Abrechnung nach der Show',
    body: 'Statt Kopfrechnen im Nightliner steht die Abrechnung fertig da – inklusive dem, was die Venue abbekommt.',
  },
  {
    icon: '📊',
    title: 'Zahlen pro Show',
    body: 'Was lief wo am besten, was verstaubt im Case? Nach der Tour wisst ihr, was ihr nachdrucken solltet.',
  },
];

export default async function FuerBandsPage() {
  const structuredData = await jsonLd();
  return (
    <main className="brand-grid min-h-dvh">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: structuredData }}
      />
      {/* Topbar */}
      <header className="steel-sheen sticky top-0 z-40">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-3.5 sm:px-6">
          <Link href="/" aria-label="Zur Startseite">
            <BrandLockup variant="mini" align="start" />
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="hidden rounded-lg border border-rivet bg-steel px-3.5 py-2 text-xs font-semibold uppercase tracking-wider text-bone transition active:scale-[0.98] sm:inline-block"
            >
              Für Crews
            </Link>
            <a
              href={MERCHMASTER_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-blood px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-black transition active:scale-[0.98]"
            >
              MerchMaster
            </a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-3xl px-6 pt-12 pb-14 text-center sm:pt-16 sm:pb-20">
        <div className="mb-6 inline-flex items-center gap-2 border border-blood/20 bg-blood/5 px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.3em] text-blood">
          <span className="opacity-50">//</span> Für Bands
        </div>

        <h1 className="font-metal text-5xl uppercase leading-[0.95] text-bone sm:text-6xl">
          Deine Fans
          <br />
          planen dich{' '}
          <span
            className="text-blood"
            style={{ textShadow: '0 0 40px rgba(255,90,23,.45)' }}
          >
            ein.
          </span>
        </h1>

        <p className="mx-auto mt-7 max-w-xl text-base leading-relaxed text-ash sm:text-lg">
          Auf jedem Festival stehen tausend Leute vor derselben Frage: Wo bin ich
          um 21 Uhr? Festival Buddy beantwortet sie – und euer Slot steht mittendrin.
        </p>

        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href={MERCHMASTER_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full rounded-xl bg-blood px-8 py-4 font-metal text-lg uppercase tracking-wide text-black transition active:scale-[0.98] sm:w-auto"
          >
            Merch verkaufen mit MerchMaster
          </a>
          <a
            href="#merch"
            className="w-full rounded-xl border border-rivet bg-steel px-8 py-4 text-sm font-semibold uppercase tracking-wider text-bone transition active:scale-[0.98] sm:w-auto"
          >
            Was ist MerchMaster?
          </a>
        </div>
      </section>

      {/* Was Festival Buddy für die Band tut */}
      <section className="border-t border-rivet/40 bg-pit/60">
        <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
          <h2 className="text-center font-metal text-3xl uppercase text-bone sm:text-4xl">
            Euer Slot im <span className="text-blood">Plan der Crew</span>
          </h2>
          <p className="mx-auto mt-3 max-w-md text-center text-sm text-ash">
            Ihr müsst dafür nichts tun und nichts bezahlen. Sobald euer Festival
            den Timetable pflegt, seid ihr drin.
          </p>

          <div className="mt-12 grid gap-4 sm:grid-cols-2">
            {BUDDY_FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-rivet/60 bg-steel p-7"
              >
                <div className="text-3xl">{f.icon}</div>
                <h3 className="mt-4 font-metal text-lg uppercase tracking-wide text-bone">
                  {f.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ash">{f.body}</p>
              </div>
            ))}
          </div>

          <p className="mx-auto mt-10 max-w-lg text-center text-sm text-ash">
            Euer Festival ist noch nicht dabei?{' '}
            <a
              href={CONTACT_MAILTO}
              className="text-blood underline underline-offset-2"
            >
              Schreib uns
            </a>{' '}
            – wir fragen bei der Orga an.
          </p>
        </div>
      </section>

      {/* Der Absender: MerchMaster */}
      <section id="merch" className="scroll-mt-20 border-t border-rivet/40">
        <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
          <div className="text-center">
            <h2 className="font-metal text-3xl uppercase text-bone sm:text-4xl">
              Und am <span className="text-blood">Merch-Stand?</span>
            </h2>
            <div className="mt-5">
              <MerchMasterLogo variant="hero" />
            </div>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-ash">
              Festival Buddy ist kostenlos, weil wir unser Geld woanders
              verdienen: mit MerchMaster, der App für den Merch-Tisch. Bestand,
              Kartenzahlung und Abrechnung auf einem Handy – gebaut für Bands,
              getestet auf Tour.
            </p>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2">
            {MERCH_FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-rivet/60 bg-steel p-7"
              >
                <div className="text-3xl">{f.icon}</div>
                <h3 className="mt-4 font-metal text-lg uppercase tracking-wide text-bone">
                  {f.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ash">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-rivet/40 bg-pit/60">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center">
          <MerchMasterLogo variant="hero" />
          <p className="mx-auto mt-6 max-w-md text-base text-ash">
            Weniger Zettelwirtschaft hinterm Tisch, mehr Zeit für die Leute
            davor. Schau dir MerchMaster an.
          </p>
          <a
            href={MERCHMASTER_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-8 inline-block rounded-xl bg-blood px-10 py-4 font-metal text-lg uppercase tracking-wide text-black transition active:scale-[0.98]"
          >
            Zu MerchMaster
          </a>
          <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.25em] text-ash/50">
            merchmaster.app
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-rivet/40">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 px-6 py-10 text-center">
          <BrandLockup variant="mini" />
          <p className="max-w-md text-xs leading-relaxed text-ash/70">
            Festival Buddy · Timetable-Planer für die Crew – auf jedem Festival.
          </p>
          <p className="flex items-center justify-center gap-3 font-mono text-[9px] uppercase tracking-[0.25em] text-ash/50">
            <Link href="/" className="underline underline-offset-2 hover:text-ash">
              Für Crews
            </Link>
            <span aria-hidden>·</span>
            <Link
              href="/veranstalter"
              className="underline underline-offset-2 hover:text-ash"
            >
              Für Veranstalter
            </Link>
            <span aria-hidden>·</span>
            <Link
              href="/impressum"
              className="underline underline-offset-2 hover:text-ash"
            >
              Impressum
            </Link>
            <span aria-hidden>·</span>
            <Link
              href="/datenschutz"
              className="underline underline-offset-2 hover:text-ash"
            >
              Datenschutz
            </Link>
          </p>
          <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-ash/50">
            © 2026 MerchMaster · Festival Buddy ist kostenlos und bleibt es.
          </p>
        </div>
      </footer>
    </main>
  );
}
