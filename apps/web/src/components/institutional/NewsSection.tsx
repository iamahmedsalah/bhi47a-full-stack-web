import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Calendar, Clock, ArrowRight, ArrowLeft, ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { NEWS_ITEMS } from '@/data/institutional-data';

interface NewsSectionProps {
  locale: string;
}

export function NewsSection({ locale }: NewsSectionProps) {
  const isAr = locale === 'ar';
  const ArrowIcon = isAr ? ArrowLeft : ArrowRight;

  return (
    <section
      id="news"
      className="scroll-mt-20 py-20 sm:py-24 border-b border-border/40 bg-background min-h-[550px]"
      dir={isAr ? 'rtl' : 'ltr'}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-12">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-primary">
              {isAr ? 'الأخبار والإعلانات' : 'News & Announcements'}
            </span>
            <h2 className="mt-1 text-2xl font-extrabold text-foreground sm:text-3xl">
              {isAr ? 'أحدث أخبار المعهد والقرارات الأكاديمية' : 'Latest Institutional News & Notices'}
            </h2>
          </div>
          <Button asChild variant="outline" size="sm" className="gap-1.5 rounded-squircle self-start md:self-auto">
            <Link href={`/${locale}/news`}>
              <span>{isAr ? 'مركز الأخبار والإعلانات' : 'View All News'}</span>
              <ArrowIcon className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {NEWS_ITEMS.slice(0, 3).map((item) => (
            <Card
              key={item.id}
              className="group flex flex-col overflow-hidden border-border/80 bg-card transition-all duration-200 hover:border-primary/50 hover:shadow-md"
            >
              {/* Thumbnail Image */}
              <div className="relative h-48 w-full overflow-hidden bg-muted">
                <Image
                  src={item.image}
                  alt={isAr ? item.titleAr : item.titleEn}
                  fill
                  sizes="(max-width: 768px) 100vw, 33vw"
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <div className="absolute start-3 top-3 rounded-full bg-slate-950/80 px-2.5 py-1 text-[10px] font-bold text-white backdrop-blur-md">
                  {isAr ? item.categoryAr : item.categoryEn}
                </div>
              </div>

              {/* Content Body */}
              <div className="flex flex-1 flex-col justify-between p-5">
                <div>
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground mb-2">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3 text-primary" />
                      <span>{item.date}</span>
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3 text-primary" />
                      <span>{item.readTime}</span>
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-foreground leading-snug group-hover:text-primary transition-colors line-clamp-2">
                    {isAr ? item.titleAr : item.titleEn}
                  </h3>

                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground line-clamp-3">
                    {isAr ? item.summaryAr : item.summaryEn}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-border/60">
                  <Link
                    href={`/${locale}/news/${item.slug}`}
                    className="inline-flex items-center gap-1 text-xs font-bold text-primary group-hover:underline"
                  >
                    <span>{isAr ? 'قراءة البيان كاملاً' : 'Read Full Notice'}</span>
                    <ChevronRight className={isAr ? 'rotate-180 h-3.5 w-3.5' : 'h-3.5 w-3.5'} />
                  </Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
