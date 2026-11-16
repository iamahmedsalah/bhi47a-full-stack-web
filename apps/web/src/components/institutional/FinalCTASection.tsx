import React from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowLeft, LogIn, Compass } from 'lucide-react';

interface FinalCTASectionProps {
  locale: string;
}

export function FinalCTASection({ locale }: FinalCTASectionProps) {
  const isAr = locale === 'ar';
  const ArrowIcon = isAr ? ArrowLeft : ArrowRight;

  return (
    <section className="py-20 bg-gradient-to-br from-teal-900 via-teal-950 to-slate-950 text-white relative overflow-hidden">
      {/* Decorative background grid and gradients */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f766e15_1px,transparent_1px),linear-gradient(to_bottom,#0f766e15_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[36rem] h-[36rem] bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
        <span className="inline-block px-4 py-1.5 rounded-full bg-teal-500/20 border border-teal-500/30 text-teal-300 text-xs font-semibold uppercase tracking-wider mb-6">
          {isAr ? 'المعهد العالي للعلوم الإدارية المتقدمة والحاسبات' : 'BHI47a Higher Institute'}
        </span>

        <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight leading-tight mb-6">
          {isAr ? (
            <>
              بوابتك نحو تعليم جامعي متميز ومستقبل مهني واعد
            </>
          ) : (
            <>
              Your Gateway to Academic Excellence and a Promising Career
            </>
          )}
        </h2>

        <p className="max-w-2xl mx-auto text-slate-300 text-base sm:text-lg leading-relaxed mb-10">
          {isAr
            ? 'انضم إلى بيئة أكاديمية متطورة تجمع بين المعرفة النظرية والتطبيق العملي في مجالات نظم معلومات الأعمال والمحاسبة والمراجعة.'
            : 'Join an advanced academic environment combining theoretical knowledge and practical training in Business Information Systems and Accounting and Auditing.'}
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4">
          <Link
            href={`/${locale}/login`}
            className="inline-flex items-center gap-2.5 px-7 py-3.5 rounded-squircle bg-teal-400 hover:bg-teal-300 text-slate-950 font-bold text-base transition-all shadow-xl shadow-teal-500/20 hover:scale-[1.02]"
          >
            <LogIn className="w-5 h-5" />
            <span>{isAr ? 'الدخول إلى البوابة الإلكترونية' : 'Access Electronic Portal'}</span>
            <ArrowIcon className="w-4 h-4" />
          </Link>

          <Link
            href={`/${locale}/academics`}
            className="inline-flex items-center gap-2.5 px-7 py-3.5 rounded-squircle bg-slate-800/90 hover:bg-slate-800 text-slate-100 hover:text-white border border-slate-700 font-semibold text-base transition-all hover:scale-[1.02]"
          >
            <Compass className="w-5 h-5" />
            <span>{isAr ? 'استكشف البرامج الدراسية' : 'Explore Academic Programs'}</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
