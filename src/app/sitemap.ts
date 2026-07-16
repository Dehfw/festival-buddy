import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/siteUrl';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  return [
    {
      url: `${base}/`,
      changeFrequency: 'weekly',
      priority: 1,
    },
  ];
}
