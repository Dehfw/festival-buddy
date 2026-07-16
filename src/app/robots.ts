import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/siteUrl';

/** robots.txt: Marketing-Seiten rein, Admin/API/Invite-Links raus. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/app', '/gruppe', '/admin', '/api/', '/join/'],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
