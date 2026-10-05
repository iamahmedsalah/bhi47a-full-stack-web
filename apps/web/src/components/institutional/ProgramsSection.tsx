import React from 'react';
import Link from 'next/link';
import {
  Code,
  Calculator,
  Briefcase,
  Clock,
  Award,
  ArrowRight,
  ArrowLeft,
  ChevronRight,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ACADEMIC_PROGRAMS } from '@/data/institutional-data';

interface ProgramsSectionProps {
  locale: string;
}

export function ProgramsSection({ locale }: ProgramsSectionProps) {
  const isAr = locale === 'ar';
  const ArrowIcon = isAr ? ArrowLeft : ArrowRight;

  const iconMap: Record<string, React.ReactNode> = {
    bis: <Code className="h-6 w-6 text-primary" />,
    accounting: <Calculator className="h-6 w-6 text-primary" />,
  };

  return (
    <section
      id="academics"
      className="scroll-mt-20 py-20 sm:py-24 border-b border-border/40 bg-muted/20 min-h-[550px]"
      dir={isAr ? 'rtl' : 'ltr'}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-12">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-primary">
              {isAr ? 'البرامج الدراسية والشعب' : 'Academic Programs'}
            </span>
            <h2 className="mt-1 text-2xl font-extrabold text-foreground sm:text-3xl">
              {isAr ? 'شعبتان أكاديميتان متخصصتان لسوق العمل' : 'Two High-Demand Specialized Disciplines'}
            </h2>
          </div>
          <Button asChild variant="outline" size="sm" className="gap-1.5 rounded-squircle self-start md:self-auto">
            <Link href={`/${locale}/academics`}>
              <span>{isAr ? 'دليل الشعب والمقررات' : 'Curriculum Guide'}</span>
              <ArrowIcon className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 max-w-5xl mx-auto">
          {ACADEMIC_PROGRAMS.map((program) => (
            <Card
              key={program.id}
              className="flex flex-col justify-between border-border/80 bg-card p-6 shadow-sm transition-all duration-200 hover:border-primary/50 hover:shadow-md"
            >
              <div>
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-squircle bg-primary/10">
                    {iconMap[program.id]}
                  </div>
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-[11px] font-bold text-primary">
                    {program.code}
                  </span>
                </div>

                <h3 className="text-lg font-bold text-foreground">
                  {isAr ? program.titleAr : program.titleEn}
                </h3>

                <p className="mt-2 text-xs font-medium text-primary">
                  {isAr ? program.degreeAr : program.degreeEn}
                </p>

                <p className="mt-3 text-xs leading-relaxed text-muted-foreground line-clamp-3">
                  {isAr ? program.descriptionAr : program.descriptionEn}
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5 text-primary" />
                    <span>{program.creditHours} {isAr ? 'ساعة معتمدة' : 'Credits'}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Award className="h-3.5 w-3.5 text-primary" />
                    <span>{isAr ? program.durationAr : program.durationEn}</span>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-3 border-t border-border/60">
                <Button asChild variant="ghost" size="sm" className="w-full justify-between rounded-squircle text-xs font-bold text-primary hover:bg-primary/10">
                  <Link href={`/${locale}/academics`}>
                    <span>{isAr ? 'تفاصيل الشعبة والخطة الدراسية' : 'Curriculum Details'}</span>
                    <ChevronRight className={isAr ? 'rotate-180 h-4 w-4' : 'h-4 w-4'} />
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

interface HeroSectionProps {
  locale: string;
}
