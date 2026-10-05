import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  GraduationCap,
  MapPin,
  Phone,
  Mail,
  Clock,
  ShieldCheck,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { INSTITUTE_INFO } from '@/data/institutional-data';
import { cn } from '@/lib/utils';

interface InstitutionalFooterProps {
  locale: string;
}

export function InstitutionalFooter({ locale }: InstitutionalFooterProps) {
  const isAr = locale === 'ar';
  const currentYear = new Date().getFullYear();

  const quickLinks = [
    { href: `/${locale}`, labelAr: 'الرئيسية', labelEn: 'Home' },
    { href: `/${locale}/about`, labelAr: 'عن المعهد والرؤية', labelEn: 'About & Vision' },
    { href: `/${locale}/academics`, labelAr: 'البرامج الدراسية (BIS والمحاسبة)', labelEn: 'Programs (BIS & Accounting)' },
    { href: `/${locale}/activities`, labelAr: 'الأنشطة الطلابية والنوادي', labelEn: 'Student Clubs & Activities' },
    { href: `/${locale}/news`, labelAr: 'الأخبار والإعلانات الرسمية', labelEn: 'Official News & Notices' },
    { href: `/${locale}/events`, labelAr: 'أجندة الفعاليات الأكاديمية', labelEn: 'Academic Events Calendar' },
    { href: `/${locale}/downloads`, labelAr: 'دليل الطالب والنماذج الرسمية', labelEn: 'Student Handbook & Forms' },
    { href: `/${locale}/contact`, labelAr: 'اتصل بنا وموقع المعهد', labelEn: 'Contact Us & Campus Location' },
  ];

  const portalLinks = [
    { href: `/${locale}/login`, labelAr: 'بوابة الخدمات الإلكترونية', labelEn: 'Electronic Services Portal' },
    { href: `/${locale}/login/student`, labelAr: 'تسجيل دخول الطالب', labelEn: 'Student Portal Login' },
    { href: `/${locale}/complaints`, labelAr: 'منظومة الشكاوى والدعم الفني', labelEn: 'Complaints & Technical Support' },
    { href: `/${locale}/login/admin`, labelAr: 'بوابة الإدارة وهيئة التدريس', labelEn: 'Admin & Faculty Portal' },
    { href: `/${locale}/downloads`, labelAr: 'التقويم الأكاديمي 2026-2027', labelEn: 'Academic Calendar 2026-2027' },
  ];

  return (
    <footer
      className="border-t border-border bg-slate-950 text-slate-200"
      dir={isAr ? 'rtl' : 'ltr'}
    >
      {/* Upper Main Footer Grid */}
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:py-16">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-4">
          {/* Column 1: Institute Identity & Mission */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="relative h-12 w-12 shrink-0 rounded-full bg-white/10 p-1">
                <Image
                  src="/logo.webp"
                  alt="Institute Logo"
                  width={48}
                  height={48}
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="flex flex-col text-start">
                <span className="text-sm font-bold text-white sm:text-base">
                  {isAr ? INSTITUTE_INFO.nameAr : INSTITUTE_INFO.nameEn}
                </span>
                <span className="text-xs text-primary-light">
                  {isAr ? 'كود المعهد: 47 | طريق الإسكندرية الصحراوي' : 'Institute Code: 47 | Alex Desert Rd'}
                </span>
              </div>
            </div>

            <p className="text-xs leading-relaxed text-slate-400 sm:text-sm">
              {isAr
                ? 'مؤسسة تعليمية جامعية معتمدة من وزارة التعليم العالي والبحث العلمي بجمهورية مصر العربية، تمنح درجتي البكالوريوس في نظم معلومات الأعمال (BIS) والمحاسبة والمراجعة بنظام الساعات المعتمدة.'
                : 'A distinguished higher-education institution accredited by the Egyptian Ministry of Higher Education, granting accredited Bachelor degrees in Business Information Systems (BIS) and Accounting under the Credit Hours System.'}
            </p>

            <div className="mt-2 flex items-center gap-2 rounded-squircle bg-white/5 p-3 text-xs text-slate-300 border border-white/10">
              <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-400" />
              <span>
                {isAr
                  ? 'معتمد وخاضع لإشراف وزارة التعليم العالي المصرية'
                  : 'Accredited by Egyptian Ministry of Higher Education'}
              </span>
            </div>
          </div>

          {/* Column 2: Quick Institutional Links */}
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              {isAr ? 'روابط الموقع الرئيسي' : 'Institutional Navigation'}
            </h3>
            <ul className="flex flex-col gap-2 text-xs sm:text-sm">
              {quickLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="inline-flex items-center gap-1.5 text-slate-400 transition-colors hover:text-primary-light"
                  >
                    <ChevronRight className={cn('h-3.5 w-3.5 text-primary-light', isAr && 'rotate-180')} />
                    <span>{isAr ? link.labelAr : link.labelEn}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 3: Portal & Student Services */}
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              {isAr ? 'البوابة والخدمات الطلابية' : 'Portal & Online Services'}
            </h3>
            <ul className="flex flex-col gap-2 text-xs sm:text-sm">
              {portalLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="inline-flex items-center gap-1.5 text-slate-400 transition-colors hover:text-primary-light"
                  >
                    <ChevronRight className={cn('h-3.5 w-3.5 text-primary-light', isAr && 'rotate-180')} />
                    <span>{isAr ? link.labelAr : link.labelEn}</span>
                  </Link>
                </li>
              ))}
            </ul>

            <div className="mt-4 rounded-squircle bg-primary/20 p-4 border border-primary/30">
              <div className="flex items-center gap-2 text-xs font-bold text-primary-light">
                <GraduationCap className="h-4 w-4" />
                <span>{isAr ? 'بوابة الطالب الإلكترونية' : 'Electronic Student Portal'}</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-300">
                {isAr
                  ? 'تسجيل المقررات، إعلان النتائج، والبريد الأكاديمي'
                  : 'Course registration, exam grades, and academic emails'}
              </p>
              <Link
                href={`/${locale}/login`}
                className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-white underline hover:text-primary-light"
              >
                <span>{isAr ? 'الدخول للبوابة الآن' : 'Access Portal Now'}</span>
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </div>

          {/* Column 4: Contact & Working Hours */}
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              {isAr ? 'التواصل ومقر المعهد' : 'Contact & Campus'}
            </h3>

            <div className="flex flex-col gap-3 text-xs sm:text-sm text-slate-400">
              <div className="flex items-start gap-2.5">
                <MapPin className="h-4 w-4 shrink-0 text-primary-light mt-0.5" />
                <span>{isAr ? INSTITUTE_INFO.addressAr : INSTITUTE_INFO.addressEn}</span>
              </div>

              <div className="flex items-center gap-2.5">
                <Phone className="h-4 w-4 shrink-0 text-primary-light" />
                <span dir="ltr">{INSTITUTE_INFO.phone} - {INSTITUTE_INFO.phoneAlt}</span>
              </div>

              <div className="flex items-center gap-2.5">
                <Mail className="h-4 w-4 shrink-0 text-primary-light" />
                <span dir="ltr">{INSTITUTE_INFO.email}</span>
              </div>

              <div className="flex items-start gap-2.5">
                <Clock className="h-4 w-4 shrink-0 text-primary-light mt-0.5" />
                <span>{isAr ? INSTITUTE_INFO.workingHoursAr : INSTITUTE_INFO.workingHoursEn}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Sub-Bar */}
      <div className="border-t border-white/10 bg-slate-950/80 px-4 py-4 text-center text-xs text-slate-400">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 sm:flex-row">
          <p>
            {isAr
              ? `جميع الحقوق محفوظة © ${currentYear} | ${INSTITUTE_INFO.nameAr}`
              : `All Rights Reserved © ${currentYear} | ${INSTITUTE_INFO.nameEn}`}
          </p>
          <p className="text-[11px] text-slate-400">
            {isAr
              ? 'تطوير وتشغيل: قسم تكنولوجيا المعلومات بالمعهد'
              : 'Developed & Maintained by IT Department'}
          </p>
        </div>
      </div>
    </footer>
  );
}
