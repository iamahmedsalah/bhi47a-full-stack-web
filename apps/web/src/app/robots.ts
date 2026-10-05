import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://bhi47a.edu.eg';

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
