import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { routing } from '@/i18n/routing';
import { INSTITUTE_INFO, DOWNLOAD_DOCUMENTS } from '@/data/institutional-data';
import { InstitutionalHeader } from '@/components/institutional/InstitutionalHeader';
import { InstitutionalFooter } from '@/components/institutional/InstitutionalFooter';
import { FileText, Download, ChevronRight, ChevronLeft, ShieldCheck, AlertCircle } from 'lucide-react';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === 'ar';

  return {
    title: isAr
      ? `مركز التحميلات والنماذج الرسمية | ${INSTITUTE_INFO.name.ar}`
      : `Downloads & Official Forms | ${INSTITUTE_INFO.name.en}`,
    description: isAr
      ? 'تحميل النماذج والاستمارات الأكاديمية واللوائح ودليل الطالب والتقويم السنوي للمعهد العالي للعلوم الإدارية المتقدمة والحاسبات.'
      : 'Download official forms, academic bylaws, student handbook, and academic calendar from BHI47a.',
  };
}

export default async function DownloadsPage({ params }: PageProps) {
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
              <span className="text-teal-400 font-medium">{isAr ? 'مركز التحميلات' : 'Downloads'}</span>
            </nav>

            <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight">
              {isAr ? 'مركز التحميلات والنماذج الطلابية' : 'Downloads & Official Documents'}
            </h1>
            <p className="mt-3 text-slate-300 max-w-3xl text-sm sm:text-base leading-relaxed">
              {isAr
                ? 'الاستمارات الأكاديمية، اللائحة الداخلية المعتمدة، دليل الطالب، والمستندات الرسمية المعتمدة للتحميل المباشر.'
                : 'Download accredited academic guidelines, registration forms, student handbooks, and official notices.'}
            </p>
          </div>
        </section>

        {/* Documents Table / Grid */}
        <section className="py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {DOWNLOAD_DOCUMENTS.map((doc) => (
              <div
                key={doc.id}
                className="p-6 rounded-2xl bg-slate-900 border border-slate-800 hover:border-teal-500/40 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-4">
                    <span className="px-2.5 py-1 rounded-md bg-teal-500/10 border border-teal-500/20 text-teal-300 text-xs font-semibold">
                      {isAr ? doc.categoryAr : doc.categoryEn}
                    </span>
                    <span className="text-xs font-mono text-slate-400 uppercase">
                      {doc.format} • {doc.fileSize}
                    </span>
                  </div>

                  <h2 className="text-lg font-bold text-white mb-2">
                    {isAr ? doc.titleAr : doc.titleEn}
                  </h2>

                  <p className="text-xs text-slate-400 leading-relaxed mb-6 font-mono">
                    {isAr ? `تاريخ التحديث: ${doc.updatedDate}` : `Updated: ${doc.updatedDate}`}
                  </p>
                </div>

                <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
                    {isAr ? 'نسخة رسمية' : 'Official Version'}
                  </span>
                  <a
                    href={doc.downloadUrl}
                    download
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-squircle bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{isAr ? 'تحميل الملف' : 'Download'}</span>
                  </a>
                </div>
              </div>
            ))}
          </div>

          {/* Submission Notice */}
          <div className="mt-12 p-6 rounded-xl bg-slate-900/60 border border-slate-800 flex items-start gap-4">
            <AlertCircle className="w-5 h-5 text-teal-400 shrink-0 mt-0.5" />
            <div className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              <p className="font-semibold text-white mb-1">
                {isAr ? 'ملاحظة هامة بشأن تسليم الاستمارات:' : 'Important Note on Form Submission:'}
              </p>
              <p>
                {isAr
                  ? 'يتم ملء الاستمارات الأكاديمية وطباعتها وتسليمها لإدارة شؤون الطلاب بالمعهد مصحوبة بالمستندات المطلوبة، أو عبر البوابة الإلكترونية للخدمات المتاحة أونلاين.'
                  : 'Printed forms should be completed and submitted to the Student Affairs office along with required documentation, or processed directly via the Electronic Portal where supported.'}
              </p>
            </div>
          </div>
        </section>
      </main>

      <InstitutionalFooter locale={locale} />
    </div>
  );
}
