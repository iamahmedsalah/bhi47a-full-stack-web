"use client";

import { useEffect, useRef, useState } from "react";
import {
  Crosshair,
  Loader2,
  CheckCircle2,
  Info,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getHallPosition } from "../lib/location";

interface LocationCaptureProps {
  isArabic: boolean;
  disabled?: boolean;
  onCapture: (position: GeolocationPosition) => void;
  onLocatingChange: (locating: boolean) => void;
  applyHint: string;
}

export function LocationCapture({
  isArabic,
  disabled,
  onCapture,
  onLocatingChange,
  applyHint,
}: LocationCaptureProps) {
  const [state, setState] = useState<"idle" | "locating" | "success" | "error">(
    "idle",
  );
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const requestRef = useRef<AbortController | null>(null);
  const changeRef = useRef(onLocatingChange);
  useEffect(() => {
    changeRef.current = onLocatingChange;
  }, [onLocatingChange]);
  useEffect(
    () => () => {
      requestRef.current?.abort();
      changeRef.current(false);
    },
    [],
  );

  const capture = async () => {
    if (requestRef.current) return;
    if (!window.isSecureContext || !("geolocation" in navigator)) {
      setState("error");
      setMessage(
        isArabic
          ? "تحديد الموقع يحتاج متصفحاً يدعم الموقع واتصال HTTPS. يمكنك إدخال الإحداثيات يدوياً."
          : "Location requires a supported browser and HTTPS. You can enter coordinates manually.",
      );
      return;
    }
    const request = new AbortController();
    requestRef.current = request;
    setState("locating");
    setAccuracy(null);
    setMessage("");
    onLocatingChange(true);
    try {
      const position = await getHallPosition(navigator.geolocation, isArabic, {
        signal: request.signal,
        onProgress: (fix) => {
          if (!request.signal.aborted)
            setAccuracy(Math.round(fix.coords.accuracy));
        },
      });
      if (request.signal.aborted) return;
      onCapture(position);
      setAccuracy(Math.round(position.coords.accuracy));
      setMessage(applyHint);
      setState("success");
    } catch (error) {
      if (request.signal.aborted) return;
      setState("error");
      setMessage(
        error instanceof Error
          ? error.message
          : isArabic
            ? "تعذر تحديد الموقع. أعد المحاولة."
            : "Could not get location. Retry.",
      );
    } finally {
      if (requestRef.current === request) {
        requestRef.current = null;
        onLocatingChange(false);
      }
    }
  };

  const cancel = () => {
    requestRef.current?.abort();
    requestRef.current = null;
    onLocatingChange(false);
    setState("idle");
    setAccuracy(null);
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={capture}
          disabled={disabled || state === "locating"}
          className="min-w-0 flex-1 gap-2 border-primary/30 bg-primary/5 text-primary"
        >
          {state === "locating" ? (
            <Loader2
              className="h-4 w-4 shrink-0 animate-spin"
              aria-hidden="true"
            />
          ) : (
            <Crosshair className="h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          {state === "locating"
            ? isArabic
              ? "جاري تحسين دقة الموقع…"
              : "Finding an accurate location…"
            : state === "error"
              ? isArabic
                ? "إعادة محاولة تحديد الموقع"
                : "Retry current location"
              : isArabic
                ? "استخدام موقعي الحالي"
                : "Use current location"}
        </Button>
        {state === "locating" && (
          <Button type="button" variant="ghost" onClick={cancel}>
            {isArabic ? "إلغاء" : "Cancel"}
          </Button>
        )}
      </div>
      <div
        role={state === "error" ? "alert" : "status"}
        aria-live="polite"
        className={`flex items-start gap-2 rounded-xl border p-3 text-xs leading-relaxed ${state === "error" ? "border-amber-500/30 bg-amber-500/5 text-foreground" : state === "success" ? "border-primary/25 bg-primary/5 text-foreground" : "border-border/60 bg-secondary/20 text-muted-foreground"}`}
      >
        {state === "error" ? (
          <AlertCircle
            className="mt-0.5 h-4 w-4 shrink-0 text-amber-500"
            aria-hidden="true"
          />
        ) : state === "success" ? (
          <CheckCircle2
            className="mt-0.5 h-4 w-4 shrink-0 text-primary"
            aria-hidden="true"
          />
        ) : (
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        )}
        <div className="min-w-0 space-y-1">
          {state === "locating" ? (
            <>
              <p>
                {accuracy !== null
                  ? isArabic
                    ? `أفضل دقة حتى الآن: ±${accuracy} متر`
                    : `Best accuracy so far: ±${accuracy} m`
                  : isArabic
                    ? "اسمح للمتصفح بالوصول للموقع عند ظهور الطلب."
                    : "Allow browser location access when prompted."}
              </p>
              <p>
                {isArabic
                  ? "ننتظر قراءة أدق لمدة تصل إلى 30 ثانية. يمكنك الإلغاء في أي وقت."
                  : "Waiting up to 30 seconds for a better fix. You can cancel anytime."}
              </p>
            </>
          ) : message ? (
            <>
              {state === "success" && (
                <p className="font-medium">
                  {isArabic
                    ? `تم التقاط الموقع بدقة ±${accuracy} متر`
                    : `Location captured with ±${accuracy} m accuracy`}
                </p>
              )}
              <p>{message}</p>
            </>
          ) : (
            <p>
              {isArabic
                ? "الموقع التلقائي يعتمد على دقة جهازك. إذا لم تتوفر قراءة دقيقة، أدخل إحداثيات المكان يدوياً أو استخدم هاتفاً مع GPS."
                : "Automatic location depends on your device. If no precise fix is available, enter the venue coordinates manually or use a phone with GPS."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
