import React from 'react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { routing } from '@/i18n/routing';
import { INSTITUTE_INFO, ACTIVITIES, GALLERY_ITEMS } from '@/data/institutional-data';
import { InstitutionalHeader } from '@/components/institutional/InstitutionalHeader';
import { InstitutionalFooter } from '@/components/institutional/InstitutionalFooter';
import {
  Trophy,
  ChevronRight,
  ChevronLeft,
  Users,
  CheckCircle,
  Camera,
} from 'lucide-react';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === 'ar';

  return {
    title: isAr
      ? `الأنشطة الطلابية ومعرض الصور | ${INSTITUTE_INFO.nameAr}`
      : `Student Activities & Campus Photo Gallery | ${INSTITUTE_INFO.nameEn}`,
    description: isAr
      ? 'استكشف الأنشطة الطلابية والنوادي العلمية والرياضية والثقافية وجولة مصورة عالية الجودة في معامل وحرم المعهد.'
      : 'Explore student activities, tech clubs, sports tournaments, and high-resolution campus photo gallery at BHI47a.',
  };
}

export default async function ActivitiesPage({ params }: PageProps) {
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
              <span className="text-teal-400 font-medium">
                {isAr ? 'الأنشطة الطلابية والمعرض' : 'Activities & Gallery'}
              </span>
            </nav>

            <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight">
              {isAr ? 'الأنشطة الطلابية ومعرض الحرم والمرافق' : 'Student Activities & Campus Photo Gallery'}
            </h1>
            <p className="mt-3 text-slate-300 max-w-3xl text-sm sm:text-base leading-relaxed">
              {isAr
                ? 'تهدف إدارة رعاية الشباب بالمعهد إلى صقل مواهب الطلاب وبناء شخصياتهم القيادية، وتوفر بيئة تعليمية ومعامل متطورة ومساحات خضراء محفزة على الإبداع.'
                : 'Empowering students through extracurricular excellence, competitive tournaments, modern computing laboratories, and an inspiring academic campus.'}
            </p>
          </div>
        </section>

        {/* 1. Student Activities Showcase */}
        <section className="py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/30 text-teal-300 text-xs font-semibold mb-2">
              <Users className="w-3.5 h-3.5" />
              <span>{isAr ? 'الأندية واللجان الطلابية' : 'Student Clubs & Committees'}</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white">
              {isAr ? 'مجالات الأنشطة ورعاية الشباب' : 'Extracurricular & Athletics Programs'}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {ACTIVITIES.map((activity) => (
              <div
                key={activity.id}
                className="group flex flex-col overflow-hidden rounded-2xl bg-slate-900 border border-slate-800 hover:border-teal-500/40 transition-all shadow-md hover:shadow-xl"
              >
                {/* Real Image Header */}
                <div className="relative h-52 w-full overflow-hidden bg-slate-950">
                  <Image
                    src={activity.image}
                    alt={isAr ? activity.titleAr : activity.titleEn}
                    fill
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/20 to-transparent" />
                  <div className="absolute bottom-3 start-3">
                    <span className="px-3 py-1 rounded-full bg-slate-950/80 border border-white/10 text-teal-300 text-xs font-semibold backdrop-blur-md">
                      {isAr ? activity.categoryAr : activity.categoryEn}
                    </span>
                  </div>
                </div>

                <div className="flex flex-1 flex-col justify-between p-6">
                  <div>
                    <h3 className="text-lg sm:text-xl font-bold text-white mb-2 group-hover:text-teal-400 transition-colors">
                      {isAr ? activity.titleAr : activity.titleEn}
                    </h3>

                    <p className="text-slate-300 text-xs sm:text-sm leading-relaxed mb-4">
                      {isAr ? activity.descriptionAr : activity.descriptionEn}
                    </p>

                    <div className="mb-4 pt-3 border-t border-slate-800/80">
                      <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                        {isAr ? 'أبرز الإنجازات والفعاليات:' : 'Highlights & Activities:'}
                      </h4>
                      <ul className="space-y-1.5">
                        {(isAr ? activity.highlightsAr : activity.highlightsEn).map((h, i) => (
                          <li key={i} className="flex items-center gap-2 text-xs text-slate-300">
                            <CheckCircle className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                            <span>{h}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-800 flex items-center justify-between text-xs">
                    <span className="text-slate-400 flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-teal-400" />
                      {isAr ? 'مفتوح للجميع' : 'Open to All'}
                    </span>
                    <Link
                      href={`/${locale}/contact`}
                      className="inline-flex items-center gap-1 text-teal-400 font-semibold hover:text-teal-300"
                    >
                      <span>{isAr ? 'استفسر عن الانضمام' : 'Join Activity'}</span>
                      <ChevronIcon className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 2. Photo Gallery Section */}
          <div className="mt-20 pt-12 border-t border-slate-800">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/30 text-teal-300 text-xs font-semibold mb-2">
                  <Camera className="w-3.5 h-3.5" />
                  <span>{isAr ? 'معرض الصور الفوتوغرافي' : 'Campus Photo Gallery'}</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold text-white">
                  {isAr ? 'جولة مصورة في مرافق وقاعات ومعامل المعهد' : 'High-Resolution Facilities & Campus Gallery'}
                </h2>
                <p className="mt-1 text-xs sm:text-sm text-slate-400">
                  {isAr
                    ? 'لقطات حقيقية من الحرم الأكاديمي، المعامل التكنولوجية، والمكتبة المركزية.'
                    : 'Real captures of campus facade, computer labs, central library, and student courtyards.'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {GALLERY_ITEMS.map((item) => (
                <div
                  key={item.id}
                  className="group relative h-64 rounded-2xl overflow-hidden border border-slate-800 bg-slate-900 shadow-md transition-all duration-300 hover:border-teal-500/50 hover:shadow-xl"
                >
                  <Image
                    src={item.image}
                    alt={isAr ? item.titleAr : item.titleEn}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/30 to-transparent" />
                  <div className="absolute bottom-4 start-4 end-4 text-white">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-teal-300">
                      {isAr ? item.categoryAr : item.categoryEn}
                    </span>
                    <h3 className="text-base font-bold leading-tight mt-1">
                      {isAr ? item.titleAr : item.titleEn}
                    </h3>
                    <p className="mt-1 text-xs text-slate-300 line-clamp-2">
                      {isAr ? item.descriptionAr : item.descriptionEn}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Youth Care Office Info Card */}
          <div className="mt-16 p-8 rounded-2xl bg-gradient-to-r from-teal-950/60 to-slate-900 border border-teal-500/20 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-xl bg-teal-500/20 text-teal-400 shrink-0">
                <Trophy className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">
                  {isAr ? 'اتحاد طلاب المعهد واللجان النوعية' : 'Student Union & Activity Committees'}
                </h3>
                <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-xl">
                  {isAr
                    ? 'يتم انتخاب اتحاد الطلاب سنوياً بإشراف كامل من وزارة التعليم العالي لتمثيل زملائهم وتنظيم البطولات والرحلات والمبادرات.'
                    : 'The Student Union is elected annually under Ministry supervision, organizing tournaments, scientific seminars, and student initiatives.'}
                </p>
              </div>
            </div>
            <Link
              href={`/${locale}/contact`}
              className="px-5 py-2.5 rounded-squircle bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs shrink-0 transition-colors"
            >
              {isAr ? 'تواصل مع رعاية الشباب' : 'Contact Youth Care'}
            </Link>
          </div>
        </section>
      </main>

      <InstitutionalFooter locale={locale} />
    </div>
  );
}
