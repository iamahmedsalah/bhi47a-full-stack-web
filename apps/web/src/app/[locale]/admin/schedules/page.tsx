'use client';

import React, { Suspense, useState, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTableState } from '@/hooks/use-table-state';
import { WeeklyTimetable } from '@/features/course-schedules/weekly-timetable';
import { ScheduleGroupFilter, ScheduleSearch } from '@/features/course-schedules/schedule-filters';
import { filterScheduleEntries, scheduleGroups } from '@/features/course-schedules/timetable-model';
import {
  CalendarDays,
  Plus,
  MoreVertical,
  Edit2,
  Trash2,
  MapPin,
  Clock,
  BookOpen,
  GraduationCap,
  Loader2,
  FileSpreadsheet,
  Upload,
  Download,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  User,
  List,
  Layers,
  Table2,
} from 'lucide-react';
import { toast } from 'sonner';

import api, { getApiErrorMessage } from '@/lib/api';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TimePicker } from '@/components/ui/time-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { PageTitleBanner } from '@/components/ui/page-title-banner';
import { PageSkeletonLoader } from '@/components/ui/page-suspense-fallback';
import { EmptyState } from '@/components/ui/feedback';
import { downloadFileBlob, EXCEL_MIME_TYPE, CSV_MIME_TYPE } from '@/lib/export-utils';
import { exportScheduleAsLandscapeImage, exportScheduleAsLandscapePdf, type ScheduleExportFormat } from '@/features/course-schedules/export-schedule-image';
import { ScheduleExportButtons } from '@/features/course-schedules/schedule-export-buttons';
import { formatStaffDisplayName } from '@student-portal/shared';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { DataUploadProgress } from '@/components/ui/data-upload-progress';
import type { BatchUploadProgressState } from '@/features/uploads/use-batch-upload';

export interface CourseScheduleItem {
  _id: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  courseNameAr?: string;
  staffId: string;
  staffName: string;
  staffNameAr?: string;
  staffType: 'doctor' | 'teaching_assistant' | 'assistant_lecturer';
  type: 'lecture' | 'section' | 'lab';
  dayOfWeek:
    | 'saturday'
    | 'sunday'
    | 'monday'
    | 'tuesday'
    | 'wednesday'
    | 'thursday';
  startTime: string;
  endTime: string;
  location: string;
  locationAr?: string;
  level: string;
  semester: string;
  department: string;
  group?: string;
  section?: string;
  notes?: string;
  isActive: boolean;
}

const DAY_LABELS_AR: Record<string, string> = {
  saturday: 'السبت',
  sunday: 'الأحد',
  monday: 'الاثنين',
  tuesday: 'الثلاثاء',
  wednesday: 'الأربعاء',
  thursday: 'الخميس',
};

const DAY_LABELS_EN: Record<string, string> = {
  saturday: 'Saturday',
  sunday: 'Sunday',
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
};

const TYPE_LABELS: Record<string, { ar: string; en: string; color: string }> = {
  lecture: {
    ar: 'محاضرة',
    en: 'Lecture',
    color: 'border-teal-500/30 bg-teal-500/10 text-teal-300',
  },
  section: {
    ar: 'سكشن',
    en: 'Section',
    color: 'border-purple-500/30 bg-purple-500/10 text-purple-300',
  },
  lab: {
    ar: 'معمل',
    en: 'Lab',
    color: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  },
};

const LOCATION_SUGGESTIONS = [
  'مدرج 1',
  'مدرج 2',
  'مدرج 3',
  'قاعة 101',
  'قاعة 102',
  'قاعة 203',
  'قاعة 204',
  'معمل حاسب 1',
  'معمل حاسب 2',
  'معمل حاسب 3',
];

const TIME_SLOT_PRESETS = [
  {
    labelAr: '09:00 - 11:00 ص (محاضرة)',
    labelEn: '09:00 - 11:00 AM (Lecture)',
    start: '09:00 AM',
    end: '11:00 AM',
  },
  {
    labelAr: '11:00 ص - 01:00 م (محاضرة)',
    labelEn: '11:00 AM - 01:00 PM (Lecture)',
    start: '11:00 AM',
    end: '01:00 PM',
  },
  {
    labelAr: '01:00 - 03:00 م (محاضرة)',
    labelEn: '01:00 - 03:00 PM (Lecture)',
    start: '01:00 PM',
    end: '03:00 PM',
  },
  {
    labelAr: '03:00 - 05:00 م (محاضرة)',
    labelEn: '03:00 - 05:00 PM (Lecture)',
    start: '03:00 PM',
    end: '05:00 PM',
  },
  {
    labelAr: '08:30 - 10:00 ص (سكشن)',
    labelEn: '08:30 - 10:00 AM (Section)',
    start: '08:30 AM',
    end: '10:00 AM',
  },
  {
    labelAr: '10:00 - 11:30 ص (سكشن)',
    labelEn: '10:00 - 11:30 AM (Section)',
    start: '10:00 AM',
    end: '11:30 AM',
  },
  {
    labelAr: '11:30 ص - 01:00 م (سكشن)',
    labelEn: '11:30 AM - 01:00 PM (Section)',
    start: '11:30 AM',
    end: '01:00 PM',
  },
  {
    labelAr: '01:00 - 02:30 م (سكشن)',
    labelEn: '01:00 - 02:30 PM (Section)',
    start: '01:00 PM',
    end: '02:30 PM',
  },
  {
    labelAr: '02:30 - 04:00 م (سكشن)',
    labelEn: '02:30 - 04:00 PM (Section)',
    start: '02:30 PM',
    end: '04:00 PM',
  },
];

function parseTimeToMinutes(t?: string | null): number | null {
  if (!t || typeof t !== 'string') return null;
  const raw = t.trim();
  if (!raw) return null;

  const match12 = raw.match(/^(\d{1,2}):(\d{2})\s*(am|pm|ص|م)?$/i);
  if (match12) {
    let hours = parseInt(match12[1], 10);
    const minutes = parseInt(match12[2], 10);
    const modifier = (match12[3] || '').toLowerCase();
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    if (modifier === 'pm' || modifier === 'م') {
      if (hours < 12) hours += 12;
    } else if (modifier === 'am' || modifier === 'ص') {
      if (hours === 12) hours = 0;
    }
    return hours * 60 + minutes;
  }

  const match24 = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    const hours = parseInt(match24[1], 10);
    const minutes = parseInt(match24[2], 10);
    if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
      return hours * 60 + minutes;
    }
  }

  return null;
}

function minutesTo12h(totalMinutes: number): string {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  const period = hours >= 12 ? 'PM' : 'AM';
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${String(h12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${period}`;
}

function minutesTo24h(totalMinutes: number): string {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function formatDurationText(mins: number, isAr: boolean): string {
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  if (isAr) {
    if (hours === 1 && remainingMins === 0) return 'ساعة واحدة';
    if (hours === 1 && remainingMins === 30) return 'ساعة ونصف';
    if (hours === 2 && remainingMins === 0) return 'ساعتان';
    if (hours === 2 && remainingMins === 30) return 'ساعتان ونصف';
    if (hours === 3 && remainingMins === 0) return '3 ساعات';
    if (hours > 0 && remainingMins > 0) return `${hours} ساعة و ${remainingMins} دقيقة`;
    if (hours > 0) return `${hours} ساعات`;
    return `${remainingMins} دقيقة`;
  }
  if (hours > 0 && remainingMins > 0) return `${hours}h ${remainingMins}m`;
  if (hours > 0) return `${hours}h`;
  return `${remainingMins}m`;
}

function SchedulesManagementContent() {
  const params = useParams();
  const locale = (params?.locale as string) || 'ar';
  const isAr = locale === 'ar';
  const timetableText = useTranslations('courseTimetable');
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isStaff = user?.role === 'staff';

  // Filters State
  const tableState = useTableState({ defaultFilters: { staff: 'all', day: 'all', type: 'all', level: 'all', group: 'all', category: 'all', view: 'timetable' } });
  const { search, setSearch } = tableState;
  const { staff: selectedStaff, day: selectedDay, type: selectedType, level: selectedLevel, group: selectedGroup } = tableState.filters;
  const activeCategoryTab = tableState.filters.category === 'lecture' || tableState.filters.category === 'section' ? tableState.filters.category : 'all';
  const viewMode = tableState.filters.view === 'table' ? 'table' : 'timetable';
  const setSelectedStaff = (value: string) => tableState.setFilter('staff', value);
  const setSelectedDay = (value: string) => tableState.setFilter('day', value);
  const setSelectedType = (value: string) => tableState.setFilter('type', value);
  const setSelectedLevel = (value: string) => tableState.setFilter('level', value);
  const setActiveCategoryTab = (value: string) => tableState.setFilter('category', value);
  const setViewMode = (value: string) => tableState.setFilter('view', value);

  // Modal State
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CourseScheduleItem | null>(null);
  const [itemToDelete, setItemToDelete] = useState<CourseScheduleItem | null>(null);

  // Excel Bulk Import Modal State
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgressState, setUploadProgressState] = useState<BatchUploadProgressState>({
    isUploading: false,
    phase: 'idle',
    percentage: 0,
    currentBatch: 1,
    totalBatches: 1,
    processedRows: 0,
    totalRows: 0,
    elapsedSeconds: 0,
    estimatedSecondsLeft: null,
    rowsPerSecond: 0,
    isNetworkInterrupted: false,
    retrySecondsLeft: 0,
  });
  const [uploadResult, setUploadResult] = useState<{
    totalRows: number;
    insertedCount: number;
    updatedCount: number;
    errorCount: number;
    errors: string[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form State
  const [formCourseId, setFormCourseId] = useState('');
  const [formStaffId, setFormStaffId] = useState('');
  const [formType, setFormType] = useState<'lecture' | 'section' | 'lab'>('lecture');
  const [formDay, setFormDay] = useState<string>('saturday');
  const [formStartTime, setFormStartTime] = useState('09:00 AM');
  const [formEndTime, setFormEndTime] = useState('11:00 AM');
  const [formLocation, setFormLocation] = useState('');
  const [formLevel, setFormLevel] = useState('1');
  const [formDepartment, setFormDepartment] = useState('GENERAL');
  const [formSemester, setFormSemester] = useState('first');
  const [formGroup, setFormGroup] = useState('');
  const [formSection, setFormSection] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 1. Fetch schedules
  const schedulesQuery = useQuery({
    queryKey: ['admin-schedules'],
    queryFn: async () => {
      const res = await api.get<CourseScheduleItem[]>('/admin/course-schedules');
      return res.data ?? [];
    },
  });

  // 2. Fetch courses list for dropdown
  const coursesQuery = useQuery({
    queryKey: ['admin-courses-dropdown'],
    queryFn: async () => {
      const res = await api.get<any>('/admin/courses', { params: { limit: 200 } });
      return res.data?.items ?? [];
    },
  });

  // 3. Fetch staff list for dropdown
  const staffQuery = useQuery({
    queryKey: ['admin-staff-dropdown'],
    queryFn: async () => {
      try {
        const res = await api.get<any>('/admin/staff', {
          params: { page: 1, limit: 300, status: 'all' },
        });
        const payload = (res as any)?.data ?? res;
        return Array.isArray(payload?.items)
          ? payload.items
          : Array.isArray(payload)
            ? payload
            : [];
      } catch {
        return [];
      }
    },
  });

  const rawSchedules = schedulesQuery.data ?? [];
  const [isClearingAll, setIsClearingAll] = useState(false);

  const handleClearAllSchedules = async () => {
    setIsClearingAll(true);
    try {
      const res = await api.delete<{ message: string; deletedCount: number }>(
        '/admin/course-schedules/all',
      );
      toast.success(
        isAr
          ? `تم مسح جميع المواعيد بنجاح (${res.data.deletedCount} موعد)`
          : `All schedules cleared successfully (${res.data.deletedCount} slots)`,
      );
      void queryClient.invalidateQueries({ queryKey: ['admin-schedules'] });
    } catch (err) {
      toast.error(
        getApiErrorMessage(err, isAr ? 'فشل مسح المواعيد' : 'Failed to clear schedules'),
      );
    } finally {
      setIsClearingAll(false);
    }
  };

  const [exportingFormat, setExportingFormat] = useState<ScheduleExportFormat | null>(null);

  const handleDownloadImage = async (format: ScheduleExportFormat) => {
    if (exportingFormat) return;

    if (schedules.length === 0) {
      toast.warning(
        isAr
          ? 'لا توجد مواعيد مسجلة لهذه المستوى لعرضها في صورة الجدول.'
          : 'No schedules found for this level to export as an image.',
      );
      return;
    }

    setExportingFormat(format);
    try {
      const exportFile = format === 'pdf' ? exportScheduleAsLandscapePdf : exportScheduleAsLandscapeImage;
      await exportFile({
        items: schedules,
        level: selectedLevel,
        group: selectedGroup !== 'all' ? selectedGroup : undefined,
        categoryTab: activeCategoryTab,
        locale,
      });
      toast.success(format === 'pdf' ? (isAr ? 'تم تحميل ملف PDF بالعرض بنجاح!' : 'Landscape PDF downloaded successfully!') :
        isAr
          ? 'تم تحميل صورة الجدول الدراسي بنجاح!'
          : 'Schedule image downloaded successfully!',
      );
    } catch {
      toast.error(format === 'pdf' ? (isAr ? 'تعذر تحميل ملف PDF، يرجى المحاولة مرة أخرى.' : 'Failed to download PDF, please try again.') :
        isAr
          ? 'تعذر تحميل صورة الجدول، يرجى المحاولة مرة أخرى.'
          : 'Failed to download schedule image, please try again.',
      );
    } finally {
      setExportingFormat(null);
    }
  };

  const matchingSchedules = useMemo(() => filterScheduleEntries(rawSchedules, {
    staff: selectedStaff, day: selectedDay, type: selectedType, level: selectedLevel, group: selectedGroup, search,
  }), [rawSchedules, selectedStaff, selectedDay, selectedType, selectedLevel, selectedGroup, search]);
  const schedules = useMemo(() => filterScheduleEntries(matchingSchedules, { category: activeCategoryTab }), [matchingSchedules, activeCategoryTab]);
  const groups = useMemo(() => scheduleGroups(rawSchedules), [rawSchedules]);

  const lectureCount = useMemo(
    () => matchingSchedules.filter((s) => s.type === 'lecture').length,
    [matchingSchedules],
  );
  const sectionCount = useMemo(
    () => matchingSchedules.filter((s) => s.type === 'section' || s.type === 'lab').length,
    [matchingSchedules],
  );
  const totalCount = matchingSchedules.length;

  const courses = coursesQuery.data ?? [];
  const staffMembers = staffQuery.data ?? [];

  // Filter staff strictly: separate Doctors and Teaching Assistants, excluding Administrative staff
  const doctorsList = useMemo(() => {
    return staffMembers.filter((s: any) => s.staffType === 'doctor');
  }, [staffMembers]);

  const teachingAssistantsList = useMemo(() => {
    return staffMembers.filter(
      (s: any) => s.staffType === 'teaching_assistant' || s.staffType === 'assistant' || s.staffType === 'assistant_lecturer',
    );
  }, [staffMembers]);

  const teachingStaff = useMemo(() => {
    const combined = [...doctorsList, ...teachingAssistantsList];
    return combined.length > 0 ? combined : staffMembers;
  }, [doctorsList, teachingAssistantsList, staffMembers]);

  const startMins = parseTimeToMinutes(formStartTime);
  const endMins = parseTimeToMinutes(formEndTime);


  const timeValidationError = useMemo(() => {
    if (!formStartTime.trim() || !formEndTime.trim()) {
      return isAr
        ? 'يرجى تحديد وقت البدء ووقت الانتهاء'
        : 'Please specify both start and end times';
    }
    if (startMins === null) {
      return isAr
        ? 'صيغة وقت البدء غير صالحة (مثال: 09:00 AM)'
        : 'Invalid start time format (e.g. 09:00 AM)';
    }
    if (endMins === null) {
      return isAr
        ? 'صيغة وقت الانتهاء غير صالحة (مثال: 11:00 AM)'
        : 'Invalid end time format (e.g. 11:00 AM)';
    }
    if (endMins <= startMins) {
      return isAr
        ? 'وقت الانتهاء يجب أن يكون بعد وقت البدء (مثال: 09:00 AM إلى 11:00 AM)'
        : 'End time must be strictly after start time';
    }
    const duration = endMins - startMins;
    if (duration < 30) {
      return isAr
        ? 'مدة الموعد يجب ألا تقل عن 30 دقيقة'
        : 'Slot duration must be at least 30 minutes';
    }
    if (duration > 360) {
      return isAr
        ? 'مدة الموعد يجب ألا تتجاوز 6 ساعات'
        : 'Slot duration cannot exceed 6 hours';
    }
    return null;
  }, [formStartTime, formEndTime, startMins, endMins, isAr]);

  const scheduleConflicts = useMemo(() => {
    if (startMins === null || endMins === null || endMins <= startMins) return [];
    if (!formLocation.trim() && !formStaffId) return [];

    const conflicts: string[] = [];
    const normalizedLoc = formLocation.trim().toLowerCase();

    for (const item of rawSchedules) {
      if (editingItem && item._id === editingItem._id) continue;
      if (item.dayOfWeek !== formDay) continue;

      const itemStart = parseTimeToMinutes(item.startTime);
      const itemEnd = parseTimeToMinutes(item.endTime);
      if (itemStart === null || itemEnd === null) continue;

      // Overlap condition
      const overlaps = startMins < itemEnd && endMins > itemStart;
      if (!overlaps) continue;

      // Hall collision
      if (normalizedLoc && item.location && item.location.trim().toLowerCase() === normalizedLoc) {
        conflicts.push(
          isAr
            ? `تعارض القاعة: "${item.location}" محجوزة بالفعل لمقرر (${item.courseNameAr || item.courseName}) من ${item.startTime} إلى ${item.endTime}`
            : `Room Conflict: "${item.location}" is already booked for (${item.courseName}) from ${item.startTime} to ${item.endTime}`,
        );
      }

      // Staff collision
      if (formStaffId && item.staffId === formStaffId) {
        conflicts.push(
          isAr
            ? `تعارض عضو هيئة التدريس: لديه موعد آخر (${item.courseNameAr || item.courseName} - ${item.location}) من ${item.startTime} إلى ${item.endTime}`
            : `Staff Conflict: Already scheduled for (${item.courseName} - ${item.location}) from ${item.startTime} to ${item.endTime}`,
        );
      }

      // Batch / Department collision
      if (
        formLevel &&
        formDepartment &&
        item.level === formLevel &&
        item.department === formDepartment &&
        (item.group === formGroup || !item.group || !formGroup) &&
        (item.section === formSection || !item.section || !formSection)
      ) {
        conflicts.push(
          isAr
            ? `تعارض جدول الدفعة: المستوى ${item.level} (${item.department}) لديها موعد آخر (${item.courseNameAr || item.courseName}) في نفس التوقيت`
            : `Batch Conflict: Level ${item.level} (${item.department}) has another session (${item.courseName}) at the same time`,
        );
      }
    }

    return Array.from(new Set(conflicts));
  }, [
    startMins,
    endMins,
    formDay,
    formLocation,
    formStaffId,
    formLevel,
    formDepartment,
    formGroup,
    formSection,
    rawSchedules,
    editingItem,
    isAr,
  ]);

  const handleOpenAdd = () => {
    setEditingItem(null);
    setFormCourseId(courses[0]?._id || '');
    setFormStaffId(teachingStaff[0]?._id || '');
    setFormType('lecture');
    setFormDay('saturday');
    setFormStartTime('09:00 AM');
    setFormEndTime('11:00 AM');
    setFormLocation('');
    setFormLevel('1');
    setFormDepartment('GENERAL');
    setFormSemester('first');
    setFormGroup('');
    setFormSection('');
    setFormNotes('');
    setIsAddOpen(true);
  };

  const handleOpenEdit = (item: CourseScheduleItem) => {
    setEditingItem(item);
    setFormCourseId(item.courseId);
    setFormStaffId(item.staffId);
    setFormType(item.type);
    setFormDay(item.dayOfWeek);
    setFormStartTime(item.startTime);
    setFormEndTime(item.endTime);
    setFormLocation(item.location);
    setFormLevel(item.level || '1');
    setFormDepartment(item.department || 'GENERAL');
    setFormSemester(item.semester || 'first');
    setFormGroup(item.group || '');
    setFormSection(item.section || '');
    setFormNotes(item.notes || '');
    setIsAddOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCourseId || !formStaffId || !formLocation.trim()) {
      toast.error(
        isAr
          ? 'يرجى اختيار المادة وعضو هيئة التدريس وتحديد مكان المحاضرة'
          : 'Please select course, staff member, and provide lecture location',
      );
      return;
    }

    if (timeValidationError) {
      toast.error(timeValidationError);
      return;
    }

    if (scheduleConflicts.length > 0) {
      const hasHallCollision = scheduleConflicts.some(
        (c) => c.includes('القاعة') || c.includes('Room'),
      );
      if (hasHallCollision) {
        toast.error(
          isAr
            ? 'لا يمكن حفظ الموعد: يوجد تعارض مباشر في حجز القاعة/المدرج مع موعد آخر في نفس التوقيت'
            : 'Cannot save: direct hall/room collision with another schedule slot',
        );
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload = {
        courseId: formCourseId,
        staffId: formStaffId,
        type: formType,
        dayOfWeek: formDay,
        startTime: formStartTime,
        endTime: formEndTime,
        location: formLocation.trim(),
        locationAr: editingItem && formLocation.trim() === editingItem.location ? editingItem.locationAr : formLocation.trim(),
        level: formLevel,
        semester: formSemester,
        department: formDepartment,
        group: formGroup.trim() || undefined,
        section: formSection.trim() || undefined,
        notes: formNotes.trim() || undefined,
      };

      if (editingItem) {
        await api.patch(`/admin/course-schedules/${editingItem._id}`, payload);
        toast.success(
          isAr
            ? 'تم تحديث موعد المحاضرة/السكشن بنجاح'
            : 'Schedule entry updated successfully',
        );
      } else {
        await api.post('/admin/course-schedules', payload);
        toast.success(
          isAr
            ? 'تمت إضافة موعد المحاضرة/السكشن بنجاح'
            : 'Schedule entry created successfully',
        );
      }

      setIsAddOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['admin-schedules'] });
    } catch (err) {
      toast.error(
        getApiErrorMessage(
          err,
          isAr ? 'فشل حفظ موعد المحاضرة' : 'Failed to save schedule slot',
        ),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!itemToDelete) return;
    try {
      await api.delete(`/admin/course-schedules/${itemToDelete._id}`);
      toast.success(
        isAr ? 'تم حذف الموعد بنجاح' : 'Schedule slot deleted successfully',
      );
      setItemToDelete(null);
      void queryClient.invalidateQueries({ queryKey: ['admin-schedules'] });
    } catch (err) {
      toast.error(
        getApiErrorMessage(
          err,
          isAr ? 'فشل حذف الموعد' : 'Failed to delete schedule slot',
        ),
      );
    }
  };

  // Download Excel Template
  const handleDownloadTemplate = async (format: 'xlsx' | 'csv' = 'xlsx') => {
    try {
      setIsDownloadingTemplate(true);
      const res = await api.get('/admin/course-schedules/template', {
        params: { format },
        responseType: 'blob',
      });
      await downloadFileBlob(
        res,
        format === 'csv'
          ? 'lecture-schedules-template.csv'
          : 'lecture-schedules-template.xlsx',
        format === 'csv' ? CSV_MIME_TYPE : EXCEL_MIME_TYPE,
      );
      toast.success(
        isAr ? 'تم تحميل نموذج الجداول بنجاح' : 'Schedule template downloaded',
      );
    } catch (err) {
      toast.error(
        getApiErrorMessage(
          err,
          isAr ? 'فشل تحميل النموذج' : 'Failed to download template',
        ),
      );
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  // Bulk Upload File
  const handleUploadFile = async () => {
    if (!selectedFile) {
      toast.error(
        isAr ? 'يرجى اختيار ملف Excel أولاً' : 'Please select an Excel file first',
      );
      return;
    }
    setIsUploading(true);
    setUploadResult(null);

    const startTime = Date.now();
    setUploadProgressState({
      isUploading: true,
      phase: 'uploading',
      percentage: 10,
      currentBatch: 1,
      totalBatches: 1,
      processedRows: 0,
      totalRows: 0,
      elapsedSeconds: 0,
      estimatedSecondsLeft: null,
      rowsPerSecond: 0,
      isNetworkInterrupted: false,
      retrySecondsLeft: 0,
    });

    const timer = setInterval(() => {
      const elapsed = Math.max(1, Math.floor((Date.now() - startTime) / 1000));
      setUploadProgressState((prev) => ({
        ...prev,
        elapsedSeconds: elapsed,
        percentage:
          prev.phase === 'uploading'
            ? Math.min(75, prev.percentage + 10)
            : prev.phase === 'processing'
              ? Math.min(95, prev.percentage + 5)
              : prev.percentage,
      }));
    }, 400);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      setTimeout(() => {
        setUploadProgressState((prev) => ({
          ...prev,
          phase: 'processing',
          percentage: Math.max(prev.percentage, 80),
        }));
      }, 700);

      const res = await api.post<{
        totalRows: number;
        insertedCount: number;
        updatedCount: number;
        errorCount: number;
        errors: string[];
      }>('/admin/course-schedules/upload-excel', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const bytePercent = Math.min(
              75,
              Math.max(10, Math.round((progressEvent.loaded * 75) / progressEvent.total)),
            );
            setUploadProgressState((prev) => ({
              ...prev,
              percentage: bytePercent,
              phase: bytePercent >= 70 ? 'processing' : 'uploading',
            }));
          }
        },
      });

      clearInterval(timer);
      const total = res.data.totalRows || (res.data.insertedCount + res.data.updatedCount);
      const elapsed = Math.max(1, Math.floor((Date.now() - startTime) / 1000));
      const speed = Math.round((total / elapsed) * 10) / 10;

      setUploadProgressState({
        isUploading: false,
        phase: 'completed',
        percentage: 100,
        currentBatch: 1,
        totalBatches: 1,
        processedRows: total,
        totalRows: total,
        elapsedSeconds: elapsed,
        estimatedSecondsLeft: 0,
        rowsPerSecond: speed,
        isNetworkInterrupted: false,
        retrySecondsLeft: 0,
      });

      setUploadResult(res.data);
      if (res.data.insertedCount > 0 || res.data.updatedCount > 0) {
        toast.success(
          isAr
            ? `تم استيراد ${res.data.insertedCount} موعد جديد وتحديث ${res.data.updatedCount} موعد بنجاح!`
            : `Imported ${res.data.insertedCount} new slots and updated ${res.data.updatedCount} slots successfully!`,
        );
        void queryClient.invalidateQueries({ queryKey: ['admin-schedules'] });
      } else if (res.data.errorCount > 0) {
        toast.error(
          isAr
            ? `فشل استيراد الملف، تم رصد ${res.data.errorCount} خطأ`
            : `Import failed with ${res.data.errorCount} errors`,
        );
      }
    } catch (err) {
      clearInterval(timer);
      setUploadProgressState((prev) => ({
        ...prev,
        isUploading: false,
        phase: 'error',
        percentage: 0,
      }));
      toast.error(
        getApiErrorMessage(
          err,
          isAr ? 'فشل استيراد ملف الجداول' : 'Failed to import schedule sheet',
        ),
      );
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="animate-fade-in space-y-6 p-2 md:p-6" dir={isAr ? 'rtl' : 'ltr'}>
      {/* Title Banner */}
      <PageTitleBanner
        title={isAr ? 'جدول المحاضرات والسكاشن والقاعات' : 'Lecture & Section Schedules'}
        subtitle={
          isAr
            ? 'توزيع مواعيد المحاضرات والسكاشن وأماكن القاعات والمدرجات للدكاترة والمعيدين'
            : 'Allocate and manage lecture timings, section schedules, and hall rooms'
        }
        icon={<CalendarDays className="h-5 w-5 text-primary" />}
      >
        <div className="flex flex-wrap items-center gap-2.5">
          {isAdmin && rawSchedules.length > 0 && (
            <ConfirmDialog
              title={isAr ? 'مسح جميع مواعيد الجدول الدراسي' : 'Clear All Course Schedules'}
              description={
                isAr
                  ? 'تحذير أمني: سيتم حذف كافة مواعيد المحاضرات والسكاشن المسجلة نهائياً من قاعدة البيانات. هل أنت متأكد من الاستمرار؟'
                  : 'Warning: This will permanently remove all lecture and section schedule entries from the database. Are you sure you want to proceed?'
              }
              confirmLabel={isAr ? 'نعم، مسح كل المواعيد' : 'Yes, Clear All'}
              cancelLabel={isAr ? 'إلغاء' : 'Cancel'}
              dir={isAr ? 'rtl' : 'ltr'}
              destructive
              disabled={isClearingAll}
              onConfirm={handleClearAllSchedules}
              trigger={
                <Button
                  type="button"
                  variant="outline"
                  disabled={isClearingAll}
                  className="flex items-center gap-2 rounded-squircle border-rose-500/30 bg-rose-500/10 text-rose-400 font-semibold hover:bg-rose-500/20 active:scale-[0.98] transition-all cursor-pointer"
                >
                  <Trash2 className="h-4 w-4 text-rose-400" />
                  <span>
                    {isClearingAll
                      ? isAr
                        ? 'جاري المسح...'
                        : 'Clearing...'
                      : isAr
                        ? 'مسح جميع المواعيد'
                        : 'Clear All'}
                  </span>
                </Button>
              }
            />
          )}

          <ScheduleExportButtons locale={locale} busyFormat={exportingFormat} disabled={schedulesQuery.isPending || schedulesQuery.isError || schedules.length === 0} onExport={format => void handleDownloadImage(format)} />

          {isAdmin && (
            <Button
              type="button"
              onClick={() => {
                setUploadResult(null);
                setSelectedFile(null);
                setIsUploadModalOpen(true);
              }}
              variant="outline"
              className="flex items-center gap-2 rounded-squircle border-primary/30 bg-primary/10 text-primary font-semibold hover:bg-primary/20 active:scale-[0.98] transition-all cursor-pointer"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
              <span>{isAr ? 'رفع شيت Excel' : 'Import Excel'}</span>
            </Button>
          )}

          {isAdmin && (
            <Button
              onClick={handleOpenAdd}
              className="flex items-center gap-2 rounded-squircle bg-primary font-semibold text-white shadow-lg shadow-primary/20 hover:bg-primary-hover active:scale-[0.98] cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>{isAr ? 'إضافة موعد / قاعة' : 'Add Schedule Slot'}</span>
            </Button>
          )}
        </div>
      </PageTitleBanner>

      {/* Doctor / Staff Info Notice */}
      {isStaff && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-teal-500/30 bg-teal-500/10 p-4 text-xs backdrop-blur-md">
          <div className="flex items-center gap-2.5 text-teal-300">
            <GraduationCap className="h-5 w-5 shrink-0 text-teal-400" />
            <div>
              <span className="font-bold">
                {isAr
                  ? `أهلاً دكتور/محاضر ${user?.name}`
                  : `Welcome Instructor ${user?.name}`}
              </span>
              <p className="text-muted-foreground text-[11px] mt-0.5">
                {isAr
                  ? 'يمكنك تصفية الجدول لعرض مواعيدك وقاعاتك فقط أو استعراض جدول المعهد بالكامل.'
                  : 'You can filter the timetable to see only your lectures and rooms, or browse all institute schedules.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedStaff(user?._id || 'all')}
              className={`rounded-squircle px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                selectedStaff === user?._id
                  ? 'bg-primary text-white shadow-sm'
                  : 'border border-primary/30 bg-background/60 text-primary hover:bg-primary/10'
              }`}
            >
              {isAr ? 'مواعيدي فقط' : 'My Slots Only'}
            </button>
            <button
              type="button"
              onClick={() => setSelectedStaff('all')}
              className={`rounded-squircle px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                selectedStaff === 'all'
                  ? 'bg-secondary text-foreground font-semibold'
                  : 'border border-border/60 bg-background/40 text-muted-foreground hover:text-foreground'
              }`}
            >
              {isAr ? 'الجدول العام' : 'All Schedules'}
            </button>
          </div>
        </div>
      )}

      {/* Category Tabs & View Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Category Tabs: الكل / محاضرات الأساتذة / سكاشن المعيدين */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-border/70 bg-card/60 p-1.5 backdrop-blur-md">
          <button
            type="button"
            onClick={() => setActiveCategoryTab('all')}
            className={`flex items-center gap-2 rounded-squircle px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
              activeCategoryTab === 'all'
                ? 'bg-primary text-white shadow-sm'
                : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>{isAr ? 'الكل (جميع المواعيد)' : 'All Schedules'}</span>
            <span
              className={`rounded-squircle px-1.5 py-0.5 text-[10px] font-bold ${
                activeCategoryTab === 'all'
                  ? 'bg-white/20 text-white'
                  : 'bg-secondary text-muted-foreground'
              }`}
            >
              {totalCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveCategoryTab('lecture')}
            className={`flex items-center gap-2 rounded-squircle px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
              activeCategoryTab === 'lecture'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'text-muted-foreground hover:bg-teal-500/10 hover:text-teal-300'
            }`}
          >
            <BookOpen className="h-3.5 w-3.5 text-teal-400" />
            <span>{isAr ? 'محاضرات الأساتذة (دكتور)' : 'Doctor Lectures'}</span>
            <span
              className={`rounded-squircle px-1.5 py-0.5 text-[10px] font-bold ${
                activeCategoryTab === 'lecture'
                  ? 'bg-white/20 text-white'
                  : 'bg-teal-500/15 text-teal-300'
              }`}
            >
              {lectureCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveCategoryTab('section')}
            className={`flex items-center gap-2 rounded-squircle px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
              activeCategoryTab === 'section'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-muted-foreground hover:bg-purple-500/10 hover:text-purple-300'
            }`}
          >
            <GraduationCap className="h-3.5 w-3.5 text-purple-400" />
            <span>{isAr ? 'سكاشن وتطبيقات المعيدين' : 'TA Sections'}</span>
            <span
              className={`rounded-squircle px-1.5 py-0.5 text-[10px] font-bold ${
                activeCategoryTab === 'section'
                  ? 'bg-white/20 text-white'
                  : 'bg-purple-500/15 text-purple-300'
              }`}
            >
              {sectionCount}
            </span>
          </button>
        </div>

        {/* View Mode Toggle: Table View vs Timetable View */}
        <div className="flex items-center gap-1 rounded-2xl border border-border/70 bg-card/60 p-1 backdrop-blur-md">
          <button
            type="button"
            aria-pressed={viewMode === 'timetable'}
            onClick={() => setViewMode('timetable')}
            className={`flex items-center gap-1.5 rounded-squircle px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
              viewMode === 'timetable'
                ? 'bg-primary text-white shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Table2 className="h-3.5 w-3.5" aria-hidden="true" />
            {timetableText('view')}
          </button>
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`flex items-center gap-1.5 rounded-squircle px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
              viewMode === 'table'
                ? 'bg-primary text-white shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <List className="h-3.5 w-3.5" />
            <span>{isAr ? 'جدول منظم' : 'Table View'}</span>
          </button>
        </div>
      </div>

      {/* Filter Bar with Radix Selects */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/70 bg-card/60 p-4 backdrop-blur-md">
        {/* Search */}
        <ScheduleSearch value={search} onChange={setSearch} />
        <div className="min-w-36"><ScheduleGroupFilter value={selectedGroup} groups={groups} onChange={value => tableState.setFilter('group', value)} /></div>

        {/* Doctor / Staff Filter Dropdown */}
        <div className="min-w-[190px]">
          <Select value={selectedStaff} onValueChange={setSelectedStaff}>
            <SelectTrigger className="h-9 rounded-squircle text-xs font-medium border-border bg-background">
              <SelectValue
                placeholder={isAr ? 'جميع الدكاترة والمعيدين' : 'All Staff / Doctors'}
              />
            </SelectTrigger>
            <SelectContent dir={isAr ? 'rtl' : 'ltr'}>
              <SelectItem value="all">
                {isAr ? 'جميع أعضاء هيئة التدريس والمعيدين' : 'All Doctors & TAs'}
              </SelectItem>
              {doctorsList.length > 0 && (
                <div className="px-2 py-1 text-[10px] font-bold text-teal-400 bg-teal-500/10 rounded-sm my-0.5">
                  {isAr ? 'أعضاء هيئة التدريس (الدكاترة)' : 'Doctors & Lecturers'}
                </div>
              )}
              {doctorsList.map((s: any) => (
                <SelectItem key={s._id} value={s._id}>
                  <div className="flex items-center justify-between w-full gap-2">
                    <span>
                      {formatStaffDisplayName(
                        { ...s, staffType: 'doctor' },
                        isAr ? 'ar' : 'en',
                      )}
                    </span>
                    <span className="rounded px-1.5 py-0.2 text-[9px] font-bold border border-teal-500/30 bg-teal-500/10 text-teal-300">
                      {isAr ? 'دكتور' : 'Doctor'}
                    </span>
                  </div>
                </SelectItem>
              ))}

              {teachingAssistantsList.length > 0 && (
                <div className="px-2 py-1 text-[10px] font-bold text-purple-400 bg-purple-500/10 rounded-sm my-0.5 mt-1.5">
                  {isAr ? 'الهيئة المعاونة (المعيدين)' : 'Teaching Assistants'}
                </div>
              )}
              {teachingAssistantsList.map((s: any) => (
                <SelectItem key={s._id} value={s._id}>
                  <div className="flex items-center justify-between w-full gap-2">
                    <span>
                      {formatStaffDisplayName(
                        {
                          ...s,
                          staffType: s.staffType || 'teaching_assistant',
                        },
                        isAr ? 'ar' : 'en',
                      )}
                    </span>
                    <span className="rounded px-1.5 py-0.2 text-[9px] font-bold border border-purple-500/30 bg-purple-500/10 text-purple-300">
                      {s.staffType === 'assistant_lecturer'
                        ? isAr
                          ? 'مدرس مساعد'
                          : 'A.L.'
                        : isAr
                          ? 'معيد'
                          : 'TA'}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Day Filter */}
        <div className="w-[140px]">
          <Select value={selectedDay} onValueChange={setSelectedDay}>
            <SelectTrigger className="h-9 rounded-squircle text-xs font-medium border-border bg-background">
              <SelectValue placeholder={isAr ? 'جميع الأيام' : 'All Days'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isAr ? 'جميع الأيام' : 'All Days'}</SelectItem>
              {Object.entries(isAr ? DAY_LABELS_AR : DAY_LABELS_EN).map(
                ([val, label]) => (
                  <SelectItem key={val} value={val}>
                    {label}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Type Filter */}
        <div className="w-[130px]">
          <Select value={selectedType} onValueChange={setSelectedType}>
            <SelectTrigger className="h-9 rounded-squircle text-xs font-medium border-border bg-background">
              <SelectValue placeholder={isAr ? 'جميع الأنواع' : 'All Types'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isAr ? 'جميع الأنواع' : 'All Types'}</SelectItem>
              <SelectItem value="lecture">{isAr ? 'محاضرة' : 'Lecture'}</SelectItem>
              <SelectItem value="section">{isAr ? 'سكشن' : 'Section'}</SelectItem>
              <SelectItem value="lab">{isAr ? 'معمل' : 'Lab'}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Level Filter */}
        <div className="w-[130px]">
          <Select value={selectedLevel} onValueChange={setSelectedLevel}>
            <SelectTrigger aria-label={isAr ? 'تصفية حسب المستوى' : 'Filter by level'} className="h-9 rounded-squircle text-xs font-medium border-border bg-background">
              <SelectValue placeholder={isAr ? 'جميع المستويات' : 'All Levels'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isAr ? 'جميع المستويات' : 'All Levels'}</SelectItem>
              <SelectItem value="1">{isAr ? 'المستوى الأول' : 'Level 1'}</SelectItem>
              <SelectItem value="2">{isAr ? 'المستوى الثاني' : 'Level 2'}</SelectItem>
              <SelectItem value="3">{isAr ? 'المستوى الثالث' : 'Level 3'}</SelectItem>
              <SelectItem value="4">{isAr ? 'المستوى الرابع' : 'Level 4'}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {(search || [selectedStaff, selectedDay, selectedType, selectedLevel, selectedGroup].some(value => value !== 'all')) && <Button type="button" variant="ghost" size="sm" onClick={tableState.resetAll} className="rounded-squircle text-xs">{timetableText('reset')}</Button>}
      </div>

      {/* Schedules Table */}
      <div className={viewMode === 'timetable' ? 'min-w-0' : 'rounded-2xl border border-border/80 bg-card/60 backdrop-blur-md shadow-sm overflow-hidden'}>
        {schedulesQuery.isError ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-5 text-sm"><span>{timetableText('loadFailed')}</span><Button type="button" variant="outline" onClick={() => void schedulesQuery.refetch()}>{timetableText('retry')}</Button></div> : schedulesQuery.isLoading ? (
          <div className="flex min-h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : schedules.length === 0 ? (
          <EmptyState
            title={isAr ? 'لا توجد مواعيد محاضرات مسجلة' : 'No schedules found'}
            description={
              isAr
                ? 'لم يتم العثور على أي مواعيد مطابقة لخيارات البحث المحددة. يمكنك إضافة موعد جديد أو رفع شيت Excel.'
                : 'No schedules match the selected filters. Add a new slot or upload an Excel sheet.'
            }
            action={
              isAdmin ? (
                <Button
                  onClick={handleOpenAdd}
                  className="rounded-squircle bg-primary text-xs font-semibold text-white"
                >
                  <Plus className="h-4 w-4 me-1.5" />
                  <span>{isAr ? 'إضافة موعد الآن' : 'Add Slot Now'}</span>
                </Button>
              ) : undefined
            }
          />
        ) : viewMode === 'timetable' ? (
          <WeeklyTimetable
            entries={schedules}
            category={activeCategoryTab}
            onEdit={isAdmin ? handleOpenEdit : undefined}
            onDelete={isAdmin ? setItemToDelete : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-start text-xs">
              <thead className="bg-secondary/40 text-muted-foreground font-semibold border-b border-border/80">
                <tr>
                  <th className="px-4 py-3.5 text-start">{isAr ? 'المقرر الدراسي' : 'COURSE'}</th>
                  <th className="px-4 py-3.5 text-start">{isAr ? 'القائم بالتدريس / دكتور' : 'STAFF / DOCTOR'}</th>
                  <th className="px-4 py-3.5 text-center">{isAr ? 'النوع' : 'TYPE'}</th>
                  <th className="px-4 py-3.5 text-start">{isAr ? 'اليوم والتوقيت' : 'DAY & TIME'}</th>
                  <th className="px-4 py-3.5 text-start">{isAr ? 'المكان / القاعة' : 'HALL / LOCATION'}</th>
                  <th className="px-4 py-3.5 text-start">{isAr ? 'المستوى والمجموعة' : 'LEVEL & GROUP'}</th>
                  <th className="px-4 py-3.5 text-center">{isAr ? 'الإجراءات' : 'ACTIONS'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {schedules.map((item) => {
                  const typeMeta = TYPE_LABELS[item.type] || TYPE_LABELS.lecture;
                  const dayName = isAr
                    ? DAY_LABELS_AR[item.dayOfWeek] || item.dayOfWeek
                    : DAY_LABELS_EN[item.dayOfWeek] || item.dayOfWeek;

                  const isMySlot = user?._id === item.staffId;

                  return (
                    <tr
                      key={item._id}
                      className={`hover:bg-secondary/30 transition-colors ${
                        isMySlot ? 'bg-primary/5' : ''
                      }`}
                    >
                      {/* Course */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
                            <BookOpen className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="font-bold text-foreground text-sm">
                              {isAr ? item.courseNameAr || item.courseName : item.courseName}
                            </div>
                            <div className="font-mono text-[11px] text-primary font-medium">
                              {item.courseCode}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Staff / Doctor */}
                      <td className="px-4 py-3.5 text-foreground font-medium">
                        <div className="flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 text-primary/80 shrink-0" />
                          <span className="font-semibold">
                            {formatStaffDisplayName(
                              {
                                name: item.staffName,
                                nameAr: item.staffNameAr,
                                staffType: item.staffType,
                              },
                              isAr ? 'ar' : 'en',
                            )}
                          </span>
                          {isMySlot && (
                            <span className="rounded-full bg-teal-500/20 px-1.5 py-0.2 text-[9px] font-bold text-teal-400">
                              {isAr ? 'أنت' : 'You'}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] ms-5 mt-0.5">
                          {item.staffType === 'assistant_lecturer' ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-cyan-400">
                              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                              {isAr ? 'هيئة معاونة (مدرس مساعد)' : 'Assistant Lecturer'}
                            </span>
                          ) : item.staffType === 'teaching_assistant' ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-purple-400">
                              <span className="h-1.5 w-1.5 rounded-full bg-purple-400" />
                              {isAr ? 'هيئة معاونة (معيد)' : 'Teaching Assistant'}
                            </span>
                          ) : item.staffType === 'doctor' ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-teal-400">
                              <span className="h-1.5 w-1.5 rounded-full bg-teal-400" />
                              {isAr ? 'أستاذ مقرر (دكتور)' : 'Doctor'}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 font-semibold text-amber-400">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                              {isAr ? 'إداري' : 'Administrative'}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Type Badge */}
                      <td className="px-4 py-3.5 text-center">
                        <span
                          className={`inline-block rounded-squircle border px-2.5 py-1 text-xs font-bold ${typeMeta.color}`}
                        >
                          {isAr ? typeMeta.ar : typeMeta.en}
                        </span>
                      </td>

                      {/* Day & Time */}
                      <td className="px-4 py-3.5 text-foreground">
                        <div className="font-semibold text-xs">{dayName}</div>
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5 font-mono">
                          <Clock className="h-3 w-3 text-primary/70" />
                          <span>
                            {item.startTime} - {item.endTime}
                          </span>
                        </div>
                      </td>

                      {/* Location / Hall */}
                      <td className="px-4 py-3.5">
                        <span className="inline-flex items-center gap-1.5 rounded-squircle border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
                          <MapPin className="h-3.5 w-3.5" />
                          <span>{item.location}</span>
                        </span>
                        {item.notes && (
                          <div className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[180px]">
                            {item.notes}
                          </div>
                        )}
                      </td>

                      {/* Level & Group */}
                      <td className="px-4 py-3.5 text-foreground">
                        <div>
                          {isAr ? `المستوى ${item.level}` : `Level ${item.level}`}
                          {item.department && ` · ${item.department}`}
                        </div>
                        {(item.group || item.section) && (
                          <div className="text-[11px] text-muted-foreground">
                            {item.group && `${item.group} `}
                            {item.section && `(${item.section})`}
                          </div>
                        )}
                      </td>

                      {/* Actions (3-dots) */}
                      <td className="px-4 py-3.5 text-center">
                        {isAdmin ? (
                          <DropdownMenu.Root dir={isAr ? 'rtl' : 'ltr'}>
                            <DropdownMenu.Trigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 rounded-squircle text-muted-foreground hover:bg-secondary/60 hover:text-foreground cursor-pointer"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenu.Trigger>
                            <DropdownMenu.Portal>
                              <DropdownMenu.Content
                                align="end"
                                className="z-50 min-w-40 overflow-hidden rounded-xl border border-border/80 bg-popover/95 p-1 text-popover-foreground shadow-xl backdrop-blur-md animate-in fade-in-0 zoom-in-95 text-start"
                              >
                                <DropdownMenu.Item
                                  onClick={() => handleOpenEdit(item)}
                                  className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium cursor-pointer outline-none hover:bg-secondary/60 transition-colors"
                                >
                                  <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span>{isAr ? 'تعديل الموعد' : 'Edit Slot'}</span>
                                </DropdownMenu.Item>

                                <DropdownMenu.Separator className="my-1 h-px bg-border/60" />

                                <DropdownMenu.Item
                                  onClick={() => setItemToDelete(item)}
                                  className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium cursor-pointer outline-none text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition-colors"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  <span>{isAr ? 'حذف الموعد' : 'Delete Slot'}</span>
                                </DropdownMenu.Item>
                              </DropdownMenu.Content>
                            </DropdownMenu.Portal>
                          </DropdownMenu.Root>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Dialog with Radix Selects */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent
          className="max-w-xl rounded-2xl border-border bg-card p-6 shadow-2xl"
          dir={isAr ? 'rtl' : 'ltr'}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-foreground">
              <CalendarDays className="h-5 w-5 text-primary" />
              <span>
                {editingItem
                  ? isAr
                    ? 'تعديل موعد محاضرة / سكشن'
                    : 'Edit Schedule Slot'
                  : isAr
                    ? 'إضافة موعد محاضرة / سكشن وقاعة'
                    : 'Add Lecture / Section Slot'}
              </span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {isAr
                ? 'حدد المقرر الدراسي وعضو هيئة التدريس والقاعة والتوقيت الأسبوعي بدقة'
                : 'Select course, teaching staff, hall location, and weekly timetable'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-4 pt-2">
            {/* Row 1: Course & Doctor / Staff Member Dropdowns */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Course Dropdown */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <BookOpen className="h-3.5 w-3.5 text-primary" />
                  <span>{isAr ? 'المقرر الدراسي *' : 'Course *'}</span>
                </label>
                <Select value={formCourseId} onValueChange={setFormCourseId}>
                  <SelectTrigger className="h-9 rounded-squircle text-xs font-medium border-border bg-background">
                    <SelectValue
                      placeholder={isAr ? 'اختر المقرر الدراسي' : 'Select Course'}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {courses.map((c: any) => (
                      <SelectItem key={c._id} value={c._id}>
                        <span className="font-mono font-bold text-primary me-1.5">
                          {c.code}
                        </span>
                        <span>{isAr ? c.nameAr || c.name : c.name}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Staff / Doctor Member Dropdown */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <GraduationCap className="h-3.5 w-3.5 text-teal-400" />
                  <span>{isAr ? 'القائم بالتدريس (دكتور/معيد) *' : 'Staff Member *'}</span>
                </label>
                <Select value={formStaffId} onValueChange={setFormStaffId}>
                  <SelectTrigger className="h-9 rounded-squircle text-xs font-medium border-border bg-background">
                    <SelectValue
                      placeholder={
                        isAr
                          ? 'اختر الدكتور أو المعيد'
                          : 'Select Doctor or TA'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent dir={isAr ? 'rtl' : 'ltr'}>
                    {doctorsList.length > 0 && (
                      <div className="px-2 py-1 text-[10px] font-bold text-teal-400 bg-teal-500/10 rounded-sm my-0.5">
                        {isAr ? 'أعضاء هيئة التدريس (الدكاترة)' : 'Doctors & Lecturers'}
                      </div>
                    )}
                    {doctorsList.map((s: any) => (
                      <SelectItem key={s._id} value={s._id}>
                        <div className="flex items-center justify-between w-full gap-2">
                          <span className="font-medium">
                            {formatStaffDisplayName(
                              { ...s, staffType: 'doctor' },
                              isAr ? 'ar' : 'en',
                            )}
                          </span>
                          <span className="rounded px-1.5 py-0.2 text-[10px] font-bold border border-teal-500/30 bg-teal-500/10 text-teal-300">
                            {isAr ? 'دكتور' : 'Doctor'}
                          </span>
                        </div>
                      </SelectItem>
                    ))}

                    {teachingAssistantsList.length > 0 && (
                      <div className="px-2 py-1 text-[10px] font-bold text-purple-400 bg-purple-500/10 rounded-sm my-0.5 mt-2">
                        {isAr ? 'الهيئة المعاونة (المعيدين)' : 'Teaching Assistants'}
                      </div>
                    )}
                    {teachingAssistantsList.map((s: any) => (
                      <SelectItem key={s._id} value={s._id}>
                        <div className="flex items-center justify-between w-full gap-2">
                          <span className="font-medium">
                            {formatStaffDisplayName(
                              {
                                ...s,
                                staffType: s.staffType || 'teaching_assistant',
                              },
                              isAr ? 'ar' : 'en',
                            )}
                          </span>
                          <span className="rounded px-1.5 py-0.2 text-[10px] font-bold border border-purple-500/30 bg-purple-500/10 text-purple-300">
                            {s.staffType === 'assistant_lecturer'
                              ? isAr
                                ? 'مدرس مساعد'
                                : 'A.L.'
                              : isAr
                                ? 'معيد'
                                : 'TA'}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 2: Type, Day, Level */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  {isAr ? 'نوع الموعد' : 'Slot Type'}
                </label>
                <Select
                  value={formType}
                  onValueChange={(val) => setFormType(val as any)}
                >
                  <SelectTrigger className="h-9 rounded-squircle text-xs font-medium border-border bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lecture">{isAr ? 'محاضرة' : 'Lecture'}</SelectItem>
                    <SelectItem value="section">{isAr ? 'سكشن' : 'Section'}</SelectItem>
                    <SelectItem value="lab">{isAr ? 'معمل' : 'Lab'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  {isAr ? 'اليوم' : 'Day of Week'}
                </label>
                <Select value={formDay} onValueChange={setFormDay}>
                  <SelectTrigger className="h-9 rounded-squircle text-xs font-medium border-border bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(isAr ? DAY_LABELS_AR : DAY_LABELS_EN).map(
                      ([val, label]) => (
                        <SelectItem key={val} value={val}>
                          {label}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  {isAr ? 'المستوى' : 'Level'}
                </label>
                <Select value={formLevel} onValueChange={setFormLevel}>
                  <SelectTrigger className="h-9 rounded-squircle text-xs font-medium border-border bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">{isAr ? 'المستوى الأول' : 'Level 1'}</SelectItem>
                    <SelectItem value="2">{isAr ? 'المستوى الثاني' : 'Level 2'}</SelectItem>
                    <SelectItem value="3">{isAr ? 'المستوى الثالث' : 'Level 3'}</SelectItem>
                    <SelectItem value="4">{isAr ? 'المستوى الرابع' : 'Level 4'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 3: Start Time & End Time with Time Picker & Quick Presets */}
            <div className="space-y-2.5 rounded-xl border border-border/70 bg-secondary/10 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-primary" />
                  <span>{isAr ? 'توقيت المحاضرة / السكشن *' : 'Lecture / Section Timing *'}</span>
                </span>
                {startMins !== null && endMins !== null && endMins > startMins && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-teal-500/30 bg-teal-500/10 px-2 py-0.5 text-[10px] font-bold text-teal-300">
                    <CheckCircle2 className="h-3 w-3 text-teal-400" />
                    <span>
                      {isAr
                        ? `المدة: ${formatDurationText(endMins - startMins, isAr)}`
                        : `Duration: ${formatDurationText(endMins - startMins, isAr)}`}
                    </span>
                  </span>
                )}
              </div>

              {/* Time Inputs */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground">
                    {isAr ? 'وقت البدء *' : 'Start Time *'}
                  </label>
                  <TimePicker
                    value={formStartTime}
                    onChange={setFormStartTime}
                    placeholder="09:00 AM"
                    locale={locale}
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground">
                    {isAr ? 'وقت الانتهاء *' : 'End Time *'}
                  </label>
                  <TimePicker
                    value={formEndTime}
                    onChange={setFormEndTime}
                    placeholder="11:00 AM"
                    locale={locale}
                    required
                  />
                </div>
              </div>

              {/* Quick Time Presets */}
              <div className="pt-1">
                <span className="text-[10px] text-muted-foreground block mb-1">
                  {isAr ? 'فترات سريعة شائعة:' : 'Quick time presets:'}
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {TIME_SLOT_PRESETS.map((preset) => {
                    const isSelected =
                      formStartTime === preset.start && formEndTime === preset.end;
                    return (
                      <button
                        key={preset.start + preset.end}
                        type="button"
                        onClick={() => {
                          setFormStartTime(preset.start);
                          setFormEndTime(preset.end);
                        }}
                        className={`rounded-md border px-2 py-0.5 text-[10px] font-medium transition-colors cursor-pointer ${
                          isSelected
                            ? 'border-primary bg-primary/20 text-primary font-bold'
                            : 'border-border/60 bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground'
                        }`}
                      >
                        {isAr ? preset.labelAr : preset.labelEn}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Time Validation Error Banner */}
              {timeValidationError && (
                <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-300">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
                  <span>{timeValidationError}</span>
                </div>
              )}

              {/* Conflict Warning Banner */}
              {scheduleConflicts.length > 0 && (
                <div className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-300">
                  <div className="flex items-center gap-1.5 font-bold text-amber-400">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>
                      {isAr
                        ? 'تنبيه: تم رصد تعارض في الجدول!'
                        : 'Warning: Schedule conflicts detected!'}
                    </span>
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-200/90 pr-1">
                    {scheduleConflicts.map((c, idx) => (
                      <li key={idx}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Row 4: Location / Hall Place + Quick Presets */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-primary" />
                  <span>{isAr ? 'مكان المحاضرة / القاعة / المدرج *' : 'Hall / Room Location *'}</span>
                </label>
                <span className="text-[10px] text-muted-foreground">
                  {isAr ? 'اختر أو اكتب اسم القاعة' : 'Choose or type room'}
                </span>
              </div>
              <Input
                value={formLocation}
                onChange={(e) => setFormLocation(e.target.value)}
                placeholder={
                  isAr
                    ? 'مثال: مدرج 1، قاعة 204، معمل حاسب 2'
                    : 'e.g. Auditorium 1, Hall 204, Computer Lab 2'
                }
                className="rounded-squircle text-xs"
                required
              />
              {/* Location Quick Pills */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {LOCATION_SUGGESTIONS.map((loc) => (
                  <button
                    key={loc}
                    type="button"
                    onClick={() => setFormLocation(loc)}
                    className="rounded-md border border-border/60 bg-secondary/40 px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors cursor-pointer"
                  >
                    {loc}
                  </button>
                ))}
              </div>
            </div>

            {/* Row 5: Group, Section & Department */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  {isAr ? 'القسم / التخصص' : 'Department'}
                </label>
                <Select value={formDepartment} onValueChange={setFormDepartment}>
                  <SelectTrigger className="h-9 rounded-squircle text-xs font-medium border-border bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GENERAL">{isAr ? 'عام (GENERAL)' : 'GENERAL'}</SelectItem>
                    <SelectItem value="BIS">{isAr ? 'نظم المعلومات (BIS)' : 'BIS'}</SelectItem>
                    <SelectItem value="CS">{isAr ? 'علوم الحاسب (CS)' : 'CS'}</SelectItem>
                    <SelectItem value="ACCOUNTING">{isAr ? 'محاسبة (Accounting)' : 'Accounting'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  {isAr ? 'المجموعة / الدفعة' : 'Group'}
                </label>
                <Input
                  value={formGroup}
                  onChange={(e) => setFormGroup(e.target.value)}
                  placeholder={isAr ? 'Group A' : 'Group A'}
                  className="rounded-squircle text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  {isAr ? 'السكشن' : 'Section'}
                </label>
                <Input
                  value={formSection}
                  onChange={(e) => setFormSection(e.target.value)}
                  placeholder={isAr ? 'Section 1' : 'Section 1'}
                  className="rounded-squircle text-xs"
                />
              </div>
            </div>

            <DialogFooter className="mt-4 gap-2 border-t border-border/80 pt-4 rtl:sm:justify-start">
              <Button
                type="submit"
                disabled={submitting || !!timeValidationError}
                className="rounded-squircle bg-primary text-xs font-semibold text-white hover:bg-primary-hover gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>
                  {editingItem
                    ? isAr
                      ? 'تحديث الموعد'
                      : 'Update Slot'
                    : isAr
                      ? 'حفظ وتثبيت الموعد'
                      : 'Save Slot'}
                </span>
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsAddOpen(false)}
                className="rounded-squircle text-xs cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Excel Bulk Import Modal */}
      <Dialog open={isUploadModalOpen} onOpenChange={setIsUploadModalOpen}>
        <DialogContent
          className="max-w-lg rounded-2xl border-border bg-card p-6 shadow-2xl"
          dir={isAr ? 'rtl' : 'ltr'}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-foreground">
              <FileSpreadsheet className="h-5 w-5 text-emerald-400" />
              <span>
                {isAr
                  ? 'استيراد جدول المحاضرات والسكاشن (Excel)'
                  : 'Bulk Import Schedules (Excel)'}
              </span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {isAr
                ? 'ارفع ملف شيت Excel لتوزيع المحاضرات والسكاشن والقاعات دفعة واحدة وتحديث النظام بسرعة'
                : 'Upload an Excel (.xlsx) file to allocate lectures, sections, and halls in bulk'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Step 1: Download Template */}
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Download className="h-4 w-4 text-primary" />
                  <span>
                    {isAr
                      ? 'الخطوة 1: تحميل نموذج Excel المعتمد'
                      : 'Step 1: Download Official Excel Template'}
                  </span>
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {isAr
                  ? 'يحتوي النموذج على الأعمدة المطلوبة (كود المقرر، اسم الدكتور/المعيد، نوع الموعد، اليوم، التوقيت، القاعة، المستوى) مع أمثلة استرشادية جاهزة.'
                  : 'Includes all required columns (course code, doctor username, type, day, time, hall, level) with ready-to-use sample rows.'}
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isDownloadingTemplate}
                  onClick={() => handleDownloadTemplate('xlsx')}
                  className="rounded-squircle text-xs border-primary/40 bg-background text-primary hover:bg-primary/10 gap-1.5 cursor-pointer"
                >
                  {isDownloadingTemplate ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" />
                  )}
                  <span>{isAr ? 'تحميل نموذج Excel (.xlsx)' : 'Download Excel (.xlsx)'}</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={isDownloadingTemplate}
                  onClick={() => handleDownloadTemplate('csv')}
                  className="rounded-squircle text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <span>{isAr ? 'تحميل كملف CSV' : 'Download CSV'}</span>
                </Button>
              </div>
            </div>

            {/* Step 2: File Dropzone */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Upload className="h-4 w-4 text-primary" />
                <span>
                  {isAr
                    ? 'الخطوة 2: اختيار ورفع ملف شيت المواعيد'
                    : 'Step 2: Choose & Upload Schedule File'}
                </span>
              </label>

              <div
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border/80 bg-secondary/20 p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-secondary/40 transition-all"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls, .csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setSelectedFile(file);
                      setUploadResult(null);
                    }
                  }}
                />
                <FileSpreadsheet className="h-10 w-10 text-primary mb-2" />
                {selectedFile ? (
                  <div>
                    <p className="font-bold text-foreground text-xs">{selectedFile.name}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {(selectedFile.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs font-semibold text-foreground">
                      {isAr
                        ? 'انقر هنا لتحديد ملف Excel أو اسحبه إلى هذا المربع'
                        : 'Click to select Excel file or drag & drop here'}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {isAr ? 'يدعم ملفات XLSX, XLS, CSV حتى 10 ميجابايت' : 'Supports XLSX, XLS, CSV up to 10MB'}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Upload Progress Bar (Unified Batch Architecture) */}
            {uploadProgressState.isUploading && (
              <div className="pt-1">
                <DataUploadProgress state={uploadProgressState} locale={locale} />
              </div>
            )}

            {/* Upload Result Feedback */}
            {uploadResult && (
              <div
                className={`rounded-xl border p-4 text-xs space-y-2 ${
                  uploadResult.errorCount > 0 && uploadResult.insertedCount === 0 && uploadResult.updatedCount === 0
                    ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                    : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                }`}
              >
                <div className="flex items-center gap-2 font-bold">
                  {uploadResult.insertedCount > 0 || uploadResult.updatedCount > 0 ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-rose-400" />
                  )}
                  <span>
                    {isAr
                      ? `تمت معالجة ${uploadResult.totalRows} صف: ${uploadResult.insertedCount} جديد · ${uploadResult.updatedCount} محدث`
                      : `Processed ${uploadResult.totalRows} rows: ${uploadResult.insertedCount} inserted · ${uploadResult.updatedCount} updated`}
                  </span>
                </div>

                {uploadResult.errors.length > 0 && (
                  <div className="mt-2 space-y-1 text-[11px] text-rose-300 border-t border-rose-500/20 pt-2">
                    <p className="font-bold">
                      {isAr ? 'تنبيهات وأخطاء في بعض الصفوف:' : 'Row warnings/errors:'}
                    </p>
                    <ul className="list-disc list-inside space-y-0.5 max-h-32 overflow-y-auto">
                      {uploadResult.errors.map((err, idx) => (
                        <li key={idx}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="mt-4 gap-2 border-t border-border/80 pt-4 rtl:sm:justify-start">
            <Button
              type="button"
              disabled={!selectedFile || isUploading}
              onClick={handleUploadFile}
              className="rounded-squircle bg-primary text-xs font-semibold text-white hover:bg-primary-hover gap-1.5 cursor-pointer"
            >
              {isUploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              <span>{isAr ? 'بدء استيراد الشيت' : 'Start Import'}</span>
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsUploadModalOpen(false)}
              className="rounded-squircle text-xs cursor-pointer"
            >
              {isAr ? 'إغلاق' : 'Close'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={Boolean(itemToDelete)}
        onOpenChange={(open) => !open && setItemToDelete(null)}
        title={isAr ? 'حذف موعد المحاضرة/السكشن' : 'Delete Schedule Slot'}
        description={
          isAr
            ? `هل أنت متأكد من حذف هذا الموعد لمقرر ${itemToDelete?.courseCode} بقاعة (${itemToDelete?.location})؟ لا يمكن التراجع عن هذا الإجراء.`
            : `Are you sure you want to delete this schedule slot for ${itemToDelete?.courseCode} at ${itemToDelete?.location}? This action cannot be undone.`
        }
        confirmLabel={isAr ? 'تأكيد الحذف' : 'Confirm Delete'}
        cancelLabel={isAr ? 'إلغاء' : 'Cancel'}
        onConfirm={handleDelete}
        destructive
      />
    </div>
  );
}

export default function AdminSchedulesPage() {
  return (
    <Suspense fallback={<PageSkeletonLoader />}>
      <SchedulesManagementContent />
    </Suspense>
  );
}
