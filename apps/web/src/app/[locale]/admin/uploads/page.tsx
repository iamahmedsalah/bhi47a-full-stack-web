"use client";

import { useTranslations } from "next-intl";
import React, { useState, Suspense, useMemo } from "react";
import { useParams } from "next/navigation";
import {
  UploadCloud,
  FileSpreadsheet,
  AlertTriangle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Download,
  Users,
  BookOpen,
  Calendar,
  Mail,
  CheckCircle2,
  FileText,
  Info,
  X,
  Eye,
  Trash2,
  AlertOctagon,
  RotateCcw,
  Copy,
  XCircle,
  Search,
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import api, { getApiErrorMessage } from "@/lib/api";
import { PageTitleBanner } from "@/components/ui/page-title-banner";
import { PageSkeletonLoader } from "@/components/ui/page-suspense-fallback";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { downloadExcel } from "@/lib/utils";
import { cn } from "@/lib/cn";

import type {
  PreFlightResult,
  UploadCatalogType,
  UploadResult,
} from "@/features/uploads/types";
import {
  UPLOAD_CATALOGS,
  downloadCsvTemplate,
  downloadOfficialTemplate,
} from "@/features/uploads/upload-catalog";
import { inspectAndValidateFile } from "@/features/uploads/pre-flight-inspector";
import { ExcelPreviewGrid } from "@/features/uploads/components/excel-preview-grid";
import { useBatchUpload } from "@/features/uploads/use-batch-upload";
import { DataUploadProgress } from "@/components/ui/data-upload-progress";
import { saveUploadHistoryEntry } from "@/features/uploads/upload-history";
import { UploadHistoryCard } from "@/features/uploads/components/upload-history-card";

const CATALOG_ICONS: Record<UploadCatalogType, React.ReactNode> = {
  students: <Users className="h-5 w-5" />,
  courses: <BookOpen className="h-5 w-5" />,
  grades: <FileSpreadsheet className="h-5 w-5" />,
  quizzes: <CheckCircle2 className="h-5 w-5" />,
  attendance: <Calendar className="h-5 w-5" />,
  "academic-emails": <Mail className="h-5 w-5" />,
  "academic-warnings": <AlertOctagon className="h-5 w-5" />,
};

function UploadsPageContent() {
  const params = useParams();
  const locale = (params?.locale as string) || "ar";
  const isAr = locale === "ar";

  // Form State
  const controlText = useTranslations("controlRelease");
  const [uploadType, setUploadType] = useState<UploadCatalogType>("students");
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);

  // Pre-flight Inspection state
  const [preview, setPreview] = useState<PreFlightResult | null>(null);
  const [isInspecting, setIsInspecting] = useState(false);

  // Upload Result State
  const [result, setResult] = useState<UploadResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [errorSearch, setErrorSearch] = useState("");

  const uploader = useBatchUpload({
    onSuccess: (uploadRes) => {
      setResult(uploadRes);
      if (file) {
        saveUploadHistoryEntry({
          fileName: file.name,
          catalogType: uploadType,
          fileSizeBytes: file.size,
          successCount: uploadRes.successCount,
          failedCount: uploadRes.failedCount,
          totalRows:
            preview?.totalRows ??
            uploadRes.successCount + uploadRes.failedCount,
          status:
            uploadRes.failedCount === 0
              ? "success"
              : uploadRes.successCount > 0
                ? "partial"
                : "failed",
          allowDuplicateStudentCode,
        });
      }
      if (uploadRes.successCount > 0) {
        toast.success(
          isAr
            ? `تم استيراد ${uploadRes.successCount} سجل بنجاح إلى قاعدة البيانات`
            : `Successfully imported ${uploadRes.successCount} record(s)`,
        );
      }
      if (uploadRes.failedCount > 0) {
        toast.error(
          isAr
            ? `تعذر استيراد ${uploadRes.failedCount} سجل`
            : `Failed to import ${uploadRes.failedCount} record(s)`,
        );
      }
      void wipeSummaryQuery.refetch();
    },
    onError: (err) => {
      setErrorMsg(err);
    },
  });

  const loading = uploader.isUploading;

  // UI Accordions
  const [showFieldsGuide, setShowFieldsGuide] = useState(true);

  // Multi-Course / Duplicate Student Code Toggle
  const [allowDuplicateStudentCode, setAllowDuplicateStudentCode] = useState(
    uploadType === "grades" ||
      uploadType === "quizzes" ||
      uploadType === "attendance",
  );

  const [prevUploadType, setPrevUploadType] = useState(uploadType);
  if (uploadType !== prevUploadType) {
    setPrevUploadType(uploadType);
    setAllowDuplicateStudentCode(
      uploadType === "grades" ||
        uploadType === "quizzes" ||
        uploadType === "attendance",
    );
  }

  const reInspectWithOption = async (newAllowDuplicate: boolean) => {
    setAllowDuplicateStudentCode(newAllowDuplicate);
    if (!file) return;
    setIsInspecting(true);
    try {
      const inspectRes = await inspectAndValidateFile(file, uploadType, isAr, {
        allowDuplicateStudentCode: newAllowDuplicate,
      });
      setPreview(inspectRes);
    } catch (err: unknown) {
      setErrorMsg(
        (err instanceof Error ? err.message : '') || (isAr ? "فشل فحص الملف" : "Inspection failed"),
      );
    } finally {
      setIsInspecting(false);
    }
  };

  // Data Wipe / Reset State
  type WipeTarget =
    "grades" | "quizzes" | "attendance" | "students" | "complaints" | "all";
  const [wipeDialogOpen, setWipeDialogOpen] = useState(false);
  const [selectedWipeTarget, setSelectedWipeTarget] =
    useState<WipeTarget>("grades");
  const [wipeConfirmText, setWipeConfirmText] = useState("");

  const activeCatalog = useMemo(
    () => UPLOAD_CATALOGS[uploadType],
    [uploadType],
  );

  const wipeSummaryQuery = useQuery({
    queryKey: ["admin-uploads-wipe-summary"],
    queryFn: async () => {
      const res = await api.get<{
        studentsCount: number;
        gradesCount: number;
        attendanceCount: number;
        registrationsCount: number;
        advisingCasesCount: number;
        quizzesCount: number;
        complaintsCount?: number;
      }>("/admin/uploads/wipe-summary");
      return res.data;
    },
  });

  const wipeMutation = useMutation({
    mutationFn: async (target: WipeTarget) => {
      const res = await api.post("/admin/uploads/wipe", { target });
      return res.data;
    },
    onSuccess: (_, target) => {
      const targetLabels: Record<string, { ar: string; en: string }> = {
        grades: { ar: "الدرجات", en: "grades" },
        quizzes: { ar: "الكويزات", en: "quizzes" },
        attendance: { ar: "سجلات الحضور", en: "attendance" },
        students: { ar: "بيانات الطلاب", en: "students" },
        complaints: { ar: "شكاوى وتذاكر الطلاب", en: "complaints" },
        all: { ar: "كافة السجلات الأكاديمية", en: "all academic records" },
      };
      const label = targetLabels[target];
      toast.success(
        isAr
          ? `تم مسح ${label?.ar || "البيانات"} بنجاح ويمكن الآن بدء رفع البيانات النظيفة`
          : `Data wiped successfully for ${label?.en || target}. Ready for fresh upload.`,
      );
      void wipeSummaryQuery.refetch();
      setWipeDialogOpen(false);
      setWipeConfirmText("");
    },
    onError: (err: unknown) => {
      toast.error(
        getApiErrorMessage(
          err,
          isAr ? "فشل مسح البيانات" : "Failed to wipe data",
        ),
      );
    },
  });

  const handleSelectFile = async (selectedFile?: File | null) => {
    if (!selectedFile) return;

    if (!/\.(xlsx|xls|csv)$/i.test(selectedFile.name)) {
      setErrorMsg(
        isAr
          ? "يرجى اختيار ملف صالح بصيغة xlsx أو xls أو csv"
          : "Please choose a valid xlsx, xls, or csv file",
      );
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      setErrorMsg(
        isAr
          ? "يجب أن يكون حجم الملف 10 ميجابايت أو أقل"
          : "File must be 10 MB or smaller",
      );
      return;
    }

    setFile(selectedFile);
    setErrorMsg("");
    setResult(null);
    setIsInspecting(true);

    try {
      const inspectRes = await inspectAndValidateFile(
        selectedFile,
        uploadType,
        isAr,
        {
          allowDuplicateStudentCode,
        },
      );
      setPreview(inspectRes);
      toast.success(
        isAr
          ? `تم فحص الملف: ${inspectRes.totalRows} صف (${inspectRes.validRows} صالح)`
          : `Workbook inspected: ${inspectRes.totalRows} rows (${inspectRes.validRows} valid)`,
      );
    } catch (err: unknown) {
      setPreview(null);
      setErrorMsg(
        (err instanceof Error ? err.message : '') ||
          (isAr
            ? "تعذر قراءة أو فحص ملف الإكسيل"
            : "Failed to inspect workbook"),
      );
    } finally {
      setIsInspecting(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      setIsDownloadingTemplate(true);
      await downloadOfficialTemplate(uploadType, isAr ? "ar" : "en");
      toast.success(
        isAr
          ? "تم تحميل نموذج Excel المعتمد (.xlsx)"
          : "Official template downloaded (.xlsx)",
      );
    } catch {
      toast.error(
        isAr ? "فشل تحميل نموذج Excel" : "Failed to download Excel template",
      );
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  const handleDownloadCsv = () => {
    try {
      downloadCsvTemplate(uploadType, isAr ? "ar" : "en");
      toast.success(
        isAr
          ? "تم تحميل نموذج CSV المعتمد (.csv)"
          : "CSV template downloaded (.csv)",
      );
    } catch {
      toast.error(
        isAr ? "فشل تحميل نموذج CSV" : "Failed to download CSV template",
      );
    }
  };

  const handleUploadSubmit = async () => {
    if (!file) {
      toast.error(
        isAr ? "يرجى اختيار ملف أولاً" : "Please select a file first",
      );
      return;
    }

    setErrorMsg("");
    setResult(null);

    await uploader.startUpload({
      file,
      type: uploadType,
      parsedRows: preview?.parsedRows,
      isAr,
    });
  };

  const copyErrorsToClipboard = () => {
    if (!result?.errors.length) return;
    void navigator.clipboard.writeText(result.errors.join("\n"));
    toast.success(
      isAr ? "تم نسخ قائمة الأخطاء للحافظة" : "Errors copied to clipboard",
    );
  };

  const downloadErrorReport = () => {
    if (!result?.errors.length) return;
    const reportData = result.errors.map((errText, idx) => ({
      index: idx + 1,
      errorMessage: errText,
    }));
    downloadExcel(
      reportData,
      ["#", isAr ? "تفاصيل الخطأ" : "Error Details"],
      `import_errors_${uploadType}_${new Date().toISOString().slice(0, 10)}`,
    );
  };

  const filteredErrors = useMemo(() => {
    if (!result?.errors) return [];
    if (!errorSearch.trim()) return result.errors;
    const q = errorSearch.trim().toLowerCase();
    return result.errors.filter((e) => e.toLowerCase().includes(q));
  }, [result?.errors, errorSearch]);

  const catalogTypesList = Object.keys(UPLOAD_CATALOGS) as UploadCatalogType[];

  return (
    <div className="space-y-6">
      {/* 1. Page Title & Action Bar */}
      <PageTitleBanner
        title={
          isAr
            ? "مركز استيراد ورفع البيانات الأكاديمية"
            : "Data Import & Master Catalogs"
        }
        subtitle={
          isAr
            ? "رفع واستيراد البيانات الشاملة للطلاب والمقررات والدرجات باستخدام نماذج Excel المعتمدة."
            : "Import and batch-update student profiles, courses catalog, exam scores, and attendance logs."
        }
      >
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setWipeConfirmText("");
              setWipeDialogOpen(true);
            }}
            className="text-xs h-9 font-medium border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 cursor-pointer shadow-xs"
          >
            <RotateCcw className="w-4 h-4" />
            <span>{isAr ? "تهيئة ومسح البيانات" : "Wipe / Reset Data"}</span>
          </Button>
        </div>
      </PageTitleBanner>

      {/* 2. Catalog Selection Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {catalogTypesList.map((typeKey) => {
          const cat = UPLOAD_CATALOGS[typeKey];
          const isSelected = uploadType === typeKey;
          const Icon = CATALOG_ICONS[typeKey];

          return (
            <button
              key={typeKey}
              type="button"
              onClick={() => {
                setUploadType(typeKey);
                setFile(null);
                setPreview(null);
                setResult(null);
                setErrorMsg("");
              }}
              className={cn(
                "p-3.5 rounded-2xl border text-start transition-all cursor-pointer flex flex-col justify-between gap-3",
                isSelected
                  ? "border-teal-500 bg-teal-500/10 text-foreground shadow-sm ring-1 ring-teal-500 font-semibold"
                  : "border-border/70 bg-card hover:bg-muted/40 text-muted-foreground hover:text-foreground",
              )}
            >
              <div className="flex items-center justify-between w-full">
                <div
                  className={cn(
                    "p-2 rounded-xl shrink-0",
                    isSelected
                      ? "bg-teal-600 text-white"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {Icon}
                </div>
                {isSelected && (
                  <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
                )}
              </div>
              <div>
                <p className="text-xs font-bold text-foreground">
                  {isAr ? cat.titleAr : cat.titleEn}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">
                  {cat.fields.length} {isAr ? "أعمدة" : "columns"}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {uploadType === "grades" && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm space-y-2">
          <p>{controlText("uploadNote")}</p>
          <a
            className="text-primary underline"
            href={`/${locale}/admin/control`}
          >
            {controlText("openSheet")}
          </a>
        </div>
      )}
      {/* 3. Main Workspace: Selected Catalog Info & Dropzone */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Dropzone, Preview Grid & Commit */}
        <div className="lg:col-span-2 space-y-4">
          {/* Catalog Header Card */}
          <div className="p-4 rounded-2xl border border-border/70 bg-card shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 shrink-0">
                {CATALOG_ICONS[uploadType]}
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">
                  {isAr ? activeCatalog.titleAr : activeCatalog.titleEn}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {isAr ? activeCatalog.descAr : activeCatalog.descEn}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDownloadTemplate}
                disabled={isDownloadingTemplate}
                className="text-xs h-8.5 border-teal-500/30 text-teal-600 dark:text-teal-400 hover:bg-teal-500/10 cursor-pointer shrink-0 flex items-center gap-1.5"
                title={
                  isAr
                    ? "تحميل نموذج Excel المعتمد (.xlsx)"
                    : "Download Excel template (.xlsx)"
                }
              >
                {isDownloadingTemplate ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                )}
                <span>{isAr ? "نموذج Excel" : "Excel Template"}</span>
                <bdi dir="ltr" className="text-[10px] opacity-75 font-mono">
                  (.xlsx)
                </bdi>
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDownloadCsv}
                className="text-xs h-8.5 border-border/80 hover:bg-muted text-foreground cursor-pointer shrink-0 flex items-center gap-1.5"
                title={
                  isAr
                    ? "تحميل نموذج CSV يدعم الإكسيل (.csv)"
                    : "Download CSV template (.csv)"
                }
              >
                <FileText className="w-3.5 h-3.5 text-blue-500" />
                <span>{isAr ? "نموذج CSV" : "CSV Template"}</span>
                <bdi dir="ltr" className="text-[10px] opacity-75 font-mono">
                  (.csv)
                </bdi>
              </Button>
            </div>
          </div>

          {/* Multi-Course / Duplicate Student Code Toggle */}
          {(uploadType === "grades" ||
            uploadType === "quizzes" ||
            uploadType === "attendance") && (
            <div className="flex items-center justify-between rounded-squircle border border-teal-500/20 bg-teal-500/5 p-3.5 text-xs transition-all">
              <div className="space-y-0.5 pe-3">
                <span className="font-semibold text-foreground flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                  {isAr
                    ? "السماح بتكرار كود الطالب (لرفع أكثر من مقرر في الملف)"
                    : "Allow duplicate student code (multi-course file)"}
                </span>
                <p className="text-[11px] text-muted-foreground">
                  {isAr
                    ? "عند تفعيل هذا الخيار، يمكن للطالب أن يتكرر في عدة صفوف لمقررات مختلفة دون اعتباره خطأ تكرار."
                    : "Allows the same student code across multiple rows when each row belongs to a different course."}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={allowDuplicateStudentCode}
                onClick={() =>
                  void reInspectWithOption(!allowDuplicateStudentCode)
                }
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden focus:ring-2 focus:ring-teal-500 focus:ring-offset-2",
                  allowDuplicateStudentCode
                    ? "bg-teal-500"
                    : "bg-muted-foreground/30",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out",
                    allowDuplicateStudentCode
                      ? "translate-x-5 rtl:-translate-x-5"
                      : "translate-x-0",
                  )}
                />
              </button>
            </div>
          )}

          {/* Upload History Widget */}
          <UploadHistoryCard currentCatalog={uploadType} isAr={isAr} />

          {/* Drag & Drop File Zone */}
          <div
            onDragEnter={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setDragActive(false);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              const dropped = e.dataTransfer.files?.[0];
              if (dropped) void handleSelectFile(dropped);
            }}
            className={cn(
              "relative flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-2xl transition-all cursor-pointer text-center group bg-card",
              dragActive
                ? "border-teal-500 bg-teal-500/10"
                : "border-border/80 hover:border-teal-500/60 hover:bg-muted/30",
              file && "border-emerald-500/40 bg-emerald-500/5",
            )}
          >
            {file ? (
              <div className="flex items-center gap-3">
                <div className="p-3.5 rounded-squircle bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shrink-0">
                  <FileSpreadsheet className="w-7 h-7" />
                </div>
                <div className="text-start">
                  <p className="text-sm font-bold text-foreground truncate max-w-xs sm:max-w-md">
                    {file.name}
                  </p>
                  <p className="text-xs font-mono text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">
                    {(file.size / 1024).toFixed(1)} KB •{" "}
                    {isAr ? "تم تحميل الملف بنجاح" : "Loaded"}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <UploadCloud className="w-10 h-10 text-muted-foreground group-hover:text-teal-600 dark:group-hover:text-teal-400 group-hover:scale-110 transition-all mb-2.5" />
                <p className="text-sm font-bold text-foreground">
                  {isAr
                    ? "اضغط لاختيار ملف أو اسحب الملف وأفلته هنا"
                    : "Click to select or drag & drop spreadsheet here"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  .xlsx, .xls, .csv (الحد الأقصى 10 ميجابايت)
                </p>
              </div>
            )}

            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="sr-only"
              onChange={(e) => {
                const selected = e.target.files?.[0];
                if (selected) void handleSelectFile(selected);
              }}
            />

            {file && !loading && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setFile(null);
                  setPreview(null);
                  setResult(null);
                  setErrorMsg("");
                }}
                className="absolute top-3 end-3 p-1.5 rounded-full bg-muted text-muted-foreground hover:text-rose-500 transition-colors cursor-pointer"
                title={isAr ? "إلغاء الملف" : "Remove file"}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Inspection Loader */}
          {isInspecting && (
            <div className="p-4 rounded-xl border border-border/70 bg-card flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
              <span>
                {isAr
                  ? "جاري فحص وتدقيق بيانات الملف..."
                  : "Inspecting workbook data..."}
              </span>
            </div>
          )}

          {/* Live Progress Bar (0% - 100%) */}
          {uploader.isUploading && (
            <DataUploadProgress
              state={uploader.progressState}
              locale={locale}
              onAbort={uploader.abortUpload}
              onRetryNow={uploader.retryNow}
            />
          )}

          {/* Pre-flight Live Preview Grid */}
          {preview && !isInspecting && (
            <div className="p-4 rounded-2xl border border-border/70 bg-card shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-border/70 pb-3">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-teal-600" />
                  <h4 className="text-sm font-bold text-foreground">
                    {isAr
                      ? "نتائج الفحص والتدقيق الفوري"
                      : "Live Pre-Flight Inspection"}
                  </h4>
                </div>
                <Button
                  type="button"
                  onClick={handleUploadSubmit}
                  disabled={loading || !preview.canCommit}
                  className="text-xs h-8.5 bg-teal-600 hover:bg-teal-500 text-white font-semibold cursor-pointer shadow-xs"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>{isAr ? "جاري الاستيراد..." : "Importing..."}</span>
                    </>
                  ) : (
                    <>
                      <UploadCloud className="w-3.5 h-3.5" />
                      <span>
                        {isAr
                          ? `تأكيد واستيراد ${preview.validRows} سجل`
                          : `Commit ${preview.validRows} Record(s)`}
                      </span>
                    </>
                  )}
                </Button>
              </div>

              <ExcelPreviewGrid
                preview={preview}
                type={uploadType}
                isAr={isAr}
              />
            </div>
          )}

          {/* Error Message */}
          {errorMsg && (
            <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs text-rose-600 dark:text-rose-300 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold">{isAr ? "حدث خطأ" : "Error"}</p>
                <p>{errorMsg}</p>
              </div>
            </div>
          )}

          {/* Post-Upload Report */}
          {result && (
            <div className="p-4 rounded-2xl border border-border/70 bg-card shadow-xs space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span>
                  {isAr ? "تقرير الاستيراد النهائي" : "Final Import Report"}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                  <p className="font-medium">
                    {isAr ? "تم استيراده بنجاح" : "Imported"}
                  </p>
                  <p className="text-xl font-bold">{result.successCount} سجل</p>
                </div>
                <div
                  className={cn(
                    "p-3.5 rounded-xl border",
                    result.failedCount > 0
                      ? "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300"
                      : "border-border/70 bg-muted/40 text-muted-foreground",
                  )}
                >
                  <p className="font-medium">
                    {isAr ? "فشل استيراده" : "Failed"}
                  </p>
                  <p className="text-xl font-bold">{result.failedCount} سجل</p>
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-border/60">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                      {isAr ? "سجلات بها أخطاء:" : "Detailed Errors:"}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={copyErrorsToClipboard}
                        className="text-[11px] h-7 px-2"
                      >
                        <Copy className="w-3 h-3" />
                        <span>{isAr ? "نسخ" : "Copy"}</span>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={downloadErrorReport}
                        className="text-[11px] h-7 px-2"
                      >
                        <Download className="w-3 h-3" />
                        <span>{isAr ? "تصدير" : "Export"}</span>
                      </Button>
                    </div>
                  </div>

                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute start-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      value={errorSearch}
                      onChange={(e) => setErrorSearch(e.target.value)}
                      placeholder={
                        isAr ? "بحث في الأخطاء..." : "Filter errors..."
                      }
                      className="w-full text-xs ps-8 pe-3 py-1.5 rounded-lg border border-border/70 bg-background text-foreground focus:outline-hidden focus:ring-1 focus:ring-teal-500"
                    />
                  </div>

                  <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                    {filteredErrors.map((errText, idx) => (
                      <div
                        key={idx}
                        className="p-2 rounded-lg bg-rose-500/10 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2"
                      >
                        <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rose-500" />
                        <span className="font-mono text-[11px]">{errText}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right 1 Col: Catalog Fields Guide & Specifications */}
        <div className="space-y-4">
          <div className="p-4 rounded-2xl border border-border/70 bg-card shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-border/70 pb-2.5">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-teal-600" />
                <h4 className="text-xs font-bold text-foreground">
                  {isAr
                    ? "دليل أعمدة النموذج وقواعد البيانات"
                    : "Catalog Specification Guide"}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setShowFieldsGuide(!showFieldsGuide)}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
              >
                {showFieldsGuide ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>
            </div>

            {showFieldsGuide && (
              <div className="space-y-2.5 max-h-[70vh] overflow-y-auto pr-1">
                {activeCatalog.fields.map((field) => (
                  <div
                    key={field.key}
                    className="p-2.5 rounded-xl border border-border/60 bg-muted/20 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-foreground">
                        {isAr ? field.labelAr : field.labelEn}
                      </span>
                      {field.required ? (
                        <span className="px-1.5 py-0.2 rounded-md text-[10px] font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400">
                          {isAr ? "مطلوب *" : "Required *"}
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.2 rounded-md text-[10px] font-medium bg-muted text-muted-foreground">
                          {isAr ? "اختياري" : "Optional"}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
                      <span>{field.key}</span>
                      {field.type && (
                        <span className="text-[10px] text-teal-600 dark:text-teal-400">
                          ({field.type})
                        </span>
                      )}
                    </div>
                    {field.note && (
                      <p className="text-[11px] text-muted-foreground/80">
                        {field.note}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 4. Wipe / Reset Database Dialog */}
      <Dialog open={wipeDialogOpen} onOpenChange={setWipeDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl border border-border/70 bg-card">
          <DialogHeader className="text-start">
            <div className="flex items-center gap-2 text-rose-600">
              <AlertOctagon className="w-5 h-5" />
              <DialogTitle className="text-base font-bold">
                {isAr
                  ? "منطقة الخطر: مسح وتهيئة البيانات"
                  : "Danger Zone: Wipe / Reset Records"}
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground mt-1">
              {isAr
                ? "يتيح لك هذا الإجراء تفريغ السجلات القديمة قبل بدء استيراد الدفعات الجديدة لمنع التكرار وتضارب الأكواد."
                : "Safely clear legacy datasets before re-importing fresh batches to prevent collisions."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <label className="block font-semibold text-foreground">
              {isAr
                ? "اختر البيانات المطلوب مسحها:"
                : "Select Target Collection to Reset:"}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                {
                  id: "grades",
                  labelAr: "الدرجات فقط",
                  labelEn: "Grades Only",
                  count: wipeSummaryQuery.data?.gradesCount,
                },
                {
                  id: "quizzes",
                  labelAr: "الكويزات فقط",
                  labelEn: "Quizzes Only",
                  count: wipeSummaryQuery.data?.quizzesCount,
                },
                {
                  id: "attendance",
                  labelAr: "سجلات الحضور",
                  labelEn: "Attendance",
                  count: wipeSummaryQuery.data?.attendanceCount,
                },
                {
                  id: "students",
                  labelAr: "الطلاب وحساباتهم",
                  labelEn: "Students",
                  count: wipeSummaryQuery.data?.studentsCount,
                },
                {
                  id: "complaints",
                  labelAr: "شكاوى وتذاكر الطلاب",
                  labelEn: "Complaints & Tickets",
                  count: wipeSummaryQuery.data?.complaintsCount,
                },
                {
                  id: "all",
                  labelAr: "كافة البيانات الأكاديمية",
                  labelEn: "All Records",
                },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSelectedWipeTarget(opt.id as WipeTarget)}
                  className={cn(
                    "p-2.5 rounded-xl border text-start transition-all cursor-pointer font-medium flex flex-col justify-between gap-1",
                    selectedWipeTarget === opt.id
                      ? "border-rose-500 bg-rose-500/10 text-rose-700 dark:text-rose-300 font-bold"
                      : "border-border/70 bg-muted/30 text-muted-foreground hover:bg-muted",
                  )}
                >
                  <span className="text-xs">
                    {isAr ? opt.labelAr : opt.labelEn}
                  </span>
                  {typeof opt.count === "number" && (
                    <span className="text-[10px] opacity-75 font-normal">
                      {opt.count} {isAr ? "سجل" : "records"}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300 space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  {isAr ? "تحذير لا يمكن التراجع عنه" : "Irreversible Action"}
                </span>
              </p>
              <p>
                {isAr
                  ? 'سيتم حذف السجلات بشكل دائم من قاعدة البيانات. لتأكيد المسح، اكتب كلمة: "مسح"'
                  : 'Records will be permanently purged. Type "DELETE" to confirm.'}
              </p>
            </div>

            <Input
              type="text"
              value={wipeConfirmText}
              onChange={(e) => setWipeConfirmText(e.target.value)}
              placeholder={
                isAr ? 'اكتب "مسح" للتأكيد' : 'Type "DELETE" to confirm'
              }
              className="text-xs h-9 text-center font-bold"
            />
          </div>

          <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-start gap-2 pt-2 border-t border-border/70">
            <Button
              type="button"
              variant="outline"
              onClick={() => setWipeDialogOpen(false)}
              className="text-xs h-9 cursor-pointer"
            >
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              type="button"
              disabled={
                wipeMutation.isPending ||
                (isAr
                  ? wipeConfirmText.trim() !== "مسح"
                  : wipeConfirmText.trim().toUpperCase() !== "DELETE")
              }
              onClick={() => wipeMutation.mutate(selectedWipeTarget)}
              className="text-xs h-9 bg-rose-600 hover:bg-rose-500 text-white font-semibold cursor-pointer shadow-xs"
            >
              {wipeMutation.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{isAr ? "جاري المسح..." : "Wiping..."}</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isAr ? "تأكيد مسح البيانات" : "Confirm Wipe"}</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AdminUploadsPage() {
  return (
    <Suspense fallback={<PageSkeletonLoader />}>
      <UploadsPageContent />
    </Suspense>
  );
}
