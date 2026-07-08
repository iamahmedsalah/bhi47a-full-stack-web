'use client';

import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { CheckCircle2, Clock, FileText, Printer, Send } from 'lucide-react';
import { toast } from 'sonner';
import api, { getApiErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

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
        <h2>${form.instituteName}</h2>
        <h1>${form.title}</h1>
        <section class="meta">
          <div><strong>Student Name:</strong> ${info.studentName ?? ''}</div>
          <div><strong>Student Code:</strong> ${info.studentCode ?? ''}</div>
          <div><strong>National ID:</strong> ${info.nationalId ?? ''}</div>
          <div><strong>Academic Level:</strong> ${info.academicLevel ?? ''}</div>
          <div><strong>Semester:</strong> ${info.semester ?? ''}</div>
          <div><strong>GPA:</strong> ${info.gpa ?? ''}</div>
          <div><strong>Advisor Name:</strong> ${info.advisorName ?? ''}</div>
        </section>
        <table>
          <thead>
            <tr><th>Code</th><th>Course Name</th><th>Credit Hours</th><th>Type</th><th>Status</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <p><strong>Total Credit Hours:</strong> ${form.totalCreditHours}</p>
        <p><strong>Registration Status:</strong> ${form.registrationStatus}</p>
        <p><strong>Advisor Notes:</strong> ${form.advisorNotes ?? ''}</p>
        <div class="signatures">
          <div>Student Signature: ____________________</div>
          <div>Advisor Signature: ____________________</div>
        </div>
        <p>Date: ${form.date}</p>
      </body>
    </html>`;

  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}

export default function RegistrationPage() {
  const params = useParams();
  const locale = params.locale as string;
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const eligibilityQuery = useQuery({
    queryKey: ['registration-eligibility'],
    queryFn: async () => {
      const res = await api.get<Eligibility>('/registration/eligibility');
      return res.data;
    },
  });

  const availableQuery = useQuery({
    queryKey: ['available-registration-courses'],
    enabled: Boolean(eligibilityQuery.data?.canRegisterDirectly),
    queryFn: async () => {
      const res = await api.get<{ maxCreditHours: number; courses: Course[] }>(
        '/registration/available-courses',
      );
      return res.data;
    },
  });

  const advisingQuery = useQuery({
    queryKey: ['advising-status'],
    queryFn: async () => {
      const res = await api.get<{
        request: AdvisingRequest | null;
        registration: Registration | null;
      }>('/registration/advising-status');
      return res.data;
    },
  });

  const latestRegistrationQuery = useQuery({
    queryKey: ['latest-registration'],
    queryFn: async () => {
      const res = await api.get<Registration | null>('/registration/latest');
      return res.data;
    },
  });

  const courses = availableQuery.data?.courses ?? [];
  const selectedCourses = courses.filter((course) => selected.includes(course.code));
  const selectedHours = useMemo(
    () => selectedCourses.reduce((sum, course) => sum + (course.creditHours ?? 0), 0),
    [selectedCourses],
  );

  const submitRegistration = async () => {
    setSubmitting(true);
    try {
      await api.post('/registration/submit', { courseCodes: selected });
      toast.success(locale === 'ar' ? 'تم تسجيل المواد بنجاح' : 'Registration submitted');
      setSelected([]);
      await queryClient.invalidateQueries({ queryKey: ['latest-registration'] });
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

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {locale === 'ar' ? 'تسجيل المواد والإرشاد الأكاديمي' : 'Course Registration'}
            </h1>
            <p className="mt-1 text-sm text-muted">
              GPA {eligibility?.gpa ?? '-'} · Level {eligibility?.academicLevel ?? '-'} ·{' '}
              {eligibility?.semester ?? '-'}
            </p>
          </div>
          <div className="rounded-md border border-border px-4 py-2 text-sm text-foreground">
            Max hours: {eligibility?.maxCreditHours ?? '-'}
          </div>
        </div>
      </div>

      {eligibility?.requiresAdvisor ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock className="h-5 w-5" />
              Academic advising required
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted">
              Direct registration is blocked because your GPA requires advisor approval.
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-md border border-border p-3">
                <p className="text-xs text-muted">Status</p>
                <p className="font-semibold text-foreground">{advising?.status ?? 'pending'}</p>
              </div>
              <div className="rounded-md border border-border p-3">
                <p className="text-xs text-muted">Advisor</p>
                <p className="font-semibold text-foreground">
                  {advising?.assignedStaffId?.name ?? 'Pending assignment'}
                </p>
              </div>
              <div className="rounded-md border border-border p-3">
                <p className="text-xs text-muted">Reason</p>
                <p className="font-semibold text-foreground">{advising?.reason ?? '-'}</p>
              </div>
            </div>

            <div>
              <h2 className="mb-2 text-sm font-semibold text-foreground">Recommended courses</h2>
              <div className="flex flex-wrap gap-2">
                {(advising?.staffApprovedCourses?.length
                  ? advising.staffApprovedCourses
                  : advising?.autoSuggestedCourses ?? []
                ).map((code) => (
                  <span key={code} className="rounded-md bg-secondary px-3 py-1 text-sm">
                    {code}
                  </span>
                ))}
              </div>
            </div>

            {advising?.staffNotes && (
              <p className="rounded-md border border-border bg-secondary/30 p-3 text-sm">
                {advising.staffNotes}
              </p>
            )}

            {approvedAdvisorPlan && (
              <Button onClick={() => printRegistration(approvedAdvisorPlan)}>
                <Printer className="h-4 w-4" />
                Print approved registration
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CheckCircle2 className="h-5 w-5" />
              Direct registration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead />
                  <TableHead>Code</TableHead>
                  <TableHead>Course</TableHead>
                  <TableHead>Hours</TableHead>
                  <TableHead>Type</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {courses.map((course) => (
                  <TableRow key={course._id}>
                    <TableCell>
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
                        className="w-4 h-4 rounded-full text-primary bg-input border-input-border cursor-pointer focus:ring-primary"
                      />
                    </TableCell>
                    <TableCell className="font-mono">{course.code}</TableCell>
                    <TableCell>{course.name}</TableCell>
                    <TableCell>{course.creditHours ?? 0}</TableCell>
                    <TableCell>{course.type ?? 'required'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <p className="text-sm text-muted">
                Selected hours: {selectedHours} / {eligibility?.maxCreditHours ?? 0}
              </p>
              <Button
                disabled={
                  selected.length === 0 ||
                  selectedHours > (eligibility?.maxCreditHours ?? 0) ||
                  submitting
                }
                onClick={submitRegistration}
              >
                <Send className="h-4 w-4" />
                Submit registration
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {latestRegistration && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="h-5 w-5" />
              Latest registration
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-muted">
              {latestRegistration.courses.join(', ')} · {latestRegistration.totalCreditHours} hours ·{' '}
              {latestRegistration.status}
            </p>
            <Button variant="secondary" onClick={() => printRegistration(latestRegistration)}>
              <Printer className="h-4 w-4" />
              Print form
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
