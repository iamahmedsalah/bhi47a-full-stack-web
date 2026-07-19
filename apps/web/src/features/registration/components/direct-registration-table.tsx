'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Send } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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

  const allAvailableCoursesSelected =
    courses.length > 0 &&
    selected.length === courses.length &&
    courses.every((course) => selected.includes(course.code));

  const directSelectionValid =
    allAvailableCoursesSelected &&
    selected.length >= (eligibility?.minCourses ?? 4) &&
    selected.length <= (eligibility?.maxCourses ?? 6) &&
    selectedHours >= (eligibility?.minCreditHours ?? 12) &&
    selectedHours <= (eligibility?.maxCreditHours ?? 18);

  const selectionRequirementText = isEnglish
    ? `Direct registration requires every available course, ${eligibility?.minCourses ?? 4}–${eligibility?.maxCourses ?? 6} courses total, and ${eligibility?.minCreditHours ?? 12}–${eligibility?.maxCreditHours ?? 18} credit hours.`
    : `يتطلب التسجيل المباشر اختيار جميع المقررات المتاحة، من ${eligibility?.minCourses ?? 4} إلى ${eligibility?.maxCourses ?? 6} مقررات، ومن ${eligibility?.minCreditHours ?? 12} إلى ${eligibility?.maxCreditHours ?? 18} ساعة معتمدة.`;

  const limit = eligibility?.maxCreditHours ?? 18;
  const minLimit = eligibility?.minCreditHours ?? 12;
  const courseLimit = eligibility?.maxCourses ?? 6;
  const minCourses = eligibility?.minCourses ?? 4;

  const errors: string[] = [];
  if (selectedHours > limit) {
    errors.push(
      isEnglish
        ? `⚠️ Total selected hours (${selectedHours}) exceeds the maximum limit of ${limit} credit hours.`
        : `⚠️ الساعات المختارة (${selectedHours}) تتجاوز الحد الأقصى المسموح به وهو ${limit} ساعة معتمدة.`
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
        ? `⚠️ Selected courses count (${selected.length}) exceeds the maximum limit of ${courseLimit} courses.`
        : `⚠️ عدد المواد المختارة (${selected.length}) يتجاوز الحد الأقصى المسموح به وهو ${courseLimit} مواد.`
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
        ? '⚠️ Direct registration requires selecting all offered courses for your academic level.'
        : '⚠️ التسجيل المباشر يتطلب اختيار جميع المواد المتاحة لمستواك الأكاديمي.'
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <Card className="space-y-5 p-6 border-border/70 bg-card/45 backdrop-blur-sm shadow-[var(--shadow-glow)] transition-all duration-300 hover:border-primary/30">
        <div className="flex items-center gap-3 border-b border-border pb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-foreground">
              {isEnglish ? 'Direct Registration' : 'التسجيل المباشر للمواد'}
            </h3>
            <p className="text-xs text-muted-foreground">
              {isEnglish
                ? 'Select courses to register for this semester'
                : 'اختر المقررات الدراسية المناسبة لتسجيلها للفصل الحالي'}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 font-bold text-start" />
                <TableHead className="w-24 font-bold text-start">{isEnglish ? 'Code' : 'الكود الأكاديمي'}</TableHead>
                <TableHead className="font-bold text-start">{isEnglish ? 'Course' : 'المقرر الدراسي'}</TableHead>
                <TableHead className="w-24 font-bold text-center">{isEnglish ? 'Hours' : 'عدد الساعات'}</TableHead>
                <TableHead className="w-24 font-bold text-end">{isEnglish ? 'Type' : 'النوع'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {courses.map((course) => (
                <TableRow key={course._id}>
                  <TableCell className="text-start">
                    <input
                      type="checkbox"
                      checked={selected.includes(course.code)}
                      onChange={(event) => {
                        setSelected((current) =>
                          event.target.checked
                            ? [...current, course.code]
                            : current.filter((code) => code !== course.code)
                        );
                      }}
                      className="h-4 w-4 rounded border-border bg-secondary/50 text-primary cursor-pointer focus:ring-primary"
                    />
                  </TableCell>
                  <TableCell className="font-bold font-mono text-foreground text-start">{course.code}</TableCell>
                  <TableCell className="font-bold text-foreground text-start">
                    {isEnglish ? course.nameEn ?? course.name : course.nameAr ?? course.name}
                    {course.prerequisites?.length ? (
                      <div className="mt-1 font-normal text-[10px] text-muted-foreground">
                        {isEnglish ? 'Prerequisites' : 'المتطلبات السابقة'}: {course.prerequisites.join(', ')}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="font-bold font-mono text-center">{course.creditHours ?? 0}</TableCell>
                  <TableCell className="text-end text-muted-foreground">
                    {isEnglish ? course.type ?? 'required' : course.type === 'elective' ? 'اختياري' : 'إجباري'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="mt-4 flex flex-col gap-4 border-t border-border pt-4">
          {errors.length > 0 && (
            <div className="space-y-1 rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-xs text-red-700 dark:text-red-200">
              {errors.map((err) => (
                <div key={err}>{err}</div>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-0.5 text-xs">
              <p className="font-bold font-mono text-foreground">
                {isEnglish ? 'Selected courses:' : 'عدد المواد المختارة:'} {selected.length} / {courseLimit}
              </p>
              <p className="font-mono text-muted-foreground">
                {isEnglish ? 'Total credit hours:' : 'إجمالي الساعات المعمدة:'} {selectedHours} / {limit}
              </p>
            </div>
            <Button
              disabled={selected.length === 0}
              onClick={() => setSubmitConfirmationOpen(true)}
              className="h-11 cursor-pointer font-bold text-xs"
            >
              <Send className="me-2 h-4 w-4" />
              {isEnglish ? 'Proceed to registration' : 'متابعة التسجيل'}
            </Button>
          </div>
        </div>
      </Card>

      <Dialog open={submitConfirmationOpen} onOpenChange={setSubmitConfirmationOpen}>
        <DialogContent className="max-w-lg" dir={isEnglish ? 'ltr' : 'rtl'}>
          <DialogHeader>
            <DialogTitle>
              {directSelectionValid
                ? isEnglish
                  ? 'Confirm final registration'
                  : 'تأكيد التسجيل النهائي'
                : isEnglish
                  ? 'Incomplete course selection'
                  : 'اختيار المقررات غير مكتمل'}
            </DialogTitle>
          </DialogHeader>
          {directSelectionValid ? (
            <div className="space-y-4 text-sm">
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-700 dark:text-amber-200">
                {isEnglish
                  ? 'This is your only submission for this academic term. After confirmation, the registration cannot be edited.'
                  : 'هذا هو الإرسال الوحيد المسموح به لهذا الفصل الدراسي. بعد التأكيد لن يمكن تعديل التسجيل.'}
              </div>
              <p>
                {isEnglish
                  ? `${selected.length} courses · ${selectedHours} credit hours`
                  : `${selected.length} مقررات · ${selectedHours} ساعة معتمدة`}
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setSubmitConfirmationOpen(false)}>
                  {isEnglish ? 'Cancel' : 'إلغاء'}
                </Button>
                <Button
                  disabled={submitting}
                  onClick={async () => {
                    await onSubmitRegistration();
                    setSubmitConfirmationOpen(false);
                  }}
                >
                  {submitting
                    ? isEnglish
                      ? 'Submitting...'
                      : 'جارٍ الإرسال...'
                    : isEnglish
                      ? 'Confirm final submission'
                      : 'تأكيد الإرسال النهائي'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 text-sm">
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-700 dark:text-red-200">
                {selectionRequirementText}
              </div>
              <p className="text-muted-foreground">
                {isEnglish
                  ? 'If you cannot take all available courses, continue to Academic Advising for review.'
                  : 'إذا تعذر عليك تسجيل جميع المقررات، انتقل إلى الإرشاد الأكاديمي لمراجعة حالتك.'}
              </p>
              <div className="flex justify-end gap-2">
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
