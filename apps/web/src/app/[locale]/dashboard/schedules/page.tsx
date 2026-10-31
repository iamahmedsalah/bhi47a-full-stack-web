'use client';

import React, { Suspense, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTableState } from '@/hooks/use-table-state';
import { WeeklyTimetable } from '@/features/course-schedules/weekly-timetable';
import { ScheduleGroupFilter, ScheduleSearch } from '@/features/course-schedules/schedule-filters';
import { filterScheduleEntries, parseScheduleTime, scheduleGroups } from '@/features/course-schedules/timetable-model';
import {
  CalendarDays,
  BookOpen,
  GraduationCap,
  Clock,
  MapPin,
  User,
  Layers,
  List,
  LayoutGrid,
  Calendar,
  Table2,
} from 'lucide-react';
import { toast } from 'sonner';
import { exportScheduleAsLandscapeImage, exportScheduleAsLandscapePdf, type ScheduleExportFormat } from '@/features/course-schedules/export-schedule-image';
import { ScheduleExportButtons } from '@/features/course-schedules/schedule-export-buttons';
import api from '@/lib/api';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PageTitleBanner } from '@/components/ui/page-title-banner';
import { LoadingState, EmptyState } from '@/components/ui/feedback';
import { formatStaffDisplayName } from '@student-portal/shared';

export interface StudentScheduleItem {
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
  dayOfWeek: 'saturday' | 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday';
  startTime: string;
  endTime: string;
  location: string;
  locationAr?: string;
  level: string;
  semester?: string;
  isActive?: boolean;
  department?: string;
  group?: string;
  section?: string;
  notes?: string;
}

const DAY_ORDER: Record<string, number> = {
  saturday: 1,
  sunday: 2,
  monday: 3,
  tuesday: 4,
  wednesday: 5,
  thursday: 6,
};

const DAY_LABELS_AR: Record<string, string> = {
  saturday: 'السبت',
  sunday: 'الأحد',
  monday: 'الإثنين',
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
    color: 'bg-teal-500/15 border-teal-500/40 text-teal-300',
  },
  section: {
    ar: 'سكشن',
    en: 'Section',
    color: 'bg-purple-500/15 border-purple-500/40 text-purple-300',
  },
  lab: {
    ar: 'معمل',
    en: 'Lab',
    color: 'bg-sky-500/15 border-sky-500/40 text-sky-300',
  },
};

export default function StudentSchedulesPage() {
  return <Suspense fallback={<LoadingState title="…" />}><StudentSchedulesContent /></Suspense>;
}

function StudentSchedulesContent() {
  const params = useParams();
  const locale = (params.locale as string) || 'ar';
  const isAr = locale === 'ar';
  const timetableText = useTranslations('courseTimetable');
  const { user } = useAuth();

  // Filters
  const tableState = useTableState({ defaultFilters: { day: 'all', level: 'all', group: 'all', department: 'all', category: 'all', view: 'timetable' } });
  const { search, setSearch } = tableState;
  const { day: selectedDay, level: selectedLevel, group: selectedGroup, department: selectedDepartment } = tableState.filters;
  const activeCategoryTab = tableState.filters.category === 'lecture' || tableState.filters.category === 'section' ? tableState.filters.category : 'all';
  const viewMode = ['daily', 'table', 'grid'].includes(tableState.filters.view) ? tableState.filters.view : 'timetable';
  const setSelectedDay = (value: string) => tableState.setFilter('day', value);
  const setSelectedLevel = (value: string) => tableState.setFilter('level', value);
  const setSelectedGroup = (value: string) => tableState.setFilter('group', value);
  const setSelectedDepartment = (value: string) => tableState.setFilter('department', value);
  const setActiveCategoryTab = (value: string) => tableState.setFilter('category', value);
  const setViewMode = (value: string) => tableState.setFilter('view', value);

  // Query schedules for students
  const schedulesQuery = useQuery({
    queryKey: ['student-schedules'],
    queryFn: async () => {
      const res = await api.get<StudentScheduleItem[]>('/course-schedules');
      return res.data ?? [];
    },
    staleTime: 60 * 1000,
    enabled: Boolean(user),
  });

  const rawSchedules = useMemo(() => (schedulesQuery.data ?? []).filter(item => item.isActive !== false), [schedulesQuery.data]);
  const groups = useMemo(() => scheduleGroups(rawSchedules), [rawSchedules]);

  // Filter schedules based on category, search, and filters
  const matchingSchedules = useMemo(() => filterScheduleEntries(rawSchedules, {
    day: selectedDay, level: selectedLevel, group: selectedGroup, department: selectedDepartment, search,
  }), [rawSchedules, selectedDay, selectedLevel, selectedGroup, selectedDepartment, search]);
  const filteredSchedules = useMemo(() => filterScheduleEntries(matchingSchedules, { category: activeCategoryTab }), [matchingSchedules, activeCategoryTab]);

  // Counts
  const totalCount = matchingSchedules.length;
  const lectureCount = useMemo(() => matchingSchedules.filter((s) => s.type === 'lecture').length, [matchingSchedules]);
  const sectionCount = useMemo(() => matchingSchedules.filter((s) => s.type === 'section' || s.type === 'lab').length, [matchingSchedules]);

  // Group schedules by day for Daily View
  const schedulesByDay = useMemo(() => {
    const grouped: Record<string, StudentScheduleItem[]> = {
      saturday: [],
      sunday: [],
      monday: [],
      tuesday: [],
      wednesday: [],
      thursday: [],
    };

    for (const item of filteredSchedules) {
      if (grouped[item.dayOfWeek]) {
        grouped[item.dayOfWeek].push(item);
      }
    }

    // Sort each day's slots chronologically
    Object.keys(grouped).forEach((day) => {
      grouped[day].sort((a, b) => (parseScheduleTime(a.startTime) ?? Infinity) - (parseScheduleTime(b.startTime) ?? Infinity));
    });

    return grouped;
  }, [filteredSchedules]);

  // Determine current day of week to highlight
  const currentDayKey = useMemo(() => {
    return new Intl.DateTimeFormat('en', { weekday: 'long', timeZone: 'Africa/Cairo' }).format(new Date()).toLowerCase();
  }, []);

  const [exportingFormat, setExportingFormat] = React.useState<ScheduleExportFormat | null>(null);

  const handleDownloadImage = async (format: ScheduleExportFormat) => {
    if (exportingFormat) return;

    if (filteredSchedules.length === 0) {
      toast.warning(
        isAr
          ? 'لا توجد مواعيد مسجلة لهذه الفرقة لعرضها في صورة الجدول.'
          : 'No schedules found for this level to export as an image.',
      );
      return;
    }

    setExportingFormat(format);
    try {
      const exportFile = format === 'pdf' ? exportScheduleAsLandscapePdf : exportScheduleAsLandscapeImage;
      await exportFile({
        items: filteredSchedules,
        level: selectedLevel,
        department: selectedDepartment !== 'all' ? selectedDepartment : undefined,
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

  return (
    <div className="animate-fade-in space-y-6 p-2 md:p-6" dir={isAr ? 'rtl' : 'ltr'}>
      {/* Banner */}
      <PageTitleBanner
        title={isAr ? 'جدول المحاضرات والسكاشن الأسبوعي' : 'Weekly Lecture & Section Timetable'}
        subtitle={
          isAr
            ? 'استعرض مواعيد المحاضرات والسكاشن الأكاديمية وأماكن القاعات والمدرجات الدراسية'
            : 'View your weekly academic schedule, lecture timings, hall locations and instructors'
        }
        icon={<CalendarDays className="h-5 w-5 text-primary" />}
      >
        <div className="flex items-center gap-2 print:hidden">
          <ScheduleExportButtons locale={locale} busyFormat={exportingFormat} disabled={schedulesQuery.isPending || schedulesQuery.isError || filteredSchedules.length === 0} onExport={format => void handleDownloadImage(format)} />
        </div>
      </PageTitleBanner>

      {/* Tabs & View Mode Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        {/* Category Tabs */}
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

        {/* View Mode Toggle: Daily vs Table vs Grid */}
        <div className="flex flex-wrap items-center gap-1 rounded-2xl border border-border/70 bg-card/60 p-1 backdrop-blur-md">
          <button type="button" aria-pressed={viewMode === 'timetable'} onClick={() => setViewMode('timetable')} className={`flex items-center gap-1.5 rounded-squircle px-3 py-1.5 text-xs font-semibold transition-all ${viewMode === 'timetable' ? 'bg-primary text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}><Table2 className="h-3.5 w-3.5" aria-hidden="true" />{timetableText('view')}</button>
          <button
            type="button"
            onClick={() => setViewMode('daily')}
            className={`flex items-center gap-1.5 rounded-squircle px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
              viewMode === 'daily'
                ? 'bg-primary text-white shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Calendar className="h-3.5 w-3.5" />
            <span>{isAr ? 'أيام الأسبوع' : 'Daily View'}</span>
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
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            className={`flex items-center gap-1.5 rounded-squircle px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
              viewMode === 'grid'
                ? 'bg-primary text-white shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            <span>{isAr ? 'شبكة البطاقات' : 'Cards Grid'}</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/70 bg-card/60 p-4 backdrop-blur-md print:hidden">
        {/* Search */}
        <ScheduleSearch value={search} onChange={setSearch} />

        {/* Level Filter */}
        <div className="w-[140px]">
          <Select value={selectedLevel} onValueChange={setSelectedLevel}>
            <SelectTrigger aria-label={isAr ? 'تصفية حسب الفرقة' : 'Filter by level'} className="h-9 rounded-squircle text-xs font-medium border-border bg-background">
              <SelectValue placeholder={isAr ? 'جميع الفرق' : 'All Levels'} />
            </SelectTrigger>
            <SelectContent dir={isAr ? 'rtl' : 'ltr'}>
              <SelectItem value="all">{isAr ? 'جميع الفرق' : 'All Levels'}</SelectItem>
              <SelectItem value="1">{isAr ? 'الفرقة الأولى' : 'Level 1'}</SelectItem>
              <SelectItem value="2">{isAr ? 'الفرقة الثانية' : 'Level 2'}</SelectItem>
              <SelectItem value="3">{isAr ? 'الفرقة الثالثة' : 'Level 3'}</SelectItem>
              <SelectItem value="4">{isAr ? 'الفرقة الرابعة' : 'Level 4'}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Group Filter */}
        <div className="w-[130px]">
          <ScheduleGroupFilter value={selectedGroup} groups={groups} onChange={setSelectedGroup} />
        </div>

        {/* Day Filter */}
        <div className="w-[140px]">
          <Select value={selectedDay} onValueChange={setSelectedDay}>
            <SelectTrigger className="h-9 rounded-squircle text-xs font-medium border-border bg-background">
              <SelectValue placeholder={isAr ? 'جميع الأيام' : 'All Days'} />
            </SelectTrigger>
            <SelectContent dir={isAr ? 'rtl' : 'ltr'}>
              <SelectItem value="all">{isAr ? 'جميع الأيام' : 'All Days'}</SelectItem>
              {Object.entries(isAr ? DAY_LABELS_AR : DAY_LABELS_EN).map(([val, label]) => (
                <SelectItem key={val} value={val}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Department Filter */}
        <div className="w-[140px]">
          <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
            <SelectTrigger className="h-9 rounded-squircle text-xs font-medium border-border bg-background">
              <SelectValue placeholder={isAr ? 'جميع الأقسام' : 'All Depts'} />
            </SelectTrigger>
            <SelectContent dir={isAr ? 'rtl' : 'ltr'}>
              <SelectItem value="all">{isAr ? 'جميع الأقسام' : 'All Depts'}</SelectItem>
              {[...new Set(rawSchedules.map(item => item.department).filter((value): value is string => Boolean(value)))].sort().map(department => <SelectItem key={department} value={department}><bdi>{department === 'GENERAL' ? timetableText('general') : department}</bdi></SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Reset button if filtered */}
        {(selectedDay !== 'all' || selectedLevel !== 'all' || selectedGroup !== 'all' || selectedDepartment !== 'all' || search) && (
          <Button
            type="button"
            variant="ghost"
            onClick={tableState.resetAll}
            className="rounded-squircle text-xs text-muted-foreground hover:text-foreground h-9 px-3"
          >
            {isAr ? 'إعادة ضبط' : 'Reset'}
          </Button>
        )}
      </div>

      {/* Main Content Area */}
      {schedulesQuery.isError ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-5 text-sm"><span>{timetableText('loadFailed')}</span><Button type="button" variant="outline" onClick={() => void schedulesQuery.refetch()}>{timetableText('retry')}</Button></div> : schedulesQuery.isLoading ? (
        <LoadingState title={isAr ? 'جارٍ تحميل الجدول الدراسي...' : 'Loading schedules...'} />
      ) : filteredSchedules.length === 0 ? (
        <EmptyState
          title={isAr ? 'لا توجد مواعيد محاضرات مطابقة' : 'No schedules found'}
          description={
            isAr
              ? 'لم يتم العثور على أي مواعيد مطابقة لخيارات التصفية المحددة. جرب تغيير الفرقة أو المجموعة أو اليوم.'
              : 'No schedules match the selected filters. Try changing level, group or day.'
          }
        />
      ) : viewMode === 'timetable' ? <WeeklyTimetable entries={filteredSchedules} category={activeCategoryTab} /> : viewMode === 'daily' ? (
        /* Daily Grouped View */
        <div className="space-y-6">
          {Object.entries(DAY_ORDER)
            .sort(([, a], [, b]) => a - b)
            .map(([dayKey]) => {
              const items = schedulesByDay[dayKey] || [];
              if (selectedDay !== 'all' && selectedDay !== dayKey) return null;
              if (items.length === 0) return null;

              const dayName = isAr ? DAY_LABELS_AR[dayKey] : DAY_LABELS_EN[dayKey];
              const isToday = currentDayKey === dayKey;

              return (
                <div
                  key={dayKey}
                  className={`rounded-2xl border transition-all ${
                    isToday
                      ? 'border-primary/50 bg-card/90 shadow-md ring-1 ring-primary/30'
                      : 'border-border/70 bg-card/60'
                  } p-5 backdrop-blur-md`}
                >
                  {/* Day Header */}
                  <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-3 mb-4">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-xl font-bold text-xs ${
                          isToday
                            ? 'bg-primary text-white shadow-sm'
                            : 'border border-primary/30 bg-primary/10 text-primary'
                        }`}
                      >
                        <Calendar className="h-4 w-4" />
                      </div>
                      <h3 className="text-base font-bold text-foreground">{dayName}</h3>
                      {isToday && (
                        <span className="rounded-squircle border border-teal-500/40 bg-teal-500/15 px-2.5 py-0.5 text-[11px] font-bold text-teal-300">
                          {isAr ? 'اليوم' : 'Today'}
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-semibold text-muted-foreground">
                      {isAr ? `${items.length} جلسات دراسية` : `${items.length} sessions`}
                    </span>
                  </div>

                  {/* Sessions Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                    {items.map((item) => {
                      const typeMeta = TYPE_LABELS[item.type] || TYPE_LABELS.lecture;
                      return (
                        <div
                          key={item._id}
                          className="flex flex-col justify-between rounded-xl border border-border/70 bg-background/60 p-3.5 hover:border-primary/40 hover:bg-background/90 transition-all shadow-xs"
                        >
                          <div>
                            {/* Top row: Type & Time */}
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <span
                                className={`rounded-squircle border px-2 py-0.5 text-[10px] font-bold ${typeMeta.color}`}
                              >
                                {isAr ? typeMeta.ar : typeMeta.en}
                              </span>
                              <div className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
                                <Clock className="h-3 w-3 text-primary shrink-0" />
                                <span>
                                  {item.startTime} - {item.endTime}
                                </span>
                              </div>
                            </div>

                            {/* Course Title */}
                            <h4 className="font-bold text-sm text-foreground mb-1 leading-snug">
                              {isAr ? item.courseNameAr || item.courseName : item.courseName}
                            </h4>
                            <div className="font-mono text-[11px] text-primary font-semibold mb-2.5">
                              {item.courseCode}
                            </div>

                            {/* Staff Member */}
                            <div className="flex items-center gap-2 rounded-lg bg-secondary/40 p-2 text-xs mb-2.5">
                              <User className="h-3.5 w-3.5 text-primary shrink-0" />
                              <div className="truncate">
                                <span className="font-semibold text-foreground">
                                  {formatStaffDisplayName(
                                    {
                                      name: item.staffName,
                                      nameAr: item.staffNameAr,
                                      staffType: item.staffType,
                                    },
                                    isAr ? 'ar' : 'en',
                                  )}
                                </span>
                                <span className="text-[10px] text-muted-foreground block">
                                  {item.staffType === 'assistant_lecturer'
                                    ? isAr
                                      ? 'مدرس مساعد / هيئة معاونة'
                                      : 'Assistant Lecturer'
                                    : item.staffType === 'teaching_assistant'
                                      ? isAr
                                        ? 'معيد / هيئة معاونة'
                                        : 'Teaching Assistant'
                                      : isAr
                                        ? 'أستاذ المادة (دكتور)'
                                        : 'Course Doctor'}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Location & Batch info */}
                          <div className="flex items-center justify-between border-t border-border/50 pt-2 text-xs">
                            <span className="flex items-center gap-1 rounded-squircle border border-primary/30 bg-primary/10 px-2 py-0.5 font-bold text-primary text-[11px]">
                              <MapPin className="h-3 w-3 shrink-0" />
                              <span>{item.location}</span>
                            </span>
                            <div className="text-[11px] text-muted-foreground">
                              <span>{isAr ? `الفرقة ${item.level}` : `L${item.level}`}</span>
                              {(item.group || item.section) && (
                                <span className="font-medium text-foreground ms-1">
                                  ({item.group ? `${item.group}` : ''}
                                  {item.section ? `/${item.section}` : ''})
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
        </div>
      ) : viewMode === 'grid' ? (
        /* Cards Grid View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSchedules.map((item) => {
            const typeMeta = TYPE_LABELS[item.type] || TYPE_LABELS.lecture;
            const dayName = isAr ? DAY_LABELS_AR[item.dayOfWeek] : DAY_LABELS_EN[item.dayOfWeek];

            return (
              <div
                key={item._id}
                className="flex flex-col justify-between rounded-2xl border border-border/80 bg-card/80 p-4 shadow-sm hover:border-primary/40 hover:shadow-md transition-all backdrop-blur-md"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-3 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-foreground text-sm">{dayName}</span>
                      <span className={`rounded-squircle border px-2 py-0.5 text-[11px] font-bold ${typeMeta.color}`}>
                        {isAr ? typeMeta.ar : typeMeta.en}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
                      <Clock className="h-3 w-3 text-primary shrink-0" />
                      <span>
                        {item.startTime} - {item.endTime}
                      </span>
                    </div>
                  </div>

                  <h4 className="font-bold text-base text-foreground mb-1">
                    {isAr ? item.courseNameAr || item.courseName : item.courseName}
                  </h4>
                  <div className="font-mono text-xs text-primary font-semibold mb-3">
                    {item.courseCode}
                  </div>

                  <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-secondary/30 p-2.5 text-xs mb-3">
                    <User className="h-4 w-4 text-primary shrink-0" />
                    <div>
                      <span className="font-semibold text-foreground block">
                        {formatStaffDisplayName(
                          {
                            name: item.staffName,
                            nameAr: item.staffNameAr,
                            staffType: item.staffType,
                          },
                          isAr ? 'ar' : 'en',
                        )}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {item.staffType === 'assistant_lecturer'
                          ? isAr
                            ? 'هيئة معاونة (مدرس مساعد)'
                            : 'Assistant Lecturer'
                          : item.staffType === 'teaching_assistant'
                            ? isAr
                              ? 'هيئة معاونة (معيد)'
                              : 'Teaching Assistant'
                            : isAr
                              ? 'أستاذ مقرر (دكتور)'
                              : 'Doctor'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-border/60 pt-3 text-xs">
                  <span className="flex items-center gap-1.5 rounded-squircle border border-primary/30 bg-primary/10 px-2.5 py-1 font-bold text-primary">
                    <MapPin className="h-3.5 w-3.5" />
                    <span>{item.location}</span>
                  </span>
                  <div className="text-[11px] text-muted-foreground">
                    <span>{isAr ? `الفرقة ${item.level}` : `Level ${item.level}`}</span>
                    {item.department && <span> · {item.department}</span>}
                    {(item.group || item.section) && (
                      <span className="font-medium text-primary ms-1">
                        ({item.group ? `${item.group}` : ''}
                        {item.section ? `/${item.section}` : ''})
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table View */
        <div className="rounded-2xl border border-border/80 bg-card/60 backdrop-blur-md shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-start text-xs">
              <thead className="bg-secondary/40 text-muted-foreground font-semibold border-b border-border/80">
                <tr>
                  <th className="px-4 py-3.5 text-start">{isAr ? 'المقرر الدراسي' : 'COURSE'}</th>
                  <th className="px-4 py-3.5 text-start">{isAr ? 'القائم بالتدريس' : 'INSTRUCTOR'}</th>
                  <th className="px-4 py-3.5 text-center">{isAr ? 'النوع' : 'TYPE'}</th>
                  <th className="px-4 py-3.5 text-start">{isAr ? 'اليوم والتوقيت' : 'DAY & TIME'}</th>
                  <th className="px-4 py-3.5 text-start">{isAr ? 'المكان / القاعة' : 'HALL / LOCATION'}</th>
                  <th className="px-4 py-3.5 text-start">{isAr ? 'الفرقة والمجموعة' : 'LEVEL & GROUP'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredSchedules.map((item) => {
                  const typeMeta = TYPE_LABELS[item.type] || TYPE_LABELS.lecture;
                  const dayName = isAr ? DAY_LABELS_AR[item.dayOfWeek] : DAY_LABELS_EN[item.dayOfWeek];

                  return (
                    <tr key={item._id} className="hover:bg-secondary/30 transition-colors">
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
                      <td className="px-4 py-3.5 text-foreground font-medium">
                        <div className="flex items-center gap-1.5 font-semibold">
                          <User className="h-3.5 w-3.5 text-primary/80 shrink-0" />
                          <span>
                            {formatStaffDisplayName(
                              {
                                name: item.staffName,
                                nameAr: item.staffNameAr,
                                staffType: item.staffType,
                              },
                              isAr ? 'ar' : 'en',
                            )}
                          </span>
                        </div>
                        <div className="text-[10px] text-muted-foreground ms-5">
                          {item.staffType === 'assistant_lecturer'
                            ? isAr
                              ? 'هيئة معاونة (مدرس مساعد)'
                              : 'Assistant Lecturer'
                            : item.staffType === 'teaching_assistant'
                              ? isAr
                                ? 'هيئة معاونة (معيد)'
                                : 'Teaching Assistant'
                              : isAr
                                ? 'أستاذ مقرر (دكتور)'
                                : 'Doctor'}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className={`inline-block rounded-squircle border px-2.5 py-1 text-xs font-bold ${typeMeta.color}`}>
                          {isAr ? typeMeta.ar : typeMeta.en}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-foreground">
                        <div className="font-semibold text-xs">{dayName}</div>
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5 font-mono">
                          <Clock className="h-3 w-3 text-primary/70" />
                          <span>
                            {item.startTime} - {item.endTime}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="inline-flex items-center gap-1.5 rounded-squircle border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
                          <MapPin className="h-3.5 w-3.5" />
                          <span>{item.location}</span>
                        </span>
                      </td>
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
