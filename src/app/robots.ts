import type { MetadataRoute } from 'next';
import { resolveSiteUrl } from '@/lib/siteUrl';

/** robots.txt: Marketing-Seiten rein, Admin/API/Invite-Links raus. */
export default async function robots(): Promise<MetadataRoute.Robots> {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/app', '/gruppe', '/admin', '/api/', '/join/'],
    },
    sitemap: `${await resolveSiteUrl()}/sitemap.xml`,
  };
}
