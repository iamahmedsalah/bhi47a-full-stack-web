import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Trophy,
  Code2,
  Users2,
  HeartHandshake,
  Compass,
  Award,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Layers,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ACTIVITIES } from '@/data/institutional-data';

interface ActivitiesSectionProps {
  locale: string;
}

export function ActivitiesSection({ locale }: ActivitiesSectionProps) {
  const isAr = locale === 'ar';
  const ArrowIcon = isAr ? ArrowLeft : ArrowRight;

  const iconMap: Record<string, React.ReactNode> = {
    scientific: <Code2 className="h-4 w-4 text-teal-300" />,
    sports: <Trophy className="h-4 w-4 text-teal-300" />,
    cultural: <Users2 className="h-4 w-4 text-teal-300" />,
    social: <HeartHandshake className="h-4 w-4 text-teal-300" />,
  };

  return (
    <section
      id="activities"
      className="scroll-mt-20 py-20 sm:py-24 border-b border-border/40 bg-background min-h-[550px]"
      dir={isAr ? 'rtl' : 'ltr'}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-12">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-wider mb-2">
              <Layers className="w-3.5 h-3.5" />
              <span>{isAr ? 'الحياة الطلابية والأنشطة' : 'Student Life & Activities'}</span>
            </div>
            <h2 className="text-2xl font-extrabold text-foreground sm:text-3xl">
              {isAr ? 'الأنشطة والاتحادات الطلابية' : 'Student Activities & Campus Clubs'}
            </h2>
            <p className="mt-2 text-xs sm:text-sm text-muted-foreground max-w-2xl leading-relaxed">
              {isAr
                ? 'بيئة تعليمية متكاملة تجمع بين الأنشطة الرياضية والعلمية، والمعامل التكنولوجية المتقدمة والمساحات الخضراء.'
                : 'An integrated campus experience featuring student clubs, competitive sports, state-of-the-art computer labs, and modern study spaces.'}
            </p>
          </div>
          <Button asChild variant="outline" size="sm" className="gap-1.5 rounded-squircle self-start md:self-auto">
            <Link href={`/${locale}/activities`}>
              <Compass className="h-4 w-4 text-primary" />
              <span>{isAr ? 'استعراض كافة الأنشطة' : 'Explore All Activities'}</span>
              <ArrowIcon className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        {/* Activities Cards Grid - 4 Columns */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {ACTIVITIES.map((activity) => (
            <Card
              key={activity.id}
              className="group flex flex-col overflow-hidden border-border/80 bg-card shadow-sm transition-all duration-300 hover:border-primary/50 hover:shadow-lg"
            >
              <div className="relative h-48 w-full overflow-hidden bg-muted">
                <Image
                  src={activity.image}
                  alt={isAr ? activity.titleAr : activity.titleEn}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-transparent" />
                <div className="absolute bottom-3 start-3 flex items-center gap-1.5 rounded-full bg-slate-950/80 px-3 py-1 text-xs font-bold text-white backdrop-blur-md border border-white/10">
                  {iconMap[activity.category] || <Award className="h-4 w-4 text-teal-300" />}
                  <span>{isAr ? activity.categoryAr : activity.categoryEn}</span>
                </div>
              </div>

              <div className="flex flex-1 flex-col justify-between p-5">
                <div>
                  <h3 className="text-base font-bold text-foreground group-hover:text-primary transition-colors">
                    {isAr ? activity.titleAr : activity.titleEn}
                  </h3>

                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground line-clamp-2">
                    {isAr ? activity.descriptionAr : activity.descriptionEn}
                  </p>

                  <ul className="mt-4 flex flex-col gap-1.5 border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
                    {(isAr ? activity.highlightsAr : activity.highlightsEn).map((hl, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <CheckCircle2 className="h-3 w-3 text-primary shrink-0" />
                        <span className="line-clamp-1">{hl}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
