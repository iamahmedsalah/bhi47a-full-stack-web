import axios, {
  AxiosHeaders,
  type AxiosError,
  type InternalAxiosRequestConfig,
} from 'axios';
import { isPublicRoute } from '@/lib/public-routes';
import { retryAfterDeadline } from './query-retry-policy';
import { reportedNetworkType } from './session-presentation';

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  timestamp: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiErrorPayload {
  retryAfterAt?: number;
  success?: false;
  statusCode?: number;
  message?: string | string[];
  error?: string;
  code?: string;
  operation?: string;
  reason?: string;
  path?: string;
  timestamp?: string;
  errors?: unknown;
  details?: Record<string, unknown>;
}

export interface ApiErrorDetails {
  message: string;
  statusCode?: number;
  code?: string;
  reason?: string;
  path?: string;
  timestamp?: string;
  errors?: unknown;
}

const rawApiBaseUrl =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
const trimmedApiBaseUrl = rawApiBaseUrl.replace(/\/+$/, '');
export const apiBaseUrl = trimmedApiBaseUrl.endsWith('/api')
  ? trimmedApiBaseUrl
  : `${trimmedApiBaseUrl}/api`;

const api = axios.create({
  baseURL: apiBaseUrl,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

const CSRF_STORAGE_KEY = 'student_portal_csrf_token';
let csrfTokenMemory: string | undefined;

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const prefix = `${name}=`;
  return document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
}

function readStoredCsrfToken(): string | undefined {
  if (csrfTokenMemory) return csrfTokenMemory;
  if (typeof window === 'undefined') return undefined;

  try {
    const token = window.localStorage.getItem(CSRF_STORAGE_KEY) ?? undefined;
    csrfTokenMemory = token;
    return token;
  } catch {
    // Storage blocked (private mode / in-app browser): fall back to memory only.
    return undefined;
  }
}

function writeStoredCsrfToken(token: string | undefined) {
  csrfTokenMemory = token;
  if (typeof window === 'undefined') return;

  try {
    if (token) {
      window.localStorage.setItem(CSRF_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(CSRF_STORAGE_KEY);
    }
  } catch {
    // Ignore storage failures; the in-memory token is still used.
  }
}

function readCsrfToken(): string | undefined {
  const cookieToken = readCookie('csrf_token');
  if (cookieToken) {
    const decodedToken = decodeURIComponent(cookieToken);
    writeStoredCsrfToken(decodedToken);
    return decodedToken;
  }

  return readStoredCsrfToken();
}

function syncCsrfTokenFromResponse(data: unknown) {
  if (!isRecord(data)) return;
  const payload = isRecord(data.data) ? data.data : data;
  const csrfToken = readString(payload, 'csrfToken');
  if (csrfToken) {
    writeStoredCsrfToken(csrfToken);
  }
}

async function refreshCsrfToken() {
  const response = await axios.get<ApiEnvelope<{ csrfToken: string }>>(
    `${apiBaseUrl}/auth/csrf`,
    { withCredentials: true },
  );
  const csrfToken = response.data.data.csrfToken;
  writeStoredCsrfToken(csrfToken);
  return csrfToken;
}

function isUnsafeMethod(method: string | undefined) {
  return !!method && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase());
}

type RetriableAxiosConfig = InternalAxiosRequestConfig & {
  _csrfRetry?: boolean;
  _reauthRetry?: boolean;
};

const reauthHandlers: Array<(operation: string) => Promise<void>> = [];
export function registerReauthenticationHandler(handler: (operation: string) => Promise<void>) {
  reauthHandlers.push(handler);
  return () => { const index = reauthHandlers.indexOf(handler); if (index >= 0) reauthHandlers.splice(index, 1); };
}

function isInvalidCsrfError(error: AxiosError<ApiErrorPayload>) {
  if (error.response?.status !== 403) return false;
  const message = normalizeErrorMessage(error.response.data?.message);
  return message === 'Invalid CSRF token';
}

api.interceptors.request.use((config) => {
  const headers = AxiosHeaders.from(config.headers);

  // If payload is FormData, remove Content-Type so browser can set multipart boundary
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    headers.delete('content-type');
  }

  if (typeof window !== 'undefined') {
    const locale = window.location.pathname.split('/')[1];
    if (locale === 'ar' || locale === 'en') {
      headers.set('accept-language', locale);
    }
    if (config.url?.startsWith('/auth/')) {
      const networkType = reportedNetworkType(navigator as Navigator & { connection?: { type?: string } });
      if (networkType) headers.set('x-client-network-type', networkType);
    }
  }

  if (isUnsafeMethod(config.method)) {
    const csrfToken = readCsrfToken();
    if (csrfToken) {
      headers.set('x-csrf-token', csrfToken);
    }
  }
  config.headers = headers;
  return config;
});

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => {
    syncCsrfTokenFromResponse(response.data);
    if (response.config.url?.includes('/auth/logout')) {
      writeStoredCsrfToken(undefined);
    }
    return response.data;
  },
  async (error: AxiosError<ApiErrorPayload>) => {
    const originalConfig = error.config as RetriableAxiosConfig | undefined;
    const handler = reauthHandlers.at(-1);
    if (originalConfig && handler && error.response?.status === 403 && error.response.data.code === 'AUTH_REAUTH_REQUIRED' && typeof error.response.data.operation === 'string' && !originalConfig._reauthRetry) {
      originalConfig._reauthRetry = true;
      try { await handler(error.response.data.operation); return api.request(originalConfig); }
      catch (reauthError) { return Promise.reject(reauthError); }
    }
    if (
      originalConfig &&
      isUnsafeMethod(originalConfig.method) &&
      !originalConfig._csrfRetry &&
      isInvalidCsrfError(error)
    ) {
      originalConfig._csrfRetry = true;
      try {
        const csrfToken = await refreshCsrfToken();
        const headers = AxiosHeaders.from(originalConfig.headers);
        headers.set('x-csrf-token', csrfToken);
        originalConfig.headers = headers;
        return api.request(originalConfig);
      } catch {
        // CSRF refresh failed: surface the original 403 rather than a masking error.
        return Promise.reject(error.response?.data || error);
      }
    }

    // AuthProvider owns bootstrap redirects. A hard reload for its /me probe
    // mounts it again on the login page and creates another anonymous 401.
    if (error.response?.status === 401 && originalConfig?.url !== '/auth/me') {
      // Redirect to login on auth failure (client-side only), but check to prevent infinite loop
      if (
        typeof window !== 'undefined' &&
        !isPublicRoute(window.location.pathname)
      ) {
        const pathname = window.location.pathname;
        const locale = pathname.split('/')[1] || 'ar';
        const targetLogin = pathname.startsWith(`/${locale}/admin`)
          ? `/${locale}/login/admin`
          : `/${locale}/login/student`;
        window.location.href = targetLogin;
      }
    }
    const payload = error.response?.data;
    const deadline = retryAfterDeadline(error.response?.headers?.['retry-after']);
    // Keep the existing error payload shape, while preserving lost HTTP metadata.
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      return Promise.reject({ ...payload, statusCode: payload.statusCode ?? error.response?.status, ...(deadline !== undefined ? { retryAfterAt: deadline } : {}) });
    }
    return Promise.reject(error);
  },
);

export default api;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readNumber(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function getErrorPayload(error: unknown): Record<string, unknown> | undefined {
  if (!isRecord(error)) return undefined;

  const response = error.response;
  if (isRecord(response) && isRecord(response.data)) {
    return response.data;
  }

  return error;
}

function normalizeErrorMessage(message: unknown) {
  if (Array.isArray(message)) {
    return message
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .join(', ');
  }

  return typeof message === 'string' && message.trim() ? message.trim() : undefined;
}

export function getApiErrorDetails(error: unknown, fallback = 'Something went wrong'): ApiErrorDetails {
  const payload = getErrorPayload(error);

  if (!payload) {
    if (error instanceof Error) {
      return {
        message: error.message || fallback,
        code: error.name,
        reason: error.message || fallback,
      };
    }

    return {
      message: fallback,
      reason: fallback,
    };
  }

  const statusCode = readNumber(payload, 'statusCode') ?? readNumber(payload, 'status');
  const message = normalizeErrorMessage(payload.message) ?? readString(payload, 'detail') ?? fallback;
  const backendCode = readString(payload, 'code') ?? readString(payload, 'error');
  const code = backendCode ?? (statusCode ? `HTTP ${statusCode}` : undefined);
  const explicitReason = readString(payload, 'reason') ?? readString(payload, 'cause') ?? backendCode;
  const reason = explicitReason && explicitReason !== code ? explicitReason : message;

  return {
    message,
    statusCode,
    code,
    reason,
    path: readString(payload, 'path'),
    timestamp: readString(payload, 'timestamp'),
    errors: payload.errors,
  };
}

const ERROR_TRANSLATIONS: Record<string, { ar: string; en: string }> = {
  'This student has admission/code history. Cancel the approved enrollment in Admissions instead of deleting the identity. The code remains held': {
    ar: 'لهذا الطالب سجل قبول وملكية كود. ألغِ القيد من صفحة القبول بدلًا من حذف الهوية. يظل الكود محجوزًا لصاحبه.',
    en: 'This student has admission history. Cancel the enrollment in Admissions; the original identity and code are retained.',
  },
  'This code is managed by Admissions. Approve a new or transfer application to allocate its code safely': {
    ar: 'تدير منظومة القبول هذا الكود. وافق على طلب طالب جديد أو محول لتخصيص الكود بأمان.',
    en: 'This code is managed by Admissions. Approve a new or transfer application to allocate it safely.',
  },
  'Something went wrong': {
    ar: 'حدث خطأ غير متوقع، يرجى المحاولة لاحقاً',
    en: 'Something went wrong, please try again later',
  },
  'Your account has been suspended from submitting new complaints': {
    ar: 'تم إيقاف حسابك عن تقديم شكاوى أو بلاغات جديدة',
    en: 'Your account has been suspended from submitting new complaints',
  },
  'Student information could not be verified': {
    ar: 'تعذر التحقق من صحة بيانات الطالب أو الرقم القومي',
    en: 'Student information could not be verified',
  },
  'Complaints system is currently closed by the administration': {
    ar: 'منظومة الشكاوى مغلقة حالياً من قبل إدارة المعهد',
    en: 'Complaints system is currently closed by the administration',
  },
  'Student not found': {
    ar: 'الطالب غير موجود',
    en: 'Student not found',
  },
  'Invalid CSRF token': {
    ar: 'انتهت صلاحية رمز الأمان، يرجى إعادة المحاولة',
    en: 'Security token expired. Please retry',
  },
  'Account not found': {
    ar: 'الحساب غير موجود',
    en: 'Account not found',
  },
  'Verification code (OTP) expired': {
    ar: 'انتهت صلاحية رمز التحقق (OTP)',
    en: 'Verification code (OTP) expired',
  },
  'Invalid verification code (OTP)': {
    ar: 'رمز التحقق (OTP) غير صحيح',
    en: 'Invalid verification code (OTP)',
  },
  'Password recovery was not requested or verification code expired': {
    ar: 'لم يتم طلب استعادة كلمة المرور أو انتهت صلاحية الرمز',
    en: 'Password recovery was not requested or verification code expired',
  },
  'Internal server error': {
    ar: 'حدث خطأ في الخادم أثناء معالجة البيانات، يرجى التحقق من الملف والمحاولة مرة أخرى',
    en: 'Internal server error while processing request. Please check your data and try again',
  },
  'Only xlsx, xls, or csv files are allowed': {
    ar: 'يُسمح فقط برفع ملفات بصيغة XLSX أو XLS أو CSV',
    en: 'Only XLSX, XLS, or CSV files are allowed',
  },
  'Only PNG, JPG, WEBP, or PDF files are allowed': {
    ar: 'يُسمح فقط برفع ملفات الصور (PNG, JPG, WEBP) أو PDF',
    en: 'Only PNG, JPG, WEBP, or PDF files are allowed',
  },
  'Please select an image to upload': {
    ar: 'يرجى اختيار صورة أو ملف لرفعه',
    en: 'Please select a file to upload',
  },
  'File too large': {
    ar: 'حجم الملف يتجاوز الحد الأقصى المسموح به (10 ميجابايت)',
    en: 'File size exceeds the maximum allowed limit (10 MB)',
  },
  'Network Error': {
    ar: 'تعذر الاتصال بالخادم، يرجى التحقق من اتصال الإنترنت',
    en: 'Network connection error. Please check your internet connection',
  },
  'Bad Request': {
    ar: 'بيانات الطلب غير صالحة، يرجى مراجعة المدخلات',
    en: 'Invalid request data. Please check your inputs',
  },
  'Invitation expiry must fall inside the admission period': {
    ar: 'تاريخ انتهاء صلاحية الدعوة يجب أن يقع ضمن فترة القبول المحددة',
    en: 'Invitation expiry must fall inside the admission period',
  },
  'Admission encryption must be configured before accepting applications': {
    ar: 'يجب ضبط مفاتيح تشفير القبول في الخادم قبل إنشاء الدعوات',
    en: 'Admission encryption must be configured before accepting applications',
  },
  'Admission encryption must be configured before accepting applications.': {
    ar: 'يجب ضبط مفاتيح تشفير القبول في الخادم قبل إنشاء الدعوات',
    en: 'Admission encryption must be configured before accepting applications',
  },
  'Admission security keys must be configured before accepting applications': {
    ar: 'يجب ضبط مفاتيح أمان القبول في الخادم قبل قبول الطلبات',
    en: 'Admission security keys must be configured before accepting applications',
  },
  'Admission security keys must be configured before accepting applications.': {
    ar: 'يجب ضبط مفاتيح أمان القبول في الخادم قبل قبول الطلبات',
    en: 'Admission security keys must be configured before accepting applications',
  },
  'An active invitation already uses this PIN. Choose another PIN or generate one automatically': {
    ar: 'توجد دعوة نشطة تستخدم رمز الدخول (PIN) هذا بالفعل. يرجى اختيار رمز آخر أو تركه فارغاً لإنشائه تلقائياً',
    en: 'An active invitation already uses this PIN. Choose another PIN or generate one automatically',
  },
  'Admission period not found': {
    ar: 'فترة القبول المحددة غير موجودة',
    en: 'Admission period not found',
  },
  'ROSTER_LIMIT_EXCEEDED': {
    ar: 'تجاوز كشف الطلاب الحد الأقصى المسموح به للرصد في الكشف الواحد',
    en: 'Student roster exceeds the maximum allowed limit for a single sheet',
  },
  'COURSE_LIMIT_EXCEEDED': {
    ar: 'تجاوز عدد المقررات الحد الأقصى المسموح به للعرض (500 مقرر). يرجى التصفية بحسب الفرقة أو الفصل',
    en: 'Course count exceeds the maximum limit (500). Please filter by level or semester',
  },
  'A mark is required': {
    ar: 'الدرجة مطلوبة لهذا الطالب ولا يمكن تركها فارغة في حالة الحضور',
    en: 'A mark is required for this student and cannot be empty when present',
  },
  'This state carries no mark': {
    ar: 'هذه الحالة (غياب / حرمان / معذور) لا تتطلب رصد درجة عددية',
    en: 'This state carries no numerical mark',
  },
  'Setting this state requires control.states.manage': {
    ar: 'تحديد هذه الحالة الخاصة يتطلب صلاحية إدارة الحالات الاستثنائية بالكنترول',
    en: 'Setting this special state requires control states management permission',
  },
  'A reason is required': {
    ar: 'يجب إدخال سبب معتمد مكون من 3 أحرف على الأقل لهذه الحالة',
    en: 'A valid reason of at least 3 characters is required for this state',
  },
  'Student has no approved registration for this course and term': {
    ar: 'الطالب ليس لديه تسجيل أكاديمي معتمد لهذا المقرر في هذا الفصل الدراسي',
    en: 'Student has no approved registration for this course and term',
  },
  'Hide results on the Grades page and reopen the sheet before editing published marks': {
    ar: 'يجب إخفاء النتائج من صفحة الدرجات وإعادة فتح الكشف قبل تعديل درجات منشورة',
    en: 'Hide results on the Grades page and reopen the sheet before editing published marks',
  },
  'Hide this sheet on the Grades page before reopening': {
    ar: 'يجب إلغاء نشر هذا الكشف من صفحة الدرجات أولاً قبل إعادة فتحه للتعديل',
    en: 'Hide this sheet on the Grades page before reopening',
  },
  'ROSTER_OR_SCHEME_CHANGED': {
    ar: 'تم تعديل كشف الطلاب أو لائحة توزيع الدرجات أثناء المراجعة. يرجى إعادة التحميل',
    en: 'The student roster or grading scheme changed during review. Please refresh',
  },
  'COURSEWORK_BREAKDOWN_REQUIRED': {
    ar: 'يجب إدخال تفصيل درجات أعمال السنة (الحضور والاختبارات) لكافة الطلاب المسجلين',
    en: 'Coursework breakdown (attendance and quizzes) is required for all registered students',
  },
  'The value was changed by someone else': {
    ar: 'تم تعديل هذه الدرجة بواسطة مستخدم آخر بالتزامن. يرجى تحديث البيانات',
    en: 'The grade was changed by someone else concurrently. Please refresh',
  },
  'RESULT_INCOMPLETE': {
    ar: 'لا يمكن إرسال الكشف للمراجعة أو الاعتماد قبل استكمال رصد جميع الطلاب المسجلين في المقرر (سواء بدرجة أو بحالة غياب/عذر/حرمان)',
    en: 'Cannot submit or approve the sheet until all registered students have an entered mark or status (absent/excused/banned)',
  },
  'STALE_REVISION': {
    ar: 'تم تحديث الكشف بواسطة مستخدم آخر. يرجى تحديث الصفحة والمحاولة مجدداً',
    en: 'The sheet was updated by another user. Please refresh and try again',
  },
  'INVALID_WORKFLOW_TRANSITION': {
    ar: 'لا يمكن تنفيذ هذا الإجراء في المرحلة الحالية للكشف (تأكد من أن الكشف غير مقفل وفي الحالة المناسبة)',
    en: 'This workflow transition is not allowed in the current sheet state',
  },
  'SHEET_LOCKED': {
    ar: 'هذا الكشف مقفل للقراءة فقط ولا يمكن تعديل درجاته قبل فك القفل',
    en: 'This sheet is locked (read-only) and cannot be edited until unlocked',
  },
  'SHEET_NOT_EDITABLE': {
    ar: 'الكشف غير متاح للتعديل حالياً (مقفل أو قيد المراجعة/معتمد)',
    en: 'This sheet is not editable in its current state (locked, in review, or approved)',
  },
  'SCHEME_CHANGED': {
    ar: 'تغيّرت لائحة توزيع الدرجات أثناء عملك. يرجى تحديث الصفحة ومراجعة المسودة',
    en: 'The grading scheme changed; please refresh and review your draft',
  },
  'PREVIEW_STALE': {
    ar: 'تغيرت بيانات الكشف منذ إنشاء معاينة الاستيراد. يرجى إعادة رفع ومعاينة الملف',
    en: 'The sheet changed since the import preview was created. Please preview again',
  },
  'Preview is stale; preview again': {
    ar: 'تغيرت بيانات الكشف منذ إنشاء المعاينة. يرجى إعادة رفع ومعاينة الملف من جديد',
    en: 'Preview is stale; please upload and preview the file again',
  },
  'Preview expired or inaccessible': {
    ar: 'انتهت صلاحية معاينة الاستيراد (٣٠ دقيقة). يرجى إعادة رفع الملف للمعاينة',
    en: 'Import preview expired or is inaccessible. Please upload the file again',
  },
  'Download the template for this sheet': {
    ar: 'هذا الملف لا يخص هذا الكشف. يرجى تنزيل نموذج الإكسل الخاص بهذا الكشف أولاً',
    en: 'This workbook does not match this sheet. Please download the template for this sheet first',
  },
  'Invalid template headers': {
    ar: 'عناوين أعمدة ملف الإكسل غير مطابقة للنموذج المعتمد. يرجى استخدام النموذج الرسمي للكشف',
    en: 'Invalid template headers. Please use the official Excel template downloaded from this sheet',
  },
  'Invalid XLSX workbook': {
    ar: 'ملف الإكسل غير صالح أو تالف. يرجى التأكد من حفظه بصيغة .xlsx',
    en: 'Invalid XLSX workbook. Please ensure the file is saved as a valid .xlsx document',
  },
  'Upload an XLSX file': {
    ar: 'يرجى رفع ملف إكسل بصيغة .xlsx فقط',
    en: 'Please upload a valid .xlsx Excel file',
  },
  'Maximum 500 rows per import': {
    ar: 'الحد الأقصى للاستيراد في المرة الواحدة هو ٥٠٠ صف',
    en: 'Maximum 500 rows allowed per import',
  },
  'Import between 1 and 500 rows': {
    ar: 'يجب أن يحتوي الملف على صف واحد على الأقل وحتى ٥٠٠ صف كحد أقصى',
    en: 'Please import between 1 and 500 rows',
  },
  'No valid rows': {
    ar: 'لا توجد صفوف صالحة للتطبيق في هذا الملف',
    en: 'No valid rows found to apply in this file',
  },
  'Submitter cannot approve their own sheet': {
    ar: 'لا يمكن لمن قام بإرسال الكشف للمراجعة أن يعتمده بنفسه؛ يتطلب الاعتماد مراجعاً مختلفاً أو مسؤول الكنترول / عميد المعهد',
    en: 'The user who submitted the sheet cannot approve it themselves; an independent reviewer or Dean approval is required',
  },
  'Approve all required component sheets before releasing the final result': {
    ar: 'يجب اعتماد كافة كشوف المكونات المطلوبة (أعمال السنة، الميدتيرم، والنهائي) في الكنترول أولاً قبل إصدار النتيجة النهائية للمقرر',
    en: 'Approve all required component sheets (coursework, midterm, and final) in Control before releasing the final course result',
  },
  'Unapproved release': {
    ar: 'يحتوي الكشف على درجات غير معتمدة في الكنترول؛ يجب اعتماد الكشف أولاً قبل الإصدار',
    en: 'The sheet contains unapproved marks; approve the sheet in Control before releasing',
  },
  'Roster changed; reopen and review the sheet': {
    ar: 'تغيرت قائمة الطلاب المسجلين في المقرر بعد اعتماد الكشف؛ يرجى إعادة فتح الكشف في الكنترول ومراجعته واعتماده مجدداً',
    en: 'The course student roster changed after approval; please reopen, review, and approve the sheet again in Control',
  },
  'Classify historical totals before official final release': {
    ar: 'توجد درجات سابقة غير مصنفة ضمن الكنترول لهذا المقرر؛ يرجى مراجعتها أولاً قبل الإصدار النهائي الرسمي',
    en: 'Legacy unclassified totals exist for this course; please review them before official final release',
  },
  'Missing or deferred components block an official final result': {
    ar: 'توجد مكونات درجات ناقصة أو مؤجلة لبعض الطلاب تمنع إصدار النتيجة النهائية الرسمية',
    en: 'Missing or deferred grade components for some students block releasing the official final result',
  },
  'Release preview changed; preview again': {
    ar: 'تغيرت بيانات الإصدار منذ المعاينة؛ يرجى الضغط على «معاينة الإصدار» مرة أخرى قبل التفعيل',
    en: 'Release preview changed; please click Preview Release again before activating',
  },
  'POLICY_CHANGED': {
    ar: 'تم تعديل سياسة النتيجة بواسطة مستخدم آخر؛ يرجى تحديث الصفحة والمحاولة مرة أخرى',
    en: 'Result policy was modified by another user; please refresh and try again',
  },
  'Policy is frozen after the first release; use a new term for a different policy': {
    ar: 'تم تثبيت سياسة النتيجة بعد أول إصدار رسمي لهذا المقرر في هذا الفصل ولا يمكن تغييرها',
    en: 'Result policy is frozen after the first official release for this course and term',
  },
};

const LOWERCASE_ERROR_TRANSLATIONS = new Map<string, { ar: string; en: string }>(
  Object.entries(ERROR_TRANSLATIONS).map(([k, v]) => [k.toLowerCase(), v]),
);

function localizeErrorMessage(rawMsg: string): string {
  if (typeof window === 'undefined') return rawMsg;
  const isEn = window.location.pathname.startsWith('/en');
  const cleanMsg = rawMsg.replace(/^\.+|\.+$/g, '').trim();
  const entry =
    ERROR_TRANSLATIONS[cleanMsg] ??
    LOWERCASE_ERROR_TRANSLATIONS.get(cleanMsg.toLowerCase());
  if (entry) {
    return isEn ? entry.en : entry.ar;
  }
  if (cleanMsg.toLowerCase().startsWith('uploaded file is too large')) {
    return isEn
      ? cleanMsg
      : 'حجم الملف المرفوع يتجاوز الحد الأقصى المسموح به (10 ميجابايت)';
  }
  return cleanMsg || rawMsg;
}

export function getApiErrorMessage(error: unknown, fallback = 'Something went wrong') {
  const payload = getErrorPayload(error);

  if (payload) {
    const typedPayload = payload as ApiErrorPayload;
    const message = typedPayload.message;
    const details = typedPayload.details;
    if (
      (typedPayload.code === 'RESULT_INCOMPLETE' ||
        message === 'RESULT_INCOMPLETE') &&
      details &&
      typeof details === 'object' &&
      typeof details.rosterSize === 'number'
    ) {
      const isEn =
        typeof window !== 'undefined' &&
        window.location.pathname.startsWith('/en');
      const rosterSize = details.rosterSize;
      const enteredCount =
        typeof details.enteredCount === 'number' ? details.enteredCount : 0;
      const missingCount =
        typeof details.missingCount === 'number'
          ? details.missingCount
          : Math.max(0, rosterSize - enteredCount);
      const invalidCount =
        typeof details.invalidCount === 'number' ? details.invalidCount : 0;
      if (isEn) {
        return `Cannot submit or approve an incomplete sheet: ${enteredCount} of ${rosterSize} registered students have marks or statuses entered (${missingCount} still missing${invalidCount > 0 ? `, and ${invalidCount} invalid` : ''}).`;
      }
      return `لا يمكن إرسال الكشف للمراجعة أو الاعتماد لعدم اكتمال رصد جميع الطلاب المسجلين: تم رصد ${enteredCount} من أصل ${rosterSize} طالباً (يتبقى ${missingCount} بدون درجة أو حالة غياب/عذر${invalidCount > 0 ? `، ويوجد ${invalidCount} بدرجة غير متوافقة` : ''}).`;
    }
    if (Array.isArray(message)) {
      return message.map(localizeErrorMessage).join('، ');
    }
    if (message && typeof message === 'string') {
      const cleaned = message.replace(/^\.+|\.+$/g, '').trim();
      if (
        cleaned.toLowerCase() === 'internal server error' &&
        fallback &&
        fallback !== 'Something went wrong'
      ) {
        return localizeErrorMessage(fallback);
      }
      return localizeErrorMessage(message);
    }
  }

  return localizeErrorMessage(fallback);
}
