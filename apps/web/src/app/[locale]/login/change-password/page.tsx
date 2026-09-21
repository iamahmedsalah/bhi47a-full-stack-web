"use client";

import React, { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/providers/auth-provider";
import { getApiErrorMessage } from "@/lib/api";
import { useParams, useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { toast } from "sonner";
import {
  Lock,
  Loader2,
  KeyRound,
  Check,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  AlertCircle,
  AlertTriangle,
  X,
} from "lucide-react";
import LangToggle from "@/components/ui/LangToggle";
import api from "@/lib/api";
import {
  isValidStudentPassword,
  STUDENT_PASSWORD_MAX_LENGTH,
  STUDENT_PASSWORD_MIN_LENGTH,
} from "@student-portal/shared";

export default function ChangePasswordPage() {
  const t = useTranslations("auth");
  const { user } = useAuth();
  const params = useParams();
  const router = useRouter();
  const locale = (params.locale as string) || "ar";
  const isArabic = locale.startsWith("ar");

  // Multi-step state: 1 = Current Password, 2 = New Password & Confirm, 3 = Success
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);

  // Form values
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Validation errors
  const [step1Error, setStep1Error] = useState("");
  const [step2Error, setStep2Error] = useState("");

  // Password strength calculation
  const strengthChecks = useMemo(() => {
    return {
      length:
        newPassword.length >= STUDENT_PASSWORD_MIN_LENGTH &&
        newPassword.length <= STUDENT_PASSWORD_MAX_LENGTH,
      hasLetter: /[A-Za-z]/.test(newPassword),
      hasNumber: /[0-9]/.test(newPassword),
      hasSpecial: /[^A-Za-z0-9]/.test(newPassword),
      hasNoWhitespace: !/\s/.test(newPassword),
    };
  }, [newPassword]);

  const strengthScore = useMemo(() => {
    let score = 0;
    if (strengthChecks.length) score += 25;
    if (strengthChecks.hasLetter) score += 25;
    if (strengthChecks.hasNumber) score += 25;
    if (strengthChecks.hasSpecial) score += 25;
    return score;
  }, [strengthChecks]);

  const strengthLabel = useMemo(() => {
    if (!newPassword) return "";
    if (strengthScore <= 25) return isArabic ? "ضعيفة" : "Weak";
    if (strengthScore <= 50) return isArabic ? "مقبولة" : "Fair";
    if (strengthScore <= 75) return isArabic ? "جيدة ومناسبة" : "Good";
    return isArabic ? "قوية ومحمية ممتاز" : "Very Strong";
  }, [strengthScore, newPassword, isArabic]);

  const strengthColor = useMemo(() => {
    if (strengthScore <= 25) return "bg-rose-500";
    if (strengthScore <= 50) return "bg-amber-500";
    if (strengthScore <= 75) return "bg-yellow-400";
    return "bg-emerald-500";
  }, [strengthScore]);

  const isMatching = useMemo(() => {
    if (!confirmPassword) return null;
    return newPassword === confirmPassword;
  }, [newPassword, confirmPassword]);

  const handleStep1Next = (e: React.FormEvent) => {
    e.preventDefault();
    setStep1Error("");
    if (!currentPassword.trim()) {
      setStep1Error(
        isArabic
          ? "يرجى إدخال كلمة المرور الحالية أو الافتراضية للمتابعة"
          : "Please enter your current default password to continue",
      );
      return;
    }
    setCurrentStep(2);
  };

  const handleFinalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStep2Error("");

    if (!isValidStudentPassword(newPassword)) {
      setStep2Error(
        isArabic
          ? "يجب أن تتكون كلمة المرور من 8 إلى 100 حرف، وتحتوي على حرف إنجليزي ورقم واحد على الأقل، وبدون مسافات"
          : "Use 8-100 characters with at least one letter and one number, without spaces",
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setStep2Error(
        isArabic
          ? "كلمتا المرور غير متطابقتين، يرجى التأكد من تطابقهما"
          : "Passwords do not match. Please verify and retry",
      );
      return;
    }

    if (newPassword === currentPassword) {
      setStep2Error(
        isArabic
          ? "يجب أن تكون كلمة المرور الجديدة مختلفة عن كلمة المرور الحالية"
          : "New password must be different from your current password",
      );
      return;
    }

    setLoading(true);
    try {
      await api.post("/auth/change-password", {
        currentPassword,
        newPassword,
      });

      setCurrentStep(3);
      toast.success(
        isArabic
          ? "تم تغيير وتأمين كلمة المرور بنجاح!"
          : "Password secured and changed successfully!",
      );

      if (user) {
        user.mustChangePassword = false;
      }

      setTimeout(() => {
        window.location.reload();
      }, 1600);
    } catch (err) {
      const msg = getApiErrorMessage(
        err,
        isArabic ? "تعذر حفظ كلمة المرور" : "Error updating password",
      );
      setStep2Error(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4 md:p-8 relative overflow-hidden bg-background"
      style={{ background: "var(--gradient-primary)" }}
      dir={isArabic ? "rtl" : "ltr"}
    >
      {/* Ambient background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/3 -right-1/3 w-full h-full rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-1/3 -left-1/3 w-full h-full rounded-full bg-emerald-500/10 blur-3xl" />
      </div>

      {/* Language Switcher */}
      <div className="absolute top-6 end-6 z-10">
        <LangToggle />
      </div>

      <Card className="w-full max-w-lg bg-card/95 backdrop-blur-md border border-primary/20 shadow-2xl p-6 md:p-9 z-10 rounded-3xl">
        {/* Step Indicator Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary shadow-sm">
                <KeyRound className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg md:text-xl font-bold text-foreground truncate">
                  {isArabic
                    ? "تغيير وتأمين كلمة المرور"
                    : "Secure Your Account Password"}
                </h1>
                <p className="text-xs text-muted-foreground truncate">
                  {isArabic
                    ? "يلزم تحديث كلمة المرور الافتراضية لحماية بياناتك الأكاديمية"
                    : "Mandatory password update before accessing the student portal"}
                </p>
              </div>
            </div>
            <span className="shrink-0 whitespace-nowrap rounded-full bg-primary/10 border border-primary/30 px-3 py-1 text-xs font-bold text-primary inline-flex items-center gap-1">
              {currentStep === 3 ? (
                <>
                  <Check className="h-3.5 w-3.5 text-primary" />
                  <span>{isArabic ? "مكتمل" : "Done"}</span>
                </>
              ) : isArabic ? (
                `الخطوة ${currentStep} من 2`
              ) : (
                `Step ${currentStep} of 2`
              )}
            </span>
          </div>

          {/* Stepper Progress Line */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <div
              className={`h-1.5 rounded-full transition-all duration-300 ${
                currentStep >= 1 ? "bg-primary" : "bg-muted"
              }`}
            />
            <div
              className={`h-1.5 rounded-full transition-all duration-300 ${
                currentStep >= 2 ? "bg-primary" : "bg-muted"
              }`}
            />
          </div>
        </div>

        {/* STEP 1: Current Password */}
        {currentStep === 1 && (
          <form
            onSubmit={handleStep1Next}
            className="space-y-5 animate-fade-in"
          >
            <div className="rounded-2xl border border-border/80 bg-background/60 p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <Lock className="h-4 w-4 text-primary" />
                <span>
                  {isArabic
                    ? "الخطوة الأولى: التحقق من الهوية"
                    : "Step 1: Verify Current Identity"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {isArabic
                  ? "أدخل كلمة المرور الحالية المسجلة لحسابك (غالباً ما تكون الرقم القومي أو المعطاة من إدارة المعهد) للتحقق من هويتك."
                  : "Enter your current temporary password (commonly your National ID or the one assigned by the institute)."}
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground flex items-center justify-between">
                <span>
                  {isArabic
                    ? "كلمة المرور الحالية أو الافتراضية *"
                    : "Current / Default Password *"}
                </span>
              </label>
              <PasswordInput
                placeholder="••••••••••••"
                value={currentPassword}
                onChange={(e) => {
                  setCurrentPassword(e.target.value);
                  setStep1Error("");
                }}
                className="h-12 bg-secondary/40 border-border text-foreground rounded-xl text-sm"
                autoFocus
              />
              {step1Error && (
                <p className="text-xs text-rose-500 flex items-center gap-1 mt-1 font-medium">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>{step1Error}</span>
                </p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full h-12 gap-2 text-sm font-bold bg-primary hover:bg-primary/85 text-primary-foreground rounded-xl transition-all cursor-pointer shadow-md"
            >
              <span>
                {isArabic
                  ? "المتابعة لتعيين كلمة المرور الجديدة"
                  : "Continue to Set New Password"}
              </span>
              {isArabic ? (
                <ArrowLeft className="h-4 w-4" />
              ) : (
                <ArrowRight className="h-4 w-4" />
              )}
            </Button>
          </form>
        )}

        {/* STEP 2: New Password, Strength Meter & Confirmation */}
        {currentStep === 2 && (
          <form
            onSubmit={handleFinalSubmit}
            className="space-y-5 animate-fade-in"
          >
            {step2Error && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-400 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{step2Error}</span>
              </div>
            )}

            {/* New Password Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground">
                {isArabic ? "كلمة المرور الجديدة *" : "New Password *"}
              </label>
              <PasswordInput
                placeholder="••••••••••••"
                disabled={loading}
                maxLength={STUDENT_PASSWORD_MAX_LENGTH}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setStep2Error("");
                }}
                className="h-12 bg-secondary/40 border-border text-foreground rounded-xl text-sm"
                autoFocus
              />

              {/* Password Strength Meter */}
              {newPassword && (
                <div className="space-y-2 pt-1.5 animate-fade-in">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">
                      {isArabic ? "قوة كلمة المرور:" : "Password Strength:"}
                    </span>
                    <span className="font-bold text-foreground">
                      {strengthLabel}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-secondary/80">
                    <div
                      className={`h-full ${strengthColor} transition-all duration-300 rounded-full`}
                      style={{ width: `${strengthScore}%` }}
                    />
                  </div>

                  {/* Requirements checklist */}
                  <div className="grid grid-cols-2 gap-1.5 pt-1 text-[11px]">
                    <div
                      className={`flex items-center gap-1.5 ${
                        strengthChecks.length
                          ? "text-emerald-400 font-semibold"
                          : "text-muted-foreground"
                      }`}
                    >
                      {strengthChecks.length ? (
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <X className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      <span>
                        {isArabic
                          ? "8 أحرف كحد أدنى (مطلوب)"
                          : "8+ characters (Required)"}
                      </span>
                    </div>

                    <div
                      className={`flex items-center gap-1.5 ${
                        strengthChecks.hasLetter
                          ? "text-emerald-400 font-semibold"
                          : "text-muted-foreground"
                      }`}
                    >
                      {strengthChecks.hasLetter ? (
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <X className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      <span>
                        {isArabic
                          ? "حرف إنجليزي واحد على الأقل"
                          : "At least 1 letter (Required)"}
                      </span>
                    </div>

                    <div
                      className={`flex items-center gap-1.5 ${
                        strengthChecks.hasNumber
                          ? "text-emerald-400 font-semibold"
                          : "text-muted-foreground"
                      }`}
                    >
                      {strengthChecks.hasNumber ? (
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <X className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      <span>
                        {isArabic ? "رقم واحد على الأقل" : "At least 1 number"}
                      </span>
                    </div>

                    <div
                      className={`flex items-center gap-1.5 ${
                        strengthChecks.hasNoWhitespace
                          ? "text-emerald-400 font-semibold"
                          : "text-muted-foreground"
                      }`}
                    >
                      {strengthChecks.hasNoWhitespace ? (
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <X className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      <span>
                        {isArabic
                          ? "بدون مسافات (مطلوب)"
                          : "No spaces (Required)"}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Confirm Password Input */}
            <div className="space-y-1.5 pt-1">
              <label className="text-xs font-bold text-foreground flex items-center justify-between">
                <span>
                  {isArabic
                    ? "تأكيد كلمة المرور الجديدة *"
                    : "Confirm New Password *"}
                </span>
                {isMatching !== null && (
                  <span
                    className={`text-[11px] font-bold inline-flex items-center gap-1 shrink-0 ${
                      isMatching ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {isMatching ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        <span>
                          {isArabic
                            ? "كلمتا المرور متطابقتان"
                            : "Passwords match"}
                        </span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="h-3.5 w-3.5" />
                        <span>
                          {isArabic
                            ? "غير متطابقتين بعد"
                            : "Passwords do not match"}
                        </span>
                      </>
                    )}
                  </span>
                )}
              </label>
              <PasswordInput
                placeholder="••••••••••••"
                disabled={loading}
                maxLength={STUDENT_PASSWORD_MAX_LENGTH}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setStep2Error("");
                }}
                className={`h-12 bg-secondary/40 rounded-xl text-sm transition-colors ${
                  isMatching === true
                    ? "border-emerald-500/50 focus:border-emerald-500"
                    : isMatching === false
                      ? "border-rose-500/50 focus:border-rose-500"
                      : "border-border"
                }`}
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3 pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setStep2Error("");
                  setCurrentStep(1);
                }}
                disabled={loading}
                className="h-12 px-4 rounded-xl border border-border"
              >
                {isArabic ? (
                  <ArrowRight className="h-4 w-4" />
                ) : (
                  <ArrowLeft className="h-4 w-4" />
                )}
                <span>{isArabic ? "السابق" : "Back"}</span>
              </Button>

              <Button
                type="submit"
                disabled={
                  loading ||
                  !isValidStudentPassword(newPassword) ||
                  isMatching !== true
                }
                className="flex-1 h-12 gap-2 text-sm font-bold bg-primary hover:bg-primary/85 text-primary-foreground rounded-xl transition-all cursor-pointer shadow-md"
              >
                {loading ? (
                  <>
                    <span>{isArabic ? "جاري التحديث..." : "Saving..."}</span>
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </>
                ) : (
                  <>
                    <span>
                      {isArabic ? "حفظ وتأمين الحساب" : "Save & Secure Account"}
                    </span>
                    <Check className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </form>
        )}

        {/* STEP 3: Success State */}
        {currentStep === 3 && (
          <div className="py-8 text-center space-y-4 animate-fade-in">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-[0_0_30px_rgba(16,185,129,0.3)]">
              <CheckCircle2 className="h-10 w-10 animate-bounce" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl md:text-2xl font-extrabold text-foreground">
                {isArabic
                  ? "تم تغيير كلمة المرور بنجاح!"
                  : "Password Changed Successfully!"}
              </h2>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                {isArabic
                  ? "تم تأمين حسابك بكلمة المرور الجديدة. جاري توجيهك الآن إلى لوحة التحكم..."
                  : "Your account is now secured. Redirecting you to your portal dashboard..."}
              </p>
            </div>

            <div className="flex justify-center pt-2">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          </div>
        )}

        {/* Security Note Footer */}
        {currentStep !== 3 && (
          <div className="mt-6 pt-4 border-t border-border/50 text-center">
            <p className="text-[11px] text-muted-foreground flex items-center justify-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-primary shrink-0" />
              <span>
                {isArabic
                  ? "تشفير أحادي آمن (Bcrypt Salted Hash) لحماية قصوى لحسابك الأكاديمي."
                  : "End-to-end Bcrypt salted hashing ensures maximum privacy and security."}
              </span>
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
