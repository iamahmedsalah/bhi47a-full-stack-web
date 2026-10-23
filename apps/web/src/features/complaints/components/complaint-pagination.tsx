'use client';

import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function ComplaintPagination({ page, limit, total, totalPages, busy, isAr, onPage, onLimit }: {
  page: number; limit: number; total: number; totalPages: number; busy: boolean; isAr: boolean;
  onPage: (page: number) => void; onLimit: (limit: number) => void;
}) {
  const pages = Math.max(1, totalPages);
  const start = total && page <= pages ? (page - 1) * limit + 1 : 0;
  const end = Math.min(page * limit, total);
  return <nav aria-label={isAr ? 'صفحات الشكاوى' : 'Complaint pages'} className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4" dir={isAr ? 'rtl' : 'ltr'}>
    <p className="text-sm text-muted-foreground" aria-live="polite">
      {isAr ? `عرض ${start}–${end} من ${total}` : `Showing ${start}–${end} of ${total}`}
    </p>
    <div className="flex flex-wrap items-center gap-2">
      <Select value={String(limit)} onValueChange={(value) => onLimit(Number(value))} disabled={busy}>
        <SelectTrigger className="w-32" aria-label={isAr ? 'عدد الشكاوى في الصفحة' : 'Tickets per page'}><SelectValue /></SelectTrigger>
        <SelectContent dir={isAr ? 'rtl' : 'ltr'}>{[10, 20, 50, 100].map((size) => <SelectItem key={size} value={String(size)}>{size} {isAr ? 'في الصفحة' : 'per page'}</SelectItem>)}</SelectContent>
      </Select>
      <Button variant="outline" disabled={busy || page <= 1} onClick={() => onPage(page - 1)}>{isAr ? 'السابق' : 'Previous'}</Button>
      <span className="px-2 text-sm">{isAr ? `صفحة ${page} من ${pages}` : `Page ${page} of ${pages}`}</span>
      <Button variant="outline" disabled={busy || page >= pages} onClick={() => onPage(page + 1)}>{isAr ? 'التالي' : 'Next'}</Button>
    </div>
  </nav>;
}
