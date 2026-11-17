'use client';

import { getCourseStaffIds } from '@/features/courses/assignment-utils';

import { useStartBookUpload } from '@/features/courses/material-upload-provider';
import React, { useState, Suspense } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter, useParams } from 'next/navigation';
import api, { getApiErrorMessage, PaginatedResponse, apiBaseUrl } from '@/lib/api';
import {
  Download,
  Plus,
  Edit2,
  Trash2,
  Loader2,
  BookOpen,
  UploadCloud,
  FileText,
  UserCheck,
  Eye,
  MoreVertical,
  HelpCircle,
  ListChecks,
  X,
  Users,
  Layers,
  RotateCcw,
} from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { listStaff } from '@/features/staff/api';
import {
  COURSE_LEVEL_VALUES,
  COURSE_BOOK_MAX_BYTES,
  getCourseCurricula,
  serializeCourseCurricula,
  courseCurriculumSummary,
  formatStaffDisplayName,
  getCleanStaffName,
  getStaffPrefix,
  type CourseCurriculum,
} from '@student-portal/shared';
import { toast } from 'sonner';
import { useAuth } from '@/providers/auth-provider';
import { PermissionGuard } from '@/components/ui/permission-guard';
import { useTableState } from '@/hooks/use-table-state';
import { CoursePlacementsEditor } from '@/features/courses/components/course-placements-editor';
import { downloadFileBlob, EXCEL_MIME_TYPE } from '@/lib/export-utils';


// Reusable components
import { PageTitleBanner } from '@/components/ui/page-title-banner';
import { DataTableShell, type ColumnDef } from '@/components/ui/data-table-shell';
import { FilterBar } from '@/components/ui/filter-bar';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { StatusBadge } from '@/components/ui/status-badge';
import { PageSkeletonLoader } from '@/components/ui/page-suspense-fallback';
import { DataUploadDialog } from '@/components/ui/data-upload-dialog';
import { TableActionButton } from '@/components/ui/table-action-button';
import { CourseStudentEnrollmentDialog } from '@/features/courses/components/course-student-enrollment-dialog';
import { CourseMaterialsDialog } from '@/features/courses/components/course-materials-dialog';
import { CourseEnrolledStudentsDialog } from '@/features/courses/components/course-enrolled-students-dialog';

// shadcn
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/* ─── Types ───────────────────────────────────────────── */
type CourseType =
  | 'required'
  | 'elective'
  | 'university_req'
  | 'institute_req'
  | 'specialization_req';

interface Course {
  _id: string;
  name: string;
  nameAr: string;
  nameEn: string;
  code: string;
  level: string;
  academicLevel?: string;
  semester: string;
  department?: string;
  creditHours?: number;
  prerequisites?: string[];
  coRequisites?: string[];
  equivalentCourses?: string[];
  offeredTerms?: string[];
  type?: CourseType;
  recommendedSemester?: number;
  minimumGpa?: number;
  registrationPriority?: number;
  description?: string;
  curricula?: CourseCurriculum[];
  syllabusPdfUrl?: string;
  syllabusPdfName?: string;
  syllabusUpdatedAt?: string;
  doctorId?: string | null;
  doctorIds?: string[];
  doctorName?: string;
  doctorNameAr?: string;
  doctors?: Array<{ _id: string; name: string; nameAr?: string }>;
  teachingAssistantIds?: string[];
  teachingAssistants?: Array<{ _id: string; name: string; nameAr?: string; staffType?: string; titlePrefix?: string }>;
  coverImageUrl?: string;
  isActive: boolean;
}

const courseImportColumns = [
  'courseCode',
  'courseName',
  'courseNameAr',
  'courseNameEn',
  'level',
  'semester',
  'department',
  'creditHours',
  'type',
  'prerequisites',
  'coRequisites',
  'equivalentCourses',
  'offeredTerms',
  'recommendedSemester',
  'minimumGpa',
  'registrationPriority',
  'description',
  'programCurricula',
];

/* ─── Course Form Dialog (Reusable for Add/Edit) ─────── */
interface CourseFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'add' | 'edit';
  initialValues?: Partial<Course>;
  onSubmit: (
    data: Omit<Course, '_id' | 'isActive'> & {
      isActive: boolean;
      syllabusFile?: File | null;
      coverImageFile?: File | null;
      removeSyllabus?: boolean;
      removeCover?: boolean;
    },
  ) => Promise<void>;
  t: ReturnType<typeof useTranslations>;
  tCommon: ReturnType<typeof useTranslations>;
  canManageBook?: boolean;
}

const MAX_COURSE_FILE_SIZE_BYTES = COURSE_BOOK_MAX_BYTES;
const MAX_COVER_FILE_SIZE_BYTES = 4 * 1024 * 1024;

function CourseFormDialog({
  open,
  onOpenChange,
  mode,
  initialValues = {},
  onSubmit,
  t,
  tCommon,
  canManageBook = true,
}: CourseFormDialogProps) {
  const [name, setName] = useState(initialValues.name || '');
  const [nameAr, setNameAr] = useState(initialValues.nameAr || initialValues.name || '');
  const [nameEn, setNameEn] = useState(initialValues.nameEn || initialValues.name || '');
  const [code, setCode] = useState(initialValues.code || '');
  const [level, setLevel] = useState(initialValues.level || '1');
  const [semester, setSemester] = useState(initialValues.semester || 'first');
  const [creditHours, setCreditHours] = useState(initialValues.creditHours || 3);
  const [department, setDepartment] = useState(initialValues.department || '');
  const [placements, setPlacements] = useState<CourseCurriculum[]>(initialValues.code ? getCourseCurricula(initialValues as Course) : []);
  const [prerequisites, setPrerequisites] = useState((initialValues.prerequisites || []).join(', '));
  const [courseType, setCourseType] = useState<CourseType>(initialValues.type || 'required');
  const [isActive, setIsActive] = useState(initialValues.isActive ?? true);
  const [syllabusFile, setSyllabusFile] = useState<File | null>(null);
  const [coverImageFile, setCoverImageFile] = useState<File | null>(null);
  const [removeSyllabus, setRemoveSyllabus] = useState(false);
  const [removeCover, setRemoveCover] = useState(false);
  const [currentSyllabusUrl, setCurrentSyllabusUrl] = useState(initialValues.syllabusPdfUrl || '');
  const [currentSyllabusName, setCurrentSyllabusName] = useState(initialValues.syllabusPdfName || '');
  const [doctorIds, setDoctorIds] = useState<string[]>(() => getCourseStaffIds(initialValues).doctorIds);
  const [teachingAssistantIds, setTeachingAssistantIds] = useState<string[]>(() => getCourseStaffIds(initialValues).teachingAssistantIds);
  const [coverImageUrl, setCoverImageUrl] = useState(initialValues.coverImageUrl || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const params = useParams();
  const locale = (params?.locale as string) || 'ar';

  const staffQuery = useQuery({
    queryKey: ['staff-options-for-courses'],
    queryFn: () => listStaff({ page: 1, limit: 100, status: 'active' }),
    staleTime: 5 * 60 * 1000,
  });

  const staffMembers = React.useMemo(() => staffQuery.data?.items ?? [], [staffQuery.data?.items]);

  const doctorsList = React.useMemo(() => {
    const docs = staffMembers.filter((s) => s.staffType === 'doctor');
    return docs.length > 0 ? docs : staffMembers;
  }, [staffMembers]);

  const teachingAssistantsList = React.useMemo(() => {
    const tas = staffMembers.filter(
      (s) => ['teaching_assistant', 'assistant', 'assistant_lecturer'].includes(s.staffType || ''),
    );
    return tas.length > 0 ? tas : staffMembers;
  }, [staffMembers]);

  const [prevOpen, setPrevOpen] = useState(open);
  const [prevName, setPrevName] = useState(initialValues.name);
  const [prevCode, setPrevCode] = useState(initialValues.code);
  const [prevLevel, setPrevLevel] = useState(initialValues.level);
  const [prevSemester, setPrevSemester] = useState(initialValues.semester);
  const [prevCreditHours, setPrevCreditHours] = useState(initialValues.creditHours);
  const [prevDepartment, setPrevDepartment] = useState(initialValues.department);
  const [prevCurricula, setPrevCurricula] = useState(initialValues.curricula?.map((item) => `${item.department}:${item.academicLevel}:${item.semester}:${item.type}`).join('|'));
  const [prevPrerequisites, setPrevPrerequisites] = useState(initialValues.prerequisites?.join(', '));
  const [prevCourseType, setPrevCourseType] = useState(initialValues.type);
  const [prevIsActive, setPrevIsActive] = useState(initialValues.isActive);
  const [prevSyllabusUrl, setPrevSyllabusUrl] = useState(initialValues.syllabusPdfUrl);
  const [prevDoctorIds, setPrevDoctorIds] = useState<string>(
    getCourseStaffIds(initialValues).doctorIds.join(','),
  );
  const [prevTeachingAssistantIds, setPrevTeachingAssistantIds] = useState(
    getCourseStaffIds(initialValues).teachingAssistantIds.join(','),
  );
  const [prevCoverImageUrl, setPrevCoverImageUrl] = useState(initialValues.coverImageUrl);

  if (
    open !== prevOpen ||
    initialValues.name !== prevName ||
    initialValues.code !== prevCode ||
    initialValues.level !== prevLevel ||
    initialValues.semester !== prevSemester ||
    initialValues.creditHours !== prevCreditHours ||
    initialValues.department !== prevDepartment ||
    initialValues.curricula?.map((item) => `${item.department}:${item.academicLevel}:${item.semester}:${item.type}`).join('|') !== prevCurricula ||
    initialValues.prerequisites?.join(', ') !== prevPrerequisites ||
    initialValues.type !== prevCourseType ||
    initialValues.isActive !== prevIsActive ||
    initialValues.syllabusPdfUrl !== prevSyllabusUrl ||
    getCourseStaffIds(initialValues).doctorIds.join(',') !== prevDoctorIds ||
    getCourseStaffIds(initialValues).teachingAssistantIds.join(',') !== prevTeachingAssistantIds ||
    initialValues.coverImageUrl !== prevCoverImageUrl
  ) {
    setPrevOpen(open);
    setPrevName(initialValues.name);
    setPrevCode(initialValues.code);
    setPrevLevel(initialValues.level);
    setPrevSemester(initialValues.semester);
    setPrevCreditHours(initialValues.creditHours);
    setPrevDepartment(initialValues.department);
    setPrevCurricula(initialValues.curricula?.map((item) => `${item.department}:${item.academicLevel}:${item.semester}:${item.type}`).join('|'));
    setPrevPrerequisites(initialValues.prerequisites?.join(', '));
    setPrevCourseType(initialValues.type);
    setPrevIsActive(initialValues.isActive);
    setPrevSyllabusUrl(initialValues.syllabusPdfUrl);
    setPrevDoctorIds(getCourseStaffIds(initialValues).doctorIds.join(','));
    setPrevTeachingAssistantIds(getCourseStaffIds(initialValues).teachingAssistantIds.join(','));
    setPrevCoverImageUrl(initialValues.coverImageUrl);

    if (open) {
      setName(initialValues.name || '');
      setNameAr(initialValues.nameAr || initialValues.name || '');
      setNameEn(initialValues.nameEn || initialValues.name || '');
      setCode(initialValues.code || '');
      setLevel(initialValues.level || '1');
      setSemester(initialValues.semester || 'first');
      setCreditHours(initialValues.creditHours || 3);
      setDepartment(initialValues.department || '');
      setPlacements(initialValues.code ? getCourseCurricula(initialValues as Course) : []);
      setPrerequisites((initialValues.prerequisites || []).join(', '));
      setCourseType(initialValues.type || 'required');
      setIsActive(initialValues.isActive ?? true);
      const assignments = getCourseStaffIds(initialValues);
      setDoctorIds(assignments.doctorIds);
      setTeachingAssistantIds(assignments.teachingAssistantIds);
      setCoverImageUrl(initialValues.coverImageUrl || '');
      setSyllabusFile(null);
      setCoverImageFile(null);
      setRemoveSyllabus(false);
      setRemoveCover(false);
      setCurrentSyllabusUrl(initialValues.syllabusPdfUrl || '');
      setCurrentSyllabusName(initialValues.syllabusPdfName || '');
      setError('');
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (syllabusFile && syllabusFile.size > MAX_COURSE_FILE_SIZE_BYTES) {
      setError(
        locale === 'ar'
          ? `حجم ملف المنهج (${(syllabusFile.size / (1024 * 1024)).toFixed(1)} ميجابايت) يتجاوز الحد الأقصى المسموح به (100 ميجابايت).`
          : `Syllabus PDF file size (${(syllabusFile.size / (1024 * 1024)).toFixed(1)} MB) exceeds 100 MiB limit.`,
      );
      return;
    }

    if (coverImageFile && coverImageFile.size > MAX_COVER_FILE_SIZE_BYTES) {
      setError(
        locale === 'ar'
          ? `حجم صورة الغلاف (${(coverImageFile.size / (1024 * 1024)).toFixed(1)} ميجابايت) يتجاوز الحد الأقصى المسموح به (4 ميجابايت).`
          : `Cover image file size (${(coverImageFile.size / (1024 * 1024)).toFixed(1)} MB) exceeds 4MB limit.`,
      );
      return;
    }

    if (new Set(placements.map((item) => item.department)).size !== placements.length) {
      toast.error(t('placements.invalid'));
      return;
    }
    setLoading(true);
    try {
      await onSubmit({
        name,
        nameAr,
        nameEn,
        code,
        level: placements[0]?.academicLevel ?? level,
        academicLevel: placements[0]?.academicLevel ?? level,
        semester: placements[0]?.semester ?? semester,
        creditHours,
        department,
        curricula: serializeCourseCurricula(placements),
        prerequisites: prerequisites
          .split(',')
          .map((item) => item.trim().toUpperCase())
          .filter(Boolean),
        type: courseType,
        isActive,
        syllabusFile: removeSyllabus ? null : syllabusFile,
        coverImageFile: removeCover ? null : coverImageFile,
        ...(!initialValues._id || doctorIds.join(',') !== getCourseStaffIds(initialValues).doctorIds.join(',')
          ? { doctorId: doctorIds[0] || null, doctorIds: doctorIds.slice(0, 2) } : {}),
        ...(!initialValues._id || teachingAssistantIds.join(',') !== getCourseStaffIds(initialValues).teachingAssistantIds.join(',')
          ? { teachingAssistantIds } : {}),
        coverImageUrl: removeCover ? '' : (coverImageUrl.trim() || undefined),
        removeSyllabus,
        removeCover,
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
      <DialogContent className="glass max-h-[90vh] max-w-2xl sm:max-w-2xl overflow-y-auto rounded-2xl border border-white/10 p-5 sm:p-6">
        <DialogHeader className="border-b border-border pb-4">
          <DialogTitle className="text-foreground text-lg font-bold">
            {mode === 'add' ? t('addCourse') : t('editCourse')}
          </DialogTitle>
        </DialogHeader>

        {error && (
          <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          {/* Section 1: Course Names */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted">اسم المادة بالعربية *</label>
              <Input type="text" dir="rtl" required value={nameAr} onChange={(e) => { setNameAr(e.target.value); setName(e.target.value || nameEn); }} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted">Course name in English *</label>
              <Input type="text" dir="ltr" required value={nameEn} onChange={(e) => { setNameEn(e.target.value); if (!nameAr) setName(e.target.value); }} />
            </div>
          </div>

          {/* Section 2: Code and Credit Hours */}
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

          {/* Section 3: Level and Semester */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted">{t('level')} *</label>
              <Select value={level} onValueChange={setLevel}>
                <SelectTrigger className="bg-secondary/50 border-border"><SelectValue /></SelectTrigger>
                <SelectContent dir={locale === 'ar' ? 'rtl' : 'ltr'}>
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
                <SelectContent dir={locale === 'ar' ? 'rtl' : 'ltr'}>
                  <SelectItem value="first">{t('semester_first')}</SelectItem>
                  <SelectItem value="second">{t('semester_second')}</SelectItem>
                  <SelectItem value="summer">{t('semester_summer')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Section 4: Department and Course Doctor */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted">{t('department')}</label>
              <Input type="text" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder={locale === 'ar' ? 'شعبة عامة أو نظم معلومات الأعمال أو المحاسبة والمراجعة' : 'General Division, Business Information Systems, Accounting and Auditing'} />
            </div>
            {/* Course Doctors Section (Up to 2 doctors) */}
            <div className="space-y-1.5 sm:col-span-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-muted">
                  {locale === 'ar' ? 'أساتذة المقرر (بحد أقصى دكتورين)' : 'Course Doctors (Max 2)'}
                </label>
                <span className="text-[11px] font-medium text-muted-foreground">
                  {doctorIds.length}/2
                </span>
              </div>
              <div className="flex flex-col gap-2">
                <Select
                  value=""
                  disabled={doctorIds.length >= 2}
                  onValueChange={(val) => {
                    if (val && !doctorIds.includes(val) && doctorIds.length < 2) {
                      setDoctorIds((prev) => [...prev, val]);
                    }
                  }}
                >
                  <SelectTrigger className="bg-secondary/50 border-border" disabled={doctorIds.length >= 2}>
                    <SelectValue
                      placeholder={
                        doctorIds.length >= 2
                          ? (locale === 'ar' ? 'تم اختيار دكتورين كحد أقصى للمقرر' : 'Maximum 2 doctors reached')
                          : (locale === 'ar' ? 'اختر أستاذاً لإضافته للمقرر...' : 'Select doctor to assign...')
                      }
                    />
                  </SelectTrigger>
                  <SelectContent dir={locale === 'ar' ? 'rtl' : 'ltr'}>
                    {doctorsList
                      .filter((doc) => !doctorIds.includes(doc._id))
                      .map((staff) => (
                        <SelectItem key={staff._id} value={staff._id}>
                          {formatStaffDisplayName(
                            { ...staff, staffType: 'doctor' },
                            locale,
                          )}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>

                {doctorIds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {doctorIds.map((id) => {
                      const staff = staffMembers.find((s) => s._id === id);
                      const fallbackDoc = initialValues.doctors?.find(
                        (d) => d._id === id,
                      );
                      const cleanName = staff
                        ? getCleanStaffName(staff, locale)
                        : fallbackDoc
                          ? getCleanStaffName(fallbackDoc, locale)
                          : id;
                      return (
                        <span
                          key={id}
                          className="inline-flex items-center gap-1.5 rounded-squircle border border-teal-500/40 bg-teal-500/10 px-2.5 py-1 text-xs font-medium text-foreground"
                        >
                          <span className="font-semibold text-teal-600 dark:text-teal-400">
                            {getStaffPrefix('doctor', locale)}
                          </span>
                          <span>{cleanName}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setDoctorIds((prev) => prev.filter((item) => item !== id))
                            }
                            className="rounded p-0.5 text-muted-foreground hover:bg-danger/20 hover:text-danger cursor-pointer transition-colors"
                            title={locale === 'ar' ? 'إزالة' : 'Remove'}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Teaching Assistants Section */}
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-semibold text-muted">
                {locale === 'ar' ? 'الهيئة المعاونة / المعيدون (Teaching Assistants)' : 'Teaching Assistants'}
              </label>
              <div className="flex flex-col gap-2">
                <Select
                  value=""
                  onValueChange={(val) => {
                    if (val && !teachingAssistantIds.includes(val)) {
                      setTeachingAssistantIds((prev) => [...prev, val]);
                    }
                  }}
                >
                  <SelectTrigger className="bg-secondary/50 border-border">
                    <SelectValue placeholder={locale === 'ar' ? 'اختر معيداً لإضافته للمقرر...' : 'Select teaching assistant to add...'} />
                  </SelectTrigger>
                  <SelectContent dir={locale === 'ar' ? 'rtl' : 'ltr'}>
                    {teachingAssistantsList
                      .filter((ta) => !teachingAssistantIds.includes(ta._id))
                      .map((ta) => (
                        <SelectItem key={ta._id} value={ta._id}>
                          {formatStaffDisplayName(
                            {
                              ...ta,
                              staffType:
                                ta.staffType || 'teaching_assistant',
                            },
                            locale,
                          )}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>

                {teachingAssistantIds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {teachingAssistantIds.map((id) => {
                      const staff = staffMembers.find((s) => s._id === id);
                      const fallbackTa = initialValues.teachingAssistants?.find(
                        (t) => t._id === id,
                      );
                      const taType =
                        staff?.staffType ||
                        fallbackTa?.staffType ||
                        'teaching_assistant';
                      const cleanName = staff
                        ? getCleanStaffName(staff, locale)
                        : fallbackTa
                          ? getCleanStaffName(fallbackTa, locale)
                          : id;
                      const prefix = getStaffPrefix(taType, locale);
                      return (
                        <span
                          key={id}
                          className="inline-flex items-center gap-1.5 rounded-squircle border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-foreground"
                        >
                          {prefix && (
                            <span className="font-semibold text-primary">
                              {prefix}
                            </span>
                          )}
                          <span>{cleanName}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setTeachingAssistantIds((prev) => prev.filter((item) => item !== id))
                            }
                            className="rounded p-0.5 text-muted-foreground hover:bg-danger/20 hover:text-danger cursor-pointer transition-colors"
                            title={locale === 'ar' ? 'إزالة' : 'Remove'}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section 5: Prerequisites and Course Type */}
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
              <Select value={courseType} onValueChange={(value) => setCourseType(value as CourseType)}>
                <SelectTrigger className="bg-secondary/50 border-border"><SelectValue /></SelectTrigger>
                <SelectContent dir={locale === 'ar' ? 'rtl' : 'ltr'}>
                  <SelectItem value="required">Required</SelectItem>
                  <SelectItem value="elective">Elective</SelectItem>
                  <SelectItem value="university_req">University requirement</SelectItem>
                  <SelectItem value="institute_req">Institute requirement</SelectItem>
                  <SelectItem value="specialization_req">Specialization requirement</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <CoursePlacementsEditor value={placements} onChange={setPlacements} locale={locale} />

          {/* Course Curriculum & Cover Image Media Section (Only for Doctor or Admin, hidden for Teaching Assistant) */}
          {canManageBook ? (
            <div className="space-y-3 rounded-xl border border-border/80 bg-secondary/15 p-3.5 text-start">
              <div className="flex items-center gap-2 border-b border-border/60 pb-2">
                <BookOpen className="h-4 w-4 text-primary" />
                <h4 className="text-xs font-bold text-foreground">
                  {locale === 'ar' ? 'ملحقات ومحتوى المادة الدراسية' : 'Course Curriculum & Media Attachments'}
                </h4>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {/* Card 1: Curriculum / Syllabus (PDF) */}
              <div className="space-y-2.5 rounded-xl border border-border/80 bg-background/60 p-3 text-start flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-1 pb-1">
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                      <FileText className="h-4 w-4 text-primary" />
                      <span>{locale === 'ar' ? 'منهج المقرر (PDF)' : 'Syllabus (PDF)'}</span>
                    </label>
                    {currentSyllabusUrl && !removeSyllabus && (
                      <div className="flex items-center gap-2">
                        <a
                          href={initialValues._id ? `${apiBaseUrl}/courses/${initialValues._id}/syllabus/download` : currentSyllabusUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
                          title={locale === 'ar' ? 'معاينة المنهج' : 'View Syllabus'}
                        >
                          <Eye className="h-3 w-3" />
                          <span>{locale === 'ar' ? 'معاينة' : 'View'}</span>
                        </a>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setRemoveSyllabus(true);
                            setSyllabusFile(null);
                          }}
                          className="h-6 px-2 text-[11px] text-rose-400 border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-300 rounded-squircle flex items-center gap-1"
                        >
                          <Trash2 className="h-3 w-3" />
                          <span>{locale === 'ar' ? 'حذف' : 'Remove'}</span>
                        </Button>
                      </div>
                    )}
                  </div>

                  {removeSyllabus ? (
                    <div className="my-2 rounded-lg bg-amber-500/10 border border-amber-500/20 p-2 text-xs text-amber-400 flex items-center justify-between">
                      <span>{locale === 'ar' ? '⚠️ سيتم إزالة ملف الـ PDF عند الحفظ' : '⚠️ Syllabus PDF will be removed on save'}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setRemoveSyllabus(false);
                          setCurrentSyllabusUrl(initialValues.syllabusPdfUrl || '');
                          setCurrentSyllabusName(initialValues.syllabusPdfName || '');
                        }}
                        className="text-primary underline text-xs font-semibold cursor-pointer"
                      >
                        {locale === 'ar' ? 'تراجع' : 'Undo'}
                      </button>
                    </div>
                  ) : (
                    currentSyllabusName && !syllabusFile && (
                      <p className="font-mono text-[11px] text-muted-foreground truncate mb-1">
                        📄 {currentSyllabusName}
                      </p>
                    )
                  )}

                  <Input
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        if (file.size > MAX_COURSE_FILE_SIZE_BYTES) {
                          setError(
                            locale === 'ar'
                              ? `حجم الملف (${(file.size / (1024 * 1024)).toFixed(1)} ميجابايت) يتجاوز الحد الأقصى (100 ميجابايت).`
                              : `File size (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds 100 MiB limit.`,
                          );
                          e.target.value = '';
                          setSyllabusFile(null);
                          return;
                        }
                        setError('');
                        setSyllabusFile(file);
                        setRemoveSyllabus(false);
                      }
                    }}
                    className="text-xs file:mr-2 file:rounded-squircle file:border-0 file:bg-primary/10 file:px-2.5 file:py-1 file:text-xs file:font-semibold file:text-primary hover:file:bg-primary/20"
                  />
                  {syllabusFile && (
                    <p className="text-[11px] font-medium text-emerald-400 mt-1">
                      ✓ {syllabusFile.name}
                    </p>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground/80 pt-1">
                  {locale === 'ar' ? 'الحد الأقصى: 100 ميجابايت (PDF فقط)' : 'Max size: 100 MiB (PDF only)'}
                </p>
              </div>

              {/* Card 2: Course Book Cover */}
              <div className="space-y-2.5 rounded-xl border border-border/80 bg-background/60 p-3 text-start flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-1 pb-1">
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                      <BookOpen className="h-4 w-4 text-purple-400" />
                      <span>{locale === 'ar' ? 'غلاف الكتاب / المقرر' : 'Book Cover'}</span>
                    </label>
                    {coverImageUrl && !removeCover && (
                      <div className="flex items-center gap-2">
                        <a
                          href={coverImageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-medium text-purple-400 hover:underline flex items-center gap-1"
                          title={locale === 'ar' ? 'معاينة الغلاف' : 'View Cover'}
                        >
                          <Eye className="h-3 w-3" />
                          <span>{locale === 'ar' ? 'معاينة' : 'View'}</span>
                        </a>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setRemoveCover(true);
                            setCoverImageFile(null);
                            setCoverImageUrl('');
                          }}
                          className="h-6 px-2 text-[11px] text-rose-400 border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-300 rounded-squircle flex items-center gap-1"
                        >
                          <Trash2 className="h-3 w-3" />
                          <span>{locale === 'ar' ? 'حذف' : 'Remove'}</span>
                        </Button>
                      </div>
                    )}
                  </div>

                  {removeCover ? (
                    <div className="my-2 rounded-lg bg-amber-500/10 border border-amber-500/20 p-2 text-xs text-amber-400 flex items-center justify-between">
                      <span>{locale === 'ar' ? '⚠️ سيتم إزالة صورة الغلاف عند الحفظ' : '⚠️ Cover will be removed on save'}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setRemoveCover(false);
                          setCoverImageUrl(initialValues.coverImageUrl || '');
                        }}
                        className="text-primary underline text-xs font-semibold cursor-pointer"
                      >
                        {locale === 'ar' ? 'تراجع' : 'Undo'}
                      </button>
                    </div>
                  ) : null}

                  {coverImageUrl && !coverImageFile && !removeCover && (
                    <div className="mb-2 flex items-center justify-between gap-2.5 rounded-lg border border-border/60 bg-card/80 px-2.5 py-1.5">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20">
                          <BookOpen className="h-3.5 w-3.5" />
                        </div>
                        <span className="text-[11px] font-medium text-foreground">
                          {locale === 'ar' ? 'تم حفظ غلاف للمقرر' : 'Cover image attached'}
                        </span>
                      </div>
                      <a
                        href={coverImageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-1"
                      >
                        <Eye className="h-3 w-3" />
                        <span>{locale === 'ar' ? 'معاينة' : 'Preview'}</span>
                      </a>
                    </div>
                  )}

                  <Input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        if (file.size > MAX_COVER_FILE_SIZE_BYTES) {
                          setError(
                            locale === 'ar'
                              ? `حجم الصورة (${(file.size / (1024 * 1024)).toFixed(1)} ميجابايت) يتجاوز الحد الأقصى (4 ميجابايت).`
                              : `Image size (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds 4 MiB limit.`,
                          );
                          e.target.value = '';
                          setCoverImageFile(null);
                          return;
                        }
                        setError('');
                        setCoverImageFile(file);
                        setRemoveCover(false);
                      }
                    }}
                    className="text-xs file:mr-2 file:rounded-squircle file:border-0 file:bg-primary/10 file:px-2.5 file:py-1 file:text-xs file:font-semibold file:text-primary hover:file:bg-primary/20"
                  />
                  {coverImageFile && (
                    <p className="text-[11px] font-medium text-emerald-400 mt-1">
                      ✓ {coverImageFile.name}
                    </p>
                  )}

                  <div className="pt-1.5">
                    <Input
                      type="url"
                      dir="ltr"
                      value={coverImageUrl}
                      onChange={(e) => {
                        setCoverImageUrl(e.target.value);
                        setRemoveCover(false);
                      }}
                      placeholder="https://... (Optional URL)"
                      className="h-7 text-[11px] font-mono"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground/80 pt-1 leading-snug">
                  {locale === 'ar'
                    ? '💡 اتركها فارغة لتوليد الغلاف تلقائياً من الصفحة الأولى للـ PDF'
                    : '💡 Leave empty to auto-derive cover from page 1 of syllabus PDF'}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-border/60 bg-secondary/20 p-3 text-xs text-muted-foreground flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-muted-foreground shrink-0" />
            <span>
              {locale === 'ar'
                ? '💡 رفع وتعديل منهج وغلاف المقرر مخصص لأستاذ المادة والإدارة. يمكن للمعيدين رفع السكاشن من قائمة المحاضرات والسكاشن.'
                : '💡 Course syllabus and book cover uploads are reserved for course doctors and administration. Teaching assistants can manage sections from the Lectures & Sections menu.'}
            </span>
          </div>
        )}

          <div className="flex items-center gap-2 pt-1">
            <input type="checkbox" id="isActiveCourse" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 rounded border-input-border bg-input text-primary focus:ring-primary cursor-pointer" />
            <label htmlFor="isActiveCourse" className="text-sm font-semibold text-foreground cursor-pointer">{t('isActive')}</label>
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

/* ─── Direct Course Syllabus PDF Upload Dialog ───────── */
interface UploadCoursePdfDialogProps {
  course: Course | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: string;
  onSuccess: () => void;
}

function UploadCoursePdfDialog({
  course,
  open,
  onOpenChange,
  locale,
  onSuccess,
}: UploadCoursePdfDialogProps) {
  const isAr = locale === 'ar';
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const startBookUpload = useStartBookUpload();
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setFile(null);
      setError('');
      setLoading(false);
      setRemoving(false);
    }
  }

  if (!course) return null;

  const handleUpload = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError(isAr ? 'يرجى اختيار ملف PDF لرفعه' : 'Please select a PDF file to upload');
      return;
    }
    if (file.size > MAX_COURSE_FILE_SIZE_BYTES) {
      setError(
        isAr
          ? `حجم الملف (${(file.size / (1024 * 1024)).toFixed(1)} ميجابايت) يتجاوز الحد الأقصى المسموح به (100 ميجابايت).`
          : `File size (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds 100 MiB limit.`,
      );
      return;
    }

    setLoading(true);
    setError('');
    try {
      startBookUpload(course._id, `${isAr ? 'كتاب المقرر' : 'Course book'} · ${course.code}`, file);
      setFile(null);
      onOpenChange(false);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, isAr ? 'فشل رفع ملف المنهج' : 'Failed to upload syllabus PDF'));
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async () => {
    setRemoving(true);
    setError('');
    try {
      await api.delete(`/admin/courses/${course._id}/syllabus`);
      toast.success(
        isAr
          ? `تم حذف ملف المنهج لمقرر ${course.code} بنجاح`
          : `Syllabus removed successfully for ${course.code}`,
      );
      onSuccess();
      onOpenChange(false);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, isAr ? 'فشل حذف ملف المنهج' : 'Failed to remove syllabus'));
    } finally {
      setRemoving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass max-w-lg rounded-2xl border border-white/10 p-5 sm:p-6 text-start">
        <DialogHeader className="border-b border-border/80 pb-3 text-start">
          <DialogTitle className="flex items-center gap-2 text-base font-bold text-foreground">
            <FileText className="h-5 w-5 text-primary" />
            <span>
              {isAr ? 'منهج المقرر الدراسي (PDF):' : 'Course Syllabus (PDF):'}{' '}
              <span className="text-primary font-mono">{course.code}</span>
            </span>
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {isAr ? course.nameAr || course.name : course.nameEn || course.name}
          </p>
        </DialogHeader>

        {error && (
          <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-xs text-danger">
            {error}
          </div>
        )}

        <form onSubmit={handleUpload} className="space-y-4 pt-3">
          {/* Current status */}
          <div className="rounded-xl border border-border/70 bg-secondary/20 p-3 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-muted-foreground">
                {isAr ? 'الحالة الحالية:' : 'Current Status:'}
              </span>
              {course.syllabusPdfUrl ? (
                <span className="inline-flex items-center gap-1.5 font-bold text-emerald-400">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  {isAr ? 'تم رفع المنهج مسبقاً' : 'Syllabus Attached'}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/50" />
                  {isAr ? 'لا يوجد ملف مرفوع حالياً' : 'No syllabus attached'}
                </span>
              )}
            </div>

            {course.syllabusPdfUrl && (
              <div className="flex items-center justify-between pt-1 border-t border-border/50">
                <span className="font-mono text-[11px] text-muted-foreground truncate max-w-60">
                  📄 {course.syllabusPdfName || `${course.code}_syllabus.pdf`}
                </span>
                <div className="flex items-center gap-2">
                  <a
                    href={`${apiBaseUrl}/courses/${course._id}/syllabus/download`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                  >
                    <Eye className="h-3 w-3" />
                    <span>{isAr ? 'معاينة' : 'Preview'}</span>
                  </a>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={removing}
                    onClick={handleRemove}
                    className="h-6 px-2 text-[11px] text-danger hover:bg-danger/10 hover:text-danger rounded-squircle"
                  >
                    {removing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                    <span>{isAr ? 'حذف' : 'Remove'}</span>
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Upload input area */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground">
              {isAr ? 'اختيار ملف PDF جديد:' : 'Select New PDF File:'}
            </label>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border/80 bg-background/50 p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all"
            >
              <UploadCloud className="h-8 w-8 text-primary/70 mb-2" />
              <p className="text-xs font-semibold text-foreground">
                {file ? file.name : (isAr ? 'اضغط لاختيار ملف المنهج (PDF)' : 'Click to select syllabus PDF')}
              </p>
              {file ? (
                <p className="text-[11px] text-emerald-400 font-mono mt-1">
                  {(file.size / (1024 * 1024)).toFixed(2)} MB
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground mt-1">
                  {isAr ? 'أقصى حجم مسموح به: 100 ميجابايت' : 'Maximum file size: 100 MiB'}
                </p>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    if (f.size > MAX_COURSE_FILE_SIZE_BYTES) {
                      setError(
                        isAr
                          ? `حجم الملف (${(f.size / (1024 * 1024)).toFixed(1)} ميجابايت) يتجاوز الحد الأقصى (100 ميجابايت).`
                          : `File size exceeds 100 MiB limit.`,
                      );
                      setFile(null);
                      return;
                    }
                    setError('');
                    setFile(f);
                  }
                }}
              />
            </div>
          </div>

          <DialogFooter className="mt-4 gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
              className="rounded-squircle text-xs"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button
              type="submit"
              disabled={loading || !file}
              className="flex items-center gap-2 bg-primary font-semibold text-white hover:bg-primary-hover rounded-squircle text-xs"
            >
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>{isAr ? 'رفع وحفظ المنهج' : 'Upload & Save Syllabus'}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Main Page ───────────────────────────────────────── */
function CoursesPageContent() {
  const startBookUpload = useStartBookUpload();
  const router = useRouter();
  const t = useTranslations('courses');
  const tCommon = useTranslations('common');
  const params = useParams();
  const locale = params.locale as string;
  const queryClient = useQueryClient();

  const {
    search, filters: { activeLevel, activeSemester, department: activeDepartment },
    page, limit, setPage, selectedKeys, setSelectedKeys, setFilter, setSearch,
  } = useTableState({ defaultFilters: { activeLevel: 'all', activeSemester: 'all', department: 'all' }, defaultLimit: 10 });
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const staffType = user?.staffType;
  const isDoctor = user?.role === 'staff' && staffType === 'doctor';
  const canManageBook = isAdmin || isDoctor;
  const canWriteCourses = isAdmin || Boolean(user?.permissions?.includes('courses.write'));
  const canUploadCourses = isAdmin || Boolean(user?.permissions?.includes('uploads.import'));
  const canCreateQuiz = isAdmin || Boolean(user?.permissions?.includes('quizzes.write')) || Boolean(user?.permissions?.includes('quizzes.create'));
  const canReadQuizzes = isAdmin || Boolean(user?.permissions?.includes('quizzes.read'));

  const [activeMainTab, setActiveMainTab] = useState<'courses' | 'materials'>('courses');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [selectedCourseForPdf, setSelectedCourseForPdf] = useState<Course | null>(null);
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [selectedCourseForMaterials, setSelectedCourseForMaterials] = useState<Course | null>(null);
  const [isMaterialsOpen, setIsMaterialsOpen] = useState(false);
  const [courseToDelete, setCourseToDelete] = useState<Course | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isEnrollmentDialogOpen, setIsEnrollmentDialogOpen] = useState(false);
  const [enrollmentCourseId, setEnrollmentCourseId] = useState<string | null>(null);
  const [selectedEnrolledCourse, setSelectedEnrolledCourse] = useState<Course | null>(null);
  const [isEnrolledStudentsOpen, setIsEnrolledStudentsOpen] = useState(false);

  const coursesQuery = useQuery({
    queryKey: ['courses', search, activeLevel, activeSemester, activeDepartment, page, limit, user?._id],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, limit };
      if (search) params.search = search;
      if (activeLevel !== 'all') params.level = activeLevel;
      if (activeSemester !== 'all') params.semester = activeSemester;
      if (activeDepartment !== 'all') params.department = activeDepartment;
      if (isDoctor && user?._id) params.doctorId = user._id;
      const res = await api.get<PaginatedResponse<Course>>('/admin/courses', { params });
      return res.data;
    },
  });

  const courses = coursesQuery.data?.items || [];
  const total = coursesQuery.data?.total || 0;
  const totalPages = coursesQuery.data?.totalPages || 1;
  const fromRow = total === 0 ? 0 : (page - 1) * limit + 1;
  const toRow = Math.min(page * limit, total);

  const handleAdd = async (
    data: Omit<Course, '_id' | 'isActive'> & {
      isActive: boolean;
      syllabusFile?: File | null;
      coverImageFile?: File | null;
    },
  ) => {
    const { syllabusFile, coverImageFile, ...coursePayload } = data;
    const res = await api.post<Course, { data: Course } | Course>('/admin/courses', coursePayload);
    const newCourseId = 'data' in res ? res.data._id : res._id;
    if (newCourseId) {
      if (syllabusFile) {
        startBookUpload(newCourseId, `${locale === 'ar' ? 'كتاب المقرر' : 'Course book'} · ${coursePayload.code}`, syllabusFile);
      }
      if (coverImageFile) {
        try {
          const fd = new FormData();
          fd.append('file', coverImageFile);
          await api.post(`/admin/courses/${newCourseId}/cover-image`, fd);
        } catch {
          toast.error(
            locale === 'ar'
              ? 'تم إضافة المادة ولكن فشل رفع صورة الغلاف'
              : 'Course added, but cover image upload failed',
          );
        }
      }
    }
    toast.success(
      locale === 'ar' ? 'تم إضافة المادة بنجاح' : 'Course added successfully',
    );
    void queryClient.invalidateQueries({ queryKey: ['courses'] });
    void queryClient.invalidateQueries({ queryKey: ['student-syllabi'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-all-courses-for-enrollment'] });
    void queryClient.invalidateQueries({ queryKey: ['staff-assigned-courses'] });
    void queryClient.invalidateQueries({ queryKey: ['quiz-course-options'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-staff', 'courses'] });
  };

  const handleEdit = async (
    data: Omit<Course, '_id' | 'isActive'> & {
      isActive: boolean;
      syllabusFile?: File | null;
      coverImageFile?: File | null;
      removeSyllabus?: boolean;
      removeCover?: boolean;
    },
  ) => {
    if (!selectedCourse) return;
    const { syllabusFile, coverImageFile, removeSyllabus, removeCover, ...coursePayload } = data;

    const updatePayload = {
      ...coursePayload,
      ...(removeSyllabus ? { syllabusPdfUrl: null, syllabusPdfName: null } : {}),
      ...(removeCover ? { coverImageUrl: null } : {}),
    };

    await api.patch(`/admin/courses/${selectedCourse._id}`, updatePayload);

    if (removeSyllabus) {
      try {
        await api.delete(`/admin/courses/${selectedCourse._id}/syllabus`);
      } catch {
        // null payload already handled deletion
      }
    } else if (syllabusFile) {
      startBookUpload(selectedCourse._id, `${locale === 'ar' ? 'كتاب المقرر' : 'Course book'} · ${selectedCourse.code}`, syllabusFile);
    }

    if (removeCover) {
      try {
        await api.delete(`/admin/courses/${selectedCourse._id}/cover-image`);
      } catch {
        // null payload already handled deletion
      }
    } else if (coverImageFile) {
      try {
        const fd = new FormData();
        fd.append('file', coverImageFile);
        await api.post(`/admin/courses/${selectedCourse._id}/cover-image`, fd);
      } catch {
        toast.error(
          locale === 'ar'
            ? 'تم تحديث المادة ولكن فشل رفع صورة الغلاف'
            : 'Course updated, but cover image upload failed',
        );
      }
    }

    toast.success(
      locale === 'ar' ? 'تم تحديث المادة بنجاح' : 'Course updated successfully',
    );
    void queryClient.invalidateQueries({ queryKey: ['courses'] });
    void queryClient.invalidateQueries({ queryKey: ['student-syllabi'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-all-courses-for-enrollment'] });
    void queryClient.invalidateQueries({ queryKey: ['staff-assigned-courses'] });
    void queryClient.invalidateQueries({ queryKey: ['quiz-course-options'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-staff', 'courses'] });
  };

  const handleBulkDelete = async (ids: string[]) => {
    const toastId = toast.loading(locale === 'ar' ? 'جاري حذف المواد...' : 'Deleting courses...');
    try {
      await Promise.all(ids.map((id) => api.delete(`/admin/courses/${id}`)));
      toast.success(locale === 'ar' ? 'تم حذف المواد المحددة بنجاح' : 'Selected courses deleted successfully', { id: toastId });
      setSelectedKeys([]);
      void queryClient.invalidateQueries({ queryKey: ['courses'] });
    void queryClient.invalidateQueries({ queryKey: ['student-syllabi'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-all-courses-for-enrollment'] });
    void queryClient.invalidateQueries({ queryKey: ['staff-assigned-courses'] });
    void queryClient.invalidateQueries({ queryKey: ['quiz-course-options'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-staff', 'courses'] });
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
    void queryClient.invalidateQueries({ queryKey: ['student-syllabi'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-all-courses-for-enrollment'] });
    void queryClient.invalidateQueries({ queryKey: ['staff-assigned-courses'] });
    void queryClient.invalidateQueries({ queryKey: ['quiz-course-options'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-staff', 'courses'] });
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    }
  };

  const exportCourses = async () => {
    setIsExporting(true);
    try {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (activeLevel !== 'all') params.level = activeLevel;
      if (activeSemester !== 'all') params.semester = activeSemester;
      if (activeDepartment !== 'all') params.department = activeDepartment;
      const blob = await api.get('/admin/courses/export', { params, responseType: 'blob' });
      downloadFileBlob(blob, 'courses_export.xlsx', EXCEL_MIME_TYPE);
      toast.success(locale === 'ar' ? 'تم تجهيز ملف المواد' : 'Courses export is ready');
    } catch (err) {
      toast.error(getApiErrorMessage(err, locale === 'ar' ? 'فشل تصدير المواد' : 'Failed to export courses'));
    } finally {
      setIsExporting(false);
    }
  };

  const getCourseName = (course: Course) =>
    locale === 'ar'
      ? course.nameAr || course.name
      : course.nameEn || course.name;

  /* ─── Column Definitions ──────────────────────────── */
  const columns: ColumnDef<Course>[] = [
    {
      key: 'name',
      header: t('courseName'),
      render: (course) => (
        <TableCell className="p-4 font-medium text-foreground">
          <button
            type="button"
            onClick={() => {
              setSelectedEnrolledCourse(course);
              setIsEnrolledStudentsOpen(true);
            }}
            className="flex items-center gap-2 text-start font-medium text-foreground hover:text-primary transition-colors cursor-pointer group"
            title={locale === 'ar' ? 'عرض كشف الطلاب المسجلين' : 'View enrolled students'}
          >
            <BookOpen className="h-4 w-4 shrink-0 text-muted group-hover:text-primary transition-colors" />
            <span className="group-hover:underline underline-offset-4 decoration-primary/60">
              {getCourseName(course)}
            </span>
          </button>
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
      key: 'semester',
      header: locale === 'ar' ? 'الفصل الدراسي' : 'Semester',
      render: (course) => {
        const semesterLabel = courseCurriculumSummary(course, locale);

        return (
          <TableCell className="p-4">
            <span className="inline-flex rounded-md border border-border/80 bg-surface/50 px-2.5 py-1 text-xs font-semibold text-foreground">
              {semesterLabel}
            </span>
          </TableCell>
        );
      },
    },
    {
      key: 'syllabus',
      header: locale === 'ar' ? 'المنهج (PDF)' : 'Syllabus (PDF)',
      render: (course) => (
        <TableCell className="p-4">
          {course.syllabusPdfUrl ? (
            <div className="flex items-center gap-1.5">
              <a
                href={`${apiBaseUrl}/courses/${course._id}/syllabus/download`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-squircle border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/20 transition-all"
                title={course.syllabusPdfName || undefined}
              >
                <FileText className="h-3.5 w-3.5" />
                <span>{locale === 'ar' ? 'عرض PDF' : 'View PDF'}</span>
              </a>
              {canManageBook && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedCourseForPdf(course);
                    setIsPdfModalOpen(true);
                  }}
                  className="h-7 w-7 p-0 rounded-squircle text-muted-foreground hover:text-primary hover:bg-primary/10"
                  title={locale === 'ar' ? 'استبدال أو إدارة ملف المنهج' : 'Replace or manage syllabus'}
                >
                  <UploadCloud className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ) : canManageBook ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedCourseForPdf(course);
                setIsPdfModalOpen(true);
              }}
              className="h-7 rounded-squircle border-dashed border-primary/40 bg-primary/5 text-primary hover:bg-primary/15 text-[11px] gap-1 px-2.5 font-semibold cursor-pointer"
            >
              <UploadCloud className="h-3 w-3" />
              <span>{locale === 'ar' ? 'رفع PDF' : 'Upload PDF'}</span>
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground/60 italic">—</span>
          )}
        </TableCell>
      ),
    },
    {
      key: 'doctor',
      header: locale === 'ar' ? 'طاقم التدريس' : 'Teaching Staff',
      render: (course) => (
        <TableCell className="p-4">
          <div className="flex flex-col gap-1.5">
            {course.doctors && course.doctors.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {course.doctors.map((doc) => (
                  <span
                    key={doc._id}
                    className="inline-flex items-center gap-1.5 rounded-squircle border border-teal-500/30 bg-teal-500/10 px-2.5 py-1 text-xs font-medium text-foreground"
                  >
                    <UserCheck className="h-3.5 w-3.5 text-teal-500" />
                    <span>
                      {formatStaffDisplayName(
                        { ...doc, staffType: 'doctor' },
                        locale,
                      )}
                    </span>
                  </span>
                ))}
              </div>
            ) : course.doctorName || course.doctorNameAr ? (
              <span className="inline-flex w-fit items-center gap-1.5 rounded-squircle border border-primary/25 bg-primary/10 px-2.5 py-1 text-xs font-medium text-foreground">
                <UserCheck className="h-3.5 w-3.5 text-primary" />
                <span>
                  {formatStaffDisplayName(
                    {
                      name: course.doctorName,
                      nameAr: course.doctorNameAr,
                      staffType: 'doctor',
                    },
                    locale,
                  )}
                </span>
              </span>
            ) : (
              <span className="text-xs text-muted-foreground/60 italic">
                {locale === 'ar' ? 'أستاذ: غير محدد' : 'Doctor: Unassigned'}
              </span>
            )}
            {course.teachingAssistants && course.teachingAssistants.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {course.teachingAssistants.map((ta) => (
                  <span
                    key={ta._id}
                    className="inline-flex items-center gap-1 rounded-squircle border border-border/70 bg-secondary/50 px-2 py-0.5 text-[11px] text-muted-foreground"
                    title={
                      ta.staffType === 'assistant_lecturer'
                        ? locale === 'ar'
                          ? 'مدرس مساعد'
                          : 'Assistant Lecturer'
                        : locale === 'ar'
                          ? 'معيد'
                          : 'Teaching Assistant'
                    }
                  >
                    <Users className="h-3 w-3 text-muted-foreground" />
                    <span>
                      {formatStaffDisplayName(
                        {
                          ...ta,
                          staffType:
                            ta.staffType || 'teaching_assistant',
                        },
                        locale,
                      )}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>
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
          <DropdownMenu.Root dir={locale === 'ar' ? 'rtl' : 'ltr'}>
            <DropdownMenu.Trigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 rounded-squircle text-muted-foreground hover:bg-secondary/60 hover:text-foreground cursor-pointer"
              >
                <MoreVertical className="h-4 w-4" />
                <span className="sr-only">Actions</span>
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                className="z-50 min-w-52 overflow-hidden rounded-xl border border-border/80 bg-popover/95 p-1 text-popover-foreground shadow-xl backdrop-blur-md animate-in fade-in-0 zoom-in-95 text-start"
              >
                {isAdmin && (
                  <DropdownMenu.Item
                    onClick={() => {
                      setSelectedCourse(course);
                      setIsEditOpen(true);
                    }}
                    className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium cursor-pointer outline-none hover:bg-secondary/60 transition-colors"
                  >
                    <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{locale === 'ar' ? 'تعديل غلاف وبيانات المقرر' : 'Edit Book Cover & Course'}</span>
                  </DropdownMenu.Item>
                )}

                {/* View Enrolled Students (Admin and Staff) */}
                <DropdownMenu.Item
                  onClick={() => {
                    setSelectedEnrolledCourse(course);
                    setIsEnrolledStudentsOpen(true);
                  }}
                  className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium cursor-pointer outline-none hover:bg-primary/10 hover:text-primary transition-colors"
                >
                  <Users className="h-3.5 w-3.5 text-primary" />
                  <span>{locale === 'ar' ? 'عرض كشف الطلاب المسجلين' : 'View Enrolled Students'}</span>
                </DropdownMenu.Item>

                {/* Course Lectures & Sections (Admin, Doctor, TA) */}
                <DropdownMenu.Item
                  onClick={() => {
                    setSelectedCourseForMaterials(course);
                    setIsMaterialsOpen(true);
                  }}
                  className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium cursor-pointer outline-none hover:bg-teal-500/10 hover:text-teal-600 transition-colors"
                >
                  <Layers className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
                  <span>{locale === 'ar' ? 'المحاضرات والسكاشن التعليمية' : 'Lectures & Sections'}</span>
                </DropdownMenu.Item>

                {/* Upload Syllabus PDF (Doctor or Admin only, hidden for TA) */}
                {canManageBook && (
                  <DropdownMenu.Item
                    onClick={() => {
                      setSelectedCourseForPdf(course);
                      setIsPdfModalOpen(true);
                    }}
                    className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium cursor-pointer outline-none hover:bg-primary/10 hover:text-primary transition-colors"
                  >
                    <FileText className="h-3.5 w-3.5 text-primary" />
                    <span>{locale === 'ar' ? 'رفع / تحديث منهج المقرر (PDF)' : 'Upload / Update Syllabus PDF'}</span>
                  </DropdownMenu.Item>
                )}

                {isAdmin && (
                  <DropdownMenu.Item
                    onClick={() => {
                      setEnrollmentCourseId(course._id);
                      setIsEnrollmentDialogOpen(true);
                    }}
                    className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium cursor-pointer outline-none hover:bg-teal-500/10 hover:text-teal-600 transition-colors"
                  >
                    <UserCheck className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
                    <span>{locale === 'ar' ? 'تسجيل الطلاب في المقرر (Excel)' : 'Enroll Students in Course (Excel)'}</span>
                  </DropdownMenu.Item>
                )}

                {isAdmin && (
                  <DropdownMenu.Item
                    onClick={() => {
                      setEnrollmentCourseId(course._id);
                      setIsEnrollmentDialogOpen(true);
                    }}
                    className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium cursor-pointer outline-none hover:bg-rose-500/10 hover:text-rose-600 transition-colors text-rose-600 dark:text-rose-400"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>{locale === 'ar' ? 'تصفير وإلغاء تسجيلات المقرر' : 'Reset Course Registrations'}</span>
                  </DropdownMenu.Item>
                )}

                {canCreateQuiz && (
                  <DropdownMenu.Item
                    onClick={() => {
                      router.push(`/${locale}/admin/quizzes?courseId=${course._id}&create=true`);
                    }}
                    className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium cursor-pointer outline-none hover:bg-primary/10 hover:text-primary transition-colors"
                  >
                    <HelpCircle className="h-3.5 w-3.5 text-primary" />
                    <span>{locale === 'ar' ? 'إنشاء كويز للمقرر' : 'Create Quiz for Course'}</span>
                  </DropdownMenu.Item>
                )}

                {canReadQuizzes && (
                  <DropdownMenu.Item
                    onClick={() => {
                      router.push(`/${locale}/admin/quizzes?courseId=${course._id}`);
                    }}
                    className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium cursor-pointer outline-none hover:bg-secondary/60 transition-colors"
                  >
                    <ListChecks className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{locale === 'ar' ? 'إدارة كويزات المقرر' : 'Manage Course Quizzes'}</span>
                  </DropdownMenu.Item>
                )}

                {isAdmin && (
                  <>
                    <DropdownMenu.Separator className="my-1 h-px bg-border/60" />
                    <DropdownMenu.Item
                      onClick={() => {
                        setCourseToDelete(course);
                        setIsDeleteConfirmOpen(true);
                      }}
                      className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium cursor-pointer outline-none text-danger hover:bg-danger/10 hover:text-danger transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>{tCommon('delete')}</span>
                    </DropdownMenu.Item>
                  </>
                )}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
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
        subtitle={
          isDoctor
            ? (locale === 'ar' ? 'المقررات الدراسية المسندة إليك لإدارة المناهج والكتب والكويزات' : 'Your assigned courses for syllabus, books, and quizzes')
            : (locale === 'ar' ? 'إدارة وتوزيع المقررات الدراسية، الساعات المعتمدة، وتعيين أساتذة المادة' : 'Manage course curricula, credit hours, and assign course doctors')
        }
      >
        {canUploadCourses && !isDoctor && (
          <Button variant="outline" onClick={() => setIsUploadOpen(true)}>
            <UploadCloud className="h-4 w-4" />
            {locale === 'ar' ? 'رفع المقررات' : 'Upload Courses'}
          </Button>
        )}
        {isAdmin && (
          <Button
            variant="outline"
            onClick={() => {
              setEnrollmentCourseId(null);
              setIsEnrollmentDialogOpen(true);
            }}
            className="flex items-center gap-2 rounded-squircle border-teal-500/30 text-teal-700 hover:bg-teal-500/10 dark:text-teal-300"
          >
            <UserCheck className="h-4 w-4" />
            <span>{locale === 'ar' ? 'تسجيل طلاب بمقرر (Excel)' : 'Enroll Students (Excel)'}</span>
          </Button>
        )}
        <Button variant="outline" onClick={exportCourses} disabled={isExporting}>
          {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {locale === 'ar' ? 'تصدير' : 'Export'}
        </Button>
        {isAdmin && (
          <Button
            onClick={() => setIsAddOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-primary font-semibold text-white shadow-lg hover:bg-primary-hover active:scale-[0.98]"
          >
            <Plus className="h-5 w-5" />
            <span>{t('addCourse')}</span>
          </Button>
        )}
      </PageTitleBanner>

      {/* Main Tabs: Courses vs Lectures & Sections */}
      <div className="flex items-center gap-2 border-b border-border/60 pb-3">
        <button
          type="button"
          onClick={() => setActiveMainTab('courses')}
          className={`flex items-center gap-2 px-4 py-2 rounded-squircle text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
            activeMainTab === 'courses'
              ? 'bg-primary text-white shadow-sm'
              : 'bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground'
          }`}
        >
          <BookOpen className="h-4 w-4" />
          <span>{locale === 'ar' ? 'المقررات الدراسية' : 'Courses'}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveMainTab('materials')}
          className={`flex items-center gap-2 px-4 py-2 rounded-squircle text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
            activeMainTab === 'materials'
              ? 'bg-primary text-white shadow-sm'
              : 'bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground'
          }`}
        >
          <Layers className="h-4 w-4" />
          <span>{locale === 'ar' ? 'المحاضرات والسكاشن التعليمية' : 'Lectures & Sections'}</span>
        </button>
      </div>

      {/* Level Filter Dropdown */}
      <FilterBar
        search={search}
        onSearchChange={(val) => {
          setSearch(val);
        }}
        searchPlaceholder={t('searchPlaceholder')}
      >
        <Select
          value={activeLevel}
          onValueChange={(val) => {
            setFilter('activeLevel', val);
          }}
        >
          <SelectTrigger className="w-full border-border bg-secondary/50 sm:w-42.5">
            <SelectValue placeholder={locale === 'ar' ? 'المستوى: الكل' : 'Level: All'} />
          </SelectTrigger>
          <SelectContent className="border-border bg-card">
            <SelectItem value="all">
              {locale === 'ar' ? 'المستوى: الكل' : 'Level: All'}
            </SelectItem>
            {COURSE_LEVEL_VALUES.map((l) => (
              <SelectItem key={l} value={l}>{t(`level_${l}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={activeSemester}
          onValueChange={(val) => {
            setFilter('activeSemester', val);
          }}
        >
          <SelectTrigger className="w-full border-border bg-secondary/50 sm:w-45">
            <SelectValue placeholder={locale === 'ar' ? 'الفصل: الكل' : 'Semester: All'} />
          </SelectTrigger>
          <SelectContent className="border-border bg-card">
            <SelectItem value="all">
              {locale === 'ar' ? 'الفصل: الكل' : 'Semester: All'}
            </SelectItem>
            <SelectItem value="first">{locale === 'ar' ? 'الترم الأول' : 'First Semester'}</SelectItem>
            <SelectItem value="second">{locale === 'ar' ? 'الترم الثاني' : 'Second Semester'}</SelectItem>
            <SelectItem value="summer">{locale === 'ar' ? 'الترم الصيفي' : 'Summer Semester'}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={activeDepartment} onValueChange={(value) => setFilter('department', value)}>
          <SelectTrigger className="w-full sm:w-47.5"><SelectValue /></SelectTrigger>
          <SelectContent dir={locale === 'ar' ? 'rtl' : 'ltr'}>
            <SelectItem value="all">{locale === 'ar' ? 'كل الأقسام' : 'All departments'}</SelectItem>
            {(['GENERAL', 'BIS', 'ACCOUNTING'] as const).map((dept) => <SelectItem key={dept} value={dept}>{t(`placements.values.${dept}`)}</SelectItem>)}
          </SelectContent>
        </Select>
      </FilterBar>

      {activeMainTab === 'courses' ? (
        <>
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
          ...(canWriteCourses
            ? [
                {
                  label: locale === 'ar' ? 'حذف المادة' : 'Delete',
                  onClick: () => setIsBulkDeleteOpen(true),
                  variant: 'destructive' as const,
                  icon: <Trash2 className="w-3.5 h-3.5" />,
                },
              ]
            : []),
        ]}
      />

      <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/70 p-3 sm:flex-row sm:items-center sm:justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPage(Math.max(1, page - 1))}
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
          onClick={() => setPage(Math.min(totalPages, page + 1))}
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
              <span className="text-lg font-bold text-foreground">{getCourseName(course)}</span>
              <StatusBadge
                label={course.isActive ? tCommon('active') : tCommon('inactive')}
                variant={course.isActive ? 'success' : 'danger'}
                onClick={() => toggleStatus(course)}
              />
            </div>
            <p className="mb-3 text-sm text-muted-foreground flex items-center gap-2">
              <span>{t(`level_${course.level}`)}</span>
              <span>•</span>
              <span>
                {courseCurriculumSummary(course, locale)}
              </span>
            </p>
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

        </>
      ) : (
        /* ─── Lectures & Sections Hub View ─────────────────── */
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-2xl border border-teal-500/20 bg-teal-500/5 dark:bg-teal-500/10 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-500/20 text-teal-600 dark:text-teal-400">
                <Layers className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">
                  {locale === 'ar' ? 'المحاضرات والسكاشن التعليمية للمقررات' : 'Course Lectures & Practical Sections'}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {locale === 'ar'
                    ? 'اختر المقرر لرفع واستعراض المحاضرات والسكاشن (الحد الأقصى لحجم الملف: 25 ميجابايت)'
                    : 'Select a course to view or upload lectures and sections (Max upload size: 25 MiB)'}
                </p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground font-medium">
              {locale === 'ar' ? `عدد المقررات المتاحة: ${courses.length}` : `Available courses: ${courses.length}`}
            </p>
          </div>

          {coursesQuery.isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-xs">{tCommon('loading')}</span>
            </div>
          ) : courses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed rounded-2xl p-8">
              <BookOpen className="h-8 w-8 text-muted mb-2" />
              <p className="text-xs font-semibold text-foreground">{tCommon('noData')}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {locale === 'ar' ? 'لا توجد مقررات دراسية مطابقة للفلاتر المحددة.' : 'No courses match the selected filters.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {courses.map((course) => (
                <div
                  key={course._id}
                  className="flex flex-col justify-between rounded-2xl border border-border/70 bg-card p-4.5 shadow-xs hover:border-teal-500/40 hover:shadow-sm transition-all"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-squircle text-[11px] font-mono font-bold bg-primary/10 text-primary">
                        {course.code}
                      </span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-squircle text-[10px] font-medium bg-muted text-muted-foreground">
                        {t(`level_${course.level}`)}
                      </span>
                    </div>

                    <div>
                      <h4 className="font-bold text-sm text-foreground leading-snug line-clamp-1">
                        {getCourseName(course)}
                      </h4>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {courseCurriculumSummary(course, locale)}
                      </p>
                    </div>

                    {/* Staff details */}
                    <div className="rounded-xl border border-border/50 bg-secondary/30 p-2.5 space-y-1.5 text-[11px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground shrink-0">{locale === 'ar' ? 'أستاذ المقرر:' : 'Doctor:'}</span>
                        <span className="font-medium text-foreground truncate max-w-44">
                          {course.doctors && course.doctors.length > 0
                            ? course.doctors
                                .map((d) =>
                                  formatStaffDisplayName(
                                    { ...d, staffType: 'doctor' },
                                    locale,
                                  ),
                                )
                                .join(' ، ')
                            : course.doctorName || course.doctorNameAr
                              ? formatStaffDisplayName(
                                  {
                                    name: course.doctorName,
                                    nameAr: course.doctorNameAr,
                                    staffType: 'doctor',
                                  },
                                  locale,
                                )
                              : locale === 'ar'
                                ? 'لم يُحدد'
                                : 'Unassigned'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground shrink-0">{locale === 'ar' ? 'الهيئة المعاونة:' : 'TA:'}</span>
                        <span className="font-medium text-foreground truncate max-w-44">
                          {course.teachingAssistants &&
                          course.teachingAssistants.length > 0
                            ? course.teachingAssistants
                                .map((ta) =>
                                  formatStaffDisplayName(
                                    {
                                      ...ta,
                                      staffType:
                                        ta.staffType ||
                                        'teaching_assistant',
                                    },
                                    locale,
                                  ),
                                )
                                .join(' ، ')
                            : locale === 'ar'
                              ? 'لم يُحدد'
                              : 'Unassigned'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-border/50 flex flex-col gap-2 mt-3">
                    <Button
                      type="button"
                      onClick={() => {
                        setSelectedCourseForMaterials(course);
                        setIsMaterialsOpen(true);
                      }}
                      className="w-full rounded-squircle bg-primary text-white hover:bg-primary-hover font-semibold text-xs h-8 gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Layers className="h-3.5 w-3.5" />
                      <span>{locale === 'ar' ? 'المحاضرات والسكاشن' : 'Lectures & Sections'}</span>
                    </Button>

                    {canManageBook && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setSelectedCourseForPdf(course);
                          setIsPdfModalOpen(true);
                        }}
                        className="w-full rounded-squircle text-xs h-8 gap-1.5 border-teal-500/30 text-teal-700 dark:text-teal-300 hover:bg-teal-500/10 cursor-pointer"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        <span>{locale === 'ar' ? 'منهج المقرر (PDF)' : 'Syllabus PDF'}</span>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add Course Dialog */}
      <CourseFormDialog
        open={isAddOpen}
        onOpenChange={setIsAddOpen}
        mode="add"
        canManageBook={canManageBook}
        onSubmit={handleAdd}
        t={t}
        tCommon={tCommon}
      />

      {/* Edit Course Dialog */}
      <CourseFormDialog
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        mode="edit"
        canManageBook={canManageBook}
        initialValues={selectedCourse || undefined}
        onSubmit={handleEdit}
        t={t}
        tCommon={tCommon}
      />

      {/* Direct Course Syllabus PDF Dialog */}
      <UploadCoursePdfDialog
        course={courses.find(course => course._id === selectedCourseForPdf?._id) ?? selectedCourseForPdf}
        open={isPdfModalOpen}
        onOpenChange={(open) => {
          setIsPdfModalOpen(open);
          if (!open) setSelectedCourseForPdf(null);
        }}
        locale={locale}
        onSuccess={() => {
          void queryClient.invalidateQueries({ queryKey: ['courses'] });
    void queryClient.invalidateQueries({ queryKey: ['student-syllabi'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-all-courses-for-enrollment'] });
    void queryClient.invalidateQueries({ queryKey: ['staff-assigned-courses'] });
    void queryClient.invalidateQueries({ queryKey: ['quiz-course-options'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-staff', 'courses'] });
        }}
      />

      {/* Course Lectures and Sections Materials Dialog */}
      <CourseMaterialsDialog
        open={isMaterialsOpen}
        onOpenChange={(open) => {
          setIsMaterialsOpen(open);
          if (!open) setSelectedCourseForMaterials(null);
        }}
        courseId={selectedCourseForMaterials?._id || ''}
        courseCode={selectedCourseForMaterials?.code || ''}
        courseName={
          locale === 'ar'
            ? selectedCourseForMaterials?.nameAr || selectedCourseForMaterials?.name || ''
            : selectedCourseForMaterials?.name || ''
        }
        locale={locale}
      />

      {/* Single Course Delete Confirm Dialog */}
      <ConfirmDialog
        open={isDeleteConfirmOpen}
        onOpenChange={setIsDeleteConfirmOpen}
        title={tCommon('deleteConfirmTitle')}
        description={
          <>
            {tCommon('deleteConfirmMessage')}{' '}
            <span className="font-bold text-danger">
              &quot;{courseToDelete ? getCourseName(courseToDelete) : ''}&quot;
            </span>
          </>
        }
        confirmLabel={tCommon('delete')}
        cancelLabel={tCommon('cancel')}
        destructive
        onConfirm={async () => {
          if (courseToDelete) {
            await handleBulkDelete([courseToDelete._id]);
            setIsDeleteConfirmOpen(false);
            setCourseToDelete(null);
          }
        }}
      />

      <DataUploadDialog
        open={isUploadOpen}
        onOpenChange={setIsUploadOpen}
        title={locale === 'ar' ? 'رفع ملف المقررات' : 'Upload Courses'}
        description={
          locale === 'ar'
            ? 'قم برفع ملف بصيغة xlsx أو xls أو csv. يتم تحديث كود المقرر إن وجد أو إنشاؤه من جديد.'
            : 'Upload an xlsx, xls, or csv file. Existing course codes are updated; new course codes are created.'
        }
        uploadType="courses"
        expectedColumns={courseImportColumns}
        onSuccess={() => {
          void queryClient.invalidateQueries({ queryKey: ['courses'] });
    void queryClient.invalidateQueries({ queryKey: ['student-syllabi'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-all-courses-for-enrollment'] });
    void queryClient.invalidateQueries({ queryKey: ['staff-assigned-courses'] });
    void queryClient.invalidateQueries({ queryKey: ['quiz-course-options'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-staff', 'courses'] });
        }}
      />

      {/* Bulk Delete Confirm Dialog */}
      <ConfirmDialog
        open={isBulkDeleteOpen}
        onOpenChange={setIsBulkDeleteOpen}
        title={locale === 'ar' ? 'حذف المواد المحددة' : 'Delete Selected Courses'}
        description={
          locale === 'ar'
            ? `هل أنت متأكد من حذف ${selectedKeys.length} من المواد المحددة؟`
            : `Are you sure you want to delete ${selectedKeys.length} selected courses?`
        }
        confirmLabel={tCommon('delete')}
        cancelLabel={tCommon('cancel')}
        onConfirm={() => {
          setIsBulkDeleteOpen(false);
          void handleBulkDelete(selectedKeys);
        }}
      />

      {/* Bulk Student Enrollment in Course Dialog */}
      <CourseStudentEnrollmentDialog
        open={isEnrollmentDialogOpen}
        onOpenChange={setIsEnrollmentDialogOpen}
        courses={courses.map((c) => ({
          _id: c._id,
          code: c.code,
          name: c.name,
          nameAr: c.nameAr,
          level: c.level,
        }))}
        selectedCourseId={enrollmentCourseId}
        locale={locale}
        onSuccess={() => {
          void queryClient.invalidateQueries({ queryKey: ['courses'] });
    void queryClient.invalidateQueries({ queryKey: ['student-syllabi'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-all-courses-for-enrollment'] });
    void queryClient.invalidateQueries({ queryKey: ['staff-assigned-courses'] });
    void queryClient.invalidateQueries({ queryKey: ['quiz-course-options'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-staff', 'courses'] });
        }}
      />
      <CourseEnrolledStudentsDialog
        course={selectedEnrolledCourse}
        isOpen={isEnrolledStudentsOpen}
        onClose={() => {
          setIsEnrolledStudentsOpen(false);
          setSelectedEnrolledCourse(null);
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
