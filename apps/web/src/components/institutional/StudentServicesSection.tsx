import React from 'react';
import Link from 'next/link';
import { GraduationCap, MessageSquare, FileText, UserCheck, ArrowRight, ArrowLeft } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface StudentServicesSectionProps {
  locale: string;
}

export function StudentServicesSection({ locale }: StudentServicesSectionProps) {
  const isAr = locale === 'ar';
  const ArrowIcon = isAr ? ArrowLeft : ArrowRight;

  const services = [
    {
      titleAr: 'البوابة الإلكترونية للطالب',
      titleEn: 'Student Electronic Portal',
      descriptionAr:
        'بوابة الخدمات الذاتية للاطلاع على نتائج الامتحانات، المقررات المسجلة، البريد الأكاديمي، وجداول الاختبارات.',
      descriptionEn:
        'Self-service portal for grades, registered courses, institutional academic email, and exam schedules.',
      icon: <GraduationCap className="h-8 w-8 text-primary" />,
      href: `/${locale}/login`,
      isPrimary: true,
      badgeAr: 'الخدمة المركزية',
      badgeEn: 'Central Hub',
    },
    {
      titleAr: 'منظومة الشكاوى والدعم الفني',
      titleEn: 'Complaints & Technical Support',
      descriptionAr:
        'إرسال ومتابعة البلاغات والاستفسارات الفنية والأكاديمية مباشرة دون الحاجة لتسجيل دخول مسبق.',
      descriptionEn:
        'Submit and track academic inquiries and technical issues directly without prior login required.',
      icon: <MessageSquare className="h-8 w-8 text-emerald-500" />,
      href: `/${locale}/complaints`,
      isPrimary: false,
      badgeAr: 'متاح للجميع',
      badgeEn: 'Public Access',
    },
    {
      titleAr: 'الإرشاد والتسجيل الأكاديمي',
      titleEn: 'Academic Advising & Registration',
      descriptionAr:
        'متابعة الخطط الدراسية والساعات المعتمدة بالتنسيق مع المرشد الأكاديمي المخصص لكل طالب.',
      descriptionEn:
        'Curriculum progression and credit hour enrollment in coordination with dedicated faculty advisors.',
      icon: <UserCheck className="h-8 w-8 text-sky-500" />,
      href: `/${locale}/login/student`,
      isPrimary: false,
      badgeAr: 'ساعات معتمدة',
      badgeEn: 'Advising',
    },
    {
      titleAr: 'مركز النماذج والتحميلات',
      titleEn: 'Forms & Download Center',
      descriptionAr:
        'تحميل النماذج الأكاديمية الرسمية، طلبات إثبات القيد، والتقويم الجامعي المعتمد بصيغة PDF.',
      descriptionEn:
        'Official academic forms, enrollment requests, and the approved academic calendar in PDF format.',
      icon: <FileText className="h-8 w-8 text-amber-500" />,
      href: `/${locale}/downloads`,
      isPrimary: false,
      badgeAr: 'تحميل مباشر',
      badgeEn: 'Direct Download',
    },
  ];

  return (
    <section
      className="py-16 sm:py-20 border-b border-border/40 bg-background"
      dir={isAr ? 'rtl' : 'ltr'}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="text-xs font-bold uppercase tracking-wider text-primary">
            {isAr ? 'الخدمات الطلابية الذكية' : 'Digital Student Services'}
          </span>
          <h2 className="mt-2 text-2xl font-extrabold text-foreground sm:text-3xl">
            {isAr ? 'منظومة خدمات رقمية متكاملة للطلاب' : 'Integrated Digital Services for Students'}
          </h2>
          <p className="mt-3 text-xs sm:text-sm text-muted-foreground">
            {isAr
              ? 'يوفر المعهد منظومة متطورة تتيح للطالب متابعة كافة شؤونه الأكاديمية والخدمية بسهولة وعلى مدار الساعة.'
              : 'The Institute delivers modern digital systems enabling students to manage academic records around the clock.'}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {services.map((service, idx) => (
            <Card
              key={idx}
              className={`flex flex-col justify-between p-6 sm:p-8 transition-all duration-200 border-border/80 hover:shadow-lg ${
                service.isPrimary
                  ? 'border-primary/40 bg-gradient-to-br from-primary/10 via-card to-card hover:border-primary'
                  : 'bg-card hover:border-border'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-muted/60 shadow-inner">
                    {service.icon}
                  </div>
                  <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-bold text-muted-foreground">
                    {isAr ? service.badgeAr : service.badgeEn}
                  </span>
                </div>

                <h3 className="text-xl font-bold text-foreground">
                  {isAr ? service.titleAr : service.titleEn}
                </h3>

                <p className="mt-3 text-xs sm:text-sm leading-relaxed text-muted-foreground">
                  {isAr ? service.descriptionAr : service.descriptionEn}
                </p>
              </div>

              <div className="mt-8 pt-4 border-t border-border/60">
                <Button
                  asChild
                  className={`w-full h-11 gap-2 rounded-squircle text-sm font-bold ${
                    service.isPrimary
                      ? 'bg-primary text-primary-foreground hover:bg-primary-hover shadow-md'
                      : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                  }`}
                >
                  <Link href={service.href}>
                    <span>{isAr ? 'الانتقال إلى الخدمة' : 'Open Service'}</span>
                    <ArrowIcon className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
