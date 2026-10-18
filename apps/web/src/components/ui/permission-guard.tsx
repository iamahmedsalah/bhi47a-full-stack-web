'use client';

import React from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useParams, useRouter } from 'next/navigation';
import { ShieldAlert, ArrowLeft, ArrowRight, Home } from 'lucide-react';
import { Button } from './button';
import { GlassCard } from './glass-card';

interface PermissionGuardProps {
  permission?: string;
  permissions?: string[];
  anyOf?: boolean;
  children: React.ReactNode;
}

export function PermissionGuard({
  permission,
  permissions,
  anyOf = false,
  children,
}: PermissionGuardProps) {
  const { user, loading, isLoggingOut } = useAuth();
  const params = useParams();
  const router = useRouter();
  const locale = (params?.locale as string) || 'ar';

  if (loading || isLoggingOut || !user) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  // Admin bypasses all checks
  const isAdmin = user?.role === 'admin';
  let hasPermission = isAdmin;

  if (!hasPermission) {
    if (permissions && permissions.length > 0) {
      hasPermission = anyOf
        ? permissions.some((p) => user?.permissions?.includes(p))
        : permissions.every((p) => user?.permissions?.includes(p));
    } else if (permission) {
      hasPermission = Boolean(user?.permissions?.includes(permission));
    }
  }

  if (!hasPermission) {
    const title = locale === 'ar' ? 'صلاحيات غير كافية' : 'Insufficient Permissions';
    const description =
      locale === 'ar'
        ? 'عذراً، لا تمتلك الصلاحيات اللازمة للوصول إلى هذه الصفحة. يرجى التواصل مع مدير النظام إذا كنت تعتقد أن هذا خطأ.'
        : 'Sorry, you do not have the required permissions to access this page. Please contact the administrator if you believe this is an error.';
    
    const goBack = locale === 'ar' ? 'الرجوع للرئيسية' : 'Back to Dashboard';
    const detailsTitle = locale === 'ar' ? 'تفاصيل الأمان' : 'Security Details';
    const userCodeLabel = locale === 'ar' ? 'كود المستخدم' : 'User Code';
    const roleLabel = locale === 'ar' ? 'الدور الوظيفي' : 'Role';
    const permissionLabel = locale === 'ar' ? 'الصلاحية المطلوبة' : 'Required Permission';

    const dashboardPath = user?.role === 'student' ? `/${locale}/dashboard` : `/${locale}/admin`;

    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center p-4" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
        <GlassCard className="w-full max-w-lg border border-red-500/10 p-6 md:p-8 text-center space-y-6 shadow-2xl relative overflow-hidden">
          {/* Subtle red glow in the background */}
          <div className="absolute -top-24 -left-24 w-48 h-48 rounded-full bg-red-500/5 blur-3xl pointer-events-none" />
          
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-red-500/20 animate-ping opacity-75" />
              <div className="relative h-16 w-16 rounded-full bg-red-500/10 border border-red-500/25 flex items-center justify-center text-red-500 shadow-inner">
                <ShieldAlert className="h-8 w-8" />
              </div>
            </div>
            
            <div className="space-y-2">
              <h2 className="text-xl md:text-2xl font-bold text-foreground tracking-tight">
                {title}
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {description}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-white/5 bg-secondary/25 p-4 text-start space-y-2.5 text-xs text-muted-foreground">
            <h4 className="font-bold text-foreground text-sm border-b border-white/5 pb-1.5 flex items-center gap-1.5">
              <span>{detailsTitle}</span>
            </h4>
            <div className="grid grid-cols-2 gap-y-2 font-mono">
              <span className="font-semibold text-muted">{userCodeLabel}:</span>
              <span className="text-foreground text-end">{user?.studentCode || user?.email?.split('@')[0] || 'STF-0000'}</span>

              <span className="font-semibold text-muted">{roleLabel}:</span>
              <span className="text-foreground text-end capitalize">{user?.role || 'staff'}</span>

              <span className="font-semibold text-muted">{permissionLabel}:</span>
              <span className="text-red-400 font-bold text-end">{permission}</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button
              onClick={() => router.push(dashboardPath)}
              className="flex-1 h-11 gap-2 font-semibold bg-primary hover:bg-primary/95 text-white rounded-xl shadow-lg transition-all active:scale-[0.98]"
            >
              <Home className="w-4 h-4" />
              <span>{goBack}</span>
            </Button>
            
            <Button
              variant="outline"
              onClick={() => router.back()}
              className="flex-1 h-11 gap-2 font-semibold border-white/10 hover:bg-secondary/30 rounded-xl transition-all"
            >
              {locale === 'ar' ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
              <span>{locale === 'ar' ? 'العودة للخلف' : 'Go Back'}</span>
            </Button>
          </div>
        </GlassCard>
      </div>
    );
  }

  return <>{children}</>;
}
