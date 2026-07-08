'use client';

import React, { useState, Suspense } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import api, { getApiErrorMessage, PaginatedResponse } from '@/lib/api';
import { Download, Plus, Edit2, Trash2, Loader2, BookOpen, UploadCloud } from 'lucide-react';
import { COURSE_LEVEL_VALUES } from '@student-portal/shared';
import { toast } from 'sonner';
import { useAuth } from '@/providers/auth-provider';
import { PermissionGuard } from '@/components/ui/permission-guard';
import { useCourseStore } from '@/store/course-store';
import { downloadExcel } from '@/lib/utils';


// Reusable components
import { PageTitleBanner } from '@/components/ui/page-title-banner';
import { DataTableShell, type ColumnDef } from '@/components/ui/data-table-shell';
import { FilterBar } from '@/components/ui/filter-bar';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { StatusBadge } from '@/components/ui/status-badge';
import { PageSkeletonLoader } from '@/components/ui/page-suspense-fallback';
import { DataUploadDialog } from '@/components/ui/data-upload-dialog';
import { TableActionButton } from '@/components/ui/table-action-button';

// shadcn
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/* ─── Types ───────────────────────────────────────────── */
interface Course {
  _id: string;
  name: string;
  code: string;
  level: string;
  academicLevel?: string;
  semester: string;
  department?: string;
  creditHours?: number;
  prerequisites?: string[];
  type?: 'required' | 'elective';
  isActive: boolean;
}

const courseImportColumns = [
  'courseCode',
  'courseName',
  'level',
  'semester',
  'department',
  'creditHours',
];

/* ─── Course Form Dialog (Reusable for Add/Edit) ─────── */
interface CourseFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'add' | 'edit';
  initialValues?: Partial<Course>;
  onSubmit: (data: Omit<Course, '_id' | 'isActive'> & { isActive: boolean }) => Promise<void>;
  t: ReturnType<typeof useTranslations>;
  tCommon: ReturnType<typeof useTranslations>;
}

function CourseFormDialog({
  open,
  onOpenChange,
  mode,
  initialValues = {},
  onSubmit,
  t,
  tCommon,
}: CourseFormDialogProps) {
  const [name, setName] = useState(initialValues.name || '');
  const [code, setCode] = useState(initialValues.code || '');
  const [level, setLevel] = useState(initialValues.level || '1');
  const [semester, setSemester] = useState(initialValues.semester || 'first');
  const [creditHours, setCreditHours] = useState(initialValues.creditHours || 3);
  const [department, setDepartment] = useState(initialValues.department || '');
  const [prerequisites, setPrerequisites] = useState((initialValues.prerequisites || []).join(', '));
  const [courseType, setCourseType] = useState<'required' | 'elective'>(initialValues.type || 'required');
  const [isActive, setIsActive] = useState(initialValues.isActive ?? true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [prevOpen, setPrevOpen] = useState(open);
  const [prevName, setPrevName] = useState(initialValues.name);
  const [prevCode, setPrevCode] = useState(initialValues.code);
  const [prevLevel, setPrevLevel] = useState(initialValues.level);
  const [prevSemester, setPrevSemester] = useState(initialValues.semester);
  const [prevCreditHours, setPrevCreditHours] = useState(initialValues.creditHours);
  const [prevDepartment, setPrevDepartment] = useState(initialValues.department);
  const [prevPrerequisites, setPrevPrerequisites] = useState(initialValues.prerequisites?.join(', '));
  const [prevCourseType, setPrevCourseType] = useState(initialValues.type);
  const [prevIsActive, setPrevIsActive] = useState(initialValues.isActive);

  if (
    open !== prevOpen ||
    initialValues.name !== prevName ||
    initialValues.code !== prevCode ||
    initialValues.level !== prevLevel ||
    initialValues.semester !== prevSemester ||
    initialValues.creditHours !== prevCreditHours ||
    initialValues.department !== prevDepartment ||
    initialValues.prerequisites?.join(', ') !== prevPrerequisites ||
    initialValues.type !== prevCourseType ||
    initialValues.isActive !== prevIsActive
  ) {
    setPrevOpen(open);
    setPrevName(initialValues.name);
    setPrevCode(initialValues.code);
    setPrevLevel(initialValues.level);
    setPrevSemester(initialValues.semester);
    setPrevCreditHours(initialValues.creditHours);
    setPrevDepartment(initialValues.department);
    setPrevPrerequisites(initialValues.prerequisites?.join(', '));
    setPrevCourseType(initialValues.type);
    setPrevIsActive(initialValues.isActive);

    if (open) {
      setName(initialValues.name || '');
      setCode(initialValues.code || '');
      setLevel(initialValues.level || '1');
      setSemester(initialValues.semester || 'first');
      setCreditHours(initialValues.creditHours || 3);
      setDepartment(initialValues.department || '');
      setPrerequisites((initialValues.prerequisites || []).join(', '));
      setCourseType(initialValues.type || 'required');
      setIsActive(initialValues.isActive ?? true);
      setError('');
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await onSubmit({
        name,
        code,
        level,
        academicLevel: level,
        semester,
        creditHours,
        department,
        prerequisites: prerequisites
          .split(',')
          .map((item) => item.trim().toUpperCase())
          .filter(Boolean),
        type: courseType,
        isActive,
      });
      onOpenChange(false);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, tCommon('errorLoading')));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass max-h-[90vh] max-w-md overflow-y-auto rounded-2xl border border-white/10">
        <DialogHeader className="border-b border-border pb-4">
          <DialogTitle className="text-foreground">
            {mode === 'add' ? t('addCourse') : t('editCourse')}
          </DialogTitle>
        </DialogHeader>

        {error && (
          <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted">{t('courseName')} *</label>
            <Input type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder={t('courseName')} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted">{t('courseCode')} *</label>
              <Input type="text" required value={code} onChange={(e) => setCode(e.target.value)} placeholder="CS101" className="font-mono text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted">{t('creditHours')}</label>
              <Input type="number" min={1} value={creditHours} onChange={(e) => setCreditHours(parseInt(e.target.value) || 0)} className="font-mono text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted">{t('level')} *</label>
              <Select value={level} onValueChange={setLevel}>
                <SelectTrigger className="bg-secondary/50 border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COURSE_LEVEL_VALUES.map((l) => (
                    <SelectItem key={l} value={l}>{t(`level_${l}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted">{t('semester')} *</label>
              <Select value={semester} onValueChange={setSemester}>
                <SelectTrigger className="bg-secondary/50 border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="first">{t('semester_first')}</SelectItem>
                  <SelectItem value="second">{t('semester_second')}</SelectItem>
                  <SelectItem value="summer">{t('semester_summer')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted">{t('department')}</label>
            <Input type="text" value={department} onChange={(e) => setDepartment(e.target.value)} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted">Prerequisites</label>
              <Input
                type="text"
                value={prerequisites}
                onChange={(e) => setPrerequisites(e.target.value)}
                placeholder="CS101, BIS102"
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted">Course type</label>
              <Select value={courseType} onValueChange={(value) => setCourseType(value as 'required' | 'elective')}>
                <SelectTrigger className="bg-secondary/50 border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="required">Required</SelectItem>
                  <SelectItem value="elective">Elective</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input type="checkbox" id="isActiveCourse" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 rounded-full border-input-border bg-input text-primary focus:ring-primary cursor-pointer" />
            <label htmlFor="isActiveCourse" className="text-sm font-semibold text-foreground">{t('isActive')}</label>
          </div>

          <DialogFooter className="mt-6 gap-2 border-t border-border pt-4">
            <Button variant="secondary" type="button" onClick={() => onOpenChange(false)}>{tCommon('cancel')}</Button>
            <Button type="submit" disabled={loading} className="flex items-center gap-2 bg-primary font-semibold text-white hover:bg-primary-hover">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {tCommon('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Main Page ───────────────────────────────────────── */
function CoursesPageContent() {
  const t = useTranslations('courses');
  const tCommon = useTranslations('common');
  const params = useParams();
  const locale = params.locale as string;
  const queryClient = useQueryClient();

  const {
    search,
    activeLevel,
    selectedKeys,
    setFilter,
    setSelectedKeys,
  } = useCourseStore();
  const { user } = useAuth();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [page, setPage] = useState(1);
  const limit = 10;

  const coursesQuery = useQuery({
    queryKey: ['courses', search, activeLevel, page, limit],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, limit };
      if (search) params.search = search;
      if (activeLevel !== 'all') params.level = activeLevel;
      const res = await api.get<PaginatedResponse<Course>>('/admin/courses', { params });
      return res.data;
    },
  });

  const courses = coursesQuery.data?.items || [];
  const total = coursesQuery.data?.total || 0;
  const totalPages = coursesQuery.data?.totalPages || 1;
  const fromRow = total === 0 ? 0 : (page - 1) * limit + 1;
  const toRow = Math.min(page * limit, total);

  const handleAdd = async (data: Omit<Course, '_id' | 'isActive'> & { isActive: boolean }) => {
    await api.post('/admin/courses', data);
    toast.success(locale === 'ar' ? 'تم إضافة المادة بنجاح' : 'Course added successfully');
    void queryClient.invalidateQueries({ queryKey: ['courses'] });
  };

  const handleEdit = async (data: Omit<Course, '_id' | 'isActive'> & { isActive: boolean }) => {
    if (!selectedCourse) return;
    await api.patch(`/admin/courses/${selectedCourse._id}`, data);
    toast.success(locale === 'ar' ? 'تم تحديث المادة بنجاح' : 'Course updated successfully');
    void queryClient.invalidateQueries({ queryKey: ['courses'] });
  };

  const handleBulkDelete = async (ids: string[]) => {
    if (!confirm(locale === 'ar' ? 'هل أنت متأكد من حذف المواد المحددة؟' : 'Are you sure you want to delete the selected courses?')) return;
    const toastId = toast.loading(locale === 'ar' ? 'جاري حذف المواد...' : 'Deleting courses...');
    try {
      await Promise.all(ids.map((id) => api.delete(`/admin/courses/${id}`)));
      toast.success(locale === 'ar' ? 'تم حذف المواد المحددة بنجاح' : 'Selected courses deleted successfully', { id: toastId });
      setSelectedKeys([]);
      void queryClient.invalidateQueries({ queryKey: ['courses'] });
    } catch (err) {
      toast.error(getApiErrorMessage(err, locale === 'ar' ? 'فشل حذف بعض المواد' : 'Failed to delete some courses'), { id: toastId });
    }
  };

  const handleBulkEdit = () => {
    if (selectedKeys.length !== 1) return;
    const courseToEdit = courses.find((c) => c._id === selectedKeys[0]);
    if (courseToEdit) {
      setSelectedCourse(courseToEdit);
      setIsEditOpen(true);
    }
  };

  const toggleStatus = async (course: Course) => {
    try {
      await api.patch(`/admin/courses/${course._id}`, { isActive: !course.isActive });
      void queryClient.invalidateQueries({ queryKey: ['courses'] });
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    }
  };

  const exportCourses = async () => {
    setIsExporting(true);
    try {
      const allCourses: Course[] = [];
      let exportPage = 1;
      let totalPages = 1;

      do {
        const queryParams: Record<string, string | number> = { page: exportPage, limit: 100 };
        if (search) queryParams.search = search;
        if (activeLevel !== 'all') queryParams.level = activeLevel;

        const res = await api.get<PaginatedResponse<Course>>('/admin/courses', {
          params: queryParams,
        });
        allCourses.push(...res.data.items);
        totalPages = res.data.totalPages || 1;
        exportPage += 1;
      } while (exportPage <= totalPages);

      downloadExcel(
        allCourses.map((course) => ({
          code: course.code,
          name: course.name,
          level: course.level,
          semester: course.semester,
          department: course.department || '',
          creditHours: course.creditHours || '',
          type: course.type || '',
          prerequisites: course.prerequisites?.join(', ') || '',
          status: course.isActive ? 'Active' : 'Inactive',
        })),
        ['Course Code', 'Course Name', 'Level', 'Semester', 'Department', 'Credit Hours', 'Type', 'Prerequisites', 'Status'],
        `courses_export_${new Date().toISOString().slice(0, 10)}`,
      );
      toast.success(locale === 'ar' ? 'تم تجهيز ملف المواد' : 'Courses export is ready');
    } catch (err) {
      toast.error(getApiErrorMessage(err, locale === 'ar' ? 'فشل تصدير المواد' : 'Failed to export courses'));
    } finally {
      setIsExporting(false);
    }
  };

  /* ─── Column Definitions ──────────────────────────── */
  const columns: ColumnDef<Course>[] = [
    {
      key: 'name',
      header: t('courseName'),
      render: (course) => (
        <TableCell className="p-4 font-medium text-foreground">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 shrink-0 text-muted" />
            <span>{course.name}</span>
          </div>
        </TableCell>
      ),
    },
    {
      key: 'level',
      header: tCommon('level'),
      render: (course) => (
        <TableCell className="p-4">
          <span className="inline-flex rounded-md border border-border px-2.5 py-1 text-xs font-semibold text-muted-foreground">
            {t(`level_${course.level}`)}
          </span>
        </TableCell>
      ),
    },
    {
      key: 'status',
      header: tCommon('status'),
      render: (course) => (
        <TableCell className="p-4">
          <StatusBadge
            label={course.isActive ? tCommon('active') : tCommon('inactive')}
            variant={course.isActive ? 'success' : 'danger'}
            onClick={() => toggleStatus(course)}
          />
        </TableCell>
      ),
    },
    {
      key: 'actions',
      header: tCommon('actions'),
      className: 'text-center',
      render: (course) => (
        <TableCell className="p-4 text-center">
          <div className="flex items-center justify-center gap-2">
            <TableActionButton
              onClick={() => { setSelectedCourse(course); setIsEditOpen(true); }}
            >
              <Edit2 className="h-3.5 w-3.5" />
              <span>{tCommon('edit')}</span>
            </TableActionButton>
            <ConfirmDialog
              trigger={
                <TableActionButton variant="danger">
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>{tCommon('delete')}</span>
                </TableActionButton>
              }
              title={tCommon('deleteConfirmTitle')}
              description={
                <>
                  {tCommon('deleteConfirmMessage')}{' '}
                  <span className="font-bold text-danger">&quot;{course.name}&quot;</span>
                </>
              }
              confirmLabel={tCommon('delete')}
              cancelLabel={tCommon('cancel')}
              onConfirm={() => handleBulkDelete([course._id])}
            />
          </div>
        </TableCell>
      ),
    },
  ];

  return (
    <div className="animate-fade-in space-y-6 p-2 md:p-6">
      {/* Page Title Banner */}
      <PageTitleBanner
        title={t('title')}
        icon={<BookOpen className="h-5 w-5" />}
        subtitle={t('title')}
      >
        <Button variant="outline" onClick={() => setIsUploadOpen(true)}>
          <UploadCloud className="h-4 w-4" />
          Upload Courses
        </Button>
        <Button variant="outline" onClick={exportCourses} disabled={isExporting}>
          {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Export
        </Button>
        <Button
          onClick={() => setIsAddOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-primary font-semibold text-white shadow-lg hover:bg-primary-hover active:scale-[0.98]"
        >
          <Plus className="h-5 w-5" />
          <span>{t('addCourse')}</span>
        </Button>
      </PageTitleBanner>

      {/* Level Filter Dropdown */}
      <FilterBar
        search={search}
        onSearchChange={(val) => {
          setFilter('search', val);
          setPage(1);
        }}
        searchPlaceholder={t('searchPlaceholder')}
      >
        <Select
          value={activeLevel}
          onValueChange={(val) => {
            setFilter('activeLevel', val);
            setPage(1);
          }}
        >

          <SelectTrigger className="w-[200px] border-border bg-secondary/50">
            <SelectValue placeholder={t('level_all')} />
          </SelectTrigger>
          <SelectContent className="border-border bg-card">
            <SelectItem value="all">{t('level_all')}</SelectItem>
            {COURSE_LEVEL_VALUES.map((l) => (
              <SelectItem key={l} value={l}>{t(`level_${l}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterBar>

      {/* Total count */}
      <p className="text-sm text-muted">
        Showing <span className="font-bold text-foreground">{fromRow}-{toRow}</span> of{' '}
        <span className="font-bold text-foreground">{total}</span>
      </p>

      {/* Data Table */}
      <DataTableShell
        columns={columns}
        data={courses}
        keyExtractor={(c) => c._id}
        isLoading={coursesQuery.isLoading}
        isError={coursesQuery.isError}
        error={coursesQuery.error}
        errorMessage={tCommon('errorLoading')}
        emptyMessage={tCommon('noData')}
        loadingMessage={tCommon('loading')}
        onRetry={() => coursesQuery.refetch()}
        retryLabel={tCommon('retry')}
        enableSelection={user?.role === 'admin'}
        selectedKeys={selectedKeys}
        onSelectedKeysChange={setSelectedKeys}
        bulkActions={[
          ...(selectedKeys.length === 1
            ? [
                {
                  label: locale === 'ar' ? 'تعديل' : 'Edit',
                  onClick: handleBulkEdit,
                  variant: 'default' as const,
                  icon: <Edit2 className="w-3.5 h-3.5" />,
                },
              ]
            : []),
          {
            label: locale === 'ar' ? 'حذف المادة' : 'Delete',
            onClick: handleBulkDelete,
            variant: 'destructive',
            icon: <Trash2 className="w-3.5 h-3.5" />,
          },
        ]}
      />

      <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/70 p-3 sm:flex-row sm:items-center sm:justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPage((current) => Math.max(1, current - 1))}
          disabled={page === 1 || coursesQuery.isLoading}
        >
          {tCommon('previous')}
        </Button>
        <span className="text-center font-mono text-sm text-muted-foreground">
          Page <span className="text-foreground">{page}</span> / {Math.max(1, totalPages)}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
          disabled={page >= totalPages || coursesQuery.isLoading}
        >
          {tCommon('next')}
        </Button>
      </div>

      {/* Mobile Card View */}
      <div className="grid grid-cols-1 gap-4 md:hidden">
        {courses.map((course) => (
          <div key={course._id} className="rounded-xl border border-border bg-card/95 p-4 backdrop-blur-sm">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-lg font-bold text-foreground">{course.name}</span>
              <StatusBadge
                label={course.isActive ? tCommon('active') : tCommon('inactive')}
                variant={course.isActive ? 'success' : 'danger'}
                onClick={() => toggleStatus(course)}
              />
            </div>
            <p className="mb-3 text-sm text-muted-foreground">{t(`level_${course.level}`)}</p>
            <div className="flex gap-2 border-t border-border/50 pt-3">
              <TableActionButton
                onClick={() => { setSelectedCourse(course); setIsEditOpen(true); }}
              >
                <Edit2 className="h-3 w-3" /> {tCommon('edit')}
              </TableActionButton>
              <ConfirmDialog
                trigger={
                  <TableActionButton variant="danger">
                    <Trash2 className="h-3 w-3" /> {tCommon('delete')}
                  </TableActionButton>
                }
                title={tCommon('deleteConfirmTitle')}
                description={tCommon('deleteConfirmMessage')}
                confirmLabel={tCommon('delete')}
                cancelLabel={tCommon('cancel')}
                onConfirm={() => handleBulkDelete([course._id])}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Add Course Dialog */}
      <CourseFormDialog
        open={isAddOpen}
        onOpenChange={setIsAddOpen}
        mode="add"
        onSubmit={handleAdd}
        t={t}
        tCommon={tCommon}
      />

      {/* Edit Course Dialog */}
      <CourseFormDialog
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        mode="edit"
        initialValues={selectedCourse || undefined}
        onSubmit={handleEdit}
        t={t}
        tCommon={tCommon}
      />

      <DataUploadDialog
        open={isUploadOpen}
        onOpenChange={setIsUploadOpen}
        title="Upload Courses"
        description="Upload an xlsx, xls, or csv file. Existing course codes are updated; new course codes are created."
        uploadType="courses"
        expectedColumns={courseImportColumns}
        onSuccess={() => {
          void queryClient.invalidateQueries({ queryKey: ['courses'] });
        }}
      />
    </div>
  );
}

export default function CoursesPage() {
  return (
    <Suspense fallback={<PageSkeletonLoader />}>
      <PermissionGuard permission="courses.read">
        <CoursesPageContent />
      </PermissionGuard>
    </Suspense>
  );
}
