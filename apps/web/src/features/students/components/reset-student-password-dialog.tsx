"use client";

import React, { useState } from "react";
import { useLocale } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { KeyRound, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { resetStudentPassword, type Student } from "../api";
import {
  isValidStudentPassword,
  STUDENT_PASSWORD_MAX_LENGTH,
  STUDENT_PASSWORD_MIN_LENGTH,
} from "@student-portal/shared";

interface ResetStudentPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: Student | null;
  onSuccess?: () => void;
  locale?: string;
}

export function ResetStudentPasswordDialog({
  open,
  onOpenChange,
  student,
  onSuccess,
  locale: propLocale,
}: ResetStudentPasswordDialogProps) {
  const currentLocale = useLocale();
  const locale = propLocale || currentLocale || "ar";
  const isAr = locale.startsWith("ar");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [useCustomPassword, setUseCustomPassword] = useState(false);
  const [customPassword, setCustomPassword] = useState("");
  const [forcePasswordChange, setForcePasswordChange] = useState(true);

  if (!student) return null;

  const nestedNationalId =
    typeof student.userId === "object" ? student.userId.nationalId : undefined;
  const hasStoredNationalId = Boolean(
    student.nationalId?.trim() || nestedNationalId?.trim(),
  );
  const isUsingCustomPassword = useCustomPassword || !hasStoredNationalId;

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setCustomPassword("");
      setUseCustomPassword(false);
      setForcePasswordChange(true);
    }
    onOpenChange(nextOpen);
  };

  const handleReset = async () => {
    const passwordToSet = isUsingCustomPassword
      ? customPassword.trim()
      : undefined;

    if (isUsingCustomPassword && !isValidStudentPassword(passwordToSet ?? "")) {
      toast.error(
        isAr
          ? "يجب أن تتكون كلمة المرور من 8 إلى 100 حرف، وتحتوي على حرف إنجليزي ورقم واحد على الأقل، وبدون مسافات"
          : "Use 8-100 characters with at least one letter and one number, without spaces",
      );
      return;
    }

    try {
      setIsSubmitting(true);

      const res = await resetStudentPassword(
        student._id,
        passwordToSet,
        forcePasswordChange,
      );

      toast.success(
        res.message ||
          (isAr
            ? "تمت إعادة تعيين كلمة المرور بنجاح وإلزام الطالب بتغييرها عند الدخول"
            : "Password reset successfully. Student will be forced to change it on login."),
      );
      handleOpenChange(false);
      onSuccess?.();
    } catch (err: unknown) {
      const errorResponse = err as {
        code?: string;
        message?: string | string[];
        response?: { data?: { code?: string; message?: string | string[] } };
      };
      const errorData = errorResponse.response?.data ?? errorResponse;
      if (errorData?.code === "NATIONAL_ID_NOT_AVAILABLE") {
        setUseCustomPassword(true);
      }
      const responseMessage = Array.isArray(errorData?.message)
        ? errorData.message.join(", ")
        : errorData?.message;
      const msg =
        responseMessage ||
        errorResponse.message ||
        (isAr
          ? "فشل في إعادة تعيين كلمة المرور"
          : "Failed to reset student password");
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="w-[95vw] max-w-md border-border bg-card text-card-foreground p-5 sm:p-6 shadow-2xl rounded-2xl"
        dir={isAr ? "rtl" : "ltr"}
      >
        <DialogHeader className="space-y-2 text-start">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-500">
            <KeyRound className="h-5 w-5" />
          </div>
          <DialogTitle className="text-lg font-bold text-foreground">
            {isAr ? "إعادة تعيين كلمة المرور" : "Reset Student Password"}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
            {isAr
              ? "سيتم إبطال كلمة المرور الحالية فوراً وتوليد بيانات اعتماد مؤقتة للطالب."
              : "The current password will be invalidated and temporary credentials generated."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3.5 py-1">
          {/* Target Student Identity Card */}
          <div className="rounded-xl border border-border/70 bg-surface/40 p-3.5 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-muted-foreground">
                {isAr ? "بيانات الطالب الأكاديمي" : "Student Information"}
              </span>
              <span className="font-mono font-bold text-teal-400">
                {student.studentCode}
              </span>
            </div>
            <p className="font-semibold text-foreground text-sm">
              {student.fullName}
            </p>
          </div>

          {/* Security Notice */}
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-300">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <div className="space-y-1 text-[11px] leading-relaxed">
              <p className="font-bold text-amber-200">
                {isAr
                  ? "إجراء أمني فوري ومحكم:"
                  : "Immediate Security Measures:"}
              </p>
              <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                <li>
                  {isAr
                    ? "سيتم تسجيل خروج الطالب من كافة الجلسات النشطة فوراً."
                    : "All active sessions will be terminated immediately."}
                </li>
                <li>
                  {!hasStoredNationalId ? (
                    isAr ? (
                      <>لا يوجد رقم قومي محفوظ؛ استخدم كلمة مرور مؤقتة مخصصة.</>
                    ) : (
                      <>
                        No National ID is stored; use a custom temporary
                        password.
                      </>
                    )
                  ) : isAr ? (
                    <>
                      افتراضياً: ستكون كلمة المرور المؤقتة هي{" "}
                      <strong className="text-amber-300">
                        الرقم القومي (14 رقماً)
                      </strong>
                      .
                    </>
                  ) : (
                    <>
                      Default temporary password will be student&apos;s{" "}
                      <strong className="text-amber-300">
                        14-digit National ID
                      </strong>
                      .
                    </>
                  )}
                </li>
                <li>
                  {isAr
                    ? "سيلزم الطالب بإنشاء كلمة مرور دائمة جديدة عند أول تسجيل دخول."
                    : "The student must set a new permanent password on next login."}
                </li>
              </ul>
            </div>
          </div>

          {/* Custom Password Toggle */}
          <div className="space-y-2.5 pt-1">
            {hasStoredNationalId ? (
              <button
                type="button"
                onClick={() => setUseCustomPassword(!useCustomPassword)}
                className="text-xs font-semibold text-primary hover:text-primary/80 underline underline-offset-4 cursor-pointer"
              >
                {useCustomPassword
                  ? isAr
                    ? "← استخدام الرقم القومي ككلمة مرور مؤقتة (الافتراضي)"
                    : "← Use National ID as temporary password (Default)"
                  : isAr
                    ? "+ تعيين كلمة مرور مؤقتة مخصصة بدلاً من الرقم القومي"
                    : "+ Set custom temporary password instead of National ID"}
              </button>
            ) : (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
                {isAr
                  ? "لا يوجد رقم قومي محفوظ لهذا الطالب. يجب تعيين كلمة مرور مؤقتة مخصصة."
                  : "No National ID is stored for this student. A custom temporary password is required."}
              </p>
            )}

            {isUsingCustomPassword && (
              <div className="space-y-1.5 rounded-xl border border-border/70 bg-surface/30 p-3">
                <label className="text-xs font-medium text-muted-foreground">
                  {isAr
                    ? "كلمة المرور المؤقتة: 8 أحرف على الأقل، مع حرف إنجليزي ورقم، وبدون مسافات"
                    : "Temporary password: 8+ characters with a letter and number, without spaces"}
                </label>
                <PasswordInput
                  value={customPassword}
                  onChange={(e) => setCustomPassword(e.target.value)}
                  minLength={STUDENT_PASSWORD_MIN_LENGTH}
                  maxLength={STUDENT_PASSWORD_MAX_LENGTH}
                  autoComplete="new-password"
                  placeholder={
                    isAr ? "مثال: TempPass2026" : "e.g. TempPass2026"
                  }
                  className="font-mono text-xs"
                />
              </div>
            )}

            <label className="flex items-center gap-2 cursor-pointer pt-0.5 select-none">
              <input
                type="checkbox"
                checked={forcePasswordChange}
                onChange={(e) => setForcePasswordChange(e.target.checked)}
                className="rounded border-border/70 text-teal-600 focus:ring-teal-500"
              />
              <span className="text-xs text-foreground font-medium">
                {isAr
                  ? "إلزام الطالب بتغيير كلمة المرور فور تسجيل الدخول (موصى به)"
                  : "Require student to change password upon first login (Recommended)"}
              </span>
            </label>
          </div>
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end pt-2 border-t border-border/50">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isSubmitting}
            className="w-full sm:w-auto border-border text-xs cursor-pointer"
          >
            {isAr ? "إلغاء" : "Cancel"}
          </Button>
          <Button
            type="button"
            variant="default"
            onClick={handleReset}
            disabled={
              isSubmitting ||
              (isUsingCustomPassword &&
                !isValidStudentPassword(customPassword.trim()))
            }
            className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs shadow-md shadow-amber-950/40 cursor-pointer"
          >
            {isSubmitting
              ? isAr
                ? "جاري إعادة التعيين..."
                : "Resetting..."
              : isAr
                ? "تأكيد إعادة التعيين"
                : "Confirm Reset"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
