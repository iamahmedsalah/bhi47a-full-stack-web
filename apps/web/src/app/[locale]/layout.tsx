import type { Metadata } from 'next';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { AppQueryProvider } from '@/lib/query-client';
import { Toaster as SonnerToaster } from '@/components/ui/sonner';
import { LanguageProvider } from '@/providers/language-provider';
import { ThemeProvider } from '@/providers/theme-provider';
import { NetworkStatusOverlay } from '@/components/ui/NetworkStatusOverlay';
import { AuthProvider } from '@/providers/auth-provider';
import { MaterialUploadProvider } from '@/features/courses/material-upload-provider';
import { ConsoleBanner } from '@/providers/console-banner';
import { getSiteUrl } from '@/lib/site-url';
import { INSTITUTE_INFO } from '@/data/institutional-data';
import { THEME_COLORS } from '@/lib/theme-colors';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === 'ar';
  const siteUrl = getSiteUrl();

  const titleDefault = isAr
    ? `${INSTITUTE_INFO.nameAr} | بوابة الطالب والخدمات الأكاديمية (47 ك)`
    : `${INSTITUTE_INFO.nameEn} | Student & Academic Portal (BHI47)`;

  const titleTemplate = isAr
    ? `%s | ${INSTITUTE_INFO.nameAr} (47 ك)`
    : `%s | ${INSTITUTE_INFO.nameEn} (BHI47)`;

  const description = isAr
    ? 'البوابة الإلكترونية المعتمدة للمعهد العالي للعلوم الإدارية المتقدمة والحاسبات (كود التنسيق 47 ك) - خدمات الطلاب الأكاديمية، نتائج الامتحانات، الجداول الدراسية، والبريد الأكاديمي.'
    : 'Official Student & Academic Portal for High Institute for Advanced Management Sciences and Computer (BHI47, Coordination Code 47/A) - Student Records, Schedules, Results, and LMS.';

  return {
    metadataBase: new URL(siteUrl),
    title: {
      default: titleDefault,
      template: titleTemplate,
    },
    description,
    alternates: {
      canonical: `${siteUrl}/${locale}`,
      languages: {
        ar: `${siteUrl}/ar`,
        en: `${siteUrl}/en`,
        'x-default': `${siteUrl}/ar`,
      },
    },
    openGraph: {
      title: titleDefault,
      description,
      url: `${siteUrl}/${locale}`,
      siteName: isAr ? INSTITUTE_INFO.nameAr : INSTITUTE_INFO.nameEn,
      locale: isAr ? 'ar_EG' : 'en_US',
      alternateLocale: isAr ? ['en_US'] : ['ar_EG'],
      type: 'website',
      images: [
        {
          url: '/images/og-preview.png',
          width: 1200,
          height: 630,
          alt: isAr ? INSTITUTE_INFO.nameAr : INSTITUTE_INFO.nameEn,
          type: 'image/png',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: titleDefault,
      description,
      images: ['/images/og-preview.png'],
    },
  };
}

const themeInitScript = `
(() => {
  try {
    const storedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = storedTheme === 'light' || storedTheme === 'dark' || storedTheme === 'system'
      ? storedTheme
      : 'system';
    const resolvedTheme = theme === 'system' ? (prefersDark ? 'dark' : 'light') : theme;
    document.documentElement.setAttribute('data-theme', resolvedTheme);
    document.documentElement.style.colorScheme = resolvedTheme;
    document.documentElement.classList.remove('dark');
    const head = document.head;
    if (head) {
      const existing = head.querySelector('meta[name="theme-color"][data-theme-override="true"]');
      if (theme === 'system') {
        if (existing) existing.remove();
      } else {
        const color = resolvedTheme === 'dark' ? '${THEME_COLORS.dark}' : '${THEME_COLORS.light}';
        const meta = existing || document.createElement('meta');
        meta.setAttribute('name', 'theme-color');
        meta.setAttribute('data-theme-override', 'true');
        meta.setAttribute('content', color);
        if (!existing) head.prepend(meta);
      }
    }
  } catch {
    document.documentElement.setAttribute('data-theme', 'light');
    document.documentElement.style.colorScheme = 'light';
  }
})();
`;

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const messages = (await import(`@/messages/${locale}.json`)).default;
  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  const fontClass = locale === 'ar' ? 'font-cairo' : 'font-dmsans';

  return (
    <html lang={locale} dir={dir} data-theme="light" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <script
          id="theme-init"
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
        />
      </head>
      <body className={`min-h-screen ${fontClass}`}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <AppQueryProvider>
            {process.env.NODE_ENV !== 'production' && <ConsoleBanner />}
            <LanguageProvider>
              <ThemeProvider>
                <AuthProvider locale={locale}>
                  <MaterialUploadProvider locale={locale}>{children}</MaterialUploadProvider>
                </AuthProvider>
                <NetworkStatusOverlay locale={locale} />
                <SonnerToaster />
              </ThemeProvider>
            </LanguageProvider>
          </AppQueryProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
