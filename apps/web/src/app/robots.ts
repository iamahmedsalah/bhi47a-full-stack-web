import type { MetadataRoute } from 'next';
import { getSiteUrl } from '@/lib/site-url';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getSiteUrl();

  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/',
          '/ar',
          '/en',
          '/ar/about',
          '/en/about',
          '/ar/academics',
          '/en/academics',
          '/ar/activities',
          '/en/activities',
          '/ar/news',
          '/en/news',
          '/ar/events',
          '/en/events',
          '/ar/gallery',
          '/en/gallery',
          '/ar/downloads',
          '/en/downloads',
          '/ar/contact',
          '/en/contact',
        ],
        disallow: [
          '/*/login',
          '/*/admin',
          '/*/admin/*',
          '/*/student',
          '/*/student/*',
          '/*/dashboard',
          '/*/dashboard/*',
          '/*/login/*',
          '/api/*',
          '/_next/*',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
