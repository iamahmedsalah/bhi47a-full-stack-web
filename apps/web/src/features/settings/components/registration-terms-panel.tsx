'use client';

import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Calendar,
  CalendarPlus,
  Lock,
  Unlock,
  Star,
  CheckCircle2,
  Clock,
  Grid3X3,
  Table as TableIcon,
  ShieldCheck,
  Plus,
  Info,
  Layers,
  BookOpen,
  Loader2,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { DataTableShell, type ColumnDef } from '@/components/ui/data-table-shell';
import { StatusBadge } from '@/components/ui/status-badge';
import { TableCell } from '@/components/ui/table';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/cn';
import { getApiErrorMessage } from '@/lib/api';

import {
  listAcademicYears,
  setCurrentAcademicYear,
  createAcademicYear,
  deleteAcademicYear,
  toggleRegistrationTerm,
  type AcademicYearGroup,
  type RegistrationTermItem,
} from '../api';

export function RegistrationTermsPanel({ locale }: { locale: string }) {
  const isAr = locale === 'ar';
  const queryClient = useQueryClient();

  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newAcademicYear, setNewAcademicYear] = useState('');
  const [makeNewCurrent, setMakeNewCurrent] = useState(false);
  const [pendingTermId, setPendingTermId] = useState<string | null>(null);
  const [yearToDelete, setYearToDelete] = useState<string | null>(null);

  // Queries
  const academicYearsQuery = useQuery({
    queryKey: ['admin-academic-years'],
    queryFn: () => listAcademicYears(),
  });

  const academicYears = academicYearsQuery.data ?? [];

  // Flattened terms for Table view
  const flatTerms = useMemo(() => {
    return academicYears.flatMap((group) =>
      group.terms.map((term) => ({
        ...term,
        yearIsCurrent: group.isCurrent,
        registrationCount: group.registrationCount,
        advisingCaseCount: group.advisingCaseCount,
      })),
    );
  }, [academicYears]);

  // Statistics
  const stats = useMemo(() => {
    const totalYears = academicYears.length;
    const currentYearGroup = academicYears.find((y) => y.isCurrent);
    const totalSemesters = flatTerms.length;
    const openSemesters = flatTerms.filter((t) => t.isOpen).length;
    return { totalYears, currentYearGroup, totalSemesters, openSemesters };
  }, [academicYears, flatTerms]);

  // Mutations
  const toggleTermMutation = useMutation({
    mutationFn: async ({ id, isOpen }: { id: string; isOpen: boolean }) => {
      setPendingTermId(id);
      return toggleRegistrationTerm(id, isOpen);
    },
    onSuccess: () => {
      toast.success(isAr ? 'تم تحديث حالة فترة التسجيل بنجاح' : 'Registration term status updated');
      void queryClient.invalidateQueries({ queryKey: ['admin-academic-years'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-registration-terms'] });
    },
    onError: (err: unknown) => {
      const msg = getApiErrorMessage(err, isAr ? 'فشل تعديل حالة الفصل' : 'Failed to update term status');
      toast.error(msg);
    },
    onSettled: () => {
      setPendingTermId(null);
    },
  });

  const setCurrentYearMutation = useMutation({
    mutationFn: async (academicYear: string) => {
      return setCurrentAcademicYear(academicYear);
    },
    onSuccess: (_, year) => {
      toast.success(
        isAr ? `تم تعيين ${year} كسنة أكاديمية رسمية حالية` : `Set ${year} as current academic year`,
      );
      void queryClient.invalidateQueries({ queryKey: ['admin-academic-years'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-registration-terms'] });
    },
    onError: (err: unknown) => {
      const msg = getApiErrorMessage(err, isAr ? 'فشل تغيير السنة الأكاديمية الحالية' : 'Failed to set current academic year');
      toast.error(msg);
    },
  });

  const deleteYearMutation = useMutation({
    mutationFn: async (academicYear: string) => {
      return deleteAcademicYear(academicYear);
    },
    onSuccess: (_, year) => {
      toast.success(isAr ? `تم حذف السنة الأكاديمية ${year}` : `Deleted academic year ${year}`);
      setYearToDelete(null);
      void queryClient.invalidateQueries({ queryKey: ['admin-academic-years'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-registration-terms'] });
    },
    onError: (err: unknown) => {
      const msg = getApiErrorMessage(err, isAr ? 'فشل حذف السنة الأكاديمية' : 'Failed to delete academic year');
      toast.error(msg);
    },
  });

  const createYearMutation = useMutation({
    mutationFn: async (dto: { academicYear: string; makeCurrent?: boolean }) => {
      return createAcademicYear(dto);
    },
    onSuccess: () => {
      toast.success(isAr ? 'تم إنشاء السنة الأكاديمية وفصولها الثلاثة' : 'Academic year created successfully');
      setCreateDialogOpen(false);
      setNewAcademicYear('');
      setMakeNewCurrent(false);
      void queryClient.invalidateQueries({ queryKey: ['admin-academic-years'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-registration-terms'] });
    },
    onError: (err: unknown) => {
      const msg = getApiErrorMessage(err, isAr ? 'فشل إنشاء السنة الأكاديمية' : 'Failed to create academic year');
      toast.error(msg);
    },
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanYear = newAcademicYear.trim();
    if (!cleanYear || !/^\d{4}-\d{4}$/.test(cleanYear)) {
      toast.error(isAr ? 'يرجى كتابة السنة الأكاديمية بالصيغة الصحيحة (مثال: 2028-2029)' : 'Enter valid format (e.g. 2028-2029)');
      return;
    }
    createYearMutation.mutate({ academicYear: cleanYear, makeCurrent: makeNewCurrent });
  };

  const getSemesterLabel = (sem: string) => {
    const s = sem.toLowerCase();
    if (s === 'first') return isAr ? 'الفصل الدراسي الأول' : 'First Semester';
    if (s === 'second') return isAr ? 'الفصل الدراسي الثاني' : 'Second Semester';
    if (s === 'summer') return isAr ? 'الفصل الصيفي' : 'Summer Semester';
    return sem.toUpperCase();
  };

  const columns: ColumnDef<typeof flatTerms[0]>[] = [
    {
      key: 'academicYear',
      header: isAr ? 'السنة الدراسية' : 'Academic Year',
      render: (item) => (
        <TableCell>
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-foreground">{item.academicYear}</span>
            {item.yearIsCurrent && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
                <Star className="h-3 w-3 fill-amber-400" />
                {isAr ? 'الحالية' : 'Current'}
              </span>
            )}
          </div>
        </TableCell>
      ),
    },
    {
      key: 'semester',
      header: isAr ? 'الفصل الدراسي' : 'Semester',
      render: (item) => (
        <TableCell className="font-medium text-foreground">
          {getSemesterLabel(item.semester)}
        </TableCell>
      ),
    },
    {
      key: 'status',
      header: isAr ? 'استقبال التسجيل' : 'Registration Status',
      render: (item) => (
        <TableCell>
          <StatusBadge
            label={item.isOpen ? (isAr ? 'مفتوح للتسجيل' : 'Open') : (isAr ? 'مغلق' : 'Closed')}
            variant={item.isOpen ? 'success' : 'danger'}
          />
        </TableCell>
      ),
    },
    {
      key: 'actions',
      header: isAr ? 'الإجراءات' : 'Actions',
      render: (item) => {
        const isThisPending = pendingTermId === item._id;
        return (
          <TableCell className="text-center">
            <Button
              size="sm"
              variant={item.isOpen ? 'destructive' : 'default'}
              disabled={toggleTermMutation.isPending}
              onClick={() => toggleTermMutation.mutate({ id: item._id, isOpen: !item.isOpen })}
              className="gap-1.5 text-xs"
            >
              {isThisPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : item.isOpen ? (
                <Lock className="h-3.5 w-3.5" />
              ) : (
                <Unlock className="h-3.5 w-3.5" />
              )}
              {item.isOpen ? (isAr ? 'إغلاق التسجيل' : 'Close Term') : (isAr ? 'فتح التسجيل' : 'Open Term')}
            </Button>
          </TableCell>
        );
      },
    },
  ];

  return (
    <div className="space-y-6" dir={isAr ? 'rtl' : 'ltr'}>
      {/* Educational Guidance Card */}
      <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-teal-950/40 via-teal-900/15 to-transparent p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-0.5 text-xs font-semibold text-primary">
              <ShieldCheck className="h-3.5 w-3.5" />
              {isAr ? 'إدارة فترات وسنوات التسجيل الأكاديمي' : 'Academic Registration Terms Management'}
            </div>
            <h3 className="text-base font-bold text-foreground">
              {isAr ? 'مواعيد فصول التسجيل والسنة المعتمدة' : 'Registration Terms & Authoritative Academic Year'}
            </h3>
            <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">
              {isAr
                ? 'تحدد فصول التسجيل متى يمكن للطلاب تسجيل مقرراتهم أو تقديم خطط الإرشاد الأكاديمي. السنة الأكاديمية الحالية (Current) هي المعتمدة رسمياً عبر لوحة تحكم الطلاب والمرشدين، ولا يمكن للطلاب إتمام التسجيل إلا في الفصول المفتوحة.'
                : 'Registration terms control when students can submit direct course registrations or advising plans. The current academic year serves as the authoritative period across student and advisor portals.'}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button
              onClick={() => {
                const latestYear = academicYears[0]?.academicYear;
                if (latestYear && /^\d{4}-\d{4}$/.test(latestYear)) {
                  const endYear = parseInt(latestYear.split('-')[1], 10);
                  setNewAcademicYear(`${endYear}-${endYear + 1}`);
                } else {
                  setNewAcademicYear('2028-2029');
                }
                setCreateDialogOpen(true);
              }}
              className="gap-2 bg-primary font-semibold text-xs text-primary-foreground shadow-sm hover:bg-primary/90"
            >
              <CalendarPlus className="h-4 w-4" />
              {isAr ? 'إضافة سنة أكاديمية' : 'Add Academic Year'}
            </Button>
          </div>
        </div>
      </div>

      {/* Top Metrics Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex items-center gap-3.5 rounded-xl border border-border bg-card/60 p-4 shadow-sm">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-400">
            <Star className="h-5 w-5 fill-amber-400" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-muted-foreground">
              {isAr ? 'السنة الأكاديمية الحالية' : 'Current Academic Year'}
            </p>
            <p className="font-mono text-base font-bold text-foreground">
              {stats.currentYearGroup?.academicYear ?? (isAr ? 'غير محددة' : 'Not Set')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3.5 rounded-xl border border-border bg-card/60 p-4 shadow-sm">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
            <Layers className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-muted-foreground">
              {isAr ? 'إجمالي الفصول المدارة' : 'Total Managed Semesters'}
            </p>
            <p className="font-mono text-base font-bold text-foreground">
              {stats.totalSemesters} {isAr ? 'فصل' : 'terms'} ({stats.totalYears} {isAr ? 'سنوات' : 'years'})
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3.5 rounded-xl border border-border bg-card/60 p-4 shadow-sm">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-muted-foreground">
              {isAr ? 'فصول مفتوحة للتسجيل الآن' : 'Open Registration Terms'}
            </p>
            <p className="font-mono text-base font-bold text-emerald-400">
              {stats.openSemesters} {isAr ? 'فصول نشطة' : 'open'}
            </p>
          </div>
        </div>
      </div>

      {/* View Switcher & Action Bar */}
      <div className="flex items-center justify-between border-b border-border/60 pb-3">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-bold text-foreground">
            {isAr ? 'الفصول والسنوات المسجلة' : 'Registered Terms & Years'}
          </h4>
          <span className="rounded-full bg-surface px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
            {academicYears.length}
          </span>
        </div>

        <div className="inline-flex rounded-lg border border-border/80 bg-surface/60 p-0.5">
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors',
              viewMode === 'grid'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Grid3X3 className="h-3.5 w-3.5" />
            {isAr ? 'عرض البطاقات' : 'Card Grid'}
          </button>
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors',
              viewMode === 'table'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <TableIcon className="h-3.5 w-3.5" />
            {isAr ? 'عرض الجدول' : 'Table'}
          </button>
        </div>
      </div>

      {/* Grid View */}
      {viewMode === 'grid' ? (
        <div className="space-y-5">
          {academicYears.map((group) => (
            <div
              key={group.academicYear}
              className={cn(
                'rounded-2xl border transition-all duration-200 bg-card/60 p-5 space-y-4',
                group.isCurrent
                  ? 'border-amber-500/40 bg-gradient-to-r from-amber-950/15 via-card/80 to-card/60 shadow-md ring-1 ring-amber-500/20'
                  : 'border-border hover:border-primary/40',
              )}
            >
              {/* Year Header */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border/50 pb-3.5">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border font-mono font-bold text-sm',
                      group.isCurrent
                        ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                        : 'border-primary/30 bg-primary/10 text-primary',
                    )}
                  >
                    <Calendar className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-base font-bold text-foreground">
                        {group.academicYear}
                      </span>
                      {group.isCurrent && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-0.5 text-xs font-bold text-amber-300">
                          <Star className="h-3 w-3 fill-amber-300" />
                          {isAr ? 'السنة الرسمية الحالية' : 'Authoritative Current'}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {isAr
                        ? `سجلات التسجيل: ${group.registrationCount} · حالات الإرشاد: ${group.advisingCaseCount}`
                        : `Registrations: ${group.registrationCount} · Advising Cases: ${group.advisingCaseCount}`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                  {!group.isCurrent && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={setCurrentYearMutation.isPending}
                      onClick={() => setCurrentYearMutation.mutate(group.academicYear)}
                      className="gap-1.5 border-border hover:border-amber-500/40 hover:text-amber-300 text-xs"
                    >
                      {setCurrentYearMutation.isPending && setCurrentYearMutation.variables === group.academicYear ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Star className="h-3.5 w-3.5" />
                      )}
                      {isAr ? 'تعيين كسنة أكاديمية حالية' : 'Set as Current Year'}
                    </Button>
                  )}
                  {!group.isCurrent && group.registrationCount === 0 && group.advisingCaseCount === 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={deleteYearMutation.isPending}
                      onClick={() => setYearToDelete(group.academicYear)}
                      className="h-8 w-8 p-0 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                      title={isAr ? 'حذف السنة الأكاديمية' : 'Delete academic year'}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>

              {/* 3 Semesters Mini Cards */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {group.terms.map((term) => {
                  const isThisPending = pendingTermId === term._id;
                  return (
                    <div
                      key={term._id}
                      className={cn(
                        'rounded-xl border p-3.5 transition-colors flex flex-col justify-between gap-3',
                        term.isOpen
                          ? 'border-emerald-500/30 bg-emerald-950/10'
                          : 'border-border/60 bg-surface/30',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h5 className="font-semibold text-foreground text-xs">
                            {getSemesterLabel(term.semester)}
                          </h5>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {term.isOpen
                              ? isAr
                                ? 'متاح لتسجيل الطلاب'
                                : 'Open for registration'
                              : isAr
                                ? 'التسجيل مغلق'
                                : 'Registration closed'}
                          </p>
                        </div>
                        <StatusBadge
                          label={term.isOpen ? (isAr ? 'مفتوح' : 'Open') : (isAr ? 'مغلق' : 'Closed')}
                          variant={term.isOpen ? 'success' : 'danger'}
                        />
                      </div>

                      <div className="flex items-center justify-between border-t border-border/40 pt-2.5">
                        <span className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {term.semester.toUpperCase()}
                        </span>
                        <Button
                          size="sm"
                          variant={term.isOpen ? 'destructive' : 'default'}
                          disabled={toggleTermMutation.isPending}
                          onClick={() =>
                            toggleTermMutation.mutate({ id: term._id, isOpen: !term.isOpen })
                          }
                          className={cn(
                            'h-7 px-2.5 text-xs font-medium gap-1',
                            term.isOpen
                              ? 'bg-destructive/15 text-destructive border border-destructive/30 hover:bg-destructive hover:text-white'
                              : 'bg-primary text-primary-foreground hover:bg-primary/90',
                          )}
                        >
                          {isThisPending ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : term.isOpen ? (
                            <>
                              <Lock className="h-3 w-3" />
                              {isAr ? 'إغلاق' : 'Close'}
                            </>
                          ) : (
                            <>
                              <Unlock className="h-3 w-3" />
                              {isAr ? 'فتح' : 'Open'}
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Table View */
        <DataTableShell
          columns={columns}
          data={flatTerms}
          keyExtractor={(item) => item._id}
          isLoading={academicYearsQuery.isLoading}
          isError={academicYearsQuery.isError}
          error={academicYearsQuery.error}
          errorMessage={isAr ? 'فشل تحميل مواعيد التسجيل' : 'Failed to load terms'}
          emptyMessage={isAr ? 'لا توجد فصول دراسية مسجلة' : 'No terms recorded'}
          loadingMessage={isAr ? 'جاري التحميل...' : 'Loading terms...'}
          onRetry={() => academicYearsQuery.refetch()}
          retryLabel={isAr ? 'إعادة المحاولة' : 'Retry'}
        />
      )}

      {/* Add Academic Year Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-md" dir={isAr ? 'rtl' : 'ltr'}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarPlus className="h-5 w-5 text-primary" />
              {isAr ? 'إضافة سنة أكاديمية جديدة' : 'Add New Academic Year'}
            </DialogTitle>
            <DialogDescription>
              {isAr
                ? 'سيتم إنشاء السنة الأكاديمية مع تهيئة فصولها الثلاثة (الأول، الثاني، الصيفي) تلقائياً بحالة مغلقة.'
                : 'Initializes the academic year with all 3 semesters (First, Second, Summer) ready.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateSubmit} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                {isAr ? 'السنة الأكاديمية (سنتان متتاليتان)' : 'Academic Year (e.g. 2028-2029)'}
              </Label>
              <Input
                value={newAcademicYear}
                onChange={(e) => setNewAcademicYear(e.target.value)}
                placeholder="2028-2029"
                className="font-mono text-sm"
                required
              />
              <p className="text-[11px] text-muted-foreground">
                {isAr ? 'يجب كتابة سنتين متتاليتين بصيغة YYYY-YYYY' : 'Format must be YYYY-YYYY with consecutive years.'}
              </p>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border bg-surface/40 p-3">
              <div>
                <Label className="text-xs font-semibold block">
                  {isAr ? 'تعيين كسنة أكاديمية حالية' : 'Set as Current Year'}
                </Label>
                <span className="text-[11px] text-muted-foreground">
                  {isAr ? 'تصبح السنة الرسمية المعتمدة فوراً للطلاب' : 'Becomes the active year across the portal.'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMakeNewCurrent(!makeNewCurrent)}
                className={cn(
                  'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out',
                  makeNewCurrent ? 'bg-primary' : 'bg-muted',
                )}
              >
                <span
                  className={cn(
                    'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out',
                    makeNewCurrent ? (isAr ? '-translate-x-5' : 'translate-x-5') : 'translate-x-0',
                  )}
                />
              </button>
            </div>

            <DialogFooter className="pt-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateDialogOpen(false)}
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button
                type="submit"
                disabled={createYearMutation.isPending}
                className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Plus className="h-4 w-4" />
                {createYearMutation.isPending
                  ? isAr
                    ? 'جاري الإنشاء...'
                    : 'Creating...'
                  : isAr
                    ? 'تأكيد الإنشاء'
                    : 'Create Academic Year'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Academic Year Confirmation */}
      <ConfirmDialog
        open={Boolean(yearToDelete)}
        onOpenChange={(open) => !open && setYearToDelete(null)}
        title={isAr ? 'حذف السنة الأكاديمية' : 'Delete Academic Year'}
        description={
          isAr
            ? `هل أنت متأكد من حذف السنة الأكاديمية ${yearToDelete}؟ سيتم حذف جميع فصولها المسجلة.`
            : `Are you sure you want to delete academic year ${yearToDelete}? All associated terms will be removed.`
        }
        confirmLabel={isAr ? 'تأكيد الحذف' : 'Delete'}
        cancelLabel={isAr ? 'إلغاء' : 'Cancel'}
        destructive={true}
        disabled={deleteYearMutation.isPending}
        onConfirm={() => {
          if (yearToDelete) {
            deleteYearMutation.mutate(yearToDelete);
          }
        }}
      />
    </div>
  );
}
