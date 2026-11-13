"use client";
import NextImage from "next/image";

import React, { useState, useEffect, useRef, Suspense } from "react";
import { useTranslations } from "next-intl";
import api, { getApiErrorMessage } from "@/lib/api";
import { useParams, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AlertMessage } from "@/components/ui/feedback";
import { PasswordInput } from "@/components/ui/password-input";
import { toast } from "sonner";
import { ArrowRight, Loader2, KeyRound, MailWarning, Check, X, AlertTriangle } from "lucide-react";
import LangToggle from "@/components/ui/LangToggle";
import { Footer } from "@/components/ui/footer";
import {
  isValidStudentPassword,
  STUDENT_PASSWORD_MAX_LENGTH,
  STUDENT_PASSWORD_MIN_LENGTH,
} from "@student-portal/shared";

function ForgotPasswordContent() {
  const t = useTranslations("auth");
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const locale = params.locale as string;
  const isAr = locale === "ar";

  const [step, setStep] = useState<1 | 2>(1);
  const [identifier, setIdentifier] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const identifierInputRef = useRef<HTMLInputElement>(null);
  const otpInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus on mount
  useEffect(() => {
    if (step === 1) {
      identifierInputRef.current?.focus();
    } else {
      otpInputRef.current?.focus();
    }
  }, [step]);

  const handleStep1Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

    if (!identifier.trim()) {
      setError(isAr ? "الكود الأكاديمي مطلوب" : "Academic Code is required");
      return;
    }

    setLoading(true);
    try {
      const res = await api.post<{ message: string; email?: string }>(
        "/auth/forgot-password",
        { identifier: identifier.trim() },
      );
      const msg = res.data?.message || t("otpSentSuccess");
      toast.success(msg);
      setSuccessMsg(msg);
      setStep(2);
    } catch (err: unknown) {
      setError(
        getApiErrorMessage(
          err,
          isAr ? "فشل إرسال رمز التحقق" : "Failed to send OTP",
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleStep2Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

    if (otp.length !== 6 || !/^\d+$/.test(otp)) {
      setError(
        isAr ? "رمز التحقق يجب أن يتكون من 6 أرقام" : "OTP must be 6 digits",
      );
      return;
    }

    if (!isValidStudentPassword(newPassword)) {
      setError(
        isAr
          ? "يجب أن تتكون كلمة المرور من 8 إلى 100 حرف، وتحتوي على حرف إنجليزي ورقم واحد على الأقل، وبدون مسافات"
          : "Use 8-100 characters with at least one letter and one number, without spaces",
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(isAr ? "كلمتا المرور غير متطابقتين" : "Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const res = await api.post<{ user: unknown; csrfToken: string }>(
        "/auth/reset-password-otp",
        {
          identifier: identifier.trim(),
          otp,
          newPassword,
        },
      );

      queryClient.setQueryData(queryKeys.auth.me, res.data.user);
      toast.success(t("passwordResetSuccess"));
      router.push(`/${locale}/dashboard`);
    } catch (err: unknown) {
      setError(
        getApiErrorMessage(
          err,
          isAr ? "فشل إعادة تعيين كلمة المرور" : "Failed to reset password",
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4 md:p-8 relative overflow-hidden"
      style={{ background: "var(--gradient-primary)" }}
      dir={isAr ? "rtl" : "ltr"}
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

      <Card className="w-full max-w-md bg-card/95 backdrop-blur-sm border-border shadow-[var(--shadow-glow)] p-6 md:p-8 z-10 rounded-2xl">
        <div className="flex flex-col items-center gap-6">
          <Button
            variant="ghost"
            onClick={() => {
              if (step === 2) {
                setStep(1);
                setError("");
              } else {
                router.push(`/${locale}/login/student`);
              }
            }}
            className="self-start gap-2 text-muted-foreground hover:text-foreground cursor-pointer"
          >
            {isAr ? (
              <>
                <ArrowRight className="w-4 h-4" />
                {t("backToLogin")}
              </>
            ) : (
              <>
                <ArrowRight className="w-4 h-4 rotate-180" />
                {t("backToLogin")}
              </>
            )}
          </Button>

          <NextImage unoptimized
            src="https://res.cloudinary.com/dkocrxpu4/image/upload/w_144,h_144,c_limit,f_auto,q_auto/v1770685642/logo_k8bbtk.webp"
            alt="Institute Logo"
            width={144}
            height={144}
            loading="eager"
            className="w-24 h-24 md:w-28 md:h-28 object-contain rounded-full shadow-[var(--shadow-glow)]"
          />

          <div className="text-center space-y-2">
            <h1 className="text-xl font-bold text-foreground">
              {t("forgotPasswordTitle")}
            </h1>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-xs mx-auto">
              {step === 1
                ? t("forgotPasswordDesc")
                : isAr
                  ? "أدخل الرمز وكلمة المرور الجديدة لإكمال الاستعادة"
                  : "Enter verification code and your new password"}
            </p>
          </div>

          {error && <AlertMessage tone="danger">{error}</AlertMessage>}
          {successMsg && (
            <AlertMessage tone="success">{successMsg}</AlertMessage>
          )}

          {step === 1 ? (
            <form onSubmit={handleStep1Submit} className="w-full space-y-4">
              <div className="space-y-1.5 text-start">
                <label className="text-xs font-bold text-foreground flex items-center justify-between">
                  <span>{t("studentCode")}</span>
                  {identifier.length > 0 && (
                    <span className="text-[11px] font-mono text-muted-foreground">
                      {identifier.length}/6
                    </span>
                  )}
                </label>
                <Input
                  ref={identifierInputRef}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  required
                  placeholder={
                    isAr
                      ? "الكود الاكاديمي (6 أرقام)"
                      : "Academic Code (6 digits)"
                  }
                  value={identifier}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (/^\d*$/.test(val) && val.length <= 6) {
                      setIdentifier(val);
                      setError("");
                    }
                  }}
                  disabled={loading}
                  className="h-11 text-center bg-secondary/50 border-border text-foreground font-semibold rounded-lg focus-visible:ring-2 focus-visible:ring-primary transition-all text-lg font-mono tracking-wider"
                  dir="ltr"
                />
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {isAr
                    ? "أدخل الكود الأكاديمي المكون من 6 أرقام المسجل به في المعهد (مثال: 271702)"
                    : "Enter your 6-digit institutional academic code (e.g. 271702)"}
                </p>
              </div>

              <Button
                type="submit"
                disabled={loading || identifier.length < 4}
                className="w-full h-11 gap-2 text-sm bg-primary hover:bg-primary/80 text-primary-foreground font-semibold rounded-lg transition-all cursor-pointer flex items-center justify-center"
              >
                {loading
                  ? isAr
                    ? "جاري الإرسال..."
                    : "Sending..."
                  : t("sendOtp")}
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MailWarning className="h-4 w-4" />
                )}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleStep2Submit} className="w-full space-y-4">
              {/* Verification OTP */}
              <div className="space-y-1.5 text-start">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-foreground">
                    {t("enterOtp")}
                  </label>
                  {otp.length > 0 && (
                    <span
                      className={`text-[11px] font-semibold flex items-center gap-1 ${
                        otp.length === 6 && /^\d+$/.test(otp)
                          ? "text-emerald-400"
                          : "text-muted-foreground"
                      }`}
                    >
                      {otp.length === 6 && /^\d+$/.test(otp) ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>{isAr ? "6 أرقام مكتملة" : "6 digits complete"}</span>
                        </>
                      ) : (
                        <span>{otp.length}/6</span>
                      )}
                    </span>
                  )}
                </div>
                <Input
                  ref={otpInputRef}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  required
                  placeholder={t("otpPlaceholder")}
                  value={otp}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (/^\d*$/.test(val) && val.length <= 6) {
                      setOtp(val);
                      setError("");
                    }
                  }}
                  disabled={loading}
                  className="h-11 text-center bg-secondary/50 border-border text-foreground font-semibold rounded-lg focus-visible:ring-2 focus-visible:ring-primary transition-all text-lg font-mono tracking-widest"
                  dir="ltr"
                />
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {isAr
                    ? "رمز التحقق مكوّن من 6 أرقام مرسل إلى بريدك الإلكتروني"
                    : "Verification code consists of 6 digits sent to your email"}
                </p>
              </div>

              {/* New Password */}
              <div className="space-y-1.5 text-start">
                <label className="text-xs font-bold text-foreground">
                  {t("newPassword")}
                </label>
                <PasswordInput
                  required
                  minLength={STUDENT_PASSWORD_MIN_LENGTH}
                  maxLength={STUDENT_PASSWORD_MAX_LENGTH}
                  autoComplete="new-password"
                  placeholder={
                    isAr
                      ? "8 أحرف مع حرف إنجليزي ورقم"
                      : "8+ characters with a letter and number"
                  }
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    setError("");
                  }}
                  disabled={loading}
                  className="h-11 bg-secondary/50 border-border text-foreground rounded-lg focus-visible:ring-2 focus-visible:ring-primary transition-all text-sm"
                />

                {/* Password Requirements Checklist */}
                {newPassword.length > 0 && (
                  <div className="mt-2 rounded-xl border border-border/80 bg-surface/50 p-3 space-y-1.5 text-xs">
                    <p className="font-semibold text-foreground text-[11px] mb-1">
                      {isAr ? "شروط كلمة المرور المطلوبة:" : "Password requirements:"}
                    </p>
                    <div
                      className={`flex items-center gap-1.5 text-[11px] ${
                        newPassword.length >= STUDENT_PASSWORD_MIN_LENGTH &&
                        newPassword.length <= STUDENT_PASSWORD_MAX_LENGTH
                          ? "text-emerald-400 font-semibold"
                          : "text-muted-foreground"
                      }`}
                    >
                      {newPassword.length >= STUDENT_PASSWORD_MIN_LENGTH &&
                      newPassword.length <= STUDENT_PASSWORD_MAX_LENGTH ? (
                        <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                      ) : (
                        <X className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <span>
                        {isAr
                          ? "من 8 إلى 100 حرف (أنت الآن أدخلت " + newPassword.length + " أحرف)"
                          : "8 to 100 characters (currently " + newPassword.length + ")"}
                      </span>
                    </div>

                    <div
                      className={`flex items-center gap-1.5 text-[11px] ${
                        /[a-zA-Z]/.test(newPassword)
                          ? "text-emerald-400 font-semibold"
                          : "text-muted-foreground"
                      }`}
                    >
                      {/[a-zA-Z]/.test(newPassword) ? (
                        <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                      ) : (
                        <X className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <span>
                        {isAr
                          ? "حرف إنجليزي واحد على الأقل (A-Z أو a-z)"
                          : "At least 1 Latin letter (A-Z or a-z)"}
                      </span>
                    </div>

                    <div
                      className={`flex items-center gap-1.5 text-[11px] ${
                        /\d/.test(newPassword)
                          ? "text-emerald-400 font-semibold"
                          : "text-muted-foreground"
                      }`}
                    >
                      {/\d/.test(newPassword) ? (
                        <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                      ) : (
                        <X className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <span>
                        {isAr
                          ? "رقم واحد على الأقل (0-9)"
                          : "At least 1 number (0-9)"}
                      </span>
                    </div>

                    <div
                      className={`flex items-center gap-1.5 text-[11px] ${
                        !/\s/.test(newPassword) && newPassword.length > 0
                          ? "text-emerald-400 font-semibold"
                          : "text-muted-foreground"
                      }`}
                    >
                      {!/\s/.test(newPassword) && newPassword.length > 0 ? (
                        <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                      ) : (
                        <X className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <span>
                        {isAr ? "بدون أي مسافات" : "No whitespace or spaces"}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Confirm New Password */}
              <div className="space-y-1.5 text-start">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-foreground">
                    {t("confirmNewPassword")}
                  </label>
                  {confirmPassword.length > 0 && (
                    <span
                      className={`text-[11px] font-semibold flex items-center gap-1 ${
                        newPassword === confirmPassword
                          ? "text-emerald-400"
                          : "text-rose-400"
                      }`}
                    >
                      {newPassword === confirmPassword ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                          <span>{isAr ? "كلمتا المرور متطابقتان" : "Passwords match"}</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
                          <span>{isAr ? "غير متطابقتين بعد" : "Passwords do not match yet"}</span>
                        </>
                      )}
                    </span>
                  )}
                </div>
                <PasswordInput
                  required
                  maxLength={STUDENT_PASSWORD_MAX_LENGTH}
                  autoComplete="new-password"
                  placeholder={
                    isAr ? "تأكيد كلمة المرور الجديدة" : "Confirm new password"
                  }
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setError("");
                  }}
                  disabled={loading}
                  className={`h-11 bg-secondary/50 border rounded-lg focus-visible:ring-2 focus-visible:ring-primary transition-all text-sm ${
                    confirmPassword.length > 0
                      ? newPassword === confirmPassword
                        ? "border-emerald-500/50"
                        : "border-rose-500/50"
                      : "border-border"
                  }`}
                />
              </div>

              <Button
                type="submit"
                disabled={
                  loading ||
                  otp.length !== 6 ||
                  !isValidStudentPassword(newPassword) ||
                  newPassword !== confirmPassword
                }
                className="w-full h-11 gap-2 text-sm bg-primary hover:bg-primary/80 text-primary-foreground font-semibold rounded-lg transition-all cursor-pointer flex items-center justify-center mt-2"
              >
                {loading
                  ? isAr
                    ? "جاري إعادة التعيين..."
                    : "Resetting..."
                  : t("resetPassword")}
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="h-4 w-4" />
                )}
              </Button>
            </form>
          )}
        </div>
      </Card>

      <Footer role="student" locale={locale} className="mt-8" />
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#0a1c22]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      }
    >
      <ForgotPasswordContent />
    </Suspense>
  );
}
