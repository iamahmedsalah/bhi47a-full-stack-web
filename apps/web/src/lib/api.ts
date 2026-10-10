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

  const token = window.localStorage.getItem(CSRF_STORAGE_KEY) ?? undefined;
  csrfTokenMemory = token;
  return token;
}

function writeStoredCsrfToken(token: string | undefined) {
  csrfTokenMemory = token;
  if (typeof window === 'undefined') return;

  if (token) {
    window.localStorage.setItem(CSRF_STORAGE_KEY, token);
  } else {
    window.localStorage.removeItem(CSRF_STORAGE_KEY);
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
};

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
    if (
      originalConfig &&
      isUnsafeMethod(originalConfig.method) &&
      !originalConfig._csrfRetry &&
      isInvalidCsrfError(error)
    ) {
      originalConfig._csrfRetry = true;
      const csrfToken = await refreshCsrfToken();
      const headers = AxiosHeaders.from(originalConfig.headers);
      headers.set('x-csrf-token', csrfToken);
      originalConfig.headers = headers;
      return api.request(originalConfig);
    }

    if (error.response?.status === 401) {
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

export function getApiErrorMessage(error: unknown, fallback = 'Something went wrong') {
  const payload = getErrorPayload(error);

  if (payload) {
    const message = (payload as ApiErrorPayload).message;
    if (Array.isArray(message)) {
      return message.join(', ');
    }
    if (message) {
      return message;
    }
  }

  return fallback;
}
