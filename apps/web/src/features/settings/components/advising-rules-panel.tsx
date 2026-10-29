'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  GraduationCap,
  ShieldCheck,
  Info,
  Loader2,
  CheckCircle2,
  Sliders,
  Layers,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { getApiErrorMessage } from '@/lib/api';
import {
  getAdvisingRules,
  updateAdvisingRules,
  settingsKeys,
  type AdvisingRulesItem,
} from '../api';

export function AdvisingRulesPanel({ locale }: { locale: string }) {
  const isAr = locale === 'ar';
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canManage =
    user?.role === 'admin' ||
    Boolean(user?.permissions?.includes('advising.write'));

  const [guideOpen, setGuideOpen] = useState(false);

  const rulesQuery = useQuery({
    queryKey: settingsKeys.advisingRules,
    queryFn: () => getAdvisingRules(),
  });

  const [maxCoursesLimit, setMaxCoursesLimit] = useState(6);
  const [preventHigherLevelCourses, setPreventHigherLevelCourses] = useState(true);
  const [allowLowGradeImprovementFallback, setAllowLowGradeImprovementFallback] = useState(true);
  const [enforceDepartmentLevel3And4, setEnforceDepartmentLevel3And4] = useState(true);
  const [probationMaxCredits, setProbationMaxCredits] = useState(12);
  const [regularMaxCredits, setRegularMaxCredits] = useState(18);
  const [graduatingMaxCredits, setGraduatingMaxCredits] = useState(21);
  const [summerMaxCredits, setSummerMaxCredits] = useState(9);
  const [summerProbationMaxCredits, setSummerProbationMaxCredits] = useState(6);

  const [prevData, setPrevData] = useState<typeof rulesQuery.data>(undefined);
  if (rulesQuery.data && rulesQuery.data !== prevData) {
    setPrevData(rulesQuery.data);
    const data = rulesQuery.data;
    setMaxCoursesLimit(data.maxCoursesLimit ?? 6);
    setPreventHigherLevelCourses(data.preventHigherLevelCourses ?? true);
    setAllowLowGradeImprovementFallback(data.allowLowGradeImprovementFallback ?? true);
    setEnforceDepartmentLevel3And4(data.enforceDepartmentLevel3And4 ?? true);
    setProbationMaxCredits(data.probationMaxCredits ?? 12);
    setRegularMaxCredits(data.regularMaxCredits ?? 18);
    setGraduatingMaxCredits(data.graduatingMaxCredits ?? 21);
    setSummerMaxCredits(data.summerMaxCredits ?? 9);
    setSummerProbationMaxCredits(data.summerProbationMaxCredits ?? 6);
  }

  const updateMutation = useMutation({
    mutationFn: async () => {
      const payload: Partial<AdvisingRulesItem> = {
        maxCoursesLimit: Number(maxCoursesLimit),
        preventHigherLevelCourses: Boolean(preventHigherLevelCourses),
        allowLowGradeImprovementFallback: Boolean(allowLowGradeImprovementFallback),
        enforceDepartmentLevel3And4: Boolean(enforceDepartmentLevel3And4),
        probationMaxCredits: Number(probationMaxCredits),
        regularMaxCredits: Number(regularMaxCredits),
        graduatingMaxCredits: Number(graduatingMaxCredits),
        summerMaxCredits: Number(summerMaxCredits),
        summerProbationMaxCredits: Number(summerProbationMaxCredits),
      };
      return updateAdvisingRules(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.advisingRules });
      toast.success(
        isAr
          ? 'تم حفظ وتحديث قواعد الإرشاد الأكاديمي بنجاح'
          : 'Advising rules updated successfully',
      );
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err));
    },
  });

  if (rulesQuery.isLoading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Read-Only Notice if user cannot manage */}
      {!canManage && (
        <div className="flex items-center gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-300">
          <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400" />
          <span>
            {isAr
              ? 'وضع العرض فقط: حسابك لا يملك صلاحية تعديل قواعد الإرشاد الأكاديمي (advising.write). يمكنك استعراض الضوابط والسقوف الدراسية دون إمكانية الحفظ.'
              : 'Read-only mode: Your account lacks advising edit permissions (advising.write). You can review rules in view-only mode.'}
          </span>
        </div>
      )}

      {/* Header Banner */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-white/10 pb-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
            <GraduationCap className="h-5 w-5 text-primary" />
            <span>
              {isAr
                ? 'إعدادات وقواعد التوصية للإرشاد الأكاديمي'
                : 'Advising & Course Recommendation Rules'}
            </span>
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {isAr
              ? 'التحكم في سقف المقررات الموصى بها، منع تجاوز المستوى الأكاديمي، وسياسات التخصص والأقسام.'
              : 'Configure recommendation limits, strict level bounds, department specialization, and credit caps.'}
          </p>
        </div>

        <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setGuideOpen((prev) => !prev)}
            className="h-auto min-h-11 whitespace-normal rounded-squircle px-3 py-2 gap-1.5 text-xs border-primary/30 text-primary hover:bg-primary/10"
          >
            <HelpCircle className="h-4 w-4" />
            <span>{isAr ? 'شرح المحرك الأكاديمي' : 'Engine Guide'}</span>
            {guideOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>

          <Button
            onClick={() => updateMutation.mutate()}
            disabled={!canManage || updateMutation.isPending}
            className="h-auto min-h-11 whitespace-normal rounded-squircle gap-2 px-4 py-2 text-xs font-semibold shadow-md disabled:opacity-50"
            title={!canManage ? (isAr ? 'يتطلب صلاحية تعديل الإرشاد الأكاديمي' : 'Requires advising.write') : undefined}
          >
            {updateMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            <span>{isAr ? 'حفظ التغييرات' : 'Save Rules'}</span>
          </Button>
        </div>
      </div>

      {/* Collapsible Rich Educational Guide */}
      {guideOpen && (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 animate-in fade-in-0 duration-300 space-y-3">
          <div className="font-bold text-xs text-foreground flex items-center gap-2">
            <Info className="h-4 w-4 text-primary" />
            <span>{isAr ? 'دليل عمل محرك الإرشاد والتوصية الذكي (Advising Engine Blueprint)' : 'Advising Engine Logic & Policy Guide'}</span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
            <div className="rounded-xl border border-white/10 bg-background/50 p-3 space-y-1">
              <strong className="block text-foreground text-xs font-semibold">
                {isAr ? '1. سقف المقررات في الفصل:' : '1. Course Ceilings:'}
              </strong>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {isAr
                  ? 'يحدد الحد الأقصى للمقررات (افتراضياً 6 مقررات) التي يرشحها المحرك للطالب في الفصل الواحد لمنع الإجهاد.'
                  : 'Caps recommended course count (default 6) per term to prevent academic overload.'}
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-background/50 p-3 space-y-1">
              <strong className="block text-foreground text-xs font-semibold">
                {isAr ? '2. قفل المستويات المتقدمة:' : '2. Level Progression:'}
              </strong>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {isAr
                  ? 'يمنع ترشيح مقررات من مستوى أعلى من مستوى الطالب الحالي قبل استيفاء مقررات مستواه والمتطلبات الراسبة.'
                  : 'Disallows courses from higher academic levels until standing level courses are cleared.'}
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-background/50 p-3 space-y-1">
              <strong className="block text-foreground text-xs font-semibold">
                {isAr ? '3. العزل التخصصي (BIS / محاسبة):' : '3. Track Separation:'}
              </strong>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {isAr
                  ? 'في المستويين 3 و 4 يتم ترشيح مواد كل شعبة لطلابها فقط، مع الاحتفاظ بـ 5 مقررات مشتركة متاحة للشعبتين.'
                  : 'Isolates Level 3 & 4 courses by department while allowing 5 designated common shared subjects.'}
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-background/50 p-3 space-y-1">
              <strong className="block text-foreground text-xs font-semibold">
                {isAr ? '4. فرص تحسين المعدل:' : '4. D/D+ Improvement:'}
              </strong>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {isAr
                  ? 'عند تعطل الجدول بسبب رسوب متطلب سابق، يُعرض مقرر ذو تقدير ضعيف (D/D+) اختيارياً لرفع المعدل التراكمي.'
                  : 'Suggests optional retakes for D/D+ grades when progression is stalled by prerequisite failures.'}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Card 1: Course Allocation & Level Boundary */}
        <div className="flex flex-col justify-between rounded-2xl border border-white/10 bg-card/60 p-5 backdrop-blur-sm space-y-4">
          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
                <Sliders className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">
                  {isAr ? 'سقف المقررات وحدود المستوى' : 'Course Allocation & Level Bounds'}
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  {isAr ? 'ضوابط سقف التوصية والمقرر السادس' : '6-course maximum and level progression'}
                </p>
              </div>
            </div>

            {/* Max courses input */}
            <div className="rounded-xl border border-white/5 bg-secondary/20 p-3 space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">
                {isAr
                  ? 'الحد الأقصى لعدد المقررات الموصى بها (افتراضي 6 مقررات)'
                  : 'Maximum Recommended Courses (Default 6 courses)'}
              </Label>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min={1}
                  max={10}
                  disabled={!canManage}
                  value={maxCoursesLimit}
                  onChange={(e) => setMaxCoursesLimit(Number(e.target.value))}
                  className="h-9 w-28 text-center font-mono font-bold text-sm disabled:opacity-60"
                />
                <span className="text-xs text-muted-foreground">
                  {isAr ? 'مقررات دراسية في الفصل الواحد' : 'courses per term'}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground/80">
                {isAr
                  ? 'يقوم محرك الإرشاد بالتوصية بما لا يتجاوز هذا العدد للمقررات الإجبارية والاختيارية.'
                  : 'The engine will not recommend more than this limit in any single semester plan.'}
              </p>
            </div>

            {/* Prevent higher level switch */}
            <div className="flex items-start gap-3 rounded-xl border border-white/5 bg-secondary/20 p-3">
              <input
                id="preventHigherLevel"
                type="checkbox"
                disabled={!canManage}
                checked={preventHigherLevelCourses}
                onChange={(e) => setPreventHigherLevelCourses(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              />
              <div className="space-y-0.5">
                <Label
                  htmlFor="preventHigherLevel"
                  className={cn("text-xs font-semibold text-foreground cursor-pointer", !canManage && "cursor-not-allowed opacity-70")}
                >
                  {isAr
                    ? 'منع التوصية بمقررات من مستوى أعلى من مستوى الطالب الحالي'
                    : 'Prevent Recommending Courses from Higher Academic Levels'}
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  {isAr
                    ? 'لا يجوز للمقرر السادس أو أي مقرر إضافي أن يسبق مستوى الطالب الأكاديمي الحالي.'
                    : 'The 6th filler course can never be from a higher level than student current standing.'}
                </p>
              </div>
            </div>

            {/* Low grade improvement fallback */}
            <div className="flex items-start gap-3 rounded-xl border border-white/5 bg-secondary/20 p-3">
              <input
                id="allowLowGradeFallback"
                type="checkbox"
                disabled={!canManage}
                checked={allowLowGradeImprovementFallback}
                onChange={(e) => setAllowLowGradeImprovementFallback(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              />
              <div className="space-y-0.5">
                <Label
                  htmlFor="allowLowGradeFallback"
                  className={cn("text-xs font-semibold text-foreground cursor-pointer", !canManage && "cursor-not-allowed opacity-70")}
                >
                  {isAr
                    ? 'إتاحة مقررات التحسين (تقدير D/D+) كخيار بديل اختياري عند تعطل المقررات'
                    : 'Allow Optional Low-Grade Improvement Courses when Blocked'}
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  {isAr
                    ? 'إذا لم تكن هناك مقررات مفتوحة في مستوى الطالب بسبب رسوب متطلب سابق، يُعرض مقرر التحسين كخيار اختياري للطالب دون إجباره.'
                    : 'If remaining level courses are locked due to failed prereqs, low-grade courses are marked as optional improvement choices.'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Department Specialization (Level 3 & Level 4) */}
        <div className="flex flex-col justify-between rounded-2xl border border-white/10 bg-card/60 p-5 backdrop-blur-sm space-y-4">
          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-500/10 text-emerald-400">
                <Layers className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">
                  {isAr ? 'عزل الأقسام والتخصصات (المستوى 3 و 4)' : 'Department Specialization (L3 & L4)'}
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  {isAr ? 'شعبة نظم معلومات الأعمال BIS وشعبة المحاسبة' : 'BIS track vs Accounting track separation'}
                </p>
              </div>
            </div>

            {/* Department enforcement checkbox */}
            <div className="flex items-start gap-3 rounded-xl border border-white/5 bg-secondary/20 p-3">
              <input
                id="enforceDept"
                type="checkbox"
                disabled={!canManage}
                checked={enforceDepartmentLevel3And4}
                onChange={(e) => setEnforceDepartmentLevel3And4(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              />
              <div className="space-y-0.5">
                <Label
                  htmlFor="enforceDept"
                  className={cn("text-xs font-semibold text-foreground cursor-pointer", !canManage && "cursor-not-allowed opacity-70")}
                >
                  {isAr
                    ? 'إلزام الطلاب بمقررات قسمهم وتخصصهم تلقائياً'
                    : 'Enforce Department-Specific Courses for Level 3 & Level 4'}
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  {isAr
                    ? 'توصية طلاب شعبة نظم الأعمال بمقررات BIS، وشعبة المحاسبة بمقررات ACCOUNTING، مع إتاحة المقررات المشتركة للجميع (317، 411، 318، 319، 326).'
                    : 'Filters courses by department while maintaining common shared subjects (317, 411, 318, 319, 326).'}
                </p>
              </div>
            </div>

            {/* Information Banner */}
            <div className="rounded-xl border border-sky-500/20 bg-sky-500/10 p-3 text-xs text-sky-200 space-y-1">
              <div className="flex items-center gap-1.5 font-bold">
                <Info className="h-4 w-4 text-sky-400" />
                <span>{isAr ? 'المقررات المشتركة المعتمدة' : 'Official Shared Courses'}</span>
              </div>
              <p className="text-[11px] text-sky-300/80 leading-relaxed">
                {isAr
                  ? 'مبادئ الاستثمار (317)، الاقتصاد الكلي (411)، الإدارة الاستراتيجية (318)، ريادة الأعمال (319)، والمحاسبة الحكومية (326) تظل مشتركة وتتاح لكلا القسمين تلقائياً.'
                  : 'Investment (317), Macroeconomics (411), Strategic Mgmt (318), Entrepreneurship (319), and Govt Accounting (326) remain shared across both majors.'}
              </p>
            </div>
          </div>
        </div>

        {/* Card 3: Credit Limits & Probation Matrix */}
        <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-card/60 p-5 backdrop-blur-sm space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-purple-500/10 text-purple-400">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">
                {isAr ? 'سقوف الساعات المعتمدة في الإرشاد الأكاديمي' : 'Credit Hours Allocation Matrix'}
              </h3>
              <p className="text-[11px] text-muted-foreground">
                {isAr ? 'الحدود القصوى للساعات حسب الحالة الأكاديمية للطالب' : 'Maximum allowed credit hours by student status'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            {/* Regular */}
            <div className="rounded-xl border border-white/5 bg-secondary/20 p-3 space-y-1">
              <Label className="text-[11px] font-semibold text-muted-foreground">
                {isAr ? 'الفصل العادي (طالب منتظم)' : 'Regular Term (Standard)'}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={6}
                  max={24}
                  disabled={!canManage}
                  value={regularMaxCredits}
                  onChange={(e) => setRegularMaxCredits(Number(e.target.value))}
                  className="h-8 w-20 text-center font-mono font-bold text-xs disabled:opacity-60"
                />
                <span className="text-xs font-semibold text-foreground">
                  {isAr ? 'ساعة' : 'cr'}
                </span>
              </div>
            </div>

            {/* Probation */}
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 space-y-1">
              <Label className="text-[11px] font-semibold text-amber-300">
                {isAr ? 'تحت الملاحظة (إنذار أكاديمي)' : 'Academic Probation'}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={3}
                  max={24}
                  disabled={!canManage}
                  value={probationMaxCredits}
                  onChange={(e) => setProbationMaxCredits(Number(e.target.value))}
                  className="h-8 w-20 text-center font-mono font-bold text-xs disabled:opacity-60"
                />
                <span className="text-xs font-semibold text-amber-200">
                  {isAr ? 'ساعة' : 'cr'}
                </span>
              </div>
            </div>

            {/* Graduating */}
            <div className="rounded-xl border border-sky-500/20 bg-sky-500/10 p-3 space-y-1">
              <Label className="text-[11px] font-semibold text-sky-300">
                {isAr ? 'طالب خريج (سنة التخرج)' : 'Graduating Senior'}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={6}
                  max={28}
                  disabled={!canManage}
                  value={graduatingMaxCredits}
                  onChange={(e) => setGraduatingMaxCredits(Number(e.target.value))}
                  className="h-8 w-20 text-center font-mono font-bold text-xs disabled:opacity-60"
                />
                <span className="text-xs font-semibold text-sky-200">
                  {isAr ? 'ساعة' : 'cr'}
                </span>
              </div>
            </div>

            {/* Summer Regular */}
            <div className="rounded-xl border border-white/5 bg-secondary/20 p-3 space-y-1">
              <Label className="text-[11px] font-semibold text-muted-foreground">
                {isAr ? 'الفصل الصيفي (منتظم)' : 'Summer (Standard)'}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={3}
                  max={15}
                  disabled={!canManage}
                  value={summerMaxCredits}
                  onChange={(e) => setSummerMaxCredits(Number(e.target.value))}
                  className="h-8 w-20 text-center font-mono font-bold text-xs disabled:opacity-60"
                />
                <span className="text-xs font-semibold text-foreground">
                  {isAr ? 'ساعة' : 'cr'}
                </span>
              </div>
            </div>

            {/* Summer Probation */}
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 space-y-1">
              <Label className="text-[11px] font-semibold text-amber-300">
                {isAr ? 'الفصل الصيفي (إنذار)' : 'Summer (Probation)'}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={3}
                  max={12}
                  disabled={!canManage}
                  value={summerProbationMaxCredits}
                  onChange={(e) => setSummerProbationMaxCredits(Number(e.target.value))}
                  className="h-8 w-20 text-center font-mono font-bold text-xs disabled:opacity-60"
                />
                <span className="text-xs font-semibold text-amber-200">
                  {isAr ? 'ساعة' : 'cr'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
