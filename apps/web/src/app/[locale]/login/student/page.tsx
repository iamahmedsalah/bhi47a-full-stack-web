'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/providers/auth-provider';
import { getApiErrorMessage } from '@/lib/api';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { getStudentLoginSchema, type StudentLoginInput } from '@/lib/validations';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import {
  ArrowRight,
  UserCircle,
  IdCard,
  Loader2,
  Clock
} from 'lucide-react';
import { useAuthStore } from '@/store/auth-store';
import { Footer } from '@/components/ui/footer';
import LangToggle from '@/components/ui/LangToggle';
import { useGoogleSignIn } from '@/hooks/use-google-signin';
import { isChromeBrowser } from '@/utils/browser-check';

type StudentLoginError = {
  locked?: boolean;
  lockRemainingSeconds?: number;
  attemptsLeft?: number;
  message?: string;
};

function StudentLoginContent() {
  const t = useTranslations('auth');
  const tValidation = useTranslations('validation');
  const { login } = useAuth();
  const params = useParams();
  const router = useRouter();
  const locale = params.locale as string;

  const {
    loading,
    isLocked,
    banExpiresAt,
    banRemainingSeconds,
    setLoading,
    setLockoutState,
    tickRemainingSeconds,
  } = useAuthStore();

  const studentCodeInputRef = useRef<HTMLInputElement>(null);

  const schema = getStudentLoginSchema((key) => {
    const translationKey = key.replace('validation.', '');
    return tValidation(translationKey);
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<StudentLoginInput>({
    resolver: zodResolver(schema),
    defaultValues: {
      studentCode: '',
      password: '',
    },
  });

  const studentCodeVal = watch('studentCode');
  const passwordVal = watch('password');
  const googlePromptShownRef = useRef(false);
  const [isChrome, setIsChrome] = useState(false);
  const { renderButton, scriptLoaded, isInitialized, prompt } = useGoogleSignIn({
    locale,
    onSuccess: async (credential) => {
      setLoading(true);
      try {
        await login('google', { credential });
      } catch (err: unknown) {
        toast.error(getApiErrorMessage(err, t('loginError')));
      } finally {
        setLoading(false);
      }
    },
  });

  const [buttonWidth, setButtonWidth] = useState<string>('320');

  useEffect(() => {
    const handleResize = () => {
      const container = document.getElementById('google-signin-btn');
      if (container) {
        // Parent container width minus some safe padding (e.g. 8px on each side)
        const parentW = container.parentElement?.clientWidth || 320;
        const finalW = Math.max(200, Math.min(400, parentW));
        setButtonWidth(String(finalW));
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (scriptLoaded && isInitialized) {
      renderButton('google-signin-btn', {
        theme: 'filled_black',
        size: 'large',
        text: 'continue_with',
        shape: 'pill',
        width: buttonWidth,
      });
    }
  }, [scriptLoaded, isInitialized, renderButton, locale, buttonWidth]);

  useEffect(() => {
    setIsChrome(isChromeBrowser());
  }, []);

  useEffect(() => {
    if (!isChrome || !scriptLoaded || !isInitialized || googlePromptShownRef.current) return;

    googlePromptShownRef.current = true;
    prompt();
  }, [isChrome, isInitialized, prompt, scriptLoaded]);

  // Auto-focus on student code input when component mounts
  useEffect(() => {
    studentCodeInputRef.current?.focus();
  }, []);

  // Initialize remainingAttempts & lockouts from session
  useEffect(() => {
    try {
      const storedRem = sessionStorage.getItem('remainingAttempts');
      if (storedRem !== null) setLockoutState({ remainingAttempts: Number(storedRem) });

      const storedBan = sessionStorage.getItem('banExpiresAt');
      if (storedBan) {
        const msLeft = new Date(storedBan).getTime() - Date.now();
        if (msLeft > 0) {
          setLockoutState({
            banExpiresAt: storedBan,
            isLocked: true,
            banRemainingSeconds: Math.ceil(msLeft / 1000),
          });
        } else {
          sessionStorage.removeItem('banExpiresAt');
          sessionStorage.removeItem('remainingAttempts');
        }
      }
    } catch (e) {
      // ignore sessionStorage security errors
    }
  }, [setLockoutState]);

  // Lockout countdown timer effect
  useEffect(() => {
    if (!banExpiresAt) return;

    const id = setInterval(() => {
      tickRemainingSeconds();

      const state = useAuthStore.getState();
      if (!state.isLocked) {
        clearInterval(id);
        toast.info(locale === 'ar' ? 'تم رفع الحظر. يمكنك المحاولة مرة أخرى.' : 'Lockout lifted. You can try again.');
      }
    }, 1000);

    return () => clearInterval(id);
  }, [banExpiresAt, locale, tickRemainingSeconds]);

  const onSubmit = async (data: StudentLoginInput) => {
    if (isLocked) {
      toast.error(locale === 'ar' ? 'تم حظر الدخول مؤقتاً' : 'Login temporarily locked');
      return;
    }

    setLoading(true);
    try {
      await login('student', {
        studentCode: data.studentCode,
        password: data.password,
      });
      // Reset attempts on successful login
      try {
        sessionStorage.removeItem('remainingAttempts');
        sessionStorage.removeItem('banExpiresAt');
      } catch (e) { }
    } catch (err: unknown) {
      const errorData = err as StudentLoginError;

      if (errorData?.locked) {
        const lockSecs = errorData.lockRemainingSeconds || 1800;
        const banExpiry = new Date(Date.now() + lockSecs * 1000).toISOString();
        setLockoutState({
          banExpiresAt: banExpiry,
          isLocked: true,
          banRemainingSeconds: lockSecs,
          remainingAttempts: 0,
        });

        try {
          sessionStorage.setItem('banExpiresAt', banExpiry);
          sessionStorage.setItem('remainingAttempts', '0');
        } catch (e) { }

        const minutesLeft = Math.ceil(lockSecs / 60);
        toast.error(
          locale === 'ar'
            ? `تم قفل الحساب مؤقتاً بسبب محاولات دخول متكررة. حاول بعد ${minutesLeft} دقيقة`
            : `Account locked due to multiple attempts. Try again after ${minutesLeft} minutes`
        );
      } else if (typeof errorData?.attemptsLeft === 'number') {
        const left = errorData.attemptsLeft;
        setLockoutState({ remainingAttempts: left });
        try {
          sessionStorage.setItem('remainingAttempts', String(left));
        } catch (e) { }

        const errMsg = errorData.message || t('loginError');
        toast.error(
          locale === 'ar'
            ? `${errMsg}. المحاولات المتبقية: ${left}`
            : `${errMsg}. Remaining attempts: ${left}`
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
            src="https://res.cloudinary.com/dkocrxpu4/image/upload/w_144,h_144,c_limit,f_auto,q_auto/v1770685642/logo_k8bbtk.webp"
            alt="Institute Logo"
            width={144}
            height={144}
            loading="eager"
            className="w-28 h-28 md:w-36 md:h-36 object-contain rounded-full shadow-[var(--shadow-glow)]"
          />

          <div className="text-center space-y-2">
            <h1 className="text-lg md:text-2xl font-bold text-foreground">
              {locale === 'ar' ? 'بوابة الطالب' : 'Student Portal'}
            </h1>
            <p className="text-sm md:text-base text-muted-foreground">
              {locale === 'ar' ? 'الدرجات والبريد الأكاديمي' : 'Grades & Academic Email'}
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="w-full space-y-4">
            <div className="space-y-4">

              {/* Academic Code */}
              <div className="relative">
                <div className="absolute inset-y-0 start-3 flex items-center text-muted-foreground pointer-events-none">
                  <UserCircle className="w-5 h-5" />
                </div>
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={10}
                  placeholder={locale === 'ar' ? 'الكود الاكاديمي (6 أرقام)' : 'Academic Code (6 digits)'}
                  disabled={loading}
                  {...register('studentCode', {
                    onChange: (e) => {
                      const val = e.target.value;
                      if (/^\d*$/.test(val) && val.length <= 10) {
                        setValue('studentCode', val);
                      } else {
                        // revert
                        setValue('studentCode', val.replace(/\D/g, '').slice(0, 10));
                      }
                    }
                  })}
                  className="h-12 ps-11 pe-4 text-center bg-secondary/50 border-border text-foreground placeholder:text-muted-foreground placeholder:font-semibold placeholder:text-sm md:placeholder:font-bold md:placeholder:text-base font-semibold md:font-bold text-base md:text-lg rounded-lg focus-visible:ring-2 focus-visible:ring-primary transition-all"
                  dir="ltr"
                />
              </div>
              {errors.studentCode && (
                <p className="text-xs text-red-500 text-center">{errors.studentCode.message}</p>
              )}

              {/* National ID */}
              <div className="relative">
                <div className="absolute inset-y-0 start-3 flex items-center text-muted-foreground pointer-events-none">
                  <IdCard className="w-5 h-5" />
                </div>
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={14}
                  placeholder={locale === 'ar' ? 'الرقم القومي (14 رقم)' : 'National ID (14 digits)'}
                  disabled={loading}
                  {...register('password', {
                    onChange: (e) => {
                      const val = e.target.value;
                      if (/^\d*$/.test(val) && val.length <= 14) {
                        setValue('password', val);
                      } else {
                        setValue('password', val.replace(/\D/g, '').slice(0, 14));
                      }
                    }
                  })}
                  className="h-12 ps-11 pe-4 text-center bg-secondary/50 border-border text-foreground placeholder:text-muted-foreground placeholder:font-semibold placeholder:text-sm md:placeholder:font-bold md:placeholder:text-base font-semibold md:font-bold text-base md:text-lg rounded-lg focus-visible:ring-2 focus-visible:ring-primary transition-all"
                  dir="ltr"
                />
              </div>
              {errors.password && (
                <p className="text-xs text-red-500 text-center">{errors.password.message}</p>
              )}

              {/* Forgot Password Link */}
              <div className="flex justify-end pt-1 px-1">
                <Link
                  href={`/${locale}/forgot-password`}
                  className="text-xs font-semibold text-primary hover:underline hover:text-primary/80 transition-colors"
                >
                  {t('forgotPasswordLink')}
                </Link>
              </div>
            </div>

            {isLocked && banRemainingSeconds !== null && (
              <Alert variant="destructive" className="bg-destructive/10 border-destructive animate-in fade-in slide-in-from-top-2 duration-300">
                <Clock className="h-4 w-4" />
                <AlertDescription className="space-y-3">
                  <div className="text-center font-semibold text-sm">
                    {locale === 'ar'
                      ? 'الحساب محظور مؤقتاً بسبب محاولات الدخول الخاطئة'
                      : 'Login locked temporarily due to failed attempts'}
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
              disabled={loading || !studentCodeVal || !passwordVal}
            >
              {loading ? (locale === 'ar' ? 'جاري تسجيل الدخول...' : 'Signing in...') : (locale === 'ar' ? 'تسجيل الدخول' : 'Sign In')}
              {loading && <Loader2 className="h-5 w-5 animate-spin" />}
            </Button>

            {/* OR Divider */}
            <div className="relative flex items-center justify-center my-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <span className="relative px-3 bg-card/95 text-xs text-muted-foreground uppercase">
                {locale === 'ar' ? 'أو' : 'OR'}
              </span>
            </div>



            {/* Google Login Button */}
            <div className="flex justify-center w-full min-h-[44px]">
              <div id="google-signin-btn" className="w-full overflow-hidden rounded-full flex justify-center" />
            </div>
          </form>
        </div>
      </Card>

      <Footer role="student" locale={locale} className="mt-8" />
    </div>
  );
}

export default function StudentLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-[#0a1c22]"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}>
      <StudentLoginContent />
    </Suspense>
  );
}
