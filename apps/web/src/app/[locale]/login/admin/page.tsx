'use client';
import { PasskeyLoginButton } from '@/components/auth/passkey-login-button';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/providers/auth-provider';
import { getApiErrorMessage } from '@/lib/api';
import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { getAdminLoginSchema, type AdminLoginInput } from '@/lib/validations';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PasswordInput } from '@/components/ui/password-input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { formatLockoutDuration, normalizeAuthErrorMessage } from '@/lib/auth-toast';
import { 
  ArrowRight, 
  UserCircle, 
  Lock, 
  Loader2, 
  Clock, 
  Eye, 
  EyeOff,
  ShieldAlert,
} from 'lucide-react';
import { Footer } from '@/components/ui/footer';
import LangToggle from '@/components/ui/LangToggle';

interface AdminLoginFormProps {
  onSubmit: (data: AdminLoginInput) => Promise<void>;
  loading: boolean;
  isLocked: boolean;
  lockedEmail: string | null;
  banRemainingSeconds: number | null;
  locale: string;
  t: any;
  tValidation: any;
  adminCodeInputRef: React.MutableRefObject<HTMLInputElement | null>;
}

function AdminLoginForm({
  onSubmit,
  loading,
  isLocked,
  lockedEmail,
  banRemainingSeconds,
  locale,
  t,
  tValidation,
  adminCodeInputRef,
}: AdminLoginFormProps) {
  const schema = getAdminLoginSchema((key) => {
    const translationKey = key.replace('validation.', '');
    return tValidation(translationKey);
  });

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<AdminLoginInput>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const emailVal = watch('email');
  const passwordVal = watch('password');
  const normalizedEmail = (emailVal || '').trim().toLowerCase();
  const isCurrentAccountLocked =
    isLocked &&
    Boolean(lockedEmail) &&
    normalizedEmail === lockedEmail?.toLowerCase() &&
    (banRemainingSeconds ?? 0) > 0;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="w-full space-y-4">
      <PasskeyLoginButton area="management" />
      <div className="space-y-4">
        {/* Admin Code/Email */}
        <div className="relative">
          <div className="absolute inset-y-0 start-3 flex items-center text-muted-foreground pointer-events-none">
            <UserCircle className="w-5 h-5" />
          </div>
          <Input
            type="text"
            placeholder={locale === 'ar' ? 'اسم المستخدم أو البريد الإلكتروني' : 'Username or Email'}
            disabled={loading}
            {...register('email')}
            ref={(e) => {
              register('email').ref(e);
              adminCodeInputRef.current = e;
            }}
            className="h-12 ps-11 pe-4 text-center bg-secondary/50 border-border text-foreground placeholder:text-muted-foreground placeholder:font-semibold placeholder:text-sm md:placeholder:font-bold md:placeholder:text-base font-semibold md:font-bold text-base md:text-lg rounded-lg focus-visible:ring-2 focus-visible:ring-primary transition-all"
            dir="ltr"
          />
        </div>
        {errors.email && (
          <p className="text-xs text-red-500 text-center">{errors.email.message}</p>
        )}

        {/* Password */}
        <PasswordInput
          placeholder="••••••••"
          disabled={loading}
          {...register('password')}
          className="h-12 ps-11 pe-10 text-center bg-secondary/50 border-border text-foreground placeholder:text-muted-foreground placeholder:font-semibold placeholder:text-sm md:placeholder:font-bold md:placeholder:text-base font-semibold md:font-bold text-base md:text-lg rounded-lg focus-visible:ring-2 focus-visible:ring-primary transition-all"
        />
        {errors.password && (
          <p className="text-xs text-red-500 text-center">{errors.password.message}</p>
        )}
      </div>

      {isCurrentAccountLocked && banRemainingSeconds !== null && (
        <Alert variant="destructive" className="bg-destructive/10 border-destructive animate-in fade-in slide-in-from-top-2 duration-300">
          <Clock className="h-4 w-4" />
          <AlertDescription className="space-y-3">
            <div className="text-center font-semibold text-sm">
              {locale === 'ar' 
                ? 'الحساب محظور مؤقتاً لأسباب أمنية' 
                : 'Account temporarily locked for security reasons'}
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold font-mono" dir="ltr">
                {Math.floor(banRemainingSeconds / 60).toString().padStart(2, "0")}:{(banRemainingSeconds % 60).toString().padStart(2, "0")}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {locale === 'ar' ? 'الوقت المتبقي للحظر' : 'Remaining ban duration'}
              </div>
            </div>
            <Progress 
              value={((1800 - (banRemainingSeconds ?? 0)) / 1800) * 100} 
              className="h-2"
            />
            <div className="text-xs text-center text-muted-foreground">
              {locale === 'ar' 
                ? 'سيتم رفع الحظر تلقائياً بعد انتهاء المدة' 
                : 'Ban will be automatically lifted after the countdown'}
            </div>
          </AlertDescription>
        </Alert>
      )}

      <Button
        type="submit"
        className="w-full h-12 gap-2 text-lg bg-primary hover:bg-primary/40 text-primary-foreground font-semibold rounded-lg transition-all cursor-pointer"
        disabled={loading || !emailVal || !passwordVal}
      >
        {loading ? (locale === 'ar' ? 'جاري تسجيل الدخول...' : 'Signing in...') : (locale === 'ar' ? 'الدخول' : 'Sign In')}
        {loading && <Loader2 className="h-5 w-5 animate-spin" />}
      </Button>
    </form>
  );
}

function AdminLoginContent() {
  const t = useTranslations('auth');
  const tValidation = useTranslations('validation');
  const { login } = useAuth();
  const params = useParams();
  const router = useRouter();
  const locale = params.locale as string;

  const [loading, setLoading] = useState(false);
  const [showExpiredToast, setShowExpiredToast] = useState(false);
  
  // Security lockout states (5 attempts, 30 minutes cooldown)
  const [attempts, setAttempts] = useState<number>(0);
  const [isLocked, setIsLocked] = useState(false);
  const [lockedEmail, setLockedEmail] = useState<string | null>(null);
  const [banExpiresAt, setBanExpiresAt] = useState<string | null>(null);
  const [banRemainingSeconds, setBanRemainingSeconds] = useState<number | null>(null);
  const adminCodeInputRef = useRef<HTMLInputElement | null>(null);

  const maxAttempts = 5;

  // Check for session expired, prefetch admin dashboard, and auto-focus
  useEffect(() => {
    adminCodeInputRef.current?.focus();
    router.prefetch(`/${locale}/admin`);

    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      if (
        searchParams.get('error') === 'session_expired' ||
        searchParams.get('reason') === 'session_expired'
      ) {
        setShowExpiredToast(true);
        toast.warning(
          locale === 'ar' ? 'انتهت الجلسة' : 'Session Expired',
          {
            description:
              locale === 'ar'
                ? 'انتهت صلاحية جلستك السابقة تلقائياً لدواعي الأمان. يرجى تسجيل الدخول مجدداً.'
                : 'Your previous session expired for security reasons. Please log in again.',
          },
        );
      }
    }
  }, [locale]);

  // Initialize remainingAttempts & lockouts from session
  useEffect(() => {
    try {
      // 1. Clean up legacy un-scoped storage keys that trapped users across accounts
      sessionStorage.removeItem('adminAttempts');
      sessionStorage.removeItem('adminBanExpiresAt');
      localStorage.removeItem('adminAttempts');
      localStorage.removeItem('adminBanExpiresAt');

      // 2. Check for scoped admin lockout
      const stored = sessionStorage.getItem('admin_lockout');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.email && parsed?.expiresAt) {
          const msLeft = new Date(parsed.expiresAt).getTime() - Date.now();
          if (msLeft > 0) {
            setLockedEmail(String(parsed.email).toLowerCase());
            setBanExpiresAt(parsed.expiresAt);
            setIsLocked(true);
            setBanRemainingSeconds(Math.ceil(msLeft / 1000));
          } else {
            sessionStorage.removeItem('admin_lockout');
          }
        }
      }
    } catch (e) { /* ignore */ }
  }, []);

  // Lockout countdown timer effect
  useEffect(() => {
    if (!banExpiresAt) return;
    
    const id = setInterval(() => {
      const ms = new Date(banExpiresAt).getTime() - Date.now();
      const secs = Math.max(0, Math.ceil(ms / 1000));
      setBanRemainingSeconds(secs);
      
      if (secs <= 0) {
        clearInterval(id);
        setIsLocked(false);
        setLockedEmail(null);
        setBanExpiresAt(null);
        setBanRemainingSeconds(null);
        setAttempts(0);
        try {
          sessionStorage.removeItem('admin_lockout');
        } catch (e) { /* ignore */ }
        toast.info(locale === 'ar' ? 'تم رفع الحظر. يمكنك المحاولة مرة أخرى.' : 'Lockout lifted. You can try again.');
      }
    }, 1000);
    
    return () => clearInterval(id);
  }, [banExpiresAt, locale]);

  const onSubmit = async (data: AdminLoginInput) => {
    const inputEmail = data.email.trim().toLowerCase();
    if (
      isLocked &&
      lockedEmail === inputEmail &&
      (banRemainingSeconds ?? 0) > 0
    ) {
      const remainingSeconds = banRemainingSeconds ?? 0;
      const timeLeftText =
        remainingSeconds > 0
          ? formatLockoutDuration(remainingSeconds, locale)
          : locale === 'ar'
            ? 'بضع لحظات'
            : 'a few seconds';

      toast.error(t('lockedTitle'), {
        description: t('lockedDesc', { time: timeLeftText }),
      });
      return;
    }

    setLoading(true);
    try {
      await login('admin', {
        email: inputEmail,
        password: data.password,
      });
      // Reset attempts and lockout on successful login
      setIsLocked(false);
      setLockedEmail(null);
      setBanExpiresAt(null);
      setBanRemainingSeconds(null);
      setAttempts(0);
      try {
        sessionStorage.removeItem('admin_lockout');
        sessionStorage.removeItem('adminAttempts');
        sessionStorage.removeItem('adminBanExpiresAt');
        localStorage.removeItem('adminAttempts');
        localStorage.removeItem('adminBanExpiresAt');
      } catch (e) {}
    } catch (err: any) {
      const errorData = err;

      const isLockedResponse =
        Boolean(errorData?.locked) ||
        errorData?.code === 'ACCOUNT_LOCKED' ||
        typeof errorData?.lockRemainingSeconds === 'number' ||
        typeof errorData?.lockSecs === 'number' ||
        (typeof errorData?.message === 'string' &&
          (errorData.message.includes('قفل الحساب') ||
            errorData.message.toLowerCase().includes('locked')));

      if (isLockedResponse) {
        let lockSecs =
          errorData?.lockRemainingSeconds ??
          errorData?.lockSecs;

        if (typeof lockSecs !== 'number' && typeof errorData?.message === 'string') {
          const match = errorData.message.match(/(\d+)\s*(?:دقيقة|minute)/i);
          if (match && match[1]) {
            lockSecs = parseInt(match[1], 10) * 60;
          }
        }

        if (typeof lockSecs !== "number" || lockSecs <= 0) {
          lockSecs = 1800;
        }

        const banExpiry = new Date(Date.now() + lockSecs * 1000).toISOString();
        setLockedEmail(inputEmail);
        setBanExpiresAt(banExpiry);
        setIsLocked(true);
        setBanRemainingSeconds(lockSecs);
        setAttempts(maxAttempts + 1);
        try {
          sessionStorage.setItem(
            'admin_lockout',
            JSON.stringify({ email: inputEmail, expiresAt: banExpiry }),
          );
        } catch (e) {}

        const timeLeftText = formatLockoutDuration(lockSecs, locale);
        toast.error(t('lockedTitle'), {
          description: t('lockedAttemptsDesc', { time: timeLeftText }),
        });
      } else if (typeof errorData?.attemptsLeft === 'number') {
        const left = errorData.attemptsLeft;
        const failedCount = maxAttempts - left;
        setAttempts(failedCount);

        toast.error(t('loginError'), {
          description:
            locale === 'ar'
              ? `المحاولات المتبقية: ${left} من ${maxAttempts}`
              : `Remaining attempts: ${left} of ${maxAttempts}`,
        });
      } else {
        const localizedFallback = t('loginError');
        const errMsg = getApiErrorMessage(err, localizedFallback);
        toast.error(normalizeAuthErrorMessage(errMsg, locale));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4 md:p-8 relative overflow-hidden"
      style={{ background: "var(--gradient-primary)" }}
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
          <Button 
            variant="ghost" 
            onClick={() => router.push(`/${locale}/login`)} 
            className="self-start gap-2 text-muted-foreground hover:text-foreground cursor-pointer"
          >
            {locale === 'ar' ? (
              <>
                <ArrowRight className="w-4 h-4" />
                الرجوع
              </>
            ) : (
              <>
                <ArrowRight className="w-4 h-4 rotate-180" />
                Back
              </>
            )}
          </Button>

          <img
            src="https://res.cloudinary.com/dkocrxpu4/image/upload/v1770685642/logo_k8bbtk.webp"
            alt="Institute Logo"
            width={144}
            height={144}
            loading="eager"
            className="w-28 h-28 md:w-36 md:h-36 object-contain rounded-full shadow-[var(--shadow-glow)]"
          />

          <div className="text-center">
            <h1 className="text-xl md:text-2xl font-bold text-foreground mb-1">
              {locale === 'ar' ? 'لوحة الإدارة - البوابة الإلكترونية' : 'Admin & Staff Portal'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {locale === 'ar' ? 'الرجاء إدخال اسم المستخدم أو البريد الإلكتروني للدخول' : 'Please enter your username or email to sign in'}
            </p>
          </div>

          {showExpiredToast && (
            <Alert className="w-full border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200 py-3">
              <Clock className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <AlertDescription className="text-xs leading-relaxed text-start">
                {locale === 'ar'
                  ? 'انتهت صلاحية جلستك الإدارية السابقة تلقائياً (الحد الأقصى للجلسة 20 دقيقة). يرجى تسجيل الدخول مجدداً.'
                  : 'Your previous administrative session expired (20-minute limit). Please log in again.'}
              </AlertDescription>
            </Alert>
          )}

          <AdminLoginForm
            onSubmit={onSubmit}
            loading={loading}
            isLocked={isLocked}
            lockedEmail={lockedEmail}
            banRemainingSeconds={banRemainingSeconds}
            locale={locale}
            t={t}
            tValidation={tValidation}
            adminCodeInputRef={adminCodeInputRef}
          />
        </div>
      </Card>

      <Footer role="admin" locale={locale} className="mt-8" />

    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-[#0a1c22]"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}>
      <AdminLoginContent />
    </Suspense>
  );
}
