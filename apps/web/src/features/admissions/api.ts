import api from "@/lib/api";
import type {
  AdmissionPeriodInput,
  AdmissionPeriodItem,
  AdmissionPeriodUpdate,
} from "@student-portal/shared";

export interface AdmissionPeriodList {
  items: AdmissionPeriodItem[];
  total: number;
  totalPages: number;
  page: number;
  limit: number;
}

export async function listAdmissionPeriods(params: {
  page: number;
  limit: number;
  search?: string;
}) {
  const result = await api.get<AdmissionPeriodList>(
    "/admin/admissions/periods",
    { params },
  );
  return result.data;
}
export async function createAdmissionPeriod(input: AdmissionPeriodInput) {
  return (
    await api.post<AdmissionPeriodItem>("/admin/admissions/periods", input)
  ).data;
}
export async function updateAdmissionPeriod(
  id: string,
  input: AdmissionPeriodUpdate,
) {
  return (
    await api.patch<AdmissionPeriodItem>(
      `/admin/admissions/periods/${id}`,
      input,
    )
  ).data;
}

export async function deleteAdmissionPeriod(id: string, revision: number) {
  return (
    await api.delete<{ success: boolean; deletedId: string }>(
      `/admin/admissions/periods/${id}`,
      { data: { revision, confirmed: true } },
    )
  ).data;
}
