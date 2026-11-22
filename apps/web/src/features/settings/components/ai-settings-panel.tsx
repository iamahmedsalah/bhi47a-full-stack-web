"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  BookOpen,
  Bot,
  CheckCircle2,
  Cpu,
  Database,
  FileText,
  KeyRound,
  Loader2,
  Power,
  RefreshCw,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { getApiErrorMessage } from "@/lib/api";
import {
  getAiSettings,
  getRagDocumentsOverview,
  reindexAllRagDocuments,
  reindexCourseRagDocument,
  settingsKeys,
  updateAiSettings,
  type RagDocumentFailureCode,
  type RagDocumentStatusItem,
} from "@/features/settings/api";

function formatFailureReason(
  code: RagDocumentFailureCode | undefined,
  ar: boolean,
): string | undefined {
  if (!code) return undefined;
  const map: Record<RagDocumentFailureCode, { ar: string; en: string }> = {
    CORRUPT_PDF: {
      ar: "ملف PDF تالف أو غير صالح",
      en: "Corrupt or invalid PDF",
    },
    ENCRYPTED_PDF: {
      ar: "ملف PDF محمي بكلمة مرور",
      en: "Password-protected PDF",
    },
    EMPTY_PDF: {
      ar: "الملف لا يحتوي على صفحات نصية",
      en: "No extractable text pages",
    },
    SCANNED_PDF_NO_TEXT: {
      ar: "ملف ممسوح كصور بدون طبقة نص (فعّل OCR)",
      en: "Scanned image-only PDF (enable OCR)",
    },
    EMBEDDING_FAILED: {
      ar: "تعذر توليد المتجهات من مزود الذكاء الاصطناعي",
      en: "Embedding generation failed",
    },
    STORAGE_READ_FAILED: {
      ar: "تعذر قراءة الملف من وحدة التخزين",
      en: "Storage file read failed",
    },
  };
  return ar ? map[code]?.ar : map[code]?.en;
}

export function AiSettingsPanel({ locale }: { locale: string }) {
  const ar = locale === "ar";
  const t = useTranslations("settings.ai");
  const queryClient = useQueryClient();
  const [reindexingCourseId, setReindexingCourseId] = useState<string | null>(
    null,
  );

  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(ar ? "ar-EG" : "en-US"),
    [ar],
  );
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(ar ? "ar-EG" : "en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Africa/Cairo",
      }),
    [ar],
  );

  const settings = useQuery({
    queryKey: settingsKeys.aiSettings,
    queryFn: getAiSettings,
  });

  const ragOverview = useQuery({
    queryKey: settingsKeys.ragDocuments,
    queryFn: getRagDocumentsOverview,
  });

  const toggle = useMutation({
    mutationFn: updateAiSettings,
    onSuccess: (updated) => {
      queryClient.setQueryData(settingsKeys.aiSettings, updated);
      toast.success(
        updated.studentAdvisorEnabled ? t("enabledToast") : t("disabledToast"),
      );
    },
    onError: (error) =>
      toast.error(getApiErrorMessage(error, t("updateFailed"))),
  });

  const reindexOneMutation = useMutation({
    mutationFn: async (courseId: string) => {
      setReindexingCourseId(courseId);
      return reindexCourseRagDocument(courseId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: settingsKeys.ragDocuments,
      });
      toast.success(
        ar
          ? "تمت جدولة إعادة فهرسة كتاب المقرر بنجاح"
          : "Course syllabus queued for RAG re-indexing",
      );
    },
    onError: (error) => {
      toast.error(
        getApiErrorMessage(
          error,
          ar ? "تعذر إعادة فهرسة الكتاب" : "Could not re-index course syllabus",
        ),
      );
    },
    onSettled: () => {
      setReindexingCourseId(null);
    },
  });

  const reindexAllMutation = useMutation({
    mutationFn: (forceAll: boolean) => reindexAllRagDocuments(forceAll),
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({
        queryKey: settingsKeys.ragDocuments,
      });
      toast.success(
        ar
          ? `تمت جدولة فهرسة ${res.queuedCount} كتاب مقرر بنجاح`
          : `Queued ${res.queuedCount} course syllabus file(s) for indexing`,
      );
    },
    onError: (error) => {
      toast.error(
        getApiErrorMessage(
          error,
          ar ? "تعذر بدء الفهرسة الشاملة" : "Could not start bulk indexing",
        ),
      );
    },
  });

  const ragColumns = useMemo<DataTableColumn<RagDocumentStatusItem>[]>(
    () => [
      {
        key: "course",
        header: ar ? "المقرر والملف" : "Course & File",
        cell: (row) => (
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                dir="ltr"
                className="inline-flex items-center rounded-squircle border border-primary/25 bg-primary/10 px-2 py-0.5 font-mono text-xs font-bold text-primary"
              >
                {row.courseCode}
              </span>
              <span className="font-bold text-foreground">
                {ar ? row.courseNameAr : row.courseNameEn}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />
              <span dir="auto" className="truncate max-w-xs">
                {row.fileName}
              </span>
            </div>
          </div>
        ),
      },
      {
        key: "metrics",
        header: ar ? "الصفحات والمقاطع" : "Pages & Chunks",
        className: "whitespace-nowrap",
        cell: (row) => (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="rounded-squircle border border-border/70 bg-secondary/50 px-2 py-0.5 font-semibold text-foreground">
              {ar
                ? `${numberFormatter.format(row.pageCount)} صفحة`
                : `${numberFormatter.format(row.pageCount)} pages`}
            </span>
            <span className="rounded-squircle border border-primary/25 bg-primary/10 px-2 py-0.5 font-semibold text-primary">
              {ar
                ? `${numberFormatter.format(row.chunkCount)} مقطع`
                : `${numberFormatter.format(row.chunkCount)} chunks`}
            </span>
            {row.ocrUsed && (
              <span className="rounded-squircle border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                OCR
              </span>
            )}
          </div>
        ),
      },
      {
        key: "status",
        header: ar ? "حالة الفهرسة" : "Index Status",
        cell: (row) => {
          const badgeConfig: Record<
            RagDocumentStatusItem["status"],
            {
              ar: string;
              en: string;
              variant: "success" | "warning" | "danger" | "neutral";
            }
          > = {
            ready: {
              ar: "مفهرس وجاهز",
              en: "Indexed & Ready",
              variant: "success",
            },
            processing: {
              ar: "قيد الفهرسة",
              en: "Processing",
              variant: "warning",
            },
            pending: {
              ar: "في الطابور",
              en: "Queued",
              variant: "warning",
            },
            failed: {
              ar: "فشلت الفهرسة",
              en: "Failed",
              variant: "danger",
            },
            unindexed: {
              ar: "غير مفهرس بعد",
              en: "Not Indexed",
              variant: "neutral",
            },
          };

          const cfg = badgeConfig[row.status];
          const reason = formatFailureReason(row.failureCode, ar);

          return (
            <div className="space-y-1">
              <StatusBadge
                label={ar ? cfg.ar : cfg.en}
                variant={cfg.variant}
              />
              {reason && (
                <p className="text-[11px] font-medium text-rose-400">
                  {reason}
                </p>
              )}
            </div>
          );
        },
      },
      {
        key: "ingestedAt",
        header: ar ? "آخر فهرسة" : "Last Indexed",
        className: "whitespace-nowrap text-xs text-muted-foreground",
        cell: (row) =>
          row.ingestedAt
            ? dateFormatter.format(new Date(row.ingestedAt))
            : "—",
      },
      {
        key: "action",
        header: ar ? "إجراء" : "Action",
        className: "whitespace-nowrap text-end",
        cell: (row) => {
          const isBusy =
            reindexOneMutation.isPending &&
            reindexingCourseId === row.courseId;
          return (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isBusy || reindexAllMutation.isPending}
              onClick={() => reindexOneMutation.mutate(row.courseId)}
              className="rounded-squircle gap-1.5 text-xs"
            >
              <RefreshCw
                className={isBusy ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"}
              />
              {ar ? "إعادة فهرسة" : "Re-index"}
            </Button>
          );
        },
      },
    ],
    [
      ar,
      dateFormatter,
      numberFormatter,
      reindexAllMutation.isPending,
      reindexOneMutation,
      reindexingCourseId,
    ],
  );

  if (settings.isLoading) {
    return (
      <div className="flex min-h-56 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!settings.data || settings.isError) {
    return (
      <div className="flex min-h-56 flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
        <AlertTriangle className="h-6 w-6 text-amber-400" />
        <p>{t("loadFailed")}</p>
        <Button variant="outline" onClick={() => void settings.refetch()}>
          {t("retry")}
        </Button>
      </div>
    );
  }

  const data = settings.data;
  const advisorAvailable =
    data.studentAdvisorEnabled && data.studentAdvisorConfigured !== false;
  const usage = data.usage;
  const hasBudget = usage.monthlyTokenBudget !== null;
  const ragData = ragOverview.data;
  const ragSummary = ragData?.summary;
  const ragItems = Array.isArray(ragData?.items) ? ragData.items : [];
  const hasValidRagOverview = Boolean(
    ragSummary && typeof ragSummary.totalSyllabi === "number",
  );

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-secondary/15 p-5 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-squircle bg-primary/10 text-primary">
            <Bot className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-bold">{t("advisorTitle")}</h2>
              <span
                className={
                  advisorAvailable
                    ? "rounded-squircle bg-emerald-500/15 px-2 py-1 text-xs font-semibold text-emerald-400"
                    : "rounded-squircle bg-red-500/15 px-2 py-1 text-xs font-semibold text-red-400"
                }
              >
                {advisorAvailable ? t("enabled") : t("disabled")}
              </span>
            </div>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {t("advisorDescription")}
            </p>
            {data.studentAdvisorConfigured === false && (
              <p className="mt-2 text-sm text-amber-500" role="status">
                {ar
                  ? "تفعيل المساعد يحتاج إعداد مفتاح Gemini واسم النموذج والسماح به على السيرفر."
                  : "Server opt-in, a Gemini API key, and a chat model are required before the assistant is available."}
              </p>
            )}
          </div>
        </div>
        <Button
          variant={data.studentAdvisorEnabled ? "destructive" : "default"}
          disabled={
            toggle.isPending ||
            (data.studentAdvisorConfigured === false &&
              !data.studentAdvisorEnabled)
          }
          onClick={() => toggle.mutate(!data.studentAdvisorEnabled)}
          className="h-auto min-h-11 shrink-0 whitespace-normal rounded-squircle px-4 py-2.5 md:max-w-56"
        >
          {toggle.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Power className="h-4 w-4" />
          )}
          {data.studentAdvisorEnabled ? t("turnOff") : t("turnOn")}
        </Button>
      </section>

      <section className="rounded-2xl border border-border bg-secondary/15 p-5">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-bold">
              <Cpu className="h-5 w-5 text-primary" />
              {t("usageTitle")}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("providerModel", {
                provider: data.provider,
                model: data.model,
              })}
            </p>
          </div>
          <span
            className={
              data.apiKeyConfigured
                ? "flex items-center gap-1 rounded-squircle bg-emerald-500/15 px-3 py-1 text-xs text-emerald-400"
                : "flex items-center gap-1 rounded-squircle bg-amber-500/15 px-3 py-1 text-xs text-amber-400"
            }
          >
            {data.apiKeyConfigured ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <KeyRound className="h-3.5 w-3.5" />
            )}
            {data.apiKeyConfigured ? t("apiConfigured") : t("apiMissing")}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <UsageCard
            label={t("remainingTokens")}
            value={
              usage.remainingTokens === null
                ? t("notConfigured")
                : numberFormatter.format(usage.remainingTokens)
            }
          />
          <UsageCard
            label={t("usedThisMonth")}
            value={numberFormatter.format(usage.currentMonthTokens)}
          />
          <UsageCard
            label={t("allTimeTokens")}
            value={numberFormatter.format(usage.allTimeTokens)}
          />
          <UsageCard
            label={t("allTimeRequests")}
            value={numberFormatter.format(usage.allTimeRequests)}
          />
        </div>

        <div className="mt-5 rounded-xl border border-border/70 bg-background/40 p-4">
          <div className="mb-2 flex items-center justify-between gap-3 text-xs">
            <span className="font-semibold">{t("monthlyUsage")}</span>
            <span className="text-muted-foreground">
              {hasBudget
                ? t("usedOfBudget", {
                    used: numberFormatter.format(usage.currentMonthTokens),
                    budget: numberFormatter.format(
                      usage.monthlyTokenBudget ?? 0,
                    ),
                  })
                : t("budgetMissing")}
            </span>
          </div>
          <Progress
            value={usage.usagePercent ?? 0}
            dir="ltr"
            aria-label={t("monthlyUsage")}
            className="h-3"
          />
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            {hasBudget ? t("usageNote") : t("configureBudget")}
          </p>
        </div>
      </section>

      {/* RAG Syllabus Knowledge Index Monitoring & Manual Re-indexing Section */}
      <section className="rounded-2xl border border-border bg-secondary/15 p-5 space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-squircle bg-primary/10 text-primary">
              <Database className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="font-bold text-foreground">
                {ar
                  ? "فهرس كتب وتوصيف المقررات (RAG Knowledge Index)"
                  : "Course Syllabi RAG Knowledge Index"}
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {ar
                  ? "متابعة حالة استخراج النص وتوليد المتجهات لكتب المقررات المرفوعة مع إمكانية إعادة الفهرسة اليدوية."
                  : "Monitor PDF extraction and vector indexing status for uploaded course syllabi and trigger manual re-indexing."}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={ragOverview.isFetching}
              onClick={() => void ragOverview.refetch()}
              className="h-auto min-h-9 max-w-full whitespace-normal rounded-squircle gap-1.5 px-3 py-1.5 text-xs"
            >
              <RefreshCw
                className={
                  ragOverview.isFetching
                    ? "h-3.5 w-3.5 shrink-0 animate-spin"
                    : "h-3.5 w-3.5 shrink-0"
                }
              />
              {ar ? "تحديث الحالة" : "Refresh"}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={
                reindexAllMutation.isPending ||
                !hasValidRagOverview ||
                (ragSummary?.totalSyllabi ?? 0) === 0
              }
              onClick={() => reindexAllMutation.mutate(false)}
              className="h-auto min-h-9 max-w-full whitespace-normal rounded-squircle gap-1.5 px-3 py-1.5 text-xs"
            >
              {reindexAllMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
              ) : (
                <BookOpen className="h-3.5 w-3.5 shrink-0" />
              )}
              {ar
                ? "فهرسة الكتب غير المفهرسة"
                : "Index Pending / Failed Syllabi"}
            </Button>
          </div>
        </div>

        {ragOverview.isLoading ? (
          <div className="flex min-h-36 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : ragOverview.isError || !hasValidRagOverview || !ragSummary ? (
          <div className="rounded-xl border border-border/70 bg-background/40 p-6 text-center text-xs text-muted-foreground space-y-2">
            <p>
              {ar
                ? "تعذر تحميل حالة فهرس كتب المقررات."
                : "Could not load RAG syllabus index status."}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void ragOverview.refetch()}
              className="h-auto min-h-9 max-w-full whitespace-normal rounded-squircle px-3 py-1.5"
            >
              {ar ? "إعادة المحاولة" : "Retry"}
            </Button>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <UsageCard
                label={ar ? "إجمالي الكتب المرفوعة" : "Total Uploaded Syllabi"}
                value={numberFormatter.format(ragSummary.totalSyllabi)}
              />
              <UsageCard
                label={ar ? "مفهرس وجاهز للبحث" : "Indexed & Ready"}
                value={numberFormatter.format(ragSummary.readyCount)}
              />
              <UsageCard
                label={ar ? "إجمالي المقاطع النشطة" : "Total Active Chunks"}
                value={numberFormatter.format(ragSummary.totalActiveChunks)}
              />
              <UsageCard
                label={
                  ar
                    ? "بحاجة لفهرسة / فشل"
                    : "Pending / Failed / Unindexed"
                }
                value={numberFormatter.format(
                  ragSummary.failedCount +
                    ragSummary.unindexedCount +
                    ragSummary.processingCount,
                )}
              />
            </div>

            {ragItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/80 bg-background/30 p-8 text-center text-xs text-muted-foreground">
                {ar
                  ? "لا توجد كتب مقررات (Syllabus PDF) مرفوعة حتى الآن. عند رفع كتاب لأي مقرر سيتم فهرسته تلقائياً هنا."
                  : "No course syllabus PDFs uploaded yet. Uploaded course books are automatically indexed and listed here."}
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border/70 bg-background/40">
                <DataTable
                  rows={ragItems}
                  columns={ragColumns}
                  getRowKey={(row) => row.courseId}
                />
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function UsageCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-xl border border-border/70 bg-background/40 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <strong className="mt-2 block text-xl font-bold text-primary">
        {value}
      </strong>
    </article>
  );
}
