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
          '/ar/login/student',
          '/en/login/student',
        ],
        disallow: [
          '/*/login/admin',
          '/*/login/admin/*',
          '/*/admin',
          '/*/admin/*',
          '/*/student',
          '/*/student/*',
          '/*/dashboard',
          '/*/dashboard/*',
          '/api/*',
          '/_next/*',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
