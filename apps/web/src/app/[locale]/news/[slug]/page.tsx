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
import { Calendar, Tag, ChevronRight, ChevronLeft, ArrowRight, ArrowLeft, LogIn, Share2 } from 'lucide-react';

interface PageProps {
  params: Promise<{ locale: string; slug: string }>;
}

export async function generateStaticParams() {
  const locales = ['ar', 'en'];
  const params: { locale: string; slug: string }[] = [];

  for (const locale of locales) {
    for (const item of NEWS_ITEMS) {
      params.push({ locale, slug: item.slug });
    }
  }

  return params;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const isAr = locale === 'ar';

  const item = NEWS_ITEMS.find((n) => n.slug === slug);
  if (!item) {
    return {
      title: isAr ? 'البيان غير موجود' : 'Article Not Found',
    };
  }

  const title = isAr ? item.titleAr : item.titleEn;
  const description = isAr ? item.summaryAr : item.summaryEn;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://bhi47a.edu.eg';

  return {
    title: `${title} | ${isAr ? INSTITUTE_INFO.nameAr : INSTITUTE_INFO.nameEn}`,
    description,
    openGraph: {
      title,
      description,
      type: 'article',
      url: `${baseUrl}/${locale}/news/${slug}`,
      publishedTime: item.date,
      images: [
        {
          url: `${baseUrl}${item.image}`,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [`${baseUrl}${item.image}`],
    },
  };
}

export default async function NewsDetailPage({ params }: PageProps) {
  const { locale, slug } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const isAr = locale === 'ar';
  const item = NEWS_ITEMS.find((n) => n.slug === slug);

  if (!item) {
    notFound();
  }

  const ChevronIcon = isAr ? ChevronLeft : ChevronRight;
  const ArrowIcon = isAr ? ArrowLeft : ArrowRight;
  const BackArrow = isAr ? ArrowRight : ArrowLeft;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://bhi47a.edu.eg';

  // Article JSON-LD
  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: isAr ? item.titleAr : item.titleEn,
    image: [`${baseUrl}${item.image}`],
    datePublished: item.date,
    dateModified: item.date,
    author: {
      '@type': 'Organization',
      name: isAr ? INSTITUTE_INFO.nameAr : INSTITUTE_INFO.nameEn,
      url: baseUrl,
    },
    publisher: {
      '@type': 'EducationalOrganization',
      name: isAr ? INSTITUTE_INFO.nameAr : INSTITUTE_INFO.nameEn,
      logo: {
        '@type': 'ImageObject',
        url: `${baseUrl}/logo.webp`,
      },
    },
    description: isAr ? item.summaryAr : item.summaryEn,
  };

  const contentParagraphs = isAr ? item.contentAr : item.contentEn;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-teal-500 selection:text-white">
      {/* Article Schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />

      <InstitutionalHeader locale={locale} />

      <main className="flex-grow">
        {/* Breadcrumb Header */}
        <section className="bg-slate-900/80 border-b border-slate-800 py-8 relative">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <nav className="flex items-center gap-2 text-xs text-slate-400 mb-4" aria-label="Breadcrumb">
              <Link href={`/${locale}`} className="hover:text-teal-400 transition-colors">
                {isAr ? 'الرئيسية' : 'Home'}
              </Link>
              <ChevronIcon className="w-3.5 h-3.5 text-slate-600" />
              <Link href={`/${locale}/news`} className="hover:text-teal-400 transition-colors">
                {isAr ? 'الأخبار' : 'News'}
              </Link>
              <ChevronIcon className="w-3.5 h-3.5 text-slate-600" />
              <span className="text-teal-400 font-medium truncate max-w-[200px] sm:max-w-xs">
                {isAr ? item.titleAr : item.titleEn}
              </span>
            </nav>

            <div className="flex flex-wrap items-center gap-3 mb-4">
              <span className="px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/20 text-teal-300 text-xs font-semibold">
                {isAr ? item.categoryAr : item.categoryEn}
              </span>
              <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
                <Calendar className="w-3.5 h-3.5 text-teal-400" />
                <time dateTime={item.date}>{item.date}</time>
              </div>
            </div>

            <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-white tracking-tight leading-snug">
              {isAr ? item.titleAr : item.titleEn}
            </h1>
          </div>
        </section>

        {/* Article Body */}
        <section className="py-12 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="space-y-8">
            {/* Featured Image */}
            <div className="relative aspect-[16/9] w-full rounded-2xl overflow-hidden shadow-2xl border border-slate-800">
              <Image
                src={item.image}
                alt={isAr ? item.titleAr : item.titleEn}
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 896px"
                priority
              />
            </div>

            {/* Lead Summary */}
            <div className="p-6 rounded-xl bg-slate-900 border-s-4 border-teal-500 text-slate-200 text-base sm:text-lg font-medium leading-relaxed">
              {isAr ? item.summaryAr : item.summaryEn}
            </div>

            {/* Content text */}
            <div className="space-y-4 text-slate-300 text-base leading-relaxed">
              {contentParagraphs.map((para, pIdx) => (
                <p key={pIdx}>{para}</p>
              ))}
            </div>

            {/* Action Bar */}
            <div className="pt-8 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4">
              <Link
                href={`/${locale}/news`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-squircle bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 transition-colors"
              >
                <BackArrow className="w-4 h-4" />
                <span>{isAr ? 'العودة لجميع الأخبار' : 'Back to News'}</span>
              </Link>

              <Link
                href={`/${locale}/login`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-squircle bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold transition-colors"
              >
                <LogIn className="w-4 h-4" />
                <span>{isAr ? 'الدخول للبوابة الإلكترونية' : 'Access Electronic Portal'}</span>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <InstitutionalFooter locale={locale} />
    </div>
  );
}
