import type { Metadata } from 'next';
import Link from 'next/link';
import { DefektLogo } from '@/components/DefektLogo';
import { FireFrame } from '@/components/FireFrame';
import { LandingLogin } from '@/components/LandingLogin';

const TITLE = 'Festival Buddy fürs Party.San Metal Open Air 2026';
const DESCRIPTION =
  'Der Timetable-Planer für deine Party.San-Crew: Wer geht zu welcher Band? ' +
  'Gruppe gründen – das Party.San 2026 ist schon vorausgewählt. Bands ' +
  'markieren, Hot Slots sehen, läuft auch offline auf dem Flugplatz.';

/** Deep-Link in die App: merkt das Party.San als Festival-Vorauswahl vor */
const APP_LINK = '/app?festival=psoa2026';

/**
 * Akzente monochrom in Silber/Bone – wie das Party.San-Logo selbst
 * (die PSD kennt nur Schwarz, Grau und Weiß). Überschriften-Highlights
 * bekommen einen metallischen Verlauf mit weichem weißen Glow.
 */
const SILVER_TEXT = {
  backgroundImage:
    'linear-gradient(180deg, #ffffff 0%, #d9d6cf 45%, #8f8c86 100%)',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
  filter: 'drop-shadow(0 0 18px rgba(244,241,234,0.3))',
} as const;

const BONE_GLOW = { textShadow: '0 0 30px rgba(244,241,234,.15)' };

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    'Party.San',
    'Party.San Metal Open Air',
    'Party.San 2026',
    'PSOA',
    'Festival Buddy',
    'Festival Timetable',
    'Running Order',
    'Timetable Planer',
    'Festival Planer',
    'Obermehler',
    'Schlotheim',
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
        url: '/partysan/og.png',
        width: 1200,
        height: 630,
        alt: 'Party.San Metal Open Air – Festival Buddy, der Timetable-Planer für deine Crew.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: ['/partysan/og.png'],
  },
};

/* ------------------------------------------------------------------ */
/* Party.San-Landingpage (/partysan): eigene Startseite für PSOA-Crews.*/
/* Alle CTAs zeigen auf /app?festival=psoa2026 – die GroupGate         */
/* überspringt damit die Festival-Auswahl und gründet die Gruppe       */
/* direkt fürs Party.San 2026.                                         */
/* ------------------------------------------------------------------ */

const FEATURES: { icon: string; title: string; body: string; hot?: boolean }[] = [
  {
    icon: '🗓️',
    title: 'Running Order im Griff',
    body: 'Die komplette Running Order in einer sauberen Bühnen-Ansicht. Tippen, markieren, fertig – kein Zettelchaos zwischen Zelt und Infield.',
  },
  {
    icon: '🤘',
    title: 'Wer geht zu welcher Band?',
    body: 'Jeder markiert seine Bands. Du siehst sofort, wer mit vorne dabei ist – und findest deine Leute, statt sie zu suchen.',
  },
  {
    icon: '🔥',
    title: 'Hot Slots',
    body: 'Wenn genug aus der Crew fest zusagen, fängt der Slot an zu brennen. Genau wie diese Karte – die Pflichttermine erkennst du auf einen Blick.',
    hot: true,
  },
  {
    icon: '📴',
    title: 'Läuft offline',
    body: 'Als App aufs Handy installieren – einmal geladen, läuft alles auch ohne Netz. Genau richtig fürs Funkloch auf dem Flugplatz.',
  },
  {
    icon: '👥',
    title: 'Eine Gruppe für die Crew',
    body: 'Gruppe gründen, Code oder Link teilen, fertig. Deine Leute sind in Sekunden drin – ganz ohne Login-Wirrwarr.',
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
    title: 'Crew gründen',
    body: 'Das Party.San 2026 ist schon vorausgewählt – nur noch Gruppenname eintippen und den Einladungslink an deine Leute schicken.',
  },
  {
    n: '03',
    title: 'Bands markieren',
    body: 'Deine Bands antippen. Alle sehen live, wer wohin geht – und wo sich die ganze Crew vor der Bühne trifft.',
  },
];

export default function PartySanLandingPage() {
  return (
    <main className="defekt-grid min-h-dvh">
      {/* Topbar mit prominentem Login (merkt das Party.San als Vorauswahl) */}
      <header className="steel-sheen sticky top-0 z-40">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-3 sm:px-6">
          <Link href="/partysan" className="shrink-0">
            <img
              src="/partysan/psoa-logo.png"
              alt="Party.San Metal Open Air"
              className="h-9 w-auto select-none"
            />
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href={APP_LINK}
              className="hidden rounded-lg border border-rivet bg-steel px-3.5 py-2 text-xs font-semibold uppercase tracking-wider text-bone transition active:scale-[0.98] sm:inline-block"
            >
              App öffnen
            </Link>
            <LandingLogin preselectFestivalId="psoa2026" />
          </div>
        </div>
      </header>

      {/* Hero: Logo groß, Claim, CTA */}
      <section className="relative mx-auto max-w-4xl px-6 pt-14 pb-16 text-center sm:pt-20 sm:pb-20">
        {/* Silbriger Schein hinter dem Logo */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-24 h-64 w-[80%] -translate-x-1/2 rounded-full bg-bone/10 blur-[110px]"
        />

        <div className="relative">
          <div className="mb-8 inline-flex items-center gap-2 border border-bone/25 bg-bone/5 px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.3em] text-bone/80">
            <span className="opacity-50">//</span> 06.–08.08.2026 · Flugplatz
            Obermehler-Schlotheim
          </div>

          <img
            src="/partysan/psoa-logo.png"
            alt="Party.San Metal Open Air"
            className="mx-auto w-full max-w-xl select-none drop-shadow-[0_12px_40px_rgba(0,0,0,0.8)]"
          />

          <h1 className="mt-10 font-metal text-4xl uppercase leading-[0.95] text-ash sm:text-5xl">
            Wer geht zu{' '}
            <span style={SILVER_TEXT}>welcher Band?</span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-ash sm:text-lg">
            Festival Buddy ist der Timetable-Planer für deine Party.San-Crew.
            Bands markieren, Hot Slots sehen, keinen Auftritt verpassen – und
            endlich wissen, wo sich alle treffen. 🤘
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={APP_LINK}
              className="w-full rounded-xl bg-bone px-8 py-4 font-metal text-lg uppercase tracking-wide text-pit shadow-[0_0_30px_rgba(244,241,234,0.15)] transition active:scale-[0.98] sm:w-auto"
            >
              Party.San-Crew starten
            </Link>
            <a
              href="#so-gehts"
              className="w-full rounded-xl border border-rivet bg-steel px-8 py-4 text-sm font-semibold uppercase tracking-wider text-bone transition active:scale-[0.98] sm:w-auto"
            >
              So geht&apos;s
            </a>
          </div>
          <p className="mt-4 text-xs text-ash/70">
            Beim Gruppengründen ist das Party.San 2026 schon ausgewählt – kein
            Festival-Gesuche. Sobald die Running Order draußen ist, landet sie
            direkt in der App.
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-rivet/40 bg-pit/60">
        <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
          <h2 className="text-center font-metal text-3xl uppercase text-bone sm:text-4xl">
            Alles fürs <span style={SILVER_TEXT}>Party.San</span>
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
      <section id="so-gehts" className="scroll-mt-20 border-t border-rivet/40">
        <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
          <h2 className="text-center font-metal text-3xl uppercase text-bone sm:text-4xl">
            In <span style={SILVER_TEXT}>drei Schritten</span> dabei
          </h2>

          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="relative">
                <div
                  className="font-metal text-6xl leading-none text-bone/25"
                  style={BONE_GLOW}
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
          <img
            src="/partysan/psoa-logo.png"
            alt="Party.San Metal Open Air"
            className="mx-auto w-72 max-w-full select-none"
          />
          <p className="mx-auto mt-6 max-w-md text-base text-ash">
            Drei Tage Vollgas auf dem Flugplatz – und deine Crew weiß immer,
            wer wo steht. Hol deine Leute an Bord.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={APP_LINK}
              className="w-full rounded-xl bg-bone px-10 py-4 font-metal text-lg uppercase tracking-wide text-pit shadow-[0_0_30px_rgba(244,241,234,0.15)] transition active:scale-[0.98] sm:w-auto"
            >
              Jetzt Crew gründen
            </Link>
            <Link
              href="/app"
              className="w-full rounded-xl border border-rivet bg-steel px-8 py-4 text-sm font-semibold uppercase tracking-wider text-bone transition active:scale-[0.98] sm:w-auto"
            >
              Ich hab schon einen Code
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-rivet/40">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 px-6 py-10 text-center">
          <DefektLogo variant="mini" />
          <p className="max-w-md text-xs leading-relaxed text-ash/70">
            Festival Buddy ist ein unabhängiges Fan-Projekt und kein Angebot
            des Veranstalters. Das Party.San-Logo gehört dem Party.San Metal
            Open Air.
          </p>
          <p className="flex items-center justify-center gap-3 font-mono text-[9px] uppercase tracking-[0.25em] text-ash/50">
            <Link href="/" className="underline underline-offset-2 hover:text-ash">
              Festival Buddy
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
            © 2026 DEFƎKT — Alle Rechte defekt.
          </p>
        </div>
      </footer>
    </main>
  );
}
