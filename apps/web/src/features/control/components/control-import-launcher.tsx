"use client";
import { useRef, useState } from "react";
import { FileSpreadsheet, UploadCloud, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ControlFileImportDialog } from "./control-file-import-dialog";
import type { WorkbookRow } from "../types";

export function ControlImportLauncher({
  sheetId,
  rows,
  locale,
  onClose,
  onSaved,
  onAudit,
}: {
  sheetId: string;
  rows: WorkbookRow[];
  locale: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onDownload?: () => Promise<unknown>;
  onAudit?: () => void;
}) {
  const ar = locale === "ar";
  const picker = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  function choose(files: FileList | null) {
    setDragging(false);
    if (!files?.length) return;
    if (files.length !== 1 || !files[0].name.toLowerCase().endsWith(".xlsx")) {
      setError(
        ar
          ? "اختر ملف XLSX واحدًا من كشف الكنترول."
          : "Choose one XLSX Control workbook.",
      );
      return;
    }
    if (!files[0].size || files[0].size > 2 * 1024 * 1024) {
      setError(
        ar
          ? "الملف يجب أن يكون غير فارغ وبحد أقصى 2 ميجابايت."
          : "Choose a nonempty file up to 2 MB.",
      );
      return;
    }
    setError("");
    setFile(files[0]);
  }
  if (file)
    return (
      <ControlFileImportDialog
        key={`${file.name}:${file.lastModified}`}
        file={file}
        sheetId={sheetId}
        rows={rows}
        locale={locale}
        onClose={onClose}
        onSaved={onSaved}
        onChooseAnother={() => setFile(null)}
      />
    );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        dir={ar ? "rtl" : "ltr"}
        className="max-w-4xl rounded-2xl max-h-[90dvh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-start">
            <FileSpreadsheet className="size-5 text-primary" />
            {ar
              ? "استيراد ومراجعة درجات الكنترول"
              : "Import and review Control grades"}
          </DialogTitle>
          <DialogDescription className="text-start">
            {ar
              ? "اختر ملف الكشف، راجع الصفوف والأخطاء أولًا، ثم احفظ الصفوف الصالحة على دفعات."
              : "Choose a workbook, review its rows and issues, then save valid rows in batches."}
          </DialogDescription>
        </DialogHeader>
        {onAudit && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4">
            <div>
              <h3 className="font-semibold">
                {ar
                  ? "سجل مراجعة واستيراد الدرجات"
                  : "Grade review and import history"}
              </h3>
              <p className="text-xs text-muted-foreground">
                {ar
                  ? "الدرجات قبل التعديل وبعده، والمسؤول وتاريخ التغيير."
                  : "Before/after marks, operator and change date."}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                onClose();
                onAudit();
              }}
            >
              {ar ? "عرض سجل التدقيق" : "View audit history"}
            </Button>
          </div>
        )}
        <input
          ref={picker}
          type="file"
          accept=".xlsx"
          className="hidden"
          aria-label={ar ? "ملف درجات الكنترول" : "Control grades file"}
          onChange={(event) => {
            choose(event.target.files);
            event.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => picker.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            choose(event.dataTransfer.files);
          }}
          className={`flex min-h-52 w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-6 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${dragging ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/60"}`}
        >
          <UploadCloud className="size-12 text-primary" />
          <span className="text-base font-semibold">
            {ar
              ? "اضغط لاختيار ملف أو اسحب الملف وأفلته هنا"
              : "Click to choose a file or drag and drop it here"}
          </span>
          <span className="text-xs text-muted-foreground">
            XLSX ·{" "}
            {ar
              ? "بحد أقصى 2 ميجابايت · 500 صف لكل دفعة"
              : "Up to 2 MB · 500 rows per batch"}
          </span>
        </button>
        {error && (
          <p
            role="alert"
            className="flex gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-400"
          >
            <AlertCircle className="size-4 shrink-0" />
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
