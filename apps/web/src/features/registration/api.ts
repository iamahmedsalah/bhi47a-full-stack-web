import api from '@/lib/api';
import type { PrintableRegistrationForm } from '@/lib/registration-print';

export interface Course {
  _id: string;
  code: string;
  name: string;
  nameAr?: string;
  nameEn?: string;
  prerequisites?: string[];
  creditHours?: number;
  type?: 'required' | 'elective';
}

export interface AdvisingRequest {
  _id: string;
  status: string;
  reason: string;
  autoSuggestedCourses: string[];
  staffApprovedCourses: string[];
  staffNotes?: string;
  assignedStaffId?: { name?: string; email?: string };
}

export interface Eligibility {
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

export interface Registration {
  _id: string;
  courses: string[];
  totalCreditHours: number;
  source: string;
  status: string;
  academicYear?: string;
  semester?: 'first' | 'second' | 'summer';
  approvedBy?: { name?: string; email?: string };
}

export interface ApprovedAcademicPlan {
  _id: string;
  academicYear: string;
  semester: 'first' | 'second' | 'summer';
  status: string;
  studentAcknowledgedAt?: string;
  selectedCourses: Course[];
  totalCredits: number;
  studentVisibleNotes?: string;
}

export interface AdvisingState {
  request: AdvisingRequest;
  registration: Registration;
  approvedPlan: ApprovedAcademicPlan | null;
}

export const registrationKeys = {
  all: ['registration'] as const,
  eligibility: () => [...registrationKeys.all, 'eligibility'] as const,
  latest: () => [...registrationKeys.all, 'latest'] as const,
  history: () => [...registrationKeys.all, 'history'] as const,
  availableCourses: () => [...registrationKeys.all, 'available-courses'] as const,
  advisingStatus: () => [...registrationKeys.all, 'advising-status'] as const,
};

export async function getEligibility(): Promise<Eligibility> {
  const res = await api.get<Eligibility>('/registration/eligibility');
  return res.data;
}

export async function getLatestRegistration(): Promise<Registration | null> {
  const res = await api.get<Registration | null>('/registration/latest');
  return res.data;
}

export async function getRegistrationHistory(): Promise<Registration[]> {
  const res = await api.get<Registration[]>('/registration/history');
  return res.data;
}

export async function getAvailableCourses(): Promise<Course[]> {
  const res = await api.get<{ courses: Course[] }>('/registration/available-courses');
  return res.data.courses;
}

export async function getAdvisingStatus(): Promise<AdvisingState> {
  const res = await api.get<AdvisingState>('/registration/advising-status');
  return res.data;
}

export async function submitDirectRegistration(courseCodes: string[]): Promise<Registration> {
  const res = await api.post<Registration>('/registration/submit', { courseCodes });
  return res.data;
}

export async function requestAdvising(): Promise<void> {
  await api.post('/registration/request-advising');
}

export async function acknowledgeAdvising(): Promise<void> {
  await api.post('/student/advising/acknowledge');
}

export async function submitApprovedPlan(): Promise<Registration> {
  const res = await api.post<Registration>('/registration/submit-approved-plan');
  return res.data;
}

export async function getRegistrationPrintData(id: string): Promise<PrintableRegistrationForm> {
  const res = await api.get<PrintableRegistrationForm>(`/registrations/${id}/print`);
  return res.data;
}
