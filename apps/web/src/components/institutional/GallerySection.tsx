import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Camera, ArrowRight, ArrowLeft } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { GALLERY_ITEMS } from '@/data/institutional-data';

interface GallerySectionProps {
  locale: string;
}

export function GallerySection({ locale }: GallerySectionProps) {
  const isAr = locale === 'ar';
  const ArrowIcon = isAr ? ArrowLeft : ArrowRight;

  return (
    <section
      id="gallery"
      className="scroll-mt-20 py-20 sm:py-24 border-b border-border/40 bg-muted/20 min-h-[550px]"
      dir={isAr ? 'rtl' : 'ltr'}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-12">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-primary">
              {isAr ? 'معرض الصور والمرافق' : 'Campus & Facilities'}
            </span>
            <h2 className="mt-1 text-2xl font-extrabold text-foreground sm:text-3xl">
              {isAr ? 'جولة مصورة في مرافق وقاعات المعهد' : 'A Visual Tour of Campus Facilities'}
            </h2>
          </div>
          <Button asChild variant="outline" size="sm" className="gap-1.5 rounded-squircle self-start md:self-auto">
            <Link href={`/${locale}/gallery`}>
              <Camera className="h-4 w-4" />
              <span>{isAr ? 'معرض الصور كاملاً' : 'View Full Gallery'}</span>
              <ArrowIcon className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {GALLERY_ITEMS.map((item) => (
            <Card
              key={item.id}
              className="group overflow-hidden rounded-xl border-border/80 bg-card shadow-sm transition-all duration-200 hover:border-primary/50 hover:shadow-lg"
            >
              <div className="relative h-60 w-full overflow-hidden bg-muted">
                <Image
                  src={item.image}
                  alt={isAr ? item.titleAr : item.titleEn}
                  fill
                  sizes="(max-width: 768px) 100vw, 33vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-transparent" />
                <div className="absolute bottom-4 start-4 end-4 text-white">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-teal-300">
                    {isAr ? item.categoryAr : item.categoryEn}
                  </span>
                  <h3 className="text-base font-bold leading-tight mt-1">
                    {isAr ? item.titleAr : item.titleEn}
                  </h3>
                  <p className="mt-1 text-xs text-slate-300 line-clamp-2">
                    {isAr ? item.descriptionAr : item.descriptionEn}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
