import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { routing } from '@/i18n/routing';
import { INSTITUTE_INFO } from '@/data/institutional-data';
import { InstitutionalHeader } from '@/components/institutional/InstitutionalHeader';
import { InstitutionalFooter } from '@/components/institutional/InstitutionalFooter';
import { ContactForm } from '@/components/institutional/ContactForm';
import { MapPin, Phone, Mail, Clock, ShieldCheck, ChevronRight, ChevronLeft, MessageSquare } from 'lucide-react';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === 'ar';

  return {
    title: isAr
      ? `اتصل بنا ومقر المعهد | ${INSTITUTE_INFO.nameAr}`
      : `Contact Us & Campus Location | ${INSTITUTE_INFO.nameEn}`,
    description: isAr
      ? 'أرقام هواتف وعنوان ومواعيد عمل المعهد العالي للعلوم الإدارية المتقدمة والحاسبات ونموذج إرسال الاستفسارات الرسمية.'
      : 'Phone numbers, campus location, working hours, and inquiry form for BHI47a.',
  };
}

export default async function ContactPage({ params }: PageProps) {
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
              <span className="text-teal-400 font-medium">{isAr ? 'اتصل بنا' : 'Contact'}</span>
            </nav>

            <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight">
              {isAr ? 'تواصل مع إدارة المعهد' : 'Contact Administration & Inquiries'}
            </h1>
            <p className="mt-3 text-slate-300 max-w-3xl text-sm sm:text-base leading-relaxed">
              {isAr
                ? 'فريق شؤون الطلاب والاستعلامات بالمعهد العالي للعلوم الإدارية المتقدمة والحاسبات يسعد بتلقي استفساراتكم.'
                : 'Our Student Affairs and Admissions staff are ready to assist prospective students and visitors.'}
            </p>
          </div>
        </section>

        {/* Content Section */}
        <section className="py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            {/* Contact Details Card Side */}
            <div className="lg:col-span-5 space-y-6">
              <div className="p-8 rounded-2xl bg-slate-900 border border-slate-800 space-y-6">
                <h2 className="text-xl font-bold text-white border-b border-slate-800 pb-4">
                  {isAr ? 'بيانات الاتصال الرسمية' : 'Official Contact Information'}
                </h2>

                <div className="space-y-4">
                  <div className="flex items-start gap-4">
                    <div className="p-2.5 rounded-lg bg-teal-500/20 text-teal-400 shrink-0">
                      <MapPin className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        {isAr ? 'المقر والعنوان' : 'Campus Address'}
                      </h3>
                      <p className="text-sm font-medium text-slate-200 mt-1">
                        {isAr ? INSTITUTE_INFO.addressAr : INSTITUTE_INFO.addressEn}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="p-2.5 rounded-lg bg-teal-500/20 text-teal-400 shrink-0">
                      <Phone className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        {isAr ? 'أرقام الهواتف' : 'Telephone Numbers'}
                      </h3>
                      <div className="mt-1 space-y-1 text-sm font-mono text-slate-200" dir="ltr">
                        <p>{INSTITUTE_INFO.phone}</p>
                        <p>{INSTITUTE_INFO.phoneAlt}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="p-2.5 rounded-lg bg-teal-500/20 text-teal-400 shrink-0">
                      <Mail className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        {isAr ? 'البريد الإلكتروني الرسمي' : 'Official Email'}
                      </h3>
                      <p className="mt-1 text-sm font-mono text-slate-200" dir="ltr">
                        {INSTITUTE_INFO.email}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="p-2.5 rounded-lg bg-teal-500/20 text-teal-400 shrink-0">
                      <Clock className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        {isAr ? 'أيام وساعات العمل الرسمية' : 'Official Working Hours'}
                      </h3>
                      <p className="text-sm font-medium text-slate-200 mt-1">
                        {isAr ? INSTITUTE_INFO.workingHoursAr : INSTITUTE_INFO.workingHoursEn}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-800">
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
                    <span className="text-slate-400">{isAr ? 'رقم طابع التنسيق:' : 'Coordination Code:'}</span>
                    <span className="font-bold text-teal-400 text-sm">47/أ</span>
                  </div>
                </div>
              </div>

              {/* Complaints portal callout */}
              <div className="p-6 rounded-2xl bg-gradient-to-br from-emerald-950/40 to-slate-900 border border-emerald-500/30">
                <div className="flex items-center gap-3 mb-2">
                  <MessageSquare className="w-5 h-5 text-emerald-400" />
                  <h3 className="text-sm font-bold text-white">
                    {isAr ? 'للطلاب المقيدين بالمعهد' : 'For Enrolled Students'}
                  </h3>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed mb-4">
                  {isAr
                    ? 'إذا كان لديك طلب صيانة فنية، استعلام أكاديمي، أو شكوى، يرجى تقديم تذكرة عبر منظومة الشكاوى لمتابعة الرد رسمياً.'
                    : 'For technical support, academic queries, or formal complaints, submit a ticket through the complaints system.'}
                </p>
                <Link
                  href={`/${locale}/complaints`}
                  className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-bold hover:text-emerald-300 underline underline-offset-4"
                >
                  <span>{isAr ? 'الانتقال إلى منظومة الشكاوى' : 'Complaints & Support Portal'}</span>
                  <ChevronIcon className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            {/* Interactive Form Side */}
            <div className="lg:col-span-7">
              <ContactForm locale={locale} />
            </div>
          </div>
        </section>
      </main>

      <InstitutionalFooter locale={locale} />
    </div>
  );
}
