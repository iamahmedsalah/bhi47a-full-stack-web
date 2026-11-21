"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getControlCheckpoint, saveControlCheckpoint } from "../api";
import type { ControlCheckpoint } from "../types";

export function useControlCheckpoint(sheetId: string, principalId?: string) {
  const [restore, setRestore] = useState<ControlCheckpoint | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(principalId));
  const [saveError, setSaveError] = useState(false);
  const interacted = useRef(false);
  const queued = useRef<ControlCheckpoint | null>(null);
  const latest = useRef<ControlCheckpoint | null>(null);
  const lastSaved = useRef<ControlCheckpoint | null>(null);
  const sending = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (!principalId || sending.current) return;
    sending.current = true;
    try {
      while (queued.current) {
        const checkpoint = queued.current;
        queued.current = null;
        if (JSON.stringify(lastSaved.current) === JSON.stringify(checkpoint)) {
          setSaveError(false);
          continue;
        }
        try {
          await saveControlCheckpoint(sheetId, principalId, checkpoint);
          lastSaved.current = checkpoint;
          setSaveError(false);
        } catch {
          lastSaved.current = null;
          setSaveError(true);
        }
      }
    } finally {
      sending.current = false;
    }
  }, [principalId, sheetId]);

  const remember = useCallback(
    (checkpoint: ControlCheckpoint, immediate = false) => {
      if (!principalId) return;
      interacted.current = true;
      setIsLoading(false);
      setRestore(null);
      latest.current = checkpoint;
      queued.current = checkpoint;
      clearTimeout(timer.current);
      if (immediate) void flush();
      else timer.current = setTimeout(() => void flush(), 400);
    },
    [flush, principalId],
  );

  useEffect(() => {
    if (!principalId) return;
    const controller = new AbortController();
    void getControlCheckpoint(sheetId, controller.signal)
      .then((checkpoint) => {
        if (controller.signal.aborted || interacted.current) return;
        lastSaved.current = checkpoint;
        if (checkpoint?.studentId) setRestore(checkpoint);
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    const saveWhenHidden = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    document.addEventListener("visibilitychange", saveWhenHidden);
    return () => {
      controller.abort();
      document.removeEventListener("visibilitychange", saveWhenHidden);
      void flush();
    };
  }, [flush, principalId, sheetId]);

  return {
    restore,
    isLoading,
    setRestore,
    remember,
    saveError,
    retry: () => {
      if (latest.current) remember(latest.current, true);
    },
  };
}
