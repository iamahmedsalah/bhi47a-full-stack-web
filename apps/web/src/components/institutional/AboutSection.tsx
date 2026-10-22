import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  ShieldCheck,
  Building,
  Target,
  GraduationCap,
  ArrowRight,
  ArrowLeft,
  CheckCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { INSTITUTE_INFO } from '@/data/institutional-data';

interface AboutSectionProps {
  locale: string;
}

export function AboutSection({ locale }: AboutSectionProps) {
  const isAr = locale === 'ar';
  const ArrowIcon = isAr ? ArrowLeft : ArrowRight;

  return (
    <section
      id="about"
      className="scroll-mt-20 py-20 sm:py-24 border-b border-border/40 bg-background min-h-[550px]"
      dir={isAr ? 'rtl' : 'ltr'}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
          {/* Left Column: Campus Image with Overlay Cards */}
          <div className="relative">
            <div className="relative h-[360px] sm:h-[420px] w-full overflow-hidden rounded-2xl border border-border/60 shadow-lg">
              <Image
                src="/images/institutional/campus-hero.webp"
                alt="Institute Campus"
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent" />
            </div>

            {/* Float Highlight Badge */}
            <div className="absolute -bottom-6 start-6 rounded-xl border border-border/80 bg-card/95 p-4 shadow-xl backdrop-blur-md">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-squircle bg-primary/10 text-primary">
                  <Building className="h-6 w-6" />
                </div>
                <div>
                  <span className="text-xs font-semibold text-muted-foreground">
                    {isAr ? 'تاريخ التأسيس' : 'Established'}
                  </span>
                  <p className="text-base font-extrabold text-foreground">
                    {isAr ? 'عام 2006 ميلادياً' : 'Year 2006'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Institutional Overview */}
          <div className="flex flex-col gap-5 pt-4 lg:pt-0">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-primary">
                {isAr ? 'نبذة عن المعهد' : 'About The Institute'}
              </span>
              <h2 className="mt-2 text-2xl font-extrabold text-foreground sm:text-3xl leading-snug">
                {isAr
                  ? 'تعليم جامعي متطور يواكب الثورة الرقمية واحتياجات سوق العمل'
                  : 'Advanced Higher Education Aligned with Digital Transformation'}
              </h2>
            </div>

            <p className="text-sm leading-relaxed text-muted-foreground">
              {isAr
                ? 'أنشئ المعهد العالي للعلوم الإدارية المتقدمة والحاسبات (الكيلو 47 طريق الإسكندرية - القاهرة الصحراوي) بمقتضى قرار وزارة التعليم العالي، بهدف تقديم تعليم نوعي متميز في مجالات نظم معلومات الأعمال (BIS) والمحاسبة والمراجعة.'
                : 'The High Institute for Advanced Management Sciences and Computer (Km 47 Alexandria - Cairo Desert Road) was established under the Ministry of Higher Education decree to deliver specialized academic education in Business Information Systems (BIS) and Accounting.'}
            </p>

            {/* Core Values / Pillars */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="flex items-start gap-2.5 rounded-lg border border-border/60 bg-muted/20 p-3">
                <ShieldCheck className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                <div className="text-xs">
                  <strong className="block text-foreground font-bold">
                    {isAr ? 'اعتماد وزاري رسمي' : 'Accredited Degrees'}
                  </strong>
                  <span className="text-muted-foreground">
                    {isAr ? 'شهادات معادلة من المجلس الأعلى للجامعات' : 'Equivalency by Supreme Council of Universities'}
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-2.5 rounded-lg border border-border/60 bg-muted/20 p-3">
                <GraduationCap className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                <div className="text-xs">
                  <strong className="block text-foreground font-bold">
                    {isAr ? 'ساعات معتمدة مرنة' : 'Credit Hours System'}
                  </strong>
                  <span className="text-muted-foreground">
                    {isAr ? 'نظام دراسي مرن مع إرشاد أكاديمي متخصص' : 'Flexible academic progression with advising'}
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-4">
              <Button asChild className="gap-2 rounded-squircle">
                <Link href={`/${locale}/about`}>
                  <span>{isAr ? 'قراءة المزيد عن الرؤية والأهداف' : 'Read Vision & Mission'}</span>
                  <ArrowIcon className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
