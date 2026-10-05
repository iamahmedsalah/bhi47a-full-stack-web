import type { MetadataRoute } from 'next';
import { NEWS_ITEMS } from '@/data/institutional-data';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://bhi47a.edu.eg';
  const locales = ['ar', 'en'];

  const staticRoutes = [
    '',
    '/about',
    '/academics',
    '/activities',
    '/news',
    '/events',
    '/gallery',
    '/downloads',
    '/contact',
  ];

  const sitemapEntries: MetadataRoute.Sitemap = [];

  for (const locale of locales) {
    for (const route of staticRoutes) {
      sitemapEntries.push({
        url: `${baseUrl}/${locale}${route}`,
        lastModified: new Date(),
        changeFrequency: route === '' || route === '/news' ? 'daily' : 'weekly',
        priority: route === '' ? 1.0 : route === '/academics' || route === '/about' ? 0.9 : 0.8,
        alternates: {
          languages: {
            ar: `${baseUrl}/ar${route}`,
            en: `${baseUrl}/en${route}`,
          },
        },
      });
    }

    // Dynamic news items
    for (const item of NEWS_ITEMS) {
      sitemapEntries.push({
        url: `${baseUrl}/${locale}/news/${item.slug}`,
        lastModified: new Date(item.date),
        changeFrequency: 'monthly',
        priority: 0.7,
        alternates: {
          languages: {
            ar: `${baseUrl}/ar/news/${item.slug}`,
            en: `${baseUrl}/en/news/${item.slug}`,
          },
        },
      });
    }
  }

  return sitemapEntries;
}
