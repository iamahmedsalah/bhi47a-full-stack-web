import React from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { routing } from '@/i18n/routing';
import { INSTITUTE_INFO } from '@/data/institutional-data';
import { getSiteUrl } from '@/lib/site-url';

import { InstitutionalHeader } from '@/components/institutional/InstitutionalHeader';
import { HeroSection } from '@/components/institutional/HeroSection';
import { QuickAccessSection } from '@/components/institutional/QuickAccessSection';
import { AboutSection } from '@/components/institutional/AboutSection';
import { ProgramsSection } from '@/components/institutional/ProgramsSection';
import { NewsSection } from '@/components/institutional/NewsSection';
import { EventsSection } from '@/components/institutional/EventsSection';
import { ActivitiesSection } from '@/components/institutional/ActivitiesSection';
import { GallerySection } from '@/components/institutional/GallerySection';
import { StudentServicesSection } from '@/components/institutional/StudentServicesSection';
import { DownloadsSection } from '@/components/institutional/DownloadsSection';
import { ContactSection } from '@/components/institutional/ContactSection';
import { FinalCTASection } from '@/components/institutional/FinalCTASection';
import { InstitutionalFooter } from '@/components/institutional/InstitutionalFooter';
import { ScrollReveal } from '@/components/ui/ScrollReveal';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === 'ar';

  const title = isAr
    ? `${INSTITUTE_INFO.nameAr} | الموقع الرسمي`
    : `${INSTITUTE_INFO.nameEn} | Official Website`;

  const description = isAr
    ? 'الموقع الرسمي للمعهد العالي للعلوم الإدارية المتقدمة والحاسبات (BHI47a). يقدم برامج بكالوريوس معتمدة في نظم معلومات الأعمال (BIS) والمحاسبة والمراجعة مع بوابة إلكترونية متطورة للطلاب.'
    : 'Official website of the High Institute for Advanced Management Sciences and Computer (BHI47a). Offering accredited bachelor programs in BIS and Accounting & Auditing with a modern student electronic portal.';

  const baseUrl = getSiteUrl();

  return {
    title,
    description,
    keywords: [
      'المعهد العالي للعلوم الإدارية المتقدمة والحاسبات',
      'BHI47a',
      'نظم معلومات إدارية',
      'BIS',
      'شعبة محاسبة ومراجعة',
      'علوم إدارية ومصرفية',
      'بوابة الطالب الإلكترونية',
      'تنسيق المعاهد العليا',
      'كود 47 أ',
      'High Institute for Advanced Management Sciences and Computer',
    ],
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
    alternates: {
      canonical: `${baseUrl}/${locale}`,
      languages: {
        ar: `${baseUrl}/ar`,
        en: `${baseUrl}/en`,
        'x-default': `${baseUrl}/ar`,
      },
    },
    openGraph: {
      title,
      description,
      url: `${baseUrl}/${locale}`,
      siteName: isAr ? INSTITUTE_INFO.name.ar : INSTITUTE_INFO.name.en,
      locale: isAr ? 'ar_EG' : 'en_US',
      alternateLocale: isAr ? ['en_US'] : ['ar_EG'],
      type: 'website',
      images: [
        {
          url: `${baseUrl}/images/og-preview.png`,
          width: 1200,
          height: 630,
          alt: isAr ? INSTITUTE_INFO.name.ar : INSTITUTE_INFO.name.en,
          type: 'image/png',
        },
        {
          url: `${baseUrl}/images/institutional/campus-hero.jpg`,
          width: 1200,
          height: 630,
          alt: isAr ? INSTITUTE_INFO.name.ar : INSTITUTE_INFO.name.en,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [`${baseUrl}/images/og-preview.png`],
    },
  };
}

export default async function InstitutionalHomePage({ params }: PageProps) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const isAr = locale === 'ar';
  const baseUrl = getSiteUrl();

  // EducationalOrganization & WebSite JSON-LD structured data
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'EducationalOrganization',
        '@id': `${baseUrl}/#organization`,
        name: isAr ? INSTITUTE_INFO.name.ar : INSTITUTE_INFO.name.en,
        alternateName: ['BHI47a', 'معهد 47أ', 'معهد العلوم الإدارية والحاسبات'],
        url: baseUrl,
        logo: `${baseUrl}/logo.webp`,
        image: `${baseUrl}/images/institutional/campus-hero.jpg`,
        description: isAr
          ? 'معهد عالي مصري معتمد من وزارة التعليم العالي يمنح درجة البكالوريوس في نظم معلومات الأعمال والمحاسبة والمراجعة.'
          : 'Accredited Egyptian Higher Institute offering bachelor degrees in Business Information Systems and Accounting & Auditing.',
        telephone: INSTITUTE_INFO.phones[0],
        email: INSTITUTE_INFO.email,
        address: {
          '@type': 'PostalAddress',
          streetAddress: isAr ? INSTITUTE_INFO.address.ar : INSTITUTE_INFO.address.en,
          addressLocality: isAr ? 'محافظة البحيرة' : 'Beheira Governorate',
          addressRegion: 'Beheira',
          addressCountry: 'EG',
        },
        hasOfferCatalog: {
          '@type': 'OfferCatalog',
          name: isAr ? 'البرامج الأكاديمية ودرجات البكالوريوس' : 'Academic Degree Programs',
          itemListElement: [
            {
              '@type': 'Course',
              name: isAr ? 'شعبة نظم معلومات الأعمال (BIS)' : 'Business Information Systems (BIS)',
              description: 'Bachelor degree in Business Information Systems combining IT, software engineering, databases, and business management.',
            },
            {
              '@type': 'Course',
              name: isAr ? 'شعبة المحاسبة والمراجعة' : 'Accounting & Auditing',
              description: 'Bachelor degree in Accounting, financial reporting, auditing, and corporate taxation.',
            },
          ],
        },
      },
      {
        '@type': 'WebSite',
        '@id': `${baseUrl}/#website`,
        url: baseUrl,
        name: isAr ? INSTITUTE_INFO.name.ar : INSTITUTE_INFO.name.en,
        publisher: {
          '@id': `${baseUrl}/#organization`,
        },
        inLanguage: ['ar-EG', 'en-US'],
      },
    ],
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-teal-500 selection:text-white">
      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Skip to Main Content Link for Accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:start-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-teal-600 focus:text-white focus:rounded-md focus:shadow-xl focus:outline-none"
      >
        {isAr ? 'الانتقال إلى المحتوى الرئيسي' : 'Skip to main content'}
      </a>

      {/* 1. HEADER */}
      <InstitutionalHeader locale={locale} />

      {/* Main Content Sections */}
      <main id="main-content" className="flex-grow">
        {/* 2. HERO */}
        <HeroSection locale={locale} />

        {/* 3. QUICK ACCESS */}
        <ScrollReveal>
          <QuickAccessSection locale={locale} />
        </ScrollReveal>

        {/* 4. ABOUT THE INSTITUTE */}
        <ScrollReveal>
          <AboutSection locale={locale} />
        </ScrollReveal>

        {/* 5. ACADEMIC PROGRAMS */}
        <ScrollReveal>
          <ProgramsSection locale={locale} />
        </ScrollReveal>

        {/* 6. LATEST NEWS */}
        <ScrollReveal>
          <NewsSection locale={locale} />
        </ScrollReveal>

        {/* 7. UPCOMING EVENTS */}
        <ScrollReveal>
          <EventsSection locale={locale} />
        </ScrollReveal>

        {/* 8. ACTIVITIES */}
        <ScrollReveal>
          <ActivitiesSection locale={locale} />
        </ScrollReveal>

        {/* 9. CAMPUS PHOTO GALLERY */}
        <ScrollReveal>
          <GallerySection locale={locale} />
        </ScrollReveal>

        {/* 10. STUDENT SERVICES */}
        <ScrollReveal>
          <StudentServicesSection locale={locale} />
        </ScrollReveal>

        {/* 11. DOWNLOADS / IMPORTANT RESOURCES */}
        <ScrollReveal>
          <DownloadsSection locale={locale} />
        </ScrollReveal>

        {/* 12. CONTACT */}
        <ScrollReveal>
          <ContactSection locale={locale} />
        </ScrollReveal>

        {/* 13. FINAL CTA */}
        <ScrollReveal>
          <FinalCTASection locale={locale} />
        </ScrollReveal>
      </main>

      {/* 13. FOOTER */}
      <InstitutionalFooter locale={locale} />
    </div>
  );
}
