import type { MetadataRoute } from 'next';
import { INSTITUTE_INFO } from '@/data/institutional-data';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${INSTITUTE_INFO.nameAr} | ${INSTITUTE_INFO.nameEn}`,
    short_name: 'BHI47 Portal',
    description: 'بوابة الطالب والخدمات الأكاديمية الإلكترونية - المعهد العالي للعلوم الإدارية المتقدمة والحاسبات',
    start_url: '/ar',
    display: 'standalone',
    background_color: '#021c1c',
    theme_color: '#0f3d3d',
    lang: 'ar',
    dir: 'rtl',
    icons: [
      {
        src: '/favicon_io/favicon-48x48.png',
        sizes: '48x48',
        type: 'image/png',
      },
      {
        src: '/favicon_io/favicon-96x96.png',
        sizes: '96x96',
        type: 'image/png',
      },
      {
        src: '/favicon_io/android-chrome-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/apple-icon.png',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  };
}
