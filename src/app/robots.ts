import type { MetadataRoute } from 'next';
import { resolveSiteUrl } from '@/lib/siteUrl';

/**
 * robots.txt: Marketing-Seiten rein, Admin/API/Invite-Links raus.
 * "/veranstalter/" mit Schrägstrich sperrt nur den Veranstalter-Bereich
 * darunter – die öffentliche Seite "/veranstalter" bleibt indexierbar.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/app', '/gruppe', '/veranstalter/', '/api/', '/join/'],
    },
    sitemap: `${await resolveSiteUrl()}/sitemap.xml`,
  };
}
