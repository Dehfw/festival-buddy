import type { MetadataRoute } from 'next';
import { resolveSiteUrl } from '@/lib/siteUrl';

/**
 * robots.txt: Marketing-Seiten rein, Admin/API/Invite-Links raus.
 * Der Veranstalter-Bereich braucht keine eigene Regel – er liegt unter
 * "/app/veranstalter" und damit schon in der "/app"-Sperre. Die
 * öffentliche Seite "/veranstalter" bleibt dadurch indexierbar.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/app', '/gruppe', '/api/', '/join/'],
    },
    sitemap: `${await resolveSiteUrl()}/sitemap.xml`,
  };
}
