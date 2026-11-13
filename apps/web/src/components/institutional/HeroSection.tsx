import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  GraduationCap,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Building2,
  Award,
  BookOpen,
  Laptop,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface HeroSectionProps {
  locale: string;
}

export function HeroSection({ locale }: HeroSectionProps) {
  const isAr = locale === 'ar';
  const ArrowIcon = isAr ? ArrowLeft : ArrowRight;

  return (
    <section
      id="home"
      className="relative overflow-hidden border-b border-border/60 bg-slate-950 text-white"
      dir={isAr ? 'rtl' : 'ltr'}
    >
      {/* Background Campus Image with Deep Academic Gradient Overlay */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/images/institutional/campus-hero.webp"
          alt="Institute Campus Grounds"
          fill
          priority
          sizes="(max-width: 1280px) 100vw, 1280px"
          className="object-cover object-center opacity-30 mix-blend-luminosity filter"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/90 to-teal-950/80" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-teal-900/20 via-transparent to-transparent" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:py-28">
        <div className="max-w-3xl">
          {/* Top Institutional Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-teal-500/30 bg-teal-500/10 px-3.5 py-1.5 text-xs font-semibold text-teal-300 backdrop-blur-md">
            <Award className="h-4 w-4 text-teal-400" />
            <span>
              {isAr
                ? 'مؤسسة جامعية معتمدة | كود التنسيق: 47'
                : 'Accredited Higher Institute | Code: 47'}
            </span>
          </div>

          {/* Main Headline */}
          <h1 className="mt-5 text-2xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl leading-tight">
            {isAr ? (
              <>
                المعهد العالي للعلوم الإدارية <br className="hidden sm:inline" />
                <span className="text-teal-400">المتقدمة والحاسبات</span>
              </>
            ) : (
              <>
                High Institute for Advanced <br className="hidden sm:inline" />
                <span className="text-teal-400">Management Sciences and Computer</span>
              </>
            )}
          </h1>

          {/* Academic Subtitle */}
          <p className="mt-5 text-sm leading-relaxed text-slate-300 sm:text-base lg:text-lg">
            {isAr
              ? 'صرح أكاديمي رائد في محافظة البحيرة يمنح درجة البكالوريوس المعتمدة في نظم معلومات الأعمال (BIS) والمحاسبة والمراجعة بنظام الساعات المعتمدة، لإعداد خريجين متميزين مؤهلين لقيادة المستقبل الرقمي والإداري.'
              : 'A leading academic institution in Beheira Governorate granting accredited Bachelor degrees in Business Information Systems (BIS) and Accounting under the Credit Hours System, qualifying graduates to lead the digital and business enterprise landscape.'}
          </p>

          {/* Dual CTAs */}
          <div className="mt-8 flex flex-wrap items-center gap-3 sm:gap-4">
            {/* Primary CTA: Explore Institute */}
            <Button
              asChild
              size="lg"
              className="h-12 gap-2 rounded-squircle bg-teal-600 px-6 text-sm font-bold text-white shadow-lg transition-all hover:bg-teal-500 hover:shadow-teal-900/30"
            >
              <Link href={`/${locale}/about`}>
                <span>{isAr ? 'استكشف المعهد' : 'Explore Institute'}</span>
                <ArrowIcon className="h-4 w-4" />
              </Link>
            </Button>

            {/* Secondary CTA: Electronic Portal */}
            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-12 gap-2 rounded-squircle border-white/20 bg-white/5 px-6 text-sm font-bold text-white backdrop-blur-md transition-all hover:border-teal-400 hover:bg-white/10"
            >
              <Link href={`/${locale}/login`}>
                <GraduationCap className="h-4 w-4 text-teal-400" />
                <span>{isAr ? 'البوابة الإلكترونية' : 'Electronic Portal'}</span>
              </Link>
            </Button>
          </div>

          {/* Core Institutional Value Chips */}
          <div className="mt-10 grid grid-cols-2 gap-3 border-t border-white/10 pt-6 sm:grid-cols-4 sm:gap-4">
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-teal-400" />
              <span>{isAr ? 'ساعات معتمدة حديثة' : 'Credit Hours System'}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <Laptop className="h-4 w-4 shrink-0 text-teal-400" />
              <span>{isAr ? 'معامل حاسب متقدمة' : 'High-Tech Labs'}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <Building2 className="h-4 w-4 shrink-0 text-teal-400" />
              <span>{isAr ? 'حرم جامعي متكامل' : 'Modern Campus'}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <BookOpen className="h-4 w-4 shrink-0 text-teal-400" />
              <span>{isAr ? 'شعب معتمدة رسمياً' : 'Accredited Curricula'}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
