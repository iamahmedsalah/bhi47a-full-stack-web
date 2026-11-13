"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  GraduationCap,
  Info,
  Loader2,
  RefreshCw,
  Search,
  SlidersHorizontal,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { CustomDropdown } from "@/components/ui/custom-dropdown";
import { cn } from "@/lib/cn";
import { getApiErrorMessage } from "@/lib/api";
import {
  recalculateAcademicProgress,
} from "../api";

interface RecalculateLevelsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAr: boolean;
  onSuccess?: () => void;
}

export function RecalculateLevelsModal({
  open,
  onOpenChange,
  isAr,
  onSuccess,
}: RecalculateLevelsModalProps) {
  const [maxCarriedCourses, setMaxCarriedCourses] = useState<number>(2);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState<
    "all" | "promoted" | "retained"
  >("all");

  // Dry run query to preview promotion
  const previewQuery = useQuery({
    queryKey: ["admin", "grades", "recalculate-preview", maxCarriedCourses],
    queryFn: () =>
      recalculateAcademicProgress({
        dryRun: true,
        maxAllowedCarriedCourses: maxCarriedCourses,
      }),
    enabled: open,
    staleTime: 1000 * 30,
  });

  // Apply promotion mutation
  const applyMutation = useMutation({
    mutationFn: () =>
      recalculateAcademicProgress({
        dryRun: false,
        maxAllowedCarriedCourses: maxCarriedCourses,
      }),
    onSuccess: (data) => {
      toast.success(
        isAr
          ? `تم تحديث التقدم الأكاديمي بنجاح: تم ترقية ${data.promotedCount} طالب إلى المستوى التالي`
          : `Academic progress updated: ${data.promotedCount} student(s) promoted to the next level`,
      );
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error));
    },
  });

  const students = useMemo(() => previewQuery.data?.students ?? [], [previewQuery.data?.students]);

  const filteredStudents = useMemo(() => {
    return students.filter((student) => {
      // Search filter
      const matchesSearch =
        !searchTerm.trim() ||
        student.studentCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        student.studentName.toLowerCase().includes(searchTerm.toLowerCase());

      if (!matchesSearch) return false;

      // Status tab filter
      if (activeFilter === "promoted") return student.willPromote;
      if (activeFilter === "retained") return !student.willPromote;
      return true;
    });
  }, [students, searchTerm, activeFilter]);

  const totalCount = students.length;
  const promotedCount = previewQuery.data?.promotedCount ?? 0;
  const retainedCount = previewQuery.data?.retainedCount ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden rounded-2xl bg-card/95 border border-white/15 backdrop-blur-2xl shadow-2xl"
        dir={isAr ? "rtl" : "ltr"}
      >
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-secondary/20 p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-squircle border border-primary/30 bg-gradient-to-br from-teal-500/20 to-sky-500/20 text-primary shadow-sm">
              <GraduationCap className="h-6 w-6" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-foreground">
                {isAr
                  ? "إعادة حساب المستويات وترقية الطلاب"
                  : "Recalculate Levels & Student Promotion"}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                {isAr
                  ? "معاينة واعتماد ترقية الطلاب إلى المستوى الدراسي التالي وفق قواعد المقررات ومواد التخلف"
                  : "Preview and commit student promotion to the next academic level based on course rules and carried fails"}
              </DialogDescription>
            </div>
          </div>

          {/* Refresh Simulation Trigger */}
          <Button
            size="sm"
            variant="outline"
            disabled={previewQuery.isFetching}
            onClick={() => void previewQuery.refetch()}
            className="gap-1.5 rounded-squircle text-xs h-8 border-white/10 bg-secondary/30 hover:bg-secondary/60 cursor-pointer"
          >
            <RefreshCw
              className={cn(
                "h-3.5 w-3.5",
                previewQuery.isFetching && "animate-spin text-primary",
              )}
            />
            <span>{isAr ? "تحديث المعاينة" : "Refresh Preview"}</span>
          </Button>
        </div>

        {/* Rules & Filter Toolbar */}
        <div className="border-b border-white/10 bg-secondary/10 p-4 px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Rule Selector */}
          <div className="flex items-center gap-2.5 w-full md:w-auto">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground shrink-0">
              <SlidersHorizontal className="h-3.5 w-3.5 text-primary" />
              <span>{isAr ? "قاعدة مواد التخلف:" : "Carried Courses Rule:"}</span>
            </div>
            <div className="w-full sm:w-64">
              <CustomDropdown
                value={String(maxCarriedCourses)}
                onValueChange={(val) => setMaxCarriedCourses(Number(val))}
                ariaLabel={
                  isAr ? "قاعدة مواد الرسوب والتخلف" : "Carried courses limit"
                }
                className="h-8 text-xs rounded-squircle"
                options={[
                  {
                    value: "2",
                    label: isAr
                      ? "مادتان كحد أقصى (اللائحة القياسية)"
                      : "Max 2 courses (Standard Bylaw)",
                  },
                  {
                    value: "1",
                    label: isAr ? "مادة واحدة كحد أقصى" : "Max 1 course",
                  },
                  {
                    value: "0",
                    label: isAr
                      ? "اجتياز تام (0 رسوب / بدون تخلف)"
                      : "Strict Pass (0 fails allowed)",
                  },
                  {
                    value: "3",
                    label: isAr ? "3 مواد كحد أقصى" : "Max 3 courses",
                  },
                ]}
              />
            </div>
          </div>

          {/* Quick Search */}
          <div className="relative w-full md:w-64">
            <Search className="absolute inset-s-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="ps-8 h-8 text-xs rounded-squircle bg-background/50 border-white/10"
              placeholder={
                isAr ? "بحث بالاسم أو الكود..." : "Search name or code..."
              }
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute inset-e-2 top-2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Academic Promotion Rules Explainer Note (Small font rules) */}
        <div className="mx-6 mt-3.5 rounded-xl border border-sky-500/20 bg-sky-500/5 p-3 text-[11px] leading-relaxed text-muted-foreground">
          <div className="flex items-start gap-2.5">
            <Info className="h-4 w-4 text-sky-400 shrink-0 mt-0.5" />
            <div className="space-y-1 min-w-0 flex-1">
              <span className="font-semibold text-foreground text-xs">
                {isAr ? "ملاحظات وقواعد الترقية الأكاديمية:" : "Academic Promotion Bylaw Rules & Notes:"}
              </span>
              <ul className="list-disc ps-4 space-y-1 text-muted-foreground/90">
                <li>
                  <strong className="text-foreground/90">
                    {isAr ? "استيفاء مقررات المستوى:" : "Mandatory Curriculum:"}{" "}
                  </strong>
                  {isAr
                    ? "يشترط لترقية الطالب تسجيل واعتماد نتائج جميع المقررات الإجبارية للفصلين الأول والثاني في مستواه الحالي."
                    : "Student must finalize all mandatory courses for both regular semesters in their current level."}
                </li>
                <li>
                  <strong className="text-foreground/90">
                    {isAr ? "حد مواد التخلف المسموح:" : "Carried Courses Limit:"}{" "}
                  </strong>
                  {isAr
                    ? "يُرقى الطالب إلى المستوى التالي إذا كان عدد مواد الرسوب والتخلف لا يتجاوز الحد المسموح المختار (اللائحة القياسية: مادتان كحد أقصى)."
                    : "Student is promoted if failed/carried courses do not exceed the selected threshold (standard bylaw: max 2 courses)."}
                </li>
                <li>
                  <strong className="text-foreground/90">
                    {isAr ? "البقاء في المستوى للإعادة:" : "Retention:"}{" "}
                  </strong>
                  {isAr
                    ? "يبقى الطالب في مستواه الحالي إذا تجاوز عدد مواد الرسوب الحد المسموح أو كانت نتائج بعض المقررات الإجبارية غير مكتملة."
                    : "Students exceeding failed limits or with incomplete mandatory courses stay in their level."}
                </li>
                <li>
                  <strong className="text-foreground/90">
                    {isAr ? "طلاب المستوى الرابع:" : "Level 4 Seniors:"}{" "}
                  </strong>
                  {isAr
                    ? "المستوى الرابع هو الحد الأقصى للمستويات ولا تتم الترقية منه، بل ينتقل الطالب لمرحلة مراجعة التخرج واستيفاء الساعات."
                    : "Level 4 is the terminal level; students remain in Level 4 until graduating."}
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* KPI Stat Cards & Tabs */}
        <div className="px-6 pt-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Total Evaluated */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => setActiveFilter("all")}
              onKeyDown={(e) => (e.key === "Enter" ? setActiveFilter("all") : null)}
              className={cn(
                "rounded-xl border p-3 flex items-center justify-between transition cursor-pointer",
                activeFilter === "all"
                  ? "border-primary/50 bg-primary/10 shadow-sm"
                  : "border-white/10 bg-secondary/15 hover:bg-secondary/30",
              )}
            >
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-squircle bg-secondary/50 text-foreground">
                  <Users className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">
                    {isAr ? "إجمالي الطلاب" : "Total Evaluated"}
                  </p>
                  <p className="text-base font-bold font-mono text-foreground">
                    {totalCount}
                  </p>
                </div>
              </div>
              <span className="text-[11px] text-muted-foreground">
                {isAr ? "الكل" : "All"}
              </span>
            </div>

            {/* Promoted */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => setActiveFilter("promoted")}
              onKeyDown={(e) =>
                e.key === "Enter" ? setActiveFilter("promoted") : null
              }
              className={cn(
                "rounded-xl border p-3 flex items-center justify-between transition cursor-pointer",
                activeFilter === "promoted"
                  ? "border-emerald-500/50 bg-emerald-500/15 shadow-sm"
                  : "border-white/10 bg-secondary/15 hover:bg-secondary/30",
              )}
            >
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-squircle bg-emerald-500/20 text-emerald-400">
                  <TrendingUp className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[11px] text-emerald-400 font-medium">
                    {isAr ? "مؤهلون للترقية" : "Will Promote"}
                  </p>
                  <p className="text-base font-bold font-mono text-emerald-300">
                    {promotedCount}
                  </p>
                </div>
              </div>
              <span className="rounded-squircle bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                {totalCount > 0
                  ? `${Math.round((promotedCount / totalCount) * 100)}%`
                  : "0%"}
              </span>
            </div>

            {/* Retained */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => setActiveFilter("retained")}
              onKeyDown={(e) =>
                e.key === "Enter" ? setActiveFilter("retained") : null
              }
              className={cn(
                "rounded-xl border p-3 flex items-center justify-between transition cursor-pointer",
                activeFilter === "retained"
                  ? "border-amber-500/50 bg-amber-500/15 shadow-sm"
                  : "border-white/10 bg-secondary/15 hover:bg-secondary/30",
              )}
            >
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-squircle bg-amber-500/20 text-amber-400">
                  <AlertCircle className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[11px] text-amber-400 font-medium">
                    {isAr ? "باقون في مستواهم" : "Will Retain"}
                  </p>
                  <p className="text-base font-bold font-mono text-amber-300">
                    {retainedCount}
                  </p>
                </div>
              </div>
              <span className="rounded-squircle bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                {totalCount > 0
                  ? `${Math.round((retainedCount / totalCount) * 100)}%`
                  : "0%"}
              </span>
            </div>
          </div>
        </div>

        {/* Scrollable Students Preview List */}
        <div className="flex-1 overflow-y-auto p-6 pt-3 min-h-[300px] max-h-[420px] custom-scroll space-y-2">
          {previewQuery.isLoading ? (
            <div className="flex flex-col items-center justify-center h-48 space-y-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-xs text-muted-foreground">
                {isAr
                  ? "جاري تقييم نتائج ومستويات الطلاب وفق اللائحة..."
                  : "Evaluating student progression against academic rules..."}
              </p>
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-44 text-center rounded-squircle border border-dashed border-white/10 bg-secondary/10 p-6">
              <Users className="h-8 w-8 text-muted-foreground/40 mb-2" />
              <p className="text-xs text-muted-foreground font-medium">
                {isAr
                  ? "لا يوجد طلاب مطابقون لمعايير البحث أو التصفية"
                  : "No students match the current criteria"}
              </p>
            </div>
          ) : (
            filteredStudents.map((student) => {
              return (
                <div
                  key={student.studentId || student.studentCode}
                  className={cn(
                    "flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border p-3 transition-all",
                    student.willPromote
                      ? "border-emerald-500/20 bg-emerald-500/5 hover:border-emerald-500/40"
                      : "border-white/10 bg-secondary/15 hover:border-white/20",
                  )}
                >
                  {/* Left / Student Details */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-squircle border text-xs font-bold",
                        student.willPromote
                          ? "border-emerald-500/30 bg-emerald-500/20 text-emerald-300"
                          : "border-white/10 bg-secondary/40 text-muted-foreground",
                      )}
                    >
                      {student.studentName.trim().charAt(0) || "ط"}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <strong className="text-xs font-semibold text-foreground truncate">
                          <bdi>{student.studentName}</bdi>
                        </strong>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          ({student.studentCode})
                        </span>
                      </div>

                      {/* Rule Reason & Subtitle */}
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {isAr ? student.reasonAr : student.reasonEn}
                      </p>

                      {/* Chips for Carried or Missing Courses */}
                      {student.carriedFailedCourses?.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1 mt-1">
                          <span className="text-[10px] text-amber-300/80">
                            {isAr ? "مواد الرسوب:" : "Failed:"}
                          </span>
                          {student.carriedFailedCourses.map((code) => (
                            <span
                              key={code}
                              className="rounded-squircle bg-red-500/15 border border-red-500/30 px-1.5 py-0.2 text-[9px] font-mono font-bold text-red-300"
                            >
                              {code}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right / Level Transition & Stats */}
                  <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                    {/* GPA & Credits */}
                    <div className="text-end font-mono text-[11px] hidden sm:block">
                      <p className="text-sky-300 font-semibold">
                        GPA {student.gpa.toFixed(2)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {student.completedCredits}{" "}
                        {isAr ? "ساعة منجزة" : "cr passed"}
                      </p>
                    </div>

                    {/* Level Transition Indicator */}
                    <div className="flex items-center gap-1.5 rounded-squircle border border-white/10 bg-background/50 px-2.5 py-1 text-xs">
                      <span className="text-muted-foreground">
                        {isAr
                          ? `المستوى ${student.currentLevel}`
                          : `L${student.currentLevel}`}
                      </span>
                      {student.willPromote ? (
                        <>
                          <ArrowRight className="h-3 w-3 text-emerald-400 rtl:rotate-180" />
                          <span className="font-bold text-emerald-300">
                            {isAr
                              ? `المستوى ${student.targetLevel}`
                              : `L${student.targetLevel}`}
                          </span>
                        </>
                      ) : (
                        <span className="font-bold text-muted-foreground">
                          {isAr ? "(باقٍ)" : "(Stay)"}
                        </span>
                      )}
                    </div>

                    {/* Decision Badge */}
                    <span
                      className={cn(
                        "rounded-squircle px-2.5 py-1 text-[10px] font-bold border flex items-center gap-1",
                        student.willPromote
                          ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
                          : "border-amber-500/30 bg-amber-500/15 text-amber-300",
                      )}
                    >
                      {student.willPromote ? (
                        <>
                          <Check className="h-3 w-3 stroke-[3]" />
                          <span>{isAr ? "ترقية" : "Promote"}</span>
                        </>
                      ) : (
                        <>
                          <X className="h-3 w-3" />
                          <span>{isAr ? "إبقاء" : "Retain"}</span>
                        </>
                      )}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer with Summary & Confirm Action */}
        <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-3 border-t border-white/10 bg-secondary/20 p-4 px-6">
          <div className="text-xs text-muted-foreground text-center sm:text-start">
            {promotedCount > 0 ? (
              <span>
                {isAr
                  ? `سيتم ترقية ${promotedCount} طالب إلى المستوى التالي وتحديث ملفاتهم الأكاديمية للفصل الأول.`
                  : `Will promote ${promotedCount} student(s) to the next level and initialize their next term profile.`}
              </span>
            ) : (
              <span className="text-amber-300/80">
                {isAr
                  ? "لا يوجد طلاب مؤهلون للترقية وفق المعايير الحالية."
                  : "No students currently eligible for promotion under selected rules."}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-9 text-xs rounded-squircle"
            >
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              type="button"
              disabled={
                applyMutation.isPending ||
                previewQuery.isLoading ||
                totalCount === 0
              }
              onClick={() => applyMutation.mutate()}
              className="h-9 gap-1.5 bg-gradient-to-r from-teal-500 to-sky-500 text-white hover:from-teal-400 hover:to-sky-400 text-xs font-semibold shadow-md rounded-squircle cursor-pointer"
            >
              {applyMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              <span>
                {isAr
                  ? `تأكيد تطبيق الترقية (${promotedCount} طالب)`
                  : `Apply Promotion (${promotedCount} Students)`}
              </span>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
