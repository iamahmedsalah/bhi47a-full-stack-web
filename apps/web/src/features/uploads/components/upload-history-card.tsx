'use client';

import React, { useState, useMemo } from 'react';
import {
  History,
  FileSpreadsheet,
  XCircle,
  Search,
  Trash2,
  Copy,
  Check,
  Calendar,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { useUploadHistory } from '../upload-history';
import type { UploadCatalogType } from '../types';

interface UploadHistoryCardProps {
  currentCatalog?: UploadCatalogType;
  isAr?: boolean;
  className?: string;
}

const CATALOG_LABELS_AR: Record<UploadCatalogType, string> = {
  'academic-warnings': 'الإنذارات الأكاديمية',
  students: 'الطلاب',
  courses: 'المقررات',
  grades: 'الدرجات',
  quizzes: 'الكويزات',
  attendance: 'الغياب والحضور',
  'academic-emails': 'البريد الأكاديمي',
};

const CATALOG_LABELS_EN: Record<UploadCatalogType, string> = {
  'academic-warnings': 'Academic Warnings',
  students: 'Students',
  courses: 'Courses',
  grades: 'Grades',
  quizzes: 'Quizzes',
  attendance: 'Attendance',
  'academic-emails': 'Academic Emails',
};

export function UploadHistoryCard({
  currentCatalog,
  isAr = true,
  className,
}: UploadHistoryCardProps) {
  const { history, clearHistory, removeEntry } = useUploadHistory(currentCatalog);
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return history;
    const q = search.trim().toLowerCase();
    return history.filter(
      (item) =>
        item.fileName.toLowerCase().includes(q) ||
        item.catalogType.toLowerCase().includes(q),
    );
  }, [history, search]);

  const handleCopyName = (id: string, name: string) => {
    navigator.clipboard.writeText(name);
    setCopiedId(id);
    toast.success(isAr ? 'تم نسخ اسم الملف' : 'File name copied');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return new Intl.DateTimeFormat(isAr ? 'ar-EG' : 'en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        hour12: true,
        timeZone: 'Africa/Cairo',
      }).format(d);
    } catch {
      return iso;
    }
  };

  return (
    <div
      className={cn(
        'rounded-2xl border border-border/70 bg-card/60 p-4 space-y-3.5 backdrop-blur-xs',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-squircle bg-teal-500/10 text-teal-600 dark:text-teal-400 shrink-0">
            <History className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <span>{isAr ? 'سجل الملفات المرفوعة مؤخراً' : 'Recently Uploaded Files History'}</span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-full bg-muted font-normal text-muted-foreground">
                {history.length}
              </span>
            </h4>
            <p className="text-[11px] text-muted-foreground">
              {isAr
                ? 'قائمة بأسماء الملفات المنفذة لتفادي تكرار أو نسيان ملفات المقررات'
                : 'Track uploaded files to ensure no course files are missed or skipped'}
            </p>
          </div>
        </div>

        {history.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearHistory}
            className="text-[11px] h-7 px-2 text-muted-foreground hover:text-rose-500 rounded-squircle cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5 me-1" />
            <span>{isAr ? 'مسح السجل' : 'Clear History'}</span>
          </Button>
        )}
      </div>

      {/* Search Input when items exist */}
      {history.length > 3 && (
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute start-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              isAr
                ? 'بحث في أسماء الملفات السابقة للتأكد...'
                : 'Search past file names to verify...'
            }
            className="w-full text-xs ps-8 pe-3 py-1.5 rounded-squircle border border-border/70 bg-background text-foreground focus:outline-hidden focus:ring-1 focus:ring-teal-500"
          />
        </div>
      )}

      {/* Empty State */}
      {history.length === 0 ? (
        <div className="p-4 rounded-xl border border-dashed border-border/70 text-center text-xs text-muted-foreground space-y-1">
          <FileSpreadsheet className="w-6 h-6 mx-auto text-muted-foreground/60 mb-1" />
          <p className="font-medium">
            {isAr ? 'لا توجد ملفات مرفوعة بعد في هذا السجل' : 'No upload history recorded yet'}
          </p>
          <p className="text-[10px] text-muted-foreground/80">
            {isAr
              ? 'سيتم تتبع أسماء كل الملفات التي ترفعها تلقائياً هنا مع تفاصيل الصفوف والتاريخ.'
              : 'Every uploaded spreadsheet file name will be automatically logged here with timestamp and rows.'}
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-4 text-center text-xs text-muted-foreground">
          {isAr ? 'لا توجد نتائج مطابقة لبحثك' : 'No matching files found'}
        </div>
      ) : (
        <div className="max-h-60 overflow-y-auto space-y-2 pe-1">
          {filtered.map((item) => {
            const isSuccess = item.status === 'success' || item.failedCount === 0;
            const isPartial = item.status === 'partial' || (item.successCount > 0 && item.failedCount > 0);

            return (
              <div
                key={item.id}
                className="group p-2.5 rounded-squircle border border-border/60 bg-card/80 hover:bg-muted/40 transition-colors flex items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={cn(
                      'p-2 rounded-squircle shrink-0',
                      isSuccess
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : isPartial
                          ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                          : 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
                    )}
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="font-bold text-foreground truncate max-w-[200px] sm:max-w-xs md:max-w-sm" title={item.fileName}>
                        {item.fileName}
                      </p>
                      <button
                        type="button"
                        onClick={() => handleCopyName(item.id, item.fileName)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-muted-foreground hover:text-foreground cursor-pointer"
                        title={isAr ? 'نسخ اسم الملف' : 'Copy file name'}
                      >
                        {copiedId === item.id ? (
                          <Check className="w-3 h-3 text-emerald-500" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>

                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        <bdi>{formatDate(item.uploadedAt)}</bdi>
                      </span>
                      <span>•</span>
                      <span className="rounded-squircle px-1.5 py-0.2 bg-muted font-semibold text-foreground">
                        {isAr
                          ? CATALOG_LABELS_AR[item.catalogType] || item.catalogType
                          : CATALOG_LABELS_EN[item.catalogType] || item.catalogType}
                      </span>
                      {item.allowDuplicateStudentCode && (
                        <span className="rounded-squircle px-1.5 py-0.2 bg-teal-500/10 text-teal-600 dark:text-teal-400 font-medium">
                          {isAr ? 'متعدد المقررات' : 'Multi-course'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  <div className="text-end">
                    <span
                      className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded-squircle text-[11px] font-mono font-bold',
                        isSuccess
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                          : isPartial
                            ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                            : 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
                      )}
                    >
                      <bdi>{item.successCount}</bdi>{' '}
                      <span className="ms-1 text-[9px] font-sans font-normal opacity-85">
                        {isAr ? 'سجل' : 'rows'}
                      </span>
                    </span>
                    {item.failedCount > 0 && (
                      <p className="text-[10px] text-rose-500 font-mono mt-0.5">
                        {item.failedCount} {isAr ? 'فشل' : 'failed'}
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => removeEntry(item.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-muted-foreground hover:text-rose-500 rounded-full cursor-pointer"
                    title={isAr ? 'حذف من السجل' : 'Remove from history'}
                  >
                    <XCircle className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
