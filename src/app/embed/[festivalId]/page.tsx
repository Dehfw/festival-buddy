import type { Metadata } from 'next';
import { EmbedTimetable } from '@/components/EmbedTimetable';
import { getTimetable } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Öffentliches Website-Embed: Veranstalter binden diese Seite per iframe
 * (bequem über public/embed.js) auf ihrer Festival-Website ein. Nur
 * Festival-Daten, kein Login – und per CSP-Ausnahme in next.config.mjs
 * die einzige Route der App, die fremde Seiten framen dürfen.
 *
 * noindex: Die Seite ist ein Baustein für fremde Websites, kein eigenes
 * Suchergebnis – die App-Landingpages bleiben die kanonischen Einstiege.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ festivalId: string }>;
}): Promise<Metadata> {
  const { festivalId } = await params;
  const timetable = await getTimetable(festivalId);
  const name = timetable ? `${timetable.festival} ${timetable.edition}`.trim() : 'Festival';
  return {
    title: `${name} – Timetable | Festival Buddy`,
    robots: { index: false, follow: false },
  };
}

export default async function EmbedPage({
  params,
  searchParams,
}: {
  params: Promise<{ festivalId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { festivalId } = await params;
  const timetable = await getTimetable(festivalId);
  const autoHeight = (await searchParams).height === 'auto';

  if (!timetable) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-6 text-center text-sm text-ash">
        Dieses Festival gibt es (noch) nicht.
      </main>
    );
  }

  return (
    <EmbedTimetable festivalId={festivalId} initial={timetable} autoHeight={autoHeight} />
  );
}
