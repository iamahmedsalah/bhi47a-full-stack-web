"use client";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  AlertTriangle,
  Archive,
  BookOpen,
  CalendarClock,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileText,
  FolderOpen,
  GitBranch,
  GraduationCap,
  Layers,
  LayoutGrid,
  Loader2,
  LockKeyhole,
  MessageSquarePlus,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Printer,
  Search,
  ShieldAlert,
  Sparkles,
  Settings2,
  Trash2,
  UnlockKeyhole,
  UserPlus,
  Users,
  Workflow,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { CustomDropdown } from "@/components/ui/custom-dropdown";
import { CourseMapFlow } from "@/components/registration/course-map-flow";
import { cn } from "@/lib/cn";
import { getApiErrorMessage } from "@/lib/api";
import { useAuth } from "@/providers/auth-provider";
import { apiGet } from "@/lib/api-client";
import { RestrictedFeature } from "@/components/admin/restricted-feature";
import { PERMISSIONS } from "@student-portal/shared";
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
import {
  advisingStatusLabel,
  auditActionLabel,
  entityTypeLabel,
  noteVisibilityLabel,
  recommendationBlockedReasons,
  recommendationExplanation,
  registrationSourceLabel,
  semesterLabel,
  type AdvisingLocale,
} from "../advising-i18n";

export function AdvisingWorkspace() {
  const locale = useLocale() as AdvisingLocale;
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
  const [isAssignAdvisorModalOpen, setIsAssignAdvisorModalOpen] = useState(false);
  const [assignTargetStudent, setAssignTargetStudent] = useState<AdvisingStudent | undefined>();
  const [advisorSearchTerm, setAdvisorSearchTerm] = useState("");
  const [modalStudentSearch, setModalStudentSearch] = useState("");
  const [modalStudentLevelFilter, setModalStudentLevelFilter] = useState("all");
  const [manualSelections, setManualSelections] = useState<
    Record<string, string[]>
  >({});
  const [isPeriodSettingsOpen, setIsPeriodSettingsOpen] = useState(false);
  const [isStudentSidebarOpen, setIsStudentSidebarOpen] = useState(true);
  useEffect(() => {
    const requestedStudent = new URLSearchParams(window.location.search).get(
      "student",
    );
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
      toast.success(
        isArabic ? "تمت إضافة السنة الأكاديمية" : "Academic year added",
      );
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });
  const setCurrentYear = useMutation({
    mutationFn: advisingApi.setCurrentAcademicYear,
    onSuccess: () => {
      refreshAcademicManagement();
      toast.success(
        isArabic ? "تم تعيين السنة الحالية" : "Current academic year updated",
      );
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });
  const deleteYear = useMutation({
    mutationFn: advisingApi.deleteAcademicYear,
    onSuccess: () => {
      setManagedYear("");
      refreshAcademicManagement();
      toast.success(
        isArabic ? "تم حذف السنة الأكاديمية" : "Academic year removed",
      );
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });
  const assignStudents = useMutation({
    mutationFn: () => {
      const ids =
        selectedStudentIds.length > 0
          ? selectedStudentIds
          : assignTargetStudent
            ? [assignTargetStudent.id]
            : active
              ? [active.id]
              : [];
      if (ids.length === 0) {
        throw new Error(
          isArabic
            ? "يرجى تحديد طالب واحد على الأقل"
            : "Select at least one student",
        );
      }
      if (!selectedAdvisorId) {
        throw new Error(
          isArabic
            ? "يرجى اختيار المرشد الأكاديمي"
            : "Select an academic advisor",
        );
      }
      return advisingApi.assignStudents({
        advisorId: selectedAdvisorId,
        studentIds: ids,
        academicYear,
        semester: advisingSemester,
      });
    },
    onSuccess: (result) => {
      setSelectedStudentIds([]);
      setAssignTargetStudent(undefined);
      setIsAssignAdvisorModalOpen(false);
      queryClient.invalidateQueries({ queryKey: advisingKeys.advisors });
      queryClient.invalidateQueries({
        queryKey: advisingKeys.students(
          search,
          statusFilter,
          levelFilter,
          academicYear,
          advisingSemester,
        ),
      });
      toast.success(
        isArabic
          ? `تم تعيين ${result.assignedCount} طالب للمرشد بنجاح`
          : `${result.assignedCount} students assigned to advisor successfully`,
      );
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const allModalStudents = useMemo(
    () => students.data?.items ?? [],
    [students.data?.items],
  );

  const modalFilteredStudents = useMemo(() => {
    return allModalStudents.filter((student) => {
      if (modalStudentLevelFilter !== "all") {
        if (modalStudentLevelFilter === "unassigned") {
          if (student.assignedAdvisorId) return false;
        } else if (String(student.academicLevel) !== modalStudentLevelFilter) {
          return false;
        }
      }
      if (!modalStudentSearch.trim()) return true;
      const q = modalStudentSearch.toLowerCase().trim();
      return (
        (student.name?.toLowerCase().includes(q) ?? false) ||
        (student.studentCode?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [allModalStudents, modalStudentLevelFilter, modalStudentSearch]);
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
        queryKey: advisingKeys.students(
          search,
          statusFilter,
          levelFilter,
          academicYear,
          advisingSemester,
        ),
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
      queryClient.invalidateQueries({
        queryKey: advisingKeys.recommendations(caseId),
      });
      queryClient.invalidateQueries({
        queryKey: advisingKeys.courseMap(caseId),
      });
      queryClient.invalidateQueries({ queryKey: advisingKeys.case(caseId) });
      queryClient.invalidateQueries({ queryKey: advisingKeys.audit(caseId) });
      queryClient.invalidateQueries({
        queryKey: advisingKeys.students(
          search,
          statusFilter,
          levelFilter,
          academicYear,
          advisingSemester,
        ),
      });
      setSelected((current) =>
        current ? { ...current, advisingStatus: "AUTO_RECOMMENDED" } : current,
      );
      toast.success(
        isArabic
          ? `تم إنشاء ${generated.recommendedCount} مقررات موصى بها، مع أولوية المقررات الراسبة`
          : `${generated.recommendedCount} recommended courses generated, with failed courses first`,
      );
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });
  const openCase = useMutation({
    mutationFn: () =>
      advisingApi.createCase(active!.id, academicYear, advisingSemester),
    onSuccess: async (createdCase) => {
      await queryClient.invalidateQueries({
        queryKey: advisingKeys.students(
          search,
          statusFilter,
          levelFilter,
          academicYear,
          advisingSemester,
        ),
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
        queryKey: advisingKeys.students(
          search,
          statusFilter,
          levelFilter,
          academicYear,
          advisingSemester,
        ),
      });
      setSelected((current) =>
        current ? { ...current, advisingStatus: updatedCase.status } : current,
      );
      toast.success(
        updatedCase.status === "CLOSED"
          ? isArabic
            ? "تم إغلاق حالة الإرشاد"
            : "Advising case closed"
          : isArabic
            ? "تمت إعادة فتح حالة الإرشاد"
            : "Advising case reopened",
      );
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });
  const acceptedIds = useMemo(
    () =>
      (recommendations.data ?? [])
        .filter(
          (item) =>
            item.accepted &&
            item.eligible &&
            !item.rejected &&
            Boolean(item.courseId?._id),
        )
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

  if (
    (user?.role === "staff" && !user?.permissions?.includes(PERMISSIONS.ADVISING_READ)) ||
    (students.isError && ((students.error as any)?.response?.status === 403 || (students.error as any)?.status === 403))
  ) {
    return (
      <RestrictedFeature
        permission={PERMISSIONS.ADVISING_READ}
        featureName={isArabic ? "الإرشاد والتسجيل الأكاديمي" : "Academic Advising & Course Registration"}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Top Academic Context & Action Bar */}
      <div className="rounded-squircle border border-white/10 bg-card/85 p-4 shadow-sm backdrop-blur space-y-3">
        {/* Title & Description */}
        <div>
          <div className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-sky-400" />
            <h1 className="text-lg font-bold tracking-tight">
              {isArabic ? "الإرشاد والتسجيل الأكاديمي" : "Academic Advising"}
            </h1>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isArabic
              ? "إدارة الخطط الدراسية، التوصيات الآلية، واعتماد تسجيل المقررات"
              : "Manage student advising cases, automated recommendations, and registrations"}
          </p>
        </div>

        {/* Row 2: Current Period in LEFT and 3 Action Buttons in RIGHT */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-0.5">
          {/* Academic Period Quick Switcher Bar (LEFT) */}
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-secondary/30 p-1.5">
              <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-sky-300">
                <CalendarClock className="h-3.5 w-3.5" />
                <span>{academicYear}</span>
                {selectedYearSummary?.isCurrent ? (
                  <span className="ms-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 text-[10px] text-emerald-300">
                    {isArabic ? "الحالي" : "Current"}
                  </span>
                ) : null}
              </div>

              {/* Semester Switcher Pills */}
              <div className="flex items-center gap-1 rounded-xl bg-background/50 p-0.5">
                {(["first", "second", "summer"] as const).map((sem) => {
                  const isSelected = advisingSemester === sem;
                  const term = terms.data?.find(
                    (item) =>
                      item.academicYear === academicYear &&
                      item.semester === sem,
                  );
                  const isOpen = term?.isOpen ?? false;
                  return (
                    <button
                      key={sem}
                      type="button"
                      onClick={() => {
                        setAdvisingSemester(sem);
                        setSelected(undefined);
                      }}
                      className={cn(
                        "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all",
                        isSelected
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                      )}
                    >
                      <span>
                        {sem === "first"
                          ? isArabic
                            ? "الفصل الأول"
                            : "1st"
                          : sem === "second"
                            ? isArabic
                              ? "الفصل الثاني"
                              : "2nd"
                            : isArabic
                              ? "صيفي"
                              : "Summer"}
                      </span>
                      <span
                        className={cn(
                          "h-2 w-2 rounded-full",
                          isOpen
                            ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]"
                            : "bg-red-400/60",
                        )}
                        title={
                          isOpen
                            ? isArabic
                              ? "التسجيل مفتوح"
                              : "Registration Open"
                            : isArabic
                              ? "التسجيل مغلق"
                              : "Registration Closed"
                        }
                      />
                    </button>
                  );
                })}
              </div>

              {/* Quick Registration Status Toggle for Admin */}
              {user?.role === "admin" && (
                <button
                  type="button"
                  disabled={saveTerm.isPending}
                  onClick={() => {
                    const currentTerm = terms.data?.find(
                      (item) =>
                        item.academicYear === academicYear &&
                        item.semester === advisingSemester,
                    );
                    const open = currentTerm?.isOpen ?? false;
                    saveTerm.mutate({
                      semester: advisingSemester,
                      isOpen: !open,
                    });
                  }}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-medium transition",
                    terms.data?.find(
                      (item) =>
                        item.academicYear === academicYear &&
                        item.semester === advisingSemester,
                    )?.isOpen
                      ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
                      : "border-red-500/30 bg-red-500/15 text-red-300 hover:bg-red-500/25",
                  )}
                  title={
                    isArabic
                      ? "تبديل حالة فتح/إغلاق التسجيل للفصل المحدد"
                      : "Toggle Registration Status"
                  }
                >
                  {terms.data?.find(
                    (item) =>
                      item.academicYear === academicYear &&
                      item.semester === advisingSemester,
                  )?.isOpen ? (
                    <>
                      <UnlockKeyhole className="h-3.5 w-3.5" />
                      <span>
                        {isArabic ? "التسجيل مفتوح" : "Registration Open"}
                      </span>
                    </>
                  ) : (
                    <>
                      <LockKeyhole className="h-3.5 w-3.5" />
                      <span>
                        {isArabic ? "التسجيل مغلق" : "Registration Closed"}
                      </span>
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Header 3 Action Buttons: Toggle Full Canvas, Assign Advisor & Settings */}
            <div className="flex items-center gap-2">
            {/* Toggle Student Sidebar Button */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsStudentSidebarOpen((prev) => !prev)}
              className={cn(
                "gap-2 rounded-squircle text-xs font-semibold transition-all cursor-pointer",
                isStudentSidebarOpen
                  ? "border-white/10 bg-secondary/20 hover:bg-secondary/40 text-muted-foreground hover:text-foreground"
                  : "border-sky-500/40 bg-sky-500/15 text-sky-200 hover:bg-sky-500/25 shadow-sm"
              )}
              title={
                isStudentSidebarOpen
                  ? isArabic
                    ? "إخفاء قائمة الطلاب لتوسيع لوحة التسجيل (شاشة كاملة)"
                    : "Collapse student sidebar for full canvas"
                  : isArabic
                    ? "إظهار قائمة الطلاب"
                    : "Show student list"
              }
            >
              {isStudentSidebarOpen ? (
                <>
                  <PanelLeftClose className="h-4 w-4 rtl:rotate-180" />
                  <span className="hidden sm:inline">
                    {isArabic ? "لوحة كاملة" : "Full Canvas"}
                  </span>
                </>
              ) : (
                <>
                  <PanelLeftOpen className="h-4 w-4 rtl:rotate-180" />
                  <span>{isArabic ? "عرض الطلاب" : "Show Students"}</span>
                  <span className="rounded-full bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-bold text-sky-200">
                    {students.data?.items.length ?? 0}
                  </span>
                </>
              )}
            </Button>

            {user?.role === "admin" && (
              <Button
                size="sm"
                onClick={() => {
                  if (active) {
                    setAssignTargetStudent(active);
                    setSelectedStudentIds([active.id]);
                  } else {
                    setAssignTargetStudent(undefined);
                    setSelectedStudentIds([]);
                  }
                  setIsAssignAdvisorModalOpen(true);
                }}
                className="gap-2 rounded-squircle border border-sky-500/30 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 text-xs font-semibold shadow-sm transition-all cursor-pointer"
                title={isArabic ? "تعيين المرشد الأكاديمي للطلاب" : "Assign Academic Advisor"}
              >
                <UserPlus className="h-4 w-4 text-sky-400" />
                <span>
                  {isArabic ? "تعيين المرشد الأكاديمي" : "Assign Academic Advisor"}
                </span>
              </Button>
            )}

            {/* Settings Trigger for Academic Period Management */}
            {user?.role === "admin" && (
              <Dialog
                open={isPeriodSettingsOpen}
                onOpenChange={setIsPeriodSettingsOpen}
              >
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="gap-2 rounded-squircle border-white/10 bg-secondary/20 hover:bg-secondary/40 text-xs"
                  >
                  <Settings2 className="h-4 w-4 text-sky-400" />
                  <span>
                    {isArabic
                      ? "إعدادات الفترات والسنوات"
                      : "Period & Term Settings"}
                  </span>
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md rounded-2xl bg-card border border-white/15 p-6">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-base font-bold">
                    <CalendarClock className="h-5 w-5 text-sky-400" />
                    <span>
                      {isArabic
                        ? "إدارة السنوات الأكاديمية والتسجيل"
                        : "Academic Periods & Registration"}
                    </span>
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground">
                    {isArabic
                      ? "التحكم في فترات التسجيل، تحديد السنة الحالية، وإضافة سنوات دراسية جديدة."
                      : "Manage registration terms, select current academic year, and add new periods."}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 pt-2">
                  {/* Select Active Academic Year */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-foreground">
                      {isArabic ? "السنة الأكاديمية" : "Academic Year"}
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <CustomDropdown
                          ariaLabel={
                            isArabic
                              ? "السنة الأكاديمية للإرشاد"
                              : "Advising academic year"
                          }
                          value={academicYear}
                          onValueChange={(value) => {
                            setManagedYear(value);
                            setSelected(undefined);
                          }}
                          className="h-9 text-xs"
                          options={(academicYears.data ?? []).map((year) => ({
                            value: year.academicYear,
                            label: `${year.academicYear}${year.isCurrent ? (isArabic ? " (الحالي)" : " (Current)") : ""}`,
                          }))}
                        />
                      </div>
                      {!selectedYearSummary?.isCurrent ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-9 px-2.5 text-xs text-sky-300"
                          disabled={setCurrentYear.isPending}
                          onClick={() => setCurrentYear.mutate(academicYear)}
                        >
                          {isArabic ? "تعيين كحالية" : "Make current"}
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-9 px-2 text-xs text-red-400 hover:text-red-300"
                        disabled={
                          deleteYear.isPending || selectedYearSummary?.isCurrent
                        }
                        onClick={() => deleteYear.mutate(academicYear)}
                        title={
                          isArabic
                            ? "حذف السنة الأكاديمية"
                            : "Delete academic year"
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Summary counts */}
                  <div className="rounded-xl border border-white/10 bg-secondary/20 px-3 py-2 text-xs text-muted-foreground flex justify-between">
                    <span>
                      {selectedYearSummary?.registrationCount ?? 0}{" "}
                      {isArabic ? "تسجيل معتمد" : "registrations"}
                    </span>
                    <span>
                      {selectedYearSummary?.advisingCaseCount ?? 0}{" "}
                      {isArabic ? "حالة إرشاد" : "advising cases"}
                    </span>
                  </div>

                  {/* Term Registration Controls per Semester */}
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-foreground">
                      {isArabic
                        ? "حالة التسجيل لكل فصل دراسي"
                        : "Semester Registration Status"}
                    </label>
                    <div className="space-y-1.5">
                      {(["first", "second", "summer"] as const).map((sem) => {
                        const currentTerm = terms.data?.find(
                          (item) =>
                            item.academicYear === academicYear &&
                            item.semester === sem,
                        );
                        const open = currentTerm?.isOpen ?? false;
                        const label =
                          sem === "first"
                            ? isArabic
                              ? "الفصل الدراسي الأول"
                              : "1st Semester"
                            : sem === "second"
                              ? isArabic
                                ? "الفصل الدراسي الثاني"
                                : "2nd Semester"
                              : isArabic
                                ? "الفصل الصيفي"
                                : "Summer Semester";
                        return (
                          <div
                            key={sem}
                            className="flex items-center justify-between rounded-xl border border-white/5 bg-secondary/15 px-3 py-2 text-xs"
                          >
                            <span>{label}</span>
                            <button
                              type="button"
                              disabled={saveTerm.isPending}
                              onClick={() =>
                                saveTerm.mutate({
                                  semester: sem,
                                  isOpen: !open,
                                })
                              }
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition",
                                open
                                  ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
                                  : "border-red-500/30 bg-red-500/15 text-red-300 hover:bg-red-500/25",
                              )}
                            >
                              {open ? (
                                <>
                                  <UnlockKeyhole className="h-3 w-3" />
                                  <span>
                                    {isArabic ? "مفتوح (تبديل)" : "Open"}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <LockKeyhole className="h-3 w-3" />
                                  <span>
                                    {isArabic ? "مغلق (تبديل)" : "Closed"}
                                  </span>
                                </>
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Add New Academic Year */}
                  <div className="space-y-1.5 border-t border-white/10 pt-3">
                    <label className="block text-xs font-semibold text-foreground">
                      {isArabic
                        ? "إضافة سنة أكاديمية جديدة"
                        : "Add New Academic Year"}
                    </label>
                    <div className="flex gap-2">
                      <Input
                        value={newAcademicYear}
                        onChange={(e) => setNewAcademicYear(e.target.value)}
                        placeholder="2027-2028"
                        className="h-8 text-xs font-mono"
                      />
                      <Button
                        size="sm"
                        className="h-8 px-3 text-xs"
                        disabled={
                          createYear.isPending ||
                          !/^\d{4}-\d{4}$/.test(newAcademicYear)
                        }
                        onClick={() => createYear.mutate()}
                      >
                        {createYear.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Plus className="h-3.5 w-3.5 me-1" />
                        )}
                        {isArabic ? "إضافة" : "Add"}
                      </Button>
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}
          </div>
        </div>
      </div>

      {/* Main Workspace Layout */}
      <div
        className={cn(
          "grid min-h-[76vh] gap-4 transition-all duration-300",
          isStudentSidebarOpen
            ? "xl:grid-cols-[330px_minmax(0,1fr)]"
            : "grid-cols-1",
        )}
      >
        {isStudentSidebarOpen && (
          <aside className="flex flex-col rounded-2xl border border-white/10 bg-card/80 p-4 transition-all">
            {/* Sidebar Header with Student Count */}
            <div className="mb-3 flex items-center justify-between border-b border-white/5 pb-3">
              <div>
                <h2 className="text-base font-bold">
                  {isArabic ? "دليل الطلاب" : "Students"}
                </h2>
                <p className="text-[11px] text-muted-foreground">
                  {students.data?.items.length ?? 0}{" "}
                  {isArabic ? "طالب" : "students"}
                </p>
              </div>
            </div>

          {/* Search Box */}
          <div className="relative mb-2.5">
            <Search className="absolute inset-s-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="ps-9 h-9 text-xs"
              placeholder={
                isArabic ? "بحث بالاسم أو الكود..." : "Search name or code..."
              }
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute inset-e-2.5 top-2.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Filters Row */}
          <div className="mb-3 grid grid-cols-2 gap-2">
            <CustomDropdown
              ariaLabel={
                isArabic ? "تصفية حسب حالة الإرشاد" : "Filter by advising status"
              }
              value={statusFilter}
              onValueChange={setStatusFilter}
              className="h-8 text-xs"
              options={[
                { value: "", label: isArabic ? "كل الحالات" : "All statuses" },
                {
                  value: "NOT_STARTED",
                  label: advisingStatusLabel("NOT_STARTED", locale),
                },
                {
                  value: "AUTO_RECOMMENDED",
                  label: advisingStatusLabel("AUTO_RECOMMENDED", locale),
                },
                { value: "DRAFT", label: advisingStatusLabel("DRAFT", locale) },
                {
                  value: "APPROVED",
                  label: advisingStatusLabel("APPROVED", locale),
                },
                { value: "CLOSED", label: advisingStatusLabel("CLOSED", locale) },
              ]}
            />
            <CustomDropdown
              ariaLabel={
                isArabic
                  ? "تصفية حسب المستوى الأكاديمي"
                  : "Filter by academic level"
              }
              value={levelFilter}
              onValueChange={setLevelFilter}
              className="h-8 text-xs"
              options={[
                { value: "", label: isArabic ? "كل المستويات" : "All levels" },
                ...["1", "2", "3", "4"].map((level) => ({
                  value: level,
                  label: isArabic ? `المستوى ${level}` : `Level ${level}`,
                })),
              ]}
            />
          </div>

          {/* Student Cards List */}
          <div className="custom-scroll flex-1 max-h-[calc(100vh-270px)] space-y-2 overflow-auto pe-1">
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
                  if (event.key === "Enter" || event.key === " ")
                    setSelected(student);
                }}
                className={cn(
                  "w-full rounded-2xl border p-3 text-start transition",
                  active?.id === student.id
                    ? "border-sky-400 bg-sky-500/10"
                    : "border-white/10 bg-secondary/20 hover:bg-secondary/40",
                )}
              >
                <div className="flex justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div
                      role="img"
                      aria-label={student.name}
                      style={
                        student.avatarUrl
                          ? { backgroundImage: `url(${student.avatarUrl})` }
                          : undefined
                      }
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-sky-500/15 bg-cover bg-center text-xs font-bold text-sky-200"
                    >
                      {!student.avatarUrl
                        ? student.name.trim().charAt(0)
                        : null}
                    </div>
                    <strong className="text-sm truncate">
                      <bdi>{student.name}</bdi>
                    </strong>
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
                      (advisor) =>
                        advisor._id === String(student.assignedAdvisorId),
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
    )}
      <main className="min-w-0 space-y-4">
        {!active ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-card/60 p-12 text-center">
            {!isStudentSidebarOpen && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsStudentSidebarOpen(true)}
                className="mb-4 gap-2 rounded-squircle border-sky-500/30 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 cursor-pointer"
              >
                <PanelLeftOpen className="h-4 w-4 rtl:rotate-180" />
                <span>
                  {isArabic
                    ? "عرض قائمة الطلاب لاختيار طالب"
                    : "Open student list to select a student"}
                </span>
              </Button>
            )}
            <Empty
              text={
                isArabic
                  ? "اختر طالباً من القائمة لفتح لوحة الإرشاد والتسجيل"
                  : "Select a student to open the advising and registration canvas"
              }
            />
          </div>
        ) : (
          <>
            <header className="sticky top-2 z-20 rounded-2xl border border-white/10 bg-card/95 p-4 backdrop-blur">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    role="img"
                    aria-label={active.name}
                    style={
                      active.avatarUrl
                        ? { backgroundImage: `url(${active.avatarUrl})` }
                        : undefined
                    }
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/10 bg-sky-500/15 bg-cover bg-center font-bold text-sky-200"
                  >
                    {!active.avatarUrl ? active.name.trim().charAt(0) : null}
                  </div>
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">
                      {active.studentCode}
                    </p>
                    <h2 className="text-xl font-bold">{active.name}</h2>
                    <p className="text-sm text-muted-foreground">
                      {active.department ?? "—"} ·{" "}
                      {semesterLabel(active.semester, locale)} ·{" "}
                      {advisingStatusLabel(
                        caseDetails.data?.status ?? active.advisingStatus,
                        locale,
                      )}
                    </p>
                  </div>
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
                    disabled={
                      !caseId ||
                      isCaseClosed ||
                      hasFinalRegistration ||
                      run.isPending
                    }
                    onClick={() => {
                      const readiness = courseMap.data?.generationReadiness;
                      if (readiness && !readiness.canGenerate) {
                        toast.warning(
                          readiness.reason ===
                            "FIRST_SEMESTER_REGISTRATION_REQUIRED"
                            ? isArabic
                              ? "لا يمكن إنشاء توصيات الفصل الثاني قبل تسجيل الطالب في الفصل الأول."
                              : "Second-semester recommendations require a first-semester registration."
                            : isArabic
                              ? `أضف درجات الفصل الأول النهائية أولًا: ${readiness.missingCourseCodes.join(", ")}`
                              : `Publish the missing first-semester final grades first: ${readiness.missingCourseCodes.join(", ")}`,
                        );
                        return;
                      }
                      run.mutate();
                    }}
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
                    disabled={
                      !draft ||
                      isCaseClosed ||
                      hasFinalRegistration ||
                      approve.isPending
                    }
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
                      {isCaseClosed
                        ? isArabic
                          ? "إعادة فتح الحالة"
                          : "Reopen case"
                        : isArabic
                          ? "إغلاق الحالة"
                          : "Close case"}
                    </Button>
                  ) : null}
                </div>
              </div>
            </header>
            {courseMap.data?.generationReadiness &&
            !courseMap.data.generationReadiness.canGenerate ? (
              <div className="flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <strong>
                    {isArabic
                      ? "بيانات الفصل الأول غير مكتملة"
                      : "First-semester data is incomplete"}
                  </strong>
                  <p className="mt-1 text-xs">
                    {courseMap.data.generationReadiness.reason ===
                    "FIRST_SEMESTER_REGISTRATION_REQUIRED"
                      ? isArabic
                        ? "سجّل الطالب في الفصل الأول قبل إنشاء توصيات الفصل الثاني."
                        : "Register the student for the first semester before generating second-semester recommendations."
                      : isArabic
                        ? `انشر الدرجات النهائية وحدّث ملف الطالب للمقررات: ${courseMap.data.generationReadiness.missingCourseCodes.join(", ")}`
                        : `Publish final grades and update the student profile for: ${courseMap.data.generationReadiness.missingCourseCodes.join(", ")}`}
                  </p>
                </div>
              </div>
            ) : null}
            {hasFinalRegistration ? (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
                <strong>
                  {isArabic
                    ? `يوجد تسجيل نهائي للفترة ${caseDetails.data?.academicYear ?? academicYear} - ${semesterLabel(advisingSemester, locale)}`
                    : `${caseDetails.data?.academicYear ?? academicYear} ${semesterLabel(advisingSemester, locale)} already has a final registration`}
                </strong>
                <p className="mt-1 text-xs">
                  {courseMap.data?.registration?.courses.join(", ")} ·{" "}
                  {isArabic
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
                  activeStudent={active}
                  onDecision={(id, decision) => decide.mutate({ id, decision })}
                  onToggleManual={(courseId) =>
                    updateManualSelectedIds((current) =>
                      current.includes(courseId)
                        ? current.filter((id) => id !== courseId)
                        : [...current, courseId],
                    )
                  }
                  onStartCase={() => openCase.mutate()}
                  isStartingCase={openCase.isPending}
                  onSaveDraft={() => createDraft.mutate()}
                  isSavingDraft={createDraft.isPending}
                  onApprove={() => approve.mutate()}
                  isApproving={approve.isPending}
                  hasDraft={Boolean(draft)}
                  selectedCredits={selectedCredits}
                  advisingSemester={advisingSemester}
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

    {/* Assign Advisor Modal Dialog - Wide 2-Column UX with Student & Advisor Selectors */}
    {user?.role === "admin" && (
      <Dialog
        open={isAssignAdvisorModalOpen}
        onOpenChange={(open) => {
          setIsAssignAdvisorModalOpen(open);
          if (!open) {
            setAssignTargetStudent(undefined);
            setAdvisorSearchTerm("");
            setModalStudentSearch("");
          }
        }}
      >
        <DialogContent
          className="max-w-5xl max-h-[90vh] flex flex-col p-0 overflow-hidden rounded-2xl bg-card/95 border border-white/15 backdrop-blur-2xl shadow-2xl"
          dir={isArabic ? "rtl" : "ltr"}
        >
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-secondary/20 p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-sky-500/30 bg-gradient-to-br from-teal-500/20 to-sky-500/20 text-sky-400 shadow-sm">
                <UserPlus className="h-6 w-6" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-foreground">
                  {isArabic ? "تعيين المرشد الأكاديمي" : "Assign Academic Advisor"}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  {isArabic
                    ? "حدد الطلاب المطلوب إسنادهم ثم اختر المرشد الأكاديمي المناسب"
                    : "Select target students and choose the academic advisor to assign them to"}
                </DialogDescription>
              </div>
            </div>

            {/* Target Period Context Badge */}
            <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-background/50 px-3 py-1.5 text-xs font-semibold text-sky-300">
              <CalendarClock className="h-3.5 w-3.5" />
              <span>{academicYear}</span>
              <span>·</span>
              <span>{semesterLabel(advisingSemester, locale)}</span>
            </div>
          </div>

          {/* Body: Split View 2 Columns */}
          <div className="grid flex-1 grid-cols-1 md:grid-cols-12 overflow-hidden min-h-0">
            {/* Column 1: Target Students (col-span-12 md:col-span-6 lg:col-span-5) */}
            <div className="col-span-12 md:col-span-6 lg:col-span-5 border-b md:border-b-0 md:border-e border-white/10 p-5 flex flex-col bg-secondary/5 min-h-[340px] md:min-h-0 overflow-hidden">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
                    {isArabic ? "الطلاب المطلوب إسنادهم" : "Target Students"}
                  </h3>
                  <span className="rounded-full bg-sky-500/15 border border-sky-500/30 px-2 py-0.5 font-mono text-[11px] font-bold text-sky-300">
                    {selectedStudentIds.length} / {modalFilteredStudents.length}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const filteredIds = modalFilteredStudents.map((s) => s.id);
                    const allSelected =
                      filteredIds.length > 0 &&
                      filteredIds.every((id) => selectedStudentIds.includes(id));
                    if (allSelected) {
                      setSelectedStudentIds((prev) =>
                        prev.filter((id) => !filteredIds.includes(id)),
                      );
                    } else {
                      setSelectedStudentIds((prev) => [
                        ...new Set([...prev, ...filteredIds]),
                      ]);
                    }
                  }}
                  className="text-[11px] text-sky-400 hover:text-sky-300 font-medium cursor-pointer"
                >
                  {modalFilteredStudents.length > 0 &&
                  modalFilteredStudents.every((s) =>
                    selectedStudentIds.includes(s.id),
                  )
                    ? isArabic
                      ? "إلغاء تحديد المعروض"
                      : "Deselect visible"
                    : isArabic
                      ? "تحديد كل المعروض"
                      : "Select visible"}
                </button>
              </div>

              {/* Student Search & Filters within modal */}
              <div className="space-y-2 mb-3">
                <div className="relative">
                  <Search className="absolute inset-s-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={modalStudentSearch}
                    onChange={(e) => setModalStudentSearch(e.target.value)}
                    className="ps-8 h-8 text-xs rounded-squircle bg-background/50 border-white/10"
                    placeholder={
                      isArabic ? "بحث بالاسم أو الكود..." : "Search student..."
                    }
                  />
                  {modalStudentSearch && (
                    <button
                      type="button"
                      onClick={() => setModalStudentSearch("")}
                      className="absolute inset-e-2 top-2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Level / Filter Pills */}
                <div className="flex flex-wrap items-center gap-1">
                  {[
                    { id: "all", label: isArabic ? "الكل" : "All" },
                    { id: "unassigned", label: isArabic ? "بدون مرشد" : "No Advisor" },
                    { id: "1", label: isArabic ? "م 1" : "L1" },
                    { id: "2", label: isArabic ? "م 2" : "L2" },
                    { id: "3", label: isArabic ? "م 3" : "L3" },
                    { id: "4", label: isArabic ? "م 4" : "L4" },
                  ].map((filter) => {
                    const active = modalStudentLevelFilter === filter.id;
                    return (
                      <button
                        key={filter.id}
                        type="button"
                        onClick={() => setModalStudentLevelFilter(filter.id)}
                        className={cn(
                          "rounded-squircle px-2 py-0.5 text-[10px] font-medium border transition cursor-pointer",
                          active
                            ? "border-sky-400 bg-sky-500/20 text-sky-200"
                            : "border-white/10 bg-secondary/20 text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {filter.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Students Scrollable List */}
              <div className="custom-scroll flex-1 overflow-y-auto space-y-1.5 pe-1 max-h-[300px] md:max-h-[360px]">
                {modalFilteredStudents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-44 text-center p-4 rounded-xl border border-dashed border-white/10 bg-secondary/10">
                    <Users className="h-7 w-7 text-muted-foreground/50 mb-2" />
                    <p className="text-xs text-muted-foreground font-medium">
                      {isArabic ? "لا يوجد طلاب مطابقون" : "No matching students"}
                    </p>
                  </div>
                ) : (
                  modalFilteredStudents.map((s) => {
                    const isSelected = selectedStudentIds.includes(s.id);
                    const currentAdvisor = advisors.data?.find(
                      (a) => a._id === String(s.assignedAdvisorId),
                    );

                    return (
                      <div
                        key={s.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          setSelectedStudentIds((prev) =>
                            isSelected
                              ? prev.filter((id) => id !== s.id)
                              : [...prev, s.id],
                          );
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            setSelectedStudentIds((prev) =>
                              isSelected
                                ? prev.filter((id) => id !== s.id)
                                : [...prev, s.id],
                            );
                          }
                        }}
                        className={cn(
                          "group flex items-center justify-between rounded-xl border p-2 transition cursor-pointer text-start",
                          isSelected
                            ? "border-sky-400/80 bg-sky-500/15 shadow-sm ring-1 ring-sky-400/30"
                            : "border-white/5 bg-card/60 hover:border-white/15 hover:bg-card/80",
                        )}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          {/* Checkbox */}
                          <div
                            className={cn(
                              "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                              isSelected
                                ? "border-sky-400 bg-sky-500 text-white"
                                : "border-white/20 bg-background/50",
                            )}
                          >
                            {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                          </div>

                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-sky-500/20 bg-sky-500/10 text-xs font-bold text-sky-300">
                            {s.name.trim().charAt(0)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold text-foreground">
                              <bdi>{s.name}</bdi>
                            </p>
                            <p className="text-[10px] text-muted-foreground font-mono">
                              {s.studentCode} · {isArabic ? "م" : "L"}{s.academicLevel} · GPA {s.gpa.toFixed(2)}
                            </p>
                            {currentAdvisor ? (
                              <p className="text-[10px] text-sky-300/80 truncate mt-0.5">
                                {isArabic ? "المرشد: " : "Advisor: "}
                                {currentAdvisor.name}
                              </p>
                            ) : (
                              <p className="text-[10px] text-amber-400/80 truncate mt-0.5">
                                {isArabic ? "بدون مرشد" : "No advisor"}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Column 2: Choose Advisor (col-span-12 md:col-span-6 lg:col-span-7) */}
            <div className="col-span-12 md:col-span-6 lg:col-span-7 p-5 flex flex-col min-h-[350px] md:min-h-0 overflow-hidden">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
                    {isArabic ? "اختيار المرشد الأكاديمي" : "Select Academic Advisor"}
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    {isArabic
                      ? "اختر المرشد لمتابعة الخطة الأكاديمية"
                      : "Choose the advisor according to capacity & workload"}
                  </p>
                </div>

                <span className="text-[11px] text-muted-foreground">
                  {advisors.data?.length ?? 0} {isArabic ? "مرشد متاح" : "advisors"}
                </span>
              </div>

              {/* Advisor Search Box */}
              <div className="relative mb-3">
                <Search className="absolute inset-s-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={advisorSearchTerm}
                  onChange={(e) => setAdvisorSearchTerm(e.target.value)}
                  className="ps-9 h-9 text-xs rounded-squircle"
                  placeholder={
                    isArabic
                      ? "بحث عن مرشد بالاسم أو البريد..."
                      : "Search advisor by name or email..."
                  }
                />
                {advisorSearchTerm && (
                  <button
                    type="button"
                    onClick={() => setAdvisorSearchTerm("")}
                    className="absolute inset-e-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Advisors List */}
              <div className="custom-scroll flex-1 overflow-y-auto space-y-2 pe-1 max-h-[300px] md:max-h-[360px]">
                {(advisors.data ?? []).length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-center p-4">
                    <UserPlus className="h-8 w-8 text-muted-foreground/50 mb-2" />
                    <p className="text-xs text-muted-foreground font-medium">
                      {isArabic ? "لا يوجد مرشدون مسجلون" : "No advisors found"}
                    </p>
                  </div>
                ) : (
                  (advisors.data ?? [])
                    .filter((advisor) => {
                      if (!advisorSearchTerm.trim()) return true;
                      const q = advisorSearchTerm.toLowerCase();
                      return (
                        advisor.name.toLowerCase().includes(q) ||
                        (advisor.email && advisor.email.toLowerCase().includes(q))
                      );
                    })
                    .map((advisor) => {
                      const isSelected = selectedAdvisorId === advisor._id;
                      const count = advisor.assignedStudentCount ?? 0;
                      const loadLevel =
                        count < 20 ? "low" : count < 35 ? "medium" : "high";

                      return (
                        <div
                          key={advisor._id}
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedAdvisorId(advisor._id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ")
                              setSelectedAdvisorId(advisor._id);
                          }}
                          className={cn(
                            "flex items-center justify-between rounded-xl border p-3 text-start transition-all cursor-pointer",
                            isSelected
                              ? "border-sky-400 bg-sky-500/15 shadow-md ring-2 ring-sky-400/40"
                              : "border-white/10 bg-secondary/20 hover:bg-secondary/40 hover:border-white/20",
                          )}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className={cn(
                                "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-sm font-bold",
                                isSelected
                                  ? "border-sky-400 bg-sky-500/20 text-sky-200"
                                  : "border-white/10 bg-secondary/30 text-muted-foreground",
                              )}
                            >
                              {advisor.name.trim().charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-foreground truncate">
                                {advisor.name}
                              </p>
                              <p className="text-[11px] text-muted-foreground truncate font-mono">
                                {advisor.email || "—"}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2.5 shrink-0">
                            {/* Workload Indicator Pill */}
                            <span
                              className={cn(
                                "rounded-squircle px-2.5 py-0.5 text-[10px] font-semibold font-mono border",
                                loadLevel === "low"
                                  ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
                                  : loadLevel === "medium"
                                    ? "border-sky-500/30 bg-sky-500/15 text-sky-300"
                                    : "border-amber-500/30 bg-amber-500/15 text-amber-300",
                              )}
                            >
                              {count} {isArabic ? "طالب" : "students"}
                            </span>

                            {/* Radio Checkmark */}
                            <div
                              className={cn(
                                "flex h-5 w-5 items-center justify-center rounded-full border transition-all",
                                isSelected
                                  ? "border-sky-400 bg-sky-500 text-white"
                                  : "border-white/20 bg-background/50",
                              )}
                            >
                              {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                            </div>
                          </div>
                        </div>
                      );
                    })
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-3 border-t border-white/10 bg-secondary/20 p-4 px-6">
            <div className="text-xs text-muted-foreground">
              {selectedAdvisorId && selectedStudentIds.length > 0 ? (
                <span>
                  {isArabic ? "المرشد المختار: " : "Selected Advisor: "}
                  <strong className="text-sky-300">
                    {
                      advisors.data?.find((a) => a._id === selectedAdvisorId)
                        ?.name
                    }
                  </strong>
                  {" · "}
                  <span>
                    {isArabic
                      ? `سيتم إسناد ${selectedStudentIds.length} طالب`
                      : `Will assign ${selectedStudentIds.length} student(s)`}
                  </span>
                </span>
              ) : selectedStudentIds.length === 0 ? (
                <span className="text-amber-300/80">
                  {isArabic
                    ? "يرجى تحديد طالب واحد على الأقل من القائمة"
                    : "Please select at least one student"}
                </span>
              ) : (
                <span className="text-amber-300/80">
                  {isArabic
                    ? "اختر مرشداً أكاديمياً لتأكيد الإسناد"
                    : "Please select an academic advisor to continue"}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAssignAdvisorModalOpen(false)}
                className="h-9 text-xs rounded-squircle"
              >
                {isArabic ? "إلغاء" : "Cancel"}
              </Button>
              <Button
                type="button"
                disabled={
                  assignStudents.isPending ||
                  !selectedAdvisorId ||
                  selectedStudentIds.length === 0
                }
                onClick={() => assignStudents.mutate()}
                className="h-9 gap-1.5 bg-gradient-to-r from-teal-500 to-sky-500 text-white hover:from-teal-400 hover:to-sky-400 text-xs font-semibold shadow-md rounded-squircle cursor-pointer"
              >
                {assignStudents.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <UserPlus className="h-3.5 w-3.5" />
                )}
                <span>
                  {isArabic
                    ? `تأكيد التعيين (${selectedStudentIds.length})`
                    : `Confirm Assignment (${selectedStudentIds.length})`}
                </span>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )}
  </div>
);
}
function getCourseLevel(course: AdvisingCourseMap["courses"][0]): number {
  if (course.academicLevel) {
    const num = parseInt(course.academicLevel.replace(/\D/g, ""), 10);
    if (!isNaN(num) && num >= 1 && num <= 4) return num;
  }
  if (course.level) {
    const num = parseInt(course.level.replace(/\D/g, ""), 10);
    if (!isNaN(num) && num >= 1 && num <= 4) return num;
  }
  const match = course.code.match(/([1-4])\d{2}/);
  if (match) {
    return parseInt(match[1], 10);
  }
  return 1;
}

function isCourseOfferedInSemester(
  course: AdvisingCourseMap["courses"][0],
  semester: "first" | "second" | "summer",
) {
  return course.offeredTerms?.length
    ? course.offeredTerms.includes(semester)
    : course.semester === semester;
}

type CanvasProps = {
  courseMap?: AdvisingCourseMap;
  recommendations: CourseRecommendation[];
  selectedCourseIds: string[];
  locale: string;
  isArabic: boolean;
  disabled: boolean;
  activeStudent?: AdvisingStudent;
  onDecision: (
    id: string,
    decision: "ACCEPTED" | "REJECTED" | "PENDING",
  ) => void;
  onToggleManual: (courseId: string) => void;
  onStartCase?: () => void;
  isStartingCase?: boolean;
  onSaveDraft?: () => void;
  isSavingDraft?: boolean;
  onApprove?: () => void;
  isApproving?: boolean;
  hasDraft?: boolean;
  selectedCredits: number;
  advisingSemester: "first" | "second" | "summer";
};

function Canvas(props: CanvasProps) {
  if (!props.courseMap) {
    if (props.activeStudent) {
      return (
        <div className="flex min-h-[420px] flex-col items-center justify-center rounded-3xl border border-dashed border-sky-500/30 bg-card/40 p-8 text-center">
          <div className="mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-sky-500/10 text-sky-400">
            <Sparkles className="h-8 w-8" />
          </div>
          <h3 className="text-base font-bold">
            {props.isArabic
              ? `طالب محدد: ${props.activeStudent.name}`
              : `Selected Student: ${props.activeStudent.name}`}
          </h3>
          <p className="mt-1.5 max-w-md text-xs text-muted-foreground">
            {props.isArabic
              ? "لم يتم فتح ملف إرشاد بعد لهذا الطالب في الفترة المحددة. اضغط على الزر أدناه لبدء جلسة الإرشاد وتوليد خريطة المقررات والتوصيات تلقائياً."
              : "No advising case exists for this student in the selected period. Click below to start advising and generate the course map."}
          </p>
          <div className="mt-5 flex gap-2">
            <Button
              disabled={props.isStartingCase}
              onClick={props.onStartCase}
              className="gap-2"
            >
              {props.isStartingCase ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FolderOpen className="h-4 w-4" />
              )}
              {props.isArabic
                ? "بدء جلسة الإرشاد وعرض الخريطة"
                : "Open Advising Case & View Map"}
            </Button>
          </div>
        </div>
      );
    }

    return (
      <Empty
        text={
          props.isArabic
            ? "اختر طالباً من القائمة الجانبية لبدء جلسة الإرشاد وعرض الخريطة"
            : "Select a student from the sidebar to open the advising canvas"
        }
      />
    );
  }

  return <CanvasContent {...props} courseMap={props.courseMap} />;
}

function CanvasContent({
  courseMap,
  recommendations,
  selectedCourseIds,
  locale,
  isArabic,
  disabled,
  activeStudent,
  onDecision,
  onToggleManual,
  onSaveDraft,
  isSavingDraft,
  onApprove,
  isApproving,
  hasDraft,
  selectedCredits,
  advisingSemester,
}: CanvasProps & { courseMap: AdvisingCourseMap }) {
  const [viewMode, setViewMode] = useState<"grid" | "flow">("grid");
  const [gridLevelFilter, setGridLevelFilter] = useState<string>("all");
  const [courseSearch, setCourseSearch] = useState<string>("");

  const recommendationByCode = useMemo(
    () =>
      new Map(
        recommendations
          .filter((item) => Boolean(item?.courseId?.code))
          .map((item) => [item.courseId.code.toUpperCase(), item]),
      ),
    [recommendations],
  );

  const completedCodes = useMemo(
    () =>
      courseMap.courses
        .filter((course) => course.progressStatus === "passed")
        .map((course) => course.code.toUpperCase()),
    [courseMap.courses],
  );
  const completedSet = useMemo(() => new Set(completedCodes), [completedCodes]);
  const courseByCode = new Map(
    courseMap.courses.map((course) => [course.code.toUpperCase(), course]),
  );

  const selectedSet = useMemo(
    () => new Set(selectedCourseIds),
    [selectedCourseIds],
  );
  const selectedCodes = useMemo(
    () =>
      courseMap.courses
        .filter((course) => selectedSet.has(course._id))
        .map((course) => course.code),
    [courseMap.courses, selectedSet],
  );
  const visibleSelectedCodes = useMemo(
    () => [...new Set([...courseMap.selectedCourses, ...selectedCodes])],
    [courseMap.selectedCourses, selectedCodes],
  );
  const visibleSelectedSet = useMemo(
    () => new Set(visibleSelectedCodes.map((c) => c.toUpperCase())),
    [visibleSelectedCodes],
  );

  const failedCodes = useMemo(
    () =>
      courseMap.courses
        .filter((course) => course.progressStatus === "failed")
        .map((course) => course.code),
    [courseMap.courses],
  );

  const selectableCourses = useMemo(
    () =>
      courseMap.courses.filter((course) => {
        const codeUpper = course.code.toUpperCase();
        const isPassed =
          completedSet.has(codeUpper) || course.progressStatus === "passed";
        const isLowGrade = course.progressStatus === "low_grade";
        if (isPassed && !isLowGrade) {
          return false;
        }

        if (!isCourseOfferedInSemester(course, advisingSemester)) {
          return false;
        }

        const prereqs = course.prerequisites ?? [];
        return prereqs.every((code) => completedSet.has(code.toUpperCase()));
      }),
    [advisingSemester, courseMap.courses, completedSet],
  );

  // Credit limits computation
  const isSummer = advisingSemester === "summer";
  const isProbation =
    (activeStudent?.warningCount ?? 0) >= 2 || (activeStudent?.gpa ?? 0) < 2.0;
  const isGraduating =
    Boolean(activeStudent?.expectedGraduation) ||
    (courseMap.summary?.remainingCredits ?? 100) <= 21;
  const maxAllowedCredits = isSummer
    ? isProbation
      ? 6
      : 9
    : isProbation
      ? 12
      : isGraduating
        ? 21
        : 18;

  const isOverCreditLimit = selectedCredits > maxAllowedCredits;
  const creditUsagePercent = Math.min(
    100,
    Math.round((selectedCredits / maxAllowedCredits) * 100),
  );

  // Course Grid filtering and grouping
  const filteredCourses = useMemo(() => {
    return courseMap.courses.filter((course) => {
      const level = getCourseLevel(course);
      if (gridLevelFilter !== "all" && String(level) !== gridLevelFilter) {
        return false;
      }
      if (!courseSearch.trim()) return true;
      const q = courseSearch.toLowerCase();
      return (
        course.code.toLowerCase().includes(q) ||
        (course.nameAr && course.nameAr.toLowerCase().includes(q)) ||
        (course.nameEn && course.nameEn.toLowerCase().includes(q)) ||
        (course.name && course.name.toLowerCase().includes(q))
      );
    });
  }, [courseMap.courses, gridLevelFilter, courseSearch]);

  const coursesByLevel = useMemo(() => {
    const map = new Map<number, AdvisingCourseMap["courses"]>();
    for (let l = 1; l <= 4; l++) map.set(l, []);
    for (const course of filteredCourses) {
      const lvl = getCourseLevel(course);
      const list = map.get(lvl) ?? [];
      list.push(course);
      map.set(lvl, list);
    }
    return map;
  }, [filteredCourses]);

  const blockedCoursesCountByPrereq = useMemo(() => {
    const map = new Map<string, string[]>();
    courseMap.courses.forEach((c) => {
      (c.prerequisites ?? []).forEach((prereqCode) => {
        const pUpper = prereqCode.trim().toUpperCase();
        const current = map.get(pUpper) ?? [];
        current.push(c.code);
        map.set(pUpper, current);
      });
    });
    return map;
  }, [courseMap.courses]);

  const handleToggleCourse = (course: AdvisingCourseMap["courses"][0]) => {
    if (disabled) return;
    const recommendation = recommendationByCode.get(course.code.toUpperCase());
    if (recommendation?.accepted) {
      onDecision(recommendation._id, "PENDING");
      return;
    }
    onToggleManual(course._id);
  };

  return (
    <div className="space-y-4">
      {/* Top Bar: View Mode Switcher, Level Filter, Search */}
      <div className="flex flex-col gap-2.5 rounded-2xl border border-white/10 bg-card/60 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1.5 rounded-xl bg-secondary/40 p-1">
          <button
            type="button"
            onClick={() => setViewMode("grid")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition",
              viewMode === "grid"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            <span>{isArabic ? "شبكة المقررات (Grid)" : "Curriculum Grid"}</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("flow")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition",
              viewMode === "flow"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            <Workflow className="h-3.5 w-3.5" />
            <span>
              {isArabic ? "المسار التفاعلي (XYZ Flow)" : "Interactive Flow"}
            </span>
          </button>
        </div>

        {viewMode === "grid" ? (
          <div className="flex flex-wrap items-center gap-2">
            {/* Level Quick Filter */}
            <div className="flex items-center gap-1 rounded-lg bg-secondary/30 p-0.5 text-[11px]">
              {[
                { id: "all", label: isArabic ? "كل المستويات" : "All" },
                { id: "1", label: isArabic ? "مستوى 1" : "L1" },
                { id: "2", label: isArabic ? "مستوى 2" : "L2" },
                { id: "3", label: isArabic ? "مستوى 3" : "L3" },
                { id: "4", label: isArabic ? "مستوى 4" : "L4" },
              ].map((lvl) => (
                <button
                  key={lvl.id}
                  type="button"
                  onClick={() => setGridLevelFilter(lvl.id)}
                  className={cn(
                    "rounded-md px-2 py-1 transition",
                    gridLevelFilter === lvl.id
                      ? "bg-primary/20 text-primary font-semibold"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {lvl.label}
                </button>
              ))}
            </div>

            {/* In-Canvas Search */}
            <div className="relative">
              <Search className="absolute inset-s-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={courseSearch}
                onChange={(e) => setCourseSearch(e.target.value)}
                placeholder={
                  isArabic ? "بحث في المقررات..." : "Search courses..."
                }
                className="h-8 w-36 ps-8 text-xs sm:w-48"
              />
            </div>
          </div>
        ) : null}
      </div>

      {/* Main Content Area: Either Grid Matrix or Interactive Flow Chart */}
      {viewMode === "grid" ? (
        <div className="space-y-6">
          {[1, 2, 3, 4].map((levelNum) => {
            const levelCourses = coursesByLevel.get(levelNum) ?? [];
            if (!levelCourses.length && gridLevelFilter !== "all") return null;

            const levelNames = {
              1: {
                ar: "المستوى الأول (السنة الأولى)",
                en: "Level 1 (Freshman)",
              },
              2: {
                ar: "المستوى الثاني (السنة الثانية)",
                en: "Level 2 (Sophomore)",
              },
              3: {
                ar: "المستوى الثالث (السنة الثالثة)",
                en: "Level 3 (Junior)",
              },
              4: {
                ar: "المستوى الرابع (سنة التخرج)",
                en: "Level 4 (Senior)",
              },
            }[levelNum as 1 | 2 | 3 | 4];

            const completedInLevel = levelCourses.filter((c) =>
              completedSet.has(c.code.toUpperCase()),
            ).length;

            return (
              <section key={levelNum} className="space-y-3">
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="grid h-6 w-6 place-items-center rounded-lg bg-sky-500/10 text-xs font-bold text-sky-400">
                      {levelNum}
                    </span>
                    <h3 className="text-sm font-bold text-foreground">
                      {isArabic ? levelNames.ar : levelNames.en}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span>
                      {levelCourses.length}{" "}
                      {isArabic ? "مقرر" : "courses"}
                    </span>
                    <span>·</span>
                    <span className="text-emerald-400">
                      {completedInLevel} {isArabic ? "مجتاز" : "passed"}
                    </span>
                  </div>
                </div>

                {!levelCourses.length ? (
                  <p className="py-4 text-center text-xs text-muted-foreground">
                    {isArabic
                      ? "لا توجد مقررات مطابقة للبحث في هذا المستوى"
                      : "No courses matching filter in this level"}
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {levelCourses.map((course) => {
                      const codeUpper = course.code.toUpperCase();
                      const isPassed =
                        completedSet.has(codeUpper) ||
                        course.progressStatus === "passed";
                      const isFailed = course.progressStatus === "failed";
                      const isLowGrade = course.progressStatus === "low_grade";
                      const isInPlan =
                        visibleSelectedSet.has(codeUpper) ||
                        selectedSet.has(course._id);
                      const rec = recommendationByCode.get(codeUpper);
                      const isOffered = isCourseOfferedInSemester(
                        course,
                        advisingSemester,
                      );
                      const isRecommended =
                        !isPassed &&
                        isOffered &&
                        (Boolean(
                          courseMap.suggestedCourses?.includes(course.code),
                        ) ||
                          Boolean(rec?.isRecommendedForSemester));

                      const blockedFutureCourses =
                        blockedCoursesCountByPrereq.get(codeUpper) ?? [];
                      const isCriticalBlocker =
                        isFailed && blockedFutureCourses.length > 0;

                      const prereqs = course.prerequisites ?? [];
                      const prereqsMet = prereqs.every((p) =>
                        completedSet.has(p.toUpperCase()),
                      );
                      const canSelect =
                        (!isPassed || isLowGrade) &&
                        prereqsMet &&
                        isOffered &&
                        !disabled;

                      return (
                        <div
                          key={course._id ?? course.code}
                          className={cn(
                            "relative flex flex-col justify-between rounded-2xl border p-3.5 transition-all shadow-sm",
                            isInPlan
                              ? "border-sky-500/40 bg-sky-500/10"
                              : isCriticalBlocker
                                ? "border-red-500/50 bg-red-500/15 ring-1 ring-red-500/30 shadow-sm shadow-red-500/10"
                                : isPassed
                                  ? "border-emerald-500/20 bg-emerald-500/5"
                                  : isFailed
                                    ? "border-red-500/30 bg-red-500/10"
                                    : isLowGrade
                                      ? "border-amber-500/30 bg-amber-500/10"
                                      : isRecommended
                                        ? "border-purple-500/30 bg-purple-500/5"
                                        : "border-white/10 bg-card/60 hover:border-white/20",
                          )}
                        >
                          <div>
                            {/* Card Top: Code & Credit Hours */}
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-xs font-bold text-foreground">
                                {course.code}
                              </span>
                              <span className="rounded bg-secondary/60 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                                {course.creditHours ?? 3}{" "}
                                {isArabic ? "ساعات" : "cr"}
                              </span>
                            </div>

                            {/* Card Title */}
                            <h4 className="mt-1.5 text-xs font-bold leading-tight text-foreground line-clamp-2">
                              {isArabic
                                ? course.nameAr || course.name
                                : course.nameEn || course.name}
                            </h4>

                            {/* Prerequisites List */}
                            <div className="mt-2 text-[10px]">
                              {prereqs.length ? (
                                <div className="flex flex-wrap items-center gap-1">
                                  <span className="text-muted-foreground">
                                    {isArabic ? "المتطلب:" : "Prereq:"}
                                  </span>
                                  {prereqs.map((p) => {
                                    const pPassed = completedSet.has(
                                      p.toUpperCase(),
                                    );
                                    const prerequisite = courseByCode.get(
                                      p.toUpperCase(),
                                    );
                                    const prerequisiteName = prerequisite
                                      ? isArabic
                                        ? prerequisite.nameAr || prerequisite.name
                                        : prerequisite.nameEn || prerequisite.name
                                      : p;
                                    return (
                                      <span
                                        key={p}
                                        className={cn(
                                          "inline-flex items-center gap-0.5 rounded px-1 py-0.5 font-mono",
                                          pPassed
                                            ? "bg-emerald-500/15 text-emerald-300"
                                            : "bg-red-500/15 text-red-300",
                                        )}
                                      >
                                        {pPassed ? (
                                          <CheckCircle2 className="h-2.5 w-2.5" />
                                        ) : (
                                          <LockKeyhole className="h-2.5 w-2.5" />
                                        )}
                                        {prerequisiteName}
                                      </span>
                                    );
                                  })}
                                </div>
                              ) : (
                                <span className="text-muted-foreground/60">
                                  {isArabic
                                    ? "بدون متطلبات"
                                    : "No prerequisites"}
                                </span>
                              )}
                            </div>

                            {/* Status Badge */}
                            <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[10px]">
                              {isInPlan ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/20 px-2 py-0.5 font-semibold text-sky-300">
                                  <Check className="h-3 w-3" />
                                  {isArabic
                                    ? "محدد للتسجيل"
                                    : "Selected in plan"}
                                </span>
                              ) : isPassed ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 font-semibold text-emerald-300">
                                  <CheckCircle2 className="h-3 w-3" />
                                  {isArabic ? "مجتاز" : "Passed"}
                                </span>
                              ) : (
                                <>
                                  {isFailed ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-red-500/20 px-2 py-0.5 font-semibold text-red-300">
                                      <AlertCircle className="h-3 w-3" />
                                      {isArabic
                                        ? "راسب (إعادة)"
                                        : "Failed (Repeat)"}
                                    </span>
                                  ) : isLowGrade ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 font-semibold text-amber-300">
                                      <AlertTriangle className="h-3 w-3" />
                                      {isArabic ? "درجة منخفضة" : "Low Grade"}
                                    </span>
                                  ) : null}

                                  {isCriticalBlocker ? (
                                    <span
                                      className="inline-flex items-center gap-1 rounded-full bg-red-500/25 border border-red-500/40 px-2 py-0.5 font-bold text-red-200"
                                      title={
                                        isArabic
                                          ? `يعطل المقررات القادمة: ${blockedFutureCourses.join(", ")}`
                                          : `Blocks future courses: ${blockedFutureCourses.join(", ")}`
                                      }
                                    >
                                      <AlertTriangle className="h-3 w-3 text-red-400" />
                                      {isArabic
                                        ? `يعطل ${blockedFutureCourses.length} مقرر قادم`
                                        : `Blocks ${blockedFutureCourses.length} future`}
                                    </span>
                                  ) : !isFailed &&
                                    !isPassed &&
                                    blockedFutureCourses.length > 0 ? (
                                    <span
                                      className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 border border-sky-500/20 px-1.5 py-0.5 text-[9px] font-medium text-sky-300/90"
                                      title={
                                        isArabic
                                          ? `متطلب سابق لـ: ${blockedFutureCourses.join(", ")}`
                                          : `Prerequisite for: ${blockedFutureCourses.join(", ")}`
                                      }
                                    >
                                      <GitBranch className="h-2.5 w-2.5" />
                                      {isArabic
                                        ? `يفتح ${blockedFutureCourses.length} مقرر`
                                        : `Unlocks ${blockedFutureCourses.length}`}
                                    </span>
                                  ) : null}

                                  {!isOffered ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 font-semibold text-amber-300">
                                      <CalendarClock className="h-3 w-3" />
                                      {isArabic
                                        ? "غير مطروح هذا الفصل"
                                        : "Not offered this semester"}
                                    </span>
                                  ) : isRecommended ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/20 border border-purple-500/30 px-2 py-0.5 font-semibold text-purple-300">
                                      <Sparkles className="h-3 w-3 text-purple-400" />
                                      {isArabic ? "موصى به" : "Recommended"}
                                    </span>
                                  ) : !isFailed && !isLowGrade ? (
                                    prereqsMet ? (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-muted-foreground">
                                        {isArabic ? "متاح" : "Available"}
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-red-400">
                                        <LockKeyhole className="h-3 w-3" />
                                        {isArabic ? "مقفل" : "Locked"}
                                      </span>
                                    )
                                  ) : null}
                                </>
                              )}
                            </div>
                          </div>

                          {/* Action Button */}
                          <div className="mt-3 border-t border-white/10 pt-2">
                            {isInPlan ? (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={disabled}
                                onClick={() => handleToggleCourse(course)}
                                className="h-7 w-full border-red-500/30 text-[11px] text-red-300 hover:bg-red-500/15"
                              >
                                <Minus className="me-1 h-3.5 w-3.5" />
                                {isArabic ? "إزالة من الخطة" : "Remove"}
                              </Button>
                            ) : canSelect ? (
                              <Button
                                size="sm"
                                disabled={disabled}
                                onClick={() => handleToggleCourse(course)}
                                className="h-7 w-full text-[11px] bg-primary/90 hover:bg-primary"
                              >
                                <Plus className="me-1 h-3.5 w-3.5" />
                                {isArabic ? "إضافة إلى الخطة" : "Add to Plan"}
                              </Button>
                            ) : !isOffered ? (
                              <div className="flex items-center justify-center gap-1 py-1 text-center text-[10px] font-medium text-amber-300">
                                <CalendarClock className="h-3 w-3" />
                                <span>
                                  {isArabic
                                    ? "غير مطروح هذا الفصل"
                                    : "Not offered this semester"}
                                </span>
                              </div>
                            ) : isPassed ? (
                              <div className="text-center text-[10px] text-emerald-400 font-medium py-1">
                                {isArabic ? "مكتمل بنجاح" : "Completed"}
                              </div>
                            ) : (
                              <div className="flex items-center justify-center gap-1 text-center text-[10px] text-muted-foreground/80 py-1">
                                <LockKeyhole className="h-3 w-3" />
                                <span>
                                  {isArabic
                                    ? "غير مستوفٍ للمتطلبات"
                                    : "Prereqs missing"}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <CourseMapFlow
          courses={courseMap.courses}
          locale={locale}
          selectedCodes={visibleSelectedCodes}
          suggestedCodes={courseMap.suggestedCourses}
          completedCodes={completedCodes}
          failedCodes={failedCodes}
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
      )}

      {/* Live Registration & Credit Limits Summary Dock */}
      <div className="sticky bottom-2 z-10 rounded-2xl border border-white/15 bg-card/95 p-4 shadow-xl backdrop-blur-md">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Left: Credit Hours Capacity Gauge */}
          <div className="space-y-1.5 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="text-foreground">
                  {isArabic
                    ? "الساعات المختارة للتسجيل:"
                    : "Selected Registration Credits:"}
                </strong>
                <span
                  className={cn(
                    "rounded-md px-2 py-0.5 font-mono text-xs font-bold",
                    isOverCreditLimit
                      ? "bg-red-500/20 text-red-300"
                      : "bg-emerald-500/20 text-emerald-300",
                  )}
                >
                  {selectedCredits} / {maxAllowedCredits}{" "}
                  {isArabic ? "ساعة معتمدة" : "credits"}
                </span>
                {isProbation ? (
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                    {isArabic
                      ? "تحت الملاحظة (حد أقصى 12 ساعة)"
                      : "Probation (Max 12 cr)"}
                  </span>
                ) : isGraduating ? (
                  <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold text-sky-300">
                    {isArabic
                      ? "طالب خريج (سماح حتى 21 ساعة)"
                      : "Graduating Senior (Max 21 cr)"}
                  </span>
                ) : null}
              </div>
              <span className="text-[11px] text-muted-foreground">
                {selectedCodes.length}{" "}
                {isArabic ? "مقررات محددة" : "courses selected"}
              </span>
            </div>

            {/* Visual Progress Bar */}
            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary/60">
              <div
                className={cn(
                  "h-full transition-all duration-300 rounded-full",
                  isOverCreditLimit
                    ? "bg-red-500"
                    : creditUsagePercent > 85
                      ? "bg-amber-400"
                      : "bg-emerald-400",
                )}
                style={{
                  width: `${Math.min(100, (selectedCredits / maxAllowedCredits) * 100)}%`,
                }}
              />
            </div>

            {isOverCreditLimit ? (
              <p className="flex items-center gap-1 text-[11px] font-medium text-red-400">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {isArabic
                  ? `تنبيه: تجاوزت الحد الأقصى (${maxAllowedCredits} ساعة). يرجى إزالة مقرر ليتوافق مع اللائحة الأكاديمية.`
                  : `Warning: Selected credits exceed the maximum limit (${maxAllowedCredits} cr). Please remove a course.`}
              </p>
            ) : null}
          </div>

          {/* Right: Quick Action Buttons */}
          <div className="flex items-center gap-2">
            {onSaveDraft ? (
              <Button
                size="sm"
                variant="outline"
                disabled={disabled || isSavingDraft || !selectedCourseIds.length}
                onClick={onSaveDraft}
                className="gap-1.5 text-xs"
              >
                {isSavingDraft ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ClipboardCheck className="h-3.5 w-3.5" />
                )}
                {isArabic ? "حفظ المسودة" : "Save Draft"}
              </Button>
            ) : null}
            {onApprove ? (
              <Button
                size="sm"
                disabled={
                  disabled || !hasDraft || isApproving || isOverCreditLimit
                }
                onClick={onApprove}
                className="gap-1.5 text-xs"
              >
                {isApproving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                {isArabic ? "اعتماد التسجيل" : "Approve & Register"}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
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
          {isArabic
            ? `${items.length} توصية`
            : `${items.length} recommendations`}
        </span>
        <div className="w-48">
          <CustomDropdown
            value={filter}
            onValueChange={(value) =>
              setFilter(value as "ALL" | "ELIGIBLE" | "ADDED" | "BLOCKED")
            }
            ariaLabel={isArabic ? "تصفية التوصيات" : "Filter recommendations"}
            className="h-9 text-xs"
            options={[
              {
                value: "ALL",
                label: isArabic ? "كل التوصيات" : "All recommendations",
              },
              { value: "ELIGIBLE", label: isArabic ? "المتاح" : "Eligible" },
              {
                value: "ADDED",
                label: isArabic ? "المضاف إلى الخطة" : "Added to plan",
              },
              { value: "BLOCKED", label: isArabic ? "غير المتاح" : "Blocked" },
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
        <Empty
          text={
            isArabic
              ? "لا توجد توصيات مطابقة لهذا المرشح"
              : "No recommendations match this filter"
          }
        />
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
  const locale: AdvisingLocale = isArabic ? "ar" : "en";
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
            {item.courseId?.code ?? "N/A"}
          </span>
          <h3 className="font-semibold">
            {isArabic
              ? item.courseId?.nameAr || item.courseId?.nameEn || "مقرر غير متوفر"
              : item.courseId?.nameEn || item.courseId?.nameAr || "Unavailable Course"}
          </h3>
        </div>
        <span className="h-fit rounded-full bg-black/20 px-2 py-1 text-xs">
          {statusText} · {item.score}
        </span>
      </div>
      {item.isRecommendedForSemester ? (
        <p className="mt-2 text-xs font-semibold text-emerald-300">
          {isArabic ? "موصى به لهذا الفصل" : "Recommended for this semester"}
        </p>
      ) : null}
      <p className="mt-2 text-xs text-muted-foreground">
        {recommendationExplanation(item, locale)}
      </p>
      {recommendationBlockedReasons(item, locale).map((reason) => (
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
  const locale: AdvisingLocale = isArabic ? "ar" : "en";
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <InfoCard
        icon={<ClipboardCheck className="h-5 w-5 text-sky-300" />}
        label={isArabic ? "حالة الإرشاد" : "Advising status"}
        value={advisingStatusLabel(
          advisingCase?.status ?? student.advisingStatus,
          locale,
        )}
        meta={
          advisingCase
            ? `${advisingCase.academicYear} · ${semesterLabel(advisingCase.semester, locale)}`
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
        value={
          draft
            ? isArabic
              ? `${draft.selectedCourses.length} مقررات`
              : `${draft.selectedCourses.length} courses`
            : isArabic
              ? "لا توجد"
              : "None"
        }
        meta={
          draft
            ? isArabic
              ? `${draft.totalCredits} ساعة معتمدة · الإصدار ${draft.version}`
              : `${draft.totalCredits} credits · v${draft.version}`
            : ""
        }
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
  const locale: AdvisingLocale = isArabic ? "ar" : "en";
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
            <strong>{advisingStatusLabel(item.status, locale)}</strong>
            <p className="text-xs text-muted-foreground">
              {formatDate(item.changedAt, locale)}
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
  const locale: AdvisingLocale = isArabic ? "ar" : "en";
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
                {noteVisibilityLabel(note.visibility, locale)}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatDate(note.createdAt, locale)}
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
  const locale: AdvisingLocale = isArabic ? "ar" : "en";
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
            <strong>{auditActionLabel(item.action, locale)}</strong>
            <span className="text-xs text-muted-foreground">
              {formatDate(item.createdAt, locale)}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {entityTypeLabel(item.entityType, locale)} · {item.entityId}
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

function formatDate(value: string | undefined, locale: AdvisingLocale) {
  if (!value) return "";
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-US", {
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
  const locale: AdvisingLocale = isArabic ? "ar" : "en";
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
                {registration.academicYear} ·{" "}
                {semesterLabel(registration.semester, locale)}
              </strong>
              <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-300">
                {advisingStatusLabel(registration.status, locale)}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {registration.courses.join(", ")} ·{" "}
              {registration.totalCreditHours} {isArabic ? "ساعة" : "credits"} ·{" "}
              {registrationSourceLabel(registration.source, locale)}
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
