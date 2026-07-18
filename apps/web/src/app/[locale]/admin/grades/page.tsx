'use client';

import React, { useState, Suspense } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import api, { getApiErrorMessage, PaginatedResponse } from '@/lib/api';
import { Award, Download, Edit2, Loader2, Plus, Trash2, UploadCloud, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { EXAM_TYPE_VALUES, GRADE_STATUS_VALUES, SEMESTER_VALUES } from '@student-portal/shared';
import { toast } from 'sonner';
import { downloadExcel } from '@/lib/utils';

// Reusable components
import { PageTitleBanner } from '@/components/ui/page-title-banner';
import { DataTableShell, type ColumnDef } from '@/components/ui/data-table-shell';
import { FilterBar } from '@/components/ui/filter-bar';
import { StatusBadge } from '@/components/ui/status-badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { PageSkeletonLoader } from '@/components/ui/page-suspense-fallback';
import { DataUploadDialog } from '@/components/ui/data-upload-dialog';
import { TableActionButton } from '@/components/ui/table-action-button';
import { PermissionGuard } from '@/components/ui/permission-guard';
import { cn } from '@/lib/cn';

// shadcn
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Course {
  _id: string;
  name: string;
  nameAr?: string;
  nameEn?: string;
  code: string;
}

interface Grade {
  _id: string;
  studentCode: string;
  studentName: string;
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

const gradeImportColumns = [
  'studentCode',
  'courseCode',
  'examType',
  'grade',
  'maxGrade',
  'status',
  'academicYear',
  'semester',
];

function GradesPageContent() {
  const t = useTranslations('grades');
  const tCommon = useTranslations('common');
  const tCourses = useTranslations('courses');
  const params = useParams();
  const locale = params.locale as string;
  const queryClient = useQueryClient();
  const gradeStatusLabel = (value: string) => {
    switch (value) {
      case 'present':
        return t('status_present');
      case 'absent':
        return t('status_absent');
      case 'banned':
        return t('status_banned');
      case 'active':
        return t('status_active');
      case 'inactive':
        return t('status_inactive');
      default:
        return value;
    }
  };

  // Active Tab & Filters
  const [activeTab, setActiveTab] = useState<string>('midterm');
  const [search, setSearch] = useState('');
  const [selectedCourse, setSelectedCourse] = useState('all');
  const [page, setPage] = useState(1);
  const limit = 10;

  // Modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isPublishOpen, setIsPublishOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [selectedGrade, setSelectedGrade] = useState<Grade | null>(null);

  // Form states
  const [studentCode, setStudentCode] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [examType, setExamType] = useState('midterm');
  const [grade, setGrade] = useState<number>(0);
  const [maxGrade, setMaxGrade] = useState<number>(100);
  const [status, setStatus] = useState('present');
  const defaultAcademicYear = `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;
  const [academicYear, setAcademicYear] = useState(defaultAcademicYear);
  const [semester, setSemester] = useState('first');
  const [isPublished, setIsPublished] = useState(true);

  // Bulk publish form states
  const [bulkCourse, setBulkCourse] = useState('all');
  const [bulkExamType, setBulkExamType] = useState('midterm');
  const [bulkAcademicYear, setBulkAcademicYear] = useState(defaultAcademicYear);
  const [bulkSemester, setBulkSemester] = useState('first');
  const [bulkPublishState, setBulkPublishState] = useState(true);

  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');

  const coursesQuery = useQuery({
    queryKey: ['grade-courses'],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<Course>>('/admin/courses', {
        params: { limit: 100 },
      });
      return res.data.items;
    },
  });

  const gradesQuery = useQuery({
    queryKey: ['grades', activeTab, search, selectedCourse, selectedStatus, page, limit],
    queryFn: async () => {
      const queryParams: Record<string, string | number> = {
        page,
        limit,
        examType: activeTab,
      };
      if (search) queryParams.studentCode = search;
      if (selectedCourse !== 'all') queryParams.courseCode = selectedCourse;
      if (selectedStatus !== 'all') queryParams.status = selectedStatus;

      const res = await api.get<PaginatedResponse<Grade>>('/admin/grades', {
        params: queryParams,
      });
      return res.data;
    },
  });

  const courses = coursesQuery.data || [];
  const grades = gradesQuery.data?.items || [];
  const total = gradesQuery.data?.total || 0;
  const totalPages = gradesQuery.data?.totalPages || 1;
  const fromRow = total === 0 ? 0 : (page - 1) * limit + 1;
  const toRow = Math.min(page * limit, total);

  // Sync maxGrade default when examType changes in Add Mode
  React.useEffect(() => {
    if (!selectedGrade) {
      if (examType === 'midterm') setMaxGrade(30);
      else if (examType === 'final') setMaxGrade(60);
      else if (examType === 'quiz') setMaxGrade(15);
    }
  }, [examType, selectedGrade]);

  const openAddModal = () => {
    setStudentCode('');
    setCourseCode(courses[0]?.code || '');
    setExamType(activeTab);
    setGrade(0);
    setMaxGrade(activeTab === 'quiz' ? 15 : activeTab === 'midterm' ? 30 : 60);
    setStatus('present');
    setAcademicYear(defaultAcademicYear);
    setSemester('first');
    setIsPublished(true);
    setFormError('');
    setIsAddOpen(true);
  };

  const openEditModal = (gradeObj: Grade) => {
    setSelectedGrade(gradeObj);
    setStudentCode(gradeObj.studentCode);
    setCourseCode(gradeObj.courseCode);
    setExamType(gradeObj.examType);
    setGrade(gradeObj.grade);
    setMaxGrade(gradeObj.maxGrade);
    setStatus(gradeObj.status);
    setAcademicYear(gradeObj.academicYear);
    setSemester(gradeObj.semester);
    setIsPublished(gradeObj.isPublished);
    setFormError('');
    setIsEditOpen(true);
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormLoading(true);

    try {
      await api.post('/admin/grades', {
        studentCode,
        courseCode,
        examType,
        grade,
        maxGrade,
        status,
        academicYear,
        semester,
        isPublished,
      });
      setIsAddOpen(false);
      toast.success(locale === 'ar' ? 'تم إضافة الدرجة بنجاح' : 'Grade added successfully');
      void queryClient.invalidateQueries({ queryKey: ['grades'] });
    } catch (err: unknown) {
      setFormError(getApiErrorMessage(err, 'حدث خطأ أثناء حفظ البيانات'));
    } finally {
      setFormLoading(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGrade) return;
    setFormError('');
    setFormLoading(true);

    try {
      await api.patch(`/admin/grades/${selectedGrade._id}`, {
        studentCode,
        courseCode,
        examType,
        grade,
        maxGrade,
        status,
        academicYear,
        semester,
        isPublished,
      });
      setIsEditOpen(false);
      toast.success(locale === 'ar' ? 'تم تحديث الدرجة بنجاح' : 'Grade updated successfully');
      void queryClient.invalidateQueries({ queryKey: ['grades'] });
    } catch (err: unknown) {
      setFormError(getApiErrorMessage(err, 'حدث خطأ أثناء حفظ التعديلات'));
    } finally {
      setFormLoading(false);
    }
  };

  const handleBulkPublish = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormLoading(true);

    try {
      await api.post('/admin/grades/publish', {
        academicYear: bulkAcademicYear === 'all' ? undefined : bulkAcademicYear,
        semester: bulkSemester === 'all' ? undefined : bulkSemester,
        examType: bulkExamType === 'all' ? undefined : bulkExamType,
        courseCode: bulkCourse === 'all' ? undefined : bulkCourse,
        isPublished: bulkPublishState,
      });
      setIsPublishOpen(false);
      toast.success(t('publishSuccess'));
      void queryClient.invalidateQueries({ queryKey: ['grades'] });
    } catch (err: unknown) {
      setFormError(getApiErrorMessage(err, 'فشل تحديث حالة نشر الدرجات'));
    } finally {
      setFormLoading(false);
    }
  };

  const handleRecalculateProgress = async () => {
    setIsRecalculating(true);
    try {
      const response = await api.post<{
        processed: number;
        promoted: number;
      }>('/admin/grades/recalculate-progress', {});
      toast.success(
        locale === 'ar'
          ? `تمت مراجعة ${response.data.processed} طالب وترقية ${response.data.promoted}`
          : `Reviewed ${response.data.processed} students and promoted ${response.data.promoted}`,
      );
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsRecalculating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/admin/grades/${id}`);
      toast.success(locale === 'ar' ? 'تم حذف الدرجة بنجاح' : 'Grade deleted successfully');
      void queryClient.invalidateQueries({ queryKey: ['grades'] });
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    }
  };

  const togglePublishSingle = async (gradeObj: Grade) => {
    try {
      await api.patch(`/admin/grades/${gradeObj._id}`, {
        isPublished: !gradeObj.isPublished,
      });
      void queryClient.invalidateQueries({ queryKey: ['grades'] });
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    }
  };

  const exportGrades = async () => {
    setIsExporting(true);
    try {
      const allGrades: Grade[] = [];
      let exportPage = 1;
      let totalPages = 1;

      do {
        const queryParams: Record<string, string | number> = {
          page: exportPage,
          limit: 100,
          examType: activeTab,
        };
        if (search) queryParams.studentCode = search;
        if (selectedCourse !== 'all') queryParams.courseCode = selectedCourse;

        const res = await api.get<PaginatedResponse<Grade>>('/admin/grades', {
          params: queryParams,
        });
        allGrades.push(...res.data.items);
        totalPages = res.data.totalPages || 1;
        exportPage += 1;
      } while (exportPage <= totalPages);

      downloadExcel(
        allGrades.map((item) => ({
          studentCode: item.studentCode,
          studentName: item.studentName,
          courseCode: item.courseCode,
          courseName: item.courseName,
          examType: item.examType,
          grade: item.grade,
          maxGrade: item.maxGrade,
          status: item.status,
          academicYear: item.academicYear,
          semester: item.semester,
          published: item.isPublished ? 'Published' : 'Hidden',
        })),
        [
          'Student Code',
          'Student Name',
          'Course Code',
          'Course Name',
          'Exam Type',
          'Grade',
          'Max Grade',
          'Status',
          'Academic Year',
          'Semester',
          'Published',
        ],
        `grades_export_${new Date().toISOString().slice(0, 10)}`,
      );
      toast.success(locale === 'ar' ? 'تم تجهيز ملف الدرجات' : 'Grades export is ready');
    } catch (err) {
      toast.error(getApiErrorMessage(err, locale === 'ar' ? 'فشل تصدير الدرجات' : 'Failed to export grades'));
    } finally {
      setIsExporting(false);
    }
  };

  /* ─── Column Definitions ──────────────────────────── */
  const columns: ColumnDef<Grade>[] = [
    {
      key: 'studentCode',
      header: tCommon('search') === 'Search...' ? 'Student Code' : 'كود الطالب',
      render: (g) => (
        <TableCell className="p-4 font-mono font-semibold text-foreground">
          {g.studentCode}
        </TableCell>
      ),
    },
    {
      key: 'studentName',
      header: tCommon('search') === 'Search...' ? 'Student Name' : 'اسم الطالب',
      render: (g) => (
        <TableCell className="p-4 font-medium text-foreground">
          {g.studentName}
        </TableCell>
      ),
    },
    {
      key: 'course',
      header: tCourses('courseName'),
      render: (g) => (
        <TableCell className="p-4 text-muted-foreground">
          {g.courseName} ({g.courseCode})
        </TableCell>
      ),
    },
    {
      key: 'gradeValue',
      header: t('gradeValue'),
      render: (g) => {
        const isUnderHalf = g.grade < g.maxGrade / 2;
        return (
          <TableCell className={cn("p-4 font-mono font-bold", isUnderHalf ? "text-red-500" : "text-primary")}>
            {g.grade} / {g.maxGrade}
          </TableCell>
        );
      },
    },
    {
      key: 'status',
      header: t('status'),
      render: (g) => (
        <TableCell className="p-4">
          <StatusBadge
            label={gradeStatusLabel(g.status)}
            variant={
              g.status === 'present'
                ? 'success'
                : g.status === 'absent'
                ? 'warning'
                : 'danger'
            }
          />
        </TableCell>
      ),
    },
    {
      key: 'published',
      header: t('publishTitle'),
      render: (g) => (
        <TableCell className="p-4">
          <StatusBadge
            label={g.isPublished ? tCommon('active') : tCommon('inactive')}
            variant={g.isPublished ? 'success' : 'danger'}
            onClick={() => togglePublishSingle(g)}
          />
        </TableCell>
      ),
    },
    {
      key: 'actions',
      header: tCommon('actions'),
      className: 'text-center',
      render: (g) => (
        <TableCell className="p-4 text-center">
          <div className="flex items-center justify-center gap-2">
            <TableActionButton
              onClick={() => openEditModal(g)}
              title={tCommon('edit')}
            >
              <Edit2 className="w-3.5 h-3.5" />
              <span>{tCommon('edit')}</span>
            </TableActionButton>
            <ConfirmDialog
              trigger={
                <TableActionButton variant="danger">
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{tCommon('delete')}</span>
                </TableActionButton>
              }
              title={tCommon('deleteConfirmTitle')}
              description={locale === 'ar' ? 'هل أنت متأكد من حذف هذه الدرجة نهائياً؟' : 'Are you sure you want to delete this grade?'}
              confirmLabel={tCommon('delete')}
              cancelLabel={tCommon('cancel')}
              onConfirm={() => handleDelete(g._id)}
            />
          </div>
        </TableCell>
      ),
    },
  ];

  return (
    <div className="animate-fade-in space-y-6 p-2 md:p-6">
      {/* Title */}
      <PageTitleBanner
        title={t('title')}
        icon={<Award className="h-5 w-5" />}
        subtitle={t('title')}
      >
        <Button variant="outline" onClick={() => setIsUploadOpen(true)}>
          <UploadCloud className="h-4 w-4" />
          Upload Grades
        </Button>
        <Button variant="outline" onClick={exportGrades} disabled={isExporting}>
          {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Export
        </Button>
        <Button
          variant="outline"
          onClick={handleRecalculateProgress}
          disabled={isRecalculating}
        >
          {isRecalculating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {locale === 'ar' ? 'مراجعة المستويات' : 'Recalculate levels'}
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setBulkCourse('all');
            setBulkExamType(activeTab);
            setBulkPublishState(true);
            setFormError('');
            setIsPublishOpen(true);
          }}
          className="border-border bg-secondary/50 text-foreground hover:bg-secondary/70 h-10 px-4 py-2"
        >
          {t('publishTitle')}
        </Button>
        <Button
          onClick={openAddModal}
          className="flex items-center gap-2 rounded-xl bg-primary font-semibold text-white shadow-lg hover:bg-primary-hover active:scale-[0.98] h-10 px-4 py-2"
        >
          <Plus className="h-5 w-5" />
          <span>{t('addGrade')}</span>
        </Button>
      </PageTitleBanner>

      {/* Tabs */}
      <div className="flex border-b border-border gap-6">
        {EXAM_TYPE_VALUES.map((type) => (
          <button
            key={type}
            onClick={() => {
              setActiveTab(type);
              setPage(1);
            }}
            className={`pb-3 text-sm font-semibold transition-all relative cursor-pointer ${
              activeTab === type ? 'text-primary' : 'text-muted hover:text-foreground'
            }`}
          >
            {t(`examType_${type}`)}
            {activeTab === type && (
              <span className="absolute bottom-0 start-0 w-full h-0.5 bg-primary rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Filter Bar */}
      <FilterBar
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        searchPlaceholder={t('searchPlaceholder')}
      >
        <Select
          value={selectedStatus}
          onValueChange={(value) => {
            setSelectedStatus(value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[180px] border-border bg-secondary/50">
            <SelectValue placeholder={t('status')} />
          </SelectTrigger>
          <SelectContent className="border-border bg-card">
            <SelectItem value="all">{locale === 'ar' ? 'جميع الحالات' : 'All Statuses'}</SelectItem>
            {GRADE_STATUS_VALUES.map((st) => (
              <SelectItem key={st} value={st}>
                {t(`status_${st}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={selectedCourse}
          onValueChange={(value) => {
            setSelectedCourse(value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[240px] border-border bg-secondary/50">
            <SelectValue placeholder={tCourses('title')} />
          </SelectTrigger>
          <SelectContent className="border-border bg-card">
            <SelectItem value="all">{tCourses('title')}: {tCommon('all')}</SelectItem>
            {courses.map((course) => (
              <SelectItem key={course._id} value={course.code}>
                {locale === 'ar' ? (course.nameAr || course.name) : (course.nameEn || course.name)} ({course.code})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterBar>

      {/* Total count */}
      <p className="text-sm text-muted">
        Showing <span className="font-bold text-foreground">{fromRow}-{toRow}</span> of{' '}
        <span className="font-bold text-foreground">{total}</span>
      </p>

      {/* Reusable Data Table */}
      <DataTableShell
        columns={columns}
        data={grades}
        keyExtractor={(g) => g._id}
        isLoading={gradesQuery.isLoading}
        isError={gradesQuery.isError}
        errorMessage={tCommon('errorLoading')}
        emptyMessage={tCommon('noData')}
        loadingMessage={tCommon('loading')}
        onRetry={() => gradesQuery.refetch()}
        retryLabel={tCommon('retry')}
      />

      <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/70 p-3 sm:flex-row sm:items-center sm:justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPage((current) => Math.max(1, current - 1))}
          disabled={page === 1 || gradesQuery.isLoading}
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
          disabled={page >= totalPages || gradesQuery.isLoading}
        >
          {tCommon('next')}
        </Button>
      </div>

      {/* Add Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="glass max-w-2xl border border-white/10 rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="border-b border-border pb-4">
            <DialogTitle className="text-foreground">{t('addGrade')}</DialogTitle>
          </DialogHeader>

          {formError && (
            <div className="bg-danger/10 border border-danger/30 text-danger rounded-xl px-4 py-3 text-sm mb-4">
              {formError}
            </div>
          )}

          <form onSubmit={handleAddSubmit} className="space-y-4 pt-4 text-start">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted">{tCommon('search') === 'Search...' ? 'Student Code' : 'كود الطالب'} *</label>
                <Input
                  type="text"
                  required
                  value={studentCode}
                  onChange={(e) => setStudentCode(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted">{tCourses('courseName')} *</label>
                <Select value={courseCode} onValueChange={setCourseCode}>
                  <SelectTrigger className="border-border bg-secondary/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-border bg-card">
                    {courses.map((course) => (
                      <SelectItem key={course._id} value={course.code}>
                        {locale === 'ar' ? (course.nameAr || course.name) : (course.nameEn || course.name)} ({course.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted">{t('examType')} *</label>
                <Select value={examType} onValueChange={setExamType}>
                  <SelectTrigger className="border-border bg-secondary/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-border bg-card">
                    {EXAM_TYPE_VALUES.map((tp) => (
                      <SelectItem key={tp} value={tp}>
                        {t(`examType_${tp}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted">{t('status')} *</label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="border-border bg-secondary/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-border bg-card">
                    {GRADE_STATUS_VALUES.map((st) => (
                      <SelectItem key={st} value={st}>
                        {t(`status_${st}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted">{t('gradeValue')} *</label>
                <Input
                  type="number"
                  required
                  min={0}
                  value={grade}
                  onChange={(e) => setGrade(parseFloat(e.target.value) || 0)}
                  className="font-mono text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted">{t('maxGrade')} *</label>
                <Input
                  type="number"
                  required
                  min={1}
                  value={maxGrade}
                  onChange={(e) => setMaxGrade(parseFloat(e.target.value) || 0)}
                  className="font-mono text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted">{tCommon('search') === 'Search...' ? 'Academic Year' : 'السنة الدراسية'} *</label>
                <Input
                  type="text"
                  required
                  value={academicYear}
                  onChange={(e) => setAcademicYear(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted">{tCommon('search') === 'Search...' ? 'Semester' : 'الفصل الدراسي'} *</label>
                <Select value={semester} onValueChange={setSemester}>
                  <SelectTrigger className="border-border bg-secondary/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-border bg-card">
                    {SEMESTER_VALUES.map((sem) => (
                      <SelectItem key={sem} value={sem}>
                        {tCourses(`semester_${sem}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="isPublishedAdd"
                checked={isPublished}
                onChange={(e) => setIsPublished(e.target.checked)}
                className="w-4 h-4 rounded-full text-primary bg-input border-input-border cursor-pointer"
              />
              <label htmlFor="isPublishedAdd" className="text-sm font-semibold text-foreground">
                {locale === 'ar' ? 'نشر الدرجة مباشرة للطالب' : 'Publish grade immediately'}
              </label>
            </div>

            <DialogFooter className="border-t border-border pt-4 mt-6 gap-2">
              <Button
                variant="secondary"
                type="button"
                onClick={() => setIsAddOpen(false)}
              >
                {tCommon('cancel')}
              </Button>
              <Button
                type="submit"
                disabled={formLoading}
                className="bg-primary hover:bg-primary-hover text-white font-semibold flex items-center gap-2"
              >
                {formLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                {tCommon('save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="glass max-w-2xl border border-white/10 rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="border-b border-border pb-4">
            <DialogTitle className="text-foreground">{t('editGrade')}</DialogTitle>
          </DialogHeader>

          {formError && (
            <div className="bg-danger/10 border border-danger/30 text-danger rounded-xl px-4 py-3 text-sm mb-4">
              {formError}
            </div>
          )}

          <form onSubmit={handleEditSubmit} className="space-y-4 pt-4 text-start">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted">{tCommon('search') === 'Search...' ? 'Student Code' : 'كود الطالب'}</label>
                <Input
                  type="text"
                  disabled
                  value={studentCode}
                  className="font-mono text-sm bg-black/25 opacity-70"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted">{tCourses('courseName')}</label>
                <Input
                  type="text"
                  disabled
                  value={courseCode}
                  className="font-mono text-sm bg-black/25 opacity-70"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted">{t('status')} *</label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="border-border bg-secondary/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-border bg-card">
                    {GRADE_STATUS_VALUES.map((st) => (
                      <SelectItem key={st} value={st}>
                        {t(`status_${st}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted">{t('gradeValue')} *</label>
                <Input
                  type="number"
                  required
                  min={0}
                  value={grade}
                  onChange={(e) => setGrade(parseFloat(e.target.value) || 0)}
                  className="font-mono text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted">{tCommon('search') === 'Search...' ? 'Academic Year' : 'السنة الدراسية'} *</label>
                <Input
                  type="text"
                  required
                  value={academicYear}
                  onChange={(e) => setAcademicYear(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted">{tCommon('search') === 'Search...' ? 'Semester' : 'الفصل الدراسي'} *</label>
                <Select value={semester} onValueChange={setSemester}>
                  <SelectTrigger className="border-border bg-secondary/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-border bg-card">
                    {SEMESTER_VALUES.map((sem) => (
                      <SelectItem key={sem} value={sem}>
                        {tCourses(`semester_${sem}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="isPublishedEdit"
                checked={isPublished}
                onChange={(e) => setIsPublished(e.target.checked)}
                className="w-4 h-4 rounded-full text-primary bg-input border-input-border cursor-pointer"
              />
              <label htmlFor="isPublishedEdit" className="text-sm font-semibold text-foreground">
                {locale === 'ar' ? 'نشر الدرجة مباشرة للطالب' : 'Publish grade immediately'}
              </label>
            </div>

            <DialogFooter className="border-t border-border pt-4 mt-6 gap-2">
              <Button
                variant="secondary"
                type="button"
                onClick={() => setIsEditOpen(false)}
              >
                {tCommon('cancel')}
              </Button>
              <Button
                type="submit"
                disabled={formLoading}
                className="bg-primary hover:bg-primary-hover text-white font-semibold flex items-center gap-2"
              >
                {formLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                {tCommon('save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Bulk Publish Dialog */}
      <Dialog open={isPublishOpen} onOpenChange={setIsPublishOpen}>
        <DialogContent className="glass max-w-2xl border border-white/10 rounded-2xl">
          <DialogHeader className="border-b border-border pb-4">
            <DialogTitle className="text-foreground">{t('publishTitle')}</DialogTitle>
          </DialogHeader>

          {formError && (
            <div className="bg-danger/10 border border-danger/30 text-danger rounded-xl px-4 py-3 text-sm mb-4">
              {formError}
            </div>
          )}

          <form onSubmit={handleBulkPublish} className="space-y-4 pt-4 text-start">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted">{tCourses('courseName')} *</label>
              <Select value={bulkCourse} onValueChange={setBulkCourse}>
                <SelectTrigger className="border-border bg-secondary/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-border bg-card">
                  <SelectItem value="all">{tCourses('title')}: {tCommon('all')}</SelectItem>
                  {courses.map((course) => (
                    <SelectItem key={course._id} value={course.code}>
                      {course.name} ({course.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted">{t('examType')} *</label>
                <Select value={bulkExamType} onValueChange={setBulkExamType}>
                  <SelectTrigger className="border-border bg-secondary/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-border bg-card">
                    <SelectItem value="all">
                      {locale === 'ar' ? 'كل أنواع النتائج' : 'All result types'}
                    </SelectItem>
                    {EXAM_TYPE_VALUES.map((tp) => (
                      <SelectItem key={tp} value={tp}>
                        {t(`examType_${tp}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted">{t('publishTitle')} *</label>
                <Select value={bulkPublishState ? 'true' : 'false'} onValueChange={(val) => setBulkPublishState(val === 'true')}>
                  <SelectTrigger className="border-border bg-secondary/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-border bg-card">
                    <SelectItem value="true">{t('publishBtn')}</SelectItem>
                    <SelectItem value="false">{t('unpublishBtn')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted">{tCommon('search') === 'Search...' ? 'Academic Year' : 'السنة الدراسية'} *</label>
                <div className="space-y-2">
                  <Input
                    type="text"
                    required={bulkAcademicYear !== 'all'}
                    value={bulkAcademicYear === 'all' ? '' : bulkAcademicYear}
                    disabled={bulkAcademicYear === 'all'}
                    placeholder={defaultAcademicYear}
                    onChange={(e) => setBulkAcademicYear(e.target.value)}
                  />
                  <label className="flex items-center gap-2 text-xs text-muted">
                    <input
                      type="checkbox"
                      checked={bulkAcademicYear === 'all'}
                      onChange={(e) =>
                        setBulkAcademicYear(e.target.checked ? 'all' : defaultAcademicYear)
                      }
                    />
                    {locale === 'ar' ? 'كل السنوات الدراسية' : 'All academic years'}
                  </label>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted">{tCommon('search') === 'Search...' ? 'Semester' : 'الفصل الدراسي'} *</label>
                <Select value={bulkSemester} onValueChange={setBulkSemester}>
                  <SelectTrigger className="border-border bg-secondary/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-border bg-card">
                    <SelectItem value="all">
                      {locale === 'ar' ? 'كل الفصول الدراسية' : 'All semesters'}
                    </SelectItem>
                    {SEMESTER_VALUES.map((sem) => (
                      <SelectItem key={sem} value={sem}>
                        {tCourses(`semester_${sem}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter className="border-t border-border pt-4 mt-6 gap-2">
              <Button
                variant="secondary"
                type="button"
                onClick={() => setIsPublishOpen(false)}
              >
                {tCommon('cancel')}
              </Button>
              <Button
                type="submit"
                disabled={formLoading}
                className="bg-primary hover:bg-primary-hover text-white font-semibold flex items-center gap-2"
              >
                {formLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                {tCommon('save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <DataUploadDialog
        open={isUploadOpen}
        onOpenChange={setIsUploadOpen}
        title="Upload Grades"
        description="Upload an xlsx, xls, or csv file. Matching student, course, and exam type rows are updated."
        uploadType="grades"
        expectedColumns={gradeImportColumns}
        onSuccess={() => {
          void queryClient.invalidateQueries({ queryKey: ['grades'] });
        }}
      />
    </div>
  );
}

export default function GradesPage() {
  return (
    <Suspense fallback={<PageSkeletonLoader />}>
      <PermissionGuard permission="grades.read">
        <GradesPageContent />
      </PermissionGuard>
    </Suspense>
  );
}
