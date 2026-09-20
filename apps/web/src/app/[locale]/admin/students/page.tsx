'use client';

import React, { Suspense, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { Download, Plus, UploadCloud, Users, Loader2 } from 'lucide-react';
import { COURSE_LEVEL_VALUES, ENROLLMENT_STATUS_VALUES } from '@student-portal/shared';
import { toast } from 'sonner';

import { downloadExcel } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';
import { PermissionGuard } from '@/components/ui/permission-guard';
import { useStudentStore } from '@/store/student-store';
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

import { StudentFormDialog } from '@/features/students/components/student-form-dialog';
import { StudentDetailDialog } from '@/features/students/components/student-detail-dialog';
import { StudentTable, type Student } from '@/features/students/components/student-table';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataUploadDialog } from '@/components/ui/data-upload-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FilterBar } from '@/components/ui/filter-bar';
import { Input } from '@/components/ui/input';
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

function StudentsPageContent() {
  const t = useTranslations('students');
  const tCommon = useTranslations('common');
  const params = useParams();
  const locale = params.locale as string;
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { search, level, status, sortBy, sortOrder, page, selectedKeys, setFilter, setSelectedKeys } = useStudentStore();
  const [limit, setLimit] = useState(20);
  const canViewSensitiveStudentData = user?.role === 'admin';

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isBulkDeactivateOpen, setIsBulkDeactivateOpen] = useState(false);
  const [profileStudent, setProfileStudent] = useState<Student | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [form, setForm] = useState(initialForm);
  const [newPassword, setNewPassword] = useState('');
  const [forcePasswordChange, setForcePasswordChange] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  const studentsQuery = useQuery({
    queryKey: studentKeys.list({ page, limit, search, level, enrollmentStatus: status, sortBy, sortOrder: sortOrder as 'asc' | 'desc' }),
    queryFn: () => listStudents({ page, limit, search: search.trim() || undefined, level: level !== 'all' ? level : undefined, enrollmentStatus: status !== 'all' ? status : undefined, sortBy, sortOrder: sortOrder as 'asc' | 'desc' }),
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

  const students = studentsQuery.data?.items ?? [];
  const total = studentsQuery.data?.total ?? 0;
  const totalPages = studentsQuery.data?.totalPages ?? 1;

  const invalidateStudents = () => {
    void queryClient.invalidateQueries({ queryKey: ['students'] });
  };

  const handleAddSubmit = async (values: any) => {
    setFormLoading(true);
    try {
      await createStudent(values);
      setIsAddOpen(false);
      toast.success(locale === 'ar' ? 'تمت إضافة الطالب بنجاح' : 'Student added successfully');
      invalidateStudents();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create student');
    } finally {
      setFormLoading(false);
    }
  };

  const handleEditSubmit = async (values: any) => {
    if (!selectedStudent) return;
    setFormLoading(true);
    try {
      await updateStudent(selectedStudent._id, values);
      setIsEditOpen(false);
      toast.success(locale === 'ar' ? 'تم تحديث بيانات الطالب بنجاح' : 'Student updated successfully');
      invalidateStudents();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update student');
    } finally {
      setFormLoading(false);
    }
  };

  return (
    <div className="animate-fade-in space-y-6 p-2 md:p-6">
      <PageTitleBanner title={t('title')} icon={<Users className="h-5 w-5" />} subtitle="Manage student identities, academic placement, exam seats, imports, and exports.">
        <Button variant="outline" onClick={() => setIsUploadOpen(true)}>
          <UploadCloud className="h-4 w-4" />
          {locale === 'ar' ? 'رفع الطلاب' : 'Upload Students'}
        </Button>
        <Button onClick={() => { setSelectedStudent(null); setForm(initialForm); setIsAddOpen(true); }}>
          <Plus className="h-4 w-4" />
          {t('addStudent')}
        </Button>
      </PageTitleBanner>

      <FilterBar search={search} onSearchChange={(val) => { setFilter('search', val); setFilter('page', 1); }} searchPlaceholder={t('searchPlaceholder')}>
        <Select value={level} onValueChange={(val) => { setFilter('level', val); setFilter('page', 1); }}>
          <SelectTrigger className="w-full border-border bg-secondary/50 lg:w-[170px]">
            <SelectValue placeholder={t('level')} />
          </SelectTrigger>
          <SelectContent className="border-border bg-card">
            <SelectItem value="all">{t('level')}: {tCommon('all')}</SelectItem>
            {COURSE_LEVEL_VALUES.map((lvl) => (
              <SelectItem key={lvl} value={lvl}>{locale === 'ar' ? `المستوى ${lvl}` : `Level ${lvl}`}</SelectItem>
            ))}
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
        onViewStudent={(st) => setProfileStudent(st)}
        onEditStudent={(st) => { setSelectedStudent(st); setIsEditOpen(true); }}
        onResetPassword={(st) => { setSelectedStudent(st); setIsResetOpen(true); }}
        onActivateStudent={async (st) => { await activateStudent(st._id); invalidateStudents(); }}
        onDeactivateStudent={async (ids) => { await Promise.all(ids.map((id) => deactivateStudent(id))); invalidateStudents(); }}
        onBulkEdit={() => { if (selectedKeys.length === 1) { const found = students.find((s) => s._id === selectedKeys[0]); if (found) { setSelectedStudent(found); setIsEditOpen(true); } } }}
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
              ariaLabel={locale === 'ar' ? 'عدد العناصر لكل صفحة' : 'Items per page'}
              value={String(limit)}
              onValueChange={(val) => {
                setLimit(Number(val));
                setFilter('page', 1);
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
            {locale === 'ar' ? `الصفحة ${page} من ${totalPages}` : `Page ${page} of ${totalPages}`}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFilter('page', Math.min(totalPages, page + 1))}
            disabled={page >= totalPages || studentsQuery.isLoading}
            className="cursor-pointer text-xs"
          >
            {tCommon('next')}
          </Button>
        </div>
      </div>

      <StudentFormDialog open={isAddOpen} onOpenChange={setIsAddOpen} isEditing={false} onSubmit={handleAddSubmit} isSubmitting={formLoading} />
      <StudentFormDialog open={isEditOpen} onOpenChange={setIsEditOpen} isEditing={true} onSubmit={handleEditSubmit} isSubmitting={formLoading} defaultValues={selectedStudent ? { fullName: selectedStudent.fullName, studentCode: selectedStudent.studentCode, level: selectedStudent.level, department: selectedStudent.department } : undefined} />

      <DataUploadDialog open={isUploadOpen} onOpenChange={setIsUploadOpen} title={locale === 'ar' ? 'رفع ملف بيانات الطلاب' : 'Bulk Upload Students'} description="Upload XLSX, XLS or CSV to import students." uploadType="students" expectedColumns={studentImportColumns} onSuccess={() => invalidateStudents()} />
      <StudentDetailDialog open={Boolean(profileStudent)} onOpenChange={(open) => !open && setProfileStudent(null)} student={profileQuery.data ?? profileStudent} grades={profileGradesQuery.data ?? []} complaints={profileComplaintsQuery.data ?? []} academicEmail={profileEmailQuery.data} isLoading={profileQuery.isLoading} gradesLoading={profileGradesQuery.isLoading} complaintsLoading={profileComplaintsQuery.isLoading} locale={locale} canViewSensitiveStudentData={canViewSensitiveStudentData} />
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
