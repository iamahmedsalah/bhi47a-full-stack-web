import axios, {
  AxiosHeaders,
  type AxiosError,
  type InternalAxiosRequestConfig,
} from 'axios';
import { isPublicRoute } from '@/lib/public-routes';

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
    return Promise.reject(error.response?.data || error);
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
    const message = (payload as ApiErrorPayload).message;
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
