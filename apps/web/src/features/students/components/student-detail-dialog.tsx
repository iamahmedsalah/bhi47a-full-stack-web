'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BookOpen,
  FileSpreadsheet,
  GraduationCap,
  Loader2,
  Mail,
  MapPin,
  Users,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { StatusBadge } from '@/components/ui/status-badge';

export interface StudentUserRef {
  isActive?: boolean;
  mustChangePassword?: boolean;
  lastLoginAt?: string;
  phone?: string;
  nationalIdMasked?: string;
  nationalId?: string;
}

export interface Student {
  _id: string;
  studentCode: string;
  fullName: string;
  nationalIdMasked?: string;
  nationalId?: string;
  academicEmail?: string;
  department?: string;
  level: string;
  group?: string;
  section?: string;
  academicYear: string;
  semester: string;
  enrollmentStatus: string;
  seatNumber?: string;
  examRoom?: string;
  examFloor?: string;
  examBuilding?: string;
  createdAt?: string;
  updatedAt?: string;
  userId?: StudentUserRef | string;
}

export interface Grade {
  _id: string;
  courseCode: string;
  courseName: string;
  examType: string;
  grade: number;
  maxGrade: number;
  status: string;
  academicYear: string;
  semester: string;
  isPublished: boolean;
}

export interface Complaint {
  _id: string;
  ticketNumber: string;
  title: string;
  status: string;
  priority: string;
  type: string;
  createdAt: string;
}

export interface AcademicEmail {
  _id: string;
  academicEmail: string;
  status: string;
}

function getUserRef(student: Student): StudentUserRef | null {
  return typeof student.userId === 'object' && student.userId ? student.userId : null;
}

function formatDate(value?: string, locale?: string) {
  if (!value) return 'N/A';
  return new Date(value).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function InfoItem({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/70 bg-surface/35 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-1 break-words text-sm font-semibold text-foreground">{value || 'N/A'}</div>
    </div>
  );
}

function SensitiveNationalId({
  value,
  realValue,
  canView,
}: {
  value?: string;
  realValue?: string;
  canView: boolean;
}) {
  if (!canView) {
    return (
      <span className="rounded-squircle border border-border/70 bg-surface/50 px-2.5 py-1 text-xs font-semibold text-muted-foreground">
        Restricted
      </span>
    );
  }

  const displayValue = realValue || value;

  if (!displayValue) {
    return <span className="text-sm text-muted-foreground">N/A</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-sm text-muted-foreground">{displayValue}</span>
      <CopyButton
        value={realValue || displayValue}
        label="Copy"
        successMessage="National ID copied"
        className="rounded-squircle px-2 py-1"
      />
    </div>
  );
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
      <span className="text-primary">{icon}</span>
      {title}
    </div>
  );
}

export function StudentDetailDialog({
  open,
  onOpenChange,
  student,
  grades,
  complaints,
  academicEmail,
  isLoading,
  gradesLoading,
  complaintsLoading,
  locale,
  canViewSensitiveStudentData,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: Student | null;
  grades: Grade[];
  complaints: Complaint[];
  academicEmail: AcademicEmail | null | undefined;
  isLoading: boolean;
  gradesLoading: boolean;
  complaintsLoading: boolean;
  locale: string;
  canViewSensitiveStudentData: boolean;
}) {
  const router = useRouter();
  const [visibleComplaints, setVisibleComplaints] = useState(5);

  const userRef = student ? getUserRef(student) : null;
  const coursesFromGrades = useMemo(() => {
    const map = new Map<string, Grade>();
    grades.forEach((grade) => map.set(grade.courseCode, grade));
    return Array.from(map.values());
  }, [grades]);

  const isAr = locale === 'ar';
  const semesterMap: Record<string, string> = {
    first: isAr ? 'الأول' : 'First',
    second: isAr ? 'الثاني' : 'Second',
    summer: isAr ? 'الصيفي' : 'Summer',
  };
  const enrollmentStatusMap: Record<string, string> = {
    active: isAr ? 'نشط' : 'Active',
    suspended: isAr ? 'موقوف' : 'Suspended',
    graduated: isAr ? 'خريج' : 'Graduated',
    withdrawn: isAr ? 'منسحب' : 'Withdrawn',
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setVisibleComplaints(5);
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="max-w-5xl rounded-xl border border-border/70 bg-card/95 p-0 text-foreground shadow-[var(--shadow-glow)] backdrop-blur" dir={isAr ? 'rtl' : 'ltr'}>
        <div className="border-b border-border/70 p-5">
          <DialogHeader className="text-start">
            <DialogTitle className="flex flex-wrap items-center gap-2 text-2xl">
              <GraduationCap className="h-6 w-6 text-primary" />
              {student?.fullName || (isAr ? 'الملف الشخصي للطالب' : 'Student Profile')}
            </DialogTitle>
            <DialogDescription>
              {student?.studentCode
                ? isAr
                  ? `تفاصيل الملف الكامل للطالب ${student.studentCode}`
                  : `Complete profile for ${student.studentCode}`
                : isAr
                  ? 'جاري تحميل بيانات الطالب...'
                  : 'Loading student profile...'}
            </DialogDescription>
          </DialogHeader>
        </div>

        {isLoading || !student ? (
          <div className="flex min-h-80 items-center justify-center">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
          </div>
        ) : (
          <div className="max-h-[78vh] space-y-5 overflow-y-auto p-5 text-start">
            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <InfoItem label={isAr ? "كود الطالب" : "Student Code"} value={<span className="font-mono text-primary">{student.studentCode}</span>} />
              <InfoItem label={isAr ? "حالة القيد" : "Enrollment Status"} value={<StatusBadge label={enrollmentStatusMap[student.enrollmentStatus] ?? student.enrollmentStatus} variant={student.enrollmentStatus === 'active' ? 'success' : 'warning'} />} />
              <InfoItem label={isAr ? "حساب مفعل" : "Account Active"} value={userRef?.isActive === false ? (isAr ? 'لا' : 'No') : (isAr ? 'نعم' : 'Yes')} />
              <InfoItem label={isAr ? "آخر تسجيل دخول" : "Last Login"} value={formatDate(userRef?.lastLoginAt, locale)} />
            </section>

            <section>
              <SectionTitle icon={<Users className="h-4 w-4" />} title={isAr ? "الهوية وبيانات التواصل" : "Identity & Contact"} />
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <InfoItem label={isAr ? "الاسم الكامل" : "Full Name"} value={student.fullName} />
                <InfoItem
                  label={isAr ? "الرقم القومي" : "National ID"}
                  value={
                    <SensitiveNationalId
                      value={student.nationalIdMasked || userRef?.nationalIdMasked}
                      realValue={userRef?.nationalId}
                      canView={canViewSensitiveStudentData}
                    />
                  }
                />
                <InfoItem label={isAr ? "البريد الأكاديمي" : "Academic Email"} value={student.academicEmail || academicEmail?.academicEmail} />
                <InfoItem label={isAr ? "رقم الهاتف" : "Phone"} value={userRef?.phone} />
              </div>
            </section>

            <section>
              <SectionTitle icon={<BookOpen className="h-4 w-4" />} title={isAr ? "الملف الأكاديمي" : "Academic Profile"} />
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <InfoItem label={isAr ? "المستوى الدراسي" : "Level"} value={isAr ? `المستوى ${student.level}` : `Level ${student.level}`} />
                <InfoItem label={isAr ? "القسم" : "Department"} value={student.department} />
                <InfoItem label={isAr ? "المجموعة" : "Group"} value={student.group} />
                <InfoItem label={isAr ? "الفرقة" : "Section"} value={student.section} />
                <InfoItem label={isAr ? "السنة الدراسية" : "Academic Year"} value={student.academicYear} />
                <InfoItem label={isAr ? "الفصل الدراسي" : "Semester"} value={semesterMap[student.semester] ?? student.semester} />
                <InfoItem label={isAr ? "تاريخ الإنشاء" : "Created At"} value={formatDate(student.createdAt, locale)} />
                <InfoItem label={isAr ? "تاريخ التحديث" : "Updated At"} value={formatDate(student.updatedAt, locale)} />
              </div>
            </section>

            <section>
              <SectionTitle icon={<MapPin className="h-4 w-4" />} title={isAr ? "مقر الامتحانات" : "Exam Placement"} />
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <InfoItem label={isAr ? "رقم الجلوس" : "Seat Number"} value={student.seatNumber} />
                <InfoItem label={isAr ? "المبنى" : "Building"} value={student.examBuilding} />
                <InfoItem label={isAr ? "الدور" : "Floor"} value={student.examFloor} />
                <InfoItem label={isAr ? "القاعة" : "Room"} value={student.examRoom} />
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-xl border border-border/70 bg-surface/25 p-4">
                <SectionTitle icon={<FileSpreadsheet className="h-4 w-4" />} title={isAr ? "المقررات والدرجات" : "Courses & Grades"} />
                {gradesLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                ) : coursesFromGrades.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{isAr ? "لا توجد درجات أو مقررات مسجلة بعد." : "No grades or courses recorded yet."}</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {grades.slice(0, 8).map((grade) => (
                      <div key={grade._id} className="flex items-center justify-between gap-3 rounded-squircle border border-border/70 bg-card/70 p-3 text-sm">
                        <div>
                          <p className="font-semibold text-foreground">{grade.courseName}</p>
                          <p className="text-xs text-muted-foreground">{grade.courseCode} · {grade.examType} · {grade.academicYear}</p>
                        </div>
                        <span className="font-mono font-bold text-primary">{grade.grade}/{grade.maxGrade}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-border/70 bg-surface/25 p-4">
                <SectionTitle icon={<Mail className="h-4 w-4" />} title={isAr ? "الشكاوى والتذاكر" : "Complaints & Tickets"} />
                {complaintsLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                ) : complaints.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{isAr ? "لا توجد تذاكر أو شكاوى لهذا الطالب." : "No tickets found for this student."}</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {complaints.slice(0, visibleComplaints).map((complaint) => (
                      <div
                        key={complaint._id}
                        className="rounded-squircle border border-border/70 bg-card/70 p-3 text-sm cursor-pointer hover:border-primary/50 hover:bg-card/90 transition-all"
                        onClick={() => {
                          onOpenChange(false);
                          router.push(`/${locale}/admin/complaints?ticket=${complaint.ticketNumber}`);
                        }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-mono font-bold text-primary">{complaint.ticketNumber}</p>
                          <StatusBadge label={complaint.status} variant={complaint.status === 'resolved' ? 'success' : 'warning'} />
                        </div>
                        <p className="mt-1 font-semibold text-foreground">{complaint.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{complaint.type} · {complaint.priority} · {formatDate(complaint.createdAt, locale)}</p>
                      </div>
                    ))}
                    {complaints.length > visibleComplaints && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-xs hover:bg-primary/10 hover:text-primary mt-2 cursor-pointer"
                        onClick={() => setVisibleComplaints((prev) => prev + 5)}
                      >
                        {locale === 'ar' ? 'عرض المزيد من الشكاوى' : 'Load more complaints'}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
