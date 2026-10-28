'use client';

import { useCallback, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export interface TableStateOptions<TFilters extends Record<string, string>> {
  defaultFilters: TFilters;
  defaultPage?: number;
  defaultLimit?: number;
}

export function useTableState<TFilters extends Record<string, string>>({
  defaultFilters,
  defaultPage = 1,
  defaultLimit = 20,
}: TableStateOptions<TFilters>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Local selection state (row selection is ephemeral per session/view)
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);

  const page = Number(searchParams?.get('page')) || defaultPage;
  const limit = Number(searchParams?.get('limit')) || defaultLimit;
  const search = searchParams?.get('search') ?? '';

  const filters = Object.keys(defaultFilters).reduce((acc, key) => {
    acc[key as keyof TFilters] =
      (searchParams?.get(key) as TFilters[keyof TFilters]) ?? defaultFilters[key];
    return acc;
  }, {} as TFilters);

  const updateUrl = useCallback(
    (params: URLSearchParams) => {
      const query = params.toString();
      const newUrl = query ? `${pathname}?${query}` : pathname;
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', newUrl);
      }
      startTransition(() => {
        router.replace(newUrl, { scroll: false });
      });
    },
    [pathname, router],
  );

  const setPage = useCallback(
    (newPage: number) => {
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      if (newPage <= 1) {
        params.delete('page');
      } else {
        params.set('page', String(newPage));
      }
      setSelectedKeys([]);
      updateUrl(params);
    },
    [searchParams, updateUrl],
  );

  const setLimit = useCallback(
    (newLimit: number) => {
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      if (newLimit === defaultLimit) {
        params.delete('limit');
      } else {
        params.set('limit', String(newLimit));
      }
      params.delete('page');
      setSelectedKeys([]);
      updateUrl(params);
    },
    [defaultLimit, searchParams, updateUrl],
  );

  const setSearch = useCallback(
    (newSearch: string) => {
      const currentSearch = (searchParams?.get('search') ?? '').trim();
      const trimmed = newSearch.trim();
      if (trimmed === currentSearch) {
        return;
      }
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      if (!trimmed) {
        params.delete('search');
      } else {
        params.set('search', trimmed);
      }
      params.delete('page');
      updateUrl(params);
    },
    [searchParams, updateUrl],
  );

  const setFilter = useCallback(
    <K extends keyof TFilters>(key: K, value: TFilters[K] | undefined | null) => {
      const currentVal = searchParams?.get(String(key)) ?? defaultFilters[key] ?? '';
      const strVal = value !== undefined && value !== null ? String(value) : '';
      if (strVal === currentVal) {
        return;
      }
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      if (!strVal || strVal === 'all' || strVal === defaultFilters[key]) {
        params.delete(String(key));
      } else {
        params.set(String(key), strVal);
      }
      params.delete('page');
      updateUrl(params);
    },
    [defaultFilters, searchParams, updateUrl],
  );

  const resetAll = useCallback(() => {
    setSelectedKeys([]);
    updateUrl(new URLSearchParams());
  }, [updateUrl]);

  return {
    page,
    limit,
    search,
    filters,
    selectedKeys,
    setSelectedKeys,
    isPending,
    setPage,
    setLimit,
    setSearch,
    setFilter,
    resetAll,
  };
}
