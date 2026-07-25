import type { Metadata } from 'next';
import Link from 'next/link';
import { DefektLogo } from '@/components/DefektLogo';
import { FestivalStartCta } from '@/components/FestivalStartCta';
import { LandingLogin } from '@/components/LandingLogin';
import { resolveSiteUrl } from '@/lib/siteUrl';

/* ------------------------------------------------------------------ */
/* Festival-Landingpage fürs Party.San Metal Open Air 2026 (/partysan) */
/* Eigenes Branding in Party.San-Rot, Poster-Header statt Bilddatei    */
/* (wie beim AppScreenshot: lädt schneller, bleibt scharf, kein        */
/* Copyright-Gedöns). Der CTA "Gruppe erstellen" merkt sich das        */
/* Festival – im GroupGate ist Party.San dann schon vorausgewählt.     */
/* ------------------------------------------------------------------ */

/** DB-ID des Festivals (Timetable-Seed: data/partysan2026.json) */
const FESTIVAL_ID = 'psoa2026';

/** Party.San-Rot – bewusst nicht das DEFƎKT-Orange (= Mainstage-Farbe der Daten) */
const PS_RED = '#e63946';

const TITLE =
  'Party.San 2026 Festival Buddy – Gruppe erstellen & Running Order planen';
const DESCRIPTION =
  'Der Timetable-Planer für eure Party.San-Crew: Gruppe erstellen (Party.San 2026 ist schon vorausgewählt), Bands markieren, Hot Slots sehen. 06.–08.08.2026, Flugplatz Obermehler-Schlotheim – offline-fähig, ohne Passwort.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    'Party.San 2026',
    'Party.San Metal Open Air',
    'Party.San Running Order',
    'Party.San Timetable',
    'Party.San Lineup',
    'Obermehler-Schlotheim',
    'Festival Buddy',
    'Festival Planer',
    'Timetable Planer',
    'Festival Gruppe',
    'DEFƎKT',
  ],
  alternates: { canonical: '/partysan' },
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    url: '/partysan',
    siteName: 'DEFƎKT Festival Buddy',
    locale: 'de_DE',
    title: TITLE,
    description: DESCRIPTION,
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'Festival Buddy – Timetable-Planer für eure Party.San-Crew.',
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

/** Strukturierte Daten: Seite ÜBER das Festival (wir sind nicht der Veranstalter) */
async function jsonLd() {
  const base = await resolveSiteUrl();
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: TITLE,
    url: `${base}/partysan`,
    description: DESCRIPTION,
    inLanguage: 'de',
    about: {
      '@type': 'Festival',
      name: 'Party.San Metal Open Air 2026',
      startDate: '2026-08-06',
      endDate: '2026-08-08',
      location: {
        '@type': 'Place',
        name: 'Flugplatz Obermehler-Schlotheim',
        address: { '@type': 'PostalAddress', addressRegion: 'Thüringen', addressCountry: 'DE' },
      },
    },
  });
}

/* Lineup-Highlights aus data/partysan2026.json (Running Order Stand
   Juli 2026 via konzertn.de, Fan-Angaben ohne Gewähr) – kuratiert,
   die App selbst zeigt immer den aktuellen Stand aus der Datenbank. */
const DAYS: { label: string; date: string; headliner: string; bands: string[] }[] = [
  {
    label: 'Donnerstag',
    date: '06.08.',
    headliner: 'Testament',
    bands: ['Moonspell', 'Sventevith', 'Desaster', 'Schirenc plays Pungent Stench', 'Misery Index'],
  },
  {
    label: 'Freitag',
    date: '07.08.',
    headliner: 'Amorphis',
    bands: ['Dark Funeral', 'Alcest', 'Sacred Reich', 'Wolves In The Throne Room', 'Deceased'],
  },
  {
    label: 'Samstag',
    date: '08.08.',
    headliner: 'Hypocrisy',
    bands: ['Marduk', 'Wolfbrigade', 'In The Woods…', 'Firespawn', 'For Victory (Bolt Thrower)'],
  },
];

const ALL_BANDS: string[] = [
  '200 Stab Wounds', 'A Canorous Quintet', 'Acranius', 'Afsky', 'Alcest', 'Amorphis',
  'Asagraum', 'Baxaxaxa', 'Begging For Incest', 'Bloody Vengeance', 'Celeste', 'Crawl',
  'Dark Funeral', 'Death Worship', 'Deceased', 'Desaster', 'Endonomos', 'Evoken',
  'Firespawn', 'Fleshcrawl', 'For Victory (Bolt Thrower)', 'Gates Of Ishtar',
  'Gorefunest (Gorefest-Tribute)', 'Groza', 'GUT', 'Guttural Slug', 'Hexvessel',
  'Hypocrisy', 'Impurity', 'In The Woods…', 'Internal Bleeding', 'Iotunn', 'Jungle Rot',
  "Lucifer's Child", 'Marduk', 'Messticator', 'Misery Index', 'Moonspell', 'Morbus Dei',
  'Murder Squad', 'Nail By Nail', 'Rats Of Gomorrah', 'Sacred Reich', 'Sadistic Intent',
  'Sarcator', 'Schirenc plays Pungent Stench', 'Sear Bliss', 'Sorcerer', 'Sunken',
  'Sventevith', 'Temple Of Dread', 'Testament', 'TodoMal', 'Tulus', 'Wolfbrigade',
  'Wolves In The Throne Room', 'Wormed',
];

const STEPS: { n: string; title: string; body: string }[] = [
  {
    n: '01',
    title: 'Gruppe erstellen',
    body: 'Party.San 2026 ist schon vorausgewählt – nur noch Gruppenname tippen und mit Passkey (Face ID / Fingerabdruck) rein. Kein Passwort, kein Account-Gedöns.',
  },
  {
    n: '02',
    title: 'Link an die Crew',
    body: 'Du bekommst direkt einen Einladungslink für den Gruppenchat. Deine Leute sind in Sekunden drin.',
  },
  {
    n: '03',
    title: 'Bands markieren',
    body: 'Jeder tippt seine Bands an. Alle sehen live, wer zu Testament, Amorphis oder Hypocrisy geht – und wo sich die Crew trifft.',
  },
];

/** Primärer CTA in Party.San-Rot – überall auf der Seite gleich */
const CTA_CLASS =
  'inline-block w-full rounded-xl px-8 py-4 font-metal text-lg uppercase tracking-wide text-black transition active:scale-[0.98] sm:w-auto';

export default async function PartysanLandingPage() {
  const structuredData = await jsonLd();
  return (
    <main className="defekt-grid min-h-dvh">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: structuredData }}
      />

      {/* Topbar: DEFƎKT-Wortmarke + Party.San-Kennung, prominenter Login */}
      <header className="steel-sheen sticky top-0 z-40">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-3.5 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <Link
              href="/"
              aria-label="Zur Festival-Buddy-Startseite"
              className="shrink-0 whitespace-nowrap"
            >
              <DefektLogo variant="mini" />
            </Link>
            <span aria-hidden className="h-4 w-px shrink-0 bg-rivet" />
            <span
              className="truncate font-metal text-sm uppercase leading-none select-none sm:text-lg"
              style={{ color: PS_RED }}
            >
              Party.San <span className="text-bone max-sm:hidden">2026</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/app"
              className="hidden rounded-lg border border-rivet bg-steel px-3.5 py-2 text-xs font-semibold uppercase tracking-wider text-bone transition active:scale-[0.98] sm:inline-block"
            >
              App öffnen
            </Link>
            <LandingLogin />
          </div>
        </div>
      </header>

      {/* Hero: Poster-Header im Party.San-Look + CTA */}
      <section className="mx-auto max-w-4xl px-6 pt-12 pb-14 sm:pt-16 sm:pb-20">
        {/* "Bild im Header": handgebautes Festival-Poster (HTML/CSS statt
            Bilddatei – wie der AppScreenshot auf der Startseite) */}
        <div
          className="relative overflow-hidden rounded-3xl border px-6 py-12 text-center sm:py-16"
          style={{
            borderColor: `${PS_RED}66`,
            background:
              `radial-gradient(ellipse 70% 60% at 50% 0%, ${PS_RED}2e 0%, transparent 70%), ` +
              'linear-gradient(160deg, #181112 0%, #0a0a0a 55%, #140d0e 100%)',
          }}
        >
          {/* Glut-Schein hinter dem Wortmark */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 h-[60%] w-[70%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[80px]"
            style={{ background: `${PS_RED}26` }}
          />
          <div className="relative">
            <div
              className="mb-6 inline-flex items-center gap-2 border px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.3em]"
              style={{ borderColor: `${PS_RED}4d`, color: PS_RED, background: `${PS_RED}14` }}
            >
              <span className="opacity-50">//</span> 30 Jahre Jubiläum
            </div>

            <div aria-hidden className="text-5xl">
              💀
            </div>

            <h1 className="mt-4 font-metal uppercase leading-[0.95]">
              <span
                className="block text-5xl sm:text-7xl"
                style={{ color: PS_RED, textShadow: `0 0 50px ${PS_RED}73` }}
              >
                Party.San
              </span>
              <span className="mt-2 block text-lg tracking-[0.25em] text-bone sm:text-2xl sm:tracking-[0.35em]">
                Metal Open Air
              </span>
            </h1>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-[13px] font-black uppercase tracking-[0.2em] text-bone sm:tracking-[0.3em]">
              06.–08.08.2026
              <span
                className="inline-block h-1.5 w-8 -skew-x-12"
                style={{ background: PS_RED }}
              />
              Obermehler
            </div>

            <p className="mt-3 text-xs uppercase tracking-[0.2em] text-ash">
              Flugplatz Obermehler-Schlotheim · Thüringen
            </p>

            <div className="mt-6 flex items-center justify-center gap-2.5">
              <span className="rounded-full border border-rivet bg-steel px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-bone">
                <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: PS_RED }} />
                Mainstage
              </span>
              <span className="rounded-full border border-rivet bg-steel px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-bone">
                <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[#2a9d8f] align-middle" />
                Tentstage
              </span>
            </div>
          </div>
        </div>

        {/* Copy + CTA */}
        <div className="mx-auto mt-10 max-w-2xl text-center">
          <h2 className="font-metal text-3xl uppercase text-bone sm:text-4xl">
            Wer geht zu <span style={{ color: PS_RED }}>welcher Band?</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-ash sm:text-lg">
            Festival Buddy ist der Timetable-Planer für eure Party.San-Crew:
            Bands markieren, Hot Slots sehen, keinen Auftritt verpassen – und
            endlich wissen, wo sich alle treffen. 🤘
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <FestivalStartCta
              festivalId={FESTIVAL_ID}
              className={CTA_CLASS}
              style={{ background: PS_RED }}
            >
              Gruppe erstellen
            </FestivalStartCta>
            <a
              href="#lineup"
              className="w-full rounded-xl border border-rivet bg-steel px-8 py-4 text-sm font-semibold uppercase tracking-wider text-bone transition active:scale-[0.98] sm:w-auto"
            >
              Lineup ansehen
            </a>
          </div>
          <p className="mt-3 text-xs text-ash/70">
            Party.San 2026 ist direkt vorausgewählt – Gruppenname tippen,
            Link teilen, fertig.
          </p>
        </div>
      </section>

      {/* Lineup-Highlights */}
      <section id="lineup" className="scroll-mt-20 border-t border-rivet/40 bg-pit/60">
        <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
          <h2 className="text-center font-metal text-3xl uppercase text-bone sm:text-4xl">
            Drei Tage <span style={{ color: PS_RED }}>Vollgas</span>
          </h2>
          <p className="mx-auto mt-3 max-w-md text-center text-sm text-ash">
            57 Bands auf zwei Bühnen – ohne Plan verpasst ihr die Hälfte.
            Genau dafür gibt&apos;s den Festival Buddy.
          </p>

          <div className="mt-12 grid gap-4 sm:grid-cols-3">
            {DAYS.map((d) => (
              <div
                key={d.label}
                className="rounded-2xl border border-rivet/60 bg-steel p-6"
              >
                <div className="flex items-baseline justify-between">
                  <h3 className="font-metal text-lg uppercase tracking-wide text-bone">
                    {d.label}
                  </h3>
                  <span className="font-mono text-xs text-ash">{d.date}</span>
                </div>
                <p
                  className="mt-3 font-metal text-2xl uppercase leading-tight"
                  style={{ color: PS_RED }}
                >
                  {d.headliner}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-ash">
                  {d.bands.join(' · ')} u.&nbsp;v.&nbsp;m.
                </p>
              </div>
            ))}
          </div>

          {/* Band-Wall: das komplette Billing als Chips */}
          <div className="mt-10 flex flex-wrap justify-center gap-2">
            {ALL_BANDS.map((band) => (
              <span
                key={band}
                className="rounded-full border border-rivet/60 bg-steel px-3 py-1 text-xs text-ash"
              >
                {band}
              </span>
            ))}
          </div>
          <p className="mt-4 text-center text-[11px] text-ash/50">
            Running Order Stand Juli 2026, Fan-Angaben ohne Gewähr – in der
            App siehst du immer den aktuellen Stand.
          </p>
        </div>
      </section>

      {/* So geht's */}
      <section className="border-t border-rivet/40">
        <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
          <h2 className="text-center font-metal text-3xl uppercase text-bone sm:text-4xl">
            In <span style={{ color: PS_RED }}>drei Schritten</span> dabei
          </h2>

          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="relative">
                <div
                  className="font-metal text-6xl leading-none"
                  style={{ color: `${PS_RED}40`, textShadow: `0 0 30px ${PS_RED}26` }}
                >
                  {s.n}
                </div>
                <h3 className="mt-3 font-metal text-lg uppercase tracking-wide text-bone">
                  {s.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ash">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA unten */}
      <section className="border-t border-rivet/40 bg-pit/60">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center">
          <p
            className="font-metal text-4xl uppercase leading-none"
            style={{ color: PS_RED, textShadow: `0 0 40px ${PS_RED}59` }}
          >
            Party.San 2026
          </p>
          <p className="mx-auto mt-6 max-w-md text-base text-ash">
            Drei Tage, zwei Bühnen, eine Crew. Hol deine Leute an Bord, bevor
            Testament die Mainstage zerlegt.
          </p>
          <FestivalStartCta
            festivalId={FESTIVAL_ID}
            className="mt-8 inline-block rounded-xl px-10 py-4 font-metal text-lg uppercase tracking-wide text-black transition active:scale-[0.98]"
            style={{ background: PS_RED }}
          >
            Gruppe erstellen
          </FestivalStartCta>
          <p className="mt-3 text-xs text-ash/70">
            Kostenlos · offline-fähig · ohne Passwort
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-rivet/40">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 px-6 py-10 text-center">
          <Link href="/" aria-label="Zur Festival-Buddy-Startseite">
            <DefektLogo variant="mini" />
          </Link>
          <p className="max-w-md text-xs leading-relaxed text-ash/70">
            Festival Buddy · Timetable-Planer für die Crew – auf jedem
            Festival. Inoffizielle Fan-Seite, kein Angebot des Party.San
            Metal Open Air.
          </p>
          <p className="flex items-center justify-center gap-3 font-mono text-[9px] uppercase tracking-[0.25em] text-ash/50">
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
            © 2026 DEFƎKT — Alle Rechte defekt.
          </p>
        </div>
      </footer>
    </main>
  );
}
