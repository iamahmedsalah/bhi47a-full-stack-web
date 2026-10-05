import React from 'react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { routing } from '@/i18n/routing';
import { INSTITUTE_INFO, NEWS_ITEMS } from '@/data/institutional-data';
import { InstitutionalHeader } from '@/components/institutional/InstitutionalHeader';
import { InstitutionalFooter } from '@/components/institutional/InstitutionalFooter';
import { Calendar, Tag, ChevronRight, ChevronLeft, ArrowRight, ArrowLeft } from 'lucide-react';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === 'ar';

  return {
    title: isAr
      ? `الأخبار والإعلانات الرسمية | ${INSTITUTE_INFO.name.ar}`
      : `News & Official Announcements | ${INSTITUTE_INFO.name.en}`,
    description: isAr
      ? 'تابع أحدث البيانات والقرارات الإدارية ومواعيد التسجيل والجداول في المعهد العالي للعلوم الإدارية المتقدمة والحاسبات.'
      : 'Stay updated with official announcements, registration timelines, and academic schedules at BHI47a.',
  };
}

export default async function NewsListingPage({ params }: PageProps) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const isAr = locale === 'ar';
  const ChevronIcon = isAr ? ChevronLeft : ChevronRight;
  const ArrowIcon = isAr ? ArrowLeft : ArrowRight;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-teal-500 selection:text-white">
      <InstitutionalHeader locale={locale} />

      <main className="flex-grow">
        {/* Banner */}
        <section className="bg-slate-900/80 border-b border-slate-800 py-12 relative overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <nav className="flex items-center gap-2 text-xs text-slate-400 mb-4" aria-label="Breadcrumb">
              <Link href={`/${locale}`} className="hover:text-teal-400 transition-colors">
                {isAr ? 'الرئيسية' : 'Home'}
              </Link>
              <ChevronIcon className="w-3.5 h-3.5 text-slate-600" />
              <span className="text-teal-400 font-medium">{isAr ? 'الأخبار والإعلانات' : 'News'}</span>
            </nav>

            <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight">
              {isAr ? 'المركز الإعلامي والإعلانات الرسمية' : 'Media Center & Official Announcements'}
            </h1>
            <p className="mt-3 text-slate-300 max-w-3xl text-sm sm:text-base leading-relaxed">
              {isAr
                ? 'البيانات الرسمية وجداول التسجيل والإعلانات الصادرة عن إدارة المعهد وشؤون الطلاب.'
                : 'Official statements, registration notices, and academic releases from the BHI47a administration.'}
            </p>
          </div>
        </section>

        {/* News Grid */}
        <section className="py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {NEWS_ITEMS.map((item) => (
              <article
                key={item.id}
                className="group rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden hover:border-teal-500/40 transition-all flex flex-col shadow-lg"
              >
                {/* Image */}
                <div className="relative aspect-[16/9] w-full overflow-hidden bg-slate-800">
                  <Image
                    src={item.image}
                    alt={isAr ? item.titleAr : item.titleEn}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                  />
                  <div className="absolute top-3 start-3">
                    <span className="px-2.5 py-1 rounded-md bg-slate-950/80 backdrop-blur-md border border-slate-700/80 text-teal-300 text-xs font-semibold">
                      {isAr ? item.categoryAr : item.categoryEn}
                    </span>
                  </div>
                </div>

                {/* Content */}
                <div className="p-6 flex flex-col justify-between flex-grow">
                  <div>
                    <div className="flex items-center gap-2 text-xs text-slate-400 mb-3 font-mono">
                      <Calendar className="w-3.5 h-3.5 text-teal-400" />
                      <time dateTime={item.date}>{item.date}</time>
                    </div>

                    <h2 className="text-lg font-bold text-white group-hover:text-teal-300 transition-colors line-clamp-2 mb-3">
                      <Link href={`/${locale}/news/${item.slug}`}>
                        {isAr ? item.titleAr : item.titleEn}
                      </Link>
                    </h2>

                    <p className="text-slate-300 text-xs sm:text-sm leading-relaxed line-clamp-3 mb-4">
                      {isAr ? item.summaryAr : item.summaryEn}
                    </p>
                  </div>

                  <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between">
                    <span className="text-xs text-slate-400">
                      {isAr ? 'إدارة المعهد' : 'Institute Office'}
                    </span>
                    <Link
                      href={`/${locale}/news/${item.slug}`}
                      className="inline-flex items-center gap-1.5 text-xs text-teal-400 font-semibold group-hover:text-teal-300"
                    >
                      <span>{isAr ? 'اقرأ البيان كاملاً' : 'Read Full Post'}</span>
                      <ArrowIcon className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>

      <InstitutionalFooter locale={locale} />
    </div>
  );
}
