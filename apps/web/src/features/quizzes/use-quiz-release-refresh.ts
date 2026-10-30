'use client';

import { useEffect } from 'react';
import { nextQuizReleaseDelay } from './release-utils';
import type { ReleaseDeadline } from './release-utils';

export function useQuizReleaseRefresh(
  snapshot: { quizzes: ReleaseDeadline[]; serverTime: string; receivedAt: number } | undefined,
  refetch: (options?: { cancelRefetch?: boolean }) => Promise<unknown>,
) {
  useEffect(() => {
    if (!snapshot) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (timer !== undefined) clearTimeout(timer);
      if (document.visibilityState === 'hidden') return;
      const parsed = Date.parse(snapshot.serverTime);
      const serverNow = Number.isFinite(parsed) ? parsed + performance.now() - snapshot.receivedAt : Date.now();
      const delay = nextQuizReleaseDelay(snapshot.quizzes, serverNow);
      if (delay !== undefined) timer = setTimeout(() => { void refetch({ cancelRefetch: false }); }, delay);
    };
    const onVisible = () => {
      if (document.visibilityState !== 'hidden') void refetch({ cancelRefetch: false });
      else if (timer !== undefined) clearTimeout(timer);
    };
    schedule();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      if (timer !== undefined) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [snapshot, refetch]);
}
