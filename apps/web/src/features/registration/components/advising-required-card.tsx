'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Clock, Eye, FileText, Printer, Send } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { AdvisingRequest, ApprovedAcademicPlan, Registration } from '../api';

interface AdvisingRequiredCardProps {
  localizedPolicyWarnings: string[];
  advising: AdvisingRequest | null | undefined;
  approvedAdvisorPlan: Registration | undefined;
  approvedAcademicPlan: ApprovedAcademicPlan | null | undefined;
  isEnglish: boolean;
  submittingApprovedPlan: boolean;
  onAcknowledgeAndSubmitPlan: () => Promise<void>;
  onPrintAction: (registration: Registration, action: 'print' | 'download' | 'view') => Promise<void>;
}

function localizeSemester(value: string | undefined, isEnglish: boolean) {
  if (value === 'first') return isEnglish ? 'First Semester' : 'الفصل الدراسي الأول';
  if (value === 'second') return isEnglish ? 'Second Semester' : 'الفصل الدراسي الثاني';
  if (value === 'summer') return isEnglish ? 'Summer Semester' : 'الفصل الدراسي الصيفي';
  return value ?? '—';
}

export function AdvisingRequiredCard({
  localizedPolicyWarnings,
  advising,
  approvedAdvisorPlan,
  approvedAcademicPlan,
  isEnglish,
  submittingApprovedPlan,
  onAcknowledgeAndSubmitPlan,
  onPrintAction,
}: AdvisingRequiredCardProps) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <Card className="space-y-5 p-6 border-border/70 bg-card/45 backdrop-blur-sm shadow-[var(--shadow-glow)] transition-all duration-300 hover:border-primary/30">
        <div className="flex items-center gap-3 border-b border-border pb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-foreground">
              {isEnglish ? 'Academic Advising Required' : 'إرشاد أكاديمي مطلوب'}
            </h3>
            <p className="text-xs text-muted-foreground">
              {isEnglish ? 'Direct registration is locked' : 'التسجيل المباشر مغلق لمراجعة المرشد'}
            </p>
          </div>
        </div>

        {localizedPolicyWarnings.length ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-300">
            {localizedPolicyWarnings.map((warning) => {
              let text = warning;
              if (warning.includes('GPA is below 2.00')) {
                text = isEnglish
                  ? 'GPA is below 2.00 and requires academic advising.'
                  : 'المعدل التراكمي أقل من 2.00 ويتطلب مراجعة الإرشاد الأكاديمي.';
              } else if (warning.includes('failed course')) {
                text = isEnglish
                  ? 'Contains failed courses requiring academic advising.'
                  : 'توجد مقررات دراسية رسوب تتطلب مراجعة المرشد الأكاديمي.';
              } else if (warning.includes('Academic warning')) {
                text = isEnglish
                  ? 'Account has academic warnings requiring advising.'
                  : 'الحساب يحتوي على إنذارات أكاديمية تتطلب الإرشاد.';
              }
              return <div key={warning}>• {text}</div>;
            })}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-border/80 bg-secondary/40 p-3.5 text-start">
            <span className="font-bold text-[10px] text-muted-foreground uppercase">
              {isEnglish ? 'Status' : 'حالة الطلب'}
            </span>
            <p className="mt-1 font-bold text-foreground text-sm capitalize">
              {(() => {
                const st = advising?.status ?? 'pending';
                const statusMap: Record<string, string> = {
                  pending: isEnglish ? 'Pending' : 'قيد المراجعة',
                  approved: isEnglish ? 'Approved' : 'معتمد',
                  rejected: isEnglish ? 'Rejected' : 'مرفوض',
                  UNDER_REVIEW: isEnglish ? 'Under Review' : 'قيد المراجعة',
                  DRAFT: isEnglish ? 'Draft' : 'مسودة',
                };
                return statusMap[st] ?? st;
              })()}
            </p>
          </div>
          <div className="rounded-xl border border-border/80 bg-secondary/40 p-3.5 text-start">
            <span className="font-bold text-[10px] text-muted-foreground uppercase">
              {isEnglish ? 'Advisor' : 'المرشد الأكاديمي'}
            </span>
            <p className="mt-1 font-bold text-foreground text-sm">
              {advising?.assignedStaffId?.name ?? (isEnglish ? 'Pending assignment' : 'في انتظار التخصيص')}
            </p>
          </div>
          <div className="rounded-xl border border-border/80 bg-secondary/40 p-3.5 text-start">
            <span className="font-bold text-[10px] text-muted-foreground uppercase">
              {isEnglish ? 'Reason' : 'السبب'}
            </span>
            <p className="mt-1 font-bold text-foreground text-sm">
              {(() => {
                const rsn = advising?.reason ?? '-';
                const reasonMap: Record<string, string> = {
                  failed_courses: isEnglish ? 'Failed Courses' : 'وجود مقررات دراسية رسوب',
                  low_gpa: isEnglish ? 'Low GPA' : 'المعدل التراكمي أقل من 2.00',
                  warning: isEnglish ? 'Academic Warning' : 'وجود إنذارات أكاديمية',
                  credit_limit: isEnglish ? 'Credit Limit Exceeded' : 'تجاوز الحد الأقصى للساعات',
                };
                return reasonMap[rsn] ?? rsn;
              })()}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="font-bold text-xs text-foreground">
            {isEnglish ? 'Recommended Courses' : 'المقررات المقترحة المقبولة'}
          </h4>
          <div className="flex flex-wrap gap-2">
            {(advising?.staffApprovedCourses?.length
              ? advising.staffApprovedCourses
              : advising?.autoSuggestedCourses ?? []
            ).map((code) => (
              <span key={code} className="rounded-lg border border-border bg-secondary font-bold font-mono text-xs text-foreground px-3 py-1">
                {code}
              </span>
            ))}
          </div>
        </div>

        {approvedAcademicPlan ? (
          <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="font-bold text-foreground text-sm">
                  {isEnglish ? 'Advisor-approved registration plan' : 'خطة التسجيل المعتمدة من المرشد'}
                </h4>
                <p className="text-xs text-muted-foreground">
                  {approvedAcademicPlan.academicYear} · {localizeSemester(approvedAcademicPlan.semester, isEnglish)} ·{' '}
                  {approvedAcademicPlan.totalCredits} {isEnglish ? 'credits' : 'ساعة'}
                </p>
              </div>
              <Button
                disabled={submittingApprovedPlan || Boolean(approvedAdvisorPlan)}
                onClick={onAcknowledgeAndSubmitPlan}
                className="h-11"
              >
                <Send className="me-2 h-4 w-4" />
                {approvedAdvisorPlan
                  ? isEnglish
                    ? 'Registered'
                    : 'تم التسجيل'
                  : isEnglish
                    ? 'Acknowledge & register'
                    : 'تأكيد وتسجيل الخطة'}
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {approvedAcademicPlan.selectedCourses.map((course) => (
                <span key={course._id} className="rounded-lg border border-white/10 bg-secondary/50 font-bold font-mono text-xs px-3 py-1">
                  {course.code}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {advising?.staffNotes && (
          <div className="rounded-xl border border-border bg-secondary/20 p-3.5 text-xs leading-normal text-muted-foreground">
            <strong>{isEnglish ? 'Advisor Notes:' : 'ملاحظات المرشد الأكاديمي:'}</strong> {advising.staffNotes}
          </div>
        )}

        {approvedAdvisorPlan && (
          <div className="flex flex-col gap-2 pt-2 sm:flex-row">
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300 sm:me-auto">
              {isEnglish ? 'Approved by' : 'اعتمد بواسطة'}:{' '}
              <strong>{approvedAdvisorPlan.approvedBy?.name ?? advising?.assignedStaffId?.name ?? '-'}</strong>
            </div>
            <Button
              onClick={() => onPrintAction(approvedAdvisorPlan, 'view')}
              className="flex h-11 items-center gap-1.5 bg-blue-600 font-semibold text-xs text-white shadow-md transition-all hover:bg-blue-700 cursor-pointer"
            >
              <Eye className="h-4 w-4" />
              {isEnglish ? 'View' : 'عرض'}
            </Button>
            <Button
              onClick={() => onPrintAction(approvedAdvisorPlan, 'print')}
              className="flex h-11 items-center gap-1.5 bg-primary font-semibold text-xs text-primary-foreground shadow-md transition-all hover:bg-primary/80 cursor-pointer"
            >
              <Printer className="h-4 w-4" />
              {isEnglish ? 'Print' : 'طباعة'}
            </Button>
            <Button
              variant="outline"
              onClick={() => onPrintAction(approvedAdvisorPlan, 'download')}
              className="flex h-11 items-center gap-1.5 border-primary font-semibold text-xs text-primary shadow-md transition-all hover:bg-primary/10 cursor-pointer"
            >
              <FileText className="h-4 w-4" />
              {isEnglish ? 'Download PDF' : 'تحميل PDF'}
            </Button>
          </div>
        )}
      </Card>
    </motion.div>
  );
}
