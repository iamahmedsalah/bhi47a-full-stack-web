"use client";
import { PasskeyLoginButton } from '@/components/auth/passkey-login-button';

import React, { useState, useEffect, useRef, Suspense } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/providers/auth-provider";
import { getApiErrorDetails, getApiErrorMessage } from "@/lib/api";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  getStudentLoginSchema,
  type StudentLoginInput,
} from "@/lib/validations";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { formatLockoutDuration, normalizeAuthErrorMessage } from "@/lib/auth-toast";
import {
  ArrowRight,
  UserCircle,
  Loader2,
  Clock,
  ShieldAlert,
  X,
} from "lucide-react";
import { STUDENT_PASSWORD_MAX_LENGTH } from "@student-portal/shared";
import { useAuthStore } from "@/store/auth-store";
import { Footer } from "@/components/ui/footer";
import LangToggle from "@/components/ui/LangToggle";
import { useGoogleSignIn } from "@/hooks/use-google-signin";
import { isChromeBrowser } from "@/utils/browser-check";

type StudentLoginError = {
  locked?: boolean;
  lockRemainingSeconds?: number;
  lockSecs?: number;
  attemptsLeft?: number;
  code?: string;
  message?: string;
};

function createBanExpiry(lockSeconds: number) {
  return new Date(Date.now() + lockSeconds * 1000).toISOString();
}

function StudentLoginContent() {
  const t = useTranslations("auth");
  const tValidation = useTranslations("validation");
  const tCommon = useTranslations("common");
  const { login } = useAuth();
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = params.locale as string;
  const returnUrl = searchParams.get("returnUrl");
  const isSessionExpired =
    searchParams.get("reason") === "session_expired" ||
    searchParams.get("error") === "session_expired";

  const {
    loading,
    isLocked,
    lockedIdentifier,
    banExpiresAt,
    banRemainingSeconds,
    setLoading,
    setLockoutState,
    tickRemainingSeconds,
    resetLockout,
  } = useAuthStore();

  const studentCodeInputRef = useRef<HTMLInputElement>(null);

  const schema = getStudentLoginSchema((key) => {
    const translationKey = key.replace("validation.", "");
    return tValidation(translationKey);
  });

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<StudentLoginInput>({
    resolver: zodResolver(schema),
    defaultValues: {
      studentCode: "",
      password: "",
    },
  });

  const [studentCodeVal, passwordVal] = useWatch({
    control,
    name: ["studentCode", "password"],
  });

  const normalizedInputCode = (studentCodeVal || "").trim();
  const isCurrentAccountLocked =
    isLocked &&
    Boolean(lockedIdentifier) &&
    normalizedInputCode === lockedIdentifier &&
    (banRemainingSeconds ?? 0) > 0;
  const [googleAuthNotice, setGoogleAuthNotice] = useState<{
    title: string;
    description: string;
    type: "not_linked" | "pending" | "error";
  } | null>(null);

  const googlePromptShownRef = useRef(false);
  const { renderButton, scriptLoaded, isInitialized, prompt } = useGoogleSignIn(
    {
      locale,
      onSuccess: async (credential, flow) => {
        setLoading(true);
        setGoogleAuthNotice(null);
        try {
          await login("google", { credential, ...flow }, { returnUrl });
        } catch (err: unknown) {
          const errDetails = getApiErrorDetails(err);
          const rawMessage = getApiErrorMessage(err, t("loginError"));

          if (
            errDetails.code === "GOOGLE_ACCOUNT_NOT_LINKED" ||
            rawMessage.includes("غير مرتبط") ||
            rawMessage.toLowerCase().includes("not linked")
          ) {
            const title =
              locale === "ar"
                ? "حساب Google غير مرتبط بالنظام"
                : "Google Account Not Linked";
            const description =
              locale === "ar"
                ? "هذا البريد غير مرتبط بأي حساب طالب مسجل بعد. يرجى تسجيل الدخول بكود الطالب والرقم القومي في النموذج أعلاه، ثم ربط حساب Google من صفحة الملف الشخصي لتمكين الدخول السريع."
                : "This Google account is not linked to any registered student. Please log in using your Student Code and Password/National ID above, then link your Google account from your Profile page for fast 1-click access.";
            setGoogleAuthNotice({ title, description, type: "not_linked" });
            toast.error(title, { description, duration: 6000 });
          } else if (
            errDetails.code === "GOOGLE_LINK_PENDING" ||
            rawMessage.includes("معلق") ||
            rawMessage.toLowerCase().includes("pending")
          ) {
            const title =
              locale === "ar"
                ? "تأكيد ربط حساب Google قيد الانتظار"
                : "Google Link Pending Verification";
            const description =
              locale === "ar"
                ? "تم طلب ربط هذا الحساب ولكن لم يتم تأكيد رمز التحقق (OTP) بعد. يرجى تسجيل الدخول بكود الطالب وإتمام التحقق في الملف الشخصي."
                : "Google linking is pending verification. Please sign in with your Student Code and verify the OTP in your Profile.";
            setGoogleAuthNotice({ title, description, type: "pending" });
            toast.error(title, { description, duration: 6000 });
          } else {
            toast.error(rawMessage);
          }
        } finally {
          setLoading(false);
        }
      },
    },
  );

  useEffect(() => {
    if (googleAuthNotice) {
      setGoogleAuthNotice(null);
    }
  }, [studentCodeVal, passwordVal]);

  const [buttonWidth, setButtonWidth] = useState<string>("320");

  useEffect(() => {
    const handleResize = () => {
      const container = document.getElementById("google-signin-btn");
      if (container) {
        // Parent container width minus some safe padding (e.g. 8px on each side)
        const parentW = container.parentElement?.clientWidth || 320;
        const finalW = Math.max(200, Math.min(400, parentW));
        setButtonWidth(String(finalW));
      }
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (scriptLoaded && isInitialized) {
      renderButton("google-signin-btn", {
        theme: "filled_black",
        size: "large",
        text: "continue_with",
        shape: "pill",
        width: buttonWidth,
      });
    }
  }, [scriptLoaded, isInitialized, renderButton, locale, buttonWidth]);

  useEffect(() => {
    if (
      !isChromeBrowser() ||
      !scriptLoaded ||
      !isInitialized ||
      googlePromptShownRef.current
    )
      return;

    googlePromptShownRef.current = true;
    prompt();
  }, [isInitialized, prompt, scriptLoaded]);

  // Auto-focus on student code input and prefetch dashboard when component mounts
  useEffect(() => {
    studentCodeInputRef.current?.focus();
    router.prefetch(`/${locale}/dashboard`);
  }, [router, locale]);

  // Initialize remainingAttempts & lockouts from session
  useEffect(() => {
    try {
      // 1. Clean up legacy un-scoped storage keys that trapped users across accounts
      sessionStorage.removeItem("remainingAttempts");
      sessionStorage.removeItem("banExpiresAt");
      localStorage.removeItem("remainingAttempts");
      localStorage.removeItem("banExpiresAt");

      // 2. Check for scoped student lockout
      const stored = sessionStorage.getItem("student_lockout");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.identifier && parsed?.expiresAt) {
          const msLeft = new Date(parsed.expiresAt).getTime() - Date.now();
          if (msLeft > 0) {
            setLockoutState({
              lockedIdentifier: String(parsed.identifier),
              banExpiresAt: parsed.expiresAt,
              isLocked: true,
              banRemainingSeconds: Math.ceil(msLeft / 1000),
              remainingAttempts: 0,
            });
          } else {
            sessionStorage.removeItem("student_lockout");
          }
        }
      }
    } catch {
      // ignore storage access errors
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
        try {
          sessionStorage.removeItem("student_lockout");
        } catch {}
        toast.info(
          locale === "ar"
            ? "تم رفع الحظر. يمكنك المحاولة مرة أخرى."
            : "Lockout lifted. You can try again.",
        );
      }
    }, 1000);

    return () => clearInterval(id);
  }, [banExpiresAt, locale, tickRemainingSeconds]);

  const onSubmit = async (data: StudentLoginInput) => {
    const inputCode = data.studentCode.trim();
    if (
      isLocked &&
      lockedIdentifier === inputCode &&
      (banRemainingSeconds ?? 0) > 0
    ) {
      const remainingSeconds = banRemainingSeconds ?? 0;
      const timeLeftText =
        remainingSeconds > 0
          ? formatLockoutDuration(remainingSeconds, locale)
          : locale === "ar"
            ? "بضع لحظات"
            : "a few seconds";

      toast.error(t("lockedTitle"), {
        description: t("lockedDesc", { time: timeLeftText }),
      });
      return;
    }

    setLoading(true);
    try {
      await login(
        "student",
        {
          studentCode: inputCode,
          password: data.password,
        },
        { returnUrl },
      );
      // Reset lockout and attempts on successful login
      resetLockout();
      try {
        sessionStorage.removeItem("student_lockout");
        sessionStorage.removeItem("remainingAttempts");
        sessionStorage.removeItem("banExpiresAt");
        localStorage.removeItem("remainingAttempts");
        localStorage.removeItem("banExpiresAt");
      } catch {}
    } catch (err: unknown) {
      const errorData = err as StudentLoginError;
      const isLockedResponse =
        Boolean(errorData?.locked) ||
        errorData?.code === "ACCOUNT_LOCKED" ||
        typeof errorData?.lockRemainingSeconds === "number" ||
        typeof errorData?.lockSecs === "number" ||
        (typeof errorData?.message === "string" &&
          (errorData.message.includes("قفل الحساب") ||
            errorData.message.toLowerCase().includes("locked")));

      if (isLockedResponse) {
        let lockSecs =
          errorData?.lockRemainingSeconds ??
          errorData?.lockSecs;

        if (typeof lockSecs !== "number" && typeof errorData?.message === "string") {
          const match = errorData.message.match(/(\d+)\s*(?:دقيقة|minute)/i);
          if (match && match[1]) {
            lockSecs = parseInt(match[1], 10) * 60;
          }
        }

        if (typeof lockSecs !== "number" || lockSecs <= 0) {
          lockSecs = 1800;
        }

        const banExpiry = createBanExpiry(lockSecs);
        setLockoutState({
          lockedIdentifier: inputCode,
          banExpiresAt: banExpiry,
          isLocked: true,
          banRemainingSeconds: lockSecs,
          remainingAttempts: 0,
        });

        try {
          sessionStorage.setItem(
            "student_lockout",
            JSON.stringify({ identifier: inputCode, expiresAt: banExpiry }),
          );
        } catch {}

        const timeLeftText = formatLockoutDuration(lockSecs, locale);
        toast.error(t("lockedTitle"), {
          description: t("lockedAttemptsDesc", { time: timeLeftText }),
        });
      } else if (typeof errorData?.attemptsLeft === "number") {
        const left = errorData.attemptsLeft;
        setLockoutState({ remainingAttempts: left });

        toast.error(t("loginError"), {
          description: t("remainingAttemptsDesc", { count: left }),
        });
      } else {
        const localizedFallback = t("loginError");
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
      dir={locale === "ar" ? "rtl" : "ltr"}
    >
      {/* Background Gradients */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -right-1/2 w-full h-full rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-1/2 -left-1/2 w-full h-full rounded-full bg-accent/5 blur-3xl" />
      </div>

      {/* Language Switcher */}
      <div className="absolute top-6 inset-e-6 z-10">
        <LangToggle />
      </div>

      <Card className="w-full max-w-md bg-card/95 backdrop-blur-sm border-border shadow-(--shadow-glow) p-6 md:p-8 z-10">
        <div className="flex flex-col items-center gap-6">
          <Button
            variant="ghost"
            onClick={() => router.push(`/${locale}/login`)}
            className="self-start gap-2 text-muted-foreground hover:text-foreground cursor-pointer"
          >
            {locale === "ar" ? (
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

          <Image
            src="https://res.cloudinary.com/dkocrxpu4/image/upload/w_144,h_144,c_limit,f_auto,q_auto/v1770685642/logo_k8bbtk.webp"
            alt="Institute Logo"
            width={144}
            height={144}
            preload
            className="w-28 h-28 md:w-36 md:h-36 object-contain rounded-full shadow-(--shadow-glow)"
          />

          <div className="text-center space-y-2">
            <h1 className="text-lg md:text-2xl font-bold text-foreground">
              {locale === "ar" ? "بوابة الطالب" : "Student Portal"}
            </h1>
          </div>

          {isSessionExpired && (
            <Alert className="w-full border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200 py-3">
              <Clock className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <AlertDescription className="text-xs leading-relaxed text-start">
                {locale === "ar"
                  ? "انتهت جلستك الأكاديمية السابقة تلقائياً لدواعي الأمان (الحد الأقصى للجلسة 20 دقيقة). يرجى تسجيل الدخول مجدداً للمتابعة."
                  : "Your previous session has expired automatically for security (20-minute limit). Please log in again to continue."}
              </AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="w-full space-y-4">
            <div className="space-y-4">
              {/* Academic Code */}
              <div className="relative">
                <div className="absolute inset-y-0 inset-s-3 flex items-center text-muted-foreground pointer-events-none">
                  <UserCircle className="w-5 h-5" />
                </div>
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={10}
                  placeholder={
                    locale === "ar"
                      ? "الكود الاكاديمي (6 أرقام)"
                      : "Academic Code (6 digits)"
                  }
                  disabled={loading}
                  {...register("studentCode", {
                    onChange: (e) => {
                      const val = e.target.value;
                      if (/^\d*$/.test(val) && val.length <= 10) {
                        setValue("studentCode", val);
                      } else {
                        // revert
                        setValue(
                          "studentCode",
                          val.replace(/\D/g, "").slice(0, 10),
                        );
                      }
                    },
                  })}
                  className="h-12 ps-11 pe-4 text-center bg-secondary/50 border-border text-foreground placeholder:text-muted-foreground placeholder:font-semibold placeholder:text-sm md:placeholder:font-bold md:placeholder:text-base font-semibold md:font-bold text-base md:text-lg rounded-lg focus-visible:ring-2 focus-visible:ring-primary transition-all"
                  dir="ltr"
                />
              </div>
              {errors.studentCode && (
                <p className="text-xs text-red-500 text-center">
                  {errors.studentCode.message}
                </p>
              )}

              {/* National ID or permanent password */}
              <PasswordInput
                maxLength={STUDENT_PASSWORD_MAX_LENGTH}
                autoComplete="current-password"
                placeholder={
                  locale === "ar"
                    ? "الرقم القومي أو كلمة المرور"
                    : "National ID or password"
                }
                disabled={loading}
                {...register("password")}
                className="h-12 text-center bg-secondary/50 border-border text-foreground placeholder:text-muted-foreground placeholder:font-semibold placeholder:text-sm md:placeholder:font-bold md:placeholder:text-base font-semibold md:font-bold text-base md:text-lg rounded-lg focus-visible:ring-2 focus-visible:ring-primary transition-all"
                dir="ltr"
              />
              {errors.password && (
                <p className="text-xs text-red-500 text-center">
                  {errors.password.message}
                </p>
              )}

              {/* Forgot Password Link */}
              <div className="flex justify-end pt-1 px-1">
                <Link
                  href={`/${locale}/forgot-password`}
                  className="text-xs font-semibold text-primary hover:underline hover:text-primary/80 transition-colors"
                >
                  {t("forgotPasswordLink")}
                </Link>
              </div>
            </div>

            {isCurrentAccountLocked && banRemainingSeconds !== null && (
              <Alert
                variant="destructive"
                className="bg-destructive/10 border-destructive animate-in fade-in slide-in-from-top-2 duration-300"
              >
                <Clock className="h-4 w-4" />
                <AlertDescription className="space-y-3">
                  <div className="text-center font-semibold text-sm">
                    {locale === "ar"
                      ? "الحساب محظور مؤقتاً بسبب محاولات الدخول الخاطئة"
                      : "Login locked temporarily due to failed attempts"}
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold font-mono" dir="ltr">
                      {Math.floor(banRemainingSeconds / 60)
                        .toString()
                        .padStart(2, "0")}
                      :{(banRemainingSeconds % 60).toString().padStart(2, "0")}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {locale === "ar"
                        ? "الوقت المتبقي للحظر"
                        : "Remaining ban duration"}
                    </div>
                  </div>
                  <Progress
                    value={((1800 - (banRemainingSeconds ?? 0)) / 1800) * 100}
                    className="h-2"
                  />
                  <div className="text-xs text-center text-muted-foreground">
                    {locale === "ar"
                      ? "سيتم رفع الحظر تلقائياً بعد انتهاء المدة"
                      : "Ban will be automatically lifted after the countdown"}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            <Button
              type="submit"
              className="w-full h-12 gap-2 text-lg bg-primary hover:bg-primary/40 text-primary-foreground font-semibold rounded-lg transition-all cursor-pointer"
              disabled={loading || !studentCodeVal || !passwordVal}
            >
              {loading
                ? locale === "ar"
                  ? "جاري تسجيل الدخول..."
                  : "Signing in..."
                : locale === "ar"
                  ? "تسجيل الدخول"
                  : "Sign In"}
              {loading && <Loader2 className="h-5 w-5 animate-spin" />}
            </Button>

            {/* OR Divider */}
            <div className="relative flex items-center justify-center my-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <span className="relative px-3 bg-card/95 text-xs text-muted-foreground uppercase">
                {locale === "ar" ? "أو" : "OR"}
              </span>
            </div>

            {/* Google Unlinked Account Friendly Validation Notice */}
            {googleAuthNotice && (
              <Alert className="auth-google-notice flex items-start gap-3 rounded-xl p-4 text-start">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-squircle bg-amber-400/10 text-amber-300" aria-hidden="true">
                  <ShieldAlert className="size-5" strokeWidth={2} />
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-xs font-semibold leading-relaxed text-foreground">
                    {googleAuthNotice.title}
                  </p>
                  <AlertDescription className="text-xs leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
                    {googleAuthNotice.description}
                  </AlertDescription>
                </div>
                <button
                  type="button"
                  aria-label={tCommon("close")}
                  onClick={() => setGoogleAuthNotice(null)}
                  className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-squircle text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </Alert>
            )}

            <PasskeyLoginButton returnUrl={returnUrl} />
            {/* Google Login Button */}
            <div className="flex justify-center w-full min-h-11">
              <div
                id="google-signin-btn"
                className="w-full overflow-hidden rounded-full flex justify-center"
              />
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
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#0a1c22]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      }
    >
      <StudentLoginContent />
    </Suspense>
  );
}
