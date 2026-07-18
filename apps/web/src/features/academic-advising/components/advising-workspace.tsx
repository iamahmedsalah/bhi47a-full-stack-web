"use client";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  GraduationCap,
  Loader2,
  Search,
  ShieldAlert,
  Sparkles,
  X,
  CalendarClock,
  ClipboardCheck,
  Clock3,
  FileText,
  LockKeyhole,
  MessageSquarePlus,
  UnlockKeyhole,
  Printer,
  Archive,
  FolderOpen,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { CustomDropdown } from "@/components/ui/custom-dropdown";
import { CourseMapFlow } from "@/components/registration/course-map-flow";
import { cn } from "@/lib/cn";
import { getApiErrorMessage } from "@/lib/api";
import { useAuth } from "@/providers/auth-provider";
import { apiGet } from "@/lib/api-client";
import {
  openRegistrationPrintView,
  type PrintableRegistrationForm,
} from "@/lib/registration-print";
import {
  advisingApi,
  advisingKeys,
  type AdminRegistration,
} from "../api/advising-api";
import type {
  AdvisingAuditLog,
  AdvisingCase,
  AdvisingCourseMap,
  AdvisingNote,
  AdvisingPlan,
  AdvisingStudent,
  CourseRecommendation,
} from "../types/advising.types";

export function AdvisingWorkspace({ locale }: { locale: string }) {
  const isArabic = locale === "ar";
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [selected, setSelected] = useState<AdvisingStudent>();
  const [managedYear, setManagedYear] = useState("");
  const [advisingSemester, setAdvisingSemester] = useState<
    "first" | "second" | "summer"
  >("first");
  const [newAcademicYear, setNewAcademicYear] = useState("");
  const [selectedAdvisorId, setSelectedAdvisorId] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [manualSelections, setManualSelections] = useState<
    Record<string, string[]>
  >({});
  useEffect(() => {
    const requestedStudent = new URLSearchParams(window.location.search).get("student");
    if (!requestedStudent) return undefined;
    const timer = window.setTimeout(() => setSearch(requestedStudent), 0);
    return () => window.clearTimeout(timer);
  }, []);
  const terms = useQuery({
    queryKey: advisingKeys.terms,
    queryFn: advisingApi.registrationTerms,
  });
  const academicYears = useQuery({
    queryKey: advisingKeys.academicYears,
    queryFn: advisingApi.academicYears,
  });
  const advisors = useQuery({
    queryKey: advisingKeys.advisors,
    queryFn: advisingApi.advisors,
    enabled: user?.role === "admin",
  });
  const defaultAcademicYear = `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;
  const academicYear =
    managedYear ||
    academicYears.data?.find((year) => year.isCurrent)?.academicYear ||
    academicYears.data?.[0]?.academicYear ||
    defaultAcademicYear;
  const selectedYearSummary = academicYears.data?.find(
    (year) => year.academicYear === academicYear,
  );
  const students = useQuery({
    queryKey: advisingKeys.students(
      search,
      statusFilter,
      levelFilter,
      academicYear,
      advisingSemester,
    ),
    queryFn: () =>
      advisingApi.students(
        search,
        statusFilter,
        levelFilter,
        academicYear,
        advisingSemester,
      ),
  });
  const refreshAcademicManagement = () => {
    queryClient.invalidateQueries({ queryKey: advisingKeys.academicYears });
    queryClient.invalidateQueries({ queryKey: advisingKeys.terms });
  };
  const createYear = useMutation({
    mutationFn: () => advisingApi.createAcademicYear(newAcademicYear.trim()),
    onSuccess: () => {
      setManagedYear(newAcademicYear.trim());
      setNewAcademicYear("");
      refreshAcademicManagement();
      toast.success(isArabic ? "تمت إضافة السنة الأكاديمية" : "Academic year added");
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });
  const setCurrentYear = useMutation({
    mutationFn: advisingApi.setCurrentAcademicYear,
    onSuccess: () => {
      refreshAcademicManagement();
      toast.success(isArabic ? "تم تعيين السنة الحالية" : "Current academic year updated");
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });
  const deleteYear = useMutation({
    mutationFn: advisingApi.deleteAcademicYear,
    onSuccess: () => {
      setManagedYear("");
      refreshAcademicManagement();
      toast.success(isArabic ? "تم حذف السنة الأكاديمية" : "Academic year removed");
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });
  const assignStudents = useMutation({
    mutationFn: () =>
      advisingApi.assignStudents({
        advisorId: selectedAdvisorId,
        studentIds: selectedStudentIds,
        academicYear,
        semester: advisingSemester,
      }),
    onSuccess: (result) => {
      setSelectedStudentIds([]);
      queryClient.invalidateQueries({ queryKey: advisingKeys.advisors });
      queryClient.invalidateQueries({
        queryKey: advisingKeys.students(search, statusFilter, levelFilter, academicYear, advisingSemester),
      });
      toast.success(
        isArabic
          ? `تم تعيين ${result.assignedCount} طالب`
          : `${result.assignedCount} students assigned`,
      );
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });
  const saveTerm = useMutation({
    mutationFn: ({
      semester,
      isOpen,
    }: {
      semester: "first" | "second" | "summer";
      isOpen: boolean;
    }) => advisingApi.saveRegistrationTerm({ academicYear, semester, isOpen }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: advisingKeys.terms });
      queryClient.invalidateQueries({ queryKey: advisingKeys.academicYears });
      queryClient.invalidateQueries({
        queryKey: advisingKeys.students(search, statusFilter, levelFilter, academicYear, advisingSemester),
      });
      toast.success(
        isArabic ? "تم تحديث حالة الفصل" : "Semester status updated",
      );
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });
  const active = selected ?? students.data?.items[0];
  const caseId = active?.caseId;
  const caseDetails = useQuery({
    queryKey: advisingKeys.case(caseId),
    queryFn: () => advisingApi.case(caseId!),
    enabled: !!caseId,
  });
  const registrations = useQuery({
    queryKey: advisingKeys.registrations(active?.id),
    queryFn: () => advisingApi.registrations(active!.id),
    enabled: !!active?.id,
  });
  const recommendations = useQuery({
    queryKey: advisingKeys.recommendations(caseId),
    queryFn: () => advisingApi.recommendations(caseId!),
    enabled: !!caseId,
  });
  const courseMap = useQuery({
    queryKey: advisingKeys.courseMap(caseId),
    queryFn: () => advisingApi.courseMap(caseId!),
    enabled: !!caseId,
  });
  const plans = useQuery({
    queryKey: advisingKeys.plans(caseId),
    queryFn: () => advisingApi.plans(caseId!),
    enabled: !!caseId,
  });
  const notes = useQuery({
    queryKey: advisingKeys.notes(caseId),
    queryFn: () => advisingApi.notes(caseId!),
    enabled: !!caseId,
  });
  const audit = useQuery({
    queryKey: advisingKeys.audit(caseId),
    queryFn: () => advisingApi.audit(caseId!),
    enabled: !!caseId && user?.role === "admin",
  });
  const run = useMutation({
    mutationFn: () => advisingApi.generate(caseId!),
    onSuccess: (generated) => {
      queryClient.setQueryData(advisingKeys.recommendations(caseId), generated);
      queryClient.invalidateQueries({
        queryKey: advisingKeys.recommendations(caseId),
      });
      queryClient.invalidateQueries({
        queryKey: advisingKeys.courseMap(caseId),
      });
      queryClient.invalidateQueries({ queryKey: advisingKeys.case(caseId) });
      queryClient.invalidateQueries({ queryKey: advisingKeys.audit(caseId) });
      queryClient.invalidateQueries({
        queryKey: advisingKeys.students(search, statusFilter, levelFilter, academicYear, advisingSemester),
      });
      setSelected((current) =>
        current ? { ...current, advisingStatus: "AUTO_RECOMMENDED" } : current,
      );
      toast.success(
        isArabic
          ? `تم إنشاء ${generated.length} توصية`
          : `${generated.length} recommendations generated`,
      );
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });
  const openCase = useMutation({
    mutationFn: () =>
      advisingApi.createCase(
        active!.id,
        academicYear,
        advisingSemester,
      ),
    onSuccess: async (createdCase) => {
      await queryClient.invalidateQueries({
        queryKey: advisingKeys.students(search, statusFilter, levelFilter, academicYear, advisingSemester),
      });
      setSelected((current) => {
        const base = current ?? active;
        return base
          ? {
              ...base,
              caseId: createdCase._id,
              advisingStatus: createdCase.status,
            }
          : current;
      });
      queryClient.setQueryData(advisingKeys.case(createdCase._id), createdCase);
      toast.success(isArabic ? "تم فتح حالة الإرشاد" : "Advising case opened");
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });
  const decide = useMutation({
    mutationFn: ({
      id,
      decision,
    }: {
      id: string;
      decision: "ACCEPTED" | "REJECTED" | "PENDING";
    }) => advisingApi.decide(id, decision),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: advisingKeys.recommendations(caseId),
      });
      queryClient.invalidateQueries({
        queryKey: advisingKeys.courseMap(caseId),
      });
      queryClient.invalidateQueries({ queryKey: advisingKeys.audit(caseId) });
    },
  });
  const changeCaseStatus = useMutation({
    mutationFn: (status: "NOT_STARTED" | "CLOSED") =>
      advisingApi.updateCaseStatus(caseId!, status),
    onSuccess: (updatedCase) => {
      queryClient.setQueryData(advisingKeys.case(caseId), updatedCase);
      queryClient.invalidateQueries({ queryKey: advisingKeys.cases });
      queryClient.invalidateQueries({
        queryKey: advisingKeys.students(search, statusFilter, levelFilter, academicYear, advisingSemester),
      });
      setSelected((current) =>
        current ? { ...current, advisingStatus: updatedCase.status } : current,
      );
      toast.success(
        updatedCase.status === "CLOSED"
          ? "Advising case closed"
          : "Advising case reopened",
      );
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });
  const acceptedIds = useMemo(
    () =>
      (recommendations.data ?? [])
        .filter((item) => item.accepted && item.eligible && !item.rejected)
        .map((item) => item.courseId._id),
    [recommendations.data],
  );
  const acceptedSet = new Set(acceptedIds);
  const savedManualIds = (plans.data?.[0]?.selectedCourses ?? [])
    .map((course) => course._id)
    .filter((id) => !acceptedSet.has(id));
  const manualSelectedIds = caseId
    ? (manualSelections[caseId] ?? savedManualIds)
    : [];
  const updateManualSelectedIds = (
    updater: (current: string[]) => string[],
  ) => {
    if (!caseId) return;
    setManualSelections((current) => ({
      ...current,
      [caseId]: updater(current[caseId] ?? savedManualIds),
    }));
  };
  const selectedCourseIds = [
    ...new Set([...acceptedIds, ...manualSelectedIds]),
  ];
  const selectedSet = new Set(selectedCourseIds);
  const selectedCredits = (courseMap.data?.courses ?? []).reduce(
    (total, course) =>
      total + (selectedSet.has(course._id) ? (course.creditHours ?? 0) : 0),
    0,
  );
  const draft = plans.data?.find((plan) => plan.status !== "APPROVED");
  const isCaseClosed = caseDetails.data?.status === "CLOSED";
  const hasFinalRegistration = Boolean(courseMap.data?.registration);
  const createDraft = useMutation({
    mutationFn: () => advisingApi.createPlan(caseId!, selectedCourseIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: advisingKeys.plans(caseId) });
      queryClient.invalidateQueries({
        queryKey: advisingKeys.courseMap(caseId),
      });
      queryClient.invalidateQueries({ queryKey: advisingKeys.case(caseId) });
      queryClient.invalidateQueries({ queryKey: advisingKeys.audit(caseId) });
      toast.success(isArabic ? "تم حفظ المسودة" : "Draft saved");
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });
  const approve = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error("Save a draft first");
      await advisingApi.validate(draft._id);
      return advisingApi.approve(draft._id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: advisingKeys.plans(caseId) });
      queryClient.invalidateQueries({
        queryKey: advisingKeys.courseMap(caseId),
      });
      queryClient.invalidateQueries({ queryKey: advisingKeys.case(caseId) });
      queryClient.invalidateQueries({ queryKey: advisingKeys.audit(caseId) });
      queryClient.invalidateQueries({
        queryKey: advisingKeys.registrations(active?.id),
      });
      toast.success(isArabic ? "تم اعتماد الخطة" : "Plan approved");
    },
    onError: (error) =>
      toast.error(
        getApiErrorMessage(
          error,
          error instanceof Error ? error.message : "Approval failed",
        ),
      ),
  });
  return (
    <div className="grid min-h-[76vh] gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="rounded-3xl border border-white/10 bg-card/80 p-4">
        <div className="mb-4">
          <h1 className="text-lg font-bold">
            {isArabic ? "الإرشاد الأكاديمي" : "Academic Advising"}
          </h1>
          <p className="text-xs text-muted-foreground">
            {isArabic
              ? "اختر طالباً لبدء جلسة الإرشاد"
              : "Select a student to begin advising"}
          </p>
        </div>
        <div className="mb-4 grid grid-cols-1 gap-2 rounded-2xl border border-sky-500/20 bg-sky-500/5 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-sky-300">
            {isArabic ? "فترة الإرشاد النشطة" : "Active advising period"}
          </p>
          <CustomDropdown
            ariaLabel="Advising academic year"
            value={academicYear}
            onValueChange={(value) => {
              setManagedYear(value);
              setSelected(undefined);
            }}
            className="h-9 text-xs"
            options={(academicYears.data ?? []).map((year) => ({
              value: year.academicYear,
              label: year.academicYear,
            }))}
          />
          <CustomDropdown
            ariaLabel="Advising semester"
            value={advisingSemester}
            onValueChange={(value) => {
              setAdvisingSemester(value as "first" | "second" | "summer");
              setSelected(undefined);
            }}
            className="h-9 text-xs"
            options={[
              { value: "first", label: isArabic ? "الفصل الأول" : "First Semester" },
              { value: "second", label: isArabic ? "الفصل الثاني" : "Second Semester" },
              { value: "summer", label: isArabic ? "الفصل الصيفي" : "Summer Semester" },
            ]}
          />
        </div>
        {user?.role === "admin" ? (
          <div className="mb-4 rounded-2xl border border-white/10 bg-secondary/20 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-bold">
              <CalendarClock className="h-4 w-4 text-sky-300" />
              {isArabic ? "فتح وإغلاق التسجيل" : "Registration semesters"}
            </div>
            <div className="mb-2 flex gap-2">
              <Input
                value={newAcademicYear}
                onChange={(event) => setNewAcademicYear(event.target.value)}
                placeholder="2027-2028"
                className="h-9 text-xs"
              />
              <Button
                size="sm"
                disabled={createYear.isPending || !/^\d{4}-\d{4}$/.test(newAcademicYear)}
                onClick={() => createYear.mutate()}
              >
                +
              </Button>
            </div>
            <p className="mb-2 text-[10px] text-muted-foreground">
              {academicYear} · {selectedYearSummary?.registrationCount ?? 0}{" "}
              {isArabic ? "تسجيل" : "registrations"} ·{" "}
              {selectedYearSummary?.advisingCaseCount ?? 0}{" "}
              {isArabic ? "حالة إرشاد" : "advising cases"}
            </p>
            <div className="mb-3 flex gap-2">
              {!selectedYearSummary?.isCurrent ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 flex-1 text-[10px]"
                  disabled={setCurrentYear.isPending}
                  onClick={() => setCurrentYear.mutate(academicYear)}
                >
                  {isArabic ? "تعيين كسنة حالية" : "Make current"}
                </Button>
              ) : (
                <span className="flex-1 rounded-lg bg-emerald-500/10 px-2 py-2 text-center text-[10px] font-bold text-emerald-300">
                  {isArabic ? "السنة الحالية" : "Current year"}
                </span>
              )}
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-red-300"
                disabled={deleteYear.isPending || selectedYearSummary?.isCurrent}
                onClick={() => deleteYear.mutate(academicYear)}
                aria-label="Delete academic year"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="space-y-1.5">
              {(["first", "second", "summer"] as const).map((semester) => {
                const term = terms.data?.find(
                  (item) =>
                    item.academicYear === academicYear &&
                    item.semester === semester,
                );
                const open = term?.isOpen ?? false;
                return (
                  <button
                    key={semester}
                    type="button"
                    disabled={saveTerm.isPending}
                    onClick={() => saveTerm.mutate({ semester, isOpen: !open })}
                    className={cn(
                      "flex w-full items-center justify-between rounded-xl border px-3 py-2 text-xs transition",
                      open
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                        : "border-red-500/20 bg-red-500/5 text-red-200",
                    )}
                  >
                    <span className="capitalize">{semester}</span>
                    <span className="flex items-center gap-1">
                      {open ? (
                        <UnlockKeyhole className="h-3.5 w-3.5" />
                      ) : (
                        <LockKeyhole className="h-3.5 w-3.5" />
                      )}
                      {open
                        ? isArabic
                          ? "مفتوح"
                          : "Open"
                        : isArabic
                          ? "مغلق"
                          : "Closed"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        <div className="relative mb-3">
          <Search className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ps-9"
            placeholder={
              isArabic ? "بحث بالاسم أو الكود" : "Search name or code"
            }
          />
        </div>
        <div className="mb-3 grid grid-cols-2 gap-2">
          <CustomDropdown
            ariaLabel="Filter by advising status"
            value={statusFilter}
            onValueChange={setStatusFilter}
            className="h-9 text-xs"
            options={[
              { value: "", label: "All statuses" },
              { value: "NOT_STARTED", label: "Not started" },
              { value: "AUTO_RECOMMENDED", label: "Recommended" },
              { value: "DRAFT", label: "Draft" },
              { value: "APPROVED", label: "Approved" },
              { value: "CLOSED", label: "Closed" },
            ]}
          />
          <CustomDropdown
            ariaLabel="Filter by academic level"
            value={levelFilter}
            onValueChange={setLevelFilter}
            className="h-9 text-xs"
            options={[
              { value: "", label: "All levels" },
              ...["1", "2", "3", "4"].map((level) => ({
                value: level,
                label: `Level ${level}`,
              })),
            ]}
          />
        </div>
        {user?.role === "admin" ? (
          <div className="mb-3 rounded-2xl border border-white/10 bg-secondary/20 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-bold">
              <Users className="h-4 w-4 text-sky-300" />
              {isArabic ? "تعيين المرشد الأكاديمي" : "Advisor assignment"}
            </div>
            <CustomDropdown
              ariaLabel="Select advisor"
              value={selectedAdvisorId}
              onValueChange={setSelectedAdvisorId}
              className="mb-2 h-9 text-xs"
              options={(advisors.data ?? []).map((advisor) => ({
                value: advisor._id,
                label: `${advisor.name} (${advisor.assignedStudentCount})`,
              }))}
              placeholder={isArabic ? "اختر المرشد" : "Select advisor"}
            />
            <Button
              size="sm"
              className="w-full"
              disabled={
                assignStudents.isPending ||
                !selectedAdvisorId ||
                selectedStudentIds.length === 0
              }
              onClick={() => assignStudents.mutate()}
            >
              <UserPlus className="me-2 h-4 w-4" />
              {isArabic
                ? `تعيين الطلاب (${selectedStudentIds.length})`
                : `Assign selected (${selectedStudentIds.length})`}
            </Button>
          </div>
        ) : null}
        <div className="custom-scroll max-h-[65vh] space-y-2 overflow-auto">
          {students.isLoading ? (
            <Loader2 className="mx-auto mt-8 animate-spin" />
          ) : (
            students.data?.items.map((student) => (
              <div
                key={student.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelected(student)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") setSelected(student);
                }}
                className={cn(
                  "w-full rounded-2xl border p-3 text-start transition",
                  active?.id === student.id
                    ? "border-sky-400 bg-sky-500/10"
                    : "border-white/10 bg-secondary/20 hover:bg-secondary/40",
                )}
              >
                <div className="flex justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {user?.role === "admin" ? (
                      <input
                        type="checkbox"
                        aria-label={`Select ${student.name}`}
                        checked={selectedStudentIds.includes(student.id)}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) =>
                          setSelectedStudentIds((current) =>
                            event.target.checked
                              ? [...current, student.id]
                              : current.filter((id) => id !== student.id),
                          )
                        }
                        className="h-4 w-4 accent-sky-500"
                      />
                    ) : null}
                    <strong className="text-sm">{student.name}</strong>
                  </div>
                  <span className="font-mono text-xs text-sky-300">
                    {student.gpa.toFixed(2)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {student.studentCode} · {isArabic ? "المستوى" : "Level"}{" "}
                  {student.academicLevel}
                </p>
                {student.assignedAdvisorId ? (
                  <p className="mt-1 text-[10px] text-sky-300">
                    {isArabic ? "المرشد: " : "Advisor: "}
                    {advisors.data?.find(
                      (advisor) => advisor._id === String(student.assignedAdvisorId),
                    )?.name ?? (isArabic ? "معيّن" : "Assigned")}
                  </p>
                ) : null}
                <div className="mt-2 flex gap-2 text-[10px]">
                  <span className="rounded-full bg-red-500/15 px-2 py-1 text-red-300">
                    {student.failedCourseCount} {isArabic ? "راسب" : "failed"}
                  </span>
                  <span className="rounded-full bg-amber-500/15 px-2 py-1 text-amber-300">
                    {student.warningCount} {isArabic ? "إنذار" : "warnings"}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </aside>
      <main className="min-w-0 space-y-4">
        {!active ? (
          <Empty
            text={isArabic ? "لا يوجد طلاب مطابقون" : "No matching students"}
          />
        ) : (
          <>
            <header className="sticky top-2 z-20 rounded-3xl border border-white/10 bg-card/95 p-4 backdrop-blur">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase text-muted-foreground">
                    {active.studentCode}
                  </p>
                  <h2 className="text-xl font-bold">{active.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {active.department ?? "—"} ·{" "}
                    {isArabic ? "الفصل الدراسي " : "Semester "}
                    {(active.semester === "first" ? (isArabic ? "الأول" : "First") : active.semester === "second" ? (isArabic ? "الثاني" : "Second") : active.semester === "summer" ? (isArabic ? "الصيفي" : "Summer") : active.semester)} ·{" "}
                    {(() => {
                      const st = caseDetails.data?.status ?? active.advisingStatus;
                      const statusMap: Record<string, string> = {
                        NOT_STARTED: isArabic ? "لم يبدأ" : "Not Started",
                        AUTO_RECOMMENDED: isArabic ? "موصى به آلياً" : "Recommended",
                        ASSIGNED: isArabic ? "تم تعيين مرشد" : "Assigned",
                        UNDER_REVIEW: isArabic ? "قيد المراجعة" : "Under Review",
                        DRAFT: isArabic ? "مسودة" : "Draft",
                        WAITING_FOR_STUDENT: isArabic ? "في انتظار الطالب" : "Waiting for Student",
                        REVISION_REQUESTED: isArabic ? "طلب تعديل" : "Revision Requested",
                        APPROVED: isArabic ? "معتمد" : "Approved",
                        REGISTERED: isArabic ? "تم التسجيل" : "Registered",
                        CLOSED: isArabic ? "مغلق" : "Closed",
                      };
                      return statusMap[st] ?? st;
                    })()}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!caseId ? (
                    <Button
                      disabled={openCase.isPending}
                      onClick={() => openCase.mutate()}
                    >
                      {isArabic ? "فتح حالة إرشاد" : "Open advising case"}
                    </Button>
                  ) : null}
                  <Button
                    variant="outline"
                    disabled={!caseId || isCaseClosed || hasFinalRegistration || run.isPending}
                    onClick={() => run.mutate()}
                  >
                    <Sparkles className="me-2 h-4 w-4" />
                    {isArabic ? "إنشاء التوصيات" : "Generate"}
                  </Button>
                  <Button
                    disabled={
                      !caseId ||
                      isCaseClosed ||
                      hasFinalRegistration ||
                      createDraft.isPending ||
                      !selectedCourseIds.length
                    }
                    onClick={() => createDraft.mutate()}
                  >
                    {isArabic ? "حفظ مسودة" : "Save draft"}
                  </Button>
                  <Button
                    disabled={!draft || isCaseClosed || hasFinalRegistration || approve.isPending}
                    onClick={() => approve.mutate()}
                  >
                    <Check className="me-2 h-4 w-4" />
                    {isArabic ? "اعتماد" : "Approve"}
                  </Button>
                  {caseId ? (
                    <Button
                      variant="outline"
                      disabled={changeCaseStatus.isPending}
                      onClick={() =>
                        changeCaseStatus.mutate(
                          isCaseClosed ? "NOT_STARTED" : "CLOSED",
                        )
                      }
                    >
                      {isCaseClosed ? (
                        <FolderOpen className="me-2 h-4 w-4" />
                      ) : (
                        <Archive className="me-2 h-4 w-4" />
                      )}
                      {isCaseClosed ? "Reopen case" : "Close case"}
                    </Button>
                  ) : null}
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
                {[
                  ["GPA", active.gpa],
                  [
                    isArabic ? "ناجح" : "Passed",
                    courseMap.data?.summary.passedCourses ?? 0,
                  ],
                  [isArabic ? "راسب" : "Failed", courseMap.data?.summary.failedCourses ?? 0],
                  [
                    isArabic ? "الخطة" : "Plan",
                    courseMap.data?.registration?.courses.length ?? selectedCourseIds.length,
                  ],
                  [
                    isArabic ? "المقررات" : "Courses",
                    courseMap.data?.courses.length ?? 0,
                  ],
                  [
                    isArabic ? "الساعات" : "Credits",
                    `${selectedCredits} selected`,
                  ],
                  [
                    isArabic ? "المتبقي" : "Remaining",
                    courseMap.data?.summary.remainingCredits ?? 0,
                  ],
                  [isArabic ? "الإنذارات" : "Warnings", active.warningCount],
                ].map(([label, value], index) => (
                  <div
                    key={String(label)}
                    className={cn(
                      "rounded-xl border p-2",
                      index === 2
                        ? "border-red-500/30 bg-red-500/10"
                        : index === 7
                          ? "border-amber-500/30 bg-amber-500/10"
                          : "border-white/10 bg-secondary/20",
                    )}
                  >
                    <p className="text-[10px] uppercase text-muted-foreground">
                      {label}
                    </p>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            </header>
            {hasFinalRegistration ? (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
                <strong>
                  {isArabic
                    ? `يوجد تسجيل نهائي للفترة ${caseDetails.data?.academicYear ?? academicYear} - ${advisingSemester}`
                    : `${caseDetails.data?.academicYear ?? academicYear} ${advisingSemester} already has a final registration`}
                </strong>
                <p className="mt-1 text-xs">
                  {courseMap.data?.registration?.courses.join(", ")} · {isArabic
                    ? "هذه الفترة فقط للعرض. اختر عامًا أو فصلًا آخر من فترة الإرشاد النشطة لإنشاء الخطة التالية."
                    : "Only this period is read-only. Select another year or semester under Active advising period to create the next plan."}
                </p>
              </div>
            ) : null}
            <Tabs defaultValue="canvas">
              <TabsList className="h-auto flex-wrap">
                <TabsTrigger value="overview">
                  {isArabic ? "نظرة عامة" : "Overview"}
                </TabsTrigger>
                <TabsTrigger value="canvas">
                  {isArabic ? "مساحة الخطة" : "Advising Canvas"}
                </TabsTrigger>
                <TabsTrigger value="recommended">
                  {isArabic ? "التوصيات" : "Recommendations"}
                </TabsTrigger>
                {user?.role === "admin" ? (
                  <TabsTrigger value="history">
                    {isArabic ? "السجل الدراسي" : "History"}
                  </TabsTrigger>
                ) : null}
                <TabsTrigger value="registration">
                  {isArabic ? "التسجيل والطباعة" : "Registration & Print"}
                </TabsTrigger>
                <TabsTrigger value="notes">
                  {isArabic ? "الملاحظات" : "Notes"}
                </TabsTrigger>
                {user?.role === "admin" ? (
                  <TabsTrigger value="audit">
                    {isArabic ? "سجل العمليات" : "Audit"}
                  </TabsTrigger>
                ) : null}
              </TabsList>
              <TabsContent value="canvas">
                <Canvas
                  courseMap={courseMap.data}
                  recommendations={recommendations.data ?? []}
                  selectedCourseIds={selectedCourseIds}
                  locale={locale}
                  isArabic={isArabic}
                  disabled={isCaseClosed || hasFinalRegistration}
                  onDecision={(id, decision) => decide.mutate({ id, decision })}
                  onToggleManual={(courseId) =>
                    updateManualSelectedIds((current) =>
                      current.includes(courseId)
                        ? current.filter((id) => id !== courseId)
                        : [...current, courseId],
                    )
                  }
                />
              </TabsContent>
              <TabsContent value="recommended">
                <RecommendationList
                  items={recommendations.data ?? []}
                  isArabic={isArabic}
                  canGenerate={!!caseId}
                  disabled={isCaseClosed || hasFinalRegistration}
                  isGenerating={run.isPending}
                  onGenerate={() => run.mutate()}
                  onDecision={(id, decision) => decide.mutate({ id, decision })}
                />
              </TabsContent>
              <TabsContent value="overview">
                <OverviewPanel
                  student={active}
                  advisingCase={caseDetails.data}
                  draft={draft}
                  isArabic={isArabic}
                />
              </TabsContent>
              <TabsContent value="registration">
                <RegistrationSummary
                  registrations={registrations.data?.items ?? []}
                  isArabic={isArabic}
                />
              </TabsContent>
              {user?.role === "admin" ? (
                <TabsContent value="history">
                  <HistoryPanel
                    advisingCase={caseDetails.data}
                    isArabic={isArabic}
                  />
                </TabsContent>
              ) : null}
              <TabsContent value="notes">
                <NotesPanel
                  caseId={caseId}
                  notes={notes.data ?? []}
                  isArabic={isArabic}
                  onSaved={() =>
                    queryClient.invalidateQueries({
                      queryKey: advisingKeys.notes(caseId),
                    })
                  }
                />
              </TabsContent>
              {user?.role === "admin" ? (
                <TabsContent value="audit">
                  <AuditPanel items={audit.data ?? []} isArabic={isArabic} />
                </TabsContent>
              ) : null}
            </Tabs>
          </>
        )}
      </main>
    </div>
  );
}
function Canvas({
  courseMap,
  recommendations,
  selectedCourseIds,
  locale,
  isArabic,
  disabled,
  onDecision,
  onToggleManual,
}: {
  courseMap?: AdvisingCourseMap;
  recommendations: CourseRecommendation[];
  selectedCourseIds: string[];
  locale: string;
  isArabic: boolean;
  disabled: boolean;
  onDecision: (
    id: string,
    decision: "ACCEPTED" | "REJECTED" | "PENDING",
  ) => void;
  onToggleManual: (courseId: string) => void;
}) {
  if (!courseMap) {
    return (
      <Empty
        text={
          isArabic
            ? "افتح حالة الإرشاد لعرض المسار"
            : "Open an advising case to load the academic course map"
        }
      />
    );
  }
  const recommendationByCode = new Map(
    recommendations.map((item) => [item.courseId.code.toUpperCase(), item]),
  );
  const completedCodes = courseMap.courses
    .filter((course) => course.progressStatus === "passed")
    .map((course) => course.code.toUpperCase());
  const completedSet = new Set(completedCodes);
  const selectableCourses = courseMap.courses.filter(
    (course) =>
      course.progressStatus !== "passed" &&
      course.progressStatus !== "low_grade" &&
      (course.offeredTerms?.length
        ? course.offeredTerms.includes(courseMap.student.semester)
        : course.semester === courseMap.student.semester) &&
      (course.prerequisites ?? []).every((code) =>
        completedSet.has(code.toUpperCase()),
      ),
  );
  const selectedSet = new Set(selectedCourseIds);
  const selectedCodes = courseMap.courses
    .filter((course) => selectedSet.has(course._id))
    .map((course) => course.code);
  const visibleSelectedCodes = [
    ...new Set([...courseMap.selectedCourses, ...selectedCodes]),
  ];
  return (
    <CourseMapFlow
      courses={courseMap.courses}
      locale={locale}
      selectedCodes={visibleSelectedCodes}
      suggestedCodes={courseMap.suggestedCourses}
      completedCodes={completedCodes}
      failedCodes={courseMap.courses
        .filter((course) => course.progressStatus === "failed")
        .map((course) => course.code)}
      selectableCodes={selectableCourses.map((course) => course.code)}
      readonly={disabled}
      studentName={courseMap.student.name}
      studentCode={courseMap.student.studentCode}
      gpa={courseMap.student.gpa}
      currentSemester={courseMap.student.semester}
      onToggleCourse={(code) => {
        const recommendation = recommendationByCode.get(code.toUpperCase());
        if (disabled) return;
        if (recommendation?.accepted) {
          onDecision(recommendation._id, "PENDING");
          return;
        }
        const course = courseMap.courses.find(
          (item) => item.code.toUpperCase() === code.toUpperCase(),
        );
        if (course) onToggleManual(course._id);
      }}
    />
  );
}
function RecommendationList({
  items,
  isArabic,
  canGenerate,
  disabled,
  isGenerating,
  onGenerate,
  onDecision,
}: {
  items: CourseRecommendation[];
  isArabic: boolean;
  canGenerate: boolean;
  disabled: boolean;
  isGenerating: boolean;
  onGenerate: () => void;
  onDecision: (
    id: string,
    decision: "ACCEPTED" | "REJECTED" | "PENDING",
  ) => void;
}) {
  const [filter, setFilter] = useState<
    "ALL" | "ELIGIBLE" | "ADDED" | "BLOCKED"
  >("ALL");
  const filteredItems = items.filter((item) =>
    filter === "ALL"
      ? true
      : filter === "ADDED"
        ? item.accepted
        : filter === "BLOCKED"
          ? !item.eligible
          : item.eligible && !item.accepted && !item.rejected,
  );
  if (!items.length) {
    return (
      <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-white/15 bg-card/30 text-center text-sm text-muted-foreground">
        <Sparkles className="h-6 w-6" />
        <span>
          {isArabic
            ? "أنشئ التوصيات لعرض المقررات المتاحة"
            : "Generate recommendations to show available courses"}
        </span>
        <Button
          type="button"
          disabled={!canGenerate || disabled || isGenerating}
          onClick={onGenerate}
        >
          {isGenerating ? (
            <Loader2 className="me-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="me-2 h-4 w-4" />
          )}
          {isArabic ? "إنشاء التوصيات" : "Generate recommendations"}
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-card/50 p-2">
        <span className="px-2 text-xs text-muted-foreground">
          {items.length} recommendations
        </span>
        <div className="w-48">
          <CustomDropdown
            value={filter}
            onValueChange={(value) =>
              setFilter(value as "ALL" | "ELIGIBLE" | "ADDED" | "BLOCKED")
            }
            ariaLabel="Filter recommendations"
            className="h-9 text-xs"
            options={[
              { value: "ALL", label: "All recommendations" },
              { value: "ELIGIBLE", label: "Eligible" },
              { value: "ADDED", label: "Added to plan" },
              { value: "BLOCKED", label: "Blocked" },
            ]}
          />
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        {filteredItems.map((item) => (
          <CourseCard
            key={item._id}
            item={item}
            isArabic={isArabic}
            disabled={disabled}
            onDecision={onDecision}
          />
        ))}
      </div>
      {!filteredItems.length ? (
        <Empty text="No recommendations match this filter" />
      ) : null}
    </div>
  );
}
function CourseCard({
  item,
  isArabic,
  disabled,
  onDecision,
}: {
  item: CourseRecommendation;
  isArabic: boolean;
  disabled: boolean;
  onDecision: (
    id: string,
    decision: "ACCEPTED" | "REJECTED" | "PENDING",
  ) => void;
}) {
  const statusText = item.accepted
    ? isArabic
      ? "مضاف"
      : "Added"
    : item.rejected
      ? isArabic
        ? "مرفوض"
        : "Rejected"
      : item.eligible
        ? isArabic
          ? "متاح"
          : "Eligible"
        : isArabic
          ? "غير متاح"
          : "Blocked";
  return (
    <article
      className={cn(
        "rounded-2xl border p-4",
        item.accepted
          ? "border-emerald-500/40 bg-emerald-500/10"
          : item.rejected
            ? "border-slate-500/30 bg-slate-500/10 opacity-75"
            : item.eligible
              ? "border-violet-500/40 bg-violet-500/10"
              : "border-red-500/30 bg-red-500/10",
      )}
    >
      <div className="flex justify-between">
        <div>
          <span className="font-mono text-sm font-bold text-sky-300">
            {item.courseId.code}
          </span>
          <h3 className="font-semibold">
            {isArabic ? item.courseId.nameAr : item.courseId.nameEn}
          </h3>
        </div>
        <span className="h-fit rounded-full bg-black/20 px-2 py-1 text-xs">
          {statusText} · {item.score}
        </span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{item.explanation}</p>
      {item.blockedReasons.map((reason) => (
        <p key={reason} className="mt-2 flex gap-1 text-xs text-red-300">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          {reason}
        </p>
      ))}
      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          disabled={disabled || !item.eligible}
          onClick={() =>
            onDecision(item._id, item.accepted ? "PENDING" : "ACCEPTED")
          }
        >
          {item.accepted ? (
            <X className="me-1 h-3 w-3" />
          ) : (
            <Check className="me-1 h-3 w-3" />
          )}
          {item.accepted
            ? isArabic
              ? "إزالة"
              : "Remove"
            : isArabic
              ? "إضافة"
              : "Add"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || item.rejected || item.accepted}
          onClick={() => onDecision(item._id, "REJECTED")}
        >
          <X className="me-1 h-3 w-3" />
          {isArabic ? "رفض" : "Reject"}
        </Button>
      </div>
    </article>
  );
}

function OverviewPanel({
  student,
  advisingCase,
  draft,
  isArabic,
}: {
  student: AdvisingStudent;
  advisingCase?: AdvisingCase;
  draft?: AdvisingPlan;
  isArabic: boolean;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <InfoCard
        icon={<ClipboardCheck className="h-5 w-5 text-sky-300" />}
        label={isArabic ? "حالة الإرشاد" : "Advising status"}
        value={advisingCase?.status ?? student.advisingStatus}
        meta={
          advisingCase
            ? `${advisingCase.academicYear} · ${advisingCase.semester}`
            : isArabic
              ? "لم يتم فتح حالة بعد"
              : "No case opened yet"
        }
      />
      <InfoCard
        icon={<GraduationCap className="h-5 w-5 text-emerald-300" />}
        label={isArabic ? "الطالب" : "Student"}
        value={student.name}
        meta={`${student.studentCode ?? ""} · GPA ${student.gpa.toFixed(2)}`}
      />
      <InfoCard
        icon={<FileText className="h-5 w-5 text-amber-300" />}
        label={isArabic ? "المسودة الحالية" : "Current draft"}
        value={draft ? `${draft.selectedCourses.length} courses` : "None"}
        meta={draft ? `${draft.totalCredits} credits · v${draft.version}` : ""}
      />
    </div>
  );
}

function HistoryPanel({
  advisingCase,
  isArabic,
}: {
  advisingCase?: AdvisingCase;
  isArabic: boolean;
}) {
  const timeline = advisingCase?.timeline ?? [];
  if (!timeline.length) {
    return (
      <Empty
        text={isArabic ? "لا يوجد سجل للحالة بعد" : "No case history yet"}
      />
    );
  }
  return (
    <div className="space-y-3">
      {timeline.map((item, index) => (
        <article
          key={`${item.status}-${item.changedAt}-${index}`}
          className="flex gap-3 rounded-2xl border border-white/10 bg-card/60 p-4"
        >
          <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-sky-300" />
          <div>
            <strong>{item.status}</strong>
            <p className="text-xs text-muted-foreground">
              {formatDate(item.changedAt)}
            </p>
          </div>
        </article>
      ))}
    </div>
  );
}

function NotesPanel({
  caseId,
  notes,
  isArabic,
  onSaved,
}: {
  caseId?: string;
  notes: AdvisingNote[];
  isArabic: boolean;
  onSaved: () => void;
}) {
  const [content, setContent] = useState("");
  const [visibility, setVisibility] = useState<"INTERNAL" | "STUDENT_VISIBLE">(
    "INTERNAL",
  );
  const create = useMutation({
    mutationFn: () =>
      advisingApi.createNote(caseId!, {
        content: content.trim(),
        visibility,
      }),
    onSuccess: () => {
      setContent("");
      onSaved();
      toast.success(isArabic ? "تم حفظ الملاحظة" : "Note saved");
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-white/10 bg-card/60 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <strong>{isArabic ? "إضافة ملاحظة" : "Add note"}</strong>
          <div className="flex rounded-xl border border-white/10 bg-secondary/30 p-1 text-xs">
            {(["INTERNAL", "STUDENT_VISIBLE"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setVisibility(option)}
                className={cn(
                  "rounded-lg px-3 py-1.5",
                  visibility === option
                    ? "bg-sky-500 text-white"
                    : "text-muted-foreground",
                )}
              >
                {option === "INTERNAL"
                  ? isArabic
                    ? "داخلي"
                    : "Internal"
                  : isArabic
                    ? "ظاهر للطالب"
                    : "Student visible"}
              </button>
            ))}
          </div>
        </div>
        <Textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder={isArabic ? "اكتب ملاحظة الإرشاد" : "Write advising note"}
        />
        <Button
          type="button"
          className="mt-3"
          disabled={!caseId || !content.trim() || create.isPending}
          onClick={() => create.mutate()}
        >
          <MessageSquarePlus className="me-2 h-4 w-4" />
          {isArabic ? "حفظ الملاحظة" : "Save note"}
        </Button>
      </div>
      {!notes.length ? (
        <Empty text={isArabic ? "لا توجد ملاحظات بعد" : "No notes yet"} />
      ) : (
        notes.map((note) => (
          <article
            key={note._id}
            className="rounded-2xl border border-white/10 bg-card/60 p-4"
          >
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="rounded-full bg-sky-500/10 px-2 py-1 text-[10px] font-bold text-sky-300">
                {note.visibility}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatDate(note.createdAt)}
              </span>
            </div>
            <p className="whitespace-pre-wrap text-sm">{note.content}</p>
          </article>
        ))
      )}
    </div>
  );
}

function AuditPanel({
  items,
  isArabic,
}: {
  items: AdvisingAuditLog[];
  isArabic: boolean;
}) {
  if (!items.length) {
    return (
      <Empty text={isArabic ? "لا توجد عمليات بعد" : "No audit records yet"} />
    );
  }
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <article
          key={item._id}
          className="rounded-2xl border border-white/10 bg-card/60 p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong>{item.action}</strong>
            <span className="text-xs text-muted-foreground">
              {formatDate(item.createdAt)}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {item.entityType} · {item.entityId}
          </p>
        </article>
      ))}
    </div>
  );
}

function InfoCard({
  icon,
  label,
  value,
  meta,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  meta?: string;
}) {
  return (
    <article className="rounded-2xl border border-white/10 bg-card/60 p-4">
      <div className="mb-3">{icon}</div>
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <strong className="mt-1 block">{value}</strong>
      {meta ? (
        <p className="mt-1 text-xs text-muted-foreground">{meta}</p>
      ) : null}
    </article>
  );
}

function formatDate(value?: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center rounded-3xl border border-dashed border-white/15 bg-card/30 text-center text-sm text-muted-foreground">
      <AlertTriangle className="mb-2 h-6 w-6" />
      {text}
    </div>
  );
}

function RegistrationSummary({
  registrations,
  isArabic,
}: {
  registrations: AdminRegistration[];
  isArabic: boolean;
}) {
  const print = async (registrationId: string) => {
    try {
      const form = await apiGet<PrintableRegistrationForm>(
        `/registrations/${registrationId}/print`,
      );
      if (!openRegistrationPrintView(form)) {
        toast.error(
          isArabic
            ? "يرجى السماح بالنوافذ المنبثقة لفتح الاستمارة"
            : "Allow pop-ups to open the registration sheet",
        );
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  if (!registrations.length) {
    return (
      <Empty
        text={
          isArabic
            ? "لا توجد تسجيلات نهائية لهذا الطالب"
            : "No final registrations for this student"
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      {registrations.map((registration) => (
        <article
          key={registration._id}
          className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-card/60 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <strong>
                {registration.academicYear} · {registration.semester}
              </strong>
              <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-300">
                {registration.status}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {registration.courses.join(", ")} ·{" "}
              {registration.totalCreditHours} {isArabic ? "ساعة" : "credits"} ·{" "}
              {registration.source}
            </p>
          </div>
          <Button variant="outline" onClick={() => print(registration._id)}>
            <Printer className="me-2 h-4 w-4" />
            {isArabic ? "طباعة / حفظ PDF" : "Print / save PDF"}
          </Button>
        </article>
      ))}
    </div>
  );
}
