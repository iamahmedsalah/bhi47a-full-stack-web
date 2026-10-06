"use client";

import { Suspense, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Award,
  Download,
  Edit2,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";

import api, { getApiErrorMessage, type PaginatedResponse } from "@/lib/api";
import { downloadExcel } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
import { TableActionButton } from "@/components/ui/table-action-button";
import { TableCell } from "@/components/ui/table";
import {
  deleteGrade,
  listAdminGrades,
  recalculateAcademicProgress,
  saveGrade,
  updateGrade,
  type GradeItem,
} from "@/features/grades/api";
import { GradeFormDialog } from "@/features/grades/components/grade-form-dialog";
import { RecalculateLevelsModal } from "@/features/grades/components/recalculate-levels-modal";
import type { GradeFormValues } from "@/features/grades/schema";

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
  const params = useParams();
  const locale = params.locale as string;
  const isAr = locale === "ar";
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState("midterm");
  const [search, setSearch] = useState("");
  const [selectedCourse, setSelectedCourse] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [selectedGrade, setSelectedGrade] = useState<GradeItem | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isRecalculateOpen, setIsRecalculateOpen] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
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
    ...(search.trim() ? { studentCode: search.trim() } : {}),
    ...(selectedCourse !== "all" ? { courseCode: selectedCourse } : {}),
    ...(selectedStatus !== "all" ? { status: selectedStatus } : {}),
  };

  const gradesQuery = useQuery({
    queryKey: ["grades", queryParams],
    queryFn: () => listAdminGrades(queryParams),
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

  const handleCreate = async (values: GradeFormValues) => {
    setFormLoading(true);
    try {
      await saveGrade(values);
      toast.success(
        isAr ? "تمت إضافة الدرجة بنجاح" : "Grade added successfully",
      );
      setIsAddOpen(false);
      await refreshGrades();
    } catch (error) {
      toast.error(
        getApiErrorMessage(
          error,
          isAr ? "فشل حفظ الدرجة" : "Failed to save grade",
        ),
      );
    } finally {
      setFormLoading(false);
    }
  };

  const handleUpdate = async (values: GradeFormValues) => {
    if (!selectedGrade) return;
    setFormLoading(true);
    try {
      await updateGrade(selectedGrade._id, values);
      toast.success(
        isAr ? "تم تحديث الدرجة بنجاح" : "Grade updated successfully",
      );
      setIsEditOpen(false);
      await refreshGrades();
    } catch (error) {
      toast.error(
        getApiErrorMessage(
          error,
          isAr ? "فشل تحديث الدرجة" : "Failed to update grade",
        ),
      );
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteGrade(id);
      toast.success(
        isAr ? "تم حذف الدرجة بنجاح" : "Grade deleted successfully",
      );
      await refreshGrades();
    } catch (error) {
      toast.error(
        getApiErrorMessage(
          error,
          isAr ? "فشل حذف الدرجة" : "Failed to delete grade",
        ),
      );
    }
  };

  const handleRecalculate = async () => {
    setIsRecalculating(true);
    try {
      await recalculateAcademicProgress();
      toast.success(
        isAr
          ? "تمت إعادة حساب التقدم الأكاديمي"
          : "Academic progress recalculated",
      );
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsRecalculating(false);
    }
  };

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
      render: (item) => (
        <TableCell className="p-4 font-mono font-semibold">
          {item.studentCode}
        </TableCell>
      ),
    },
    {
      key: "studentName",
      header: isAr ? "اسم الطالب" : "Student Name",
      render: (item) => (
        <TableCell className="p-4 font-medium">
          {item.studentName || "—"}
        </TableCell>
      ),
    },
    {
      key: "course",
      header: isAr ? "المقرر" : "Course",
      render: (item) => (
        <TableCell className="p-4 text-muted-foreground">
          {localizedCourseName(item.courseCode, item.courseName)} (
          {item.courseCode})
        </TableCell>
      ),
    },
    {
      key: "grade",
      header: t("gradeValue"),
      render: (item) => {
        const pct =
          item.percentage ??
          (item.maxGrade > 0
            ? Math.round((item.grade / item.maxGrade) * 100)
            : 0);
        const letter =
          item.letterGrade ||
          (pct >= 90
            ? "A+"
            : pct >= 85
              ? "A"
              : pct >= 80
                ? "B+"
                : pct >= 75
                  ? "B"
                  : pct >= 70
                    ? "C+"
                    : pct >= 65
                      ? "C"
                      : pct >= 60
                        ? "D+"
                        : pct >= 50
                          ? "D"
                          : "F");
        return (
          <TableCell className="p-4 font-mono">
            <div className="flex items-center gap-2">
              <span className="font-bold text-primary">
                {item.grade} / {item.maxGrade}
              </span>
              <span className="rounded border border-border bg-secondary/80 px-1.5 py-0.5 text-[11px] font-bold text-foreground">
                {letter} ({pct}%)
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
    {
      key: "actions",
      header: tCommon("actions"),
      className: "text-center",
      render: (item) => (
        <TableCell className="p-4">
          <div className="flex justify-center gap-2">
            <TableActionButton
              variant="primary"
              onClick={() => {
                setSelectedGrade(item);
                setIsEditOpen(true);
              }}
            >
              <Edit2 className="h-4 w-4" />
              {tCommon("edit")}
            </TableActionButton>
            <ConfirmDialog
              title={isAr ? "حذف الدرجة" : "Delete grade"}
              description={
                isAr
                  ? "هل أنت متأكد من حذف هذه الدرجة؟"
                  : "Are you sure you want to delete this grade?"
              }
              confirmLabel={tCommon("delete")}
              cancelLabel={tCommon("cancel")}
              onConfirm={() => void handleDelete(item._id)}
              trigger={
                <TableActionButton variant="danger">
                  <Trash2 className="h-4 w-4" />
                  {tCommon("delete")}
                </TableActionButton>
              }
            />
          </div>
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
        <Button variant="outline" onClick={() => setIsUploadOpen(true)} className="rounded-squircle">
          <UploadCloud className="h-4 w-4" />
          {isAr ? "رفع الدرجات" : "Upload Grades"}
        </Button>
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
        <Button
          variant="outline"
          onClick={() => setIsRecalculateOpen(true)}
          className="rounded-squircle border-sky-500/30 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20"
        >
          <RefreshCw className="h-4 w-4 text-sky-400" />
          {isAr ? "إعادة حساب المستويات" : "Recalculate levels"}
        </Button>
        <Button onClick={() => setIsAddOpen(true)} className="rounded-squircle">
          <Plus className="h-4 w-4" />
          {isAr ? "إضافة درجة" : "Add Grade"}
        </Button>
      </PageTitleBanner>

      <div className="flex gap-2 border-b border-border/70 pb-3">
        {["midterm", "final", "quiz"].map((tab) => (
          <Button
            key={tab}
            variant={activeTab === tab ? "default" : "ghost"}
            onClick={() => {
              setActiveTab(tab);
              setPage(1);
            }}
          >
            {tab.toUpperCase()}
          </Button>
        ))}
      </div>

      <FilterBar
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

      {isAddOpen && (
        <GradeFormDialog
          open={isAddOpen}
          onOpenChange={setIsAddOpen}
          isEditing={false}
          courses={coursesQuery.data ?? []}
          onSubmit={handleCreate}
          isSubmitting={formLoading}
          defaultValues={{ examType: activeTab as GradeFormValues["examType"] }}
        />
      )}
      {isEditOpen && selectedGrade && (
        <GradeFormDialog
          key={selectedGrade._id}
          open={isEditOpen}
          onOpenChange={setIsEditOpen}
          isEditing
          courses={coursesQuery.data ?? []}
          onSubmit={handleUpdate}
          isSubmitting={formLoading}
          defaultValues={selectedGrade as GradeFormValues}
        />
      )}
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
