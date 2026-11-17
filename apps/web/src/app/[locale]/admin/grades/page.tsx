"use client";
import { ControlReleasePanel } from "@/features/grades/components/control-release-panel";
import { HelpNote } from "@/components/ui/help-note";

import { Suspense, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { normalizeSearchText } from "@/lib/search-text";
import {
  AlertTriangle,
  Award,
  CalendarClock,
  Download,
  Loader2,
  RefreshCw,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";

import api, { getApiErrorMessage, type PaginatedResponse } from "@/lib/api";
import { downloadExcel } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";
import { Button } from "@/components/ui/button";
import {
  DataTableShell,
  type ColumnDef,
} from "@/components/ui/data-table-shell";
import { DataUploadDialog } from "@/components/ui/data-upload-dialog";
import { FilterBar } from "@/components/ui/filter-bar";
import { PageSkeletonLoader } from "@/components/ui/page-suspense-fallback";
import { PageTitleBanner } from "@/components/ui/page-title-banner";
import { PermissionGuard } from "@/components/ui/permission-guard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { TableCell } from "@/components/ui/table";
import { listAdminGrades, type GradeItem } from "@/features/grades/api";
import { RecalculateLevelsModal } from "@/features/grades/components/recalculate-levels-modal";
import { AuditWarningsModal } from "@/features/grades/components/audit-warnings-modal";
import { GradesPublishingModal } from "@/features/grades/components/grades-publishing-modal";
import { HistoricalPublicationModal } from "@/features/grades/components/historical-publication-modal";
import { calculateGradeScale } from "@student-portal/shared";

interface CourseOption {
  _id: string;
  code: string;
  name: string;
  nameAr?: string;
  nameEn?: string;
}

const gradeImportColumns = [
  "studentCode",
  "courseCode",
  "examType",
  "grade",
  "maxGrade",
  "coursework",
  "midterm",
  "practical",
  "final",
  "total",
  "status",
  "academicYear",
  "semester",
];

function GradesPageContent() {
  const t = useTranslations("grades");
  const tCommon = useTranslations("common");
  const tControl = useTranslations("control");
  const params = useParams();
  const locale = params.locale as string;
  const isAr = locale === "ar";
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [activeTab, setActiveTab] = useState("midterm");
  const isControlComponent = [
    "midterm",
    "final",
    "coursework",
    "total",
  ].includes(activeTab);
  // Academic maintenance is independent of Control's restriction on mark editing.
  const canManageAcademicProgress =
    isAdmin ||
    (user?.role === "staff" &&
      Boolean(user.permissions?.includes("grades.write")));
  const canManageVisibility =
    isAdmin || Boolean(user?.permissions?.includes("grades.visibility.manage"));
  const canPublishHistorical =
    isAdmin ||
    (user?.role === "staff" &&
      Boolean(user.permissions?.includes("grades.historical.publish")));
  const canUploadGrades =
    isAdmin || Boolean(user?.permissions?.includes("uploads.import"));

  const [search, setSearch] = useState("");
  const settledSearch = normalizeSearchText(search);
  const [selectedCourse, setSelectedCourse] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isRecalculateOpen, setIsRecalculateOpen] = useState(false);
  const [isAuditWarningsOpen, setIsAuditWarningsOpen] = useState(false);
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [isHistoricalPublishOpen, setIsHistoricalPublishOpen] = useState(false);
  const [sortBy, setSortBy] = useState<string>("studentCode");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const limit = 10;

  const coursesQuery = useQuery({
    queryKey: ["grade-courses"],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<CourseOption>>(
        "/admin/courses",
        {
          params: { page: 1, limit: 100 },
        },
      );
      return response.data.items;
    },
  });

  const queryParams = {
    page,
    limit,
    examType: activeTab,
    sortBy,
    sortOrder,
    ...(settledSearch ? { studentCode: settledSearch } : {}),
    ...(selectedCourse !== "all" ? { courseCode: selectedCourse } : {}),
    ...(selectedStatus !== "all" ? { status: selectedStatus } : {}),
  };

  const gradesQuery = useQuery({
    queryKey: ["grades", queryParams],
    queryFn: ({ signal }) => listAdminGrades(queryParams, signal),
  });

  const grades = gradesQuery.data?.items ?? [];
  const courseByCode = new Map(
    (coursesQuery.data ?? []).map((course) => [course.code, course]),
  );
  const localizedCourseName = (courseCode: string, fallback?: string) => {
    const course = courseByCode.get(courseCode);
    if (!course) return fallback || courseCode;
    return isAr
      ? course.nameAr || course.name || course.nameEn || courseCode
      : course.nameEn || course.name || course.nameAr || courseCode;
  };
  const total = gradesQuery.data?.total ?? 0;
  const totalPages = Math.max(1, gradesQuery.data?.totalPages ?? 1);
  const fromRow = total === 0 ? 0 : (page - 1) * limit + 1;
  const toRow = Math.min(page * limit, total);

  const refreshGrades = () =>
    queryClient.invalidateQueries({ queryKey: ["grades"] });

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const rows: GradeItem[] = [];
      let exportPage = 1;
      let exportTotalPages = 1;
      do {
        const result = await listAdminGrades({
          ...queryParams,
          page: exportPage,
          limit: 100,
        });
        rows.push(...result.items);
        exportTotalPages = result.totalPages || 1;
        exportPage += 1;
      } while (exportPage <= exportTotalPages);

      downloadExcel(
        rows.map((item) => ({
          studentCode: item.studentCode,
          studentName: item.studentName ?? "",
          courseCode: item.courseCode,
          courseName: item.courseName ?? "",
          examType: item.examType,
          grade: item.grade,
          maxGrade: item.maxGrade,
          status: item.status,
          academicYear: item.academicYear,
          semester: item.semester,
          published: item.isPublished ? "Published" : "Hidden",
        })),
        [
          "Student Code",
          "Student Name",
          "Course Code",
          "Course Name",
          "Exam Type",
          "Grade",
          "Max Grade",
          "Status",
          "Academic Year",
          "Semester",
          "Published",
        ],
        `grades_export_${new Date().toISOString().slice(0, 10)}`,
      );
      toast.success(isAr ? "تم تجهيز ملف الدرجات" : "Grades export is ready");
    } catch (error) {
      toast.error(
        getApiErrorMessage(
          error,
          isAr ? "فشل تصدير الدرجات" : "Failed to export grades",
        ),
      );
    } finally {
      setIsExporting(false);
    }
  };

  const columns: ColumnDef<GradeItem>[] = [
    {
      key: "studentCode",
      header: isAr ? "كود الطالب" : "Student Code",
      sortable: true,
      render: (item) => (
        <TableCell className="p-4 font-mono">
          <bdi className="font-semibold text-foreground px-2 py-0.5 rounded-squircle bg-muted/60 border border-border/50 text-xs inline-block">
            {isAdmin || user?.permissions?.includes("students.read") ? (
              <Link
                className="text-primary underline-offset-4 hover:underline focus-visible:underline"
                href={`/${locale}/admin/students?tab=students&profile=${encodeURIComponent(item.studentCode)}&search=${encodeURIComponent(item.studentCode)}`}
              >
                {item.studentCode}
              </Link>
            ) : (
              item.studentCode
            )}
          </bdi>
        </TableCell>
      ),
    },
    {
      key: "studentName",
      header: isAr ? "اسم الطالب" : "Student Name",
      sortable: true,
      render: (item) => (
        <TableCell className="p-4 font-medium text-foreground">
          {item.studentName || "—"}
        </TableCell>
      ),
    },
    {
      key: "course",
      header: isAr ? "المقرر" : "Course",
      sortable: true,
      sortKey: "courseCode",
      render: (item) => (
        <TableCell className="p-4">
          <span className="font-semibold text-foreground block text-xs">
            {localizedCourseName(item.courseCode, item.courseName)}
          </span>
          <bdi className="font-mono text-[11px] text-muted-foreground mt-0.5 inline-block">
            {item.courseCode}
          </bdi>
        </TableCell>
      ),
    },
    {
      key: "grade",
      header: t("gradeValue"),
      sortable: true,
      render: (item) => {
        const pct =
          item.percentage ??
          (item.maxGrade > 0
            ? Math.round((item.grade / item.maxGrade) * 100)
            : 0);
        // Status takes priority over historical/stored letter grades.
        const letter =
          item.status && item.status !== "present"
            ? calculateGradeScale(pct, item.status).letter
            : item.letterGrade || calculateGradeScale(pct).letter;

        let letterBadgeClass = "border-border bg-muted/50 text-foreground";
        if (letter.startsWith("A")) {
          letterBadgeClass =
            "border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold";
        } else if (letter.startsWith("B")) {
          letterBadgeClass =
            "border-teal-500/30 bg-teal-500/15 text-teal-600 dark:text-teal-400 font-bold";
        } else if (letter.startsWith("C")) {
          letterBadgeClass =
            "border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400 font-bold";
        } else if (letter.startsWith("D")) {
          letterBadgeClass =
            "border-orange-500/30 bg-orange-500/15 text-orange-600 dark:text-orange-400 font-bold";
        } else if (letter === "F" || letter === "FX") {
          letterBadgeClass =
            "border-red-500/30 bg-red-500/15 text-red-600 dark:text-red-400 font-bold";
        }

        return (
          <TableCell className="p-4 font-mono">
            <div className="flex items-center gap-2 whitespace-nowrap">
              {item.examType !== "midterm" && (
                <span
                  className={`rounded-squircle border px-2 py-0.5 text-xs font-semibold ${letterBadgeClass}`}
                >
                  {letter}
                </span>
              )}
              <span className="text-xs text-muted-foreground font-mono">
                {item.examType === "midterm"
                  ? `${item.grade} / ${item.maxGrade}`
                  : `(${pct}%)`}
              </span>
            </div>
          </TableCell>
        );
      },
    },
    {
      key: "status",
      header: t("status"),
      render: (item) => (
        <TableCell className="p-4">
          <StatusBadge
            label={item.status}
            variant={
              item.status === "present"
                ? "success"
                : item.status === "absent"
                  ? "warning"
                  : "danger"
            }
          />
        </TableCell>
      ),
    },
    {
      key: "published",
      header: isAr ? "النشر" : "Published",
      render: (item) => (
        <TableCell className="p-4">
          <StatusBadge
            label={
              item.isPublished
                ? isAr
                  ? "منشور"
                  : "Published"
                : isAr
                  ? "مخفي"
                  : "Hidden"
            }
            variant={item.isPublished ? "success" : "danger"}
          />
        </TableCell>
      ),
    },
  ];

  return (
    <div className="animate-fade-in space-y-6 p-2 md:p-6">
      <PageTitleBanner
        title={t("title")}
        icon={<Award className="h-5 w-5" />}
        subtitle={
          isAr
            ? "إدارة درجات الاختبارات والنتائج الأكاديمية للطلاب."
            : "Manage exam grades, results, and student academic progress."
        }
      >
        {canUploadGrades && !isControlComponent && (
          <Button
            variant="outline"
            onClick={() => setIsUploadOpen(true)}
            className="rounded-squircle"
          >
            <UploadCloud className="h-4 w-4" />
            {isAr ? "رفع الدرجات" : "Upload Grades"}
          </Button>
        )}
        <Button
          variant="outline"
          onClick={() => void handleExport()}
          disabled={isExporting}
          className="rounded-squircle"
        >
          {isExporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {isAr ? "تصدير" : "Export"}
        </Button>
        {canPublishHistorical && (
          <Button
            variant="outline"
            className="rounded-squircle"
            onClick={() => setIsHistoricalPublishOpen(true)}
          >
            <UploadCloud className="h-4 w-4" />
            {isAr ? "نشر الدرجات التاريخية" : "Publish historical grades"}
          </Button>
        )}
        {canManageVisibility && (
          <Button variant="outline" onClick={() => setIsPublishModalOpen(true)}>
            <CalendarClock className="h-4 w-4" />
            {isAr
              ? "إتاحة النتائج وجدولتها"
              : "Results visibility and schedule"}
          </Button>
        )}
        {canManageAcademicProgress && (
          <>
            <Button
              variant="outline"
              onClick={() => setIsRecalculateOpen(true)}
              className="rounded-squircle border-sky-500/30 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20"
            >
              <RefreshCw className="h-4 w-4 text-sky-400" />
              {isAr
                ? "إعادة حساب المعدل والمستويات"
                : "Recalculate GPA and levels"}
            </Button>
            <Button
              variant="outline"
              onClick={() => setIsAuditWarningsOpen(true)}
              className="rounded-squircle border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
            >
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              {isAr ? "تدقيق إنذارات الـ CGPA" : "Audit CGPA Warnings"}
            </Button>
          </>
        )}
      </PageTitleBanner>
      {canPublishHistorical && (
        <HistoricalPublicationModal
          open={isHistoricalPublishOpen}
          onOpenChange={setIsHistoricalPublishOpen}
          isAr={isAr}
        />
      )}
      <ControlReleasePanel locale={locale} />
      <HelpNote
        title={isAr ? "ملاحظات إتاحة النتائج" : "Result visibility notes"}
      >
        {tControl("visibilityNote")}
      </HelpNote>

      <div className="flex flex-wrap gap-2 border-b border-border/70 pb-3">
        {[
          {
            key: "final",
            label: isAr ? "الامتحان النهائي" : "Final Exam",
          },
          {
            key: "midterm",
            label: isAr ? "الميدتيرم" : "Midterm Exam",
          },
          {
            key: "coursework",
            label: isAr ? "أعمال السنة" : "Coursework",
          },
        ].map((tab) => (
          <Button
            key={tab.key}
            variant={activeTab === tab.key ? "default" : "outline"}
            className="rounded-squircle font-semibold transition-all px-4"
            onClick={() => {
              setActiveTab(tab.key);
              setPage(1);
            }}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      <FilterBar
        compact
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        searchPlaceholder={
          isAr ? "بحث بكود الطالب..." : "Search by student code..."
        }
      >
        <Select
          value={selectedStatus}
          onValueChange={(value) => {
            setSelectedStatus(value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-45">
            <SelectValue placeholder={t("status")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {isAr ? "كل الحالات" : "All statuses"}
            </SelectItem>
            <SelectItem value="present">{isAr ? "حاضر" : "Present"}</SelectItem>
            <SelectItem value="absent">{isAr ? "غائب" : "Absent"}</SelectItem>
            <SelectItem value="banned">{isAr ? "محروم" : "Banned"}</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={selectedCourse}
          onValueChange={(value) => {
            setSelectedCourse(value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-60">
            <SelectValue placeholder={isAr ? "المقرر" : "Course"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {isAr ? "كل المقررات" : "All courses"}
            </SelectItem>
            {(coursesQuery.data ?? []).map((course) => (
              <SelectItem key={course._id} value={course.code}>
                {course.code} -{" "}
                {isAr
                  ? course.nameAr || course.name
                  : course.nameEn || course.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={`${sortBy}:${sortOrder}`}
          onValueChange={(val) => {
            const [f, o] = val.split(":");
            setSortBy(f);
            setSortOrder(o as "asc" | "desc");
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue placeholder={isAr ? "الترتيب" : "Sort by"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="studentCode:asc">
              {isAr ? "كود الطالب (تصاعدي 1-9)" : "Student Code (Asc 1-9)"}
            </SelectItem>
            <SelectItem value="studentCode:desc">
              {isAr ? "كود الطالب (تنازلي 9-1)" : "Student Code (Desc 9-1)"}
            </SelectItem>
            <SelectItem value="studentName:asc">
              {isAr ? "اسم الطالب (أ - ي)" : "Student Name (A - Z)"}
            </SelectItem>
            <SelectItem value="studentName:desc">
              {isAr ? "اسم الطالب (ي - أ)" : "Student Name (Z - A)"}
            </SelectItem>
            <SelectItem value="grade:desc">
              {isAr ? "الدرجة (الأعلى أولاً)" : "Grade (Highest first)"}
            </SelectItem>
            <SelectItem value="grade:asc">
              {isAr ? "الدرجة (الأقل أولاً)" : "Grade (Lowest first)"}
            </SelectItem>
            <SelectItem value="createdAt:desc">
              {isAr ? "تاريخ الإضافة (الأحدث أولاً)" : "Date Added (Newest)"}
            </SelectItem>
            <SelectItem value="createdAt:asc">
              {isAr ? "تاريخ الإضافة (الأقدم أولاً)" : "Date Added (Oldest)"}
            </SelectItem>
          </SelectContent>
        </Select>
      </FilterBar>

      <p className="text-sm text-muted-foreground">
        {isAr ? "عرض" : "Showing"}{" "}
        <span className="font-bold text-foreground">
          {fromRow}-{toRow}
        </span>{" "}
        {isAr ? "من" : "of"}{" "}
        <span className="font-bold text-foreground">{total}</span>
      </p>

      <DataTableShell
        columns={columns}
        data={grades}
        keyExtractor={(item) => item._id}
        isLoading={gradesQuery.isLoading}
        isError={gradesQuery.isError}
        error={gradesQuery.error}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortChange={(field, order) => {
          setSortBy(field);
          setSortOrder(order);
          setPage(1);
        }}
        emptyMessage={
          isAr
            ? "لا توجد درجات مطابقة للفلاتر."
            : "No grades match the selected filters."
        }
        onRetry={() => void gradesQuery.refetch()}
        retryLabel={tCommon("retry")}
      />

      <div className="flex items-center justify-between rounded-xl border border-border/70 bg-card/70 p-3">
        <Button
          variant="outline"
          size="sm"
          disabled={page === 1 || gradesQuery.isLoading}
          onClick={() => setPage((value) => Math.max(1, value - 1))}
        >
          {tCommon("previous")}
        </Button>
        <span className="font-mono text-sm text-muted-foreground">
          {isAr ? "صفحة" : "Page"} {page} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages || gradesQuery.isLoading}
          onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
        >
          {tCommon("next")}
        </Button>
      </div>

      <DataUploadDialog
        open={isUploadOpen}
        onOpenChange={setIsUploadOpen}
        title={isAr ? "رفع درجات الطلاب" : "Upload Grades"}
        description={
          isAr
            ? "ارفع ملف XLSX أو CSV يحتوي على الدرجات."
            : "Upload an XLSX or CSV file containing grades."
        }
        uploadType="grades"
        expectedColumns={gradeImportColumns}
        onSuccess={() => void refreshGrades()}
      />
      <RecalculateLevelsModal
        open={isRecalculateOpen}
        onOpenChange={setIsRecalculateOpen}
        isAr={isAr}
        onSuccess={() => {
          void refreshGrades();
          void queryClient.invalidateQueries({ queryKey: ["admin-grades"] });
          void queryClient.invalidateQueries({ queryKey: ["advising"] });
          void queryClient.invalidateQueries({ queryKey: ["students"] });
        }}
      />
      <AuditWarningsModal
        open={isAuditWarningsOpen}
        onOpenChange={setIsAuditWarningsOpen}
        isAr={isAr}
        onSuccess={() => {
          void refreshGrades();
          void queryClient.invalidateQueries({ queryKey: ["admin-grades"] });
          void queryClient.invalidateQueries({ queryKey: ["students"] });
          void queryClient.invalidateQueries({ queryKey: ["advising"] });
        }}
      />
      <GradesPublishingModal
        open={isPublishModalOpen}
        onOpenChange={setIsPublishModalOpen}
        isAr={isAr}
      />
    </div>
  );
}

export default function GradesPage() {
  return (
    <Suspense fallback={<PageSkeletonLoader />}>
      <PermissionGuard permission="grades.read">
        <GradesPageContent />
      </PermissionGuard>
    </Suspense>
  );
}
