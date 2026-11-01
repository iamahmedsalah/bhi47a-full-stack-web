import api from "@/lib/api";
import { downloadFileBlob } from "@/lib/export-utils";
import type {
  AdmissionAccessItem,
  AdmissionAccessSecret,
  AdmissionGroupItem,
  AdmissionImportBatch,
  AdmissionPage,
  AdmissionReceipt,
  AdmissionRequestItem,
  AdmissionStatus,
} from "@student-portal/shared";
const base = "/admin/admissions";

function unwrapData<T>(res: any): T {
  if (
    res &&
    typeof res === "object" &&
    "data" in res &&
    res.data !== undefined
  ) {
    return res.data as T;
  }
  return res as T;
}

export async function admissionList<T>(
  kind: "requests" | "groups" | "access",
  params: Record<string, string | number | undefined>,
) {
  const res = await api.get<AdmissionPage<T>>(`${base}/${kind}`, { params });
  return unwrapData<AdmissionPage<T>>(res);
}
export async function admissionDetail(id: string) {
  const res = await api.get<AdmissionRequestItem>(`${base}/requests/${id}`);
  return unwrapData<AdmissionRequestItem>(res);
}
export async function admissionAction(
  id: string,
  action: string,
  input: unknown,
) {
  const res = await api.post(`${base}/requests/${id}/${action}`, input);
  return unwrapData(res);
}
export async function admissionUpdate(id: string, input: unknown) {
  const res = await api.patch(`${base}/requests/${id}`, input);
  return unwrapData(res);
}
export async function admissionDeleteRequest(
  id: string,
  revision: number,
  reason: string,
) {
  return unwrapData(
    await api.delete(`${base}/requests/${id}`, {
      data: { revision, reason, confirmed: true },
    }),
  );
}
export async function admissionAccessCreate(input: unknown) {
  const res = await api.post<AdmissionAccessSecret>(`${base}/access`, input);
  return unwrapData<AdmissionAccessSecret>(res);
}
export async function admissionAccessGetSecret(id: string) {
  const res = await api.get<AdmissionAccessSecret>(
    `${base}/access/${id}/secret`,
  );
  return unwrapData<AdmissionAccessSecret>(res);
}
export async function admissionAccessDelete(id: string) {
  const res = await api.delete<{ success: boolean; deletedId: string }>(
    `${base}/access/${id}`,
  );
  return unwrapData<{ success: boolean; deletedId: string }>(res);
}
export async function admissionAccessRevoke(id: string) {
  const res = await api.post<AdmissionAccessItem>(
    `${base}/access/${id}/revoke`,
    {
      confirmed: true,
    },
  );
  return unwrapData<AdmissionAccessItem>(res);
}
export async function admissionGroupSave(
  id: string | undefined,
  input: unknown,
) {
  const res = id
    ? await api.patch<AdmissionGroupItem>(`${base}/groups/${id}`, input)
    : await api.post<AdmissionGroupItem>(`${base}/groups`, input);
  return unwrapData<AdmissionGroupItem>(res);
}
export async function admissionGroupDelete(id: string) {
  const res = await api.delete<{ success: boolean; message: string }>(
    `${base}/groups/${id}`,
  );
  return unwrapData<{ success: boolean; message: string }>(res);
}
export async function admissionGroupStudents(id: string) {
  const res = await api.get<
    Array<{
      _id: string;
      studentCode: string;
      fullName: string;
      fullNameAr?: string;
      department: string;
      level: string;
      academicYear: string;
      enrollmentStatus: string;
    }>
  >(`${base}/groups/${id}/students`);
  return unwrapData<
    Array<{
      _id: string;
      studentCode: string;
      fullName: string;
      fullNameAr?: string;
      department: string;
      level: string;
      academicYear: string;
      enrollmentStatus: string;
    }>
  >(res);
}
export async function admissionDownload(
  kind: "export" | "template",
  params: Record<string, string | number | undefined> = {},
) {
  const raw = await api.get(`${base}/xlsx/${kind}`, {
    params,
    responseType: "blob",
  });
  await downloadFileBlob(
    raw,
    `admissions-${kind}.xlsx`,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
}
export async function admissionPreview(file: File) {
  const form = new FormData();
  form.append("file", file);
  const res = await api.post<AdmissionImportBatch>(
    `${base}/xlsx/preview`,
    form,
    {
      headers: { "Content-Type": "multipart/form-data" },
    },
  );
  return unwrapData<AdmissionImportBatch>(res);
}
export async function admissionBatch(id: string) {
  const res = await api.get<AdmissionImportBatch>(`${base}/xlsx/batches/${id}`);
  return unwrapData<AdmissionImportBatch>(res);
}
export async function admissionApply(id: string) {
  const res = await api.post<AdmissionImportBatch>(
    `${base}/xlsx/batches/${id}/apply`,
    {
      confirmed: true,
    },
  );
  return unwrapData<AdmissionImportBatch>(res);
}
export async function publicAdmissionValidate(input: unknown) {
  const res = await api.post<{
    admissionSession: string;
    academicYear: string;
    name: string;
    nameAr?: string;
  }>("/public/admissions/validate", input);
  return unwrapData<{
    admissionSession: string;
    academicYear: string;
    name: string;
    nameAr?: string;
  }>(res);
}
export async function publicAdmissionSubmit(input: unknown) {
  const res = await api.post<AdmissionReceipt>(
    "/public/admissions/requests",
    input,
  );
  return unwrapData<AdmissionReceipt>(res);
}
export async function publicAdmissionStatus(input: unknown) {
  const res = await api.post<AdmissionStatus>(
    "/public/admissions/status",
    input,
  );
  return unwrapData<AdmissionStatus>(res);
}
