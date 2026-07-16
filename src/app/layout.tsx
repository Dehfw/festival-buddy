import type { Metadata, Viewport } from 'next';
import { UpdatePrompt } from '@/components/UpdatePrompt';
import { resolveSiteUrl } from '@/lib/siteUrl';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  return {
    metadataBase: new URL(await resolveSiteUrl()),
    title: 'DEFƎKT Festival Buddy – Wer geht zu welcher Band?',
    description:
      'Wer geht zu welcher Band? Timetable-Planer für deine Crew – auf jedem Festival.',
    manifest: '/manifest.webmanifest',
    appleWebApp: {
      capable: true,
      statusBarStyle: 'black-translucent',
      title: 'Festival Buddy',
    },
    icons: {
      icon: '/icons/icon-192.png',
      apple: '/icons/apple-touch-icon.png',
    },
  };
}

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="min-h-dvh bg-pit text-bone antialiased">
        {children}
        <UpdatePrompt />
      </body>
    </html>
  );
}
