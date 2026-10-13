'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CalendarClock,
  Eye,
  EyeOff,
  Layers,
  Loader2,
  CheckCircle2,
  AlertCircle,
  GraduationCap,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  getGradesSettings,
  updateGradesSettings,
  publishGradesBulk,
  type GradesSettingsData,
} from '@/features/grades/api';

interface GradesPublishingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAr?: boolean;
}

const ACADEMIC_LEVELS = [
  { level: '1', labelEn: 'Level 1 (Freshman)', labelAr: 'الفرقة الأولى' },
  { level: '2', labelEn: 'Level 2 (Sophomore)', labelAr: 'الفرقة الثانية' },
  { level: '3', labelEn: 'Level 3 (Junior)', labelAr: 'الفرقة الثالثة' },
  { level: '4', labelEn: 'Level 4 (Senior)', labelAr: 'الفرقة الرابعة' },
];

export function GradesPublishingModal({
  open,
  onOpenChange,
  isAr = true,
}: GradesPublishingModalProps) {
  const queryClient = useQueryClient();

  // Settings query
  const settingsQuery = useQuery({
    queryKey: ['grades-settings'],
    queryFn: getGradesSettings,
    enabled: open,
  });

  const [openAt, setOpenAt] = useState('');
  const [closeAt, setCloseAt] = useState('');
  const [selectedExamType, setSelectedExamType] = useState('all');
  const [isUpdatingBulk, setIsUpdatingBulk] = useState(false);

  useEffect(() => {
    if (settingsQuery.data) {
      setOpenAt(settingsQuery.data.gradesOpenAt ? settingsQuery.data.gradesOpenAt.slice(0, 16) : '');
      setCloseAt(settingsQuery.data.gradesCloseAt ? settingsQuery.data.gradesCloseAt.slice(0, 16) : '');
    }
  }, [settingsQuery.data]);

  // Mutation to update settings
  const updateSettingsMutation = useMutation({
    mutationFn: (patch: Partial<GradesSettingsData>) => updateGradesSettings(patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grades-settings'] });
      queryClient.invalidateQueries({ queryKey: ['grades'] });
      toast.success(isAr ? 'تم تحديث إعدادات نشر الدرجات' : 'Grades publishing settings updated');
    },
    onError: () => {
      toast.error(isAr ? 'فشل تحديث إعدادات النشر' : 'Failed to update publishing settings');
    },
  });

  const currentSettings = settingsQuery.data;
  const publishedLevels = currentSettings?.gradesPublishedLevels ?? ['1', '2', '3', '4'];
  const isMasterOpen = currentSettings?.gradesSystemOpen ?? true;

  // Toggle master system
  const handleToggleMaster = () => {
    updateSettingsMutation.mutate({
      gradesSystemOpen: !isMasterOpen,
    });
  };

  // Toggle specific level in settings and database
  const handleToggleLevel = async (level: string) => {
    const isCurrentlyPublished = publishedLevels.includes(level);
    const newLevels = isCurrentlyPublished
      ? publishedLevels.filter((l) => l !== level)
      : [...publishedLevels, level];

    try {
      await updateSettingsMutation.mutateAsync({
        gradesPublishedLevels: newLevels,
      });

      // Synchronize database records for this level
      await publishGradesBulk({
        level,
        isPublished: !isCurrentlyPublished,
      });

      queryClient.invalidateQueries({ queryKey: ['grades'] });
      toast.success(
        isAr
          ? `تم ${!isCurrentlyPublished ? 'إعلان' : 'إخفاء'} نتائج المستوى ${level} بنجاح`
          : `Level ${level} results ${!isCurrentlyPublished ? 'published' : 'hidden'} successfully`,
      );
    } catch {
      toast.error(isAr ? 'فشل تحديث المستوى' : 'Failed to update level');
    }
  };

  // Save Schedule Window
  const handleSaveWindow = () => {
    updateSettingsMutation.mutate({
      gradesOpenAt: openAt ? new Date(openAt).toISOString() : undefined,
      gradesCloseAt: closeAt ? new Date(closeAt).toISOString() : undefined,
    });
  };

  // Clear Schedule Window
  const handleClearWindow = () => {
    setOpenAt('');
    setCloseAt('');
    updateSettingsMutation.mutate({
      gradesOpenAt: undefined,
      gradesCloseAt: undefined,
    });
  };

  // Bulk publish by exam type
  const handleBulkAction = async (publish: boolean) => {
    setIsUpdatingBulk(true);
    try {
      const payload: Record<string, unknown> = {
        isPublished: publish,
      };
      if (selectedExamType !== 'all') {
        payload.examType = selectedExamType;
      }

      await publishGradesBulk(payload);
      queryClient.invalidateQueries({ queryKey: ['grades'] });
      toast.success(
        isAr
          ? `تم ${publish ? 'نشر' : 'إخفاء'} النتائج المحددة بنجاح`
          : `Grades ${publish ? 'published' : 'hidden'} successfully`,
      );
    } catch {
      toast.error(isAr ? 'فشل تنفيذ العملية المجمعة' : 'Failed to perform bulk operation');
    } finally {
      setIsUpdatingBulk(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border-border/70 bg-card p-6 shadow-2xl">
        <DialogHeader className="text-start">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-squircle bg-cyan-500/15 text-cyan-400 border border-cyan-500/25">
              <CalendarClock className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-foreground">
                {isAr ? 'إدارة نشر وجدولة إعلان النتائج' : 'Grades Publishing & Schedule Control'}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                {isAr
                  ? 'التحكم في إتاحة الدرجات للطلاب، وتحديد نوافذ الإعلان التلقائي، والنشر حسب المستوى الدراسي'
                  : 'Control grade visibility for students, configure publication time windows, and manage per-level releases.'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {settingsQuery.isLoading ? (
          <div className="flex h-56 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-6 pt-3">
            {/* 1. MASTER SYSTEM SWITCH */}
            <div className="flex items-center justify-between rounded-xl border border-border/70 bg-surface/40 p-4 transition-all">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-foreground">
                    {isAr ? 'الإتاحة العامة للنتائج' : 'Master Results Portal'}
                  </span>
                  <Badge
                    variant={isMasterOpen ? 'default' : 'secondary'}
                    className="rounded-squircle text-[11px]"
                  >
                    {isMasterOpen ? (isAr ? 'متاح للطلاب' : 'Online / Visible') : (isAr ? 'مغلق بالكامل' : 'Offline / Hidden')}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {isAr
                    ? 'إيقاف هذا المفتاح يخفي جميع النتائج فوراً عن الطلاب بغض النظر عن النوافذ والمستويات'
                    : 'Disabling this master switch hides all results from students immediately.'}
                </p>
              </div>

              <Button
                variant={isMasterOpen ? 'destructive' : 'default'}
                size="sm"
                onClick={handleToggleMaster}
                disabled={updateSettingsMutation.isPending}
                className="rounded-squircle px-3.5 text-xs font-medium cursor-pointer"
              >
                {isMasterOpen ? (
                  <>
                    <EyeOff className="h-4 w-4 mr-1.5 rtl:ml-1.5 rtl:mr-0" />
                    {isAr ? 'إغلاق النظام' : 'Hide All'}
                  </>
                ) : (
                  <>
                    <Eye className="h-4 w-4 mr-1.5 rtl:ml-1.5 rtl:mr-0" />
                    {isAr ? 'فتح النظام' : 'Show All'}
                  </>
                )}
              </Button>
            </div>

            {/* 2. AUTOMATED TIME WINDOW (LIKE COMPLAINTS SYSTEM) */}
            <div className="space-y-3 rounded-xl border border-border/70 bg-surface/30 p-4">
              <div className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-cyan-400" />
                <h4 className="text-sm font-semibold text-foreground">
                  {isAr ? 'نافذة الجدولة الزمنية لإعلان النتائج' : 'Automated Publication Time Window'}
                </h4>
              </div>
              <p className="text-xs text-muted-foreground">
                {isAr
                  ? 'حدد فترة زمنية محددة لفتح وإغلاق إمكانية استعلام الطلاب عن النتائج (مثل نظام الشكاوى)'
                  : 'Set a scheduled opening and closing window for student results inquiry.'}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    {isAr ? 'تاريخ ووقت بدء إعلان النتائج' : 'Publication Open Date/Time'}
                  </label>
                  <DateTimePicker
                    value={openAt}
                    onChange={setOpenAt}
                    placeholder={isAr ? 'اختر وقت البدء' : 'Select start time'}
                    locale={isAr ? 'ar' : 'en'}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    {isAr ? 'تاريخ ووقت انتهاء إعلان النتائج' : 'Publication Close Date/Time'}
                  </label>
                  <DateTimePicker
                    value={closeAt}
                    onChange={setCloseAt}
                    placeholder={isAr ? 'اختر وقت الانتهاء' : 'Select end time'}
                    locale={isAr ? 'ar' : 'en'}
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                {(openAt || closeAt) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearWindow}
                    className="rounded-squircle text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    {isAr ? 'إلغاء التوقيتات' : 'Clear Window'}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSaveWindow}
                  disabled={updateSettingsMutation.isPending}
                  className="rounded-squircle border-cyan-500/30 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 text-xs font-medium cursor-pointer"
                >
                  {updateSettingsMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1 rtl:ml-1 rtl:mr-0" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1 rtl:ml-1 rtl:mr-0" />
                  )}
                  {isAr ? 'حفظ نافذة النشر' : 'Apply Schedule'}
                </Button>
              </div>
            </div>

            {/* 3. PER-LEVEL PUBLISHING MATRIX */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <GraduationCap className="h-4 w-4 text-purple-400" />
                <h4 className="text-sm font-semibold text-foreground">
                  {isAr ? 'حالة النشر حسب المستويات الدراسية' : 'Publishing Status by Academic Level'}
                </h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ACADEMIC_LEVELS.map((item) => {
                  const isLevelActive = publishedLevels.includes(item.level);

                  return (
                    <div
                      key={item.level}
                      className="flex items-center justify-between rounded-xl border border-border/70 bg-card p-3.5 shadow-sm transition-all hover:border-border"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-foreground">
                            {isAr ? item.labelAr : item.labelEn}
                          </span>
                        </div>
                        <Badge
                          variant={isLevelActive ? 'default' : 'outline'}
                          className={`rounded-squircle text-[10px] ${
                            isLevelActive
                              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {isLevelActive
                            ? isAr ? 'منشور للطلاب' : 'Published'
                            : isAr ? 'محجوب حالياً' : 'Hidden'}
                        </Badge>
                      </div>

                      <Button
                        variant={isLevelActive ? 'outline' : 'default'}
                        size="sm"
                        onClick={() => handleToggleLevel(item.level)}
                        className="rounded-squircle text-xs h-8 px-3 cursor-pointer"
                      >
                        {isLevelActive ? (
                          <>
                            <EyeOff className="h-3.5 w-3.5 mr-1 rtl:ml-1 rtl:mr-0" />
                            {isAr ? 'حجب' : 'Hide'}
                          </>
                        ) : (
                          <>
                            <Eye className="h-3.5 w-3.5 mr-1 rtl:ml-1 rtl:mr-0" />
                            {isAr ? 'إعلان' : 'Publish'}
                          </>
                        )}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 4. BULK SCOPE ACTION */}
            <div className="space-y-3 rounded-xl border border-border/70 bg-surface/30 p-4">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-emerald-400" />
                <h4 className="text-sm font-semibold text-foreground">
                  {isAr ? 'تحديث مجمع حسب نوع الاختبار' : 'Bulk Update by Exam Type'}
                </h4>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-3 pt-1">
                <Select value={selectedExamType} onValueChange={setSelectedExamType}>
                  <SelectTrigger className="w-full sm:w-48 rounded-squircle text-xs">
                    <SelectValue placeholder={isAr ? 'نوع الاختبار' : 'Exam Type'} />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="all">{isAr ? 'جميع الاختبارات' : 'All Exam Types'}</SelectItem>
                    <SelectItem value="midterm">{isAr ? 'الميدتيرم' : 'Midterm Exam'}</SelectItem>
                    <SelectItem value="coursework">{isAr ? 'أعمال السنة' : 'Coursework'}</SelectItem>
                    <SelectItem value="final">{isAr ? 'الامتحان النهائي' : 'Final Exam'}</SelectItem>
                    <SelectItem value="quiz">{isAr ? 'الكويزات والأنشطة' : 'Quizzes'}</SelectItem>
                  </SelectContent>
                </Select>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isUpdatingBulk}
                    onClick={() => handleBulkAction(true)}
                    className="flex-1 sm:flex-none rounded-squircle border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-xs font-medium cursor-pointer"
                  >
                    {isUpdatingBulk ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1 rtl:ml-1 rtl:mr-0" />
                    ) : (
                      <Eye className="h-3.5 w-3.5 mr-1 rtl:ml-1 rtl:mr-0" />
                    )}
                    {isAr ? 'نشر المحدد' : 'Publish Selected'}
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isUpdatingBulk}
                    onClick={() => handleBulkAction(false)}
                    className="flex-1 sm:flex-none rounded-squircle border-rose-500/30 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 text-xs font-medium cursor-pointer"
                  >
                    {isUpdatingBulk ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1 rtl:ml-1 rtl:mr-0" />
                    ) : (
                      <EyeOff className="h-3.5 w-3.5 mr-1 rtl:ml-1 rtl:mr-0" />
                    )}
                    {isAr ? 'إخفاء المحدد' : 'Hide Selected'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="rtl:sm:justify-start pt-4 border-t border-border/70">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-squircle text-xs cursor-pointer"
          >
            {isAr ? 'إغلاق' : 'Close'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
