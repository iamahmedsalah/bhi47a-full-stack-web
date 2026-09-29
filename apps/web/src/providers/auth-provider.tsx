'use client';

import React, { createContext, useCallback, useContext, useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api, { getApiErrorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { useRouter, usePathname } from 'next/navigation';
import { toast } from 'sonner';
import { useTheme } from '@/providers/theme-provider';
import { isAuthEntryRoute, isPublicRoute } from '@/lib/public-routes';

interface User {
  _id: string;
  name: string;
  role: 'admin' | 'staff' | 'student';
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

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
    const toastId = toast.loading(
      locale === 'ar'
        ? 'جاري تسجيل الخروج...'
        : 'Signing out...',
    );

    try {
      if (typeof window !== 'undefined' && window.google?.accounts?.id) {
        try {
          window.google.accounts.id.disableAutoSelect();
        } catch {
          // ignore if GIS not loaded
        }
      }
      await api.post('/auth/logout');
      toast.success(locale === 'ar' ? 'تم تسجيل الخروج' : 'Logged out', {
        id: toastId,
      });
    } catch (error) {
      toast.error(
        getApiErrorMessage(
          error,
          locale === 'ar'
            ? 'تعذر إكمال تسجيل الخروج من الخادم'
            : 'Could not complete server logout',
        ),
        { id: toastId },
      );
    } finally {
      queryClient.setQueryData(queryKeys.auth.me, null);
      setIsLoggingOut(false);
      router.push(`/${locale}/login`);
    }
  }, [isLoggingOut, locale, queryClient, router]);

  const { setTheme, theme: currentTheme } = useTheme();

  const pathname = usePathname();

  useEffect(() => {
    if (meQuery.isLoading) return;

    const isPublicPath = isPublicRoute(pathname);
    const isAuthEntryPath = isAuthEntryRoute(pathname);

    const user = meQuery.data || null;

    if (!user) {
      if (!isPublicPath) {
        router.push(`/${locale}/login`);
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
  }, [meQuery.data, meQuery.isLoading, pathname, locale, router]);

  useEffect(() => {
    if (meQuery.data?.theme && meQuery.data.theme !== currentTheme) {
      setTheme(meQuery.data.theme);
    }
  }, [meQuery.data?.theme, currentTheme, setTheme]);

  return (
    <AuthContext.Provider
      value={{
        user: meQuery.data || null,
        loading: meQuery.isLoading,
        isLoggingOut,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
