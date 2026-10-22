'use client';

import React, { createContext, useCallback, useContext, useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { useRouter, usePathname } from 'next/navigation';
import { toast } from 'sonner';
import { useTheme } from '@/providers/theme-provider';
import { isAuthEntryRoute, isPublicRoute } from '@/lib/public-routes';

interface User {
  _id: string;
  name: string;
  nameAr?: string;
  nameEn?: string;
  role: 'admin' | 'staff' | 'student';
  staffType?: string;
  email?: string;
  studentCode?: string;
  permissions?: string[];
  mustChangePassword: boolean;
  theme?: 'light' | 'dark' | 'system';
}

interface StudentLoginPayload {
  studentCode: string;
  password: string;
}

interface AdminLoginPayload {
  email: string;
  password: string;
}

interface GoogleLoginPayload {
  credential: string;
}

type LoginPayload = StudentLoginPayload | AdminLoginPayload | GoogleLoginPayload;

interface LoginResponse {
  user: User;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isLoggingOut: boolean;
  login: (
    type: 'student' | 'admin' | 'google',
    data: LoginPayload,
    options?: { returnUrl?: string | null },
  ) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isLoggingOut: false,
  login: async () => { },
  logout: async () => { },
});

function getSafeStudentReturnPath(
  returnUrl: string | null | undefined,
  locale: string,
): string | null {
  if (!returnUrl || typeof window === 'undefined') return null;

  try {
    const url = new URL(returnUrl, window.location.origin);
    if (url.origin !== window.location.origin) return null;

    const allowedPaths = new Set([
      `/${locale}/attendance/check-in`,
      '/attendance/check-in',
    ]);
    if (!allowedPaths.has(url.pathname)) return null;

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({
  children,
  locale,
}: {
  children: React.ReactNode;
  locale: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const lastHeartbeatTimeRef = useRef<number>(0);

  const meQuery = useQuery({
    queryKey: queryKeys.auth.me,
    queryFn: async () => {
      const res = await api.get<User>('/auth/me');
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
    enabled: !isLoggingOut,
  });

  const login = useCallback(async (
    type: 'student' | 'admin' | 'google',
    data: LoginPayload,
    options?: { returnUrl?: string | null },
  ) => {
    const endpoint =
      type === 'student'
        ? '/auth/student/login'
        : type === 'admin'
          ? '/auth/admin/login'
          : '/auth/google/login';
    const toastId = toast.loading(
      locale === 'ar' ? 'جاري تسجيل الدخول...' : 'Signing you in...',
    );

    try {
      const res = await api.post<LoginResponse>(endpoint, data);

      // Confirm the browser really stored the session cookie. Browsers that block
      // third-party cookies accept the login response but drop Set-Cookie, which
      // later surfaces as a confusing "Unauthorized" on the first protected request.
      let sessionUser: User = res.data.user;
      try {
        const me = await api.get<User>('/auth/me');
        sessionUser = { ...res.data.user, ...me.data };
      } catch {
        throw {
          statusCode: 401,
          code: 'SESSION_COOKIE_NOT_STORED',
          message:
            locale === 'ar'
              ? 'تعذر حفظ جلسة الدخول في هذا المتصفح. فعّل ملفات تعريف الارتباط (Cookies) للمواقع الخارجية أو افتح الموقع من متصفح آخر.'
              : 'Your browser did not keep the login session. Allow third-party cookies for this site or try another browser.',
        };
      }

      queryClient.setQueryData(queryKeys.auth.me, sessionUser);
      toast.success(
        locale === 'ar' ? 'تم تسجيل الدخول بنجاح' : 'Logged in successfully',
        { id: toastId },
      );

      if (sessionUser.role === 'student') {
        const returnPath = getSafeStudentReturnPath(options?.returnUrl, locale);
        router.replace(returnPath ?? `/${locale}/dashboard`);
      } else {
        router.replace(`/${locale}/admin`);
      }
    } catch (error) {
      toast.dismiss(toastId);
      throw error;
    }
  }, [locale, queryClient, router]);

  const logout = useCallback(async () => {
    if (isLoggingOut) return;

    setIsLoggingOut(true);

    const userRole = meQuery.data?.role;
    const isAdminPath = pathname.startsWith(`/${locale}/admin`);
    const targetLogin =
      userRole === 'admin' || userRole === 'staff' || isAdminPath
        ? `/${locale}/login/admin`
        : `/${locale}/login/student`;

    if (typeof window !== 'undefined' && window.google?.accounts?.id) {
      try {
        window.google.accounts.id.disableAutoSelect();
      } catch {
        // ignore if GIS not loaded
      }
    }

    // Immediately cancel and reset queries so no background query refetches
    queryClient.cancelQueries({ queryKey: queryKeys.auth.me });
    queryClient.setQueryData(queryKeys.auth.me, null);
    queryClient.removeQueries({ queryKey: ['auth'] });
    queryClient.clear();

    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('student_portal_csrf_token');
        sessionStorage.clear();
      } catch {}
    }

    if (typeof document !== 'undefined') {
      document.cookie = 'csrf_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
      document.cookie = 'csrf_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=None; Secure';
    }

    // The httpOnly cookie can only be cleared by the API response. Wait long enough
    // for serverless cold starts and retry once, otherwise the next page load still
    // sees a valid session and redirects the user straight back in.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await api.post('/auth/logout', {}, { timeout: 8000 });
        break;
      } catch {
        // retry once, then proceed to the login page anyway
      }
    }

    // Show logout confirmation notification
    toast.success(
      locale === 'ar' ? 'تم تسجيل الخروج بنجاح' : 'Logged out successfully',
    );

    // Hard navigation to target login page completely clears in-memory state and router cache
    if (typeof window !== 'undefined') {
      window.location.replace(targetLogin);
    } else {
      router.replace(targetLogin);
    }
  }, [isLoggingOut, locale, meQuery.data?.role, pathname, queryClient, router]);

  const { setTheme, theme: currentTheme } = useTheme();

  useEffect(() => {
    if (meQuery.isLoading || isLoggingOut) return;

    const isPublicPath = isPublicRoute(pathname);
    const isAuthEntryPath = isAuthEntryRoute(pathname);

    const user = meQuery.data || null;

    if (!user) {
      if (!isPublicPath) {
        const isAdminPath = pathname.startsWith(`/${locale}/admin`);
        router.push(
          isAdminPath ? `/${locale}/login/admin` : `/${locale}/login/student`,
        );
      }
      return;
    }

    if (user.mustChangePassword && pathname !== `/${locale}/login/change-password`) {
      toast.warning(
        locale === 'ar'
          ? 'يجب تغيير كلمة المرور قبل المتابعة'
          : 'You must change your password before proceeding',
      );
      router.push(`/${locale}/login/change-password`);
      return;
    }

    if (!user.mustChangePassword && pathname === `/${locale}/login/change-password`) {
      if (user.role === 'student') {
        router.push(`/${locale}/dashboard`);
      } else {
        router.push(`/${locale}/admin`);
      }
      return;
    }

    if (isAuthEntryPath && pathname !== `/${locale}/login/change-password` && pathname !== '/login/change-password') {
      if (user.role === 'student') {
        const returnUrl =
          typeof window === 'undefined'
            ? null
            : new URLSearchParams(window.location.search).get('returnUrl');
        router.push(
          getSafeStudentReturnPath(returnUrl, locale) ?? `/${locale}/dashboard`,
        );
      } else {
        router.push(`/${locale}/admin`);
      }
      return;
    }

    if (pathname.startsWith(`/${locale}/admin`) && user.role === 'student') {
      toast.error(
        locale === 'ar' ? 'غير مصرح لك بدخول هذه الصفحة' : 'Unauthorized access',
      );
      router.push(`/${locale}/dashboard`);
      return;
    }

    if (pathname.startsWith(`/${locale}/dashboard`) && user.role !== 'student') {
      toast.error(
        locale === 'ar' ? 'غير مصرح لك بدخول هذه الصفحة' : 'Unauthorized access',
      );
      router.push(`/${locale}/admin`);
      return;
    }
  }, [meQuery.data, meQuery.isLoading, isLoggingOut, pathname, locale, router]);

  useEffect(() => {
    if (meQuery.data?.theme && meQuery.data.theme !== currentTheme) {
      setTheme(meQuery.data.theme);
    }
  }, [meQuery.data?.theme, currentTheme, setTheme]);

  // Periodic and route-change heartbeat to track live active sessions
  useEffect(() => {
    if (!meQuery.data?._id || isLoggingOut) return;

    let isMounted = true;
    const sendHeartbeat = (force = false) => {
      if (!isMounted) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const now = Date.now();
      if (!force && now - lastHeartbeatTimeRef.current < 30_000) return;
      lastHeartbeatTimeRef.current = now;
      api.post('/auth/heartbeat', { route: pathname }).catch(() => {
        // Silent failure for heartbeat
      });
    };

    sendHeartbeat();
    const interval = setInterval(() => sendHeartbeat(true), 60_000);

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        sendHeartbeat();
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      isMounted = false;
      clearInterval(interval);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [meQuery.data?._id, pathname, isLoggingOut]);

  const contextValue = React.useMemo<AuthContextType>(
    () => ({
      user: meQuery.data || null,
      loading: meQuery.isLoading,
      isLoggingOut,
      login,
      logout,
    }),
    [meQuery.data, meQuery.isLoading, isLoggingOut, login, logout],
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}
