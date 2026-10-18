'use client';

import React, { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ShieldAlert, ArrowLeft, ArrowRight, RotateCw, Mail, Lock, UserCheck, ShieldOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/providers/auth-provider';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { toast } from 'sonner';
import api from '@/lib/api';

interface RestrictedFeatureProps {
  permission?: string;
  featureName?: string;
  description?: string;
}

export function RestrictedFeature({
  permission,
  featureName,
  description,
}: RestrictedFeatureProps) {
  const router = useRouter();
  const params = useParams();
  const locale = (params?.locale as string) || 'ar';
  const isArabic = locale.startsWith('ar');
  const { user, isLoggingOut } = useAuth();
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  if (isLoggingOut || !user) {
    return null;
  }

  const handleRefreshPermissions = async () => {
    setIsRefreshing(true);
    try {
      const res = await api.get('/auth/me');
      queryClient.setQueryData(queryKeys.auth.me, res.data);

      const hasPermission =
        res.data?.role === 'admin' ||
        (permission && res.data?.permissions?.includes(permission));

      if (hasPermission) {
        toast.success(
          isArabic
            ? 'تم تحديث صلاحياتك وتفعيل الوصول بنجاح!'
            : 'Permissions updated successfully! Access granted.',
        );
        window.location.reload();
      } else {
        toast.info(
          isArabic
            ? 'تمت إعادة مزامنة الصلاحيات، ولكن هذه الميزة لا تزال مقيدة من قِبل إدارة المعهد.'
            : 'Permissions re-synced, but this feature remains restricted for your account.',
        );
      }
    } catch {
      toast.error(
        isArabic
          ? 'تعذر تحديث الصلاحيات حالياً، يرجى المحاولة لاحقاً.'
          : 'Failed to refresh permissions. Please try again.',
      );
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div
      className="flex min-h-[68vh] w-full items-center justify-center p-4 md:p-8"
      dir={isArabic ? 'rtl' : 'ltr'}
    >
      <div className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-rose-500/25 bg-card/95 p-6 shadow-2xl backdrop-blur-md md:p-10 text-center">
        {/* Subtle background glow */}
        <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full bg-rose-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 right-1/4 w-60 h-60 rounded-full bg-amber-500/10 blur-3xl" />

        <div className="relative z-10 flex flex-col items-center space-y-6">
          {/* Glowing Shield Icon */}
          <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-400 shadow-[0_0_25px_rgba(244,63,94,0.25)]">
            <ShieldAlert className="h-10 w-10 animate-pulse" />
            <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-rose-600 text-white shadow-md">
              <Lock className="h-3.5 w-3.5" />
            </div>
          </div>

          {/* Heading and Subtitle */}
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/15 px-3 py-1 text-xs font-bold text-rose-400">
              <ShieldOff className="h-3.5 w-3.5" />
              <span>{isArabic ? 'صلاحية الوصول مقيدة' : 'Restricted Access'}</span>
            </div>

            <h1 className="text-2xl font-extrabold tracking-tight text-foreground md:text-3xl">
              {isArabic ? 'هذه الميزة مقيدة في حسابك' : 'Restricted to this feature'}
            </h1>

            {featureName ? (
              <p className="font-semibold text-primary text-sm md:text-base">
                {featureName}
              </p>
            ) : null}

            <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">
              {description ||
                (isArabic
                  ? 'عفواً، لا يمتلك حسابك الصلاحية اللازمة للوصول إلى هذا القسم. لقد تم تعديل أو تقييد صلاحياتك من قِبل إدارة المعهد.'
                  : 'Access to this feature is restricted. Your account does not have the required permission to access this section. Please contact the administrator if you require access.')}
            </p>
          </div>

          {/* Details Pill / Required Permission */}
          <div className="w-full rounded-2xl border border-border/80 bg-background/70 p-4 text-start space-y-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground border-b border-border/50 pb-2">
              <div className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-primary" />
                <span className="font-semibold text-foreground">
                  {user?.name || (isArabic ? 'الموظف' : 'Staff Member')}
                </span>
              </div>
              <span className="rounded bg-muted px-2 py-0.5 text-[11px] font-mono text-muted-foreground uppercase">
                {user?.role === 'staff' ? (isArabic ? 'موظف' : 'Staff') : user?.role || 'User'}
              </span>
            </div>

            {permission ? (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {isArabic ? 'الصلاحية المطلوبة:' : 'Required Permission:'}
                </span>
                <span className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 font-mono text-[11px] font-bold text-rose-400">
                  {permission}
                </span>
              </div>
            ) : null}

            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {isArabic ? 'حالة الاعتماد:' : 'Permission Status:'}
              </span>
              <span className="font-semibold text-rose-400 flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-rose-500"></span>
                {isArabic ? 'غير مصرح به (Restricted)' : 'Unauthorized'}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row w-full gap-3 pt-2">
            <Button
              onClick={() => router.push(`/${locale}/admin`)}
              className="flex-1 flex items-center justify-center gap-2 h-11 text-sm font-semibold"
            >
              {isArabic ? <ArrowRight className="h-4 w-4" /> : <ArrowLeft className="h-4 w-4" />}
              <span>{isArabic ? 'العودة للوحة التحكم' : 'Back to Dashboard'}</span>
            </Button>

            <Button
              variant="outline"
              onClick={handleRefreshPermissions}
              disabled={isRefreshing}
              className="flex items-center justify-center gap-2 h-11 text-sm font-semibold border-border hover:bg-secondary"
            >
              <RotateCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin text-primary' : ''}`} />
              <span>{isArabic ? 'إعادة فحص الصلاحيات' : 'Refresh Permissions'}</span>
            </Button>
          </div>

          {/* Admin contact footnote */}
          <p className="text-[11px] text-muted-foreground/80 flex items-center gap-1">
            <Mail className="h-3 w-3" />
            <span>
              {isArabic
                ? 'إذا كنت تعتقد أن هذا تم عن طريق الخطأ، يرجى مراجعة إدارة شؤون تكنولوجيا المعلومات أو مدير النظام.'
                : 'If you believe this is in error, please consult the institute IT administration.'}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
