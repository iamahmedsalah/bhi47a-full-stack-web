import axios from 'axios';

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
const apiBaseUrl = trimmedApiBaseUrl.endsWith('/api')
  ? trimmedApiBaseUrl
  : `${trimmedApiBaseUrl}/api`;

const api = axios.create({
  baseURL: apiBaseUrl,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const prefix = `${name}=`;
  return document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
}

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const locale = window.location.pathname.split('/')[1];
    if (locale === 'ar' || locale === 'en') {
      config.headers.set('accept-language', locale);
    }
  }

  const method = config.method?.toUpperCase();
  if (method && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const csrfToken = readCookie('csrf_token');
    if (csrfToken) {
      config.headers.set('x-csrf-token', decodeURIComponent(csrfToken));
    }
  }
  return config;
});

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      // Redirect to login on auth failure (client-side only), but check to prevent infinite loop
      if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
        const locale = window.location.pathname.split('/')[1] || 'ar';
        window.location.href = `/${locale}/login`;
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
