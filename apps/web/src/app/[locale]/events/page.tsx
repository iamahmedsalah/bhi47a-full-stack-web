import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { routing } from '@/i18n/routing';
import { INSTITUTE_INFO, EVENTS } from '@/data/institutional-data';
import { InstitutionalHeader } from '@/components/institutional/InstitutionalHeader';
import { InstitutionalFooter } from '@/components/institutional/InstitutionalFooter';
import { Calendar, Clock, MapPin, ChevronRight, ChevronLeft, CalendarDays } from 'lucide-react';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === 'ar';

  return {
    title: isAr
      ? `الفعاليات والمؤتمرات الأكاديمية | ${INSTITUTE_INFO.name.ar}`
      : `Events & Academic Conferences | ${INSTITUTE_INFO.name.en}`,
    description: isAr
      ? 'جدول الفعاليات الأكاديمية والندوات وورش العمل والملتقيات التوظيفية في المعهد العالي للعلوم الإدارية المتقدمة والحاسبات.'
      : 'Academic events, workshops, career fairs, and seminars schedule at BHI47a.',
  };
}

export default async function EventsPage({ params }: PageProps) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const isAr = locale === 'ar';
  const ChevronIcon = isAr ? ChevronLeft : ChevronRight;

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
              <span className="text-teal-400 font-medium">{isAr ? 'الفعاليات' : 'Events'}</span>
            </nav>

            <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight">
              {isAr ? 'أجندة الفعاليات والمؤتمرات' : 'Events & Seminars Calendar'}
            </h1>
            <p className="mt-3 text-slate-300 max-w-3xl text-sm sm:text-base leading-relaxed">
              {isAr
                ? 'الملتقيات العلمية، ورش العمل التطبيقية، والندوات الثقافية والمهنية المقامة بالحرم الجامعي للمعهد.'
                : 'Upcoming conferences, industry workshops, and seminars hosted on the BHI47a campus.'}
            </p>
          </div>
        </section>

        {/* Events List */}
        <section className="py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="space-y-6">
            {EVENTS.map((event) => (
              <div
                key={event.id}
                className="p-6 sm:p-8 rounded-2xl bg-slate-900 border border-slate-800 hover:border-teal-500/40 transition-all flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6"
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
                  {/* Date Badge */}
                  <div className="shrink-0 w-24 h-24 rounded-2xl bg-teal-500/10 border border-teal-500/30 flex flex-col items-center justify-center text-center p-2">
                    <CalendarDays className="w-5 h-5 text-teal-400 mb-1" />
                    <span className="text-xs font-mono font-bold text-teal-300">{event.date}</span>
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-teal-300 text-xs font-medium">
                        {isAr ? event.categoryAr : event.categoryEn}
                      </span>
                    </div>

                    <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">
                      {isAr ? event.titleAr : event.titleEn}
                    </h2>

                    <p className="text-slate-300 text-xs sm:text-sm max-w-2xl leading-relaxed mb-4">
                      {isAr ? event.descriptionAr : event.descriptionEn}
                    </p>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-teal-400" />
                        <span>{isAr ? event.timeAr : event.timeEn}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-teal-400" />
                        <span>{isAr ? event.locationAr : event.locationEn}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="shrink-0 w-full lg:w-auto pt-4 lg:pt-0 border-t lg:border-t-0 border-slate-800 flex justify-end">
                  <span className="px-4 py-2 rounded-squircle bg-slate-800 text-slate-300 text-xs font-semibold">
                    {isAr ? 'حضور حر للطلاب' : 'Open for Students'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <InstitutionalFooter locale={locale} />
    </div>
  );
}
