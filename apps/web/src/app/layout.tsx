import type { Metadata, Viewport } from 'next';
import { getSiteUrl } from '@/lib/site-url';
import { INSTITUTE_INFO } from '@/data/institutional-data';
import './globals.css';

const siteUrl = getSiteUrl();

export const viewport: Viewport = {
  themeColor: '#0f3d3d',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${INSTITUTE_INFO.nameAr} | بوابة الطالب والخدمات الأكاديمي`,
    template: `%s | ${INSTITUTE_INFO.nameAr} (47)`,
  },
  description:
    'البوابة الإلكترونية الرسمية المعتمدة للمعهد العالي للعلوم الإدارية المتقدمة والحاسبات (كود التنسيق 47 أ) - خدمات الطلاب الأكاديمية، نتائج الامتحانات، الجداول الدراسية، المحاضرات، ومنظومة الدعم والتواصل.',
  applicationName: 'بوابة المعهد العالي للعلوم الإدارية والحاسبات (BHI47)',
  authors: [{ name: INSTITUTE_INFO.nameEn, url: siteUrl }],
  creator: INSTITUTE_INFO.nameAr,
  publisher: INSTITUTE_INFO.nameAr,
  category: 'education',
  keywords: [
    'المعهد العالي للعلوم الإدارية المتقدمة والحاسبات',
    'المعهد العالي للعلوم الادارية المتقدمة والحاسبات',
    'كود 47',
    'معهد 47',
    'تنسيق المعاهد العليا',
    'شعبة نظم معلومات الأعمال',
    'نظم معلومات إدارية',
    'شعبة محاسبة ومراجعة',
    'علوم إدارية ومصرفية',
    'بوابة الطالب الإلكترونية',
    'نتائج امتحانات المعهد العالي',
    'BHI47',
    'BHI47a',
    'High Institute for Advanced Management Sciences and Computer',
    'Student Portal',
  ],
  alternates: {
    canonical: siteUrl,
    languages: {
      ar: `${siteUrl}/ar`,
      en: `${siteUrl}/en`,
      'x-default': `${siteUrl}/ar`,
    },
  },
  openGraph: {
    title: `${INSTITUTE_INFO.nameAr} | بوابة الطالب الإلكترونية`,
    description:
      'البوابة الإلكترونية الرسمية المعتمدة للمعهد العالي للعلوم الإدارية المتقدمة والحاسبات (كود 47 أ) - خدمات الطلاب الأكاديمية، نتائج الامتحانات، والدعم الجامعي.',
    url: siteUrl,
    siteName: INSTITUTE_INFO.nameAr,
    locale: 'ar_EG',
    type: 'website',
    images: [
      {
        url: '/images/og-preview.png',
        width: 1200,
        height: 630,
        alt: `${INSTITUTE_INFO.nameAr} - كود 47 أ`,
        type: 'image/png',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${INSTITUTE_INFO.nameAr} | Student Portal (BHI47)`,
    description:
      'البوابة الإلكترونية المعتمدة للمعهد العالي للعلوم الإدارية المتقدمة والحاسبات (كود 47 أ).',
    images: ['/images/og-preview.png'],
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon_io/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon_io/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/icon.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
      { url: '/favicon_io/maskable-icon.png', sizes: '512x512', type: 'image/png' },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
