'use client';

import React, { createContext, useCallback, useContext, useState, useEffect } from 'react';
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

  const meQuery = useQuery({
    queryKey: queryKeys.auth.me,
    queryFn: async () => {
      const res = await api.get<User>('/auth/me');
      return res.data;
    },
    retry: false,
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
      queryClient.setQueryData(queryKeys.auth.me, res.data.user);
      toast.success(
        locale === 'ar' ? 'تم تسجيل الدخول بنجاح' : 'Logged in successfully',
        { id: toastId },
      );

      if (res.data.user.role === 'student') {
        const returnPath = getSafeStudentReturnPath(options?.returnUrl, locale);
        router.push(returnPath ?? `/${locale}/dashboard`);
      } else {
        router.push(`/${locale}/admin`);
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

    // Fire-and-forget server logout to invalidate cookies
    try {
      void api.post('/auth/logout').catch(() => {});
    } catch {
      // ignore
    }

    // Invalidate client queries
    queryClient.clear();

    // Instant zero-lag redirect without loading toasts or delay
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
