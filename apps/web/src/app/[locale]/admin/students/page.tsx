'use client';
import { useMemo } from "react";
import type { StudentFormValues } from '@/features/students/schema';

import React, { Suspense, useState } from 'react';
import dynamic from 'next/dynamic';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams, useSearchParams } from 'next/navigation';
import { Download, Plus, UploadCloud, Users, Loader2, BookOpenCheck, KeyRound, ArrowLeftRight } from 'lucide-react';
import { COURSE_LEVEL_VALUES, ENROLLMENT_STATUS_VALUES, PERMISSIONS } from '@student-portal/shared';
import { toast } from 'sonner';

import api, { getApiErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';
import { PermissionGuard } from '@/components/ui/permission-guard';
import { useTableState } from '@/hooks/use-table-state';
import {
  activateStudent,
  createStudent,
  deactivateStudent,
  exportStudentsStreamingExcel,
  getMustChangePasswordSummary,
  getStudent,
  getStudentAcademicEmail,
  listStudentComplaints,
  listStudentGrades,
  listStudents,
  studentKeys,
  toggleAllMustChangePassword,
  updateStudent,
} from '@/features/students/api';

const StudentFormDialog = dynamic(
  () =>
    import('@/features/students/components/student-form-dialog').then(
      (m) => m.StudentFormDialog,
    ),
  { ssr: false },
);

const StudentDetailDialog = dynamic(
  () =>
    import('@/features/students/components/student-detail-dialog').then(
      (m) => m.StudentDetailDialog,
    ),
  { ssr: false },
);

const ResetStudentPasswordDialog = dynamic(
  () =>
    import(
      '@/features/students/components/reset-student-password-dialog'
    ).then((m) => m.ResetStudentPasswordDialog),
  { ssr: false },
);

const DepartmentTransferDialog = dynamic(
  () =>
    import('@/features/students/components/department-transfer-dialog').then(
      (m) => m.DepartmentTransferDialog,
    ),
  { ssr: false },
);

const DataUploadDialog = dynamic(
  () =>
    import('@/components/ui/data-upload-dialog').then((m) => m.DataUploadDialog),
  { ssr: false },
);

import { StudentTable, type Student } from '@/features/students/components/student-table';
import { StudentTuitionManagement } from '@/features/students/components/student-tuition-management';
import { Button } from '@/components/ui/button';
import { CreditCard } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PasswordRequirementDialog } from '@/features/students/components/password-requirement-dialog';
import { FilterBar } from '@/components/ui/filter-bar';
import { AcademicYearSelect } from '@/components/ui/academic-year-select';
import { PageSkeletonLoader } from '@/components/ui/page-suspense-fallback';
import { PageTitleBanner } from '@/components/ui/page-title-banner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CustomDropdown } from '@/components/ui/custom-dropdown';

const initialForm = {
  fullName: '',
  studentCode: '',
  nationalId: '',
  academicEmail: '',
  department: '',
  level: '1',
  group: '',
  section: '',
  academicYear: '',
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
  'fullNameAr',
  'fullNameEn',
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

function StudentsPageContent() {
  const t = useTranslations('students');
  const tAdmission = useTranslations('admissionWorkflow');
  const tCommon = useTranslations('common');
  const params = useParams();
  const locale = params.locale as string;
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isDoctor = user?.role === 'staff' && user?.staffType === 'doctor';

  const {
    page,
    limit,
    search,
    filters,
    selectedKeys,
    setSelectedKeys,
    setPage,
    setLimit,
    setSearch,
    setFilter: setTableFilter,
  } = useTableState({
    defaultFilters: {
      level: 'all',
      department: 'all',
      status: 'all',
      sortBy: 'createdAt',
      sortOrder: 'desc',
    },
    defaultPage: 1,
    defaultLimit: 20,
  });

  const level = filters.level;
  const department = filters.department || 'all';
  const status = filters.status;
  const sortBy = filters.sortBy;
  const sortOrder = filters.sortOrder;

  const setFilter = (key: string, value: string | number | undefined) => {
    if (key === 'search') setSearch(String(value ?? ''));
    else if (key === 'page') setPage(Number(value) || 1);
    else setTableFilter(key as keyof typeof filters, value !== undefined ? String(value) : undefined);
  };

  const isAdmin = user?.role === 'admin';
  const canWriteStudents = isAdmin || Boolean(user?.permissions?.includes('students.write'));
  const canResetPassword = isAdmin || Boolean(user?.permissions?.includes('students.reset_password'));
  const canUploadStudents = isAdmin || Boolean(user?.permissions?.includes('uploads.import'));
  const canViewSensitiveStudentData = Boolean(
    isAdmin || user?.permissions?.includes('students.view_national_id'),
  );
  const canManageTuition = Boolean(
    isAdmin ||
      user?.permissions?.includes('tuition.read') ||
      user?.permissions?.includes('tuition.write'),
  );
  const canWriteTuition = Boolean(
    isAdmin || user?.permissions?.includes('tuition.write'),
  );

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isBulkDeactivateOpen, setIsBulkDeactivateOpen] = useState(false);
  const [isBulkDeactivating, setIsBulkDeactivating] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [transferStudent, setTransferStudent] = useState<Student | null>(null);
  const [selectedProfileStudent, setProfileStudent] = useState<Student | null>(null);
  const [dismissedProfile, setDismissedProfile] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [, setForm] = useState(initialForm);
  const [formLoading, setFormLoading] = useState(false);
  const [isTogglingMustChange, setIsTogglingMustChange] = useState(false);

  const [isExporting, setIsExporting] = useState(false);
  const [isAutoRegistering, setIsAutoRegistering] = useState(false);
  const [isAutoRegisterModalOpen, setIsAutoRegisterModalOpen] = useState(false);
  const [autoRegYear, setAutoRegYear] = useState('');
  const [autoRegSemester, setAutoRegSemester] = useState<'first' | 'second'>('first');
  const [autoRegOverwrite, setAutoRegOverwrite] = useState(false);
  const [isBulkMustChangeOpen, setIsBulkMustChangeOpen] = useState(false);
  const searchParams = useSearchParams();
  const searchTab = searchParams?.get('tab');
  const profileCode = searchParams?.get('profile') ?? '';
  const linkedProfile = useQuery({
    queryKey: ['student-record-link', profileCode],
    enabled: Boolean(profileCode && dismissedProfile !== profileCode),
    queryFn: async () => {
      const response = await listStudents({ page: 1, limit: 10, search: profileCode });
      return response.items.find((student) => student.studentCode === profileCode) ?? null;
    },
    staleTime: 30_000,
  });
  const profileStudent = selectedProfileStudent ?? (dismissedProfile !== profileCode ? linkedProfile.data : null) ?? null;
  const [activeTab, setActiveTabState] = useState<'students' | 'tuition'>(() => {
    if (searchTab === 'tuition' || searchTab === 'students') return searchTab;
    if (typeof window !== 'undefined') {
      try {
        const saved = sessionStorage.getItem('admin_students_active_tab');
        if (saved === 'tuition' || saved === 'students') return saved;
      } catch {}
    }
    return 'students';
  });

  const setActiveTab = (tab: 'students' | 'tuition') => {
    setActiveTabState(tab);
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem('admin_students_active_tab', tab);
        const url = new URL(window.location.href);
        url.searchParams.set('tab', tab);
        window.history.replaceState(null, '', url.toString());
      } catch {}
    }
  };

  const [previousTab, setPreviousTab] = useState(searchTab);
  if (previousTab !== searchTab) {
    setPreviousTab(searchTab);
    if (searchTab === 'students' || searchTab === 'tuition') setActiveTabState(searchTab);
  }
  React.useEffect(() => {
    if (searchTab === 'students' || searchTab === 'tuition') {
      try {
        sessionStorage.setItem('admin_students_active_tab', searchTab);
      } catch {}
    }
  }, [searchTab]);

  const handleAutoRegisterFirstYear = async () => {
    if (!autoRegYear) return;
    setIsAutoRegistering(true);
    setIsAutoRegisterModalOpen(false);

    const toastId = toast.loading(
      locale === 'ar'
        ? 'جاري التسجيل التلقائي لطلاب المستوى الأول في الخلفية...'
        : 'Auto-registering Level 1 students in the background...',
    );

    try {
      const selectedStudents = selectedStudentsList;
      const payload: Record<string, unknown> = {
        academicYear: autoRegYear,
        semester: autoRegSemester,
        forceOverwrite: autoRegOverwrite,
      };

      if (selectedStudents.length > 0) {
        payload.studentCodes = selectedStudents.map((s) => s.studentCode);
      }

      const res = await api.post(
        '/admin/registrations/auto-register-first-year',
        payload,
      );
      toast.success(
        res.data?.message ||
          (locale === 'ar'
            ? 'تم التسجيل التلقائي لطلاب المستوى الأول بنجاح'
            : 'Level 1 students automatically registered'),
        { id: toastId },
      );
      invalidateStudents();
    } catch (error) {
      toast.error(
        getApiErrorMessage(
          error,
          locale === 'ar'
            ? 'فشل التسجيل التلقائي للفرقة الأولى'
            : 'Failed to auto-register Level 1 students',
        ),
        { id: toastId },
      );
    } finally {
      setIsAutoRegistering(false);
    }
  };

  const studentsQuery = useQuery({
    queryKey: studentKeys.list({ page, limit, search, level, department, enrollmentStatus: status, sortBy, sortOrder: sortOrder as 'asc' | 'desc' }),
    queryFn: () => listStudents({
      page,
      limit,
      search: search.trim() || undefined,
      level: level !== 'all' ? level : undefined,
      department: department !== 'all' ? department : undefined,
      enrollmentStatus: status !== 'all' ? status : undefined,
      sortBy,
      sortOrder: sortOrder as 'asc' | 'desc'
    }),
  });

  const profileQuery = useQuery({
    queryKey: studentKeys.detail(profileStudent?._id),
    enabled: Boolean(profileStudent),
    queryFn: () => getStudent(profileStudent?._id ?? ''),
  });

  const profileGradesQuery = useQuery({
    queryKey: studentKeys.grades(profileStudent?.studentCode),
    enabled: Boolean(profileStudent?.studentCode),
    queryFn: async () => (await listStudentGrades(profileStudent?.studentCode ?? '')).items,
  });

  const profileComplaintsQuery = useQuery({
    queryKey: studentKeys.complaints(profileStudent?.studentCode),
    enabled: Boolean(profileStudent?.studentCode),
    queryFn: async () => (await listStudentComplaints(profileStudent?.studentCode ?? '')).items,
  });

  const profileEmailQuery = useQuery({
    queryKey: studentKeys.academicEmail(profileStudent?.studentCode),
    enabled: Boolean(profileStudent?.studentCode),
    queryFn: () => getStudentAcademicEmail(profileStudent?.studentCode ?? ''),
  });

  const students = useMemo(() => studentsQuery.data?.items ?? [], [studentsQuery.data?.items]);
  const total = studentsQuery.data?.total ?? 0;
  const totalPages = studentsQuery.data?.totalPages ?? 1;

  const [selectedStudentsMap, setSelectedStudentsMap] = React.useState<Map<string, Student>>(new Map());

  // Cache selected students across pagination and filter changes
  const [previousSelection, setPreviousSelection] = useState<unknown[] | null>(null);
  if (previousSelection === null || previousSelection.some((value, index) => !Object.is(value, [students, selectedKeys][index]))) {
    setPreviousSelection([students, selectedKeys]);
    (() => {
    if (selectedKeys.length === 0) {
      setSelectedStudentsMap(new Map());
      return;
    }

    setSelectedStudentsMap((prev) => {
      let changed = false;
      const next = new Map(prev);

      // Add currently loaded students if selected
      for (const st of students) {
        if (selectedKeys.includes(st._id) && !next.has(st._id)) {
          next.set(st._id, st);
          changed = true;
        }
      }

      // Evict students no longer selected
      for (const id of next.keys()) {
        if (!selectedKeys.includes(id)) {
          next.delete(id);
          changed = true;
        }
      }

      return changed ? next : prev;
    });

    })();
  }

  // Fetch any missing selected students from other pages
  React.useEffect(() => {
    if (selectedKeys.length === 0) return;
    const missingIds = selectedKeys.filter((id) => !selectedStudentsMap.has(id));
    if (missingIds.length === 0) return;

    let isMounted = true;
    Promise.all(missingIds.map((id) => getStudent(id).catch(() => null))).then((results) => {
      if (!isMounted) return;
      setSelectedStudentsMap((prev) => {
        const next = new Map(prev);
        let updated = false;
        for (const item of results) {
          if (item && selectedKeys.includes(item._id) && !next.has(item._id)) {
            next.set(item._id, item);
            updated = true;
          }
        }
        return updated ? next : prev;
      });
    });

    return () => {
      isMounted = false;
    };
  }, [selectedKeys, selectedStudentsMap]);

  const selectedStudentsList = React.useMemo(() => {
    return selectedKeys
      .map((id) => selectedStudentsMap.get(id) || students.find((s) => s._id === id))
      .filter((s): s is Student => Boolean(s));
  }, [selectedKeys, selectedStudentsMap, students]);

  const invalidateStudents = () => {
    void queryClient.invalidateQueries({ queryKey: ['students'] });
  };

  const mustChangeSummaryQuery = useQuery({
    queryKey: ['admin', 'students', 'must-change-summary'],
    queryFn: getMustChangePasswordSummary,
  });

  const handleToggleAllMustChange = async (targetState: boolean) => {
    setIsTogglingMustChange(true);
    const toastId = toast.loading(
      locale === 'ar'
        ? 'جاري تحديث حالة إعادة تعيين كلمة المرور لجميع الطلاب...'
        : 'Updating password reset requirement for all students...',
    );
    try {
      const res = await toggleAllMustChangePassword(targetState);
      toast.success(
        locale === 'ar'
          ? targetState
            ? `تم إلزام جميع الطلاب (${res.modifiedCount}) بتغيير كلمة المرور وفك الحظر بنجاح`
            : `تم إلغاء إلزام تغيير كلمة المرور لجميع الطلاب (${res.modifiedCount}) بنجاح`
          : targetState
            ? `Successfully enforced password change and unlocked accounts for ${res.modifiedCount} students`
            : `Successfully removed password change requirement for ${res.modifiedCount} students`,
        { id: toastId },
      );
      void queryClient.invalidateQueries({
        queryKey: ['admin', 'students', 'must-change-summary'],
      });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'students', 'must-change-codes'] });
      setIsBulkMustChangeOpen(false);
      invalidateStudents();
    } catch (err) {
      toast.error(
        getApiErrorMessage(
          err,
          locale === 'ar'
            ? 'فشل تحديث حالة إعادة تعيين كلمة المرور'
            : 'Failed to update password reset requirement',
        ),
        { id: toastId },
      );
    } finally {
      setIsTogglingMustChange(false);
    }
  };

  const handleAddSubmit = async (values: StudentFormValues) => {
    setFormLoading(true);
    try {
      await createStudent(values);
      setIsAddOpen(false);
      toast.success(locale === 'ar' ? 'تمت إضافة الطالب بنجاح' : 'Student added successfully');
      invalidateStudents();
    } catch (err: unknown) {
      toast.error(
        getApiErrorMessage(
          err,
          locale === 'ar' ? 'فشل إنشاء حساب الطالب' : 'Failed to create student',
        ),
      );
    } finally {
      setFormLoading(false);
    }
  };

  const handleEditSubmit = async (values: StudentFormValues) => {
    if (!selectedStudent) return;
    setFormLoading(true);
    try {
      await updateStudent(selectedStudent._id, values);
      setIsEditOpen(false);
      toast.success(locale === 'ar' ? 'تم تحديث بيانات الطالب بنجاح' : 'Student updated successfully');
      invalidateStudents();
    } catch (err: unknown) {
      toast.error(
        getApiErrorMessage(
          err,
          locale === 'ar' ? 'فشل تحديث بيانات الطالب' : 'Failed to update student',
        ),
      );
    } finally {
      setFormLoading(false);
    }
  };

  return (
    <div className="animate-fade-in space-y-6 p-2 md:p-6">
      <PageTitleBanner
        title={t('title')}
        icon={<Users className="h-5 w-5" />}
        subtitle={
          isDoctor
            ? t('doctorSubtitle')
            : t('subtitle')
        }
      >
        <Button
          variant="outline"
          size="sm"
          disabled={isExporting}
          onClick={async () => {
            setIsExporting(true);
            try {
              await exportStudentsStreamingExcel({
                search: search || undefined,
                level: level !== 'all' ? level : undefined,
                enrollmentStatus: status !== 'all' ? status : undefined,
              });
              toast.success(
                locale === 'ar'
                  ? 'تم تصدير كشف الطلاب بصيغة Excel المعتمدة (.xlsx)'
                  : 'Students registry exported successfully (.xlsx)',
              );
            } catch (err: unknown) {
              toast.error(
                (err instanceof Error ? err.message : '') ||
                  (locale === 'ar'
                    ? 'فشل تصدير بيانات الطلاب'
                    : 'Failed to export students'),
              );
            } finally {
              setIsExporting(false);
            }
          }}
          className="h-9 rounded-squircle border-border/80 bg-card/60 px-3 text-xs font-medium text-foreground hover:bg-secondary/70"
        >
          {isExporting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          <span>{locale === 'ar' ? 'تصدير Excel' : 'Export Excel'}</span>
        </Button>

        {canResetPassword && (
          <Button
            variant="outline"
            size="sm"
            disabled={isTogglingMustChange || !mustChangeSummaryQuery.data || mustChangeSummaryQuery.isError}
            onClick={() => setIsBulkMustChangeOpen(true)}
            className={cn(
              'h-9 rounded-squircle border-amber-500/40 bg-card/60 px-3 text-xs font-medium text-amber-500 hover:bg-amber-500/10 hover:text-amber-400',
              mustChangeSummaryQuery.data?.allEnabled &&
                'border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-400',
            )}
          >
            {isTogglingMustChange ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <KeyRound className="h-3.5 w-3.5" />
            )}
            <span>
              {locale === 'ar'
                ? mustChangeSummaryQuery.data?.allEnabled
                  ? 'إلغاء إلزام كلمة المرور'
                  : 'إلزام تغيير كلمة المرور'
                : mustChangeSummaryQuery.data?.allEnabled
                  ? 'Disable Forced Reset'
                  : 'Force Password Reset'}
            </span>
            {mustChangeSummaryQuery.data && (
              <span className="ms-1.5 rounded-full bg-secondary/80 px-1.5 py-0.5 text-[10px] font-mono">
                {mustChangeSummaryQuery.data.mustChangeCount}/
                {mustChangeSummaryQuery.data.totalStudents}
              </span>
            )}
          </Button>
        )}

        {canWriteStudents && (
          <Button
            variant="outline"
            size="sm"
            disabled={isAutoRegistering}
            onClick={() => setIsAutoRegisterModalOpen(true)}
            className="h-9 rounded-squircle border-primary/40 bg-card/60 px-3 text-xs font-medium text-primary hover:bg-primary/10"
          >
            {isAutoRegistering ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <BookOpenCheck className="h-3.5 w-3.5" />
            )}
            <span>
              {locale === 'ar'
                ? 'تسجيل المستوى الأول'
                : 'Auto-Register Level 1'}
            </span>
          </Button>
        )}

        {canWriteStudents && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setTransferStudent(null);
              setIsTransferOpen(true);
            }}
            className="h-9 rounded-squircle border-cyan-500/40 bg-card/60 px-3 text-xs font-semibold text-cyan-400 hover:bg-cyan-500/10 hover:text-cyan-300"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
            <span>
              {locale === 'ar'
                ? 'تحويل تخصص المستوى 3'
                : 'Transfer Specialization (Level 3)'}
            </span>
          </Button>
        )}

        {canUploadStudents && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsUploadOpen(true)}
            className="h-9 rounded-squircle border-border/80 bg-card/60 px-3.5 text-xs font-medium hover:bg-secondary/70"
          >
            <UploadCloud className="h-3.5 w-3.5" />
            <span>{locale === 'ar' ? 'رفع الطلاب' : 'Upload Students'}</span>
          </Button>
        )}

        {canWriteStudents && (
          <Button
            size="sm"
            onClick={() => {
              setSelectedStudent(null);
              setForm(initialForm);
              setIsAddOpen(true);
            }}
            className="h-9 rounded-squircle px-4 text-xs font-bold shadow-sm"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{t('addStudent')}</span>
          </Button>
        )}
      </PageTitleBanner>

      {/* Navigation Tabs: Students Directory vs Tuition Fees & Blocking (Restricted by permission) */}
      {canManageTuition && (
        <div className="flex items-center gap-2 border-b border-border/80 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab('students')}
            className={cn(
              'flex items-center gap-2 rounded-squircle px-4 py-2 text-xs font-bold transition-all cursor-pointer',
              activeTab === 'students'
                ? 'bg-primary text-white shadow-sm'
                : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
            )}
          >
            <Users className="h-4 w-4" />
            <span>{locale === 'ar' ? 'سجل وقيد الطلاب' : 'Students Directory'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('tuition')}
            className={cn(
              'flex items-center gap-2 rounded-squircle px-4 py-2 text-xs font-bold transition-all cursor-pointer',
              activeTab === 'tuition'
                ? 'bg-primary text-white shadow-sm'
                : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
            )}
          >
            <CreditCard className="h-4 w-4" />
            <span>
              {locale === 'ar'
                ? 'المصروفات الدراسية وحجب الحسابات'
                : 'Tuition Fees & Blocking'}
            </span>
          </button>
        </div>
      )}

      {canManageTuition && activeTab === 'tuition' ? (
        <StudentTuitionManagement
          locale={locale}
          canWrite={canWriteTuition}
        />
      ) : (
        <>
          <FilterBar
            search={search}
            onSearchChange={(val) => setFilter('search', val)}
            searchPlaceholder={t('searchPlaceholder')}
          >
            <Select
              value={level}
              onValueChange={(val) => setFilter('level', val)}
            >
              <SelectTrigger className="w-full border-border bg-secondary/50 lg:w-42.5">
                <SelectValue placeholder={t('level')} />
              </SelectTrigger>
              <SelectContent className="border-border bg-card">
                <SelectItem value="all">
                  {t('level')}: {tCommon('all')}
                </SelectItem>
                {COURSE_LEVEL_VALUES.map((lvl) => (
                  <SelectItem key={lvl} value={lvl}>
                    {locale === 'ar' ? `المستوى ${lvl}` : `Level ${lvl}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={department}
              onValueChange={(val) => setFilter('department', val)}
            >
              <SelectTrigger className="w-full border-border bg-secondary/50 lg:w-47.5">
                <SelectValue
                  placeholder={
                    locale === 'ar' ? 'القسم / الشعبة' : 'Department'
                  }
                />
              </SelectTrigger>
              <SelectContent className="border-border bg-card">
                <SelectItem value="all">
                  {locale === 'ar' ? 'القسم: الكل' : 'Department: All'}
                </SelectItem>
                <SelectItem value="GENERAL">
                  {locale === 'ar'
                    ? 'شعبة عامة'
                    : 'General Division'}
                </SelectItem>
                <SelectItem value="BIS">
                  {locale === 'ar'
                    ? 'نظم معلومات الأعمال'
                    : 'Business Information Systems'}
                </SelectItem>
                <SelectItem value="ACCOUNTING">
                  {locale === 'ar'
                    ? 'المحاسبة والمراجعة'
                    : 'Accounting and Auditing'}
                </SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={status}
              onValueChange={(val) => setFilter('status', val)}
            >
              <SelectTrigger className="w-full border-border bg-secondary/50 lg:w-42.5">
                <SelectValue placeholder={t('status')} />
              </SelectTrigger>
              <SelectContent className="border-border bg-card">
                <SelectItem value="all">
                  {t('status')}: {tCommon('all')}
                </SelectItem>
                {ENROLLMENT_STATUS_VALUES.map((st) => (
                  <SelectItem key={st} value={st}>
                    {t(`status_${st}`)}
                  </SelectItem>
                ))}
                <SelectItem value="official">{tAdmission('lifecycle.official')}</SelectItem>
                <SelectItem value="provisional">{tAdmission('lifecycle.provisional')}</SelectItem>
                <SelectItem value="unverified">{tAdmission('lifecycle.unverified')}</SelectItem>
                {(user?.role === 'admin' || user?.permissions?.includes(PERMISSIONS.ADMISSIONS_ARCHIVE_READ)) && <SelectItem value="ministry-archived">{tAdmission('lifecycle.queue.archive')}</SelectItem>}
              </SelectContent>
            </Select>

            <Select
              value={`${sortBy || 'createdAt'}:${sortOrder || 'desc'}`}
              onValueChange={(val) => {
                const [f, o] = val.split(':');
                setTableFilter('sortBy', f);
                setTableFilter('sortOrder', o);
              }}
            >
              <SelectTrigger className="w-full border-border bg-secondary/50 lg:w-47.5">
                <SelectValue placeholder={locale === 'ar' ? 'الترتيب' : 'Sort by'} />
              </SelectTrigger>
              <SelectContent className="border-border bg-card">
                <SelectItem value="studentCode:asc">
                  {locale === 'ar' ? 'كود الطالب (تصاعدي 1-9)' : 'Student Code (Asc 1-9)'}
                </SelectItem>
                <SelectItem value="studentCode:desc">
                  {locale === 'ar' ? 'كود الطالب (تنازلي 9-1)' : 'Student Code (Desc 9-1)'}
                </SelectItem>
                <SelectItem value="fullName:asc">
                  {locale === 'ar' ? 'اسم الطالب (أ - ي)' : 'Student Name (A - Z)'}
                </SelectItem>
                <SelectItem value="fullName:desc">
                  {locale === 'ar' ? 'اسم الطالب (ي - أ)' : 'Student Name (Z - A)'}
                </SelectItem>
                <SelectItem value="createdAt:desc">
                  {locale === 'ar' ? 'تاريخ الإضافة (الأحدث أولاً)' : 'Date Added (Newest)'}
                </SelectItem>
                <SelectItem value="createdAt:asc">
                  {locale === 'ar' ? 'تاريخ الإضافة (الأقدم أولاً)' : 'Date Added (Oldest)'}
                </SelectItem>
              </SelectContent>
            </Select>
          </FilterBar>

          <StudentTable
            students={students}
            isLoading={studentsQuery.isLoading}
            isError={studentsQuery.isError}
            error={studentsQuery.error}
            locale={locale}
            canViewSensitiveStudentData={canViewSensitiveStudentData}
            selectedKeys={selectedKeys}
            onSelectedKeysChange={setSelectedKeys}
            sortBy={sortBy}
            sortOrder={sortOrder as 'asc' | 'desc'}
            onSortChange={(field, order) => {
              setTableFilter('sortBy', field);
              setTableFilter('sortOrder', order);
            }}
            onViewStudent={(st) => setProfileStudent(st)}
            onEditStudent={(st) => {
              setSelectedStudent(st);
              setIsEditOpen(true);
            }}
            onResetPassword={(st) => {
              setSelectedStudent(st);
              setIsResetOpen(true);
            }}
            onTransferDepartment={(st) => {
              setTransferStudent(st);
              setIsTransferOpen(true);
            }}
            onBulkTransferDepartment={() => {
              setTransferStudent(null);
              setIsTransferOpen(true);
            }}
            onActivateStudent={async (st) => {
              await activateStudent(st._id);
              invalidateStudents();
            }}
            onDeactivateStudent={async (ids) => {
              await Promise.all(ids.map((id) => deactivateStudent(id)));
              invalidateStudents();
            }}
            onBulkEdit={() => {
              if (selectedKeys.length === 1) {
                const found = selectedStudentsMap.get(selectedKeys[0]) || students.find((s) => s._id === selectedKeys[0]);
                if (found) {
                  setSelectedStudent(found);
                  setIsEditOpen(true);
                }
              }
            }}
            onOpenBulkDeactivate={() => setIsBulkDeactivateOpen(true)}
            onRetry={() => studentsQuery.refetch()}
            t={t}
            tCommon={tCommon}
          />

          {/* Pagination Bar */}
          <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/70 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs text-muted-foreground">
                {locale === 'ar'
                  ? `عرض ${total === 0 ? 0 : (page - 1) * limit + 1} - ${Math.min(page * limit, total)} من إجمالي ${total} طالب`
                  : `Showing ${total === 0 ? 0 : (page - 1) * limit + 1} - ${Math.min(page * limit, total)} of ${total} students`}
              </span>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>{locale === 'ar' ? 'لكل صفحة:' : 'Per page:'}</span>
                <CustomDropdown
                  ariaLabel={
                    locale === 'ar'
                      ? 'عدد العناصر لكل صفحة'
                      : 'Items per page'
                  }
                  value={String(limit)}
                  onValueChange={(val) => {
                    setLimit(Number(val));
                  }}
                  options={[
                    { value: '10', label: '10' },
                    { value: '20', label: '20' },
                    { value: '50', label: '50' },
                    { value: '100', label: '100' },
                  ]}
                  className="w-18 h-8 text-xs py-1"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFilter('page', Math.max(1, page - 1))}
                disabled={page <= 1 || studentsQuery.isLoading}
                className="cursor-pointer text-xs"
              >
                {tCommon('previous')}
              </Button>
              <span className="font-mono text-xs text-muted-foreground px-2">
                {locale === 'ar'
                  ? `الصفحة ${page} من ${totalPages}`
                  : `Page ${page} of ${totalPages}`}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setFilter('page', Math.min(totalPages, page + 1))
                }
                disabled={page >= totalPages || studentsQuery.isLoading}
                className="cursor-pointer text-xs"
              >
                {tCommon('next')}
              </Button>
            </div>
          </div>
        </>
      )}

      <StudentFormDialog
        open={isAddOpen}
        onOpenChange={setIsAddOpen}
        isEditing={false}
        onSubmit={handleAddSubmit}
        isSubmitting={formLoading}
        locale={locale}
      />
      <StudentFormDialog
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        isEditing={true}
        onSubmit={handleEditSubmit}
        isSubmitting={formLoading}
        locale={locale}
        defaultValues={
          selectedStudent
            ? {
                fullName: selectedStudent.fullName,
                fullNameAr: selectedStudent.fullNameAr,
                fullNameEn: selectedStudent.fullNameEn,
                studentCode: selectedStudent.studentCode,
                nationalId: selectedStudent.nationalId,
                phone:
                  selectedStudent.phone ||
                  (typeof selectedStudent.userId === 'object'
                    ? selectedStudent.userId?.phone
                    : undefined),
                academicEmail: selectedStudent.academicEmail,
                department: selectedStudent.department,
                level: selectedStudent.level,
                group: selectedStudent.group,
                section: selectedStudent.section,
                academicYear: selectedStudent.academicYear,
                semester: selectedStudent.semester,
                seatNumber: selectedStudent.seatNumber,
                examRoom: selectedStudent.examRoom,
                examFloor: selectedStudent.examFloor,
                examBuilding: selectedStudent.examBuilding,
                enrollmentStatus: selectedStudent.enrollmentStatus,
              }
            : undefined
        }
      />

      <DataUploadDialog open={isUploadOpen} onOpenChange={setIsUploadOpen} title={locale === 'ar' ? 'رفع ملف بيانات الطلاب' : 'Bulk Upload Students'} description={locale === 'ar' ? 'قم برفع ملف بصيغة XLSX أو XLS أو CSV لاستيراد بيانات الطلاب.' : 'Upload XLSX, XLS or CSV to import students.'} uploadType="students" expectedColumns={studentImportColumns} onSuccess={() => invalidateStudents()} />
      <StudentDetailDialog open={Boolean(profileStudent)} onOpenChange={(open) => { if (!open) { setProfileStudent(null); setDismissedProfile(profileCode); } }} student={profileQuery.data ?? profileStudent} grades={profileGradesQuery.data ?? []} complaints={profileComplaintsQuery.data ?? []} academicEmail={profileEmailQuery.data} isLoading={profileQuery.isLoading} gradesLoading={profileGradesQuery.isLoading} complaintsLoading={profileComplaintsQuery.isLoading} locale={locale} canViewSensitiveStudentData={canViewSensitiveStudentData} />
      <ResetStudentPasswordDialog
        open={isResetOpen}
        onOpenChange={(open) => {
          setIsResetOpen(open);
          if (!open) setSelectedStudent(null);
        }}
        student={selectedStudent}
        onSuccess={() => invalidateStudents()}
        locale={locale}
      />
      <DepartmentTransferDialog
        open={isTransferOpen}
        onOpenChange={(open) => {
          setIsTransferOpen(open);
          if (!open) setTransferStudent(null);
        }}
        student={transferStudent}
        selectedStudents={selectedStudentsList}
        selectedKeys={selectedKeys}
        onSuccess={() => {
          setSelectedKeys([]);
          setSelectedStudentsMap(new Map());
          invalidateStudents();
        }}
        locale={locale}
      />
      <ConfirmDialog
        dir={locale === 'ar' ? 'rtl' : 'ltr'}
        open={isBulkDeactivateOpen}
        onOpenChange={setIsBulkDeactivateOpen}
        title={t('deactivate')}
        description={
          locale === 'ar'
            ? `هل أنت متأكد من تعطيل حسابات ${selectedKeys.length} طالب محدد؟ ستصبح حالتهم غير نشط مع الاحتفاظ بملفاتهم وسجلاتهم الأكاديمية، ويمكن إعادة تفعيلهم.`
            : `Deactivate ${selectedKeys.length} selected accounts? Their status will become inactive. Their profiles and academic records will be retained, and they can be reactivated.`
        }
        confirmLabel={t('deactivate')}
        cancelLabel={tCommon('cancel')}
        disabled={isBulkDeactivating}
        onConfirm={async () => {
          if (isBulkDeactivating) return;
          setIsBulkDeactivating(true);
          const failed: string[] = [];
          try {
            for (const id of selectedKeys) {
              try {
                await deactivateStudent(id);
              } catch {
                failed.push(id);
              }
            }
            setSelectedKeys(failed);
            setSelectedStudentsMap((previous) => new Map(
              [...previous].filter(([id]) => failed.includes(id)),
            ));
            setIsBulkDeactivateOpen(false);
            invalidateStudents();
            if (failed.length) {
              toast.error(locale === 'ar'
                ? `تعذر تعطيل ${failed.length} حساب؛ ظلوا محددين لإعادة المحاولة.`
                : `${failed.length} accounts could not be deactivated and remain selected.`);
            } else {
              toast.success(locale === 'ar'
                ? 'تم تعطيل الحسابات مع الاحتفاظ ببيانات الطلاب'
                : 'Accounts deactivated; student records retained');
            }
          } finally {
            setIsBulkDeactivating(false);
          }
        }}
      />

      {/* Auto-Register First Year Dialog */}
      <Dialog open={isAutoRegisterModalOpen} onOpenChange={setIsAutoRegisterModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader className="text-start sm:text-start rtl:sm:text-right">
            <DialogTitle className="flex items-center gap-2">
              <BookOpenCheck className="h-5 w-5 text-primary" />
              {locale === 'ar' ? 'التسجيل التلقائي لمقررات المستوى الأول' : 'Auto-Register Level 1 Courses'}
            </DialogTitle>
            <DialogDescription className="text-start">
              {locale === 'ar'
                ? 'تسجيل طلاب المستوى الأول النشطين في المقررات الإجبارية للفصل الدراسي المحدد بشكل آلي وفق اللائحة.'
                : 'Batch enroll active Level 1 students into mandatory semester courses automatically.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
              {selectedKeys.length > 0 ? (
                <span>
                  {locale === 'ar'
                    ? `النطاق: سيتم تسجيل ${selectedKeys.length} طالب محدد فقط.`
                    : `Scope: Only ${selectedKeys.length} selected student(s) will be processed.`}
                </span>
              ) : (
                <span>
                  {locale === 'ar'
                    ? `النطاق: سيتم فحص وتسجيل جميع طلاب المستوى الأول النشطين المسجلين في النظام (${total} طالب).`
                    : `Scope: All active Level 1 students in the registry (${total}) will be processed.`}
                </span>
              )}
            </div>

            <AcademicYearSelect
              value={autoRegYear}
              onChange={setAutoRegYear}
              defaultToCurrent
            />

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                {locale === 'ar' ? 'الفصل الدراسي' : 'Semester'}
              </label>
              <Select
                value={autoRegSemester}
                onValueChange={(val) => setAutoRegSemester(val as 'first' | 'second')}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="first">
                    {locale === 'ar' ? 'الفصل الدراسي الأول (First Semester)' : 'First Semester'}
                  </SelectItem>
                  <SelectItem value="second">
                    {locale === 'ar' ? 'الفصل الدراسي الثاني (Second Semester)' : 'Second Semester'}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="pt-1">
              <div
                role="button"
                tabIndex={0}
                onClick={() => setAutoRegOverwrite(!autoRegOverwrite)}
                onKeyDown={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    setAutoRegOverwrite(!autoRegOverwrite);
                  }
                }}
                className="flex items-center justify-between gap-3 cursor-pointer rounded-xl border border-border/70 bg-card/60 p-3 hover:bg-card transition-colors select-none"
              >
                <div className="space-y-0.5">
                  <span className="font-semibold text-xs text-foreground block">
                    {locale === 'ar'
                      ? 'إعادة تسجيل الطلاب المسجلين مسبقاً (تحديث المقررات)'
                      : 'Overwrite already registered students'}
                  </span>
                  <p className="text-[11px] text-muted-foreground">
                    {locale === 'ar'
                      ? 'في حال تفعيله، سيتم تحديث مقررات أي طالب مسجل بالفعل بدلاً من تخطيه.'
                      : 'When enabled, existing registrations will be updated instead of skipped.'}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={autoRegOverwrite}
                  onClick={(e) => {
                    e.stopPropagation();
                    setAutoRegOverwrite(!autoRegOverwrite);
                  }}
                  className={cn(
                    'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50',
                    autoRegOverwrite ? 'bg-teal-500' : 'bg-muted-foreground/30',
                  )}
                >
                  <span
                    className={cn(
                      'pointer-events-none block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform',
                      autoRegOverwrite
                        ? 'translate-x-4 rtl:-translate-x-4'
                        : 'translate-x-0.5 rtl:-translate-x-0.5',
                    )}
                  />
                </button>
              </div>
            </div>
          </div>

          <DialogFooter className="flex-row-reverse sm:flex-row rtl:sm:justify-start gap-2 pt-2">
            <Button
              type="button"
              disabled={isAutoRegistering || !autoRegYear}
              onClick={handleAutoRegisterFirstYear}
              className="gap-2"
            >
              {isAutoRegistering ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <BookOpenCheck className="h-4 w-4" />
              )}
              {locale === 'ar' ? 'بدء التسجيل التلقائي' : 'Start Auto-Registration'}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isAutoRegistering}
              onClick={() => setIsAutoRegisterModalOpen(false)}
            >
              {tCommon('cancel')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isBulkMustChangeOpen && mustChangeSummaryQuery.data && <PasswordRequirementDialog
        summary={mustChangeSummaryQuery.data}
        isAr={locale === 'ar'}
        busy={isTogglingMustChange}
        onClose={() => setIsBulkMustChangeOpen(false)}
        onSave={handleToggleAllMustChange}
      />}
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
