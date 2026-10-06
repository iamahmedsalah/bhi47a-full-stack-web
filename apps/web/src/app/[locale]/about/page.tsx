import React from 'react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { routing } from '@/i18n/routing';
import { INSTITUTE_INFO } from '@/data/institutional-data';
import { InstitutionalHeader } from '@/components/institutional/InstitutionalHeader';
import { InstitutionalFooter } from '@/components/institutional/InstitutionalFooter';
import { Compass, BookOpen, ShieldCheck, ChevronRight, ChevronLeft, GraduationCap, CheckCircle2 } from 'lucide-react';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === 'ar';

  return {
    title: isAr
      ? `عن المعهد | ${INSTITUTE_INFO.name.ar}`
      : `About Us | ${INSTITUTE_INFO.name.en}`,
    description: isAr
      ? 'تعرف على تاريخ ورؤية ورسالة وأهداف المعهد العالي للعلوم الإدارية المتقدمة والحاسبات واعتماده من وزارة التعليم العالي المصرية.'
      : 'Learn about the history, vision, mission, and accreditation of BHI47a Higher Institute.',
  };
}

export default async function AboutPage({ params }: PageProps) {
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
        {/* Breadcrumb Header */}
        <section className="bg-slate-900/80 border-b border-slate-800 py-12 relative overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <nav className="flex items-center gap-2 text-xs text-slate-400 mb-4" aria-label="Breadcrumb">
              <Link href={`/${locale}`} className="hover:text-teal-400 transition-colors">
                {isAr ? 'الرئيسية' : 'Home'}
              </Link>
              <ChevronIcon className="w-3.5 h-3.5 text-slate-600" />
              <span className="text-teal-400 font-medium">{isAr ? 'عن المعهد' : 'About'}</span>
            </nav>

            <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight">
              {isAr ? 'عن المعهد العالي للعلوم الإدارية المتقدمة والحاسبات' : 'About BHI47a Higher Institute'}
            </h1>
            <p className="mt-3 text-slate-300 max-w-3xl text-sm sm:text-base leading-relaxed">
              {isAr
                ? 'مؤسسة تعليمية جامعية معتمدة تهدف إلى إعداد كوادر متميزة في مجالات نظم معلومات الأعمال (BIS) والمحاسبة والمراجعة.'
                : 'An accredited higher education institution preparing distinguished graduates in Business Information Systems (BIS) and Accounting & Auditing.'}
            </p>
          </div>
        </section>

        {/* Overview & Campus Photo */}
        <section className="py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/30 text-teal-300 text-xs font-semibold mb-4">
                <ShieldCheck className="w-4 h-4" />
                <span>{isAr ? 'نبذة تأسيسية واعتماد رسمي' : 'Official Accreditation'}</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-6 leading-snug">
                {isAr
                  ? 'صرح تعليمي متطور يواكب متطلبات التحول الرقمي وسوق العمل الحديث'
                  : 'A Modern Academic Campus Aligned with Digital Transformation'}
              </h2>
              <p className="text-slate-300 text-sm sm:text-base leading-relaxed mb-4">
                {isAr
                  ? 'أنشئ المعهد العالي للعلوم الإدارية المتقدمة والحاسبات بقرار وزاري صادر من وزارة التعليم العالي بجمهورية مصر العربية، ليكون منارة تعليمية متخصصة تجمع بين أحدث المفاهيم الإدارية والمحاسبية وتقنيات الحاسوب ونظم المعلومات.'
                  : 'The High Institute for Advanced Management Sciences and Computer was established by ministerial decree from the Egyptian Ministry of Higher Education, bridging the gap between business sciences and state-of-the-art information systems.'}
              </p>
              <p className="text-slate-300 text-sm sm:text-base leading-relaxed mb-6">
                {isAr
                  ? 'يمنح المعهد درجة البكالوريوس المعتمدة والمعادلة لدرجات البكالوريوس الممنوحة من الجامعات الحكومية المصرية، مما يتيح لخريجيه القيد بالنقابات المهنية (نقابة التجاريين) واستكمال الدراسات العليا (الماجستير والدكتوراه).'
                  : 'The Institute awards bachelor degrees fully accredited and equivalent to those granted by Egyptian public universities, qualifying graduates for syndicate memberships (Syndicate of Commercial Professions) and postgraduate programs.'}
              </p>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-800">
                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                  <div className="text-2xl font-black text-teal-400">47/أ</div>
                  <div className="text-xs text-slate-400 mt-1">
                    {isAr ? 'طابع التنسيق الحكومي' : 'Coordination Bureau Code'}
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                  <div className="text-2xl font-black text-teal-400">4 {isAr ? 'سنوات' : 'Years'}</div>
                  <div className="text-xs text-slate-400 mt-1">
                    {isAr ? 'نظام الساعات المعتمدة' : 'Credit Hours System'}
                  </div>
                </div>
              </div>
            </div>

            <div className="relative aspect-[4/3] rounded-2xl overflow-hidden shadow-2xl border border-slate-800">
              <Image
                src="/images/institutional/campus-hero.jpg"
                alt={isAr ? 'مبنى المعهد الرئيسي' : 'Institute Campus Building'}
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
                priority
              />
            </div>
          </div>
        </section>

        {/* Vision & Mission */}
        <section className="py-16 bg-slate-900/60 border-y border-slate-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Vision Card */}
              <div className="p-8 rounded-2xl bg-slate-900 border border-slate-800 relative overflow-hidden">
                <div className="w-12 h-12 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center mb-6">
                  <Compass className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-white mb-4">
                  {isAr ? 'رؤية المعهد (Our Vision)' : 'Our Vision'}
                </h3>
                <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
                  {isAr ? INSTITUTE_INFO.vision.ar : INSTITUTE_INFO.vision.en}
                </p>
              </div>

              {/* Mission Card */}
              <div className="p-8 rounded-2xl bg-slate-900 border border-slate-800 relative overflow-hidden">
                <div className="w-12 h-12 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center mb-6">
                  <BookOpen className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-white mb-4">
                  {isAr ? 'رسالة المعهد (Our Mission)' : 'Our Mission'}
                </h3>
                <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
                  {isAr ? INSTITUTE_INFO.mission.ar : INSTITUTE_INFO.mission.en}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Strategic Objectives */}
        <section className="py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-white">
              {isAr ? 'الأهداف الاستراتيجية للمعهد' : 'Strategic Objectives'}
            </h2>
            <p className="text-slate-400 text-sm mt-2">
              {isAr
                ? 'يسعى المعهد إلى تحقيق غايات تعليمية وتطبيقية تسهم في بناء جيل متميز'
                : 'Core institutional goals driving our curriculum and student development'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {INSTITUTE_INFO.objectives.map((obj, idx) => (
              <div key={idx} className="p-6 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
                <div>
                  <div className="w-8 h-8 rounded-lg bg-teal-500/20 text-teal-400 flex items-center justify-center font-bold text-sm mb-4">
                    0{idx + 1}
                  </div>
                  <p className="text-slate-200 text-sm leading-relaxed">
                    {isAr ? obj.ar : obj.en}
                  </p>
                </div>
                <div className="mt-4 pt-4 border-t border-slate-800/60 flex items-center gap-1.5 text-xs text-teal-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{isAr ? 'هدف معتمد' : 'Verified Goal'}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Educational System & Credit Hours */}
        <section className="py-16 bg-slate-900/60 border-t border-slate-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 p-8 sm:p-10 rounded-2xl">
              <div className="flex items-center gap-3 mb-6">
                <GraduationCap className="w-7 h-7 text-teal-400" />
                <h3 className="text-xl sm:text-2xl font-bold text-white">
                  {isAr ? 'نظام الدراسة والساعات المعتمدة' : 'Academic Credit Hours System'}
                </h3>
              </div>
              <div className="space-y-4 text-slate-300 text-sm sm:text-base leading-relaxed">
                <p>
                  {isAr
                    ? 'تسير الدراسة بالمعهد وفقاً لنظام الساعات المعتمدة (Credit Hours System)، والذي يمنح الطالب مرونة أكاديمية لاختيار المقررات الدراسية المناسبة تحت إشراف مرشد أكاديمي متخصص لكل طالب.'
                    : 'Instruction follows the Credit Hours System, providing students with academic flexibility under the mentorship of assigned academic advisors.'}
                </p>
                <p>
                  {isAr
                    ? 'ينقسم العام الأكاديمي إلى فصلين دراسيين أساسيين (فصل الخريف وفصل الربيع)، بالإضافة إلى فصل دراسي صيفي اختياري للتسريع أو تحسين المعدل التراكمي (GPA).'
                    : 'The academic year comprises two mandatory terms (Fall and Spring), plus an optional Summer term for course acceleration or GPA enhancement.'}
                </p>
              </div>

              <div className="mt-8 pt-6 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4">
                <span className="text-xs text-slate-400">
                  {isAr ? 'بإشراف وزارة التعليم العالي والمجلس الأعلى للجامعات' : 'Supervised by the Ministry of Higher Education'}
                </span>
                <Link
                  href={`/${locale}/academics`}
                  className="inline-flex items-center gap-2 text-sm text-teal-400 font-semibold hover:text-teal-300"
                >
                  <span>{isAr ? 'استعراض التخصصات الدراسية' : 'View Academic Programs'}</span>
                  <ChevronIcon className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <InstitutionalFooter locale={locale} />
    </div>
  );
}
