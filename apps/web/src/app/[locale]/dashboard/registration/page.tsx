"use client";

import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import {
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  Printer,
  Send,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import api, { getApiErrorMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/feedback";
import { motion } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RegistrationSlipView } from "@/components/registration/registration-slip-view";
import {
  openRegistrationPrintView,
  type PrintableRegistrationForm,
  downloadRegistrationPdf,
} from "@/lib/registration-print";

interface Course {
  _id: string;
  code: string;
  name: string;
  nameAr?: string;
  nameEn?: string;
  prerequisites?: string[];
  creditHours?: number;
  type?: "required" | "elective";
}

interface Eligibility {
  canRegisterDirectly: boolean;
  minCreditHours: number;
  maxCreditHours: number;
  minCourses: number;
  maxCourses?: number;
  policyWarnings?: string[];
  requiresAdvisor: boolean;
  gpa: number;
  academicLevel: string;
  semester: string;
  failedCourses: string[];
  advisingRequest?: AdvisingRequest | null;
  registrationTerm?: {
    academicYear: string;
    semester: string;
    configured: boolean;
    isOpen: boolean;
    isCurrentlyOpen: boolean;
    opensAt?: string;
    closesAt?: string;
  };
}

interface AdvisingRequest {
  _id: string;
  status: string;
  reason: string;
  autoSuggestedCourses: string[];
  staffApprovedCourses: string[];
  staffNotes?: string;
  assignedStaffId?: { name?: string; email?: string };
}

interface Registration {
  _id: string;
  courses: string[];
  totalCreditHours: number;
  source: string;
  status: string;
  academicYear?: string;
  semester?: "first" | "second" | "summer";
  approvedBy?: { name?: string; email?: string };
}

interface ApprovedAcademicPlan {
  _id: string;
  academicYear: string;
  semester: "first" | "second" | "summer";
  status: string;
  studentAcknowledgedAt?: string;
  selectedCourses: Course[];
  totalCredits: number;
  studentVisibleNotes?: string;
}

function localizePolicyWarning(
  warning: string,
  isEnglish: boolean,
): string | null {
  const normalized = warning.toLowerCase();
  if (normalized.includes("registration modification")) return null;
  if (
    normalized.includes("gpa is below 2.00") ||
    normalized.includes("gpa registration rule")
  ) {
    return isEnglish
      ? "Your current GPA range requires academic advisor approval to complete registration."
      : "نطاق معدلك التراكمي الحالي يتطلب موافقة المرشد الأكاديمي لإكمال التسجيل.";
  }
  if (normalized.includes("failed course")) {
    return isEnglish
      ? "Failed courses require academic advising."
      : "توجد مقررات رسوب تتطلب مراجعة المرشد الأكاديمي.";
  }
  if (normalized.includes("academic warning")) {
    return isEnglish
      ? "Academic warnings require advising."
      : "توجد إنذارات أكاديمية تتطلب مراجعة الإرشاد الأكاديمي.";
  }
  if (normalized.includes("graduat")) {
    return isEnglish
      ? "The graduation plan requires advisor approval."
      : "تتطلب خطة التخرج اعتماد المرشد الأكاديمي.";
  }
  if (normalized.includes("summer")) {
    return isEnglish
      ? "The summer registration policy requires advisor approval."
      : "تتطلب سياسة التسجيل الصيفي اعتماد المرشد الأكاديمي.";
  }
  return isEnglish
    ? warning.split("/")[0].replace(/^\s*[•-]\s*/, "").trim()
    : "تتطلب حالتك الأكاديمية مراجعة المرشد الأكاديمي.";
}

function localizeSemester(value: string | undefined, isEnglish: boolean) {
  if (value === "first") return isEnglish ? "First Semester" : "الفصل الدراسي الأول";
  if (value === "second") return isEnglish ? "Second Semester" : "الفصل الدراسي الثاني";
  if (value === "summer") return isEnglish ? "Summer Semester" : "الفصل الدراسي الصيفي";
  return value ?? "—";
}

function localizeRegistrationStatus(value: string | undefined, isEnglish: boolean) {
  const status = value?.toLowerCase();
  if (status === "approved") return isEnglish ? "Approved" : "معتمد";
  if (status === "pending") return isEnglish ? "Pending" : "قيد المراجعة";
  if (status === "registered") return isEnglish ? "Registered" : "مسجل";
  if (status === "rejected") return isEnglish ? "Rejected" : "مرفوض";
  return value ?? "—";
}

export default function CourseRegistrationPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const locale = params.locale as string;
  const isEnglish = locale === "en";

  const [selected, setSelected] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitConfirmationOpen, setSubmitConfirmationOpen] = useState(false);
  const [requestingAdvising, setRequestingAdvising] = useState(false);
  const [slipOpen, setSlipOpen] = useState(false);
  const [submittingApprovedPlan, setSubmittingApprovedPlan] = useState(false);

  const [viewSlipOpen, setViewSlipOpen] = useState(false);
  const [activeSlipForm, setActiveSlipForm] = useState<PrintableRegistrationForm | null>(null);
  const [fetchingSlip, setFetchingSlip] = useState(false);

  const eligibilityQuery = useQuery({
    queryKey: ["registration-eligibility"],
    queryFn: async () => {
      const res = await api.get<Eligibility>("/registration/eligibility");
      return res.data;
    },
  });

  const latestRegistrationQuery = useQuery({
    queryKey: ["latest-registration"],
    queryFn: async () => {
      const res = await api.get<Registration | null>("/registration/latest");
      return res.data;
    },
  });

  const registrationHistoryQuery = useQuery({
    queryKey: ["registration-history"],
    queryFn: async () => {
      const res = await api.get<Registration[]>("/registration/history");
      return res.data;
    },
  });

  const eligibility = eligibilityQuery.data;
  const latestRegistration = latestRegistrationQuery.data;
  const localizedPolicyWarnings = (eligibility?.policyWarnings ?? [])
    .map((warning) => localizePolicyWarning(warning, isEnglish))
    .filter((warning): warning is string => Boolean(warning));

  const isAlreadyRegistered = useMemo(() => {
    if (!latestRegistration || !eligibility) return false;
    const currentYear = eligibility.registrationTerm?.academicYear;
    const currentSemester = eligibility.semester;
    const regStatus = latestRegistration.status?.toLowerCase();
    return (
      (regStatus === "approved" || regStatus === "registered" || regStatus === "pending") &&
      latestRegistration.academicYear === currentYear &&
      latestRegistration.semester === currentSemester
    );
  }, [latestRegistration, eligibility]);

  React.useEffect(() => {
    if (!latestRegistration || !isAlreadyRegistered) return undefined;
    const timer = window.setTimeout(
      () => setSelected(latestRegistration.courses),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [latestRegistration, isAlreadyRegistered]);

  const coursesQuery = useQuery({
    queryKey: ["registration-courses"],
    enabled:
      eligibilityQuery.data?.canRegisterDirectly === true ||
      (!!eligibilityQuery.data &&
        !eligibilityQuery.data.requiresAdvisor &&
        isAlreadyRegistered),
    queryFn: async () => {
      const res = await api.get<{ courses: Course[] }>(
        "/registration/available-courses",
      );
      return res.data.courses;
    },
  });

  const advisingQuery = useQuery({
    queryKey: ["student-advising-state"],
    queryFn: async () => {
      const res = await api.get<{
        request: AdvisingRequest;
        registration: Registration;
        approvedPlan: ApprovedAcademicPlan | null;
      }>("/registration/advising-status");
      return res.data;
    },
  });

  const courses = useMemo(() => coursesQuery.data ?? [], [coursesQuery.data]);
  const selectedHours = useMemo(() => {
    return selected.reduce((sum, code) => {
      const match = courses.find((c) => c.code === code);
      return sum + (match?.creditHours ?? 0);
    }, 0);
  }, [selected, courses]);
  const allAvailableCoursesSelected =
    courses.length > 0 &&
    selected.length === courses.length &&
    courses.every((course) => selected.includes(course.code));
  const directSelectionValid =
    allAvailableCoursesSelected &&
    selected.length >= (eligibility?.minCourses ?? 4) &&
    selected.length <= (eligibility?.maxCourses ?? 6) &&
    selectedHours >= (eligibility?.minCreditHours ?? 12) &&
    selectedHours <= (eligibility?.maxCreditHours ?? 18);
  const selectionRequirementText = isEnglish
    ? `Direct registration requires every available course, ${eligibility?.minCourses ?? 4}–${eligibility?.maxCourses ?? 6} courses total, and ${eligibility?.minCreditHours ?? 12}–${eligibility?.maxCreditHours ?? 18} credit hours.`
    : `يتطلب التسجيل المباشر اختيار جميع المقررات المتاحة، من ${eligibility?.minCourses ?? 4} إلى ${eligibility?.maxCourses ?? 6} مقررات، ومن ${eligibility?.minCreditHours ?? 12} إلى ${eligibility?.maxCreditHours ?? 18} ساعة معتمدة.`;

  const registeredCourseDetails = useMemo(() => {
    if (!latestRegistration || !courses.length) return [];
    return latestRegistration.courses.map((code) => {
      const course = courses.find((c) => c.code === code);
      return {
        code,
        name: course
          ? isEnglish
            ? (course.nameEn ?? course.name)
            : (course.nameAr ?? course.name)
          : code,
        creditHours: course?.creditHours ?? 0,
        type: course?.type ?? "required",
      };
    });
  }, [latestRegistration, courses, isEnglish]);

  const printRegistration = async (
    registration?: Registration | null,
    action: "print" | "download" | "view" = "print",
  ) => {
    if (!registration) return;
    try {
      if (action === "view") {
        setFetchingSlip(true);
      }
      const res = await api.get<PrintableRegistrationForm>(
        `/registrations/${registration._id}/print`,
      );
      if (action === "view") {
        setActiveSlipForm(res.data);
        setViewSlipOpen(true);
      } else if (action === "download") {
        await downloadRegistrationPdf(res.data);
      } else {
        if (!openRegistrationPrintView(res.data, action)) {
          toast.error(
            isEnglish
              ? "Allow pop-ups to open the registration sheet"
              : "يرجى السماح بالنوافذ المنبثقة لفتح استمارة التسجيل",
          );
        }
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      if (action === "view") {
        setFetchingSlip(false);
      }
    }
  };

  const submitRegistration = async () => {
    setSubmitting(true);
    try {
      const res = await api.post<Registration>("/registration/submit", { courseCodes: selected });
      toast.success(
        isEnglish ? "Registration successful" : "تم تسجيل المواد بنجاح",
      );
      setSubmitConfirmationOpen(false);
      const newReg = res.data;
      queryClient.setQueryData<Registration | null>(
        ["latest-registration"],
        newReg,
      );
      queryClient.setQueryData<Registration[]>(
        ["registration-history"],
        (current = []) => [
          newReg,
          ...current.filter((registration) => registration._id !== newReg._id),
        ],
      );
      queryClient.setQueryData<Eligibility | undefined>(
        ["registration-eligibility"],
        (current) => current
          ? { ...current, canRegisterDirectly: false }
          : current,
      );
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["registration-eligibility"] }),
        queryClient.invalidateQueries({ queryKey: ["latest-registration"] }),
        queryClient.invalidateQueries({ queryKey: ["registration-history"] }),
      ]);
      const regToPrint = newReg;
      if (regToPrint) {
        await printRegistration(regToPrint, "view");
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const requestAcademicAdvising = async () => {
    setRequestingAdvising(true);
    try {
      await api.post("/registration/request-advising");
      setSubmitConfirmationOpen(false);
      router.push(`/${locale}/dashboard/academic-advising`);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setRequestingAdvising(false);
    }
  };

  const acknowledgeAndSubmitApprovedPlan = async () => {
    setSubmittingApprovedPlan(true);
    try {
      if (!advisingQuery.data?.approvedPlan?.studentAcknowledgedAt) {
        await api.post("/student/advising/acknowledge");
      }
      const res = await api.post<Registration>("/registration/submit-approved-plan");
      toast.success(
        isEnglish
          ? "The approved advising plan was registered successfully"
          : "تم تسجيل خطة الإرشاد المعتمدة بنجاح",
      );
      const newReg = res.data;
      const [refetchedAdvising, refetchedLatest] = await Promise.all([
        advisingQuery.refetch(),
        latestRegistrationQuery.refetch(),
        registrationHistoryQuery.refetch(),
      ]);
      const regToPrint = newReg || refetchedLatest.data || refetchedAdvising.data?.registration;
      if (regToPrint) {
        await printRegistration(regToPrint, "view");
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setSubmittingApprovedPlan(false);
    }
  };

  const advising = advisingQuery.data?.request ?? eligibility?.advisingRequest;
  const approvedAdvisorPlan = advisingQuery.data?.registration;
  const approvedAcademicPlan = advisingQuery.data?.approvedPlan;

  if (
    eligibilityQuery.isLoading ||
    (eligibility?.canRegisterDirectly && coursesQuery.isLoading)
  ) {
    return (
      <LoadingState title={isEnglish ? "Loading..." : "جاري التحميل..."} />
    );
  }

  return (
    <div
      className="mx-auto max-w-5xl space-y-6"
      dir={isEnglish ? "ltr" : "rtl"}
    >
      {/* Welcome & Info Card */}
      <div className="relative overflow-hidden bg-gradient-to-r from-teal-950/40 via-teal-900/20 to-transparent rounded-2xl p-6 border border-primary/20 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-lg">
        <div className="space-y-1.5 z-10">
          <div className="inline-flex items-center gap-1 px-3 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-xs font-semibold text-primary">
            <Sparkles className="w-3 h-3" />
            {isEnglish
              ? "Academic Advising & Course Registration"
              : "تسجيل المواد والإرشاد الأكاديمي"}
          </div>
          <h2 className="text-xl font-bold text-foreground">
            {isEnglish ? "GPA" : "المعدل التراكمي"}: {eligibility?.gpa?.toFixed(2) ?? "-"} ·{" "}
            {isEnglish ? `Level ${eligibility?.academicLevel ?? "-"}` : `المستوى ${eligibility?.academicLevel ?? "-"}`} ·{" "}
            {eligibility?.semester === "first"
              ? isEnglish ? "First Semester" : "الفصل الدراسي الأول"
              : eligibility?.semester === "second"
                ? isEnglish ? "Second Semester" : "الفصل الدراسي الثاني"
                : eligibility?.semester === "summer"
                  ? isEnglish ? "Summer Semester" : "الفصل الصيفي"
                  : (eligibility?.semester ?? "-")}
          </h2>
          <p className="text-xs text-muted-foreground max-w-xl">
            {isEnglish
              ? "Select eligible courses, review credit hours caps, and download registration slips"
              : "اختر المواد التي ترغب في تسجيلها، راجع الحد الأقصى للساعات المعتمدة، واطبع كشف التسجيل الخاص بك."}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-secondary/40 px-4 py-2.5 text-xs font-bold text-foreground shrink-0 z-10 text-center font-mono">
          {isEnglish ? "Courses" : "المواد"}: {eligibility?.minCourses ?? "-"}
          –{eligibility?.maxCourses ?? "-"} ·{" "}
          {isEnglish ? "Max hours" : "الحد الأقصى للساعات"}:{" "}
          {eligibility?.maxCreditHours ?? "-"}
        </div>
        <div className="absolute -right-20 -top-20 w-40 h-40 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
      </div>

      {eligibility?.registrationTerm &&
      !eligibility.registrationTerm.isCurrentlyOpen ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          <strong>
            {isEnglish ? "Registration is closed" : "التسجيل مغلق"}
          </strong>
          <p className="mt-1 text-xs opacity-80">
            {isEnglish
              ? `The administrator has not opened ${eligibility.registrationTerm.semester} semester registration for ${eligibility.registrationTerm.academicYear}.`
              : `لم يفتح المسؤول التسجيل للفصل ${
                  eligibility.registrationTerm.semester === "first"
                    ? "الأول"
                    : eligibility.registrationTerm.semester === "second"
                      ? "الثاني"
                      : "الصيفي"
                } للعام ${eligibility.registrationTerm.academicYear}.`}
          </p>
        </div>
      ) : null}

      {eligibility?.requiresAdvisor ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Card className="p-6 bg-card/45 backdrop-blur-sm border-border/70 shadow-[var(--shadow-glow)] hover:border-primary/30 transition-all duration-300 space-y-5">
            <div className="flex items-center gap-3 border-b border-border pb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">
                  {isEnglish
                    ? "Academic Advising Required"
                    : "إرشاد أكاديمي مطلوب"}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {isEnglish
                    ? "Direct registration is locked"
                    : "التسجيل المباشر مغلق لمراجعة المرشد"}
                </p>
              </div>
            </div>
            {localizedPolicyWarnings.length ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-300">
                {localizedPolicyWarnings.map((warning) => {
                  let text = warning;
                  if (warning.includes("GPA is below 2.00")) {
                    text = isEnglish
                      ? "GPA is below 2.00 and requires academic advising."
                      : "المعدل التراكمي أقل من 2.00 ويتطلب مراجعة الإرشاد الأكاديمي.";
                  } else if (warning.includes("failed course")) {
                    text = isEnglish
                      ? "Contains failed courses requiring academic advising."
                      : "توجد مقررات دراسية رسوب تتطلب مراجعة المرشد الأكاديمي.";
                  } else if (warning.includes("Academic warning")) {
                    text = isEnglish
                      ? "Account has academic warnings requiring advising."
                      : "الحساب يحتوي على إنذارات أكاديمية تتطلب الإرشاد.";
                  }
                  return <div key={warning}>• {text}</div>;
                })}
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-3">
              <div className="bg-secondary/40 p-3.5 rounded-xl border border-border/80 text-start">
                <span className="text-[10px] font-bold text-muted-foreground uppercase">
                  {isEnglish ? "Status" : "حالة الطلب"}
                </span>
                <p className="text-sm font-bold text-foreground capitalize mt-1">
                  {(() => {
                    const st = advising?.status ?? "pending";
                    const statusMap: Record<string, string> = {
                      pending: isEnglish ? "Pending" : "قيد المراجعة",
                      approved: isEnglish ? "Approved" : "معتمد",
                      rejected: isEnglish ? "Rejected" : "مرفوض",
                      UNDER_REVIEW: isEnglish ? "Under Review" : "قيد المراجعة",
                      DRAFT: isEnglish ? "Draft" : "مسودة",
                    };
                    return statusMap[st] ?? st;
                  })()}
                </p>
              </div>
              <div className="bg-secondary/40 p-3.5 rounded-xl border border-border/80 text-start">
                <span className="text-[10px] font-bold text-muted-foreground uppercase">
                  {isEnglish ? "Advisor" : "المرشد الأكاديمي"}
                </span>
                <p className="text-sm font-bold text-foreground mt-1">
                  {advising?.assignedStaffId?.name ??
                    (isEnglish ? "Pending assignment" : "في انتظار التخصيص")}
                </p>
              </div>
              <div className="bg-secondary/40 p-3.5 rounded-xl border border-border/80 text-start">
                <span className="text-[10px] font-bold text-muted-foreground uppercase">
                  {isEnglish ? "Reason" : "السبب"}
                </span>
                <p className="text-sm font-bold text-foreground mt-1">
                  {(() => {
                    const rsn = advising?.reason ?? "-";
                    const reasonMap: Record<string, string> = {
                      failed_courses: isEnglish ? "Failed Courses" : "وجود مقررات دراسية رسوب",
                      low_gpa: isEnglish ? "Low GPA" : "المعدل التراكمي أقل من 2.00",
                      warning: isEnglish ? "Academic Warning" : "وجود إنذارات أكاديمية",
                      credit_limit: isEnglish ? "Credit Limit Exceeded" : "تجاوز الحد الأقصى للساعات",
                    };
                    return reasonMap[rsn] ?? rsn;
                  })()}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-bold text-foreground">
                {isEnglish
                  ? "Recommended Courses"
                  : "المقررات المقترحة المقبولة"}
              </h4>
              <div className="flex flex-wrap gap-2">
                {(advising?.staffApprovedCourses?.length
                  ? advising.staffApprovedCourses
                  : (advising?.autoSuggestedCourses ?? [])
                ).map((code) => (
                  <span
                    key={code}
                    className="rounded-lg bg-secondary border border-border px-3 py-1 text-xs font-bold font-mono text-foreground"
                  >
                    {code}
                  </span>
                ))}
              </div>
            </div>

            {approvedAcademicPlan ? (
              <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold text-foreground">
                      {isEnglish
                        ? "Advisor-approved registration plan"
                        : "خطة التسجيل المعتمدة من المرشد"}
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      {approvedAcademicPlan.academicYear} ·{" "}
                      {localizeSemester(approvedAcademicPlan.semester, isEnglish)} ·{" "}
                      {approvedAcademicPlan.totalCredits}{" "}
                      {isEnglish ? "credits" : "ساعة"}
                    </p>
                  </div>
                  <Button
                    disabled={
                      submittingApprovedPlan || Boolean(approvedAdvisorPlan)
                    }
                    onClick={acknowledgeAndSubmitApprovedPlan}
                    className="h-11"
                  >
                    <Send className="me-2 h-4 w-4" />
                    {approvedAdvisorPlan
                      ? isEnglish
                        ? "Registered"
                        : "تم التسجيل"
                      : isEnglish
                        ? "Acknowledge & register"
                        : "تأكيد وتسجيل الخطة"}
                  </Button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {approvedAcademicPlan.selectedCourses.map((course) => (
                    <span
                      key={course._id}
                      className="rounded-lg border border-white/10 bg-secondary/50 px-3 py-1 text-xs font-mono font-bold"
                    >
                      {course.code}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {advising?.staffNotes && (
              <div className="p-3.5 rounded-xl border border-border bg-secondary/20 text-xs text-muted-foreground leading-normal">
                <strong>
                  {isEnglish ? "Advisor Notes:" : "ملاحظات المرشد الأكاديمي:"}
                </strong>{" "}
                {advising.staffNotes}
              </div>
            )}

            {approvedAdvisorPlan && (
              <div className="flex flex-col gap-2 pt-2 sm:flex-row">
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300 sm:me-auto">
                  {isEnglish ? "Approved by" : "اعتمد بواسطة"}:{" "}
                  <strong>
                    {approvedAdvisorPlan.approvedBy?.name ??
                      advising?.assignedStaffId?.name ??
                      "-"}
                  </strong>
                </div>
                <Button
                  onClick={() => printRegistration(approvedAdvisorPlan, "view")}
                  className="flex items-center gap-1.5 h-11 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-all cursor-pointer"
                >
                  <Eye className="h-4 w-4" />
                  {isEnglish ? "View" : "عرض"}
                </Button>
                <Button
                  onClick={() => printRegistration(approvedAdvisorPlan, "print")}
                  className="flex items-center gap-1.5 h-11 text-xs font-semibold bg-primary hover:bg-primary/80 text-primary-foreground transition-all cursor-pointer"
                >
                  <Printer className="h-4 w-4" />
                  {isEnglish ? "Print" : "طباعة"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => printRegistration(approvedAdvisorPlan, "download")}
                  className="flex items-center gap-1.5 h-11 text-xs font-semibold border-primary text-primary hover:bg-primary/10 transition-all cursor-pointer"
                >
                  <FileText className="h-4 w-4" />
                  {isEnglish ? "Download PDF" : "تحميل PDF"}
                </Button>
              </div>
            )}
          </Card>
        </motion.div>
      ) : isAlreadyRegistered ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Card className="p-6 bg-card/45 backdrop-blur-sm border-border/70 shadow-[var(--shadow-glow)] hover:border-primary/30 transition-all duration-300 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">
                    {isEnglish ? "Registration Completed" : "تم تسجيل المقررات بنجاح"}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {isEnglish
                      ? "You are successfully registered for this semester"
                      : "تم تسجيل مقرراتك الدراسية بنجاح للفصل الحالي"}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 self-start sm:self-auto">
                <Button
                  onClick={() => printRegistration(latestRegistration, "view")}
                  className="flex items-center gap-1.5 h-11 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-all cursor-pointer shadow-md"
                >
                  <Eye className="h-4 w-4" />
                  {isEnglish ? "View" : "عرض"}
                </Button>
                <Button
                  onClick={() => printRegistration(latestRegistration, "print")}
                  className="flex items-center gap-1.5 h-11 text-xs font-semibold bg-primary hover:bg-primary/80 text-primary-foreground transition-all cursor-pointer shadow-md"
                >
                  <Printer className="h-4 w-4" />
                  {isEnglish ? "Print" : "طباعة"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => printRegistration(latestRegistration, "download")}
                  className="flex items-center gap-1.5 h-11 text-xs font-semibold border-primary text-primary hover:bg-primary/10 transition-all cursor-pointer shadow-md"
                >
                  <FileText className="h-4 w-4" />
                  {isEnglish ? "Download PDF" : "تحميل PDF"}
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto border border-border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24 text-start font-bold">
                      {isEnglish ? "Code" : "الكود الأكاديمي"}
                    </TableHead>
                    <TableHead className="text-start font-bold">
                      {isEnglish ? "Course" : "المقرر الدراسي"}
                    </TableHead>
                    <TableHead className="w-24 text-center font-bold">
                      {isEnglish ? "Hours" : "عدد الساعات"}
                    </TableHead>
                    <TableHead className="w-24 text-end font-bold">
                      {isEnglish ? "Type" : "النوع"}
                    </TableHead>
                    <TableHead className="w-28 text-end font-bold">
                      {isEnglish ? "Status" : "الحالة"}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {registeredCourseDetails.map((course) => (
                    <TableRow key={course.code}>
                      <TableCell className="font-mono font-semibold text-foreground text-start">
                        {course.code}
                      </TableCell>
                      <TableCell className="font-bold text-foreground text-start">
                        {course.name}
                      </TableCell>
                      <TableCell className="font-mono font-semibold text-center">
                        {course.creditHours}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-end">
                        {isEnglish
                          ? course.type
                          : course.type === "elective"
                            ? "اختياري"
                            : "إجباري"}
                      </TableCell>
                      <TableCell className="text-end">
                        <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                          latestRegistration?.status?.toLowerCase() === "approved"
                            ? "bg-emerald-500/10 text-emerald-500 ring-emerald-500/20"
                            : latestRegistration?.status?.toLowerCase() === "pending"
                              ? "bg-amber-500/10 text-amber-500 ring-amber-500/20"
                              : "bg-blue-500/10 text-blue-500 ring-blue-500/20"
                        }`}>
                          {(() => {
                            const s = latestRegistration?.status?.toLowerCase();
                            if (s === "approved") return isEnglish ? "Approved" : "معتمد";
                            if (s === "pending") return isEnglish ? "Pending" : "قيد المراجعة";
                            if (s === "registered") return isEnglish ? "Registered" : "مسجل";
                            return latestRegistration?.status;
                          })()}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between pt-4 border-t border-border mt-4">
              <div>
                <p className="text-xs font-bold text-muted-foreground font-mono">
                  {isEnglish ? "Total credit hours:" : "إجمالي الساعات المعتمدة:"}{" "}
                  {latestRegistration?.totalCreditHours} / {eligibility?.maxCreditHours ?? 18}
                </p>
              </div>
            </div>
          </Card>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Card className="p-6 bg-card/45 backdrop-blur-sm border-border/70 shadow-[var(--shadow-glow)] hover:border-primary/30 transition-all duration-300 space-y-5">
            <div className="flex items-center gap-3 border-b border-border pb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">
                  {isEnglish ? "Direct Registration" : "التسجيل المباشر للمواد"}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {isEnglish
                    ? "Select courses to register for this semester"
                    : "اختر المقررات الدراسية المناسبة لتسجيلها للفصل الحالي"}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto border border-border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 text-start font-bold" />
                    <TableHead className="w-24 text-start font-bold">
                      {isEnglish ? "Code" : "الكود الأكاديمي"}
                    </TableHead>
                    <TableHead className="text-start font-bold">
                      {isEnglish ? "Course" : "المقرر الدراسي"}
                    </TableHead>
                    <TableHead className="w-24 text-center font-bold">
                      {isEnglish ? "Hours" : "عدد الساعات"}
                    </TableHead>
                    <TableHead className="w-24 text-end font-bold">
                      {isEnglish ? "Type" : "النوع"}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {courses.map((course) => (
                    <TableRow key={course._id}>
                      <TableCell className="text-start">
                        <input
                          type="checkbox"
                          checked={selected.includes(course.code)}
                          onChange={(event) => {
                            setSelected((current) =>
                              event.target.checked
                                ? [...current, course.code]
                                : current.filter(
                                    (code) => code !== course.code,
                                  ),
                            );
                          }}
                          className="w-4 h-4 rounded text-primary bg-secondary/50 border-border cursor-pointer focus:ring-primary"
                        />
                      </TableCell>
                      <TableCell className="font-mono font-semibold text-foreground text-start">
                        {course.code}
                      </TableCell>
                      <TableCell className="font-bold text-foreground text-start">
                        {isEnglish
                          ? (course.nameEn ?? course.name)
                          : (course.nameAr ?? course.name)}
                        {course.prerequisites?.length ? (
                           <div className="mt-1 text-[10px] font-normal text-muted-foreground">
                            {isEnglish ? "Prerequisites" : "المتطلبات السابقة"}:{" "}
                            {course.prerequisites.join(", ")}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="font-mono font-semibold text-center">
                        {course.creditHours ?? 0}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-end">
                        {isEnglish
                          ? (course.type ?? "required")
                          : course.type === "elective"
                            ? "اختياري"
                            : "إجباري"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex flex-col gap-4 border-t border-border pt-4 mt-4">
              {/* Validation Warnings List */}
              {(() => {
                const limit = eligibility?.maxCreditHours ?? 18;
                const minLimit = eligibility?.minCreditHours ?? 12;
                const courseLimit = eligibility?.maxCourses ?? 6;
                const minCourses = eligibility?.minCourses ?? 4;

                const errors: string[] = [];
                if (selectedHours > limit) {
                  errors.push(
                    isEnglish
                      ? `⚠️ Total selected hours (${selectedHours}) exceeds the maximum limit of ${limit} credit hours.`
                      : `⚠️ الساعات المختارة (${selectedHours}) تتجاوز الحد الأقصى المسموح به وهو ${limit} ساعة معتمدة.`
                  );
                }
                if (selectedHours < minLimit && selected.length > 0) {
                  errors.push(
                    isEnglish
                      ? `Total selected hours (${selectedHours}) is below the minimum of ${minLimit} credit hours.`
                      : `إجمالي الساعات المختارة (${selectedHours}) أقل من الحد الأدنى ${minLimit} ساعة معتمدة.`,
                  );
                }
                if (selected.length > courseLimit) {
                  errors.push(
                    isEnglish
                      ? `⚠️ Selected courses count (${selected.length}) exceeds the maximum limit of ${courseLimit} courses.`
                      : `⚠️ عدد المواد المختارة (${selected.length}) يتجاوز الحد الأقصى المسموح به وهو ${courseLimit} مواد.`
                  );
                }
                if (selected.length < minCourses && selected.length > 0) {
                  errors.push(
                    isEnglish
                      ? `⚠️ Selected courses count (${selected.length}) is below the minimum limit of ${minCourses} courses.`
                      : `⚠️ عدد المواد المختارة (${selected.length}) أقل من الحد الأدنى المسموح به وهو ${minCourses} مواد.`
                  );
                }

                if (errors.length === 0) return null;
                return (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-500 space-y-1 font-semibold">
                    {errors.map((err, i) => (
                      <div key={i}>{err}</div>
                    ))}
                  </div>
                );
              })()}

              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className={`text-xs font-bold font-mono transition-colors duration-250 ${
                    selectedHours > (eligibility?.maxCreditHours ?? 18) ||
                    (selected.length > 0 && selectedHours < (eligibility?.minCreditHours ?? 12))
                      ? "text-red-500 font-extrabold animate-pulse"
                      : "text-muted-foreground"
                  }`}>
                    {isEnglish ? "Selected hours:" : "الساعات المختارة:"}{" "}
                    {selectedHours} / {eligibility?.maxCreditHours ?? 0}
                  </p>
                  <p className={`text-[10px] font-mono mt-0.5 ${
                    selected.length > (eligibility?.maxCourses ?? 6) || selected.length < (eligibility?.minCourses ?? 4)
                      ? "text-red-500 font-semibold"
                      : "text-muted-foreground"
                  }`}>
                    {isEnglish ? "Selected courses:" : "المواد المختارة:"}{" "}
                    {selected.length} / {eligibility?.maxCourses ?? 0}
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button
                    disabled={submitting}
                    onClick={() => setSubmitConfirmationOpen(true)}
                    className="flex items-center gap-1.5 h-11 text-xs font-semibold bg-primary hover:bg-primary/80 text-primary-foreground transition-all cursor-pointer shadow-md"
                  >
                    <Send className="h-4 w-4" />
                    {isEnglish ? "Submit registration" : "تأكيد وحفظ المقررات"}
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </motion.div>
      )}

      {latestRegistration && !isAlreadyRegistered && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <Card className="p-5 bg-card/45 backdrop-blur-sm border-border/70 shadow-[var(--shadow-glow)] hover:border-primary/30 transition-all duration-300 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
                <FileText className="h-5 w-5" />
              </div>
              <div className="space-y-0.5">
                <p className="text-sm font-bold text-foreground">
                  {isEnglish ? "Latest Registration Slip" : "آخر تسجيل للمواد"}
                </p>
                <p className="text-xs text-muted-foreground truncate max-w-sm">
                  {latestRegistration.courses.join(", ")} ·{" "}
                  {latestRegistration.totalCreditHours}{" "}
                  {isEnglish ? "hours" : "ساعات"} ·{" "}
                  {(() => {
                    const s = latestRegistration.status?.toLowerCase();
                    if (s === "approved") return isEnglish ? "Approved" : "معتمد";
                    if (s === "pending") return isEnglish ? "Pending" : "قيد المراجعة";
                    if (s === "registered") return isEnglish ? "Registered" : "مسجل";
                    return latestRegistration.status;
                  })()}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => printRegistration(latestRegistration, "view")}
                className="h-10 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Eye className="h-4 w-4" />
                {isEnglish ? "View" : "عرض"}
              </Button>
              <Button
                onClick={() => printRegistration(latestRegistration, "print")}
                className="h-10 text-xs font-semibold bg-primary hover:bg-primary/80 text-primary-foreground transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Printer className="h-4 w-4" />
                {isEnglish ? "Print" : "طباعة"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => printRegistration(latestRegistration, "download")}
                className="h-10 text-xs font-semibold bg-secondary hover:bg-secondary/80 text-foreground transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <FileText className="h-4 w-4" />
                {isEnglish ? "Download PDF" : "تحميل PDF"}
              </Button>
            </div>
          </Card>
        </motion.div>
      )}

      {(registrationHistoryQuery.data?.length ?? 0) > 0 && (
        <Card className="space-y-4 border-border/70 bg-card/45 p-5">
          <div className="flex items-center gap-3 border-b border-border pb-4">
            <FileText className="h-5 w-5 text-primary" />
            <div>
              <h3 className="font-bold">
                {isEnglish ? "Saved registration history" : "سجل التسجيلات المحفوظة"}
              </h3>
              <p className="text-xs text-muted-foreground">
                {isEnglish
                  ? "View, print, or download any previous registration slip."
                  : "يمكنك عرض أو طباعة أو تنزيل أي استمارة تسجيل سابقة."}
              </p>
            </div>
          </div>
          <div className="space-y-3">
            {registrationHistoryQuery.data?.map((registration) => (
              <div
                key={registration._id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-secondary/20 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-semibold">
                    {registration.academicYear} · {localizeSemester(registration.semester, isEnglish)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {registration.courses.join(", ")} · {registration.totalCreditHours}{" "}
                    {isEnglish ? "hours" : "ساعة"} · {localizeRegistrationStatus(registration.status, isEnglish)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => printRegistration(registration, "view")}>
                    <Eye className="me-1 h-4 w-4" /> {isEnglish ? "View" : "عرض"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => printRegistration(registration, "print")}>
                    <Printer className="me-1 h-4 w-4" /> {isEnglish ? "Print" : "طباعة"}
                  </Button>
                  <Button size="sm" onClick={() => printRegistration(registration, "download")}>
                    <FileText className="me-1 h-4 w-4" /> {isEnglish ? "Download" : "تنزيل"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Dialog open={submitConfirmationOpen} onOpenChange={setSubmitConfirmationOpen}>
        <DialogContent className="max-w-lg" dir={isEnglish ? "ltr" : "rtl"}>
          <DialogHeader>
            <DialogTitle>
              {directSelectionValid
                ? isEnglish
                  ? "Confirm final registration"
                  : "تأكيد التسجيل النهائي"
                : isEnglish
                  ? "Incomplete course selection"
                  : "اختيار المقررات غير مكتمل"}
            </DialogTitle>
          </DialogHeader>
          {directSelectionValid ? (
            <div className="space-y-4 text-sm">
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-700 dark:text-amber-200">
                {isEnglish
                  ? "This is your only submission for this academic term. After confirmation, the registration cannot be edited."
                  : "هذا هو الإرسال الوحيد المسموح به لهذا الفصل الدراسي. بعد التأكيد لن يمكن تعديل التسجيل."}
              </div>
              <p>
                {isEnglish
                  ? `${selected.length} courses · ${selectedHours} credit hours`
                  : `${selected.length} مقررات · ${selectedHours} ساعة معتمدة`}
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setSubmitConfirmationOpen(false)}>
                  {isEnglish ? "Cancel" : "إلغاء"}
                </Button>
                <Button disabled={submitting} onClick={submitRegistration}>
                  {submitting
                    ? isEnglish
                      ? "Submitting..."
                      : "جارٍ الإرسال..."
                    : isEnglish
                      ? "Confirm final submission"
                      : "تأكيد الإرسال النهائي"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 text-sm">
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-700 dark:text-red-200">
                {selectionRequirementText}
              </div>
              <p className="text-muted-foreground">
                {isEnglish
                  ? "If you cannot take all available courses, continue to Academic Advising for review."
                  : "إذا تعذر عليك تسجيل جميع المقررات، انتقل إلى الإرشاد الأكاديمي لمراجعة حالتك."}
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setSubmitConfirmationOpen(false)}>
                  {isEnglish ? "Return to selection" : "العودة للاختيار"}
                </Button>
                <Button disabled={requestingAdvising} onClick={requestAcademicAdvising}>
                  {requestingAdvising
                    ? isEnglish
                      ? "Opening..."
                      : "جارٍ الفتح..."
                    : isEnglish
                      ? "Go to Academic Advising"
                      : "الانتقال إلى الإرشاد الأكاديمي"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={viewSlipOpen} onOpenChange={setViewSlipOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isEnglish ? "Registration Slip Preview" : "معاينة استمارة تسجيل المقررات"}
            </DialogTitle>
          </DialogHeader>
          {activeSlipForm && (
            <RegistrationSlipView form={activeSlipForm} locale={locale} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
