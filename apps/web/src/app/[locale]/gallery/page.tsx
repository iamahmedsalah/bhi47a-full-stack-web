import React from 'react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { routing } from '@/i18n/routing';
import { INSTITUTE_INFO, GALLERY_ITEMS } from '@/data/institutional-data';
import { InstitutionalHeader } from '@/components/institutional/InstitutionalHeader';
import { InstitutionalFooter } from '@/components/institutional/InstitutionalFooter';
import { ChevronRight, ChevronLeft } from 'lucide-react';


interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === 'ar';

  return {
    title: isAr
      ? `معرض الصور وجولة الحرم الجامعي | ${INSTITUTE_INFO.nameAr}`
      : `Campus Photo Gallery | ${INSTITUTE_INFO.nameEn}`,
    description: isAr
      ? 'جولة مصورة داخل مرافق وقاعات ومختبرات الحاسب والمكتبة المركزية بالمعهد العالي للعلوم الإدارية المتقدمة والحاسبات.'
      : 'Photo tour of facilities, lecture halls, computer labs, and the library at BHI47a.',
  };
}

export default async function GalleryPage({ params }: PageProps) {
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
              <span className="text-teal-400 font-medium">{isAr ? 'معرض الصور' : 'Gallery'}</span>
            </nav>

            <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight">
              {isAr ? 'معرض الصور وجولة في الحرم الجامعي' : 'Campus Photo Tour & Facilities'}
            </h1>
            <p className="mt-3 text-slate-300 max-w-3xl text-sm sm:text-base leading-relaxed">
              {isAr
                ? 'استكشف بيئة التعلم الحديثة وقاعات المحاضرات الذكية ومختبرات البرمجة ونظم المعلومات.'
                : 'Explore our modern learning environment, high-tech computing labs, and study spaces.'}
            </p>
          </div>
        </section>

        {/* Gallery Grid */}
        <section className="py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {GALLERY_ITEMS.map((item) => (
              <figure
                key={item.id}
                className="group rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-xl hover:border-teal-500/50 transition-all flex flex-col"
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-800">
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

                <figcaption className="p-5">
                  <h2 className="text-base font-bold text-white group-hover:text-teal-300 transition-colors mb-1">
                    {isAr ? item.titleAr : item.titleEn}
                  </h2>
                  <p className="text-xs text-slate-400">
                    {isAr ? item.descriptionAr : item.descriptionEn}
                  </p>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      </main>

      <InstitutionalFooter locale={locale} />
    </div>
  );
}
