'use client';

import React, { Suspense, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BookOpen,
  Download,
  Edit2,
  FileSpreadsheet,
  GraduationCap,
  Loader2,
  Lock,
  Mail,
  MapPin,
  Plus,
  Trash2,
  UploadCloud,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react';
import { COURSE_LEVEL_VALUES, ENROLLMENT_STATUS_VALUES } from '@student-portal/shared';
import { toast } from 'sonner';

import { getApiErrorMessage } from '@/lib/api';
import { downloadExcel } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';
import { PermissionGuard } from '@/components/ui/permission-guard';
import { useStudentStore } from '@/store/student-store';
import { cn } from '@/lib/cn';
import {
  activateStudent,
  createStudent,
  deactivateStudent,
  getStudent,
  getStudentAcademicEmail,
  listAllStudentsForExport,
  listStudentComplaints,
  listStudentGrades,
  listStudents,
  resetStudentPassword,
  studentKeys,
  updateStudent,
} from '@/features/students/api';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { CopyButton } from '@/components/ui/copy-button';
import { DataTableShell, type ColumnDef } from '@/components/ui/data-table-shell';
import { DataUploadDialog } from '@/components/ui/data-upload-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FilterBar } from '@/components/ui/filter-bar';
import { Input } from '@/components/ui/input';
import { PageSkeletonLoader } from '@/components/ui/page-suspense-fallback';
import { PageTitleBanner } from '@/components/ui/page-title-banner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/status-badge';
import { TableCell } from '@/components/ui/table';

interface StudentUserRef {
  isActive?: boolean;
  mustChangePassword?: boolean;
  lastLoginAt?: string;
  phone?: string;
  nationalIdMasked?: string;
  nationalId?: string;
}

interface Student {
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
  registrationSummary?: {
    academicYear?: string;
    semester?: string;
    isTermOpen: boolean;
    status: string;
    registrationId?: string;
    courseCount: number;
    totalCreditHours: number;
    advisingCaseId?: string;
    advisingStatus: string;
  };
}

interface Grade {
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

interface Complaint {
  _id: string;
  ticketNumber: string;
  title: string;
  status: string;
  priority: string;
  type: string;
  createdAt: string;
}

interface AcademicEmail {
  _id: string;
  academicEmail: string;
  status: string;
}

type StudentFormState = {
  fullName: string;
  studentCode: string;
  nationalId: string;
  academicEmail: string;
  department: string;
  level: string;
  group: string;
  section: string;
  academicYear: string;
  semester: string;
  seatNumber: string;
  examRoom: string;
  examFloor: string;
  examBuilding: string;
  enrollmentStatus: string;
  mustChangePassword: boolean;
};

const initialForm: StudentFormState = {
  fullName: '',
  studentCode: '',
  nationalId: '',
  academicEmail: '',
  department: '',
  level: '1',
  group: '',
  section: '',
  academicYear: '2024-2025',
  semester: 'first',
  seatNumber: '',
  examRoom: '',
  examFloor: '',
  examBuilding: '',
  enrollmentStatus: 'active',
  mustChangePassword: false,
};

const studentImportColumns = [
  'studentCode',
  'fullName',
  'nationalId',
  'level',
  'department',
  'academicEmail',
  'academicYear',
  'semester',
  'group',
  'section',
  'seatNumber',
  'examRoom',
  'examFloor',
  'examBuilding',
  'mustChangePassword',
];

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

function ActionButton({
  children,
  variant = 'neutral',
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode;
  variant?: 'neutral' | 'primary' | 'danger' | 'success';
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-squircle border px-3 py-1.5 text-xs font-bold transition-all disabled:cursor-not-allowed disabled:opacity-45',
        variant === 'primary' && 'border-primary/30 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground',
        variant === 'danger' && 'border-danger/30 bg-danger/10 text-danger hover:bg-danger hover:text-danger-foreground',
        variant === 'success' && 'border-success/30 bg-success/10 text-success hover:bg-success hover:text-white',
        variant === 'neutral' && 'border-border bg-surface/50 text-muted-foreground hover:border-primary/35 hover:bg-primary/10 hover:text-primary',
      )}
    >
      {children}
    </button>
  );
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

function StudentsPageContent() {
  const t = useTranslations('students');
  const tCommon = useTranslations('common');
  const params = useParams();
  const router = useRouter();
  const locale = params.locale as string;
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { search, level, status, sortBy, sortOrder, page, selectedKeys, setFilter, setSelectedKeys } = useStudentStore();
  const limit = 10;
  const canViewSensitiveStudentData = user?.role === 'admin';

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isBulkDeactivateOpen, setIsBulkDeactivateOpen] = useState(false);
  const [profileStudent, setProfileStudent] = useState<Student | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [form, setForm] = useState<StudentFormState>(initialForm);
  const [newPassword, setNewPassword] = useState('');
  const [forcePasswordChange, setForcePasswordChange] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  const studentsQuery = useQuery({
    queryKey: studentKeys.list({ page, limit, search, level, enrollmentStatus: status, sortBy, sortOrder: sortOrder as 'asc' | 'desc' }),
    queryFn: async () => {
      const queryParams: Record<string, string | number> = { page, limit };
      if (search.trim()) queryParams.search = search.trim();
      if (level !== 'all') queryParams.level = level;
      if (status !== 'all') queryParams.enrollmentStatus = status;
      if (sortBy) queryParams.sortBy = sortBy;
      if (sortOrder) queryParams.sortOrder = sortOrder;

      return listStudents(queryParams);
    },
  });

  const profileQuery = useQuery({
    queryKey: studentKeys.detail(profileStudent?._id),
    enabled: Boolean(profileStudent),
    queryFn: () => getStudent(profileStudent?._id ?? ''),
  });

  const profileGradesQuery = useQuery({
    queryKey: studentKeys.grades(profileStudent?.studentCode),
    enabled: Boolean(profileStudent?.studentCode),
    queryFn: async () => {
      const response = await listStudentGrades(profileStudent?.studentCode ?? '');
      return response.items;
    },
  });

  const profileComplaintsQuery = useQuery({
    queryKey: studentKeys.complaints(profileStudent?.studentCode),
    enabled: Boolean(profileStudent?.studentCode),
    queryFn: async () => {
      const response = await listStudentComplaints(profileStudent?.studentCode ?? '');
      return response.items;
    },
  });

  const profileEmailQuery = useQuery({
    queryKey: studentKeys.academicEmail(profileStudent?.studentCode),
    enabled: Boolean(profileStudent?.studentCode),
    queryFn: () => getStudentAcademicEmail(profileStudent?.studentCode ?? ''),
  });

  const students = studentsQuery.data?.items ?? [];
  const total = studentsQuery.data?.total ?? 0;
  const totalPages = studentsQuery.data?.totalPages ?? 1;
  const fromRow = total === 0 ? 0 : (page - 1) * limit + 1;
  const toRow = Math.min(page * limit, total);

  const profileDetail = profileQuery.data ?? profileStudent;
  const profileGrades = profileGradesQuery.data ?? [];
  const profileComplaints = profileComplaintsQuery.data ?? [];
  const profileEmail = profileEmailQuery.data;

  const setFormField = (key: keyof StudentFormState, value: string | boolean) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const openAddModal = () => {
    setSelectedStudent(null);
    setForm(initialForm);
    setFormError('');
    setIsAddOpen(true);
  };

  const openEditModal = (student: Student) => {
    setSelectedStudent(student);
    setForm({
      fullName: student.fullName ?? '',
      studentCode: student.studentCode ?? '',
      nationalId: '',
      academicEmail: student.academicEmail ?? '',
      department: student.department ?? '',
      level: student.level ?? '1',
      group: student.group ?? '',
      section: student.section ?? '',
      academicYear: student.academicYear ?? '2024-2025',
      semester: student.semester ?? 'first',
      seatNumber: student.seatNumber ?? '',
      examRoom: student.examRoom ?? '',
      examFloor: student.examFloor ?? '',
      examBuilding: student.examBuilding ?? '',
      enrollmentStatus: student.enrollmentStatus ?? 'active',
      mustChangePassword: getUserRef(student)?.mustChangePassword ?? false,
    });
    setFormError('');
    setIsEditOpen(true);
  };

  const openResetModal = (student: Student) => {
    setSelectedStudent(student);
    setNewPassword('');
    setForcePasswordChange(false);
    setFormError('');
    setIsResetOpen(true);
  };

  const invalidateStudents = () => {
    void queryClient.invalidateQueries({ queryKey: ['students'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-analytics-students'] });
  };

  const handleAddSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');
    setFormLoading(true);

    try {
      await createStudent({
        studentCode: form.studentCode,
        fullName: form.fullName,
        nationalId: form.nationalId,
        academicEmail: form.academicEmail || undefined,
        department: form.department || undefined,
        level: form.level,
        group: form.group || undefined,
        section: form.section || undefined,
        academicYear: form.academicYear,
        semester: form.semester,
        seatNumber: form.seatNumber || undefined,
        examRoom: form.examRoom || undefined,
        examFloor: form.examFloor || undefined,
        examBuilding: form.examBuilding || undefined,
        mustChangePassword: form.mustChangePassword,
      });
      setIsAddOpen(false);
      toast.success(locale === 'ar' ? 'تمت إضافة الطالب بنجاح' : 'Student added successfully');
      invalidateStudents();
    } catch (error) {
      setFormError(getApiErrorMessage(error, 'Failed to save student'));
    } finally {
      setFormLoading(false);
    }
  };

  const handleEditSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedStudent) return;
    setFormError('');
    setFormLoading(true);

    try {
      await updateStudent(selectedStudent._id, {
        fullName: form.fullName,
        academicEmail: form.academicEmail || undefined,
        nationalId: form.nationalId.trim() || undefined,
        department: form.department || undefined,
        level: form.level,
        group: form.group || undefined,
        section: form.section || undefined,
        academicYear: form.academicYear,
        semester: form.semester,
        seatNumber: form.seatNumber || undefined,
        examRoom: form.examRoom || undefined,
        examFloor: form.examFloor || undefined,
        examBuilding: form.examBuilding || undefined,
        enrollmentStatus: form.enrollmentStatus,
        mustChangePassword: form.mustChangePassword,
      });
      setIsEditOpen(false);
      toast.success(locale === 'ar' ? 'تم تحديث بيانات الطالب بنجاح' : 'Student updated successfully');
      invalidateStudents();
      void queryClient.invalidateQueries({ queryKey: studentKeys.detail(selectedStudent._id) });
    } catch (error) {
      setFormError(getApiErrorMessage(error, 'Failed to update student'));
    } finally {
      setFormLoading(false);
    }
  };

  const handleResetSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedStudent) return;
    setFormError('');
    setFormLoading(true);

    try {
      await resetStudentPassword(selectedStudent._id, newPassword, forcePasswordChange);
      toast.success(locale === 'ar' ? 'تمت إعادة تعيين كلمة المرور' : 'Password reset successfully');
      setIsResetOpen(false);
    } catch (error) {
      setFormError(getApiErrorMessage(error, 'Failed to reset password'));
    } finally {
      setFormLoading(false);
    }
  };

  const handleBulkDeactivate = async (ids: string[]) => {
    const toastId = toast.loading(locale === 'ar' ? 'جاري تعطيل الحسابات...' : 'Deactivating accounts...');
    try {
      await Promise.all(ids.map((id) => deactivateStudent(id)));
      toast.success(locale === 'ar' ? 'تم تعطيل الحسابات المحددة' : 'Selected accounts deactivated', { id: toastId });
      setSelectedKeys([]);
      invalidateStudents();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to deactivate selected accounts'), { id: toastId });
    }
  };

  const handleActivate = async (student: Student) => {
    const toastId = toast.loading(locale === 'ar' ? 'Ø¬Ø§Ø±ÙŠ ØªÙØ¹ÙŠÙ„ Ø§Ù„Ø­Ø³Ø§Ø¨...' : 'Activating account...');
    try {
      await activateStudent(student._id);
      toast.success(locale === 'ar' ? 'ØªÙ… ØªÙØ¹ÙŠÙ„ Ø­Ø³Ø§Ø¨ Ø§Ù„Ø·Ø§Ù„Ø¨' : 'Student account activated', { id: toastId });
      invalidateStudents();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to activate account'), { id: toastId });
    }
  };

  const handleBulkEdit = () => {
    if (selectedKeys.length !== 1) return;
    const target = students.find((student) => student._id === selectedKeys[0]);
    if (target) openEditModal(target);
  };

  const exportStudents = async () => {
    setIsExporting(true);
    try {
      const baseParams: Record<string, string | number> = { limit: 100 };
      if (search.trim()) baseParams.search = search.trim();
      if (level !== 'all') baseParams.level = level;
      if (status !== 'all') baseParams.enrollmentStatus = status;

      const allStudents = await listAllStudentsForExport(baseParams);
      downloadExcel(
        allStudents.map((student) => ({
          studentCode: student.studentCode,
          fullName: student.fullName,
          nationalId: canViewSensitiveStudentData ? student.nationalIdMasked ?? '' : '',
          academicEmail: student.academicEmail ?? '',
          level: student.level,
          department: student.department ?? '',
          group: student.group ?? '',
          section: student.section ?? '',
          academicYear: student.academicYear,
          semester: student.semester,
          enrollmentStatus: student.enrollmentStatus,
          seatNumber: student.seatNumber ?? '',
          examRoom: student.examRoom ?? '',
          examFloor: student.examFloor ?? '',
          examBuilding: student.examBuilding ?? '',
        })),
        [
          'Student Code',
          'Student Name',
          'National ID',
          'Academic Email',
          'Level',
          'Department',
          'Group',
          'Section',
          'Academic Year',
          'Semester',
          'Status',
          'Seat Number',
          'Exam Room',
          'Exam Floor',
          'Exam Building',
        ],
        `students_export_${new Date().toISOString().slice(0, 10)}`,
      );
      toast.success('Student export is ready');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to export students'));
    } finally {
      setIsExporting(false);
    }
  };

  const columns: ColumnDef<Student>[] = [
    {
      key: 'studentCode',
      header: t('studentCode'),
      render: (student) => (
        <TableCell className="p-4">
          <button
            type="button"
            onClick={() => setProfileStudent(student)}
            className="font-mono text-sm font-bold text-primary underline-offset-4 transition-colors hover:text-primary-light hover:underline cursor-pointer"
          >
            {student.studentCode}
          </button>
        </TableCell>
      ),
    },
    {
      key: 'fullName',
      header: t('studentName'),
      render: (student) => (
        <TableCell className="min-w-56 p-4">
          <div className="font-semibold text-foreground">{student.fullName}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {student.academicEmail || profileEmail?.academicEmail || 'No academic email'}
          </div>
        </TableCell>
      ),
    },
    {
      key: 'academic',
      header: 'Academic Info',
      render: (student) => (
        <TableCell className="min-w-52 p-4 text-sm">
          <div className="font-semibold text-foreground">Level {student.level} · {student.academicYear}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {student.department || 'No department'} · {student.group || 'No group'} · {student.section || 'No section'}
          </div>
        </TableCell>
      ),
    },
    {
      key: 'exam',
      header: 'Exam / Seat',
      render: (student) => (
        <TableCell className="min-w-44 p-4 text-sm">
          <div className="font-mono text-foreground">{student.seatNumber || 'No seat'}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {[student.examBuilding, student.examFloor, student.examRoom].filter(Boolean).join(' / ') || 'No exam place'}
          </div>
        </TableCell>
      ),
    },
    {
      key: 'nationalId',
      header: t('nationalId'),
      render: (student) => (
        <TableCell className="p-4">
          <SensitiveNationalId
            value={student.nationalIdMasked || getUserRef(student)?.nationalIdMasked}
            realValue={getUserRef(student)?.nationalId}
            canView={canViewSensitiveStudentData}
          />
        </TableCell>
      ),
    },
    {
      key: 'registration',
      header: locale === 'ar' ? 'التسجيل' : 'Registration',
      render: (student) => {
        const summary = student.registrationSummary;
        const registered = summary?.status === 'approved';
        return (
          <TableCell className="min-w-52 p-4">
            <button
              type="button"
              onClick={() => router.push(`/${locale}/admin/academic-advising?student=${student.studentCode}`)}
              className="text-start"
            >
              <StatusBadge
                label={registered ? (locale === 'ar' ? 'مسجل' : 'Registered') : (locale === 'ar' ? 'غير مسجل' : 'Not registered')}
                variant={registered ? 'success' : 'warning'}
              />
              <span className="mt-1 block text-xs text-muted-foreground">
                {summary?.academicYear ?? '—'} · {summary?.semester ?? '—'}
              </span>
            </button>
          </TableCell>
        );
      },
    },
    {
      key: 'status',
      header: t('enrollmentStatus'),
      render: (student) => (
        <TableCell className="p-4">
          <StatusBadge
            label={t(`status_${student.enrollmentStatus}`)}
            variant={
              student.enrollmentStatus === 'active'
                ? 'success'
                : student.enrollmentStatus === 'suspended'
                  ? 'warning'
                  : 'danger'
            }
          />
        </TableCell>
      ),
    },
    {
      key: 'actions',
      header: tCommon('actions'),
      className: 'min-w-[300px] text-center',
      render: (student) => (
        <TableCell className="min-w-[300px] p-4 text-center">
          <div className="flex flex-nowrap items-center justify-center gap-2">
            <ActionButton onClick={() => openEditModal(student)} title={tCommon('edit')}>
              <Edit2 className="h-3.5 w-3.5" />
              {tCommon('edit')}
            </ActionButton>
            <ActionButton onClick={() => openResetModal(student)} title={t('resetPassword')}>
              <Lock className="h-3.5 w-3.5" />
              Reset
            </ActionButton>
            {student.enrollmentStatus === 'active' ? (
              <ConfirmDialog
                trigger={
                  <span>
                    <ActionButton variant="danger" title={t('deactivate')}>
                      <UserX className="h-3.5 w-3.5" />
                      {t('deactivate')}
                    </ActionButton>
                  </span>
                }
                title={t('deactivate')}
                description={
                  <>
                    {locale === 'ar' ? 'هل أنت متأكد من تعطيل حساب هذا الطالب؟' : 'Are you sure you want to suspend this student?'}{' '}
                    <span className="font-bold text-danger">&quot;{student.fullName}&quot;</span>
                  </>
                }
                confirmLabel={t('deactivate')}
                cancelLabel={tCommon('cancel')}
                onConfirm={() => handleBulkDeactivate([student._id])}
              />
            ) : (
              <ActionButton variant="success" onClick={() => handleActivate(student)} title="Activate">
                <UserCheck className="h-3.5 w-3.5" />
                Activate
              </ActionButton>
            )}
          </div>
        </TableCell>
      ),
    },
  ];

  return (
    <div className="animate-fade-in space-y-6 p-2 md:p-6">
      <PageTitleBanner
        title={t('title')}
        icon={<Users className="h-5 w-5" />}
        subtitle="Manage student identities, academic placement, exam seats, imports, and exports."
      >
        <Button variant="outline" onClick={() => setIsUploadOpen(true)}>
          <UploadCloud className="h-4 w-4" />
          {locale === 'ar' ? 'رفع الطلاب' : 'Upload Students'}
        </Button>
        <Button variant="outline" onClick={exportStudents} disabled={isExporting}>
          {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {locale === 'ar' ? 'تصدير' : 'Export'}
        </Button>
        <Button onClick={openAddModal}>
          <Plus className="h-4 w-4" />
          {t('addStudent')}
        </Button>
      </PageTitleBanner>

      <FilterBar
        search={search}
        onSearchChange={(value) => {
          setFilter('search', value);
          setFilter('page', 1);
        }}
        searchPlaceholder={t('searchPlaceholder')}
      >
        <Select
          value={level}
          onValueChange={(value) => {
            setFilter('level', value);
            setFilter('page', 1);
          }}
        >
          <SelectTrigger className="w-full border-border bg-secondary/50 lg:w-[170px]">
            <SelectValue placeholder={t('level')} />
          </SelectTrigger>
          <SelectContent className="border-border bg-card">
            <SelectItem value="all">{t('level')}: {tCommon('all')}</SelectItem>
            {COURSE_LEVEL_VALUES.map((item) => (
              <SelectItem key={item} value={item}>
                {locale === 'ar' ? `المستوى ${item}` : `Level ${item}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={status}
          onValueChange={(value) => {
            setFilter('status', value);
            setFilter('page', 1);
          }}
        >
          <SelectTrigger className="w-full border-border bg-secondary/50 lg:w-[210px]">
            <SelectValue placeholder={t('enrollmentStatus')} />
          </SelectTrigger>
          <SelectContent className="border-border bg-card">
            <SelectItem value="all">{t('enrollmentStatus')}: {tCommon('all')}</SelectItem>
            {ENROLLMENT_STATUS_VALUES.map((item) => (
              <SelectItem key={item} value={item}>
                {t(`status_${item}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterBar>

      <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>
          {locale === 'ar' ? (
            <>عرض <span className="font-bold text-foreground">{fromRow}-{toRow}</span> من إجمالي <span className="font-bold text-foreground">{total}</span> طالب</>
          ) : (
            <>Showing <span className="font-bold text-foreground">{fromRow}-{toRow}</span> of <span className="font-bold text-foreground">{total}</span></>
          )}
        </p>
        <p className="text-xs">
          {locale === 'ar'
            ? 'البحث يدعم كود الطالب والاسم الكامل. الترقيم مدعوم من الخادم.'
            : 'Search supports student code and student name. Pagination is powered by the backend helper.'}
        </p>
      </div>

      <DataTableShell
        columns={columns}
        data={students}
        keyExtractor={(student) => student._id}
        isLoading={studentsQuery.isLoading}
        isError={studentsQuery.isError}
        error={studentsQuery.error}
        errorMessage={tCommon('errorLoading')}
        emptyMessage={tCommon('noData')}
        loadingMessage={tCommon('loading')}
        onRetry={() => studentsQuery.refetch()}
        retryLabel={tCommon('retry')}
        enableSelection={user?.role === 'admin'}
        selectedKeys={selectedKeys}
        onSelectedKeysChange={setSelectedKeys}
        bulkActions={[
          ...(selectedKeys.length === 1
            ? [{
                label: locale === 'ar' ? 'تعديل' : 'Edit',
                onClick: handleBulkEdit,
                variant: 'default' as const,
                icon: <Edit2 className="h-3.5 w-3.5" />,
              }]
            : []),
          {
            label: locale === 'ar' ? 'تعطيل الحساب' : 'Deactivate',
            onClick: () => setIsBulkDeactivateOpen(true),
            variant: 'destructive' as const,
            icon: <Trash2 className="h-3.5 w-3.5" />,
          },
        ]}
      />

      <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/70 p-3 sm:flex-row sm:items-center sm:justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setFilter('page', Math.max(1, page - 1))}
          disabled={page === 1 || studentsQuery.isLoading}
        >
          {tCommon('previous')}
        </Button>
        <span className="text-center font-mono text-sm text-muted-foreground">
          Page <span className="text-foreground">{page}</span> / {Math.max(1, totalPages)}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setFilter('page', Math.min(totalPages, page + 1))}
          disabled={page >= totalPages || studentsQuery.isLoading}
        >
          {tCommon('next')}
        </Button>
      </div>

      <StudentFormDialog
        open={isAddOpen}
        onOpenChange={setIsAddOpen}
        mode="add"
        form={form}
        setFormField={setFormField}
        onSubmit={handleAddSubmit}
        loading={formLoading}
        error={formError}
        locale={locale}
        t={t}
        tCommon={tCommon}
      />

      <StudentFormDialog
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        mode="edit"
        form={form}
        setFormField={setFormField}
        onSubmit={handleEditSubmit}
        loading={formLoading}
        error={formError}
        locale={locale}
        t={t}
        tCommon={tCommon}
        currentNationalIdMasked={
          selectedStudent
            ? selectedStudent.nationalIdMasked || getUserRef(selectedStudent)?.nationalIdMasked
            : undefined
        }
      />

      <Dialog open={isResetOpen} onOpenChange={setIsResetOpen}>
        <DialogContent className="max-w-md rounded-xl border border-border/70 bg-card/95 text-foreground">
          <DialogHeader className="border-b border-border/70 pb-4 text-start">
            <DialogTitle>{t('resetPassword')}</DialogTitle>
            <DialogDescription>
              {selectedStudent ? `${selectedStudent.fullName} · ${selectedStudent.studentCode}` : ''}
            </DialogDescription>
          </DialogHeader>
          {formError && (
            <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
              {formError}
            </div>
          )}
          <form onSubmit={handleResetSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">New Password *</label>
              <Input
                type="password"
                required
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="********"
              />
            </div>
            <PasswordChangeToggle
              checked={forcePasswordChange}
              onCheckedChange={setForcePasswordChange}
              locale={locale}
            />
            <DialogFooter className="border-t border-border/70 pt-4">
              <Button variant="secondary" type="button" onClick={() => setIsResetOpen(false)}>
                {tCommon('cancel')}
              </Button>
              <Button type="submit" disabled={formLoading || !newPassword}>
                {formLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                {tCommon('save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <DataUploadDialog
        open={isUploadOpen}
        onOpenChange={setIsUploadOpen}
        title={locale === 'ar' ? 'رفع ملف بيانات الطلاب' : 'Bulk Upload Students'}
        description={
          locale === 'ar'
            ? 'قم برفع ملف بصيغة xlsx أو xls أو csv لإنشاء أو تحديث سجلات الطلاب بموجب الكود الأكاديمي.'
            : 'Import or update student records from XLSX, XLS, or CSV. Existing student codes are updated.'
        }
        uploadType="students"
        expectedColumns={studentImportColumns}
        onSuccess={() => invalidateStudents()}
      />

      <StudentProfileDialog
        open={Boolean(profileStudent)}
        onOpenChange={(open) => !open && setProfileStudent(null)}
        student={profileDetail}
        grades={profileGrades}
        complaints={profileComplaints}
        academicEmail={profileEmail}
        isLoading={profileQuery.isLoading}
        gradesLoading={profileGradesQuery.isLoading}
        complaintsLoading={profileComplaintsQuery.isLoading}
        locale={locale}
        canViewSensitiveStudentData={canViewSensitiveStudentData}
      />

      <ConfirmDialog
        open={isBulkDeactivateOpen}
        onOpenChange={setIsBulkDeactivateOpen}
        title={t('deactivate')}
        description={
          locale === 'ar'
            ? `هل أنت متأكد من تعطيل حسابات ${selectedKeys.length} من الطلاب المحددين؟`
            : `Are you sure you want to suspend ${selectedKeys.length} selected student accounts?`
        }
        confirmLabel={t('deactivate')}
        cancelLabel={tCommon('cancel')}
        onConfirm={() => {
          setIsBulkDeactivateOpen(false);
          void handleBulkDeactivate(selectedKeys);
        }}
      />
    </div>
  );
}

function StudentFormDialog({
  open,
  onOpenChange,
  mode,
  form,
  setFormField,
  onSubmit,
  loading,
  error,
  locale,
  t,
  tCommon,
  currentNationalIdMasked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'add' | 'edit';
  form: StudentFormState;
  setFormField: (key: keyof StudentFormState, value: string | boolean) => void;
  onSubmit: (event: React.FormEvent) => void;
  loading: boolean;
  error: string;
  locale: string;
  t: ReturnType<typeof useTranslations>;
  tCommon: ReturnType<typeof useTranslations>;
  currentNationalIdMasked?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto rounded-xl border border-border/70 bg-card/95 text-foreground shadow-[var(--shadow-glow)] backdrop-blur">
        <DialogHeader className="border-b border-border/70 pb-4 text-start">
          <DialogTitle>{mode === 'add' ? t('addStudent') : t('editStudent')}</DialogTitle>
          <DialogDescription>
            {mode === 'add'
              ? 'Create student identity, account, academic placement, and exam-seat data.'
              : 'Update academic, enrollment, contact, and exam-seat data.'}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-5 text-start">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={`${t('studentName')} *`}>
              <Input required value={form.fullName} onChange={(event) => setFormField('fullName', event.target.value)} />
            </Field>
            <Field label={`${t('studentCode')} *`}>
              <Input
                required
                disabled={mode === 'edit'}
                value={form.studentCode}
                onChange={(event) => setFormField('studentCode', event.target.value)}
                className="font-mono"
              />
            </Field>
            {mode === 'add' && (
              <Field label={`${t('nationalId')} *`}>
                <Input
                  required
                  value={form.nationalId}
                  onChange={(event) => setFormField('nationalId', event.target.value)}
                  className="font-mono"
                />
              </Field>
            )}
            {mode === 'edit' && (
              <>
                <Field label="Current National ID">
                  <Input
                    value={currentNationalIdMasked || 'N/A'}
                    readOnly
                    className="font-mono opacity-70"
                  />
                </Field>
                <Field label="New National ID">
                  <Input
                    value={form.nationalId}
                    onChange={(event) => setFormField('nationalId', event.target.value)}
                    placeholder="Leave blank to keep current ID"
                    className="font-mono"
                  />
                </Field>
              </>
            )}
            <Field label="Academic Email">
              <Input
                type="email"
                value={form.academicEmail}
                onChange={(event) => setFormField('academicEmail', event.target.value)}
                placeholder="student@institute.edu.eg"
              />
            </Field>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Field label={`${t('level')} *`}>
              <Select value={form.level} onValueChange={(value) => setFormField('level', value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COURSE_LEVEL_VALUES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {locale === 'ar' ? `المستوى ${item}` : `Level ${item}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t('department')}>
              <Input value={form.department} onChange={(event) => setFormField('department', event.target.value)} />
            </Field>
            <Field label={`${t('academicYear')} *`}>
              <Input required value={form.academicYear} onChange={(event) => setFormField('academicYear', event.target.value)} />
            </Field>
            <Field label={t('semester')}>
              <Select value={form.semester} onValueChange={(value) => setFormField('semester', value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="first">First</SelectItem>
                  <SelectItem value="second">Second</SelectItem>
                  <SelectItem value="summer">Summer</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label={t('group')}>
              <Input value={form.group} onChange={(event) => setFormField('group', event.target.value)} />
            </Field>
            <Field label={t('section')}>
              <Input value={form.section} onChange={(event) => setFormField('section', event.target.value)} />
            </Field>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <Field label={t('seatNumber')}>
              <Input value={form.seatNumber} onChange={(event) => setFormField('seatNumber', event.target.value)} />
            </Field>
            <Field label="Exam Building">
              <Input value={form.examBuilding} onChange={(event) => setFormField('examBuilding', event.target.value)} />
            </Field>
            <Field label="Exam Floor">
              <Input value={form.examFloor} onChange={(event) => setFormField('examFloor', event.target.value)} />
            </Field>
            <Field label="Exam Room">
              <Input value={form.examRoom} onChange={(event) => setFormField('examRoom', event.target.value)} />
            </Field>
          </div>

          {mode === 'edit' && (
            <Field label={`${t('enrollmentStatus')} *`}>
              <Select value={form.enrollmentStatus} onValueChange={(value) => setFormField('enrollmentStatus', value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ENROLLMENT_STATUS_VALUES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {t(`status_${item}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}

          <PasswordChangeToggle
            checked={form.mustChangePassword}
            onCheckedChange={(checked) => setFormField('mustChangePassword', checked)}
            locale={locale}
          />

          <DialogFooter className="border-t border-border/70 pt-4">
            <Button variant="secondary" type="button" onClick={() => onOpenChange(false)}>
              {tCommon('cancel')}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {tCommon('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PasswordChangeToggle({
  checked,
  onCheckedChange,
  locale,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  locale: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[20px] border border-border/70 bg-muted/25 px-4 py-3">
      <div className="text-start">
        <p className="text-sm font-semibold text-foreground">
          {locale === 'ar' ? 'إلزام تغيير كلمة المرور عند الدخول التالي' : 'Require password change on next login'}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {locale === 'ar'
            ? 'متوقف افتراضياً، ويمكن للمشرف تفعيله لهذا الطالب.'
            : 'Off by default. The admin can enable it for this student.'}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          'relative h-7 w-12 shrink-0 rounded-full border transition-colors',
          checked ? 'border-primary bg-primary' : 'border-border bg-muted',
        )}
      >
        <span
          className={cn(
            'absolute top-1 h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform',
            checked ? 'translate-x-6' : 'translate-x-1',
          )}
        />
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function StudentProfileDialog({
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

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
      <span className="text-primary">{icon}</span>
      {title}
    </div>
  );
}

export default function StudentsPage() {
  return (
    <Suspense fallback={<PageSkeletonLoader />}>
      <PermissionGuard permission="students.read">
        <StudentsPageContent />
      </PermissionGuard>
    </Suspense>
  );
}
