"use client";
import { useState } from "react";
import { ControlTransferProgress } from "./control-transfer-progress";
import { Download, FileSpreadsheet, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { downloadControlTemplate, downloadControlReport } from "../api";
import { getApiErrorMessage } from "@/lib/api";
import type { ControlSheetDetails } from "../types";

export function ControlDownloadDialogs({
  detail,
  locale,
  kind,
  onClose,
}: {
  detail: ControlSheetDetails;
  locale: string;
  kind: "templates" | "reports";
  onClose: () => void;
}) {
  const ar = locale === "ar";
  const [component, setComponent] = useState(detail.sheet.component);
  const [mode, setMode] = useState<"workbook" | "missing" | "exceptions">(
    "workbook",
  );
  const [type, setType] = useState<"course" | "round-table">("course");
  const [level, setLevel] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [percent, setPercent] = useState<number | null>(null);
  const [started, setStarted] = useState(false);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent dir={ar ? "rtl" : "ltr"} className="max-w-lg rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-start">
            {kind === "templates" ? (
              <FileSpreadsheet className="size-5 text-primary" />
            ) : (
              <BarChart3 className="size-5 text-primary" />
            )}
            {kind === "templates"
              ? ar
                ? "نماذج الرصد"
                : "Entry templates"
              : ar
                ? "تقرير الكنترول"
                : "Control reports"}
          </DialogTitle>
          <DialogDescription className="text-start">
            <bdi>
              {detail.course.code} · {detail.sheet.academicYear}
            </bdi>{" "}
            ·{" "}
            {ar
              ? detail.sheet.semester === "first"
                ? "الترم الأول"
                : detail.sheet.semester === "second"
                  ? "الترم الثاني"
                  : "الترم الصيفي"
              : detail.sheet.semester}
          </DialogDescription>
        </DialogHeader>
        {kind === "templates" ? (
          <>
            <p className="text-xs text-muted-foreground">
              {ar
                ? "ورقة رصد واحدة للمكوّن المختار فقط، بدون تبويبات تعليمات أو تقارير. احتفظ بالأعمدة المخفية للتحقق عند إعادة الرفع."
                : "One entry worksheet for the selected component, without instruction or report tabs. Keep hidden validation columns when uploading again."}
            </p>
            <Select
              value={component}
              onValueChange={(value) => setComponent(value as typeof component)}
            >
              <SelectTrigger
                aria-label={ar ? "مكوّن الرصد" : "Entry component"}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent dir={ar ? "rtl" : "ltr"}>
                {(["coursework", "midterm", "final"] as const).map((key) => (
                  <SelectItem key={key} value={key}>
                    {ar
                      ? {
                          coursework: "أعمال السنة",
                          midterm: "الميدتيرم",
                          final: "النهائي",
                        }[key]
                      : key}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={mode}
              onValueChange={(value) => setMode(value as typeof mode)}
            >
              <SelectTrigger aria-label={ar ? "صفوف النموذج" : "Template rows"}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent dir={ar ? "rtl" : "ltr"}>
                <SelectItem value="workbook">
                  {ar ? "الكشف الكامل" : "Full roster"}
                </SelectItem>
                <SelectItem value="missing">
                  {ar ? "الدرجات الناقصة فقط" : "Missing marks only"}
                </SelectItem>
                <SelectItem value="exceptions">
                  {ar ? "الاستثناءات فقط" : "Exceptions only"}
                </SelectItem>
              </SelectContent>
            </Select>
          </>
        ) : (
          <>
            <Select
              value={type}
              onValueChange={(value) => setType(value as typeof type)}
            >
              <SelectTrigger aria-label={ar ? "نوع التقرير" : "Report type"}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent dir={ar ? "rtl" : "ltr"}>
                <SelectItem value="course">
                  {ar ? "تقرير المادة" : "Course report"}
                </SelectItem>
                <SelectItem value="round-table">
                  {ar
                    ? "التقرير المجمع (Round table)"
                    : "Consolidated report (Round table)"}
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {type === "course"
                ? ar
                  ? "درجات وحالات طلاب المادة والتسجيل والمصروفات، مع ورقة تحليل منفصلة. التقرير للمراجعة وليس للنشر للطالب."
                  : "Course marks, exam statuses, registration and fees with a separate analysis sheet. This report does not publish results."
                : ar
                  ? "كل طلاب المستوى الحالي، ومواد المستوى للترم المختار أعلاه، ومكونات الدرجات الثلاثة وحالة التسجيل والمصروفات. يتطلب صلاحية الوصول لكل المقررات."
                  : "All students currently in the level and its term courses, with three grade components, registration and fees. Requires all-course scope."}
            </p>
            {type === "round-table" && (
              <Select value={level} onValueChange={setLevel}>
                <SelectTrigger aria-label={ar ? "المستوى" : "Level"}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent dir={ar ? "rtl" : "ltr"}>
                  {["1", "2", "3", "4"].map((value) => (
                    <SelectItem key={value} value={value}>
                      {ar ? `المستوى ${value}` : `Level ${value}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        {started && !error && (
          <ControlTransferProgress
            percent={percent}
            label={
              busy
                ? percent === null
                  ? ar
                    ? "جارٍ تجهيز الملف؛ ستظهر نسبة النقل عند توفر حجمه"
                    : "Preparing file; transfer percentage appears when its size is available"
                  : ar
                    ? "تنزيل الملف"
                    : "Downloading file"
                : ar
                  ? "اكتمل تنزيل الملف"
                  : "Download complete"
            }
          />
        )}
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            setPercent(null);
            setStarted(true);
            try {
              if (kind === "templates")
                await downloadControlTemplate(
                  detail.sheet.id,
                  component,
                  detail.course.code,
                  mode,
                  setPercent,
                );
              else
                await downloadControlReport(
                  detail.sheet.id,
                  {
                    type,
                    academicYear: detail.sheet.academicYear,
                    semester: detail.sheet.semester,
                    ...(type === "round-table" ? { level } : {}),
                  },
                  detail.course.code,
                  setPercent,
                );
            } catch (cause) {
              setError(getApiErrorMessage(cause));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Download className="size-4" />
          {busy
            ? ar
              ? "جارٍ تجهيز الملف"
              : "Preparing file"
            : ar
              ? "تنزيل Excel"
              : "Download Excel"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
