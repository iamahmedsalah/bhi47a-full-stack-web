import React from 'react';
import Link from 'next/link';
import {
  GraduationCap,
  BookOpen,
  Bell,
  MessageSquare,
  Download,
  MapPin,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { QUICK_ACCESS_LINKS } from '@/data/institutional-data';

interface QuickAccessSectionProps {
  locale: string;
}

export function QuickAccessSection({ locale }: QuickAccessSectionProps) {
  const isAr = locale === 'ar';
  const ArrowIcon = isAr ? ArrowLeft : ArrowRight;

  const iconMap: Record<string, React.ReactNode> = {
    GraduationCap: <GraduationCap className="h-6 w-6 text-primary" />,
    BookOpen: <BookOpen className="h-6 w-6 text-primary" />,
    Bell: <Bell className="h-6 w-6 text-primary" />,
    MessageSquare: <MessageSquare className="h-6 w-6 text-primary" />,
    Download: <Download className="h-6 w-6 text-primary" />,
    MapPin: <MapPin className="h-6 w-6 text-primary" />,
  };

  return (
    <section
      className="py-12 bg-muted/20 border-b border-border/40"
      dir={isAr ? 'rtl' : 'ltr'}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-primary">
              {isAr ? 'الوصول السريع' : 'Quick Access'}
            </span>
            <h2 className="mt-1 text-xl font-extrabold text-foreground sm:text-2xl">
              {isAr ? 'الخدمات والروابط الأكثر استخداماً' : 'Most Frequently Accessed Services'}
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground max-w-md">
            {isAr
              ? 'روابط مباشرة لخدمات الطلاب، التسجيل الأكاديمي، البوابة الإلكترونية ومنظومة الشكاوى.'
              : 'Direct navigation to student records, advising, portal hub, and academic inquiries.'}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_ACCESS_LINKS.map((link) => {
            const isPortal = link.id === 'portal';

            return (
              <Link
                key={link.id}
                href={link.href.startsWith('/') ? `/${locale}${link.href}` : link.href}
                className="group block"
              >
                <Card
                  className={`h-full p-5 transition-all duration-200 border-border/70 hover:border-primary/50 hover:shadow-md ${
                    isPortal ? 'bg-primary/5 border-primary/30' : 'bg-card'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-squircle bg-primary/10 transition-colors group-hover:bg-primary/20">
                      {iconMap[link.icon]}
                    </div>
                    <span className="inline-flex items-center text-xs font-semibold text-primary opacity-0 transition-opacity group-hover:opacity-100">
                      <span>{isAr ? 'دخول' : 'Access'}</span>
                      <ArrowIcon className="h-3 w-3 ms-1" />
                    </span>
                  </div>

                  <h3 className="mt-4 text-base font-bold text-foreground group-hover:text-primary transition-colors">
                    {isAr ? link.titleAr : link.titleEn}
                  </h3>

                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    {isAr ? link.descriptionAr : link.descriptionEn}
                  </p>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
