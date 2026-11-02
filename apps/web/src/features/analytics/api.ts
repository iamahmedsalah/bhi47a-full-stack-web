import api from "@/lib/api";
import { downloadFileBlob, EXCEL_MIME_TYPE } from "@/lib/export-utils";
import type {
  AcademicAnalyticsOverview,
  QuizItemAnalytics,
  StaffQuizStats,
  CourseItemAnalytics,
  AnalyticsLocale,
  AnalyticsReportSheet,
} from "@student-portal/shared";

export interface ExportReportParams {
  academicYear?: string;
  semester?: "first" | "second" | "summer";
  department?: string;
  level?: string;
  locale?: AnalyticsLocale;
  includeSubmissions?: boolean;
  sheets?: AnalyticsReportSheet[];
}

/**
 * Downloads the comprehensive multi-sheet Excel report (.xlsx) generated on the server with exceljs.
 */
export async function downloadComprehensiveAnalyticsExcel(
  params: ExportReportParams = {},
): Promise<void> {
  const locale = params.locale || "ar";
  const isAr = locale === "ar";
  const nowStr = new Date().toISOString().slice(0, 10);
  const scope =
    params.sheets?.length === 1
      ? params.sheets[0]
      : params.sheets
        ? "selected"
        : "report";
  const defaultFilename = isAr
    ? `تقرير-التحليلات-الأكاديمية-${params.sheets ? "مختار" : "الشامل"}-${nowStr}.xlsx`
    : `academic-analytics-${scope}-${nowStr}.xlsx`;

  const res = await api.get("/admin/analytics/report/export", {
    params: {
      ...params,
      sheets: params.sheets?.join(","),
      includeSubmissions: params.includeSubmissions ? "true" : "false",
    },
    responseType: "blob",
  });

  await downloadFileBlob(res, defaultFilename, EXCEL_MIME_TYPE);
}

export async function getAcademicAnalyticsOverview(
  params: Omit<ExportReportParams, "includeSubmissions" | "sheets"> = {},
): Promise<AcademicAnalyticsOverview> {
  const res = await api.get<AcademicAnalyticsOverview>(
    "/admin/analytics/overview",
    {
      params,
    },
  );
  return res.data;
}

export async function getQuizzesAnalytics(
  params: Omit<ExportReportParams, "includeSubmissions" | "sheets"> = {},
): Promise<QuizItemAnalytics[]> {
  const res = await api.get<QuizItemAnalytics[]>("/admin/analytics/quizzes", {
    params,
  });
  return res.data;
}

export async function getStaffQuizPerformance(
  params: Omit<ExportReportParams, "includeSubmissions" | "sheets"> = {},
): Promise<StaffQuizStats[]> {
  const res = await api.get<StaffQuizStats[]>(
    "/admin/analytics/staff-quizzes",
    {
      params,
    },
  );
  return res.data;
}

export async function getCoursesAnalytics(
  params: Omit<ExportReportParams, "includeSubmissions" | "sheets"> = {},
): Promise<CourseItemAnalytics[]> {
  const res = await api.get<CourseItemAnalytics[]>("/admin/analytics/courses", {
    params,
  });
  return res.data;
}
