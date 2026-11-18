'use client';

import { useId, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Switch from '@radix-ui/react-switch';
import { getMustChangePasswordCodes, setStudentPasswordRequirement, type MustChangePasswordSummary } from '../api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getApiErrorMessage } from '@/lib/api';

export function PasswordRequirementDialog({ summary, isAr, busy, onClose, onSave }: {
  summary: MustChangePasswordSummary;
  isAr: boolean;
  busy: boolean;
  onClose: () => void;
  onSave: (enabled: boolean) => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const studentCodeId = useId();
  const studentSwitchId = useId();
  const allSwitchId = useId();
  const [studentCode, setStudentCode] = useState('');
  const [studentEnabled, setStudentEnabled] = useState(false);
  const [savingStudent, setSavingStudent] = useState(false);
  const [studentError, setStudentError] = useState('');
  const [studentSuccess, setStudentSuccess] = useState('');
  const saving = busy || savingStudent;
  const [enabled, setEnabled] = useState(summary.allEnabled);
  const [page, setPage] = useState(1);
  const codes = useQuery({
    queryKey: ['admin', 'students', 'must-change-codes', page],
    queryFn: () => getMustChangePasswordCodes(page),
  });
  const saveStudent = async () => {
    setStudentError('');
    setStudentSuccess('');
    const code = studentCode.trim();
    if (!/^\d{4,12}$/.test(code)) {
      setStudentError(isAr ? 'أدخل كود طالب صحيحًا من 4 إلى 12 رقمًا.' : 'Enter a valid student code of 4 to 12 digits.');
      return;
    }
    setSavingStudent(true);
    try {
      await setStudentPasswordRequirement(code, studentEnabled);
      setStudentSuccess(isAr
        ? `تم ${studentEnabled ? 'تفعيل' : 'إلغاء'} الإلزام للطالب ${code} فقط.`
        : `Password change requirement ${studentEnabled ? 'enabled' : 'disabled'} for student ${code} only.`);
      setPage(1);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'students', 'must-change-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'students', 'must-change-codes'] }),
        queryClient.invalidateQueries({ queryKey: ['students'] }),
      ]);
    } catch (error) {
      setStudentError(getApiErrorMessage(error, isAr ? 'تعذر تحديث إلزام الطالب.' : 'Failed to update the student requirement.'));
    } finally {
      setSavingStudent(false);
    }
  };
  return <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
    <DialogContent dir={isAr ? 'rtl' : 'ltr'} className="max-h-[90dvh] max-w-lg overflow-y-auto rounded-2xl">
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
          {codes.data.items.map((code) => <button type="button" key={code} disabled={saving} aria-pressed={studentCode === code} onClick={() => {
            setStudentCode(code);
            setStudentEnabled(true);
            setStudentError('');
            setStudentSuccess('');
          }} className="rounded-squircle bg-secondary px-2 py-1 font-mono text-xs hover:bg-primary/20 focus-visible:outline-2 focus-visible:outline-primary aria-pressed:bg-primary/20 aria-pressed:ring-1 aria-pressed:ring-primary"><bdi>{code}</bdi></button>)}
          {!codes.data.total && <p>{isAr ? 'لا يوجد طلاب ملزمون بتغيير كلمة المرور.' : 'No students are required to change their password.'}</p>}
        </div>
        {codes.data.totalPages > 1 && <div className="flex items-center gap-2">
          <Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>{isAr ? 'السابق' : 'Previous'}</Button>
          <bdi>{page} / {codes.data.totalPages}</bdi>
          <Button variant="outline" disabled={page >= codes.data.totalPages} onClick={() => setPage(page + 1)}>{isAr ? 'التالي' : 'Next'}</Button>
        </div>}
      </>}
      <form className="space-y-3 rounded-xl border border-border p-3" onSubmit={(event) => { event.preventDefault(); if (!saving) void saveStudent(); }}>
        <p className="text-sm font-semibold">{isAr ? 'تعديل الإلزام لطالب واحد' : 'Change requirement for one student'}</p>
        <p className="text-xs text-muted-foreground">{isAr ? 'اختر كودًا من القائمة أو اكتب كود الطالب لتفعيل أو إلغاء الإلزام له فقط.' : 'Select a code above or enter a student code to enable or disable their requirement only.'}</p>
        <label htmlFor={studentCodeId} className="text-sm">{isAr ? 'كود الطالب' : 'Student code'}</label>
        <Input id={studentCodeId} value={studentCode} disabled={saving} dir="ltr" className="text-left" inputMode="numeric" maxLength={12} autoComplete="off" onChange={(event) => {
          setStudentCode(event.target.value);
          setStudentError('');
          setStudentSuccess('');
        }} />
        <div className="flex items-center justify-between gap-3 text-sm">
          <label htmlFor={studentSwitchId}>{isAr ? 'إلزام هذا الطالب بتغيير كلمة المرور' : 'Require this student to change their password'}</label>
          <Switch.Root id={studentSwitchId} checked={studentEnabled} onCheckedChange={(checked) => { setStudentEnabled(checked); setStudentSuccess(''); }} disabled={saving} className="h-6 w-11 shrink-0 rounded-full bg-secondary data-[state=checked]:bg-primary" dir="ltr">
            <Switch.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white transition-transform data-[state=checked]:translate-x-5" />
          </Switch.Root>
        </div>
        {studentError && <p role="alert" className="text-sm text-destructive">{studentError}</p>}
        {studentSuccess && <p role="status" className="text-sm">{studentSuccess}</p>}
        <Button type="submit" disabled={saving || !studentCode.trim()}>{savingStudent ? isAr ? 'جارٍ الحفظ...' : 'Saving...' : isAr ? 'حفظ لهذا الطالب فقط' : 'Save for this student only'}</Button>
      </form>
      <label htmlFor={allSwitchId} className="flex items-center justify-between gap-3 text-sm">
        {isAr ? 'إلزام جميع الطلاب بتغيير كلمة المرور' : 'Require all students to change their password'}
        <Switch.Root id={allSwitchId} checked={enabled} onCheckedChange={setEnabled} disabled={saving} className="h-6 w-11 shrink-0 rounded-full bg-secondary data-[state=checked]:bg-primary" dir="ltr">
          <Switch.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white transition-transform data-[state=checked]:translate-x-5" />
        </Switch.Root>
      </label>
      <p className="text-sm text-muted-foreground">{enabled
        ? isAr ? 'عند الحفظ، سيتم إلزام جميع الطلاب بتغيير كلمة المرور وفك الحظر المؤقت.' : 'Saving will require every student to change their password and clear temporary login locks.'
        : isAr ? 'عند الحفظ، سيتم إلغاء الإلزام لجميع الطلاب، بما في ذلك كل الأكواد المعروضة.' : 'Saving will remove the requirement for everyone, including every code listed above.'}</p>
      <DialogFooter className="gap-2 rtl:sm:justify-start">
        <Button disabled={saving} onClick={() => void onSave(enabled)}>{busy ? isAr ? 'جارٍ الحفظ...' : 'Saving...' : isAr ? 'حفظ للجميع' : 'Save for all students'}</Button>
        <Button variant="outline" disabled={saving} onClick={onClose}>{isAr ? 'إلغاء' : 'Cancel'}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
