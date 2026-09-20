import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { AppQueryProvider } from '@/lib/query-client';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as SonnerToaster } from '@/components/ui/sonner';
import { LanguageProvider } from '@/providers/language-provider';
import { ThemeProvider } from '@/providers/theme-provider';
import { NetworkStatusOverlay } from '@/components/ui/NetworkStatusOverlay';
import { AuthProvider } from '@/providers/auth-provider';
import { ConsoleBanner } from '@/providers/console-banner';

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
        <link rel="icon" href="/favicon_io/favicon.ico" sizes="any" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon_io/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon_io/favicon-16x16.png" />
        <link rel="apple-touch-icon" href="/favicon_io/maskable-icon.png" />
        <script id="theme-init">{themeInitScript}</script>
      </head>
      <body className={`min-h-screen ${fontClass}`}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <AppQueryProvider>
            <ConsoleBanner />
            <LanguageProvider>
              <ThemeProvider>
                <AuthProvider locale={locale}>
                  {children}
                </AuthProvider>
                <NetworkStatusOverlay locale={locale} />
                <Toaster />
                <SonnerToaster />
              </ThemeProvider>
            </LanguageProvider>
          </AppQueryProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
