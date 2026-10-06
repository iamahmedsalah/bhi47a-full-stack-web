"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  QrCode,
  Camera,
  Keyboard,
  CheckCircle2,
  AlertCircle,
  Clock,
  RefreshCw,
  Copy,
  SwitchCamera,
  XCircle,
  Lightbulb,
} from "lucide-react";
import { toast } from "sonner";
import { attendanceApi, CheckInResponse } from "../api/attendance-api";
import {
  createQrTokenSchema,
  extractRawToken,
  getAttendanceErrorMessage,
} from "../schemas/attendance-schemas";
import { getDeviceIdentity } from "@/lib/device-id";
import { getAttendancePosition } from "../lib/location";

interface StudentQrScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  locale?: string;
  initialToken?: string;
}

interface DetectedBarcode {
  rawValue?: string;
}

interface BarcodeDetectorInstance {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
}

interface BarcodeDetectorConstructor {
  new (options: { formats: string[] }): BarcodeDetectorInstance;
}

type WindowWithBarcodeDetector = Window &
  typeof globalThis & {
    BarcodeDetector?: BarcodeDetectorConstructor;
  };

export function StudentQrScannerDialog({
  open,
  onOpenChange,
  onSuccess,
  locale = "ar",
  initialToken = "",
}: StudentQrScannerDialogProps) {
  const isAr = locale.startsWith("ar");

  const [activeTab, setActiveTab] = useState<"camera" | "manual">("camera");
  const [manualInput, setManualInput] = useState(initialToken);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraFacing, setCameraFacing] = useState<"environment" | "user">(
    "environment",
  );
  const [checkInResult, setCheckInResult] = useState<CheckInResponse | null>(
    null,
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cameraRunRef = useRef(0);
  const checkInInFlightRef = useRef(false);

  // Stop camera helper
  const stopCamera = useCallback(() => {
    cameraRunRef.current += 1;
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  // Handle Check-in Verification
  const executeCheckIn = useCallback(
    async (rawString: string) => {
      const cleanToken = extractRawToken(rawString);
      const schema = createQrTokenSchema(locale);
      const validation = schema.safeParse(cleanToken);

      if (!validation.success) {
        const errorMsg =
          validation.error.issues[0]?.message ||
          (isAr ? "رمز الحضور غير صالح" : "Invalid token");
        setValidationError(errorMsg);
        toast.error(errorMsg);
        return;
      }

      if (checkInInFlightRef.current) return;
      checkInInFlightRef.current = true;

      setValidationError(null);
      setIsSubmitting(true);

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
            // Geolocation fallback — proceed without coordinates
          }
        }

        const res = await attendanceApi.checkIn({
          token: cleanToken,
          deviceId: deviceIdentity.deviceId,
          deviceFingerprint: deviceIdentity.deviceFingerprint,
          deviceInfo: deviceIdentity.deviceInfo,
          ...coords,
        });
        setCheckInResult(res);
        stopCamera();
        toast.success(
          res.message ||
            (isAr
              ? "تم تسجيل الحضور بنجاح!"
              : "Attendance checked in successfully!"),
        );
        onSuccess?.();
      } catch (err: unknown) {
        const msg = getAttendanceErrorMessage(err, locale);
        toast.error(msg);
        setValidationError(msg);
      } finally {
        checkInInFlightRef.current = false;
        setIsSubmitting(false);
      }
    },
    [isAr, locale, onSuccess, stopCamera],
  );

  const startCanvasScanner = useCallback(
    async (cameraRun: number) => {
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }

      let decodeQr: typeof import("jsqr").default;
      try {
        decodeQr = (await import("jsqr")).default;
      } catch (error) {
        console.warn("Could not load the QR scanner fallback", error);
        setCameraError(
          isAr
            ? "تعذر تحميل قارئ QR في المتصفح. يرجى إدخال الرمز يدوياً."
            : "Could not load the QR scanner. Please enter the code manually.",
        );
        return;
      }

      if (cameraRun !== cameraRunRef.current) return;

      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;

      setCameraError(null);
      let scanInFlight = false;
      scanIntervalRef.current = setInterval(async () => {
        const video = videoRef.current;
        if (
          scanInFlight ||
          cameraRun !== cameraRunRef.current ||
          !video ||
          video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
          video.videoWidth === 0 ||
          video.videoHeight === 0
        ) {
          return;
        }

        scanInFlight = true;
        try {
          const scale = Math.min(1, 960 / video.videoWidth);
          canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
          canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const frame = context.getImageData(0, 0, canvas.width, canvas.height);
          const result = decodeQr(frame.data, frame.width, frame.height, {
            inversionAttempts: "attemptBoth",
          });

          if (result?.data && cameraRun === cameraRunRef.current) {
            stopCamera();
            await executeCheckIn(result.data);
          }
        } catch {
          // A partially rendered frame can fail; the next frame will retry.
        } finally {
          scanInFlight = false;
        }
      }, 250);
    },
    [executeCheckIn, isAr, stopCamera],
  );

  // Start camera stream
  const startCamera = useCallback(async () => {
    stopCamera();
    const cameraRun = cameraRunRef.current;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError(
        isAr
          ? "المتصفح لا يدعم الوصول المباشر للكاميرا. يرجى إدخال الرمز يدوياً."
          : "Camera access is not supported by your browser. Please enter the code manually.",
      );
      setActiveTab("manual");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: cameraFacing,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      if (cameraRun !== cameraRunRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }

      // BarcodeDetector API for instant camera scanning if supported
      if (typeof window !== "undefined" && "BarcodeDetector" in window) {
        try {
          const BarcodeDetector = (window as WindowWithBarcodeDetector)
            .BarcodeDetector!;
          const barcodeDetector = new BarcodeDetector({
            formats: ["qr_code"],
          });

          scanIntervalRef.current = setInterval(async () => {
            if (!videoRef.current || videoRef.current.readyState < 2) return;
            try {
              const barcodes = await barcodeDetector.detect(videoRef.current);
              if (barcodes && barcodes.length > 0) {
                const rawValue = barcodes[0].rawValue;
                if (rawValue && cameraRun === cameraRunRef.current) {
                  stopCamera();
                  void executeCheckIn(rawValue);
                }
              }
            } catch {
              void startCanvasScanner(cameraRun);
            }
          }, 250);
        } catch {
          void startCanvasScanner(cameraRun);
        }
      } else {
        // Universal fallback to jsQR canvas scanner (works everywhere including iOS Safari)
        void startCanvasScanner(cameraRun);
      }
    } catch (err: unknown) {
      console.warn("Camera access denied or unavailable", err);
      setCameraError(
        isAr
          ? "تعذر الوصول إلى الكاميرا. يرجى التأكد من منح الإذن للمتصفح أو استخدام خيار إدخال الكود يدوياً."
          : "Could not access camera. Please allow camera permissions or enter the code manually.",
      );
    }
  }, [cameraFacing, executeCheckIn, isAr, startCanvasScanner, stopCamera]);

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setCheckInResult(null);
      setValidationError(null);
      if (initialToken) {
        setManualInput(initialToken);
        setActiveTab("manual");
      }
    } else {
      stopCamera();
    }
    onOpenChange(isOpen);
  };

  // Camera stream lifecycle
  useEffect(() => {
    let active = true;
    if (open && activeTab === "camera") {
      void Promise.resolve().then(() => {
        if (active) {
          void startCamera();
        }
      });
    } else {
      stopCamera();
    }

    return () => {
      active = false;
      stopCamera();
    };
  }, [open, activeTab, startCamera, stopCamera]);

  // Handle manual submit
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim()) return;
    executeCheckIn(manualInput);
  };

  // Quick clipboard paste
  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setManualInput(text.trim());
        executeCheckIn(text.trim());
      }
    } catch {
      toast.info(
        isAr
          ? "يرجى لصق الرمز يدوياً في الحقل"
          : "Please paste the token manually into the input",
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="w-[95vw] max-w-md border-border bg-card text-card-foreground p-5 sm:p-6 rounded-2xl"
        dir={isAr ? "rtl" : "ltr"}
      >
        <DialogHeader className="space-y-1.5 text-start pb-2 border-b border-border/60">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 text-primary">
              <QrCode className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-foreground">
                {isAr
                  ? "تسجيل الحضور الأكاديمي"
                  : "Academic Attendance Check-in"}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {isAr
                  ? "امسح رمز QR المعروض على شاشة المحاضر أو أدخل الرمز المؤقت"
                  : "Scan the rotating QR on the instructor display or enter code"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Success View */}
        {checkInResult ? (
          <div className="py-4 space-y-5 text-center animate-fade-in">
            <div
              className={`h-20 w-20 mx-auto rounded-full flex items-center justify-center transition-all ${
                checkInResult.status === "present"
                  ? "bg-emerald-500/15 text-emerald-500 border-2 border-emerald-500/40 ring-4 ring-emerald-500/15 shadow-[0_0_30px_rgba(16,185,129,0.3)]"
                  : "bg-amber-500/15 text-amber-400 border-2 border-amber-500/40 ring-4 ring-amber-500/10 shadow-[0_0_25px_rgba(245,158,11,0.2)]"
              }`}
            >
              {checkInResult.status === "present" ? (
                <CheckCircle2 className="h-10 w-10 text-emerald-500 animate-pulse" />
              ) : (
                <Clock className="h-10 w-10 text-amber-400" />
              )}
            </div>

            <div className="space-y-1.5">
              <Badge
                className={`text-xs px-3 py-1 font-bold inline-flex items-center gap-1.5 shadow-xs ${
                  checkInResult.status === "present"
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                    : "bg-amber-500/20 text-amber-400 border-amber-500/40"
                }`}
              >
                {checkInResult.status === "present" ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>{isAr ? "✓ حاضر (تم توثيق الحضور)" : "PRESENT"}</span>
                  </>
                ) : (
                  <>
                    <Clock className="h-3.5 w-3.5" />
                    <span>{isAr ? "⏰ حاضر (متأخر)" : "LATE"}</span>
                  </>
                )}
              </Badge>
              <h3 className="text-base font-bold text-foreground">
                {checkInResult.courseName || checkInResult.courseCode}
              </h3>
              <p className="text-xs text-muted-foreground">
                {checkInResult.message}
              </p>
            </div>

            <div
              className={`p-4 rounded-xl text-xs space-y-2 text-start font-mono border ${
                checkInResult.status === "present"
                  ? "bg-emerald-500/5 border-emerald-500/25"
                  : "bg-secondary/30 border-border/60"
              }`}
            >
              <div className="flex justify-between text-muted-foreground">
                <span>{isAr ? "نوع الجلسة:" : "Session Type:"}</span>
                <span className="text-foreground capitalize font-bold">
                  {checkInResult.sessionType || "Lecture"}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>{isAr ? "وقت التسجيل:" : "Check-in Time:"}</span>
                <span className="text-emerald-500 font-bold">
                  {new Date(checkInResult.checkedInAt).toLocaleTimeString(
                    isAr ? "ar-EG" : "en-US",
                    { hour: "2-digit", minute: "2-digit", second: "2-digit" },
                  )}
                </span>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setCheckInResult(null);
                  setActiveTab("camera");
                  startCamera();
                }}
                className="w-1/2 border-border text-xs cursor-pointer"
              >
                {isAr ? "تسجيل جلسة أخرى" : "Check In Another"}
              </Button>
              <Button
                onClick={() => onOpenChange(false)}
                className="w-1/2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs cursor-pointer shadow-sm transition-all"
              >
                {isAr ? "تم بنجاح وإغلاق" : "Done & Close"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            {/* Mode Switcher Tabs */}
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-secondary/40 border border-border/70">
              <button
                type="button"
                onClick={() => {
                  setActiveTab("camera");
                  startCamera();
                }}
                className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === "camera"
                    ? "bg-primary text-primary-foreground shadow-sm font-bold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Camera className="h-4 w-4" />
                <span>{isAr ? "مسح بالكاميرا" : "Camera Scanner"}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  setActiveTab("manual");
                }}
                className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === "manual"
                    ? "bg-primary text-primary-foreground shadow-sm font-bold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Keyboard className="h-4 w-4" />
                <span>{isAr ? "إدخال الرمز يدوياً" : "Enter Code"}</span>
              </button>
            </div>

            {/* TAB 1: Camera Scanner */}
            {activeTab === "camera" && (
              <div className="space-y-3">
                <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black border border-border/70 shadow-inner flex items-center justify-center">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="h-full w-full object-cover"
                  />

                  {/* Clean Viewport Overlay */}
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div
                      className={`relative h-44 w-44 rounded-2xl transition-all duration-300 ${
                        isSubmitting
                          ? "border-2 border-emerald-500 shadow-[0_0_35px_rgba(16,185,129,0.7)]"
                          : "border-2 border-primary/80 shadow-[0_0_15px_rgba(20,184,166,0.3)]"
                      }`}
                    >
                      {/* Subtle Laser Scanline */}
                      <div
                        className={`absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent ${
                          isSubmitting ? "via-emerald-400" : "via-primary"
                        } to-transparent animate-[bounce_2s_infinite]`}
                      />

                      {/* Corner Accents */}
                      <span
                        className={`absolute -top-1 -start-1 h-3.5 w-3.5 border-t-2 border-s-2 ${
                          isSubmitting ? "border-emerald-400" : "border-primary"
                        }`}
                      />
                      <span
                        className={`absolute -top-1 -end-1 h-3.5 w-3.5 border-t-2 border-e-2 ${
                          isSubmitting ? "border-emerald-400" : "border-primary"
                        }`}
                      />
                      <span
                        className={`absolute -bottom-1 -start-1 h-3.5 w-3.5 border-b-2 border-s-2 ${
                          isSubmitting ? "border-emerald-400" : "border-primary"
                        }`}
                      />
                      <span
                        className={`absolute -bottom-1 -end-1 h-3.5 w-3.5 border-b-2 border-e-2 ${
                          isSubmitting ? "border-emerald-400" : "border-primary"
                        }`}
                      />
                    </div>
                  </div>

                  {/* Switch Camera Button */}
                  <button
                    type="button"
                    onClick={() => {
                      setCameraFacing((prev) =>
                        prev === "environment" ? "user" : "environment",
                      );
                    }}
                    className="absolute bottom-2.5 end-2.5 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-black/70 hover:bg-black/90 text-foreground text-[11px] font-medium border border-border/60 backdrop-blur-md cursor-pointer transition-all"
                  >
                    <SwitchCamera className="h-3.5 w-3.5" />
                    <span>{isAr ? "تبديل الكاميرا" : "Switch"}</span>
                  </button>
                </div>

                {cameraError ? (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs space-y-2">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                      <p className="leading-relaxed">{cameraError}</p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setActiveTab("manual")}
                      className="w-full text-xs border-amber-500/40 text-amber-200 hover:bg-amber-500/15"
                    >
                      {isAr
                        ? "الانتقال إلى الإدخال اليدوي"
                        : "Switch to Manual Code Entry"}
                    </Button>
                  </div>
                ) : (
                  <p className="text-[11px] text-center text-muted-foreground leading-relaxed">
                    {isAr
                      ? "وجّه كاميرا الهاتف نحو رمز QR المتجدد على شاشة القاعة ليتم مسحه وتوثيق الحضور فوراً."
                      : "Point your camera at the rotating QR code on the lecture screen."}
                  </p>
                )}
              </div>
            )}

            {/* TAB 2: Manual Code Input */}
            {activeTab === "manual" && (
              <form onSubmit={handleManualSubmit} className="space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                    <label>
                      {isAr
                        ? "رمز الحضور القصير أو الرابط:"
                        : "Short attendance code or URL:"}
                    </label>
                    <button
                      type="button"
                      onClick={handlePasteClipboard}
                      className="flex items-center gap-1 text-primary hover:text-primary/80 cursor-pointer"
                    >
                      <Copy className="h-3 w-3" />
                      <span>{isAr ? "لصق من الحافظة" : "Paste"}</span>
                    </button>
                  </div>

                  <Input
                    type="text"
                    value={manualInput}
                    onChange={(e) => {
                      setManualInput(e.target.value);
                      if (validationError) setValidationError(null);
                    }}
                    placeholder="ABC123-456789"
                    className="font-mono text-xs text-center"
                    autoFocus
                  />

                  {validationError && (
                    <p className="text-xs text-rose-400 flex items-center gap-1 mt-1">
                      <XCircle className="h-3.5 w-3.5 shrink-0" />
                      <span>{validationError}</span>
                    </p>
                  )}
                </div>

                <div className="flex items-start gap-2 rounded-xl border border-border/70 bg-secondary/30 p-2.5 text-[11px] text-muted-foreground leading-relaxed">
                  <Lightbulb className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <span>
                    {isAr
                      ? "أدخل الرمز القصير المعروض أسفل QR، أو الصق رابط الحضور الكامل."
                      : "Enter the short code shown below the QR, or paste the full attendance URL."}
                  </span>
                </div>

                <Button
                  type="submit"
                  disabled={isSubmitting || !manualInput.trim()}
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs shadow-sm cursor-pointer"
                >
                  {isSubmitting ? (
                    <span className="flex items-center gap-2">
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      {isAr ? "جاري توثيق الحضور..." : "Verifying..."}
                    </span>
                  ) : (
                    <span>
                      {isAr
                        ? "توثيق الحضور الآن"
                        : "Verify & Record Attendance"}
                    </span>
                  )}
                </Button>
              </form>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
