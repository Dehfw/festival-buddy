import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Liefert den Service Worker unter /sw.js aus und stempelt eine pro Deploy
 * eindeutige Version ein (SW_VERSION aus next.config.mjs, i. d. R. der
 * Git-Kurz-SHA). Weil sich der Datei-Inhalt dadurch bei jedem Deploy ändert,
 * erkennt der Browser den neuen Service Worker zuverlässig – die Grundlage
 * für den Update-Hinweis in der App.
 *
 * Wird beim Build statisch erzeugt; die no-store-Header (siehe
 * next.config.mjs) sorgen dafür, dass der Browser /sw.js nie lange cacht.
 */
export const dynamic = 'force-static';

export async function GET() {
  const template = await readFile(
    join(process.cwd(), 'src/sw.template.js'),
    'utf8'
  );
  const version = process.env.SW_VERSION || 'dev';
  const body = template.replace(/__SW_VERSION__/g, version);

  return new Response(body, {
    headers: {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Service-Worker-Allowed': '/',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}
