import React from 'react';
import Link from 'next/link';
import { FileText, Download, ArrowRight, ArrowLeft } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DOWNLOAD_DOCUMENTS } from '@/data/institutional-data';

interface DownloadsSectionProps {
  locale: string;
}

export function DownloadsSection({ locale }: DownloadsSectionProps) {
  const isAr = locale === 'ar';
  const ArrowIcon = isAr ? ArrowLeft : ArrowRight;

  return (
    <section
      id="downloads"
      className="scroll-mt-20 py-20 sm:py-24 border-b border-border/40 bg-muted/20 min-h-[550px]"
      dir={isAr ? 'rtl' : 'ltr'}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-12">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-primary">
              {isAr ? 'النماذج والوثائق المهمة' : 'Forms & Important Documents'}
            </span>
            <h2 className="mt-1 text-2xl font-extrabold text-foreground sm:text-3xl">
              {isAr ? 'مركز تحميل اللوائح والنماذج الرسمية' : 'Regulations, Forms & Calendar Downloads'}
            </h2>
          </div>
          <Button asChild variant="outline" size="sm" className="gap-1.5 rounded-squircle self-start md:self-auto">
            <Link href={`/${locale}/downloads`}>
              <span>{isAr ? 'جميع النماذج واللوائح' : 'All Documents & Forms'}</span>
              <ArrowIcon className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {DOWNLOAD_DOCUMENTS.slice(0, 3).map((doc) => (
            <Card
              key={doc.id}
              className="flex flex-col justify-between p-5 border-border/80 bg-card transition-all duration-200 hover:border-primary/50 hover:shadow-md"
            >
              <div>
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/10 text-red-500">
                    <FileText className="h-5 w-5" />
                  </div>
                  <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                    {doc.format} • {doc.fileSize}
                  </span>
                </div>

                <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                  {isAr ? doc.categoryAr : doc.categoryEn}
                </span>

                <h3 className="mt-1 text-sm font-bold text-foreground leading-snug">
                  {isAr ? doc.titleAr : doc.titleEn}
                </h3>
              </div>

              <div className="mt-5 pt-3 border-t border-border/60">
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="w-full gap-2 rounded-squircle text-xs font-bold hover:bg-primary hover:text-primary-foreground"
                >
                  <Link href={`/${locale}/downloads`}>
                    <Download className="h-3.5 w-3.5" />
                    <span>{isAr ? 'تحميل الوثيقة' : 'Download Document'}</span>
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
