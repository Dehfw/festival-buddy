import type { Metadata } from 'next';
import Link from 'next/link';
import { DefektLogo } from '@/components/DefektLogo';
import { FireFrame } from '@/components/FireFrame';
import { LandingLogin } from '@/components/LandingLogin';
import lineupJson from '../../../data/psoa2027.json';

/** Festival-ID in der App – Vorauswahl für Login und Gruppengründung */
const FESTIVAL_ID = 'psoa2027';

/**
 * Angekündigte Bands aus der gebundelten Importdatei: Die Lineup-Watch
 * committet jede neue Welle, die Zahl auf der Seite zieht also mit dem
 * nächsten Deploy von selbst nach.
 */
const ANNOUNCED = new Set(
  (lineupJson as { bands: { name: string }[] }).bands.map((b) => b.name),
);
const BAND_COUNT = ANNOUNCED.size;

/**
 * Teaser in der Reihenfolge des offiziellen "Billing 2027"
 * (party-san.de), Schreibweisen wie in der App. Gezeigt wird nur, was
 * noch in der Importdatei steht – eine umbenannte oder gestrichene Band
 * fällt hier von selbst raus statt weiter beworben zu werden.
 */
const TEASER_TOP = ['Vader', 'Mgla', 'Nile'].filter((n) => ANNOUNCED.has(n));
const TEASER_MORE = [
  'A Tribute To Quorthon And Bathory',
  'Taake',
  'Deserted Fear',
  'Winterfylleth',
  'Primordial',
  'Bölzer',
  'Benighted',
  'Septicflesh',
].filter((n) => ANNOUNCED.has(n));
const TEASER_REST = BAND_COUNT - TEASER_TOP.length - TEASER_MORE.length;

const TITLE = 'Festival Buddy fürs Party.San Metal Open Air 2027';
const DESCRIPTION =
  'Der Timetable-Planer für deine Party.San-Crew: Wer geht zu welcher Band? ' +
  `Die ersten ${BAND_COUNT} Bands für 2027 sind schon drin – von Vader bis ` +
  'Nile. Gruppe gründen, durchhören, Bands merken; die Running Order kommt ' +
  'in die App, sobald sie steht.';

/** Deep-Link in die App: merkt das Party.San als Festival-Vorauswahl vor */
const APP_LINK = `/app?festival=${FESTIVAL_ID}`;

/**
 * Akzente in Party.San-Gold, gesampelt vom offiziellen 2026er Plakat
 * (Logo-Highlights #f0d860, Mitteltöne #d8a830, Tiefen #907830).
 * Überschriften-Highlights bekommen einen goldenen Verlauf mit warmem Glow.
 */
const GOLD_TEXT = {
  backgroundImage:
    'linear-gradient(180deg, #f7e27a 0%, #e0b038 45%, #96701c 100%)',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
  filter: 'drop-shadow(0 0 18px rgba(224,176,56,0.35))',
} as const;

const GOLD_GLOW = { textShadow: '0 0 30px rgba(224,176,56,.2)' };

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    'Party.San',
    'Party.San Metal Open Air',
    'Party.San 2027',
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
/* Alle CTAs zeigen auf /app?festival=psoa2027 – die GroupGate         */
/* überspringt damit die Festival-Auswahl und gründet die Gruppe       */
/* direkt fürs Party.San 2027. Stand der Texte: Bands angekündigt,     */
/* noch keine Running Order – steht sie, Teaser und Hinweise anpassen. */
/* ------------------------------------------------------------------ */

const FEATURES: { icon: string; title: string; body: string; hot?: boolean }[] = [
  {
    icon: '🗓️',
    title: 'Lineup jetzt, Running Order später',
    body: 'Alle angekündigten Bands durchhören und merken. Steht die Running Order, kommt sie als saubere Bühnen-Ansicht dazu – deine gemerkten Bands bleiben.',
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
    body: 'Einmal geöffnet, läuft alles auch ohne Netz weiter – genau richtig fürs Funkloch auf dem Flugplatz.',
  },
  {
    icon: '👥',
    title: 'Eine Gruppe für die Crew',
    body: 'Gruppe gründen, Code oder Link teilen, fertig. Deine Leute sind in Sekunden drin – ganz ohne Login-Wirrwarr.',
  },
  {
    icon: '🔑',
    title: 'Login, wie du willst',
    body: 'Per Passkey (Face ID / Fingerabdruck) oder klassisch mit E-Mail & Passwort – beides geht, ganz ohne Gedöns.',
  },
];

const STEPS: { n: string; title: string; body: string }[] = [
  {
    n: '01',
    title: 'Reinkommen',
    body: 'Name eintippen, dann Passkey (Face ID / Fingerabdruck) oder E-Mail & Passwort – schon bist du drin.',
  },
  {
    n: '02',
    title: 'Crew gründen',
    body: 'Das Party.San 2027 ist schon vorausgewählt – nur noch Gruppenname eintippen und den Einladungslink an deine Leute schicken.',
  },
  {
    n: '03',
    title: 'Bands merken',
    body: 'Deine Bands antippen. Alle sehen, wer auf wen Bock hat – und mit der Running Order dann, wer wohin geht und wo sich die Crew vor der Bühne trifft.',
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
            <LandingLogin preselectFestivalId={FESTIVAL_ID} />
          </div>
        </div>
      </header>

      {/* Hero: Logo groß, Claim, CTA */}
      <section className="relative mx-auto max-w-4xl px-6 pt-14 pb-16 text-center sm:pt-20 sm:pb-20">
        {/* Goldener Schein hinter dem Logo */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-24 h-64 w-[80%] -translate-x-1/2 rounded-full bg-[#d8a830]/15 blur-[110px]"
        />

        <div className="relative">
          <div className="mb-8 inline-flex items-center gap-2 border border-[#e0b038]/30 bg-[#e0b038]/10 px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.3em] text-[#f0d860]">
            <span className="opacity-50">//</span> 05.–07.08.2027 · Flugplatz
            Obermehler-Schlotheim
          </div>

          <img
            src="/partysan/psoa-logo.png"
            alt="Party.San Metal Open Air"
            className="mx-auto w-full max-w-xl select-none drop-shadow-[0_12px_40px_rgba(0,0,0,0.8)]"
          />

          <h1 className="mt-10 font-metal text-4xl uppercase leading-[0.95] text-bone sm:text-5xl">
            Wer geht zu{' '}
            <span style={GOLD_TEXT}>welcher Band?</span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-ash sm:text-lg">
            Festival Buddy ist der Timetable-Planer für deine Party.San-Crew.
            Jetzt schon das Lineup durchhören und Bands merken – und im August
            keinen Auftritt verpassen und wissen, wo sich alle treffen. 🤘
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={APP_LINK}
              className="w-full rounded-xl px-8 py-4 font-metal text-lg uppercase tracking-wide text-pit shadow-[0_0_30px_rgba(224,176,56,0.25)] transition active:scale-[0.98] sm:w-auto"
              style={{
                background: 'linear-gradient(180deg, #f0d860 0%, #d8a830 100%)',
              }}
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
            Beim Gruppengründen ist das Party.San 2027 schon ausgewählt – kein
            Festival-Gesuche. {BAND_COUNT} angekündigte Bands sind schon drin.
          </p>
        </div>
      </section>

      {/* Lineup-Teaser: Auswahl aus dem offiziellen Billing 2027 */}
      <section className="border-t border-rivet/40">
        <div className="mx-auto max-w-5xl px-6 py-14 text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#f0d860]/80">
            <span className="opacity-50">//</span> Lineup 2027 – {BAND_COUNT}{' '}
            Bands angekündigt
          </p>
          <p className="mt-6 font-metal text-3xl uppercase leading-snug text-bone sm:text-4xl">
            {TEASER_TOP.join(' · ')}
          </p>
          <p className="mt-3 font-metal text-lg uppercase leading-relaxed text-ash sm:text-xl">
            {TEASER_MORE.join(' · ')}
          </p>
          <p className="mt-4 text-xs text-ash/70">
            {TEASER_REST > 0 ? `… und ${TEASER_REST} weitere Bands – alle` : 'Alle'}{' '}
            schon in der App zum Durchhören und Merken. Die Running Order
            folgt, sobald das Party.San sie veröffentlicht.
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-rivet/40 bg-pit/60">
        <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
          <h2 className="text-center font-metal text-3xl uppercase text-bone sm:text-4xl">
            Alles fürs <span style={GOLD_TEXT}>Party.San</span>
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
            In <span style={GOLD_TEXT}>drei Schritten</span> dabei
          </h2>

          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="relative">
                <div
                  className="font-metal text-6xl leading-none text-[#e0b038]/30"
                  style={GOLD_GLOW}
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
              className="w-full rounded-xl px-10 py-4 font-metal text-lg uppercase tracking-wide text-pit shadow-[0_0_30px_rgba(224,176,56,0.25)] transition active:scale-[0.98] sm:w-auto"
              style={{
                background: 'linear-gradient(180deg, #f0d860 0%, #d8a830 100%)',
              }}
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
            Festival Buddy · Timetable-Planer für deine Party.San-Crew.
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
