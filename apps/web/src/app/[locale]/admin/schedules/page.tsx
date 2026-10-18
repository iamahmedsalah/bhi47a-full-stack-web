'use client';

import React, { Suspense, useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import {
  CalendarDays,
  Plus,
  Search,
  MoreVertical,
  Edit2,
  Trash2,
  MapPin,
  Clock,
  BookOpen,
  UserCheck,
  GraduationCap,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

import api, { getApiErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

export interface CourseScheduleItem {
  _id: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  courseNameAr?: string;
  staffId: string;
  staffName: string;
  staffType: 'doctor' | 'teaching_assistant';
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

function SchedulesManagementContent() {
  const params = useParams();
  const locale = (params?.locale as string) || 'ar';
  const isAr = locale === 'ar';
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [selectedDay, setSelectedDay] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedLevel, setSelectedLevel] = useState<string>('all');

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CourseScheduleItem | null>(null);
  const [itemToDelete, setItemToDelete] = useState<CourseScheduleItem | null>(null);

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
    queryKey: ['admin-schedules', selectedDay, selectedType, selectedLevel, search],
    queryFn: async () => {
      const res = await api.get<CourseScheduleItem[]>('/admin/course-schedules', {
        params: {
          dayOfWeek: selectedDay !== 'all' ? selectedDay : undefined,
          type: selectedType !== 'all' ? selectedType : undefined,
          level: selectedLevel !== 'all' ? selectedLevel : undefined,
          search: search || undefined,
        },
      });
      return res.data ?? [];
    },
  });

  // 2. Fetch courses list for dropdown
  const coursesQuery = useQuery({
    queryKey: ['admin-courses-dropdown'],
    queryFn: async () => {
      const res = await api.get<any>('/admin/courses', { params: { limit: 100 } });
      return res.data?.items ?? [];
    },
  });

  // 3. Fetch staff list for dropdown
  const staffQuery = useQuery({
    queryKey: ['admin-staff-dropdown'],
    queryFn: async () => {
      const res = await api.get<any>('/admin/staff', { params: { limit: 100 } });
      return res.data?.items ?? [];
    },
  });

  const schedules = schedulesQuery.data ?? [];
  const courses = coursesQuery.data ?? [];
  const staffMembers = staffQuery.data ?? [];

  const handleOpenAdd = () => {
    setEditingItem(null);
    setFormCourseId(courses[0]?._id || '');
    setFormStaffId(staffMembers[0]?._id || '');
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
        <Button
          onClick={handleOpenAdd}
          className="flex items-center gap-2 rounded-squircle bg-primary font-semibold text-white shadow-lg shadow-primary/20 hover:bg-primary-hover active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          <span>{isAr ? 'إضافة موعد / قاعة' : 'Add Schedule Slot'}</span>
        </Button>
      </PageTitleBanner>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/70 bg-card/60 p-4 backdrop-blur-md">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              isAr
                ? 'بحث باسم المادة، الدكتور، القاعة، السكشن...'
                : 'Search course, staff, hall, section...'
            }
            className="ps-9 rounded-squircle"
          />
        </div>

        {/* Day Filter */}
        <select
          value={selectedDay}
          onChange={(e) => setSelectedDay(e.target.value)}
          className="h-9 rounded-squircle border border-border bg-background px-3 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
        >
          <option value="all">{isAr ? 'جميع الأيام' : 'All Days'}</option>
          {Object.entries(isAr ? DAY_LABELS_AR : DAY_LABELS_EN).map(([val, label]) => (
            <option key={val} value={val}>
              {label}
            </option>
          ))}
        </select>

        {/* Type Filter */}
        <select
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
          className="h-9 rounded-squircle border border-border bg-background px-3 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
        >
          <option value="all">{isAr ? 'جميع الأنواع' : 'All Types'}</option>
          <option value="lecture">{isAr ? 'محاضرة' : 'Lecture'}</option>
          <option value="section">{isAr ? 'سكشن' : 'Section'}</option>
          <option value="lab">{isAr ? 'معمل' : 'Lab'}</option>
        </select>

        {/* Level Filter */}
        <select
          value={selectedLevel}
          onChange={(e) => setSelectedLevel(e.target.value)}
          className="h-9 rounded-squircle border border-border bg-background px-3 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
        >
          <option value="all">{isAr ? 'جميع الفرق' : 'All Levels'}</option>
          <option value="1">{isAr ? 'الفرقة الأولى' : 'Level 1'}</option>
          <option value="2">{isAr ? 'الفرقة الثانية' : 'Level 2'}</option>
          <option value="3">{isAr ? 'الفرقة الثالثة' : 'Level 3'}</option>
          <option value="4">{isAr ? 'الفرقة الرابعة' : 'Level 4'}</option>
        </select>
      </div>

      {/* Schedules Table */}
      <div className="overflow-hidden rounded-2xl border border-border/80 bg-card/60 backdrop-blur-md shadow-[var(--shadow-card)]">
        {schedulesQuery.isLoading ? (
          <div className="p-12">
            <PageSkeletonLoader />
          </div>
        ) : schedules.length === 0 ? (
          <div className="p-8">
            <EmptyState
              title={isAr ? 'لا توجد مواعيد مسجلة' : 'No schedule slots recorded'}
              description={
                isAr
                  ? 'اضغط على زر "إضافة موعد / قاعة" لتسجيل وتوزيع المحاضرات والسكاشن والقاعات.'
                  : 'Click "Add Schedule Slot" to register lecture and section room allocations.'
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-start text-xs">
              <thead className="border-b border-border/80 bg-background/70 text-muted-foreground uppercase text-[11px] font-semibold tracking-wider">
                <tr>
                  <th className="px-4 py-3.5 text-start">{isAr ? 'المقرر الدراسي' : 'Course'}</th>
                  <th className="px-4 py-3.5 text-start">{isAr ? 'القائم بالتدريس' : 'Staff / Doctor'}</th>
                  <th className="px-4 py-3.5 text-center">{isAr ? 'النوع' : 'Type'}</th>
                  <th className="px-4 py-3.5 text-start">{isAr ? 'اليوم والميعاد' : 'Day & Time'}</th>
                  <th className="px-4 py-3.5 text-start">{isAr ? 'مكان المحاضرة / القاعة' : 'Hall / Location'}</th>
                  <th className="px-4 py-3.5 text-start">{isAr ? 'الفرقة والشعبة' : 'Level & Group'}</th>
                  <th className="px-4 py-3.5 text-center">{isAr ? 'إجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 font-medium">
                {schedules.map((item) => {
                  const typeMeta = TYPE_LABELS[item.type] || TYPE_LABELS.lecture;
                  return (
                    <tr
                      key={item._id}
                      className="hover:bg-primary/5 transition-colors group"
                    >
                      {/* Course */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-squircle bg-primary/10 text-primary shrink-0 border border-primary/20">
                            <BookOpen className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="font-bold text-foreground">
                              {isAr ? (item.courseNameAr || item.courseName) : item.courseName}
                            </div>
                            <div className="font-mono text-[11px] text-primary">
                              {item.courseCode}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Staff */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5 text-foreground font-semibold">
                          <UserCheck className="h-3.5 w-3.5 text-emerald-400" />
                          <span>{item.staffName}</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          {item.staffType === 'doctor'
                            ? (isAr ? 'أستاذ مقرر (دكتور)' : 'Doctor')
                            : (isAr ? 'معيد / مدرس مساعد' : 'Instructor')}
                        </span>
                      </td>

                      {/* Type Badge */}
                      <td className="px-4 py-3.5 text-center">
                        <span
                          className={`inline-flex items-center rounded-squircle border px-2.5 py-0.5 text-[11px] font-bold ${typeMeta.color}`}
                        >
                          {isAr ? typeMeta.ar : typeMeta.en}
                        </span>
                      </td>

                      {/* Day & Time */}
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-foreground">
                          {isAr ? DAY_LABELS_AR[item.dayOfWeek] : DAY_LABELS_EN[item.dayOfWeek]}
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground font-mono">
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
                          {isAr ? `الفرقة ${item.level}` : `Level ${item.level}`}
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
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="max-w-xl rounded-2xl border-border bg-card p-6 shadow-2xl" dir={isAr ? 'rtl' : 'ltr'}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-foreground">
              <CalendarDays className="h-5 w-5 text-primary" />
              <span>
                {editingItem
                  ? (isAr ? 'تعديل موعد محاضرة / سكشن' : 'Edit Schedule Slot')
                  : (isAr ? 'إضافة موعد محاضرة / سكشن وقاعة' : 'Add Lecture / Section Slot')}
              </span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {isAr
                ? 'حدد المادة وعضو هيئة التدريس والقاعة والتوقيت الأسبوعي'
                : 'Select course, teaching staff, room location, and weekly timetable'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-4 pt-2">
            {/* Row 1: Course & Staff */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  {isAr ? 'المقرر الدراسي *' : 'Course *'}
                </label>
                <select
                  value={formCourseId}
                  onChange={(e) => setFormCourseId(e.target.value)}
                  className="w-full h-9 rounded-squircle border border-border bg-background px-3 text-xs font-medium text-foreground focus:ring-1 focus:ring-primary cursor-pointer"
                  required
                >
                  <option value="" disabled>
                    {isAr ? '-- اختر المادة --' : '-- Select Course --'}
                  </option>
                  {courses.map((c: any) => (
                    <option key={c._id} value={c._id}>
                      {c.code} - {isAr ? (c.nameAr || c.name) : c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  {isAr ? 'القائم بالتدريس (دكتور/معيد) *' : 'Staff Member *'}
                </label>
                <select
                  value={formStaffId}
                  onChange={(e) => setFormStaffId(e.target.value)}
                  className="w-full h-9 rounded-squircle border border-border bg-background px-3 text-xs font-medium text-foreground focus:ring-1 focus:ring-primary cursor-pointer"
                  required
                >
                  <option value="" disabled>
                    {isAr ? '-- اختر عضو هيئة التدريس --' : '-- Select Staff Member --'}
                  </option>
                  {staffMembers.map((s: any) => (
                    <option key={s._id} value={s._id}>
                      {s.name} ({s.staffType === 'doctor' ? (isAr ? 'دكتور' : 'Doctor') : (isAr ? 'معيد' : 'TA')})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Row 2: Type, Day, Level */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  {isAr ? 'النوع' : 'Slot Type'}
                </label>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value as any)}
                  className="w-full h-9 rounded-squircle border border-border bg-background px-3 text-xs font-medium text-foreground focus:ring-1 focus:ring-primary cursor-pointer"
                >
                  <option value="lecture">{isAr ? 'محاضرة' : 'Lecture'}</option>
                  <option value="section">{isAr ? 'سكشن' : 'Section'}</option>
                  <option value="lab">{isAr ? 'معمل' : 'Lab'}</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  {isAr ? 'اليوم' : 'Day of Week'}
                </label>
                <select
                  value={formDay}
                  onChange={(e) => setFormDay(e.target.value)}
                  className="w-full h-9 rounded-squircle border border-border bg-background px-3 text-xs font-medium text-foreground focus:ring-1 focus:ring-primary cursor-pointer"
                >
                  {Object.entries(isAr ? DAY_LABELS_AR : DAY_LABELS_EN).map(([val, label]) => (
                    <option key={val} value={val}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  {isAr ? 'الفرقة' : 'Level'}
                </label>
                <select
                  value={formLevel}
                  onChange={(e) => setFormLevel(e.target.value)}
                  className="w-full h-9 rounded-squircle border border-border bg-background px-3 text-xs font-medium text-foreground focus:ring-1 focus:ring-primary cursor-pointer"
                >
                  <option value="1">{isAr ? 'الفرقة الأولى' : 'Level 1'}</option>
                  <option value="2">{isAr ? 'الفرقة الثانية' : 'Level 2'}</option>
                  <option value="3">{isAr ? 'الفرقة الثالثة' : 'Level 3'}</option>
                  <option value="4">{isAr ? 'الفرقة الرابعة' : 'Level 4'}</option>
                </select>
              </div>
            </div>

            {/* Row 3: Start Time & End Time */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  {isAr ? 'وقت البدء *' : 'Start Time *'}
                </label>
                <Input
                  value={formStartTime}
                  onChange={(e) => setFormStartTime(e.target.value)}
                  placeholder="09:00 AM"
                  className="rounded-squircle text-xs"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  {isAr ? 'وقت الانتهاء *' : 'End Time *'}
                </label>
                <Input
                  value={formEndTime}
                  onChange={(e) => setFormEndTime(e.target.value)}
                  placeholder="11:00 AM"
                  className="rounded-squircle text-xs"
                  required
                />
              </div>
            </div>

            {/* Row 4: Location / Hall Place */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-primary" />
                <span>{isAr ? 'مكان المحاضرة / القاعة / المدرج *' : 'Hall / Room Location *'}</span>
              </label>
              <Input
                value={formLocation}
                onChange={(e) => setFormLocation(e.target.value)}
                placeholder={isAr ? 'مثال: مدرج 1، قاعة 204، معمل حاسب 2' : 'e.g. Auditorium 1, Hall 204, Computer Lab 2'}
                className="rounded-squircle text-xs"
                required
              />
            </div>

            {/* Row 5: Group & Section */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  {isAr ? 'المجموعة / الفرقة (اختياري)' : 'Group (Optional)'}
                </label>
                <Input
                  value={formGroup}
                  onChange={(e) => setFormGroup(e.target.value)}
                  placeholder={isAr ? 'مجموعة أ' : 'Group A'}
                  className="rounded-squircle text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  {isAr ? 'السكشن (اختياري)' : 'Section (Optional)'}
                </label>
                <Input
                  value={formSection}
                  onChange={(e) => setFormSection(e.target.value)}
                  placeholder={isAr ? 'سكشن 1' : 'Section 1'}
                  className="rounded-squircle text-xs"
                />
              </div>
            </div>

            <DialogFooter className="mt-4 gap-2 border-t border-border/80 pt-4 rtl:sm:justify-start">
              <Button
                type="submit"
                disabled={submitting}
                className="rounded-squircle bg-primary text-xs font-semibold text-white hover:bg-primary-hover gap-1.5"
              >
                {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>
                  {editingItem
                    ? (isAr ? 'تحديث الموعد' : 'Update Slot')
                    : (isAr ? 'حفظ وتثبيت الموعد' : 'Save Slot')}
                </span>
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsAddOpen(false)}
                className="rounded-squircle text-xs"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </Button>
            </DialogFooter>
          </form>
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
