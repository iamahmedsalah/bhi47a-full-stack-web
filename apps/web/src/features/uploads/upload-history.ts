'use client';

import { useSyncExternalStore, useCallback } from 'react';
import type { UploadCatalogType } from './types';

export interface UploadHistoryEntry {
  id: string;
  fileName: string;
  catalogType: UploadCatalogType;
  uploadedAt: string; // ISO string
  fileSizeBytes?: number;
  successCount: number;
  failedCount: number;
  totalRows: number;
  status: 'success' | 'partial' | 'failed';
  allowDuplicateStudentCode?: boolean;
}

const STORAGE_KEY = 'sp_upload_history_v1';
const MAX_HISTORY_ITEMS = 80;
const HISTORY_CHANGE_EVENT = 'sp_upload_history_changed';

let cachedHistory: UploadHistoryEntry[] = [];
let cachedRaw: string | null = null;
const EMPTY_HISTORY: UploadHistoryEntry[] = [];

/**
 * Reads upload history safely from localStorage.
 */
export function getUploadHistory(): UploadHistoryEntry[] {
  if (typeof window === 'undefined') return EMPTY_HISTORY;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      cachedRaw = null;
      cachedHistory = EMPTY_HISTORY;
      return EMPTY_HISTORY;
    }
    if (raw === cachedRaw) {
      return cachedHistory;
    }
    cachedRaw = raw;
    const parsed = JSON.parse(raw);
    cachedHistory = Array.isArray(parsed) ? parsed : EMPTY_HISTORY;
    return cachedHistory;
  } catch {
    return EMPTY_HISTORY;
  }
}

/**
 * Saves a new upload entry to localStorage and notifies listeners.
 */
export function saveUploadHistoryEntry(
  entry: Omit<UploadHistoryEntry, 'id' | 'uploadedAt'>,
): UploadHistoryEntry {
  const newEntry: UploadHistoryEntry = {
    ...entry,
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    uploadedAt: new Date().toISOString(),
  };

  if (typeof window !== 'undefined') {
    try {
      const existing = getUploadHistory();
      const updated = [newEntry, ...existing.filter((item) => item.id !== newEntry.id)].slice(
        0,
        MAX_HISTORY_ITEMS,
      );
      const str = JSON.stringify(updated);
      cachedRaw = str;
      cachedHistory = updated;
      localStorage.setItem(STORAGE_KEY, str);
      window.dispatchEvent(new CustomEvent(HISTORY_CHANGE_EVENT, { detail: updated }));
    } catch {
      // Storage quota or disabled, ignore safely
    }
  }

  return newEntry;
}

/**
 * Clears all upload history.
 */
export function clearUploadHistory(): void {
  if (typeof window !== 'undefined') {
    try {
      cachedRaw = null;
      cachedHistory = EMPTY_HISTORY;
      localStorage.removeItem(STORAGE_KEY);
      window.dispatchEvent(new CustomEvent(HISTORY_CHANGE_EVENT, { detail: EMPTY_HISTORY }));
    } catch {
      // ignore
    }
  }
}

/**
 * Removes a single entry from history.
 */
export function removeUploadHistoryEntry(id: string): void {
  if (typeof window !== 'undefined') {
    try {
      const existing = getUploadHistory();
      const updated = existing.filter((item) => item.id !== id);
      const str = JSON.stringify(updated);
      cachedRaw = str;
      cachedHistory = updated;
      localStorage.setItem(STORAGE_KEY, str);
      window.dispatchEvent(new CustomEvent(HISTORY_CHANGE_EVENT, { detail: updated }));
    } catch {
      // ignore
    }
  }
}

function subscribeHistory(callback: () => void) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(HISTORY_CHANGE_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(HISTORY_CHANGE_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}

/**
 * React hook to access and manage upload history with automatic reactivity.
 */
export function useUploadHistory(filterCatalog?: UploadCatalogType) {
  const history = useSyncExternalStore(
    subscribeHistory,
    getUploadHistory,
    () => EMPTY_HISTORY,
  );

  const filteredHistory = filterCatalog
    ? history.filter((item) => item.catalogType === filterCatalog)
    : history;

  const recordUpload = useCallback(
    (entry: Omit<UploadHistoryEntry, 'id' | 'uploadedAt'>) => {
      return saveUploadHistoryEntry(entry);
    },
    [],
  );

  const clearHistory = useCallback(() => {
    clearUploadHistory();
  }, []);

  const removeEntry = useCallback((id: string) => {
    removeUploadHistoryEntry(id);
  }, []);

  return {
    history: filteredHistory,
    allHistory: history,
    isLoaded: true,
    recordUpload,
    clearHistory,
    removeEntry,
  };
}
