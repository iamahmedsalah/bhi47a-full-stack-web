'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Loader2,
  Plus,
  Trash2,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Info,
  CheckCircle2,
  LayoutGrid,
  Table as TableIcon,
  HelpCircle,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { DataTableShell, type ColumnDef } from '@/components/ui/data-table-shell';
import { StatusBadge } from '@/components/ui/status-badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { TableCell } from '@/components/ui/table';
import { cn } from '@/lib/cn';
import { getApiErrorMessage } from '@/lib/api';
import {
  listGpaRules,
  createGpaRule,
  updateGpaRule,
  deleteGpaRule,
  settingsKeys,
  type GpaRuleItem,
} from '../api';

export function GpaRulesPanel({ locale }: { locale: string }) {
  const isAr = locale === 'ar';
  const queryClient = useQueryClient();

  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // New Rule Form State
  const [minGpa, setMinGpa] = useState('2.00');
  const [maxGpa, setMaxGpa] = useState('4.00');
  const [minCreditHours, setMinCreditHours] = useState('12');
  const [maxCreditHours, setMaxCreditHours] = useState('18');
  const [minCourses, setMinCourses] = useState('4');
  const [maxCourses, setMaxCourses] = useState('6');
  const [requiresAdvisor, setRequiresAdvisor] = useState(false);
  const [isActive, setIsActive] = useState(true);

  const rulesQuery = useQuery({
    queryKey: settingsKeys.gpaRules,
    queryFn: () => listGpaRules(),
  });

  const rules = rulesQuery.data ?? [];

  const createMutation = useMutation({
    mutationFn: async () => {
      const parsedMinGpa = parseFloat(minGpa);
      const parsedMaxGpa = parseFloat(maxGpa);
      const parsedMinHours = parseInt(minCreditHours, 10);
      const parsedMaxHours = parseInt(maxCreditHours, 10);
      const parsedMinCourses = parseInt(minCourses, 10);
      const parsedMaxCourses = parseInt(maxCourses, 10);

      if (isNaN(parsedMinGpa) || isNaN(parsedMaxGpa) || parsedMinGpa < 0 || parsedMaxGpa > 4 || parsedMinGpa > parsedMaxGpa) {
        throw new Error(isAr ? 'نطاق المعدل غير صالح (0.00 إلى 4.00)' : 'Invalid GPA range (0.00 to 4.00)');
      }
      if (isNaN(parsedMinHours) || isNaN(parsedMaxHours) || parsedMinHours < 1 || parsedMinHours > parsedMaxHours) {
        throw new Error(isAr ? 'نطاق الساعات المعتمدة غير صالح' : 'Invalid credit hours range');
      }

      return createGpaRule({
        minGpa: parsedMinGpa,
        maxGpa: parsedMaxGpa,
        minCreditHours: parsedMinHours,
        maxCreditHours: parsedMaxHours,
        minCourses: isNaN(parsedMinCourses) ? 4 : parsedMinCourses,
        maxCourses: isNaN(parsedMaxCourses) ? 6 : parsedMaxCourses,
        requiresAdvisor,
        isActive,
      });
    },
    onSuccess: () => {
      toast.success(isAr ? 'تمت إضافة قاعدة المعدل التراكمي بنجاح' : 'GPA rule created successfully');
      setIsCreateOpen(false);
      void queryClient.invalidateQueries({ queryKey: settingsKeys.gpaRules });
      // Reset defaults
      setMinGpa('2.00');
      setMaxGpa('4.00');
      setMinCreditHours('12');
      setMaxCreditHours('18');
      setRequiresAdvisor(false);
      setIsActive(true);
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error, isAr ? 'فشل إنشاء القاعدة' : 'Failed to create GPA rule'));
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, currentActive }: { id: string; currentActive: boolean }) =>
      updateGpaRule(id, { isActive: !currentActive }),
    onSuccess: () => {
      toast.success(isAr ? 'تم تعديل حالة القاعدة' : 'Rule status updated');
      void queryClient.invalidateQueries({ queryKey: settingsKeys.gpaRules });
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error, isAr ? 'فشل تعديل الحالة' : 'Failed to toggle status'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteGpaRule(id),
    onSuccess: () => {
      toast.success(isAr ? 'تم حذف القاعدة بنجاح' : 'Rule deleted successfully');
      void queryClient.invalidateQueries({ queryKey: settingsKeys.gpaRules });
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error, isAr ? 'فشل حذف القاعدة' : 'Failed to delete rule'));
    },
  });

  const columns: ColumnDef<GpaRuleItem>[] = [
    {
      key: 'gpaRange',
      header: isAr ? 'نطاق المعدل (GPA)' : 'GPA Range',
      render: (rule) => (
        <TableCell className="font-mono text-foreground font-bold text-sm">
          {rule.minGpa.toFixed(2)} - {rule.maxGpa.toFixed(2)}
        </TableCell>
      ),
    },
    {
      key: 'creditHours',
      header: isAr ? 'الساعات المعتمدة' : 'Credit Hours',
      render: (rule) => (
        <TableCell className="font-mono text-xs">
          {rule.minCreditHours} - {rule.maxCreditHours} {isAr ? 'ساعة' : 'hrs'}
        </TableCell>
      ),
    },
    {
      key: 'courses',
      header: isAr ? 'عدد المقررات' : 'Courses Count',
      render: (rule) => (
        <TableCell className="font-mono text-xs text-muted-foreground">
          {rule.minCourses ?? 4} - {rule.maxCourses ?? 6}
        </TableCell>
      ),
    },
    {
      key: 'requiresAdvisor',
      header: isAr ? 'طريقة التسجيل' : 'Registration Mode',
      render: (rule) => (
        <TableCell>
          {rule.requiresAdvisor ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-300">
              <ShieldAlert className="h-3.5 w-3.5" />
              {isAr ? 'يتطلب مرشد أكاديمي' : 'Requires Advisor'}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-300">
              <Sparkles className="h-3.5 w-3.5" />
              {isAr ? 'تسجيل مباشر متاح' : 'Direct Registration'}
            </span>
          )}
        </TableCell>
      ),
    },
    {
      key: 'status',
      header: isAr ? 'الحالة' : 'Status',
      render: (rule) => (
        <TableCell>
          <button
            type="button"
            disabled={toggleActiveMutation.isPending}
            onClick={() => toggleActiveMutation.mutate({ id: rule._id, currentActive: rule.isActive })}
            className="cursor-pointer"
            title={isAr ? 'اضغط لتبديل الحالة' : 'Click to toggle status'}
          >
            <StatusBadge
              label={rule.isActive ? (isAr ? 'مفعل' : 'Active') : (isAr ? 'معطل' : 'Disabled')}
              variant={rule.isActive ? 'success' : 'neutral'}
            />
          </button>
        </TableCell>
      ),
    },
    {
      key: 'actions',
      header: isAr ? 'الإجراءات' : 'Actions',
      render: (rule) => (
        <TableCell className="text-center">
          <ConfirmDialog
            trigger={
              <Button size="sm" variant="ghost" className="text-danger hover:bg-danger/10">
                <Trash2 className="h-4 w-4" />
              </Button>
            }
            title={isAr ? 'حذف قاعدة GPA' : 'Delete GPA Rule'}
            description={
              isAr
                ? `هل أنت متأكد من حذف قاعدة المعدل (${rule.minGpa.toFixed(2)} - ${rule.maxGpa.toFixed(2)})؟`
                : `Are you sure you want to delete GPA rule (${rule.minGpa.toFixed(2)} - ${rule.maxGpa.toFixed(2)})?`
            }
            confirmLabel={isAr ? 'حذف' : 'Delete'}
            cancelLabel={isAr ? 'إلغاء' : 'Cancel'}
            onConfirm={() => deleteMutation.mutate(rule._id)}
          />
        </TableCell>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* 1. EDUCATIONAL / EXPLANATORY GUIDANCE BANNER */}
      <div className="rounded-2xl border border-sky-500/30 bg-gradient-to-br from-sky-950/40 via-card/80 to-transparent p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-500/15 text-sky-400">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="space-y-2 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-bold text-foreground text-sm flex items-center gap-1.5">
                {isAr ? 'آلية وضوابط قواعد المعدل التراكمي (GPA) والتسجيل المباشر' : 'GPA Registration Rules & Direct Advising Policy'}
              </h3>
              <span className="rounded-full bg-sky-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-sky-300">
                {isAr ? 'لائحة الساعات المعتمدة' : 'Credit Hours Bylaws'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {isAr
                ? 'تتحكم هذه القواعد بالحدود الدنيا والقصوى للساعات المسموح للطالب بتسجيلها في كل فصل، كما تحدد ما إذا كان الطالب يستطيع التسجيل الذاتي المباشر فوراً أو يُلزم بمراجعة المرشد الأكاديمي.'
                : 'These rules govern the minimum and maximum credit hours a student may register per term, and control whether direct registration is permitted or mandatory advising is enforced.'}
            </p>

            {/* Explanatory Cards Grid */}
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
              <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                <Sparkles className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
                <div className="text-xs">
                  <strong className="block font-semibold text-emerald-300">
                    {isAr ? 'عند ضبط (Requires Advisor = No):' : 'When Requires Advisor = No:'}
                  </strong>
                  <span className="text-muted-foreground leading-normal mt-0.5 block">
                    {isAr
                      ? 'يُتاح للطالب (مثل أصحاب المعدلات 2.00 فأكثر) التسجيل المباشر ذاتياً لمقرراته المطروحة فور فتح باب التسجيل دون الحاجة لانتظار جلسة أو اعتماد مرشد.'
                      : 'Students in this tier (e.g. GPA 2.00+) can register directly from their dashboard without waiting for advisor review.'}
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                <div className="text-xs">
                  <strong className="block font-semibold text-amber-300">
                    {isAr ? 'عند ضبط (Requires Advisor = Yes):' : 'When Requires Advisor = Yes:'}
                  </strong>
                  <span className="text-muted-foreground leading-normal mt-0.5 block">
                    {isAr
                      ? 'يُحجب التسجيل المباشر تماماً ويتم توجيه الطالب لمساحة الإرشاد الأكاديمي (للطلاب المتعثرين أو الإنذارات) لإعداد خطة علاجية معتمدة من المرشد.'
                      : 'Direct registration is blocked and the student is routed to Academic Advising to prepare and approve an academic remediation plan.'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. HEADER CONTROLS (Title, View Switcher & Add Rule Button) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border/70 pb-3">
        <div>
          <h3 className="text-base font-bold text-foreground">
            {isAr ? 'قواعد التسجيل الحالية' : 'Active Registration Rules'}
          </h3>
          <p className="text-xs text-muted-foreground">
            {isAr
              ? `${rules.length} قواعد مسجلة بالنظام`
              : `${rules.length} rules configured in system`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View Switcher */}
          <div className="flex items-center rounded-xl bg-secondary/40 p-1">
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={cn(
                'flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition',
                viewMode === 'cards'
                  ? 'bg-card text-foreground shadow-xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span>{isAr ? 'كروت' : 'Cards'}</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={cn(
                'flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition',
                viewMode === 'table'
                  ? 'bg-card text-foreground shadow-xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <TableIcon className="h-3.5 w-3.5" />
              <span>{isAr ? 'جدول' : 'Table'}</span>
            </button>
          </div>

          {/* Add Rule Button */}
          <Button onClick={() => setIsCreateOpen(true)} className="gap-1.5 h-9 text-xs">
            <Plus className="h-4 w-4" />
            {isAr ? 'إضافة قاعدة GPA' : 'Add GPA Rule'}
          </Button>
        </div>
      </div>

      {/* 3. RULES CONTENT: CARDS OR TABLE VIEW */}
      {rulesQuery.isLoading ? (
        <div className="flex min-h-48 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : rules.length === 0 ? (
        <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground">
          <Info className="h-8 w-8 mb-2 text-muted-foreground/60" />
          <p>{isAr ? 'لا توجد قواعد GPA مسجلة حالياً' : 'No GPA rules configured yet'}</p>
          <Button onClick={() => setIsCreateOpen(true)} variant="outline" size="sm" className="mt-4 gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            {isAr ? 'إنشاء أول قاعدة' : 'Create First Rule'}
          </Button>
        </div>
      ) : viewMode === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rules.map((rule) => (
            <div
              key={rule._id}
              className={cn(
                'relative flex flex-col justify-between rounded-2xl border p-4.5 transition-all shadow-sm',
                rule.isActive
                  ? 'border-border/80 bg-card/60 hover:border-primary/40'
                  : 'border-border/40 bg-secondary/10 opacity-70',
              )}
            >
              <div className="space-y-3">
                {/* Card Top: GPA Badge & Status */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold text-base text-foreground rounded-lg bg-secondary/60 px-2.5 py-1 border border-border/70">
                      {rule.minGpa.toFixed(2)} - {rule.maxGpa.toFixed(2)}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-semibold uppercase">GPA</span>
                  </div>
                  <button
                    type="button"
                    disabled={toggleActiveMutation.isPending}
                    onClick={() => toggleActiveMutation.mutate({ id: rule._id, currentActive: rule.isActive })}
                    className="cursor-pointer"
                    title={isAr ? 'تبديل الحالة' : 'Toggle status'}
                  >
                    <StatusBadge
                      label={rule.isActive ? (isAr ? 'مفعل' : 'Active') : (isAr ? 'معطل' : 'Disabled')}
                      variant={rule.isActive ? 'success' : 'neutral'}
                    />
                  </button>
                </div>

                {/* Card Mode Badge */}
                <div>
                  {rule.requiresAdvisor ? (
                    <div className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-300">
                      <ShieldAlert className="h-3.5 w-3.5" />
                      <span>{isAr ? 'يتطلب موافقة المرشد الأكاديمي' : 'Advisor Approval Required'}</span>
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-300">
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>{isAr ? 'تسجيل مباشر ذاتي متاح' : 'Direct Self-Registration'}</span>
                    </div>
                  )}
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/50 text-xs">
                  <div className="rounded-lg bg-surface/30 p-2 border border-border/40">
                    <span className="text-[10px] text-muted-foreground block">{isAr ? 'الساعات المسموحة' : 'Credit Hours'}</span>
                    <strong className="text-foreground font-mono">
                      {rule.minCreditHours} - {rule.maxCreditHours} {isAr ? 'س' : 'hrs'}
                    </strong>
                  </div>
                  <div className="rounded-lg bg-surface/30 p-2 border border-border/40">
                    <span className="text-[10px] text-muted-foreground block">{isAr ? 'عدد المقررات' : 'Courses Limit'}</span>
                    <strong className="text-foreground font-mono">
                      {rule.minCourses ?? 4} - {rule.maxCourses ?? 6}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Card Footer: Actions */}
              <div className="mt-4 flex items-center justify-between border-t border-border/50 pt-3">
                <span className="text-[10px] text-muted-foreground">
                  {rule.requiresAdvisor
                    ? isAr ? 'يتم توجيه الطالب للإرشاد' : 'Routes to advising'
                    : isAr ? 'تسجيل فوري من البوابة' : 'Direct from portal'}
                </span>

                <ConfirmDialog
                  trigger={
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-danger hover:bg-danger/10 text-xs">
                      <Trash2 className="h-3.5 w-3.5 me-1" />
                      {isAr ? 'حذف' : 'Delete'}
                    </Button>
                  }
                  title={isAr ? 'حذف قاعدة GPA' : 'Delete GPA Rule'}
                  description={
                    isAr
                      ? `هل أنت متأكد من حذف قاعدة المعدل (${rule.minGpa.toFixed(2)} - ${rule.maxGpa.toFixed(2)})؟`
                      : `Are you sure you want to delete GPA rule (${rule.minGpa.toFixed(2)} - ${rule.maxGpa.toFixed(2)})?`
                  }
                  confirmLabel={isAr ? 'حذف' : 'Delete'}
                  cancelLabel={isAr ? 'إلغاء' : 'Cancel'}
                  onConfirm={() => deleteMutation.mutate(rule._id)}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <DataTableShell
          columns={columns}
          data={rules}
          keyExtractor={(rule) => rule._id}
          isLoading={rulesQuery.isLoading}
          isError={rulesQuery.isError}
          error={rulesQuery.error}
          errorMessage={isAr ? 'فشل تحميل القواعد' : 'Failed to load rules'}
          emptyMessage={isAr ? 'لا توجد قواعد مسجلة' : 'No rules recorded'}
          loadingMessage={isAr ? 'جاري التحميل...' : 'Loading rules...'}
          onRetry={() => rulesQuery.refetch()}
          retryLabel={isAr ? 'إعادة المحاولة' : 'Retry'}
        />
      )}

      {/* 4. CREATE RULE DIALOG */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-md rounded-2xl" dir={isAr ? 'rtl' : 'ltr'}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <Plus className="h-5 w-5 text-primary" />
              {isAr ? 'إضافة قاعدة تسجيل لمعدل GPA جديد' : 'Create GPA Registration Rule'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* GPA Range */}
            <div>
              <Label className="text-xs font-semibold">{isAr ? 'نطاق المعدل التراكمي (0.00 - 4.00)' : 'GPA Range (0.00 - 4.00)'}</Label>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-muted-foreground block mb-0.5">{isAr ? 'الحد الأدنى' : 'Min GPA'}</span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="4"
                    value={minGpa}
                    onChange={(e) => setMinGpa(e.target.value)}
                    placeholder="2.00"
                    className="h-9 font-mono"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground block mb-0.5">{isAr ? 'الحد الأقصى' : 'Max GPA'}</span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="4"
                    value={maxGpa}
                    onChange={(e) => setMaxGpa(e.target.value)}
                    placeholder="4.00"
                    className="h-9 font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Credit Hours Range */}
            <div>
              <Label className="text-xs font-semibold">{isAr ? 'نطاق الساعات المعتمدة المسموحة' : 'Allowed Credit Hours'}</Label>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-muted-foreground block mb-0.5">{isAr ? 'أدنى ساعات' : 'Min Hours'}</span>
                  <Input
                    type="number"
                    min="1"
                    max="30"
                    value={minCreditHours}
                    onChange={(e) => setMinCreditHours(e.target.value)}
                    placeholder="12"
                    className="h-9 font-mono"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground block mb-0.5">{isAr ? 'أقصى ساعات' : 'Max Hours'}</span>
                  <Input
                    type="number"
                    min="1"
                    max="30"
                    value={maxCreditHours}
                    onChange={(e) => setMaxCreditHours(e.target.value)}
                    placeholder="18"
                    className="h-9 font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Course Count Range */}
            <div>
              <Label className="text-xs font-semibold">{isAr ? 'عدد المقررات المسموحة' : 'Allowed Course Count'}</Label>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-muted-foreground block mb-0.5">{isAr ? 'أدنى مقررات' : 'Min Courses'}</span>
                  <Input
                    type="number"
                    min="1"
                    max="10"
                    value={minCourses}
                    onChange={(e) => setMinCourses(e.target.value)}
                    placeholder="4"
                    className="h-9 font-mono"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground block mb-0.5">{isAr ? 'أقصى مقررات' : 'Max Courses'}</span>
                  <Input
                    type="number"
                    min="1"
                    max="10"
                    value={maxCourses}
                    onChange={(e) => setMaxCourses(e.target.value)}
                    placeholder="6"
                    className="h-9 font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Requires Advisor Option */}
            <div className="rounded-xl border border-border/70 bg-surface/40 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">
                  {isAr ? 'موافقة المرشد الأكاديمي مطلوبة؟' : 'Requires Academic Advisor?'}
                </span>
                <button
                  type="button"
                  onClick={() => setRequiresAdvisor(!requiresAdvisor)}
                  className={cn(
                    'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out',
                    requiresAdvisor ? 'bg-amber-500' : 'bg-emerald-500',
                  )}
                >
                  <span
                    className={cn(
                      'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out',
                      requiresAdvisor ? (isAr ? '-translate-x-5' : 'translate-x-5') : 'translate-x-0',
                    )}
                  />
                </button>
              </div>
              <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                {requiresAdvisor ? (
                  <>
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500 mt-0.5" />
                    <span>
                      {isAr
                        ? 'تفعيل هذا الخيار يحجب التسجيل المباشر عن الطالب ويلزمه باعتماد الخطة من المرشد أولاً.'
                        : 'Enabling this blocks direct registration and requires the student to get advisor approval.'}
                    </span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5 shrink-0 text-emerald-500 mt-0.5" />
                    <span>
                      {isAr
                        ? 'إيقاف هذا الخيار يسمح للطلاب في هذا النطاق بالتسجيل المباشر ذاتياً فوراً.'
                        : 'Disabling this allows students in this GPA bracket to register directly from their portal.'}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Is Active Option */}
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-medium text-foreground">
                {isAr ? 'تفعيل القاعدة مباشرة' : 'Activate rule immediately'}
              </span>
              <button
                type="button"
                onClick={() => setIsActive(!isActive)}
                className={cn(
                  'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out',
                  isActive ? 'bg-primary' : 'bg-muted',
                )}
              >
                <span
                  className={cn(
                    'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out',
                    isActive ? (isAr ? '-translate-x-4' : 'translate-x-4') : 'translate-x-0',
                  )}
                />
              </button>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              {isAr ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button
              disabled={createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin me-1.5" /> : null}
              {isAr ? 'حفظ القاعدة' : 'Save Rule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

