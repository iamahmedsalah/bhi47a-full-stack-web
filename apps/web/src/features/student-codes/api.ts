import api from "@/lib/api";
import type {
  InitializeStudentCodeYearInput,
  RecoverStudentCodeInput,
  StudentCodeAuditResult,
  StudentCodeHistoryResult,
} from "@student-portal/shared";

export interface CodeAuditScope {
  academicYear: string;
  yearPrefix: string;
}
export async function getCodeAudit(
  params: CodeAuditScope & {
    page: number;
    limit: number;
    status?: string;
    search?: string;
  },
) {
  return (
    await api.get<StudentCodeAuditResult>("/admin/student-codes/audit", {
      params,
    })
  ).data;
}
export async function initializeCodeYear(
  input: InitializeStudentCodeYearInput,
) {
  return (await api.post("/admin/student-codes/years/initialize", input)).data;
}
export async function recoverStudentCode(
  code: string,
  input: RecoverStudentCodeInput,
) {
  return (await api.post(`/admin/student-codes/${code}/recover`, input)).data;
}
export async function getCodeHistory(code: string, page = 1) {
  return (
    await api.get<StudentCodeHistoryResult>(
      `/admin/student-codes/${code}/history`,
      { params: { page, limit: 20 } },
    )
  ).data;
}
