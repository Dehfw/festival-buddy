import type { Metadata } from 'next';
import Link from 'next/link';
import { AppScreenshot } from '@/components/AppScreenshot';
import { DefektLogo } from '@/components/DefektLogo';
import { FireFrame } from '@/components/FireFrame';
import { LandingLogin } from '@/components/LandingLogin';
import { resolveSiteUrl } from '@/lib/siteUrl';

const TITLE = 'Festival Buddy – Wer geht zu welcher Band? | DEFƎKT';
const DESCRIPTION =
  'Der Timetable-Planer für deine Festival-Crew. Wer geht zu welcher Band? Gruppen gründen, Bands markieren, Hot Slots sehen – offline-fähig, ohne Passwort. Für jedes Festival.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    'Festival Buddy',
    'Festival Timetable',
    'Open Air Planer',
    'Timetable Planer',
    'Running Order',
    'Line-up Planer',
    'Festival Planer',
    'Festival App',
    'Band Planer',
    'Festival Gruppe',
    'DEFƎKT',
  ],
  alternates: { canonical: '/' },
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'DEFƎKT Festival Buddy',
    locale: 'de_DE',
    title: TITLE,
    description: DESCRIPTION,
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'Festival Buddy – Wer geht zu welcher Band? Timetable-Planer für deine Crew.',
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

/** Strukturierte Daten für Google (Rich Results): App-Steckbrief als JSON-LD */
async function jsonLd() {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'DEFƎKT Festival Buddy',
    url: await resolveSiteUrl(),
    description: DESCRIPTION,
    applicationCategory: 'LifestyleApplication',
    operatingSystem: 'Web, iOS, Android',
    inLanguage: 'de',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
  });
}

/* ------------------------------------------------------------------ */
/* Öffentliche Startseite (/). Erklärt das Produkt und schickt Leute   */
/* rein. Die eigentliche App lebt gated unter "/app".                  */
/* ------------------------------------------------------------------ */

const FEATURES: { icon: string; title: string; body: string; hot?: boolean }[] = [
  {
    icon: '🗓️',
    title: 'Timetable-Planer',
    body: 'Der komplette Running Order in einer sauberen Bühnen-Ansicht. Tippen, markieren, fertig – kein Zettel-Chaos mehr am Bauzaun.',
  },
  {
    icon: '🤘',
    title: 'Wer geht zu welcher Band?',
    body: 'Jeder markiert seine Bands. Du siehst sofort, wer wo mit dabei ist – und findest deine Leute, statt sie zu suchen.',
  },
  {
    icon: '🔥',
    title: 'Hot Slots',
    body: 'Wenn genug aus der Crew fest zusagen, fängt der Slot an zu brennen. Genau wie diese Karte – die Pflichttermine erkennst du auf einen Blick.',
    hot: true,
  },
  {
    icon: '👥',
    title: 'Gruppen für die Crew',
    body: 'Gruppe gründen, Code oder Link teilen, fertig. Kein Login-Wirrwarr – deine Leute sind in Sekunden drin.',
  },
  {
    icon: '📴',
    title: 'Läuft offline',
    body: 'Installier sie als App aufs Handy. Einmal geladen, läuft alles auch ohne Netz – genau richtig fürs Feld im Funkloch.',
  },
  {
    icon: '🔑',
    title: 'Kein Passwort',
    body: 'Login per Passkey – Face ID oder Fingerabdruck. Nichts zu merken, nichts zu vergessen, nichts zu klauen.',
  },
];

const STEPS: { n: string; title: string; body: string }[] = [
  {
    n: '01',
    title: 'Rein mit Passkey',
    body: 'Namen tippen, Face ID / Fingerabdruck – schon bist du drin. Kein Passwort, kein Account-Gedöns.',
  },
  {
    n: '02',
    title: 'Gruppe gründen oder beitreten',
    body: 'Neue Crew starten und den Link teilen, oder mit einem Code der bestehenden Gruppe beitreten.',
  },
  {
    n: '03',
    title: 'Bands markieren',
    body: 'Deine Bands antippen. Alle sehen live, wer wohin geht – und wo sich die ganze Crew trifft.',
  },
];

export default async function LandingPage() {
  const structuredData = await jsonLd();
  return (
    <main className="defekt-grid min-h-dvh">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: structuredData }}
      />
      {/* Topbar mit prominentem Login */}
      <header className="steel-sheen sticky top-0 z-40">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-3.5 sm:px-6">
          <DefektLogo variant="mini" />
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

      {/* Hero: Text + Handy-Mockup nebeneinander */}
      <section className="mx-auto max-w-5xl px-6 pt-12 pb-14 sm:pt-16 sm:pb-20">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-8">
          {/* Text */}
          <div className="text-center lg:text-left">
            <div className="mb-6 inline-flex items-center gap-2 border border-blood/20 bg-blood/5 px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.3em] text-blood">
              <span className="opacity-50">//</span> Für dein Festival
            </div>

            <h1 className="font-metal text-5xl uppercase leading-[0.95] text-bone sm:text-6xl">
              Wer geht zu
              <br />
              welcher{' '}
              <span
                className="text-blood"
                style={{ textShadow: '0 0 40px rgba(255,90,23,.45)' }}
              >
                Band?
              </span>
            </h1>

            <div className="mt-6 flex items-center justify-center gap-3 text-[13px] font-black uppercase tracking-[0.3em] text-bone lg:justify-start">
              Stramm
              <span className="inline-block h-1.5 w-8 -skew-x-12 bg-blood" />
              Geplant
            </div>

            <p className="mx-auto mt-7 max-w-xl text-base leading-relaxed text-ash sm:text-lg lg:mx-0">
              Festival Buddy ist der Timetable-Planer für deine Crew. Bands
              markieren, Hot Slots sehen, keinen Auftritt mehr verpassen – und
              endlich wissen, wo sich alle treffen. 🤘
            </p>

            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
              <Link
                href="/app"
                className="w-full rounded-xl bg-blood px-8 py-4 font-metal text-lg uppercase tracking-wide text-black transition active:scale-[0.98] sm:w-auto"
              >
                Jetzt loslegen
              </Link>
              <a
                href="#so-gehts"
                className="w-full rounded-xl border border-rivet bg-steel px-8 py-4 text-sm font-semibold uppercase tracking-wider text-bone transition active:scale-[0.98] sm:w-auto"
              >
                So geht's
              </a>
            </div>
          </div>

          {/* Handy-Mockup */}
          <div className="relative">
            {/* Orange-Glut hinter dem Handy */}
            <div
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-1/2 h-[70%] w-[70%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blood/20 blur-[90px]"
            />
            <div className="relative">
              <AppScreenshot />
            </div>
            <p className="mt-5 text-center text-xs text-ash/70">
              So sieht euer Crew-Plan aus – die brennende Karte ist ein Hot Slot.
            </p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-rivet/40 bg-pit/60">
        <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
          <h2 className="text-center font-metal text-3xl uppercase text-bone sm:text-4xl">
            Alles fürs <span className="text-blood">Festival</span>
          </h2>
          <p className="mx-auto mt-3 max-w-md text-center text-sm text-ash">
            Kein Excel, kein Gruppenchat-Scrollen. Ein Ort für die ganze Crew.
          </p>

          {/* Einzelkarten mit Abstand statt geteiltem Grid: der Feuerrahmen
              der Hot-Slot-Karte ragt nach oben hinaus und darf nicht von
              einem overflow-hidden-Container abgeschnitten werden */}
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className={`relative rounded-2xl border bg-steel p-7 ${
                  f.hot ? 'border-blood/40' : 'border-rivet/60'
                }`}
              >
                {f.hot && <FireFrame className="inset-0 rounded-2xl" />}
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

      {/* So geht's */}
      <section
        id="so-gehts"
        className="scroll-mt-20 border-t border-rivet/40"
      >
        <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
          <h2 className="text-center font-metal text-3xl uppercase text-bone sm:text-4xl">
            In <span className="text-blood">drei Schritten</span> dabei
          </h2>

          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="relative">
                <div
                  className="font-metal text-6xl leading-none text-blood/25"
                  style={{ textShadow: '0 0 30px rgba(255,90,23,.15)' }}
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

      {/* CTA */}
      <section className="border-t border-rivet/40 bg-pit/60">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center">
          <DefektLogo variant="hero" />
          <p className="mx-auto mt-6 max-w-md text-base text-ash">
            Kein Auftritt verpasst, keiner verloren im Getümmel. Hol deine Crew
            an Bord.
          </p>
          <Link
            href="/app"
            className="mt-8 inline-block rounded-xl bg-blood px-10 py-4 font-metal text-lg uppercase tracking-wide text-black transition active:scale-[0.98]"
          >
            Festival Buddy starten
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-rivet/40">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 px-6 py-10 text-center">
          <DefektLogo variant="mini" />
          <p className="max-w-md text-xs leading-relaxed text-ash/70">
            Festival Buddy · Timetable-Planer für die Crew – auf jedem Festival.
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
