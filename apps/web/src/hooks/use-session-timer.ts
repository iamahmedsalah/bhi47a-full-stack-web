'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '@/lib/api';

export const SESSION_MAX_SECONDS = 20 * 60; // 20 minutes (1200s)
export const SESSION_WARN_SECONDS = 2 * 60; // 2 minutes warning (120s)

interface UseSessionTimerOptions {
  role: 'admin' | 'student' | 'staff';
}

export function useSessionTimer({ role }: UseSessionTimerOptions) {
  const params = useParams();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const locale = (params?.locale as string) || 'ar';
  const isAr = locale === 'ar';

  const [remainingSeconds, setRemainingSeconds] = useState(SESSION_MAX_SECONDS);
  // Source of truth for the countdown; state mirrors it for rendering only.
  const remainingRef = useRef(SESSION_MAX_SECONDS);
  const hasWarnedRef = useRef(false);
  const isLoggingOutRef = useRef(false);

  const resetCountdown = useCallback(() => {
    remainingRef.current = SESSION_MAX_SECONDS;
    setRemainingSeconds(SESSION_MAX_SECONDS);
    hasWarnedRef.current = false;
  }, []);

  // Extend session handler (resets to full 20 minutes)
  const extendSession = useCallback(() => {
    resetCountdown();
    toast.dismiss('session-warn-toast');
    toast.success(
      isAr
        ? 'تم تمديد الجلسة بنجاح (20 دقيقة إضافية)'
        : 'Session extended successfully (+20 mins)',
      { id: 'session-extended-toast', duration: 3000 },
    );
  }, [isAr, resetCountdown]);

  const [previousPath, setPreviousPath] = useState(pathname);
  if (previousPath !== pathname) {
    setPreviousPath(pathname);
    setRemainingSeconds(SESSION_MAX_SECONDS);
  }

  // Reset timer on route navigation (user activity)
  useEffect(() => {
    remainingRef.current = SESSION_MAX_SECONDS;
    hasWarnedRef.current = false;
    toast.dismiss('session-warn-toast');
  }, [pathname]);

  // Countdown timer effect
  useEffect(() => {
    const interval = setInterval(() => {
      const prev = remainingRef.current;

      // Warning threshold: 2 minutes remaining (120s)
      if (prev <= SESSION_WARN_SECONDS && prev > 1 && !hasWarnedRef.current) {
        hasWarnedRef.current = true;
        toast.warning(
          isAr
            ? 'تنبيه أمني: ستنتهي صلاحية جلستك خلال دقيقتين (مدة الجلسة 20 دقيقة). انقر لتمديد الجلسة.'
            : 'Security Warning: Your session will expire in 2 minutes (20 min session). Click to extend.',
          {
            id: 'session-warn-toast',
            duration: 20000,
            action: {
              label: isAr ? 'تمديد الجلسة' : 'Extend Session',
              onClick: () => {
                extendSession();
              },
            },
          },
        );
      }

      // Expiry reached: 0 or 1s remaining -> Immediate logout
      if (prev <= 1) {
        clearInterval(interval);
        remainingRef.current = 0;
        setRemainingSeconds(0);
        if (!isLoggingOutRef.current) {
          isLoggingOutRef.current = true;
          toast.dismiss('session-warn-toast');

          const targetLogin =
            role === 'student'
              ? `/${locale}/login/student?reason=session_expired`
              : `/${locale}/login/admin?reason=session_expired`;

          void (async () => {
            // Cookie is httpOnly: only the API response can clear it. Retry once.
            for (let attempt = 0; attempt < 2; attempt += 1) {
              try {
                await api.post('/auth/logout', {}, { timeout: 8000 });
                break;
              } catch {
                // retry, then redirect anyway
              }
            }
            queryClient.setQueryData(['auth', 'me'], null);
            queryClient.removeQueries({ queryKey: ['auth'] });
            queryClient.clear();
            window.location.href = targetLogin;
          })();
        }
        return;
      }

      remainingRef.current = prev - 1;
      setRemainingSeconds(prev - 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [locale, isAr, role, queryClient, extendSession]);

  const formatRemaining = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const pct = Math.max(
    0,
    Math.min(100, Math.round((remainingSeconds / SESSION_MAX_SECONDS) * 100)),
  );

  const barColor =
    pct > 60 ? 'bg-teal-500' : pct > 20 ? 'bg-amber-400' : 'bg-red-500';

  return {
    remainingSeconds,
    formattedTime: formatRemaining(remainingSeconds),
    pct,
    barColor,
    extendSession,
    isExpiringSoon: remainingSeconds <= SESSION_WARN_SECONDS,
  };
}
