import React from 'react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { routing } from '@/i18n/routing';
import { INSTITUTE_INFO, ACADEMIC_PROGRAMS } from '@/data/institutional-data';
import { InstitutionalHeader } from '@/components/institutional/InstitutionalHeader';
import { InstitutionalFooter } from '@/components/institutional/InstitutionalFooter';
import {
  GraduationCap,
  Clock,
  Award,
  ChevronRight,
  ChevronLeft,
  Briefcase,
  CheckCircle2,
  Calendar,
  BookOpen,
} from 'lucide-react';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === 'ar';

  return {
    title: isAr
      ? `البرامج الأكاديمية والشعب | ${INSTITUTE_INFO.name.ar}`
      : `Academic Programs & Departments | ${INSTITUTE_INFO.name.en}`,
    description: isAr
      ? 'تعرف على التخصصات الدراسية وشعب المعهد: نظم معلومات الأعمال (BIS) وشعبة المحاسبة والمراجعة.'
      : 'Explore academic programs: Business Information Systems (BIS) and Accounting & Auditing at BHI47a.',
  };
}

export default async function AcademicsPage({ params }: PageProps) {
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
        {/* Page Banner */}
        <section className="bg-slate-900/80 border-b border-slate-800 py-12 relative overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <nav className="flex items-center gap-2 text-xs text-slate-400 mb-4" aria-label="Breadcrumb">
              <Link href={`/${locale}`} className="hover:text-teal-400 transition-colors">
                {isAr ? 'الرئيسية' : 'Home'}
              </Link>
              <ChevronIcon className="w-3.5 h-3.5 text-slate-600" />
              <span className="text-teal-400 font-medium">{isAr ? 'البرامج الأكاديمية' : 'Academics'}</span>
            </nav>

            <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight">
              {isAr ? 'البرامج الأكاديمية والدرجات العلمية' : 'Academic Programs & Degrees'}
            </h1>
            <p className="mt-3 text-slate-300 max-w-3xl text-sm sm:text-base leading-relaxed">
              {isAr
                ? 'يقدم المعهد درجات البكالوريوس المعتمدة بنظام الساعات المعتمدة في تخصصين نوعيين يخدمان الاقتصاد وسوق العمل الحديث: شعبة نظم معلومات الأعمال (BIS) وشعبة المحاسبة والمراجعة.'
                : 'BHI47a offers accredited bachelor degrees under the credit-hour framework across two specialized business and technological domains: BIS and Accounting & Auditing.'}
            </p>
          </div>
        </section>

        {/* Detailed Program Breakdown */}
        <section className="py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
          {ACADEMIC_PROGRAMS.map((program, idx) => {
            const isReversed = idx % 2 === 1;

            return (
              <div
                key={program.id}
                id={program.id}
                className="scroll-mt-24 p-8 sm:p-10 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl"
              >
                <div className={`grid grid-cols-1 lg:grid-cols-12 gap-8 items-start`}>
                  {/* Text Details */}
                  <div className="lg:col-span-8">
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <span className="px-3 py-1 rounded-full bg-teal-500/20 border border-teal-500/30 text-teal-300 text-xs font-bold uppercase tracking-wider">
                        {isAr ? program.degreeAr : program.degreeEn}
                      </span>
                      <span className="px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300 text-xs font-semibold">
                        {isAr ? `كود الشعبة: ${program.code}` : `Code: ${program.code}`}
                      </span>
                    </div>

                    <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-4">
                      {isAr ? program.titleAr : program.titleEn}
                    </h2>

                    <p className="text-slate-300 text-sm sm:text-base leading-relaxed mb-6">
                      {isAr ? program.descriptionAr : program.descriptionEn}
                    </p>

                    {/* Highlights / Specializations */}
                    <div className="mb-6">
                      <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-3">
                        {isAr ? 'مجالات ومحاور الدراسة:' : 'Key Subject Areas:'}
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {(isAr ? program.keyTopicsAr : program.keyTopicsEn).map((topic, hIdx) => (
                          <div key={hIdx} className="flex items-center gap-2 text-xs sm:text-sm text-slate-300">
                            <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
                            <span>{topic}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Career Opportunities */}
                    <div>
                      <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-3">
                        {isAr ? 'فرص ومجالات العمل للخريجين:' : 'Career Opportunities for Graduates:'}
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {(isAr ? program.careerProspectsAr : program.careerProspectsEn).map((career, cIdx) => (
                          <span
                            key={cIdx}
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800/80 border border-slate-700 text-xs text-slate-300 font-medium"
                          >
                            <Briefcase className="w-3.5 h-3.5 text-teal-400" />
                            <span>{career}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Summary Card Side */}
                  <div className="lg:col-span-4 bg-slate-950/80 border border-slate-800 p-6 rounded-xl space-y-4">
                    <h4 className="text-sm font-bold text-white border-b border-slate-800 pb-2">
                      {isAr ? 'بطاقة البرنامج الأكاديمي' : 'Program Factsheet'}
                    </h4>

                    <div className="space-y-3 text-xs sm:text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 flex items-center gap-1.5">
                          <Clock className="w-4 h-4 text-teal-400" />
                          {isAr ? 'مدة الدراسة:' : 'Duration:'}
                        </span>
                        <span className="font-semibold text-white">
                          {isAr ? program.durationAr : program.durationEn}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 flex items-center gap-1.5">
                          <BookOpen className="w-4 h-4 text-teal-400" />
                          {isAr ? 'الساعات المعتمدة:' : 'Credit Hours:'}
                        </span>
                        <span className="font-semibold text-white">
                          {program.creditHours} {isAr ? 'ساعة' : 'Hrs'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 flex items-center gap-1.5">
                          <Award className="w-4 h-4 text-teal-400" />
                          {isAr ? 'المعادلة الحكومية:' : 'Equivalency:'}
                        </span>
                        <span className="font-semibold text-emerald-400">
                          {isAr ? 'معادلة رسمياً' : 'Officially Equivalent'}
                        </span>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-800">
                      <Link
                        href={`/${locale}/login`}
                        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-squircle bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs transition-colors"
                      >
                        <GraduationCap className="w-4 h-4" />
                        <span>{isAr ? 'دخول بوابة الطلاب للمقررات' : 'Access Student Course Portal'}</span>
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </section>

        {/* Academic Calendar Outline */}
        <section className="py-16 bg-slate-900/60 border-t border-slate-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto text-center mb-10">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/30 text-teal-300 text-xs font-semibold mb-3">
                <Calendar className="w-4 h-4" />
                <span>{isAr ? 'التقويم الجامعي' : 'Academic Calendar'}</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-white">
                {isAr ? 'الفصول الدراسية والمواعيد الأكاديمية' : 'Semester Timelines & Advising'}
              </h2>
              <p className="text-slate-400 text-sm mt-2">
                {isAr
                  ? 'تسير الدراسة وفقاً للتقويم المعتمد من المجلس الأعلى للجامعات ووزارة التعليم العالي'
                  : 'Classes follow the unified calendar approved by the Supreme Council of Universities'}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-6 rounded-xl bg-slate-900 border border-slate-800">
                <span className="text-xs font-bold text-teal-400 uppercase tracking-wider">
                  {isAr ? 'الفصل الدراسي الأول' : 'Fall Semester'}
                </span>
                <h3 className="text-lg font-bold text-white mt-1 mb-2">
                  {isAr ? 'فصل الخريف' : 'Fall Term'}
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {isAr
                    ? 'يبدأ في أواخر سبتمبر وحتى امتحانات نصف العام في يناير، ويتضمن 15 أسبوعاً دراسياً.'
                    : 'Runs from late September through January examinations, comprising 15 instructional weeks.'}
                </p>
              </div>

              <div className="p-6 rounded-xl bg-slate-900 border border-slate-800">
                <span className="text-xs font-bold text-teal-400 uppercase tracking-wider">
                  {isAr ? 'الفصل الدراسي الثاني' : 'Spring Semester'}
                </span>
                <h3 className="text-lg font-bold text-white mt-1 mb-2">
                  {isAr ? 'فصل الربيع' : 'Spring Term'}
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {isAr
                    ? 'يبدأ في فبراير وحتى امتحانات نهاية العام في مايو/يونيو، ويتضمن 15 أسبوعاً دراسياً.'
                    : 'Runs from February through May/June final exams, comprising 15 instructional weeks.'}
                </p>
              </div>

              <div className="p-6 rounded-xl bg-slate-900 border border-slate-800">
                <span className="text-xs font-bold text-teal-400 uppercase tracking-wider">
                  {isAr ? 'الفصل الدراسي الصيفي (اختياري)' : 'Summer Term (Optional)'}
                </span>
                <h3 className="text-lg font-bold text-white mt-1 mb-2">
                  {isAr ? 'فصل الصيف المكثف' : 'Summer Term'}
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {isAr
                    ? 'فصل دراسي مكثف اختياري خلال شهري يوليو وأغسطس لمساعدة الطلاب على تحسين المعدل أو التخرج المبكر.'
                    : 'An intensive optional session during July and August for GPA enhancement and early completion.'}
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <InstitutionalFooter locale={locale} />
    </div>
  );
}
