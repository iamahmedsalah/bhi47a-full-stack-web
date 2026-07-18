'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/providers/auth-provider';
import { getApiErrorMessage } from '@/lib/api';
import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { getChangePasswordSchema, type ChangePasswordInput } from '@/lib/validations';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PasswordInput } from '@/components/ui/password-input';
import { toast } from 'sonner';
import { Lock, Loader2, KeyRound, Check } from 'lucide-react';
import LangToggle from '@/components/ui/LangToggle';
import api from '@/lib/api';

export default function ChangePasswordPage() {
  const t = useTranslations('auth');
  const tValidation = useTranslations('validation');
  const { user } = useAuth();
  const params = useParams();
  const router = useRouter();
  const locale = params.locale as string;

  const [loading, setLoading] = useState(false);

  const schema = getChangePasswordSchema((key) => {
    const translationKey = key.replace('validation.', '');
    return tValidation(translationKey);
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ChangePasswordInput>({
    resolver: zodResolver(schema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async (data: ChangePasswordInput) => {
    setLoading(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });

      toast.success(
        locale === 'ar'
          ? 'تم تغيير كلمة المرور بنجاح. جاري توجيهك...'
          : 'Password changed successfully. Redirecting...',
      );

      // Force session refetch/reload and redirect
      if (user) {
        user.mustChangePassword = false;
      }
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err) {
      toast.error(getApiErrorMessage(err, t('error')));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4 md:p-8 relative overflow-hidden"
      style={{ background: 'var(--gradient-primary)' }}
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
    >
      {/* Background Gradients */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -right-1/2 w-full h-full rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-1/2 -left-1/2 w-full h-full rounded-full bg-accent/5 blur-3xl" />
      </div>

      {/* Language Switcher */}
      <div className="absolute top-6 end-6 z-10">
        <LangToggle />
      </div>

      <Card className="w-full max-w-md bg-card/95 backdrop-blur-sm border-border shadow-[var(--shadow-glow)] p-6 md:p-8 z-10">
        <div className="flex flex-col items-center gap-6">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary shadow-[var(--shadow-glow)]">
            <KeyRound className="w-8 h-8" />
          </div>

          <div className="text-center space-y-2">
            <h1 className="text-xl md:text-2xl font-bold text-foreground">
              {locale === 'ar' ? 'تغيير كلمة المرور' : 'Change Password'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {locale === 'ar'
                ? 'يجب عليك تغيير كلمة المرور الافتراضية لحماية حسابك قبل المتابعة'
                : 'You must change your default password to secure your account before proceeding'}
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="w-full space-y-4">
            <div className="space-y-4">
              {/* Current Password */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground">
                  {locale === 'ar' ? 'كلمة المرور الحالية' : 'Current Password'}
                </label>
                <PasswordInput
                  placeholder="••••••••"
                  disabled={loading}
                  {...register('currentPassword')}
                  className="h-11 bg-secondary/50 border-border text-foreground rounded-lg"
                />
                {errors.currentPassword && (
                  <p className="text-xs text-red-500">{errors.currentPassword.message}</p>
                )}
              </div>

              {/* New Password */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground">
                  {locale === 'ar' ? 'كلمة المرور الجديدة' : 'New Password'}
                </label>
                <PasswordInput
                  placeholder="••••••••"
                  disabled={loading}
                  {...register('newPassword')}
                  className="h-11 bg-secondary/50 border-border text-foreground rounded-lg"
                />
                {errors.newPassword && (
                  <p className="text-xs text-red-500">{errors.newPassword.message}</p>
                )}
              </div>

              {/* Confirm Password */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground">
                  {locale === 'ar' ? 'تأكيد كلمة المرور الجديدة' : 'Confirm New Password'}
                </label>
                <PasswordInput
                  placeholder="••••••••"
                  disabled={loading}
                  {...register('confirmPassword')}
                  className="h-11 bg-secondary/50 border-border text-foreground rounded-lg"
                />
                {errors.confirmPassword && (
                  <p className="text-xs text-red-500">{errors.confirmPassword.message}</p>
                )}
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-11 gap-2 text-base bg-primary hover:bg-primary/80 text-primary-foreground font-semibold rounded-lg transition-all cursor-pointer mt-2"
              disabled={loading}
            >
              {loading ? (
                <>
                  {locale === 'ar' ? 'جاري الحفظ...' : 'Saving...'}
                  <Loader2 className="h-4 w-4 animate-spin" />
                </>
              ) : (
                <>
                  {locale === 'ar' ? 'حفظ و متابعة' : 'Save & Continue'}
                  <Check className="h-4 w-4" />
                </>
              )}
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
