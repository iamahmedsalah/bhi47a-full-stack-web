import React from 'react';
import Link from 'next/link';
import { INSTITUTE_INFO } from '@/data/institutional-data';
import { MapPin, Phone, Mail, Clock, ShieldCheck, ArrowRight, ArrowLeft } from 'lucide-react';

interface ContactSectionProps {
  locale: string;
}

export function ContactSection({ locale }: ContactSectionProps) {
  const isAr = locale === 'ar';
  const ArrowIcon = isAr ? ArrowLeft : ArrowRight;

  return (
    <section id="contact" className="scroll-mt-20 py-20 sm:py-28 min-h-[600px] bg-slate-900 text-white relative overflow-hidden" aria-labelledby="contact-heading">
      {/* Subtle background glow */}
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Info Side */}
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/20 border border-teal-500/30 text-teal-300 text-xs font-semibold uppercase tracking-wider mb-4">
              <ShieldCheck className="w-4 h-4" />
              <span>{isAr ? 'تواصل مع المعهد' : 'Contact The Institute'}</span>
            </div>
            
            <h2 id="contact-heading" className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mb-4">
              {isAr ? 'نسعد دائماً بالتواصل معكم واستقبال استفساراتكم' : 'We Welcome Your Inquiries & Campus Visits'}
            </h2>
            
            <p className="text-slate-300 leading-relaxed text-base mb-8">
              {isAr
                ? 'فريق إدارة شؤون الطلاب وخدمة الاستعلامات بالمعهد العالي للعلوم الإدارية المتقدمة والحاسبات جاهز للرد على جميع استفساراتكم الأكاديمية والقبول والتسجيل.'
                : 'The Student Affairs and Inquiries Administration at BHI47a is always ready to answer your academic, admission, and registration questions.'}
            </p>

            <div className="space-y-4">
              <div className="flex items-start gap-4 p-4 rounded-xl bg-slate-800/80 border border-slate-700/80">
                <div className="p-2.5 rounded-lg bg-teal-500/20 text-teal-400 shrink-0 mt-0.5">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-200">
                    {isAr ? 'العنوان والمقر الرئيسي' : 'Campus Location'}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                    {isAr ? INSTITUTE_INFO.addressAr : INSTITUTE_INFO.addressEn}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-start gap-3.5 p-4 rounded-xl bg-slate-800/80 border border-slate-700/80">
                  <div className="p-2.5 rounded-lg bg-teal-500/20 text-teal-400 shrink-0">
                    <Phone className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-200">
                      {isAr ? 'الهاتف وشؤون الطلاب' : 'Phone Numbers'}
                    </h3>
                    <div className="mt-1 space-y-0.5 text-xs text-slate-400 font-mono" dir="ltr">
                      <p>{INSTITUTE_INFO.phone}</p>
                      <p>{INSTITUTE_INFO.phoneAlt}</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3.5 p-4 rounded-xl bg-slate-800/80 border border-slate-700/80">
                  <div className="p-2.5 rounded-lg bg-teal-500/20 text-teal-400 shrink-0">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-200">
                      {isAr ? 'البريد الإلكتروني' : 'Official Email'}
                    </h3>
                    <p className="mt-1 text-xs text-slate-400 font-mono" dir="ltr">
                      {INSTITUTE_INFO.email}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-4 p-4 rounded-xl bg-slate-800/80 border border-slate-700/80">
                <div className="p-2.5 rounded-lg bg-teal-500/20 text-teal-400 shrink-0">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-200">
                    {isAr ? 'مواعيد العمل الرسمية' : 'Official Working Hours'}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                    {isAr ? INSTITUTE_INFO.workingHoursAr : INSTITUTE_INFO.workingHoursEn}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-8">
              <Link
                href={`/${locale}/contact`}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-squircle bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-sm transition-colors shadow-lg shadow-teal-500/20"
              >
                <span>{isAr ? 'صفحة الاتصال ونموذج الاستفسار' : 'Full Contact & Inquiry Form'}</span>
                <ArrowIcon className="w-4 h-4" />
              </Link>
            </div>
          </div>

          {/* Quick Notice & FAQ Card */}
          <div className="bg-slate-800/90 border border-slate-700 p-8 rounded-2xl shadow-2xl relative">
            <h3 className="text-xl font-bold text-white mb-2">
              {isAr ? 'تنبيهات القبول والتحويل' : 'Admission & Transfer Inquiries'}
            </h3>
            <p className="text-sm text-slate-400 mb-6">
              {isAr
                ? 'يتم قبول الطلاب الجدد والتحويلات عن طريق مكتب تنسيق القبول بالجامعات والمعاهد المصرية وإدارة شؤون الطلاب بالمعهد وفقاً للضوابط الوزارية.'
                : 'New admissions and transfers are handled through the Egyptian Universities & Institutes Coordination Bureau and the BHI47a Student Affairs office.'}
            </p>

            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-700/60">
                <h4 className="text-sm font-semibold text-teal-300 mb-1">
                  {isAr ? 'شروط الالتحاق وقواعد القبول' : 'Admission Requirements'}
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {isAr
                    ? 'يقبل المعهد طلاب الثانوية العامة بشعبتيها (علمي وأدبي) والشهادات الفنية والتجارية المعادلة طبقاً للحد الأدنى الصادر عن وزارة التعليم العالي.'
                    : 'The institute accepts General Secondary graduates (scientific and literary) and technical/commercial equivalents per Ministry minimums.'}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-700/60">
                <h4 className="text-sm font-semibold text-teal-300 mb-1">
                  {isAr ? 'الدعم الفني والشكاوى الأكاديمية' : 'Technical Support & Academic Complaints'}
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed mb-3">
                  {isAr
                    ? 'للطلاب المقيدين بالمعهد، يمكنكم تقديم الشكاوى ومتابعة التذاكر الفنية مباشرة عبر نظام الشكاوى الإلكتروني.'
                    : 'Enrolled students can submit technical support inquiries and academic complaints directly through the electronic ticketing system.'}
                </p>
                <Link
                  href={`/${locale}/complaints`}
                  className="inline-flex items-center gap-1.5 text-xs text-teal-400 font-semibold hover:text-teal-300 underline underline-offset-4"
                >
                  <span>{isAr ? 'منظومة الشكاوى والاستفسارات الإلكترونية' : 'Electronic Complaints System'}</span>
                  <ArrowIcon className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-slate-700/60 flex items-center justify-between">
              <span className="text-xs text-slate-400">
                {isAr ? 'كود المعهد بالتنسيق: 47/أ' : 'Coordination Code: 47/A'}
              </span>
              <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                {isAr ? 'معتمد رسمياً' : 'Officially Accredited'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
