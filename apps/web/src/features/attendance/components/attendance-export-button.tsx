"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  attendanceApi,
  type AttendanceSessionQuery,
} from "../api/attendance-api";

export function AttendanceExportButton({
  isArabic,
  sessionId,
  filters = {},
  disabled,
}: {
  isArabic: boolean;
  sessionId?: string;
  filters?: AttendanceSessionQuery;
  disabled?: boolean;
}) {
  const [downloading, setDownloading] = useState(false);
  const download = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const blob = await attendanceApi.exportAttendance(
        { ...filters, lang: isArabic ? "ar" : "en" },
        sessionId,
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `attendance-${sessionId || "filtered"}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(
        isArabic ? "تم تنزيل تقرير الحضور." : "Attendance report downloaded.",
      );
    } catch {
      toast.error(
        isArabic
          ? "تعذر تنزيل التقرير. أعد المحاولة."
          : "Could not download the report. Please retry.",
      );
    } finally {
      setDownloading(false);
    }
  };
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled || downloading}
      onClick={download}
      className="gap-2"
      title={
        isArabic
          ? "تنزيل كل السجلات المطابقة، وليس الصفحة الحالية فقط"
          : "Download all matching records, across every page"
      }
    >
      {downloading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <Download className="h-4 w-4" aria-hidden="true" />
      )}
      {downloading
        ? isArabic
          ? "جاري تجهيز التقرير…"
          : "Preparing report…"
        : isArabic
          ? "تنزيل Excel"
          : "Download Excel"}
    </Button>
  );
}
