'use client';

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { CheckCircle2, Clock, FileText, Printer, Send, Sparkles, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import api, { getApiErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { LoadingState } from '@/components/ui/feedback';
import { motion } from 'framer-motion';

interface Course {
  _id: string;
  code: string;
  name: string;
  creditHours?: number;
  type?: 'required' | 'elective';
}

interface Eligibility {
  canRegisterDirectly: boolean;
  maxCreditHours: number;
  requiresAdvisor: boolean;
  gpa: number;
  academicLevel: string;
  semester: string;
  failedCourses: string[];
  advisingRequest?: AdvisingRequest | null;
}

interface AdvisingRequest {
  _id: string;
  status: string;
  reason: string;
  autoSuggestedCourses: string[];
  staffApprovedCourses: string[];
  staffNotes?: string;
  assignedStaffId?: { name?: string; email?: string };
}

interface Registration {
  _id: string;
  courses: string[];
  totalCreditHours: number;
  source: string;
  status: string;
}

interface PrintableForm {
  instituteName: string;
  title: string;
  studentInformation: Record<string, string | number | undefined>;
  registeredCourses: Array<{
    code: string;
    courseName: string;
    creditHours: number;
    type: string;
    status: string;
  }>;
  totalCreditHours: number;
  registrationStatus: string;
  advisorNotes?: string;
  date: string;
}

function openPrintableForm(form: PrintableForm) {
  const rows = form.registeredCourses
    .map(
      (course) => `
        <tr>
          <td>${course.code}</td>
          <td>${course.courseName}</td>
          <td>${course.creditHours}</td>
          <td>${course.type}</td>
          <td>${course.status}</td>
        </tr>`,
    )
    .join('');

  const info = form.studentInformation;
  const html = `
    <html>
      <head>
        <title>${form.title}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #111827; padding: 32px; }
          h1, h2 { margin: 0 0 12px; }
          .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin: 20px 0; }
          table { border-collapse: collapse; width: 100%; margin: 18px 0; }
          th, td { border: 1px solid #d1d5db; padding: 10px; text-align: left; }
          th { background: #f3f4f6; }
          .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; margin-top: 48px; }
        </style>
      </head>
      <body>
        <div style="text-align: center; border-bottom: 2px solid #0f766e; padding-bottom: 12px; margin-bottom: 24px;">
          <h2>${form.instituteName}</h2>
          <h1>${form.title}</h1>
        </div>
        <div class="meta">
          ${Object.entries(info)
            .map(([k, v]) => `<div><strong>${k}:</strong> ${v ?? '—'}</div>`)
            .join('')}
        </div>
        <hr/>
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Course</th>
              <th>Hours</th>
              <th>Type</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <div><strong>Total registered hours:</strong> ${form.totalCreditHours}</div>
        <div><strong>Registration status:</strong> ${form.registrationStatus}</div>
        ${form.advisorNotes ? `<div style="margin-top: 12px; font-style: italic;"><strong>Advisor Notes:</strong> ${form.advisorNotes}</div>` : ''}
        <div class="signatures">
          <div>Student signature: ______________________</div>
          <div>Academic Advisor signature: ______________________</div>
        </div>
        <div style="margin-top: 48px; font-size: 11px; text-align: center; color: #6b7280;">Printed on ${form.date}</div>
        <script>window.print();</script>
      </body>
    </html>`;

  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}

export default function CourseRegistrationPage() {
  const params = useParams();
  const locale = params.locale as string;
  const isEnglish = locale === 'en';

  const [selected, setSelected] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const eligibilityQuery = useQuery({
    queryKey: ['registration-eligibility'],
    queryFn: async () => {
      const res = await api.get<Eligibility>('/registration/eligibility');
      return res.data;
    },
  });

  const coursesQuery = useQuery({
    queryKey: ['registration-courses'],
    queryFn: async () => {
      const res = await api.get<Course[]>('/registration/courses');
      return res.data;
    },
  });

  const latestRegistrationQuery = useQuery({
    queryKey: ['latest-registration'],
    queryFn: async () => {
      const res = await api.get<Registration | null>('/registrations/latest');
      return res.data;
    },
  });

  const advisingQuery = useQuery({
    queryKey: ['student-advising-state'],
    queryFn: async () => {
      const res = await api.get<{ request: AdvisingRequest; registration: Registration }>('/advising/my-request');
      return res.data;
    },
  });

  const courses = coursesQuery.data || [];
  const selectedHours = useMemo(() => {
    return selected.reduce((sum, code) => {
      const match = courses.find((c) => c.code === code);
      return sum + (match?.creditHours ?? 0);
    }, 0);
  }, [selected, courses]);

  const submitRegistration = async () => {
    setSubmitting(true);
    try {
      await api.post('/registrations/direct', { courses: selected });
      toast.success(isEnglish ? 'Registration successful' : 'تم تسجيل المواد بنجاح');
      void latestRegistrationQuery.refetch();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const printRegistration = async (registration?: Registration | null) => {
    if (!registration) return;
    try {
      const res = await api.get<PrintableForm>(`/registrations/${registration._id}/print`);
      openPrintableForm(res.data);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  const eligibility = eligibilityQuery.data;
  const advising = advisingQuery.data?.request ?? eligibility?.advisingRequest;
  const approvedAdvisorPlan = advisingQuery.data?.registration;
  const latestRegistration = latestRegistrationQuery.data;

  if (eligibilityQuery.isLoading || coursesQuery.isLoading) {
    return <LoadingState title={isEnglish ? 'Loading...' : 'جاري التحميل...'} />;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6" dir={isEnglish ? 'ltr' : 'rtl'}>
      {/* Welcome & Info Card */}
      <div className="relative overflow-hidden bg-gradient-to-r from-teal-950/40 via-teal-900/20 to-transparent rounded-2xl p-6 border border-primary/20 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-lg">
        <div className="space-y-1.5 z-10">
          <div className="inline-flex items-center gap-1 px-3 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-xs font-semibold text-primary">
            <Sparkles className="w-3 h-3" />
            {isEnglish ? 'Academic Advising & Course Registration' : 'تسجيل المواد والإرشاد الأكاديمي'}
          </div>
          <h2 className="text-xl font-bold text-foreground">
            GPA: {eligibility?.gpa?.toFixed(2) ?? '-'} · Level {eligibility?.academicLevel ?? '-'} · {eligibility?.semester ?? '-'}
          </h2>
          <p className="text-xs text-muted-foreground max-w-xl">
            {isEnglish
              ? 'Select eligible courses, review credit hours caps, and download registration slips'
              : 'اختر المواد التي ترغب في تسجيلها، راجع الحد الأقصى للساعات المعتمدة، واطبع كشف التسجيل الخاص بك.'}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-secondary/40 px-4 py-2.5 text-xs font-bold text-foreground shrink-0 z-10 text-center font-mono">
          Max hours: {eligibility?.maxCreditHours ?? '-'}
        </div>
        <div className="absolute -right-20 -top-20 w-40 h-40 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
      </div>

      {eligibility?.requiresAdvisor ? (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <Card className="p-6 bg-card/45 backdrop-blur-sm border-border shadow-sm space-y-5">
            <div className="flex items-center gap-3 border-b border-border pb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">
                  {isEnglish ? 'Academic Advising Required' : 'إرشاد أكاديمي مطلوب'}
                </h3>
                <p className="text-xs text-muted-foreground">{isEnglish ? 'Direct registration is locked' : 'التسجيل المباشر مغلق لمراجعة المرشد'}</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="bg-secondary/40 p-3.5 rounded-xl border border-border/80 text-start">
                <span className="text-[10px] font-bold text-muted-foreground uppercase">{isEnglish ? 'Status' : 'حالة الطلب'}</span>
                <p className="text-sm font-bold text-foreground capitalize mt-1">{advising?.status ?? 'pending'}</p>
              </div>
              <div className="bg-secondary/40 p-3.5 rounded-xl border border-border/80 text-start">
                <span className="text-[10px] font-bold text-muted-foreground uppercase">{isEnglish ? 'Advisor' : 'المرشد الأكاديمي'}</span>
                <p className="text-sm font-bold text-foreground mt-1">
                  {advising?.assignedStaffId?.name ?? (isEnglish ? 'Pending assignment' : 'في انتظار التخصيص')}
                </p>
              </div>
              <div className="bg-secondary/40 p-3.5 rounded-xl border border-border/80 text-start">
                <span className="text-[10px] font-bold text-muted-foreground uppercase">{isEnglish ? 'Reason' : 'السبب'}</span>
                <p className="text-sm font-bold text-foreground mt-1">{advising?.reason ?? '-'}</p>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-bold text-foreground">{isEnglish ? 'Recommended Courses' : 'المقررات المقترحة المقبولة'}</h4>
              <div className="flex flex-wrap gap-2">
                {(advising?.staffApprovedCourses?.length
                  ? advising.staffApprovedCourses
                  : advising?.autoSuggestedCourses ?? []
                ).map((code) => (
                  <span key={code} className="rounded-lg bg-secondary border border-border px-3 py-1 text-xs font-bold font-mono text-foreground">
                    {code}
                  </span>
                ))}
              </div>
            </div>

            {advising?.staffNotes && (
              <div className="p-3.5 rounded-xl border border-border bg-secondary/20 text-xs text-muted-foreground leading-normal">
                <strong>{isEnglish ? 'Advisor Notes:' : 'ملاحظات المرشد الأكاديمي:'}</strong> {advising.staffNotes}
              </div>
            )}

            {approvedAdvisorPlan && (
              <div className="pt-2">
                <Button
                  onClick={() => printRegistration(approvedAdvisorPlan)}
                  className="flex items-center gap-1.5 h-11 text-xs font-semibold bg-primary hover:bg-primary/80 text-primary-foreground transition-all cursor-pointer"
                >
                  <Printer className="h-4 w-4" />
                  {isEnglish ? 'Print approved registration' : 'طباعة استمارة التسجيل المعتمدة'}
                </Button>
              </div>
            )}
          </Card>
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <Card className="p-6 bg-card/45 backdrop-blur-sm border-border shadow-sm space-y-5">
            <div className="flex items-center gap-3 border-b border-border pb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">
                  {isEnglish ? 'Direct Registration' : 'التسجيل المباشر للمواد'}
                </h3>
                <p className="text-xs text-muted-foreground">{isEnglish ? 'Select courses to register for this semester' : 'اختر المقررات الدراسية المناسبة لتسجيلها للفصل الحالي'}</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-start text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground font-bold pb-2 text-start">
                    <th className="pb-3 text-start w-12" />
                    <th className="pb-3 text-start">{isEnglish ? 'Code' : 'الكود الأكاديمي'}</th>
                    <th className="pb-3 text-start">{isEnglish ? 'Course' : 'المقرر الدراسي'}</th>
                    <th className="pb-3 text-center">{isEnglish ? 'Hours' : 'عدد الساعات'}</th>
                    <th className="pb-3 text-end">{isEnglish ? 'Type' : 'النوع'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {courses.map((course) => (
                    <tr key={course._id} className="text-foreground hover:bg-secondary/25 transition-colors">
                      <td className="py-3 text-start">
                        <input
                          type="checkbox"
                          checked={selected.includes(course.code)}
                          onChange={(event) => {
                            setSelected((current) =>
                              event.target.checked
                                ? [...current, course.code]
                                : current.filter((code) => code !== course.code),
                            );
                          }}
                          className="w-4 h-4 rounded text-primary bg-secondary/50 border-border cursor-pointer focus:ring-primary"
                        />
                      </td>
                      <td className="py-3 text-start font-mono font-semibold text-foreground">{course.code}</td>
                      <td className="py-3 text-start font-bold text-foreground">{course.name}</td>
                      <td className="py-3 text-center font-mono font-semibold">{course.creditHours ?? 0}</td>
                      <td className="py-3 text-end text-muted-foreground">{course.type ?? 'required'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between pt-4 border-t border-border mt-4">
              <p className="text-xs font-bold text-muted-foreground font-mono">
                {isEnglish ? 'Selected hours:' : 'الساعات المختارة:'} {selectedHours} / {eligibility?.maxCreditHours ?? 0}
              </p>
              <Button
                disabled={
                  selected.length === 0 ||
                  selectedHours > (eligibility?.maxCreditHours ?? 0) ||
                  submitting
                }
                onClick={submitRegistration}
                className="flex items-center gap-1.5 h-11 text-xs font-semibold bg-primary hover:bg-primary/80 text-primary-foreground transition-all cursor-pointer shadow-md"
              >
                <Send className="h-4 w-4" />
                {isEnglish ? 'Submit registration' : 'تأكيد وحفظ المقررات'}
              </Button>
            </div>
          </Card>
        </motion.div>
      )}

      {latestRegistration && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
          <Card className="p-5 bg-card/45 backdrop-blur-sm border-border shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
                <FileText className="h-5 w-5" />
              </div>
              <div className="space-y-0.5">
                <p className="text-sm font-bold text-foreground">
                  {isEnglish ? 'Latest Registration Slip' : 'آخر تسجيل للمواد'}
                </p>
                <p className="text-xs text-muted-foreground truncate max-w-sm">
                  {latestRegistration.courses.join(', ')} · {latestRegistration.totalCreditHours} {isEnglish ? 'hours' : 'ساعات'} · {latestRegistration.status}
                </p>
              </div>
            </div>
            <Button
              variant="secondary"
              onClick={() => printRegistration(latestRegistration)}
              className="h-10 text-xs font-semibold bg-secondary hover:bg-secondary/80 text-foreground transition-all cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Printer className="h-4 w-4" />
              {isEnglish ? 'Print Slip' : 'طباعة الاستمارة'}
            </Button>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
