'use client';

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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { 
  ArrowRight, 
  UserCircle, 
  Lock, 
  Loader2, 
  Clock, 
  Eye, 
  EyeOff,
  AlertCircle
} from 'lucide-react';
import LangToggle from '@/components/ui/LangToggle';

interface AdminLoginFormProps {
  onSubmit: (data: AdminLoginInput) => Promise<void>;
  loading: boolean;
  isLocked: boolean;
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
  banRemainingSeconds,
  locale,
  t,
  tValidation,
  adminCodeInputRef,
}: AdminLoginFormProps) {
  const [showPassword, setShowPassword] = useState(false);

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

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="w-full space-y-4">
      <div className="space-y-4">
        {/* Admin Code/Email */}
        <div className="relative">
          <div className="absolute inset-y-0 start-3 flex items-center text-muted-foreground pointer-events-none">
            <UserCircle className="w-5 h-5" />
          </div>
          <Input
            type="text"
            placeholder={locale === 'ar' ? 'كود المدير / البريد الإلكتروني' : 'Manager Code / Email'}
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
        <div className="relative">
          <div className="absolute inset-y-0 start-3 flex items-center text-muted-foreground pointer-events-none">
            <Lock className="w-5 h-5" />
          </div>
          <Input
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            disabled={loading}
            {...register('password')}
            className="h-12 ps-11 pe-10 text-center bg-secondary/50 border-border text-foreground placeholder:text-muted-foreground placeholder:font-semibold placeholder:text-sm md:placeholder:font-bold md:placeholder:text-base font-semibold md:font-bold text-base md:text-lg rounded-lg focus-visible:ring-2 focus-visible:ring-primary transition-all"
            dir="ltr"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute inset-y-0 end-3 flex items-center text-muted-foreground hover:text-white transition-colors cursor-pointer"
          >
            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        </div>
        {errors.password && (
          <p className="text-xs text-red-500 text-center">{errors.password.message}</p>
        )}
      </div>

      {isLocked && banRemainingSeconds !== null && (
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
  const [banExpiresAt, setBanExpiresAt] = useState<string | null>(null);
  const [banRemainingSeconds, setBanRemainingSeconds] = useState<number | null>(null);
  const adminCodeInputRef = useRef<HTMLInputElement | null>(null);

  const maxAttempts = 5;

  // Check for session expired and auto-focus
  useEffect(() => {
    adminCodeInputRef.current?.focus();

    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      if (searchParams.get('error') === 'session_expired') {
        setShowExpiredToast(true);
      }
    }
  }, []);

  // Initialize remainingAttempts & lockouts from session
  useEffect(() => {
    try {
      const storedAttempts = sessionStorage.getItem('adminAttempts');
      if (storedAttempts !== null) setAttempts(Number(storedAttempts));
      
      const storedBan = sessionStorage.getItem('adminBanExpiresAt');
      if (storedBan) {
        const msLeft = new Date(storedBan).getTime() - Date.now();
        if (msLeft > 0) {
          setBanExpiresAt(storedBan);
          setIsLocked(true);
          setBanRemainingSeconds(Math.ceil(msLeft / 1000));
        } else {
          sessionStorage.removeItem('adminBanExpiresAt');
          sessionStorage.removeItem('adminAttempts');
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
        setBanExpiresAt(null);
        setBanRemainingSeconds(null);
        setAttempts(0);
        try {
          sessionStorage.removeItem('adminBanExpiresAt');
          sessionStorage.removeItem('adminAttempts');
        } catch (e) { /* ignore */ }
        toast.info(locale === 'ar' ? 'تم رفع الحظر. يمكنك المحاولة مرة أخرى.' : 'Lockout lifted. You can try again.');
      }
    }, 1000);
    
    return () => clearInterval(id);
  }, [banExpiresAt, locale]);

  const onSubmit = async (data: AdminLoginInput) => {
    if (isLocked) {
      toast.error(locale === 'ar' ? 'تم حظر الدخول مؤقتاً' : 'Login temporarily locked');
      return;
    }

    setLoading(true);
    try {
      await login('admin', {
        email: data.email,
        password: data.password,
      });
      // Reset attempts on successful login
      try {
        sessionStorage.removeItem('adminAttempts');
        sessionStorage.removeItem('adminBanExpiresAt');
      } catch (e) {}
    } catch (err: any) {
      const errorData = err;

      if (errorData?.locked) {
        const lockSecs = errorData.lockRemainingSeconds || 1800;
        const banExpiry = new Date(Date.now() + lockSecs * 1000).toISOString();
        setBanExpiresAt(banExpiry);
        setIsLocked(true);
        setBanRemainingSeconds(lockSecs);
        setAttempts(maxAttempts + 1);
        try {
          sessionStorage.setItem('adminBanExpiresAt', banExpiry);
          sessionStorage.setItem('adminAttempts', String(maxAttempts + 1));
        } catch (e) {}

        const minutesLeft = Math.ceil(lockSecs / 60);
        toast.error(
          locale === 'ar'
            ? `تم قفل الحساب مؤقتاً بسبب محاولات دخول متكررة. حاول بعد ${minutesLeft} دقيقة`
            : `Account locked due to multiple attempts. Try again after ${minutesLeft} minutes`
        );
      } else if (typeof errorData?.attemptsLeft === 'number') {
        const left = errorData.attemptsLeft;
        const failedCount = maxAttempts - left;
        setAttempts(failedCount);
        try {
          sessionStorage.setItem('adminAttempts', String(failedCount));
        } catch (e) {}

        const errMsg = errorData.message || t('loginError');
        toast.error(
          locale === 'ar'
            ? `${errMsg}. (محاولة ${failedCount}/${maxAttempts})`
            : `${errMsg}. (Attempt ${failedCount}/${maxAttempts})`
        );
      } else {
        const errMsg = getApiErrorMessage(err, t('loginError'));
        toast.error(errMsg);
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
            <h1 className="text-xl md:text-2xl font-bold text-foreground mb-2">
              {locale === 'ar' ? 'لوحة الإدارة - البوابة الإلكترونية' : 'Admin & Staff Portal'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {locale === 'ar' ? 'الرجاء إدخال كود المدير للدخول' : 'Please enter manager code to login'}
            </p>
          </div>

          <AdminLoginForm
            onSubmit={onSubmit}
            loading={loading}
            isLocked={isLocked}
            banRemainingSeconds={banRemainingSeconds}
            locale={locale}
            t={t}
            tValidation={tValidation}
            adminCodeInputRef={adminCodeInputRef}
          />
        </div>
      </Card>

      <footer className="mt-8 text-center text-[10px] text-muted-foreground z-10 leading-relaxed">
        {locale === 'ar' ? (
          <>
            جميع الحقوق محفوظة، 2026 © <br />
            قسم تكنولوجيا المعلومات - المعهد العالي للعلوم الإدارية المتقدمة والحاسبات
          </>
        ) : (
          <>
            All Rights Reserved, 2026 © <br />
            IT Department - High Institute for Advanced Management Sciences and Computer
          </>
        )}
      </footer>

      {/* Floating Expiry Notification Toast */}
      {showExpiredToast && (
        <div className="fixed bottom-6 end-6 max-w-sm z-50 bg-[#ef4444] text-white rounded-xl shadow-2xl border border-red-500/30 p-4 animate-fade-in flex gap-3 items-start">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-bold text-sm">
              {locale === 'ar' ? 'انتهت الجلسة' : 'Session Expired'}
            </h4>
            <p className="text-xs text-white/90 leading-normal">
              {locale === 'ar' 
                ? 'لقد انتهت صلاحية جلستك. الرجاء تسجيل الدخول مرة أخرى.' 
                : 'Your session has expired. Please log in again.'}
            </p>
          </div>
          <button
            onClick={() => setShowExpiredToast(false)}
            className="text-white/60 hover:text-white text-xs font-bold font-mono px-1 rounded hover:bg-white/10 cursor-pointer"
          >
            ×
          </button>
        </div>
      )}
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
