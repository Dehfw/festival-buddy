import type { MetadataRoute } from 'next';
import { resolveSiteUrl } from '@/lib/siteUrl';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = await resolveSiteUrl();
  return [
    {
      url: `${base}/`,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${base}/partysan`,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${base}/fuer-bands`,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${base}/veranstalter`,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
  ];
}
