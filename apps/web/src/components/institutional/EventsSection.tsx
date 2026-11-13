import React from 'react';
import Link from 'next/link';
import { Clock, MapPin, ArrowRight, ArrowLeft } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EVENTS } from '@/data/institutional-data';

interface EventsSectionProps {
  locale: string;
}

export function EventsSection({ locale }: EventsSectionProps) {
  const isAr = locale === 'ar';
  const ArrowIcon = isAr ? ArrowLeft : ArrowRight;

  return (
    <section
      id="events"
      className="scroll-mt-20 py-20 sm:py-24 border-b border-border/40 bg-muted/20 min-h-[550px]"
      dir={isAr ? 'rtl' : 'ltr'}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-12">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-primary">
              {isAr ? 'أجندة الفعاليات' : 'Events Calendar'}
            </span>
            <h2 className="mt-1 text-2xl font-extrabold text-foreground sm:text-3xl">
              {isAr ? 'الفعاليات وورش العمل القادمة' : 'Upcoming Workshops & Academic Events'}
            </h2>
          </div>
          <Button asChild variant="outline" size="sm" className="gap-1.5 rounded-squircle self-start md:self-auto">
            <Link href={`/${locale}/events`}>
              <span>{isAr ? 'أجندة الفعاليات كاملة' : 'View Full Schedule'}</span>
              <ArrowIcon className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {EVENTS.slice(0, 3).map((event) => {
            const dateParts = event.date.split('-');
            const year = dateParts[0];
            const month = dateParts[1];
            const day = dateParts[2];

            return (
              <Card
                key={event.id}
                className="flex flex-col justify-between border-border/80 bg-card p-6 shadow-sm transition-all duration-200 hover:border-primary/50 hover:shadow-md"
              >
                <div>
                  <div className="flex items-start gap-4 mb-4">
                    {/* Date Block */}
                    <div className="flex flex-col items-center justify-center rounded-xl bg-primary/10 border border-primary/20 px-3 py-2 text-center shrink-0">
                      <span className="text-xs font-bold uppercase text-primary">
                        {isAr ? 'يوم' : 'Day'}
                      </span>
                      <span className="text-xl font-extrabold text-foreground leading-none">
                        {day}
                      </span>
                      <span className="text-[10px] text-muted-foreground mt-0.5">
                        {year}/{month}
                      </span>
                    </div>

                    <div>
                      <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                        {isAr ? event.categoryAr : event.categoryEn}
                      </span>
                      <h3 className="mt-1.5 text-base font-bold text-foreground leading-snug">
                        {isAr ? event.titleAr : event.titleEn}
                      </h3>
                    </div>
                  </div>

                  <p className="text-xs leading-relaxed text-muted-foreground line-clamp-3">
                    {isAr ? event.descriptionAr : event.descriptionEn}
                  </p>
                </div>

                <div className="mt-6 flex flex-col gap-2 border-t border-border/60 pt-4 text-[11px] text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span>{isAr ? event.timeAr : event.timeEn}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span>{isAr ? event.locationAr : event.locationEn}</span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
