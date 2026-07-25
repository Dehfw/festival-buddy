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
  ];
}
