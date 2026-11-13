"use client";
import { useCallback } from "react";

import React, { useEffect, useState } from "react";
import { useSearchParams, useRouter, useParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  Clock,
  XCircle,
  QrCode,
  ShieldCheck,
  BookOpen,
  LogIn,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import {
  attendanceApi,
  CheckInResponse,
} from "@/features/attendance/api/attendance-api";
import {
  createQrTokenSchema,
  extractRawToken,
  getAttendanceErrorMessage,
} from "@/features/attendance/schemas/attendance-schemas";
import { getDeviceIdentity } from "@/lib/device-id";
import { getAttendancePosition } from "@/features/attendance/lib/location";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export default function StudentCheckInPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const params = useParams();
  const locale = (params.locale as string) || "ar";
  const isArabic = locale === "ar";

  const { user, loading: isAuthLoading } = useAuth();
  const isAuthenticated = !!user;
  const token = searchParams.get("t");

  const [verificationStatus, setStatus] = useState<
    "idle" | "verifying" | "success" | "already" | "error" | "unauthorized"
  >("idle");
  const [result, setResult] = useState<CheckInResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [manualToken, setManualToken] = useState<string>("");

  const status = !isAuthLoading && !isAuthenticated ? "unauthorized" : verificationStatus;
  const handleVerifyToken = useCallback(async (tokenToVerify: string) => {
    if (!tokenToVerify) return;

    const cleanToken = extractRawToken(tokenToVerify);
    const schema = createQrTokenSchema(locale);
    const validation = schema.safeParse(cleanToken);

    if (!validation.success) {
      setStatus("error");
      setErrorMessage(
        validation.error.issues[0]?.message ||
          (isArabic
            ? "رمز الحضور غير صالح أو منتهي الصلاحية"
            : "Invalid or malformed attendance token"),
      );
      return;
    }

    setStatus("verifying");
    setErrorMessage("");

    try {
      const deviceIdentity = await getDeviceIdentity();
      let coords: { latitude?: number; longitude?: number; accuracy?: number } = {};

      if (typeof window !== "undefined" && "geolocation" in navigator) {
        try {
          const pos = await getAttendancePosition(navigator.geolocation);
          if (pos) {
            coords = {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
            };
          }
        } catch {
          // Geolocation fallback
        }
      }

      const data = await attendanceApi.checkIn({
        token: cleanToken,
        deviceId: deviceIdentity.deviceId,
        deviceFingerprint: deviceIdentity.deviceFingerprint,
        deviceInfo: deviceIdentity.deviceInfo,
        ...coords,
      });
      setResult(data);
      if (data.alreadyCheckedIn) {
        setStatus("already");
      } else {
        setStatus("success");
      }
    } catch (err: unknown) {
      setStatus("error");
      const msg = getAttendanceErrorMessage(err, locale);
      setErrorMessage(msg);
    }
  }, [locale, isArabic]);

  useEffect(() => {
    if (isAuthLoading || !isAuthenticated || !token) return;
    // Let the verification UI paint before requesting device/location access.
    const frame = requestAnimationFrame(() => { void handleVerifyToken(token); });
    return () => cancelAnimationFrame(frame);
  }, [token, isAuthenticated, isAuthLoading, handleVerifyToken]);

  // Handle Login Redirect
  const handleLoginRedirect = () => {
    const returnUrl = encodeURIComponent(window.location.href);
    router.push(`/${locale}/login/student?returnUrl=${returnUrl}`);
  };

  return (
    <div
      className="min-h-[85vh] flex flex-col items-center justify-center p-4"
      dir={isArabic ? "rtl" : "ltr"}
    >
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md space-y-6"
      >
        {/* Top institute branding header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-primary/10 border border-primary/20 text-primary">
            <QrCode className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-extrabold text-foreground">
            {isArabic
              ? "تسجيل الحضور الأكاديمي"
              : "Academic Attendance Check-in"}
          </h1>
          <p className="text-xs text-muted-foreground">
            {isArabic
              ? "المعهد العالي لتكنولوجيا المعلومات — منظومة الحضور الذكي"
              : "BH47A Smart Attendance Verification"}
          </p>
        </div>

        {/* State 1: Verifying */}
        {status === "verifying" && (
          <Card className="p-8 text-center bg-card border-border/70 space-y-4">
            <div className="relative mx-auto h-16 w-16 flex items-center justify-center">
              <RefreshCw className="h-10 w-10 text-primary animate-spin" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-foreground">
                {isArabic
                  ? "جاري التحقق من الحضور..."
                  : "Verifying Attendance..."}
              </h3>
              <p className="text-xs text-muted-foreground">
                {isArabic
                  ? "يتم فك تشفير الرمز والتحقق من القيد وتوقيت الخادم المعتمد..."
                  : "Validating cryptographic token, registration, and server time..."}
              </p>
            </div>
          </Card>
        )}

        {/* State 2: Success (Present or Late) */}
        {status === "success" && result && (
          <Card className="p-8 text-center bg-card border-2 border-emerald-500/30 ring-1 ring-emerald-500/20 shadow-[0_0_35px_rgba(16,185,129,0.15)] space-y-6">
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              className={`h-20 w-20 mx-auto rounded-full flex items-center justify-center ${
                result.status === "present"
                  ? "bg-emerald-500/15 text-emerald-500 border-2 border-emerald-500/40 ring-4 ring-emerald-500/15 shadow-[0_0_30px_rgba(16,185,129,0.25)]"
                  : "bg-amber-500/20 text-amber-400 border-2 border-amber-500/40 shadow-amber-950/50"
              }`}
            >
              {result.status === "present" ? (
                <CheckCircle2 className="h-10 w-10 text-emerald-500 animate-pulse" />
              ) : (
                <Clock className="h-10 w-10 text-amber-400" />
              )}
            </motion.div>

            <div className="space-y-2">
              <Badge
                className={`text-sm px-4 py-1 font-bold shadow-xs ${
                  result.status === "present"
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                    : "bg-amber-500/20 text-amber-300 border-amber-500/40"
                }`}
              >
                {result.status === "present"
                  ? isArabic
                    ? "✓ حاضر (تم توثيق الحضور بنجاح)"
                    : "PRESENT"
                  : isArabic
                    ? "⏰ حاضر (متأخر)"
                    : "LATE"}
              </Badge>

              <h2 className="text-xl font-bold text-foreground pt-1">
                {result.courseName || result.courseCode}
              </h2>
              <p className="text-xs text-muted-foreground">
                {result.sessionType === "lecture"
                  ? isArabic
                    ? "محاضرة أسبوعية"
                    : "Lecture"
                  : isArabic
                    ? "سكشن تطبيقي"
                    : "Section"}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-xs space-y-2 text-muted-foreground">
              <div className="flex justify-between">
                <span>{isArabic ? "الطالب:" : "Student:"}</span>
                <span className="font-semibold text-foreground">
                  {user?.name}
                </span>
              </div>
              <div className="flex justify-between">
                <span>{isArabic ? "وقت التسجيل:" : "Check-in Time:"}</span>
                <span className="font-mono text-emerald-500 font-bold">
                  {new Date(result.checkedInAt).toLocaleTimeString(
                    isArabic ? "ar-EG" : "en-US",
                    { hour: "2-digit", minute: "2-digit", second: "2-digit" },
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span>{isArabic ? "المقرر:" : "Course:"}</span>
                <span className="font-mono text-primary font-bold">
                  {result.courseCode}
                </span>
              </div>
            </div>

            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all shadow-md"
              onClick={() => router.push(`/${locale}/dashboard/attendance`)}
            >
              {isArabic ? "عرض سجل حضوري الكامل" : "View My Attendance History"}
            </Button>
          </Card>
        )}

        {/* State 3: Already Checked In */}
        {status === "already" && result && (
          <Card className="p-8 text-center bg-card border-primary/20 space-y-6">
            <div className="h-16 w-16 mx-auto rounded-full bg-primary/10 text-primary border border-primary/20 flex items-center justify-center">
              <ShieldCheck className="h-8 w-8" />
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-bold text-foreground">
                {isArabic ? "تم تسجيل حضورك مسبقاً!" : "Already Checked In!"}
              </h3>
              <p className="text-xs text-muted-foreground">{result.message}</p>
            </div>

            <div className="p-4 rounded-xl bg-muted/40 border border-border/60 text-xs space-y-2 text-muted-foreground text-left">
              <div className="flex justify-between">
                <span>{isArabic ? "الحالة المسجلة:" : "Status:"}</span>
                <Badge
                  variant="outline"
                  className="bg-primary/10 text-primary border-primary/20"
                >
                  {result.status === "present"
                    ? isArabic
                      ? "حاضر"
                      : "Present"
                    : isArabic
                      ? "متأخر"
                      : "Late"}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span>
                  {isArabic ? "وقت التسجيل الأصلي:" : "Checked in at:"}
                </span>
                <span className="font-mono text-foreground">
                  {new Date(result.checkedInAt).toLocaleTimeString(
                    isArabic ? "ar-EG" : "en-US",
                    { hour: "2-digit", minute: "2-digit" },
                  )}
                </span>
              </div>
            </div>

            <Button
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold"
              onClick={() => router.push(`/${locale}/dashboard/attendance`)}
            >
              {isArabic ? "العودة لسجل الحضور" : "Go to Attendance History"}
            </Button>
          </Card>
        )}

        {/* State 4: Error (Expired, Closed, Not Enrolled) */}
        {status === "error" && (
          <Card className="p-8 text-center bg-card border-rose-500/40 space-y-6">
            <div className="h-16 w-16 mx-auto rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center">
              <XCircle className="h-8 w-8" />
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-bold text-foreground">
                {isArabic ? "تعذر تسجيل الحضور" : "Check-in Failed"}
              </h3>
              <p className="text-sm text-rose-300/90 leading-relaxed bg-rose-950/40 p-3 rounded-xl border border-rose-500/20">
                {errorMessage ||
                  (isArabic
                    ? "انتهت صلاحية الرمز، أو أن جلسة الحضور قد أغلقت."
                    : "Token expired or session is closed.")}
              </p>
            </div>

            <div className="text-xs text-muted-foreground leading-relaxed">
              {isArabic
                ? "تنبيه: تتجدد رموز الاستجابة السريعة (QR) تلقائيًا على شاشة المحاضر كل 25 ثانية. يرجى مسح الرمز الجديد مباشرة من الشاشة."
                : "Notice: QR codes rotate every 25 seconds. Please scan the current code on the display."}
            </div>

            <Button
              variant="outline"
              className="w-full border-border text-foreground hover:bg-secondary/60"
              onClick={() => setStatus("idle")}
            >
              {isArabic ? "مسح رمز جديد" : "Try Another QR"}
            </Button>
          </Card>
        )}

        {/* State 5: Unauthorized (Must login first) */}
        {status === "unauthorized" && (
          <Card className="p-8 text-center bg-card border-amber-500/40 space-y-6">
            <div className="h-16 w-16 mx-auto rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center">
              <LogIn className="h-8 w-8" />
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-bold text-foreground">
                {isArabic
                  ? "يرجى تسجيل الدخول أولاً"
                  : "Authentication Required"}
              </h3>
              <p className="text-xs text-muted-foreground">
                {isArabic
                  ? "يجب تسجيل الدخول بحسابك الطلابي لتسجيل الحضور واعتماد هويتك الأكاديمية."
                  : "Please log in with your student account to record attendance."}
              </p>
            </div>

            <Button
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold gap-2"
              onClick={handleLoginRedirect}
            >
              <LogIn className="h-4 w-4" />
              <span>{isArabic ? "تسجيل الدخول الآن" : "Log In Now"}</span>
            </Button>
          </Card>
        )}

        {/* State 6: Idle (No token in URL, manual token input fallback) */}
        {status === "idle" && (
          <Card className="p-6 bg-card border-border/70 space-y-4">
            <div className="text-center space-y-1">
              <BookOpen className="h-8 w-8 mx-auto text-primary" />
              <h3 className="font-bold text-foreground">
                {isArabic ? "تسجيل الحضور يدويًا" : "Enter Attendance Token"}
              </h3>
              <p className="text-xs text-muted-foreground">
                {isArabic
                  ? "إذا واجهتك صعوبة في فتح الرابط التلقائي، يمكنك لصق رمز الحضور هنا"
                  : "Enter the temporary token if the camera link failed to open"}
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <Input
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                placeholder="Session.Bucket.Signature"
                className="font-mono text-center text-xs"
              />
              <Button
                disabled={!manualToken.trim()}
                onClick={() => handleVerifyToken(manualToken.trim())}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold"
              >
                {isArabic ? "تأكيد الحضور" : "Verify & Check In"}
              </Button>
            </div>
          </Card>
        )}
      </motion.div>
    </div>
  );
}
