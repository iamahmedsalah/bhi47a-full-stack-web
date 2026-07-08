'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Home } from 'lucide-react';

export default function NotFound() {
  const params = useParams();
  const locale = (params.locale as string) || 'ar';
  const isAr = locale === 'ar';

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <section className="w-full max-w-md rounded-lg border border-white/5 bg-card/95 p-8 text-center shadow-[var(--shadow-glow)] backdrop-blur-sm">
        <div className="flex flex-col items-center gap-6">
          <Image
            src="/logo.webp"
            alt="Institute Logo"
            width={128}
            height={128}
            className="h-32 w-32 rounded-full object-contain shadow-[var(--shadow-glow)]"
            priority
          />

          <div>
            <h1 className="mb-4 text-6xl font-bold text-foreground">404</h1>
            <p className="mb-2 text-2xl font-semibold text-foreground">
              {isAr ? 'الصفحة غير موجودة' : 'Page not found'}
            </p>
            <p className="text-sm leading-6 text-muted">
              {isAr
                ? 'الصفحة التي تحاول الوصول إليها غير متاحة.'
                : 'The page you are trying to reach is not available.'}
            </p>
          </div>

          <Link
            href={`/${locale}/login`}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
          >
            <Home className="h-4 w-4" />
            {isAr ? 'الرجوع إلى الصفحة الرئيسية' : 'Back to home'}
          </Link>
        </div>
      </section>
    </main>
  );
}
