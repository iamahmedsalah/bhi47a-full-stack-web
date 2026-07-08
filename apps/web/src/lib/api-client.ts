import type { AxiosRequestConfig } from 'axios';
import api, { type ApiEnvelope } from './api';

export type ApiRequestConfig = Omit<AxiosRequestConfig, 'url' | 'method'> & {
  url: string;
  method?: AxiosRequestConfig['method'];
};

export async function apiRequest<T>(
  config: ApiRequestConfig,
): Promise<T> {
  const envelope = await api.request<ApiEnvelope<T>, ApiEnvelope<T>>(config);
  return envelope.data;
}

export function apiGet<T>(
  url: string,
  config?: Omit<ApiRequestConfig, 'url' | 'method'>,
) {
  return apiRequest<T>({ ...config, url, method: 'GET' });
}

export function apiPost<T, TBody = unknown>(
  url: string,
  data?: TBody,
  config?: Omit<ApiRequestConfig, 'url' | 'method' | 'data'>,
) {
  return apiRequest<T>({ ...config, url, method: 'POST', data });
}

export function apiPatch<T, TBody = unknown>(
  url: string,
  data?: TBody,
  config?: Omit<ApiRequestConfig, 'url' | 'method' | 'data'>,
) {
  return apiRequest<T>({ ...config, url, method: 'PATCH', data });
}

export function apiDelete<T = void>(
  url: string,
  config?: Omit<ApiRequestConfig, 'url' | 'method'>,
) {
  return apiRequest<T>({ ...config, url, method: 'DELETE' });
}
