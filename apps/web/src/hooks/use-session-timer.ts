'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '@/lib/api';

export const SESSION_MAX_SECONDS = 24 * 60 * 60; // 24 hours (86400s)
export const SESSION_WARN_SECONDS = 2 * 60; // 2 minutes warning (120s)

const SESSION_SYNC_CHANNEL = 'student_portal_session_sync_v2';
const SESSION_EXPIRES_STORAGE_KEY = 'sp_session_idle_expires_at_v2';
const SESSION_LOGOUT_STORAGE_KEY = 'sp_session_logout_broadcast_v2';
const LOCAL_ACTIVITY_THROTTLE_MS = 30_000; // 30s
const SERVER_HEARTBEAT_THROTTLE_MS = 120_000; // 2m

export interface SessionSyncMessage {
  type: 'activity' | 'logout';
  expiresAtMs?: number;
  reason?: string;
}

export function broadcastSessionLogout(reason = 'manual_logout') {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(SESSION_EXPIRES_STORAGE_KEY);
    localStorage.setItem(
      SESSION_LOGOUT_STORAGE_KEY,
      JSON.stringify({ at: Date.now(), reason }),
    );
  } catch {
    // ignore storage quota / privacy mode errors
  }
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const ch = new BroadcastChannel(SESSION_SYNC_CHANNEL);
      ch.postMessage({ type: 'logout', reason } satisfies SessionSyncMessage);
      ch.close();
    }
  } catch {
    // ignore unsupported BroadcastChannel
  }
}

interface UseSessionTimerOptions {
  role: 'admin' | 'student' | 'staff';
  locale?: string;
  enabled?: boolean;
  serverIdleExpiresAt?: string | null;
  idleTimeoutSeconds?: number | null;
}

export function useSessionTimer({
  role,
  locale: propLocale,
  enabled = true,
  serverIdleExpiresAt,
  idleTimeoutSeconds,
}: UseSessionTimerOptions) {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const locale = propLocale || (pathname?.startsWith('/en') ? 'en' : 'ar');
  const isAr = locale === 'ar';

  const resolvedIdleSeconds =
    typeof idleTimeoutSeconds === 'number' && idleTimeoutSeconds >= 300
      ? idleTimeoutSeconds
      : SESSION_MAX_SECONDS;
  const resolvedIdleMs = resolvedIdleSeconds * 1000;

  const [remainingSeconds, setRemainingSeconds] = useState(resolvedIdleSeconds);
  const [isExtending, setIsExtending] = useState(false);

  const expiresAtRef = useRef<number>(0);
  const remainingRef = useRef<number>(resolvedIdleSeconds);
  const lastLocalActivityRef = useRef<number>(0);
  const lastServerHeartbeatRef = useRef<number>(0);
  const lastRouteRef = useRef<string>(pathname);
  const isLoggingOutRef = useRef<boolean>(false);
  const channelRef = useRef<BroadcastChannel | null>(null);

  const publishActivityDeadline = useCallback((nextExpiresAtMs: number) => {
    expiresAtRef.current = nextExpiresAtMs;
    const nextRem = Math.max(0, Math.ceil((nextExpiresAtMs - Date.now()) / 1000));
    remainingRef.current = nextRem;
    setRemainingSeconds(nextRem);

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(
          SESSION_EXPIRES_STORAGE_KEY,
          String(nextExpiresAtMs),
        );
      } catch {
        // ignore storage errors
      }
    }
    try {
      channelRef.current?.postMessage({
        type: 'activity',
        expiresAtMs: nextExpiresAtMs,
      } satisfies SessionSyncMessage);
    } catch {
      // ignore channel errors
    }
  }, []);

  const performExpiryLogout = useCallback(
    (skipApiLogout = false) => {
      if (isLoggingOutRef.current) return;
      isLoggingOutRef.current = true;
      remainingRef.current = 0;
      setRemainingSeconds(0);

      const targetLogin =
        role === 'student'
          ? `/${locale}/login/student?reason=session_expired`
          : `/${locale}/login/admin?reason=session_expired`;

      if (!skipApiLogout) {
        broadcastSessionLogout('session_expired');
      }

      void (async () => {
        if (!skipApiLogout) {
          for (let attempt = 0; attempt < 2; attempt += 1) {
            try {
              await api.post('/auth/logout', {}, { timeout: 8000 });
              break;
            } catch {
              // retry once then redirect
            }
          }
        }
        queryClient.setQueryData(['auth', 'me'], null);
        queryClient.removeQueries({ queryKey: ['auth'] });
        queryClient.clear();
        if (typeof window !== 'undefined') {
          window.location.href = targetLogin;
        }
      })();
    },
    [locale, queryClient, role],
  );

  const sendActivityHeartbeat = useCallback(
    async (opts?: { route?: string; action?: string; actionAr?: string; force?: boolean }) => {
      if (!enabled || isLoggingOutRef.current) return;
      const now = Date.now();
      if (!opts?.force && now - lastServerHeartbeatRef.current < SERVER_HEARTBEAT_THROTTLE_MS) {
        return;
      }
      lastServerHeartbeatRef.current = now;
      try {
        const res = await api.post<{
          ok?: boolean;
          session?: { idleExpiresAt?: string };
        }>('/auth/heartbeat', {
          route: opts?.route ?? pathname,
          ...(opts?.action ? { action: opts.action, actionAr: opts.actionAr } : {}),
        });
        const serverExpiry = res.data?.session?.idleExpiresAt;
        if (serverExpiry && Number.isFinite(Date.parse(serverExpiry))) {
          publishActivityDeadline(Date.parse(serverExpiry));
        }
      } catch {
        // Silent failure on background heartbeat; 401 handled by interceptor
      }
    },
    [enabled, pathname, publishActivityDeadline],
  );

  // Explicit user click on "Continue Session" in the 2-minute warning modal
  const extendSession = useCallback(async () => {
    if (isExtending || isLoggingOutRef.current) return;
    setIsExtending(true);
    try {
      const optimisticExpiry = Date.now() + resolvedIdleMs;
      publishActivityDeadline(optimisticExpiry);
      await sendActivityHeartbeat({
        action: 'Session Extended',
        actionAr: 'تمديد الجلسة',
        force: true,
      });
      toast.success(
        isAr
          ? 'تم تمديد الجلسة بنجاح لمدة 24 ساعة إضافية'
          : 'Session extended successfully for another 24 hours',
        { id: 'session-extended-toast', duration: 3000 },
      );
    } finally {
      setIsExtending(false);
    }
  }, [isAr, isExtending, publishActivityDeadline, resolvedIdleMs, sendActivityHeartbeat]);

  // Sync server-provided idleExpiresAt whenever /auth/me resolves
  useEffect(() => {
    if (!enabled || !serverIdleExpiresAt) return;
    const parsed = Date.parse(serverIdleExpiresAt);
    if (!Number.isFinite(parsed)) return;
    expiresAtRef.current = parsed;
    try {
      localStorage.setItem(SESSION_EXPIRES_STORAGE_KEY, String(parsed));
    } catch {
      // ignore
    }
  }, [enabled, serverIdleExpiresAt]);

  // Record route changes as real user activity
  useEffect(() => {
    if (!enabled || isLoggingOutRef.current) return;
    if (lastRouteRef.current === pathname) return;
    lastRouteRef.current = pathname;
    if (remainingRef.current > SESSION_WARN_SECONDS) {
      publishActivityDeadline(Date.now() + resolvedIdleMs);
      void sendActivityHeartbeat({ route: pathname, force: true });
    }
  }, [enabled, pathname, publishActivityDeadline, resolvedIdleMs, sendActivityHeartbeat]);

  // Cross-tab synchronization (BroadcastChannel + localStorage fallback) & user activity listeners
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    if (expiresAtRef.current <= 0) {
      const parsedServer =
        serverIdleExpiresAt && Number.isFinite(Date.parse(serverIdleExpiresAt))
          ? Date.parse(serverIdleExpiresAt)
          : null;
      expiresAtRef.current = parsedServer ?? Date.now() + resolvedIdleMs;
    }

    let channel: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        channel = new BroadcastChannel(SESSION_SYNC_CHANNEL);
        channelRef.current = channel;
        channel.onmessage = (event: MessageEvent<SessionSyncMessage>) => {
          const msg = event.data;
          if (!msg) return;
          if (msg.type === 'activity' && typeof msg.expiresAtMs === 'number') {
            if (msg.expiresAtMs > expiresAtRef.current) {
              expiresAtRef.current = msg.expiresAtMs;
              const rem = Math.max(0, Math.ceil((msg.expiresAtMs - Date.now()) / 1000));
              remainingRef.current = rem;
              setRemainingSeconds(rem);
            }
          } else if (msg.type === 'logout') {
            performExpiryLogout(true);
          }
        };
      }
    } catch {
      channel = null;
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key === SESSION_EXPIRES_STORAGE_KEY && event.newValue) {
        const parsed = Number(event.newValue);
        if (Number.isFinite(parsed) && parsed > expiresAtRef.current) {
          expiresAtRef.current = parsed;
          const rem = Math.max(0, Math.ceil((parsed - Date.now()) / 1000));
          remainingRef.current = rem;
          setRemainingSeconds(rem);
        }
      } else if (event.key === SESSION_LOGOUT_STORAGE_KEY && event.newValue) {
        performExpiryLogout(true);
      }
    };

    const handleUserActivity = () => {
      if (isLoggingOutRef.current) return;
      // Do not silently dismiss the 2-minute warning modal on stray mouse movements;
      // once the warning modal is visible, the user clicks "Continue Session" explicitly.
      if (remainingRef.current <= SESSION_WARN_SECONDS) return;

      const now = Date.now();
      if (now - lastLocalActivityRef.current >= LOCAL_ACTIVITY_THROTTLE_MS) {
        lastLocalActivityRef.current = now;
        publishActivityDeadline(now + resolvedIdleMs);
      }
      if (now - lastServerHeartbeatRef.current >= SERVER_HEARTBEAT_THROTTLE_MS) {
        void sendActivityHeartbeat();
      }
    };

    const syncClock = () => {
      if (isLoggingOutRef.current) return;
      const rem = Math.max(0, Math.ceil((expiresAtRef.current - Date.now()) / 1000));
      remainingRef.current = rem;
      setRemainingSeconds(rem);
      if (rem <= 0) {
        performExpiryLogout(false);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncClock();
      }
    };

    const activityEvents: Array<keyof WindowEventMap> = [
      'pointerdown',
      'keydown',
      'touchstart',
      'scroll',
    ];
    for (const evt of activityEvents) {
      window.addEventListener(evt, handleUserActivity, { passive: true });
    }
    window.addEventListener('storage', handleStorage);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Real wall-clock tick every second (zero drift on laptop sleep / background throttle)
    const interval = window.setInterval(syncClock, 1000);

    return () => {
      window.clearInterval(interval);
      for (const evt of activityEvents) {
        window.removeEventListener(evt, handleUserActivity);
      }
      window.removeEventListener('storage', handleStorage);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (channel) {
        channel.close();
        channelRef.current = null;
      }
    };
  }, [
    enabled,
    performExpiryLogout,
    publishActivityDeadline,
    resolvedIdleMs,
    sendActivityHeartbeat,
    serverIdleExpiresAt,
  ]);

  const formatRemaining = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const warnPct = Math.max(
    0,
    Math.min(100, Math.round((remainingSeconds / SESSION_WARN_SECONDS) * 100)),
  );

  return {
    remainingSeconds,
    formattedTime: formatRemaining(remainingSeconds),
    warnPct,
    isExtending,
    extendSession,
    isExpiringSoon:
      enabled && remainingSeconds > 0 && remainingSeconds <= SESSION_WARN_SECONDS,
  };
}
