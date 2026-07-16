import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/siteUrl';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  return [
    {
      url: `${base}/landing`,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${base}/`,
      changeFrequency: 'weekly',
      priority: 0.6,
    },
  ];
}
