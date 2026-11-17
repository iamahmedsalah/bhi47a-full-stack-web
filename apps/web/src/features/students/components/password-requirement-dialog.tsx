'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as Switch from '@radix-ui/react-switch';
import { getMustChangePasswordCodes, type MustChangePasswordSummary } from '../api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { getApiErrorMessage } from '@/lib/api';

export function PasswordRequirementDialog({ summary, isAr, busy, onClose, onSave }: {
  summary: MustChangePasswordSummary;
  isAr: boolean;
  busy: boolean;
  onClose: () => void;
  onSave: (enabled: boolean) => Promise<void>;
}) {
  const [enabled, setEnabled] = useState(summary.allEnabled);
  const [page, setPage] = useState(1);
  const codes = useQuery({
    queryKey: ['admin', 'students', 'must-change-codes', page],
    queryFn: () => getMustChangePasswordCodes(page),
  });
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent dir={isAr ? 'rtl' : 'ltr'} className="max-w-lg rounded-2xl">
      <DialogHeader>
        <DialogTitle>{isAr ? 'إلزام تغيير كلمة المرور' : 'Password change requirement'}</DialogTitle>
        <DialogDescription>{isAr ? 'أكواد الطلاب الملزمين حالياً بتغيير كلمة المرور فقط.' : 'Only student codes currently required to change their password are listed.'}</DialogDescription>
      </DialogHeader>
      <p className="text-sm"><bdi>{summary.mustChangeCount} / {summary.totalStudents}</bdi></p>
      {codes.isPending ? <p role="status">{isAr ? 'جارٍ التحميل...' : 'Loading...'}</p> : codes.isError ? <div role="alert">
        <p>{getApiErrorMessage(codes.error)}</p>
        <Button variant="outline" onClick={() => void codes.refetch()}>{isAr ? 'إعادة المحاولة' : 'Retry'}</Button>
      </div> : <>
        <div className="flex max-h-56 flex-wrap gap-2 overflow-auto" dir="ltr">
          {codes.data.items.map((code) => <bdi key={code} className="rounded-squircle bg-secondary px-2 py-1 font-mono text-xs">{code}</bdi>)}
          {!codes.data.total && <p>{isAr ? 'لا يوجد طلاب ملزمون بتغيير كلمة المرور.' : 'No students are required to change their password.'}</p>}
        </div>
        {codes.data.totalPages > 1 && <div className="flex items-center gap-2">
          <Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>{isAr ? 'السابق' : 'Previous'}</Button>
          <bdi>{page} / {codes.data.totalPages}</bdi>
          <Button variant="outline" disabled={page >= codes.data.totalPages} onClick={() => setPage(page + 1)}>{isAr ? 'التالي' : 'Next'}</Button>
        </div>}
      </>}
      <label className="flex items-center justify-between gap-3 text-sm">
        {isAr ? 'إلزام جميع الطلاب بتغيير كلمة المرور' : 'Require all students to change their password'}
        <Switch.Root checked={enabled} onCheckedChange={setEnabled} disabled={busy} className="h-6 w-11 shrink-0 rounded-full bg-secondary data-[state=checked]:bg-primary" dir="ltr">
          <Switch.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white transition-transform data-[state=checked]:translate-x-5" />
        </Switch.Root>
      </label>
      <p className="text-sm text-muted-foreground">{enabled
        ? isAr ? 'عند الحفظ، سيتم إلزام جميع الطلاب بتغيير كلمة المرور وفك الحظر المؤقت.' : 'Saving will require every student to change their password and clear temporary login locks.'
        : isAr ? 'عند الحفظ، سيتم إلغاء الإلزام لجميع الطلاب، بما في ذلك كل الأكواد المعروضة.' : 'Saving will remove the requirement for everyone, including every code listed above.'}</p>
      <DialogFooter className="gap-2 rtl:sm:justify-start">
        <Button disabled={busy} onClick={() => void onSave(enabled)}>{busy ? isAr ? 'جارٍ الحفظ...' : 'Saving...' : isAr ? 'حفظ للجميع' : 'Save for all students'}</Button>
        <Button variant="outline" disabled={busy} onClick={onClose}>{isAr ? 'إلغاء' : 'Cancel'}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
