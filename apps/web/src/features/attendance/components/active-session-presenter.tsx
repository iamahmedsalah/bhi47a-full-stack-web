"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clock,
  QrCode,
  Users,
  CheckCircle2,
  AlertCircle,
  StopCircle,
  UserPlus,
  RefreshCw,
  Edit2,
  BookOpen,
  Copy,
  MapPin,
  Globe,
  Navigation,
  Crosshair,
  Check,
  ExternalLink,
  Building2,
  GraduationCap,
  Monitor,
  MapPinned,
} from "lucide-react";
import {
  INSTITUTE_VENUE_PRESETS,
  INSTITUTE_GEO_LOCATION,
  type InstituteVenuePreset,
} from "@student-portal/shared";
import {
  AttendanceSessionDto,
  AttendanceRecordDto,
  QrPayload,
  attendanceApi,
} from "../api/attendance-api";
import { QRCodeSVG } from "./qr-code";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CustomDropdown,
  type CustomDropdownOption,
} from "@/components/ui/custom-dropdown";
import { toast } from "sonner";
import { apiBaseUrl } from "@/lib/api";

export const HALL_PRESETS = INSTITUTE_VENUE_PRESETS;

export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371e3;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) *
      Math.cos(phi2) *
      Math.sin(deltaLambda / 2) *
      Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

interface ActiveSessionPresenterProps {
  session: AttendanceSessionDto;
  initialQr: QrPayload;
  onSessionClosed: () => void;
  isArabic?: boolean;
}

export function ActiveSessionPresenter({
  session,
  initialQr,
  onSessionClosed,
  isArabic = true,
}: ActiveSessionPresenterProps) {
  const [currentSession, setCurrentSession] =
    useState<AttendanceSessionDto>(session);
  const [currentQr, setCurrentQr] = useState<QrPayload>(initialQr);
  const [qrCountdown, setQrCountdown] = useState<number>(() => {
    if (initialQr.expiresAt) {
      const left = Math.ceil(
        (new Date(initialQr.expiresAt).getTime() - Date.now()) / 1000,
      );
      return Math.max(0, left);
    }
    return initialQr.remainingSeconds || session.qrRotationSeconds || 20;
  });
  const [sessionRemainingSec, setSessionRemainingSec] = useState<number>(0);
  const [attendees, setAttendees] = useState<AttendanceRecordDto[]>([]);
  const [attendeeFilter, setAttendeeFilter] = useState<
    "all" | "present" | "late"
  >("all");
  const [attendeeSearch, setAttendeeSearch] = useState("");
  const [stats, setStats] = useState({
    present: session.stats?.presentCount || 0,
    late: session.stats?.lateCount || 0,
    total: session.stats?.totalCheckedIn || 0,
  });

  const [isSessionEnded, setIsSessionEnded] = useState(
    session.status !== "OPEN",
  );
  const [isClosing, setIsClosing] = useState(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [showManualAddDialog, setShowManualAddDialog] = useState(false);
  const [manualStudentCode, setManualStudentCode] = useState("");
  const [manualStatus, setManualStatus] = useState<"present" | "late">(
    "present",
  );
  const [manualReason, setManualReason] = useState("");
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);

  // Edit status modal
  const [selectedRecord, setSelectedRecord] =
    useState<AttendanceRecordDto | null>(null);
  const [editStatus, setEditStatus] = useState<string>("present");
  const [editReason, setEditReason] = useState("");
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const isFetchingQrRef = useRef(false);

  // Geofencing Location State
  const [showLocationDialog, setShowLocationDialog] = useState(false);
  const [locEnabled, setLocEnabled] = useState(
    Boolean(
      currentSession.location?.latitude && currentSession.location?.longitude,
    ),
  );
  const [locVenueName, setLocVenueName] = useState(
    currentSession.location?.venueName || "معهد كينج مريوط - مبنى نظم المعلومات",
  );
  const [locLatitude, setLocLatitude] = useState<string>(
    currentSession.location?.latitude !== undefined
      ? String(currentSession.location.latitude)
      : "30.901143",
  );
  const [locLongitude, setLocLongitude] = useState<string>(
    currentSession.location?.longitude !== undefined
      ? String(currentSession.location.longitude)
      : "29.874724",
  );
  const [locRadius, setLocRadius] = useState<number>(
    currentSession.location?.radiusMeters || 150,
  );
  const [isSavingLoc, setIsSavingLoc] = useState(false);
  const [isLocatingInstructor, setIsLocatingInstructor] = useState(false);

  const [selectedVenuePresetId, setSelectedVenuePresetId] = useState<string>(() => {
    const found = INSTITUTE_VENUE_PRESETS.find(
      (p) => p.name === (currentSession.location?.venueName || ""),
    );
    return found ? found.id : "bis_building";
  });

  const venueDropdownOptions = React.useMemo<CustomDropdownOption[]>(() => {
    const categoryIcon = (cat: string) => {
      if (cat === "campus") return <Building2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />;
      if (cat === "hall") return <GraduationCap className="h-3.5 w-3.5 shrink-0 text-sky-400" />;
      return <Monitor className="h-3.5 w-3.5 shrink-0 text-violet-400" />;
    };
    const venueName = (p: InstituteVenuePreset) => isArabic ? p.name : p.nameEn;

    return [
      // Campus & Main Buildings
      ...INSTITUTE_VENUE_PRESETS.filter((p) => p.category === "campus").map((p) => ({
        value: p.id,
        label: (
          <div className="flex items-center justify-between w-full py-0.5 text-xs">
            <span className="flex items-center gap-1.5 font-semibold text-foreground">
              {categoryIcon(p.category)} {venueName(p)}
            </span>
            <span className="text-[10px] font-mono text-muted-foreground mr-2">{p.radius}{isArabic ? "م" : "m"}</span>
          </div>
        ),
      })),
      // Halls (Main, 315, 1-7)
      ...INSTITUTE_VENUE_PRESETS.filter((p) => p.category === "hall").map((p) => ({
        value: p.id,
        label: (
          <div className="flex items-center justify-between w-full py-0.5 text-xs">
            <span className="flex items-center gap-1.5 font-medium text-foreground">
              {categoryIcon(p.category)} {venueName(p)}
            </span>
            <span className="text-[10px] font-mono text-muted-foreground mr-2">{p.radius}{isArabic ? "م" : "m"}</span>
          </div>
        ),
      })),
      // Labs (1-7)
      ...INSTITUTE_VENUE_PRESETS.filter((p) => p.category === "lab").map((p) => ({
        value: p.id,
        label: (
          <div className="flex items-center justify-between w-full py-0.5 text-xs">
            <span className="flex items-center gap-1.5 font-medium text-foreground">
              {categoryIcon(p.category)} {venueName(p)}
            </span>
            <span className="text-[10px] font-mono text-muted-foreground mr-2">{p.radius}{isArabic ? "م" : "m"}</span>
          </div>
        ),
      })),
      // Custom Location
      {
        value: "custom",
        label: (
          <div className="flex items-center justify-between w-full py-0.5 text-xs text-primary font-bold">
            <span className="flex items-center gap-1.5">
              <MapPinned className="h-3.5 w-3.5 shrink-0" />
              {isArabic ? "إدخال يدوي مخصص" : "Custom Location"}
            </span>
          </div>
        ),
      },
    ];
  }, [isArabic]);

  const handleVenuePresetChange = (presetId: string) => {
    setSelectedVenuePresetId(presetId);
    if (presetId === "custom") return;
    const found = INSTITUTE_VENUE_PRESETS.find((p) => p.id === presetId);
    if (found) {
      setLocVenueName(isArabic ? found.name : found.nameEn);
      setLocLatitude(String(found.lat));
      setLocLongitude(String(found.lng));
      setLocRadius(found.radius);
    }
  };

  const handleUseCurrentLocation = async () => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      toast.error(
        isArabic
          ? "تحديد الموقع غير مدعوم في هذا المتصفح"
          : "Geolocation not supported in this browser",
      );
      return;
    }
    setIsLocatingInstructor(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          timeout: 7000,
          enableHighAccuracy: true,
        });
      });
      setLocLatitude(pos.coords.latitude.toFixed(6));
      setLocLongitude(pos.coords.longitude.toFixed(6));
      setLocVenueName(isArabic ? "موقعي الحالي في القاعة" : "My Current Hall Location");
      setSelectedVenuePresetId("custom");
      setLocEnabled(true);
      toast.success(
        isArabic
          ? "تم التقاط إحداثيات موقعك الحالي بنجاح!"
          : "Current GPS coordinates captured!",
      );
    } catch {
      toast.error(
        isArabic
          ? "تعذر الحصول على الموقع الجغرافي. تأكد من تفعيل صلاحيات GPS."
          : "Could not retrieve GPS coordinates. Check device permissions.",
      );
    } finally {
      setIsLocatingInstructor(false);
    }
  };

  const handleSaveLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingLoc(true);
    try {
      const updated = await attendanceApi.updateSessionLocation(
        currentSession._id,
        {
          enabled: locEnabled,
          venueName: locVenueName.trim(),
          latitude: locEnabled ? Number(locLatitude) : undefined,
          longitude: locEnabled ? Number(locLongitude) : undefined,
          radiusMeters: locEnabled ? Number(locRadius) : undefined,
        },
      );
      setCurrentSession(updated);
      setShowLocationDialog(false);
      toast.success(
        isArabic
          ? locEnabled
            ? "تم تحديث نطاق الحضور الجغرافي للقاعة بنجاح!"
            : "تم إلغاء قيد الموقع الجغرافي للجلسة"
          : "Session location updated successfully!",
      );
    } catch {
      toast.error(
        isArabic ? "فشل حفظ إعدادات الموقع" : "Failed to update location",
      );
    } finally {
      setIsSavingLoc(false);
    }
  };

  // 1. Poll persisted records so updates remain reliable when the API scales
  // across multiple Vercel Function instances. SSE below remains the fast path.
  useEffect(() => {
    let isCancelled = false;

    const refreshAttendees = async () => {
      try {
        const response = await attendanceApi.getSessionRecords(session._id, {
          limit: 100,
        });
        if (isCancelled) return;

        setAttendees(response.items);
        setStats({
          present: response.items.filter((item) => item.status === "present")
            .length,
          late: response.items.filter((item) => item.status === "late").length,
          total: response.total,
        });
      } catch (error) {
        console.error("Failed to refresh attendees", error);
      }
    };

    void refreshAttendees();
    const interval = window.setInterval(() => {
      if (!isSessionEnded) void refreshAttendees();
    }, 5_000);

    return () => {
      isCancelled = true;
      window.clearInterval(interval);
    };
  }, [session._id, isSessionEnded]);

  // 2. Real-Time Server-Sent Events (SSE) Stream
  useEffect(() => {
    const sseUrl = `${apiBaseUrl}/attendance/sessions/${session._id}/live`;
    let eventSource: EventSource | null = null;

    try {
      eventSource = new EventSource(sseUrl, { withCredentials: true });

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "CHECK_IN" && data.record) {
            setAttendees((prev) => {
              if (prev.some((a) => a._id === data.record.id)) return prev;
              return [data.record, ...prev];
            });

            setStats((prev) => {
              const isLate = data.record.status === "late";
              return {
                total: prev.total + 1,
                present: isLate ? prev.present : prev.present + 1,
                late: isLate ? prev.late + 1 : prev.late,
              };
            });

            toast.success(
              isArabic
                ? `تسجيل حضور: ${data.record.studentName} (${data.record.status === "late" ? "متأخر" : "حاضر"})`
                : `Checked in: ${data.record.studentName}`,
            );
          } else if (data.type === "STATUS_CHANGE" && data.record) {
            setAttendees((prev) =>
              prev.map((a) => (a._id === data.record.id ? data.record : a)),
            );
          } else if (data.type === "SESSION_CLOSED") {
            toast.info(isArabic ? "تم إغلاق الجلسة" : "Session closed");
            setIsSessionEnded(true);
            onSessionClosed();
          }
        } catch (e) {
          console.error("Failed to parse SSE payload", e);
        }
      };

      eventSource.onerror = (e) => {
        console.warn("SSE connection interrupted, fallback in place", e);
      };
    } catch (e) {
      console.warn("SSE not supported or failed to connect", e);
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [session._id, isArabic, onSessionClosed]);

  // 3. QR Rotation & Session Countdown Timer
  useEffect(() => {
    if (isSessionEnded) return;

    const expiresAtMs = new Date(session.expiresAt).getTime();
    let isCancelled = false;

    const interval = setInterval(() => {
      const now = Date.now();
      const sessionLeft = Math.max(0, Math.floor((expiresAtMs - now) / 1000));
      setSessionRemainingSec(sessionLeft);

      if (sessionLeft <= 0) {
        clearInterval(interval);
        setIsSessionEnded(true);
        toast.info(
          isArabic
            ? "انتهت مدة صلاحية جلسة الحضور"
            : "Attendance session duration has expired",
        );
        onSessionClosed();
        return;
      }

      // Compute exact seconds left based on server expiresAt
      const qrExpiresAtMs = currentQr.expiresAt
        ? new Date(currentQr.expiresAt).getTime()
        : null;

      const remainingSec = qrExpiresAtMs
        ? Math.max(0, Math.ceil((qrExpiresAtMs - now) / 1000))
        : Math.max(0, qrCountdown - 1);

      setQrCountdown(remainingSec);

      if (remainingSec <= 0 && !isFetchingQrRef.current) {
        isFetchingQrRef.current = true;
        attendanceApi
          .getCurrentQr(session._id)
          .then((newQr) => {
            if (!isCancelled) {
              setCurrentQr(newQr);
              const freshRemaining = newQr.expiresAt
                ? Math.max(
                    0,
                    Math.ceil(
                      (new Date(newQr.expiresAt).getTime() - Date.now()) / 1000,
                    ),
                  )
                : (newQr.remainingSeconds || session.qrRotationSeconds || 20);
              setQrCountdown(freshRemaining);
            }
          })
          .catch((err) => {
            const status = err?.response?.status || err?.status;
            const msg = String(
              err?.response?.data?.message || err?.message || "",
            );
            // Stop polling if session is closed or expired on server
            if (
              status === 400 ||
              msg.includes("مغلقة") ||
              msg.includes("انتهت") ||
              msg.includes("closed") ||
              msg.includes("expired")
            ) {
              clearInterval(interval);
              setIsSessionEnded(true);
              toast.info(
                isArabic
                  ? "جلسة الحضور مغلقة أو انتهت مدة صلاحيتها"
                  : "Attendance session is closed or has expired",
              );
              onSessionClosed();
            } else {
              setQrCountdown(5);
            }
          })
          .finally(() => {
            isFetchingQrRef.current = false;
          });
      }
    }, 1000);

    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [
    session.expiresAt,
    session._id,
    session.qrRotationSeconds,
    currentQr.expiresAt,
    onSessionClosed,
    isArabic,
    isSessionEnded,
    qrCountdown,
  ]);

  // Handle End Attendance
  const handleCloseSession = async () => {
    setIsClosing(true);
    try {
      await attendanceApi.closeSession(session._id);
      toast.success(
        isArabic ? "تم إنهاء جلسة الحضور بنجاح" : "Attendance session closed",
      );
      setShowCloseDialog(false);
      onSessionClosed();
    } catch {
      toast.error(
        isArabic ? "فشل إغلاق جلسة الحضور" : "Failed to close session",
      );
    } finally {
      setIsClosing(false);
    }
  };

  // Handle Manual Add Student
  const handleManualAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualStudentCode.trim()) return;

    setIsSubmittingManual(true);
    try {
      const record = await attendanceApi.manualStudentCheckIn(session._id, {
        studentCode: manualStudentCode.trim(),
        status: manualStatus,
        reason: manualReason || "Manual check-in by instructor",
      });
      setAttendees((prev) => [record, ...prev]);
      setStats((prev) => ({
        total: prev.total + 1,
        present: manualStatus === "present" ? prev.present + 1 : prev.present,
        late: manualStatus === "late" ? prev.late + 1 : prev.late,
      }));
      toast.success(
        isArabic
          ? `تم تسجيل حضور الطالب [${manualStudentCode}] يدويًا بنجاح`
          : `Student [${manualStudentCode}] marked manually`,
      );
      setManualStudentCode("");
      setManualReason("");
      setShowManualAddDialog(false);
    } catch {
      toast.error(
        isArabic
          ? "تعذر تسجيل الطالب يدويًا، تأكد من صحة كود الطالب"
          : "Failed to mark student manually",
      );
    } finally {
      setIsSubmittingManual(false);
    }
  };

  // Handle Manual Update Status
  const handleUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecord) return;

    setIsUpdatingStatus(true);
    try {
      const updated = await attendanceApi.manualUpdateRecord(
        selectedRecord._id,
        {
          status: editStatus,
          reason: editReason || "Correction by academic staff",
        },
      );
      setAttendees((prev) =>
        prev.map((a) => (a._id === updated._id ? updated : a)),
      );
      toast.success(isArabic ? "تم تعديل الحالة بنجاح" : "Status updated");
      setSelectedRecord(null);
    } catch {
      toast.error(isArabic ? "فشل تعديل الحالة" : "Failed to update status");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // Format MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const rotationPercent = Math.min(
    100,
    Math.max(
      0,
      (qrCountdown /
        (currentQr.rotationSeconds || session.qrRotationSeconds || 20)) *
        100,
    ),
  );
  const manualStatusOptions: CustomDropdownOption[] = [
    { value: "present", label: isArabic ? "حاضر (Present)" : "Present" },
    { value: "late", label: isArabic ? "متأخر (Late)" : "Late" },
  ];

  const handleCopyManualCode = async () => {
    try {
      await navigator.clipboard.writeText(currentQr.manualCode);
      toast.success(isArabic ? "تم نسخ رمز الحضور" : "Attendance code copied");
    } catch {
      toast.error(isArabic ? "تعذر نسخ الرمز" : "Could not copy code");
    }
  };

  return (
    <div className="space-y-6" dir={isArabic ? "rtl" : "ltr"}>
      {/* Header bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-6 rounded-2xl bg-card border border-border/70">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center p-2 rounded-xl bg-primary/10 text-primary border border-primary/20">
              <BookOpen className="h-6 w-6" />
            </span>
            <div>
              <h2 className="text-2xl font-bold text-foreground tracking-wide">
                {session.courseName || session.courseCode}
              </h2>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <Badge
                  variant="outline"
                  className="bg-primary/10 text-primary border-primary/20"
                >
                  {session.courseCode}
                </Badge>
                <Badge
                  variant="outline"
                  className="bg-secondary text-foreground border-border"
                >
                  {session.sessionType === "lecture"
                    ? isArabic
                      ? "محاضرة"
                      : "Lecture"
                    : session.sessionType === "section"
                      ? isArabic
                        ? "سكشن"
                        : "Section"
                      : isArabic
                        ? "معمل"
                        : "Lab"}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {isArabic
                    ? `المستوى ${session.level}`
                    : `Level ${session.level}`}
                  {session.section ? ` • سكشن ${session.section}` : ""}
                  {session.group ? ` • مجموعة ${session.group}` : ""}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Timer & Close Actions */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Geofencing Location Button */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowLocationDialog(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-secondary/50 border border-border text-foreground hover:bg-secondary/80 text-xs font-semibold cursor-pointer"
          >
            <MapPin
              className={`h-4 w-4 ${
                currentSession.location?.latitude
                  ? "text-emerald-400"
                  : "text-muted-foreground"
              }`}
            />
            <div className="text-start">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground">
                {isArabic ? "موقع القاعة (Geofence)" : "Hall Location"}
              </div>
              <div className="text-xs font-bold text-foreground">
                {currentSession.location?.latitude
                  ? `${currentSession.location.venueName || (isArabic ? "موقع محدد" : "Preset")} (${currentSession.location.radiusMeters || 100}م)`
                  : isArabic
                    ? "غير محدد (اضغط للضبط)"
                    : "Not set (Click to set)"}
              </div>
            </div>
          </Button>

          <div className="flex items-center gap-2.5 px-4 py-2 rounded-xl bg-secondary/50 border border-border text-foreground">
            <Clock className="h-5 w-5 text-primary" />
            <div className="text-left">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground">
                {isArabic ? "الوقت المتبقي" : "Time Remaining"}
              </div>
              <div className="font-mono text-xl font-bold text-foreground">
                {formatTime(sessionRemainingSec)}
              </div>
            </div>
          </div>

          <Button
            variant="destructive"
            onClick={() => setShowCloseDialog(true)}
            className="flex items-center gap-2 bg-rose-600/90 hover:bg-rose-600 text-white font-semibold cursor-pointer"
          >
            <StopCircle className="h-5 w-5" />
            <span>{isArabic ? "إنهاء الحضور" : "End Attendance"}</span>
          </Button>
        </div>
      </div>

      {/* Main Grid: Presenter View & Attendees Live Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left/Main Column: Big QR Code for Projector */}
        <div className="lg:col-span-5 flex flex-col items-center justify-between p-8 rounded-3xl bg-card border border-border/70 text-center space-y-6">
          {isSessionEnded ? (
            <div className="py-8 space-y-5 w-full flex flex-col items-center justify-center">
              <div className="h-20 w-20 rounded-full bg-rose-500/15 border-2 border-rose-500/30 text-rose-400 flex items-center justify-center">
                <StopCircle className="h-10 w-10" />
              </div>
              <div className="space-y-1.5">
                <Badge
                  variant="outline"
                  className="bg-rose-500/20 text-rose-300 border-rose-500/40 text-xs px-3 py-1 font-bold"
                >
                  {isArabic ? "جلسة الحضور مغلقة" : "SESSION CLOSED"}
                </Badge>
                <h3 className="text-xl font-extrabold text-foreground pt-1">
                  {isArabic
                    ? "انتهت مدة استقبال الحضور"
                    : "Attendance Check-in Ended"}
                </h3>
                <p className="text-xs text-muted-foreground max-w-xs mx-auto leading-relaxed">
                  {isArabic
                    ? "تم إغلاق الجلسة وتوثيق جميع الطلاب المسجلين بنجاح. لا يمكن توليد رموز QR جديدة لهذه الجلسة."
                    : "The session has been closed and attendee records are archived. New QR tokens cannot be generated."}
                </p>
              </div>

              <div className="pt-2 w-full space-y-2">
                <Button
                  onClick={onSessionClosed}
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs cursor-pointer"
                >
                  {isArabic ? "العودة لقائمة المقررات" : "Return to Classes"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowManualAddDialog(true)}
                  className="w-full border-border text-xs cursor-pointer"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  <span>
                    {isArabic ? "إضافة طالب متأخر يدوياً" : "Manual Late Add"}
                  </span>
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
                  <span className="h-2 w-2 rounded-full bg-primary" />
                  {isArabic
                    ? "جلسة الحضور نشطة ومباشرة"
                    : "Live Attendance Session"}
                </span>
                <p className="text-sm text-muted-foreground mt-2">
                  {isArabic
                    ? "امسح الرمز بكاميرا هاتفك المحمول لتسجيل الحضور فوراً"
                    : "Scan with your mobile camera to check in"}
                </p>
              </div>

              {/* SVG QR Code: Enforce in-app scanning with att: prefix (prevents copy-pasting open browser links) */}
              <div className="relative p-2 bg-white rounded-3xl border border-border">
                <QRCodeSVG
                  value={`att:${currentQr.token}`}
                  size={290}
                  fgColor="#042f2e"
                />
              </div>

              <div className="w-full max-w-xs rounded-2xl border border-border bg-secondary/35 p-3">
                <p className="text-[11px] font-medium text-muted-foreground">
                  {isArabic
                    ? "إذا تعذر مسح QR، أدخل رمز الحضور المتجدد:"
                    : "If QR scanning fails, enter this rotating code:"}
                </p>
                <div className="mt-2 flex items-center justify-center gap-2">
                  <code
                    className="font-mono text-xl font-black tracking-[0.14em] text-foreground"
                    dir="ltr"
                  >
                    {currentQr.manualCode}
                  </code>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={handleCopyManualCode}
                    aria-label={
                      isArabic ? "نسخ رمز الحضور" : "Copy attendance code"
                    }
                    className="h-8 w-8"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Rotation progress bar */}
              <div className="w-full max-w-xs space-y-2">
                <div className="flex justify-between items-center text-xs font-medium text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <RefreshCw className="h-3.5 w-3.5 text-primary" />
                    {isArabic
                      ? `يتجدد الرمز خلال ${qrCountdown} ثانية`
                      : `Rotates in ${qrCountdown}s`}
                  </span>
                  <span className="text-foreground font-mono">
                    {currentQr.rotationSeconds || session.qrRotationSeconds || 20}s
                  </span>
                </div>
                <Progress
                  value={rotationPercent}
                  className="h-2 bg-secondary"
                />
                <p className="text-[11px] text-muted-foreground/70">
                  {isArabic
                    ? `حماية مشددة: كود حضور مشفر داخل التطبيق يتجدد كل ${currentQr.rotationSeconds || session.qrRotationSeconds || 20} ثانية لمنع تصوير ومشاركة الشاشة`
                    : `Anti-cheat protection: In-app encrypted token rotates every ${currentQr.rotationSeconds || session.qrRotationSeconds || 20}s to prevent screenshot sharing`}
                </p>
              </div>

              {/* Manual Register button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowManualAddDialog(true)}
                className="w-full border-border text-foreground hover:bg-secondary/60 gap-2"
              >
                <UserPlus className="h-4 w-4" />
                <span>
                  {isArabic
                    ? "تسجيل يدوي لطالب (في حال تعذر الكاميرا)"
                    : "Manual Check-in for Student"}
                </span>
              </Button>
            </>
          )}
        </div>

        {/* Right Column: Live Attendees Stream & Stats */}
        <div className="lg:col-span-7 space-y-6 flex flex-col">
          {/* KPI Cards */}
          <div className="grid grid-cols-3 gap-4">
            <Card className="p-4 bg-secondary/35 border-border text-center">
              <div className="text-xs text-muted-foreground font-medium">
                {isArabic ? "إجمالي الحضور" : "Total Attended"}
              </div>
              <div className="text-3xl font-extrabold text-foreground mt-1 font-mono">
                {stats.total}
              </div>
            </Card>

            <Card className="p-4 bg-primary/5 border-primary/20 text-center">
              <div className="text-xs text-muted-foreground font-medium">
                {isArabic ? "حاضر (في الموعد)" : "Present (On-time)"}
              </div>
              <div className="text-3xl font-extrabold text-primary mt-1 font-mono">
                {stats.present}
              </div>
            </Card>

            <Card className="p-4 bg-amber-950/40 border-amber-500/30 text-center">
              <div className="text-xs text-amber-300/80 font-medium">
                {isArabic ? "متأخر" : "Late"}
              </div>
              <div className="text-3xl font-extrabold text-amber-300 mt-1 font-mono">
                {stats.late}
              </div>
            </Card>
          </div>

          {/* Attendees List Card */}
          <Card className="flex-1 flex flex-col p-5 bg-card/50 border-border/80 backdrop-blur-md">
            <div className="flex items-center justify-between pb-3 border-b border-border/60 mb-2">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                <h3 className="font-bold text-foreground">
                  {isArabic
                    ? "سجل الحضور اللحظي (بث مباشر)"
                    : "Live Attendee Stream"}
                </h3>
              </div>
              <span className="text-xs text-muted-foreground">
                {isArabic
                  ? `${attendees.length} طالب مسجل`
                  : `${attendees.length} recorded`}
              </span>
            </div>

            {/* Search & Status Filters */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-2 border-b border-border/40">
              <div className="flex items-center gap-1 bg-secondary/40 p-1 rounded-lg border border-border/50 text-xs">
                <button
                  type="button"
                  onClick={() => setAttendeeFilter("all")}
                  className={`px-2.5 py-0.5 rounded-md font-medium transition-all cursor-pointer ${
                    attendeeFilter === "all"
                      ? "bg-primary/10 text-primary font-bold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {isArabic ? "الكل" : "All"} ({attendees.length})
                </button>
                <button
                  type="button"
                  onClick={() => setAttendeeFilter("present")}
                  className={`px-2.5 py-0.5 rounded-md font-medium transition-all cursor-pointer ${
                    attendeeFilter === "present"
                      ? "bg-primary/10 text-primary font-bold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {isArabic ? "حاضر" : "Present"} ({stats.present})
                </button>
                <button
                  type="button"
                  onClick={() => setAttendeeFilter("late")}
                  className={`px-2.5 py-0.5 rounded-md font-medium transition-all cursor-pointer ${
                    attendeeFilter === "late"
                      ? "bg-amber-500/20 text-amber-300 font-bold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {isArabic ? "متأخر" : "Late"} ({stats.late})
                </button>
              </div>

              <Input
                type="text"
                value={attendeeSearch}
                onChange={(e) => setAttendeeSearch(e.target.value)}
                placeholder={
                  isArabic ? "بحث بالاسم أو الكود..." : "Search student..."
                }
                className="h-7 w-44 text-xs bg-background/50 border-border/60"
              />
            </div>

            {/* Scrollable list */}
            <div className="flex-1 overflow-y-auto max-h-105 space-y-2 pr-1">
              <AnimatePresence initial={false}>
                {attendees.length === 0 ? (
                  <div className="py-16 text-center text-muted-foreground text-sm space-y-2">
                    <QrCode className="h-10 w-10 mx-auto text-primary/40" />
                    <p>
                      {isArabic
                        ? "في انتظار مسح الطلاب للرمز..."
                        : "Waiting for students to scan QR..."}
                    </p>
                  </div>
                ) : (
                  attendees
                    .filter((record) => {
                      if (
                        attendeeFilter !== "all" &&
                        record.status !== attendeeFilter
                      )
                        return false;
                      if (attendeeSearch.trim()) {
                        const q = attendeeSearch.trim().toLowerCase();
                        return (
                          record.studentName.toLowerCase().includes(q) ||
                          record.studentCode.toLowerCase().includes(q)
                        );
                      }
                      return true;
                    })
                    .map((record) => (
                      <motion.div
                        key={record._id}
                        initial={{ opacity: 0, y: -8, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="flex items-center justify-between p-3 rounded-xl bg-background/50 border border-border/60 hover:border-primary/30 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`h-8 w-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                              record.status === "present"
                                ? "bg-primary/10 text-primary border border-primary/20"
                                : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                            }`}
                          >
                            {record.status === "present" ? (
                              <CheckCircle2 className="h-4 w-4" />
                            ) : (
                              <Clock className="h-4 w-4" />
                            )}
                          </div>
                          <div className="space-y-1">
                            <div className="font-semibold text-sm text-foreground">
                              {record.studentName}
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground font-mono">
                              <span>
                                {record.studentCode} •{" "}
                                {record.method === "manual"
                                  ? isArabic
                                    ? "تسجيل يدوي"
                                    : "Manual"
                                  : "QR Scan"}
                              </span>

                              {/* Device Info */}
                              {record.deviceInfo && (
                                <span
                                  title={
                                    record.deviceFingerprint
                                      ? `بصمة العتاد (Fingerprint): ${record.deviceFingerprint}`
                                      : undefined
                                  }
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] bg-secondary/80 text-foreground/90 border border-border/60 font-sans"
                                >
                                  {record.deviceInfo}
                                </span>
                              )}

                              {/* Client IP */}
                              {record.ipAddress && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] bg-secondary/50 text-muted-foreground border border-border/40 font-mono">
                                  <Globe className="h-3 w-3 text-primary/70" />
                                  {record.ipAddress}
                                </span>
                              )}

                              {/* Scanned Location */}
                              {record.location?.latitude &&
                              record.location?.longitude ? (
                                <a
                                  href={`https://maps.google.com/?q=${record.location.latitude},${record.location.longitude}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title={
                                    isArabic
                                      ? "فتح في خرائط Google"
                                      : "Open in Google Maps"
                                  }
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] bg-emerald-500/10 text-emerald-400 hover:text-emerald-300 border border-emerald-500/20 font-sans cursor-pointer transition-colors"
                                >
                                  <MapPin className="h-3 w-3" />
                                  <span>
                                    {record.location.latitude.toFixed(4)},{" "}
                                    {record.location.longitude.toFixed(4)}
                                  </span>
                                  {currentSession.location?.latitude &&
                                    currentSession.location?.longitude && (
                                      <span className="text-[10px] opacity-80">
                                        (
                                        {calculateDistanceMeters(
                                          record.location.latitude,
                                          record.location.longitude,
                                          currentSession.location.latitude,
                                          currentSession.location.longitude,
                                        )}
                                        م)
                                      </span>
                                    )}
                                </a>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-muted-foreground/60 font-sans">
                                  <MapPin className="h-2.5 w-2.5" />
                                  {isArabic ? "بدون GPS" : "No GPS"}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Badge
                            variant={
                              record.status === "present"
                                ? "default"
                                : "secondary"
                            }
                            className={
                              record.status === "present"
                                ? "bg-primary/10 text-primary border-primary/20"
                                : "bg-amber-500/15 text-amber-300 border-amber-500/30"
                            }
                          >
                            {record.status === "present"
                              ? isArabic
                                ? "حاضر"
                                : "Present"
                              : isArabic
                                ? "متأخر"
                                : "Late"}
                          </Badge>
                          <span className="text-xs text-muted-foreground font-mono">
                            {new Date(record.checkedInAt).toLocaleTimeString(
                              isArabic ? "ar-EG" : "en-US",
                              { hour: "2-digit", minute: "2-digit" },
                            )}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedRecord(record);
                              setEditStatus(record.status);
                              setEditReason("");
                            }}
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </motion.div>
                    ))
                )}
              </AnimatePresence>
            </div>
          </Card>
        </div>
      </div>

      {/* Dialog: Confirm Close Session */}
      <Dialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
        <DialogContent className="sm:max-w-md" dir={isArabic ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-500">
              <AlertCircle className="h-5 w-5" />
              <span>
                {isArabic
                  ? "تأكيد إنهاء جلسة الحضور"
                  : "Close Attendance Session"}
              </span>
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {isArabic
              ? "هل أنت متأكد من إنهاء جلسة الحضور؟ سيتم إيقاف صلاحية رمز الاستجابة السريعة فوراً ولن يتمكن أي طالب من تسجيل الحضور بعد الآن."
              : "Are you sure you want to end this session? Future QR scans will be immediately rejected."}
          </p>
          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button
              variant="outline"
              onClick={() => setShowCloseDialog(false)}
              disabled={isClosing}
            >
              {isArabic ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              variant="destructive"
              onClick={handleCloseSession}
              disabled={isClosing}
            >
              {isClosing
                ? isArabic
                  ? "جاري الإغلاق..."
                  : "Closing..."
                : isArabic
                  ? "نعم، أنهِ الجلسة"
                  : "End Session"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Manual Check-in Student */}
      <Dialog open={showManualAddDialog} onOpenChange={setShowManualAddDialog}>
        <DialogContent className="sm:max-w-md" dir={isArabic ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              <span>
                {isArabic ? "تسجيل يدوي لطالب" : "Manual Student Check-in"}
              </span>
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleManualAdd} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>
                {isArabic ? "كود الطالب (الرقم الأكاديمي)" : "Student Code"}
              </Label>
              <Input
                value={manualStudentCode}
                onChange={(e) => setManualStudentCode(e.target.value)}
                placeholder="2026001"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>{isArabic ? "الحالة" : "Status"}</Label>
              <CustomDropdown
                value={manualStatus}
                options={manualStatusOptions}
                onValueChange={(value) =>
                  setManualStatus(value as "present" | "late")
                }
                ariaLabel={isArabic ? "حالة الحضور" : "Attendance status"}
                className="bg-background"
              />
            </div>
            <div className="space-y-2">
              <Label>{isArabic ? "سبب التسجيل اليدوي" : "Reason / Note"}</Label>
              <Input
                value={manualReason}
                onChange={(e) => setManualReason(e.target.value)}
                placeholder={
                  isArabic ? "عطل في كاميرا هاتف الطالب" : "Camera malfunction"
                }
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-0 mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowManualAddDialog(false)}
                disabled={isSubmittingManual}
              >
                {isArabic ? "إلغاء" : "Cancel"}
              </Button>
              <Button type="submit" disabled={isSubmittingManual}>
                {isSubmittingManual ? "..." : isArabic ? "حفظ الحضور" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: Edit Existing Record Status */}
      <Dialog
        open={!!selectedRecord}
        onOpenChange={(open) => !open && setSelectedRecord(null)}
      >
        <DialogContent className="sm:max-w-md" dir={isArabic ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="h-5 w-5 text-primary" />
              <span>
                {isArabic
                  ? "تعديل حالة الحضور للطالب"
                  : "Edit Attendance Status"}
              </span>
            </DialogTitle>
          </DialogHeader>
          {selectedRecord && (
            <form onSubmit={handleUpdateStatus} className="space-y-4 py-2">
              <div className="p-3 rounded-lg bg-muted/40 text-sm space-y-1">
                <div className="font-semibold">
                  {selectedRecord.studentName}
                </div>
                <div className="text-xs text-muted-foreground font-mono">
                  {selectedRecord.studentCode}
                </div>
              </div>

              <div className="space-y-2">
                <Label>{isArabic ? "الحالة الجديدة" : "New Status"}</Label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="w-full p-2.5 rounded-lg bg-background border border-input text-foreground text-sm"
                >
                  <option value="present">
                    {isArabic ? "حاضر (Present)" : "Present"}
                  </option>
                  <option value="late">
                    {isArabic ? "متأخر (Late)" : "Late"}
                  </option>
                  <option value="excused">
                    {isArabic ? "معذور (Excused)" : "Excused"}
                  </option>
                  <option value="absent">
                    {isArabic ? "غائب (Absent)" : "Absent"}
                  </option>
                </select>
              </div>

              <div className="space-y-2">
                <Label>
                  {isArabic ? "سبب التعديل (سجل تدقيق)" : "Audit Reason"}
                </Label>
                <Input
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder={
                    isArabic ? "تصحيح الخطأ بعد مراجعة الكشف" : "Correction"
                  }
                />
              </div>

              <DialogFooter className="gap-2 sm:gap-0 mt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSelectedRecord(null)}
                  disabled={isUpdatingStatus}
                >
                  {isArabic ? "إلغاء" : "Cancel"}
                </Button>
                <Button type="submit" disabled={isUpdatingStatus}>
                  {isUpdatingStatus
                    ? "..."
                    : isArabic
                      ? "تأكيد التعديل"
                      : "Save"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog: Manage & Change Session Geofence Location */}
      <Dialog open={showLocationDialog} onOpenChange={setShowLocationDialog}>
        <DialogContent
          className="sm:max-w-lg border-border bg-card rounded-2xl"
          dir={isArabic ? "rtl" : "ltr"}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold text-foreground">
              <MapPin className="h-6 w-6 text-emerald-400" />
              <span>
                {isArabic
                  ? "إعدادات موقع القاعة ونطاق الحضور الجغرافي"
                  : "Lecture Hall Geofence Settings"}
              </span>
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveLocation} className="space-y-4 py-2">
            {/* STEP 1: Enable / Disable Geofencing */}
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-secondary/35 border border-border/80">
              <div className="flex items-center gap-3">
                <div
                  className={`p-2.5 rounded-xl border ${
                    locEnabled
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      : "bg-muted/30 text-muted-foreground border-border"
                  }`}
                >
                  <MapPin className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-bold text-foreground cursor-pointer">
                      {isArabic
                        ? "الخطوة 1: تفعيل التحقق الجغرافي"
                        : "Step 1: Geofencing Verification"}
                    </Label>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        locEnabled
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {locEnabled
                        ? isArabic
                          ? "مفعل ومحمي"
                          : "Active"
                        : isArabic
                          ? "معطل"
                          : "Disabled"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {isArabic
                      ? "رفض أي تسجيل حضور من خارج حدود القاعة أو المعمل المحدد"
                      : "Rejects check-ins from students outside the hall"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={locEnabled}
                onClick={() => setLocEnabled(!locEnabled)}
                className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors cursor-pointer ${
                  locEnabled ? "bg-primary justify-end" : "bg-muted justify-start"
                }`}
              >
                <motion.div
                  layout
                  className="bg-white w-4 h-4 rounded-full shadow-md"
                />
              </button>
            </div>

            {locEnabled && (
              <div className="space-y-4 pt-1">
                {/* STEP 2: Venue Selection via Dropdown & GPS Auto-Detect */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <span className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[11px] font-mono flex items-center justify-center font-bold">
                        2
                      </span>
                      {isArabic
                        ? "الخطوة 2: اختيار القاعة أو المعمل أو الحرم"
                        : "Step 2: Select Lecture Hall, Lab, or Campus"}
                    </Label>
                    <a
                      href={INSTITUTE_GEO_LOCATION.GOOGLE_MAPS_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-primary hover:underline flex items-center gap-1 font-medium"
                    >
                      <ExternalLink className="h-3 w-3" />
                      <span>
                        {isArabic ? "خريطة المعهد (Maps)" : "Institute Map"}
                      </span>
                    </a>
                  </div>

                  {/* Dropdown for selecting venue */}
                  <CustomDropdown
                    value={selectedVenuePresetId}
                    options={venueDropdownOptions}
                    onValueChange={handleVenuePresetChange}
                    className="w-full bg-background border-border text-xs font-medium"
                    placeholder={
                      isArabic
                        ? "اختر القاعة أو المعمل..."
                        : "Choose Hall or Lab..."
                    }
                  />

                  {/* GPS Capture Button */}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleUseCurrentLocation}
                    disabled={isLocatingInstructor}
                    className="w-full flex items-center justify-center gap-2 border-primary/30 text-primary bg-primary/5 hover:bg-primary/15 text-xs font-semibold cursor-pointer py-2 rounded-xl"
                  >
                    <Crosshair
                      className={`h-4 w-4 ${isLocatingInstructor ? "animate-spin text-primary" : ""}`}
                    />
                    <span>
                      {isLocatingInstructor
                        ? isArabic
                          ? "جاري تحديد إحداثيات موقعك بالـ GPS..."
                          : "Detecting GPS coordinates..."
                        : isArabic
                          ? "استخدام موقعي الحالي بالـ GPS (تحديد تلقائي فوري)"
                          : "Use My Current Location in the Hall"}
                    </span>
                  </Button>
                </div>

                {/* STEP 3: Allowed Radius & Quick Pills */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <span className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[11px] font-mono flex items-center justify-center font-bold">
                        3
                      </span>
                      {isArabic
                        ? "الخطوة 3: تحديد نطاق السماح (Radius)"
                        : "Step 3: Allowed Radius (Meters)"}
                    </Label>
                    <span className="font-mono font-bold text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-md border border-primary/20">
                      {locRadius} {isArabic ? "متر" : "meters"}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                    {[
                      { r: 50, label: isArabic ? "50م دقيق" : "50m Strict" },
                      { r: 60, label: isArabic ? "60م معمل" : "60m Lab" },
                      { r: 100, label: isArabic ? "100م مدرج" : "100m Hall" },
                      { r: 150, label: isArabic ? "150م مبنى" : "150m Bldg" },
                      { r: 350, label: isArabic ? "350م حرم" : "350m Campus" },
                      { r: 500, label: isArabic ? "500م واسع" : "500m Wide" },
                    ].map((pill) => (
                      <button
                        key={pill.r}
                        type="button"
                        onClick={() => setLocRadius(pill.r)}
                        className={`text-xs py-1.5 rounded-lg border font-semibold transition-all cursor-pointer text-center ${
                          locRadius === pill.r
                            ? "bg-primary text-primary-foreground font-bold border-primary shadow-xs"
                            : "bg-secondary/40 text-muted-foreground border-border hover:bg-secondary hover:text-foreground"
                        }`}
                      >
                        {pill.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={10}
                      max={1000}
                      value={locRadius}
                      onChange={(e) => setLocRadius(Number(e.target.value))}
                      required={locEnabled}
                      className="text-xs h-8"
                    />
                    <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                      {isArabic ? "متر مسموح للابتعاد" : "meters allowed distance"}
                    </span>
                  </div>
                </div>

                {/* STEP 4: Venue Details & Coordinates Preview */}
                <div className="p-3 rounded-2xl bg-secondary/25 border border-border/70 space-y-2.5">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-semibold flex items-center gap-1.5 text-foreground">
                      <span className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[11px] font-mono flex items-center justify-center font-bold">
                        4
                      </span>
                      {isArabic ? "معاينة الإحداثيات واسم القاعة" : "Coordinates Preview"}
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      King Maryut (30.9011, 29.8747)
                    </span>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">
                      {isArabic
                        ? "اسم القاعة أو المعمل المعروض للطلاب:"
                        : "Venue Name:"}
                    </Label>
                    <Input
                      value={locVenueName}
                      onChange={(e) => {
                        setLocVenueName(e.target.value);
                        setSelectedVenuePresetId("custom");
                      }}
                      placeholder="مدرج 1 أو معمل 3"
                      required={locEnabled}
                      className="text-xs h-8"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">
                        {isArabic ? "خط العرض (Latitude)" : "Latitude"}
                      </Label>
                      <Input
                        type="number"
                        step="any"
                        value={locLatitude}
                        onChange={(e) => {
                          setLocLatitude(e.target.value);
                          setSelectedVenuePresetId("custom");
                        }}
                        required={locEnabled}
                        dir="ltr"
                        className="font-mono text-xs h-8"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">
                        {isArabic ? "خط الطول (Longitude)" : "Longitude"}
                      </Label>
                      <Input
                        type="number"
                        step="any"
                        value={locLongitude}
                        onChange={(e) => {
                          setLocLongitude(e.target.value);
                          setSelectedVenuePresetId("custom");
                        }}
                        required={locEnabled}
                        dir="ltr"
                        className="font-mono text-xs h-8"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-0 mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowLocationDialog(false)}
                disabled={isSavingLoc}
              >
                {isArabic ? "إلغاء" : "Cancel"}
              </Button>
              <Button
                type="submit"
                disabled={isSavingLoc}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold"
              >
                {isSavingLoc
                  ? "..."
                  : isArabic
                    ? "حفظ وتطبيق إعدادات الموقع"
                    : "Save & Apply Location"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
