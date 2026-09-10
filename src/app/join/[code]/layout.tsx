import type { Metadata } from 'next';
import { loadInvitePreview } from './preview';

/**
 * Metadaten für die Link-Vorschau des Einladungslinks (WhatsApp, Signal,
 * Telegram …): Gruppenname und Festival stehen im Titel/Text, das Bild
 * kommt aus opengraph-image.tsx daneben. Die Seite selbst ist eine
 * Client-Komponente, deshalb liegen die Metadaten hier im Layout.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const preview = await loadInvitePreview(code);

  const title = preview
    ? `Einladung zu „${preview.name}“ – ${preview.festivalName}`
    : 'Einladung zu einer Festival-Gruppe';
  const description = preview
    ? `Mach mit bei „${preview.name}“ auf dem ${preview.festivalName}: ${
        preview.memberCount === 1
          ? '1 Person ist'
          : `${preview.memberCount} Leute sind`
      } schon dabei. Link öffnen, Bands markieren, gemeinsam den Timetable planen.`
    : 'Du wurdest in eine Festival-Gruppe eingeladen. Link öffnen, Bands markieren, gemeinsam den Timetable planen.';

  return {
    title: `${title} | Festival Buddy`,
    description,
    // Einladungslinks sind privat – nichts für Suchmaschinen.
    robots: { index: false, follow: false },
    openGraph: {
      type: 'website',
      siteName: 'DEFƎKT Festival Buddy',
      locale: 'de_DE',
      url: `/join/${code}`,
      title,
      description,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default function JoinLayout({ children }: { children: React.ReactNode }) {
  return children;
}
