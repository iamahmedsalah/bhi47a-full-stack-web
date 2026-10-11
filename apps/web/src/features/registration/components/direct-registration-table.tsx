'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircle2,
  Send,
  Award,
  Check,
  RotateCcw,
  BookOpen,
  AlertCircle,
  HelpCircle,
  GraduationCap,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/cn';
import type { Course, Eligibility } from '../api';

interface DirectRegistrationTableProps {
  courses: Course[];
  eligibility: Eligibility | undefined;
  selected: string[];
  setSelected: React.Dispatch<React.SetStateAction<string[]>>;
  selectedHours: number;
  isEnglish: boolean;
  submitting: boolean;
  requestingAdvising: boolean;
  onSubmitRegistration: () => Promise<void>;
  onRequestAdvising: () => Promise<void>;
}

export function DirectRegistrationTable({
  courses,
  eligibility,
  selected,
  setSelected,
  selectedHours,
  isEnglish,
  submitting,
  requestingAdvising,
  onSubmitRegistration,
  onRequestAdvising,
}: DirectRegistrationTableProps) {
  const [submitConfirmationOpen, setSubmitConfirmationOpen] = useState(false);

  const limit = eligibility?.maxCreditHours ?? 18;
  const minLimit = eligibility?.minCreditHours ?? 12;
  const courseLimit = eligibility?.maxCourses ?? 6;
  const minCourses = eligibility?.minCourses ?? 4;

  const allAvailableCoursesSelected =
    courses.length > 0 &&
    selected.length === courses.length &&
    courses.every((course) => selected.includes(course.code));

  const directSelectionValid =
    allAvailableCoursesSelected &&
    selected.length >= minCourses &&
    selected.length <= courseLimit &&
    selectedHours >= minLimit &&
    selectedHours <= limit;

  const selectionRequirementText = isEnglish
    ? `Direct registration requires every available course, ${minCourses}–${courseLimit} courses total, and ${minLimit}–${limit} credit hours.`
    : `يتطلب التسجيل المباشر اختيار جميع المقررات المتاحة لمستواك، من ${minCourses} إلى ${courseLimit} مقررات، ومن ${minLimit} إلى ${limit} ساعة معتمدة.`;

  const errors: string[] = [];
  if (selectedHours > limit) {
    errors.push(
      isEnglish
        ? `Total selected hours (${selectedHours}) exceeds the maximum limit of ${limit} credit hours.`
        : `الساعات المختارة (${selectedHours}) تتجاوز الحد الأقصى المسموح به وهو ${limit} ساعة معتمدة.`
    );
  }
  if (selectedHours < minLimit && selected.length > 0) {
    errors.push(
      isEnglish
        ? `Total selected hours (${selectedHours}) is below the minimum of ${minLimit} credit hours.`
        : `إجمالي الساعات المختارة (${selectedHours}) أقل من الحد الأدنى ${minLimit} ساعة معتمدة.`
    );
  }
  if (selected.length > courseLimit) {
    errors.push(
      isEnglish
        ? `Selected courses count (${selected.length}) exceeds the maximum limit of ${courseLimit} courses.`
        : `عدد المواد المختارة (${selected.length}) يتجاوز الحد الأقصى المسموح به وهو ${courseLimit} مواد.`
    );
  }
  if (selected.length < minCourses && selected.length > 0) {
    errors.push(
      isEnglish
        ? `Selected courses count (${selected.length}) is below the minimum of ${minCourses} courses.`
        : `عدد المواد المختارة (${selected.length}) أقل من الحد الأدنى المسموح به وهو ${minCourses} مواد.`
    );
  }
  if (!allAvailableCoursesSelected && selected.length > 0) {
    errors.push(
      isEnglish
        ? 'Direct registration requires selecting all offered courses for your academic level.'
        : 'التسجيل المباشر يتطلب اختيار جميع المواد المتاحة لمستواك الأكاديمي.'
    );
  }

  const handleSelectAll = () => {
    setSelected(courses.map((c) => c.code));
  };

  const handleClearAll = () => {
    setSelected([]);
  };

  const creditUsagePercent = Math.min(100, Math.round((selectedHours / limit) * 100));

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-5">
      {/* 1. POSITIVE ACADEMIC STANDING BANNER */}
      <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/30 via-card/70 to-transparent p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-500/15 text-emerald-400">
              <Award className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold text-foreground text-sm">
                  {isEnglish
                    ? 'Good Academic Standing — Direct Registration Available'
                    : 'حالتك الأكاديمية ممتازة — التسجيل المباشر متاح'}
                </h3>
                <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                  {isEnglish ? 'No Advisor Needed' : 'لا يلزم اعتماد مرشد'}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {isEnglish
                  ? `Your GPA (${eligibility?.gpa?.toFixed(2) ?? '2.0+'}) meets direct registration criteria. You can select all required courses and complete registration immediately.`
                  : `معدلك التراكمي (${eligibility?.gpa?.toFixed(2) ?? '2.0+'}) يستوفي شروط التسجيل المباشر. يمكنك تحديد المقررات المطروحة وإتمام التسجيل واستخراج الاستمارة فوراً.`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              onClick={handleSelectAll}
              className="gap-1.5 text-xs border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
            >
              <Check className="h-3.5 w-3.5" />
              {isEnglish ? 'Select All Offered' : 'تحديد جميع المقررات'}
            </Button>
            {selected.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleClearAll}
                className="gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="h-3 w-3" />
                {isEnglish ? 'Reset' : 'إعادة ضبط'}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* 2. COURSES SELECTION CARD */}
      <Card className="space-y-5 p-6 border-border/70 bg-card/60 backdrop-blur-sm shadow-[var(--shadow-glow)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">
                {isEnglish ? 'Offered Courses for Your Level' : 'المقررات المطروحة لمستواك الأكاديمي'}
              </h3>
              <p className="text-xs text-muted-foreground">
                {isEnglish
                  ? `${courses.length} courses offered this term`
                  : `تم طرح ${courses.length} مقررات دراسية لهذا الفصل`}
              </p>
            </div>
          </div>

          {/* Quick Selected Badge */}
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="rounded-lg bg-secondary/60 px-3 py-1 text-foreground border border-border/60">
              {selected.length} / {courses.length} {isEnglish ? 'selected' : 'محدد'}
            </span>
          </div>
        </div>

        {/* Table of Courses */}
        <div className="overflow-x-auto rounded-xl border border-border/70 bg-surface/20">
          <Table>
            <TableHeader>
              <TableRow className="bg-surface/40 hover:bg-surface/40">
                <TableHead className="w-12 text-center" />
                <TableHead className="w-28 font-bold text-start">{isEnglish ? 'Code' : 'الكود الأكاديمي'}</TableHead>
                <TableHead className="font-bold text-start">{isEnglish ? 'Course Title' : 'المقرر الدراسي'}</TableHead>
                <TableHead className="w-28 font-bold text-center">{isEnglish ? 'Credit Hours' : 'الساعات المعتمدة'}</TableHead>
                <TableHead className="w-24 font-bold text-end">{isEnglish ? 'Type' : 'النوع'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {courses.map((course) => {
                const isChecked = selected.includes(course.code);
                return (
                  <TableRow
                    key={course._id}
                    onClick={() => {
                      setSelected((current) =>
                        isChecked ? current.filter((code) => code !== course.code) : [...current, course.code]
                      );
                    }}
                    className={cn(
                      'cursor-pointer transition-colors',
                      isChecked ? 'bg-primary/10 hover:bg-primary/15' : 'hover:bg-surface/40',
                    )}
                  >
                    <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(event) => {
                          setSelected((current) =>
                            event.target.checked
                              ? [...current, course.code]
                              : current.filter((code) => code !== course.code)
                          );
                        }}
                        className="h-4 w-4 rounded border-border/80 bg-secondary/50 text-primary cursor-pointer focus:ring-primary accent-primary"
                      />
                    </TableCell>
                    <TableCell className="font-bold font-mono text-foreground text-start">
                      <span className="rounded-md bg-secondary/70 px-2 py-0.5 border border-border/60 text-xs">
                        {course.code}
                      </span>
                    </TableCell>
                    <TableCell className="font-bold text-foreground text-start">
                      <div className="text-sm">
                        {isEnglish ? course.nameEn ?? course.name : course.nameAr ?? course.name}
                      </div>
                      {course.prerequisites?.length ? (
                        <div className="mt-1 font-normal text-[10px] text-muted-foreground flex items-center gap-1">
                          <span className="text-muted-foreground/70">{isEnglish ? 'Prerequisites:' : 'المتطلب السابق:'}</span>
                          <span className="font-mono text-foreground/80">{course.prerequisites.join(', ')}</span>
                        </div>
                      ) : (
                        <div className="mt-0.5 text-[10px] text-muted-foreground/50">
                          {isEnglish ? 'No prerequisite' : 'بدون متطلبات سابقة'}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-bold font-mono text-center text-sm">
                      {course.creditHours ?? 0} {isEnglish ? 'cr' : 'س'}
                    </TableCell>
                    <TableCell className="text-end">
                      <span className="rounded-full bg-secondary/60 px-2 py-0.5 text-[10px] text-muted-foreground">
                        {isEnglish
                          ? course.type ?? 'required'
                          : course.type === 'elective'
                            ? 'اختياري'
                            : 'إجباري'}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* 3. LIVE CREDIT CAPACITY & CONFIRMATION DOCK */}
        <div className="space-y-4 border-t border-border/60 pt-4">
          {/* Capacity Progress Bar */}
          <div className="space-y-1.5 rounded-xl border border-border/50 bg-surface/30 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground">
                  {isEnglish ? 'Selected Registration Load:' : 'حِمل الساعات المسجلة:'}
                </span>
                <span
                  className={cn(
                    'rounded-md px-2 py-0.5 font-mono text-xs font-bold',
                    selectedHours > limit
                      ? 'bg-red-500/20 text-red-300'
                      : directSelectionValid
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-secondary text-foreground',
                  )}
                >
                  {selectedHours} / {limit} {isEnglish ? 'credit hours' : 'ساعة معتمدة'}
                </span>
              </div>
              <span className="text-[11px] text-muted-foreground font-mono">
                {selected.length} / {courseLimit} {isEnglish ? 'courses' : 'مقررات'}
              </span>
            </div>

            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary/60">
              <div
                className={cn(
                  'h-full transition-all duration-300 rounded-full',
                  selectedHours > limit
                    ? 'bg-red-500'
                    : directSelectionValid
                      ? 'bg-emerald-400'
                      : 'bg-primary/80',
                )}
                style={{ width: `${Math.min(100, creditUsagePercent)}%` }}
              />
            </div>
          </div>

          {/* Validation Errors or Success Callout */}
          {errors.length > 0 ? (
            <div className="space-y-1 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-700 dark:text-amber-200">
              {errors.map((err) => (
                <div key={err} className="flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>{err}</span>
                </div>
              ))}
            </div>
          ) : directSelectionValid ? (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>
                {isEnglish
                  ? 'All level courses selected and within allowable credit hours limit. Ready to confirm registration!'
                  : 'تم اختيار جميع المقررات بنجاح واستيفاء الساعات المعتمدة. يمكنك الآن تأكيد التسجيل النهائي!'}
              </span>
            </div>
          ) : null}

          {/* Actions Bar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-2">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={requestingAdvising}
                onClick={onRequestAdvising}
                className="text-xs text-muted-foreground hover:text-foreground gap-1.5"
              >
                <HelpCircle className="h-3.5 w-3.5" />
                {isEnglish ? 'Need special plan? Request Advisor' : 'تحتاج خطة خاصة؟ استشر المرشد'}
              </Button>
            </div>

            <Button
              disabled={selected.length === 0}
              onClick={() => setSubmitConfirmationOpen(true)}
              className="h-11 px-6 cursor-pointer font-bold text-xs gap-2"
            >
              <Send className="h-4 w-4" />
              {isEnglish ? 'Proceed to Final Registration' : 'متابعة التسجيل النهائي'}
            </Button>
          </div>
        </div>
      </Card>

      {/* 4. CONFIRMATION DIALOG */}
      <Dialog open={submitConfirmationOpen} onOpenChange={setSubmitConfirmationOpen}>
        <DialogContent className="max-w-lg rounded-2xl" dir={isEnglish ? 'ltr' : 'rtl'}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <GraduationCap className="h-5 w-5 text-primary" />
              {directSelectionValid
                ? isEnglish
                  ? 'Confirm Final Course Registration'
                  : 'تأكيد تسجيل المقررات النهائي'
                : isEnglish
                  ? 'Incomplete Course Selection'
                  : 'تنبيه: اختيار المقررات غير مكتمل'}
            </DialogTitle>
          </DialogHeader>

          {directSelectionValid ? (
            <div className="space-y-4 text-sm py-2">
              <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-700 dark:text-amber-200">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500 dark:text-amber-400" />
                <span>
                  {isEnglish
                    ? 'Important: This is your final registration for this term. Once submitted, changes cannot be made without administrative review.'
                    : 'تنبيه هام: هذا هو تسجيلك النهائي لهذا الفصل. بعد التأكيد لن تتمكن من التعديل إلا بمراجعة إدارة التسجيل.'}
                </span>
              </div>

              {/* Summary of Courses */}
              <div className="rounded-xl border border-border/70 bg-surface/30 p-3 space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-foreground border-b border-border/50 pb-2">
                  <span>{isEnglish ? 'Registration Summary' : 'ملخص المقررات المسجلة'}</span>
                  <span className="font-mono text-primary">
                    {selected.length} {isEnglish ? 'courses' : 'مقررات'} · {selectedHours} {isEnglish ? 'credit hours' : 'ساعة'}
                  </span>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1.5 pt-1">
                  {selected.map((code) => {
                    const match = courses.find((c) => c.code === code);
                    return (
                      <div key={code} className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-card/60">
                        <span className="font-mono font-bold text-foreground">{code}</span>
                        <span className="text-muted-foreground text-[11px] truncate max-w-[200px]">
                          {isEnglish ? match?.nameEn ?? match?.name : match?.nameAr ?? match?.name}
                        </span>
                        <span className="font-mono text-muted-foreground">{match?.creditHours ?? 3} {isEnglish ? 'cr' : 'س'}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setSubmitConfirmationOpen(false)}>
                  {isEnglish ? 'Back to Selection' : 'العودة للتعديل'}
                </Button>
                <Button
                  disabled={submitting}
                  onClick={async () => {
                    await onSubmitRegistration();
                    setSubmitConfirmationOpen(false);
                  }}
                  className="gap-1.5"
                >
                  <Check className="h-4 w-4" />
                  {submitting
                    ? isEnglish
                      ? 'Submitting...'
                      : 'جارٍ التسجيل...'
                    : isEnglish
                      ? 'Confirm & Submit'
                      : 'تأكيد التسجيل النهائي'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 text-sm py-2">
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-xs text-red-700 dark:text-red-200">
                {selectionRequirementText}
              </div>
              <p className="text-xs text-muted-foreground">
                {isEnglish
                  ? 'Direct registration is designed for full-load level enrollment. If you have special prerequisites or wish to drop a course, please consult your academic advisor.'
                  : 'التسجيل المباشر مصمم لتسجيل حمولة الفصل كاملة. إذا كنت ترغب في خطة استثنائية أو حذف مقرر، يمكنك الانتقال إلى الإرشاد الأكاديمي.'}
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setSubmitConfirmationOpen(false)}>
                  {isEnglish ? 'Return to selection' : 'العودة للاختيار'}
                </Button>
                <Button
                  disabled={requestingAdvising}
                  onClick={async () => {
                    await onRequestAdvising();
                    setSubmitConfirmationOpen(false);
                  }}
                >
                  {requestingAdvising
                    ? isEnglish
                      ? 'Opening...'
                      : 'جارٍ الفتح...'
                    : isEnglish
                      ? 'Go to Academic Advising'
                      : 'الانتقال إلى الإرشاد الأكاديمي'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

