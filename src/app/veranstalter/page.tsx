import type { Metadata } from 'next';
import Link from 'next/link';
import { AppScreenshot } from '@/components/AppScreenshot';
import { DefektLogo } from '@/components/DefektLogo';
import { resolveSiteUrl } from '@/lib/siteUrl';

const TITLE = 'Festival Buddy für Veranstalter – Timetable, Bühnenpläne & Mitteilungen | DEFƎKT';
const DESCRIPTION =
  'Bring dein Festival in die App: Lineup schon vor der Running Order, Timetable, Bühnen und Bühnenpläne selbst pflegen, Mitteilungen mit Push an alle Besucher – kostenlos, ohne dass du Besucherdaten siehst.';

const CONTACT_MAILTO =
  'mailto:moin@festivalbuddy.app?subject=Festival%20Buddy%20f%C3%BCr%20unser%20Festival';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    'Festival App für Veranstalter',
    'Timetable Software Festival',
    'Running Order verwalten',
    'Festival Timetable pflegen',
    'Line-up App Veranstalter',
    'Bandankündigung Festival App',
    'Festival Push Mitteilungen',
    'Bühnenplan App',
    'Festival Buddy',
    'DEFƎKT',
  ],
  alternates: { canonical: '/veranstalter' },
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    url: '/veranstalter',
    siteName: 'DEFƎKT Festival Buddy',
    locale: 'de_DE',
    title: TITLE,
    description: DESCRIPTION,
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'Festival Buddy für Veranstalter – Timetable, Bühnenpläne und Mitteilungen selbst pflegen.',
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
    url: `${base}/veranstalter`,
    description: DESCRIPTION,
    inLanguage: 'de',
    isPartOf: { '@type': 'WebSite', name: 'DEFƎKT Festival Buddy', url: base },
  });
}

/* ------------------------------------------------------------------ */
/* Öffentliche Veranstalter-Seite (/veranstalter). Erklärt den         */
/* Veranstalter-Bereich und sammelt Anfragen per Mail ein – Zugänge    */
/* entstehen weiterhin per Einladungscode (docs/wiki/veranstalter.md). */
/* Das eigentliche Werkzeug lebt eine Ebene tiefer unter              */
/* "/veranstalter/bereich": Die merkbare URL gehört auf den Flyer,     */
/* nicht auf ein Werkzeug, das nur eine Handvoll Leute öffnet.         */
/* ------------------------------------------------------------------ */

const FEATURES: { icon: string; title: string; body: string }[] = [
  {
    icon: '📋',
    title: 'Lineup schon im Winter',
    body: 'Du musst nicht auf die Running Order warten. Sobald deine ersten Bands announced sind, kommen sie ins Lineup – dein Publikum hört rein und markiert, wen es sehen will. Die Spielzeiten reichst du später nach.',
  },
  {
    icon: '🗓️',
    title: 'Timetable im Griff',
    body: 'Tage, Bühnen und Slots legst du direkt in der App an und änderst sie jederzeit. Jede Änderung ist in Sekunden bei allen Besuchern – ohne neues PDF, ohne App-Update.',
  },
  {
    icon: '🗺️',
    title: 'Bühnenpläne & POIs',
    body: 'Pfleg zu jeder Bühne einen Grundriss: Bühne, FOH, Barrieren – plus Punkte wie WC, Wasser, Merch, Sanitäter und Ausgänge. Deine Besucher finden alles auf Anhieb.',
  },
  {
    icon: '📣',
    title: 'Mitteilungen mit Push',
    body: 'Slot verschoben, Band ausgefallen, Unwetterwarnung? Eine Mitteilung erreicht alle, die dein Festival in der App planen – auf Wunsch als Push direkt aufs Handy.',
  },
  {
    icon: '👥',
    title: 'Reichweite im Blick',
    body: 'Du siehst jederzeit, wie viele Gruppen und wie viele Leute dein Festival schon planen – als anonyme Summen, damit du ein Gefühl für die Menge bekommst.',
  },
  {
    icon: '🛡️',
    title: 'Privatsphäre eingebaut',
    body: 'Wer in welcher Gruppe steckt und wer zu welcher Band geht, bleibt privat. Du bekommst nie Namen oder Profile zu sehen – nur Zahlen.',
  },
  {
    icon: '🤝',
    title: 'Im Team pflegen',
    body: 'Mehrere Leute pro Festival: Jeder Zugang kommt per Einladungscode, dein Team arbeitet gleichzeitig am selben Timetable – Löschen warnt vorher, was dranhängt.',
  },
];

const STEPS: { n: string; title: string; body: string }[] = [
  {
    n: '01',
    title: 'Zugang anfragen',
    body: 'Schreib uns eine Mail mit Festival-Name und Termin. Wir legen dein Festival an und schicken dir deinen Einladungscode – kostenlos.',
  },
  {
    n: '02',
    title: 'Code einlösen',
    body: 'Mit Passkey anmelden wie jeder Besucher, dann den Code im Veranstalter-Bereich einlösen. Kein Extra-Konto, kein Passwort.',
  },
  {
    n: '03',
    title: 'Loslegen',
    body: 'Erst das Lineup, später Tage, Bühnen, Slots und Bühnenpläne. Deine Besucher planen ab der ersten announcten Band mit – und sehen jede Änderung sofort.',
  },
];

export default async function VeranstalterPage() {
  const structuredData = await jsonLd();
  return (
    <main className="defekt-grid min-h-dvh">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: structuredData }}
      />
      {/* Topbar */}
      <header className="steel-sheen sticky top-0 z-40">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-3.5 sm:px-6">
          <Link href="/" aria-label="Zur Startseite">
            <DefektLogo variant="mini" />
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="hidden rounded-lg border border-rivet bg-steel px-3.5 py-2 text-xs font-semibold uppercase tracking-wider text-bone transition active:scale-[0.98] sm:inline-block"
            >
              Für Crews
            </Link>
            <Link
              href="/veranstalter/bereich"
              className="rounded-lg bg-blood px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-black transition active:scale-[0.98]"
            >
              Veranstalter-Bereich
            </Link>
          </div>
        </div>
      </header>

      {/* Hero: Text + Handy-Mockup nebeneinander */}
      <section className="mx-auto max-w-5xl px-6 pt-12 pb-14 sm:pt-16 sm:pb-20">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-8">
          {/* Text */}
          <div className="text-center lg:text-left">
            <div className="mb-6 inline-flex items-center gap-2 border border-blood/20 bg-blood/5 px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.3em] text-blood">
              <span className="opacity-50">//</span> Für Veranstalter
            </div>

            <h1 className="font-metal text-5xl uppercase leading-[0.95] text-bone sm:text-6xl">
              Dein Festival.
              <br />
              Live beim{' '}
              <span
                className="text-blood"
                style={{ textShadow: '0 0 40px rgba(255,90,23,.45)' }}
              >
                Publikum.
              </span>
            </h1>

            <div className="mt-6 flex items-center justify-center gap-3 text-[13px] font-black uppercase tracking-[0.3em] text-bone lg:justify-start">
              Selbst
              <span className="inline-block h-1.5 w-8 -skew-x-12 bg-blood" />
              Verwaltet
            </div>

            <p className="mx-auto mt-7 max-w-xl text-base leading-relaxed text-ash sm:text-lg lg:mx-0">
              Festival Buddy ist der Timetable-Planer, mit dem Crews ihren
              Festivalbesuch planen. Als Veranstalter pflegst du Timetable,
              Bühnenpläne und Mitteilungen deines Festivals selbst – und dein
              Publikum ist schon dabei, bevor die Running Order steht. 🤘
            </p>

            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
              <a
                href={CONTACT_MAILTO}
                className="w-full rounded-xl bg-blood px-8 py-4 font-metal text-lg uppercase tracking-wide text-black transition active:scale-[0.98] sm:w-auto"
              >
                Zugang anfragen
              </a>
              <Link
                href="/veranstalter/bereich"
                className="w-full rounded-xl border border-rivet bg-steel px-8 py-4 text-sm font-semibold uppercase tracking-wider text-bone transition active:scale-[0.98] sm:w-auto"
              >
                Ich habe schon einen Code
              </Link>
            </div>
          </div>

          {/* Handy-Mockup: das sehen die Besucher */}
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
              So planen deine Besucher – aus dem Timetable, den du pflegst.
            </p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-rivet/40 bg-pit/60">
        <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
          <h2 className="text-center font-metal text-3xl uppercase text-bone sm:text-4xl">
            Alles für <span className="text-blood">dein Festival</span>
          </h2>
          <p className="mx-auto mt-3 max-w-md text-center text-sm text-ash">
            Kein PDF-Update, kein Aushang am Bauzaun. Ein Ort für Timetable,
            Pläne und Ansagen.
          </p>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="relative rounded-2xl border border-rivet/60 bg-steel p-7"
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

      {/* So geht's */}
      <section id="so-gehts" className="scroll-mt-20 border-t border-rivet/40">
        <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
          <h2 className="text-center font-metal text-3xl uppercase text-bone sm:text-4xl">
            In <span className="text-blood">drei Schritten</span> in der App
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
            Bring dein Festival in die App – dein Publikum plant schon. Schreib
            uns, wir legen los.
          </p>
          <a
            href={CONTACT_MAILTO}
            className="mt-8 inline-block rounded-xl bg-blood px-10 py-4 font-metal text-lg uppercase tracking-wide text-black transition active:scale-[0.98]"
          >
            Zugang anfragen
          </a>
          <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.25em] text-ash/50">
            moin@festivalbuddy.app
          </p>
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
            <Link href="/" className="underline underline-offset-2 hover:text-ash">
              Für Crews
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
