'use client';

import React, { createContext, useCallback, useContext, useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api, { getApiErrorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { useRouter, usePathname } from 'next/navigation';
import { toast } from 'sonner';
import { useTheme } from '@/providers/theme-provider';

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

type LoginPayload = StudentLoginPayload | AdminLoginPayload;

interface LoginResponse {
  user: User;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isLoggingOut: boolean;
  login: (type: 'student' | 'admin', data: LoginPayload) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isLoggingOut: false,
  login: async () => {},
  logout: async () => {},
});

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

  const login = useCallback(async (type: 'student' | 'admin', data: LoginPayload) => {
    const endpoint =
      type === 'student' ? '/auth/student/login' : '/auth/admin/login';
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
        router.push(`/${locale}/dashboard`);
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

    const isPublicPath =
      pathname === `/${locale}/login` ||
      pathname === `/${locale}/login/student` ||
      pathname === `/${locale}/login/admin` ||
      pathname === `/${locale}/login/change-password` ||
      pathname === '/login' ||
      pathname === '/login/student' ||
      pathname === '/login/admin' ||
      pathname === '/login/change-password';

    const user = meQuery.data || null;

    if (!user) {
      if (!isPublicPath && pathname !== `/${locale}` && pathname !== '/') {
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

    if (isPublicPath && pathname !== `/${locale}/login/change-password` && pathname !== '/login/change-password') {
      if (user.role === 'student') {
        router.push(`/${locale}/dashboard`);
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
