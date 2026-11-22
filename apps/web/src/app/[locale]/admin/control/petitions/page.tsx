"use client";

import React, { Suspense, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  FileCheck2,
  MoreVertical,
  XCircle,
} from "lucide-react";
import {
  PERMISSIONS,
  type ControlComponentKey,
  type Semester,
} from "@student-portal/shared";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";
import { useTableState } from "@/hooks/use-table-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CustomDropdown,
  type CustomDropdownOption,
} from "@/components/ui/custom-dropdown";
import {
  DataTableShell,
  type ColumnDef,
} from "@/components/ui/data-table-shell";
import { FilterBar } from "@/components/ui/filter-bar";
import { Input } from "@/components/ui/input";
import { PageSkeletonLoader } from "@/components/ui/page-suspense-fallback";
import { PageTitleBanner } from "@/components/ui/page-title-banner";
import { PermissionGuard } from "@/components/ui/permission-guard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TableCell } from "@/components/ui/table";
import {
  controlKeys,
  getControlCapabilities,
  getControlPetitionsSummary,
  listControlPetitions,
  markControlPetitionSeen,
} from "@/features/control/api";
import { ControlPetitionReviewDialog } from "@/features/control/components/control-petition-review-dialog";
import type {
  ControlPetition,
  ControlPetitionStatus,
} from "@/features/control/types";

const COMPONENT_LABELS: Record<
  ControlComponentKey,
  { ar: string; en: string }
> = {
  midterm: { ar: "الميدتيرم", en: "Midterm" },
  coursework: { ar: "أعمال السنة", en: "Coursework" },
  final: { ar: "النهائي (الفاينل)", en: "Final" },
};

const STATUS_BADGE_MAP: Record<
  ControlPetitionStatus,
  { ar: string; en: string; className: string }
> = {
  PENDING: {
    ar: "بانتظار قرار الاعتماد",
    en: "Pending Decision",
    className: "border-amber-500/35 bg-amber-500/12 text-amber-400",
  },
  APPROVED: {
    ar: "مقبول بالكامل (تم التعديل)",
    en: "Approved & Applied",
    className: "border-emerald-500/35 bg-emerald-500/12 text-emerald-400",
  },
  PARTIALLY_APPROVED: {
    ar: "مقبول جزئيًا",
    en: "Partially Approved",
    className: "border-sky-500/35 bg-sky-500/12 text-sky-400",
  },
  REJECTED: {
    ar: "مرفوض",
    en: "Rejected",
    className: "border-rose-500/35 bg-rose-500/12 text-rose-400",
  },
};

function ControlPetitionsContent() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const locale = (params?.locale as string) || "ar";
  const isAr = locale === "ar";

  const {
    page,
    setPage,
    limit,
    search,
    setSearch,
    filters,
    setFilter,
  } = useTableState({
    shallow: true,
    defaultFilters: {
      academicYear: "2026-2027",
      semester: "first",
      component: "all",
      status: "all",
      tab: "all",
    },
  });

  const academicYear = filters.academicYear || "2026-2027";
  const semester = (filters.semester || "first") as Semester;
  const componentFilter = filters.component || "all";
  const statusFilter = filters.status || "all";
  const activeTab = filters.tab || "all";

  const { data: caps } = useQuery({
    queryKey: controlKeys.me(),
    queryFn: getControlCapabilities,
  });

  const { data: summary } = useQuery({
    queryKey: controlKeys.petitionsSummary({ academicYear, semester }),
    queryFn: () => getControlPetitionsSummary({ academicYear, semester }),
  });

  const queryParams = useMemo(
    () => ({
      academicYear,
      semester,
      component:
        componentFilter !== "all"
          ? (componentFilter as ControlComponentKey)
          : undefined,
      status:
        activeTab === "pending"
          ? ("PENDING" as ControlPetitionStatus)
          : statusFilter !== "all"
            ? (statusFilter as ControlPetitionStatus)
            : undefined,
      mine: activeTab === "mine" ? true : undefined,
      search: search.trim() || undefined,
      page,
      limit,
    }),
    [
      academicYear,
      semester,
      componentFilter,
      statusFilter,
      activeTab,
      search,
      page,
      limit,
    ],
  );

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: controlKeys.petitions(queryParams),
    queryFn: () => listControlPetitions(queryParams),
  });

  const [selectedPetition, setSelectedPetition] =
    useState<ControlPetition | null>(null);

  const markSeenMutation = useMutation({
    mutationFn: (id: string) => markControlPetitionSeen(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: controlKeys.all });
    },
  });

  const columns = useMemo<ColumnDef<ControlPetition>[]>(
    () => [
      {
        key: "course",
        header: isAr ? "المقرر والمستوى" : "Course & Level",
        className: "min-w-[210px]",
        render: (item) => {
          const title = isAr
            ? item.courseNameAr || item.courseName
            : item.courseNameEn || item.courseName;
          const levelText = item.courseLevel
            ? isAr
              ? `المستوى ${item.courseLevel}`
              : `Level ${item.courseLevel}`
            : null;
          return (
            <TableCell className="min-w-[210px] py-3">
              <div className="flex flex-col items-start gap-1">
                <div className="flex items-center gap-1.5">
                  <Badge
                    variant="outline"
                    className="rounded-squircle font-mono text-xs"
                  >
                    <bdi dir="ltr">{item.courseCode}</bdi>
                  </Badge>
                  <span className="text-xs font-bold text-foreground">
                    {title}
                  </span>
                </div>
                {levelText && (
                  <Badge
                    variant="outline"
                    className="rounded-squircle border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary"
                  >
                    {levelText}
                  </Badge>
                )}
              </div>
            </TableCell>
          );
        },
      },
      {
        key: "component",
        header: isAr ? "المكوّن" : "Component",
        className: "w-32 text-center",
        render: (item) => (
          <TableCell className="w-32 text-center">
            <Badge
              variant="outline"
              className="rounded-squircle border-primary/30 bg-primary/10 text-primary text-xs font-semibold"
            >
              {isAr
                ? COMPONENT_LABELS[item.component].ar
                : COMPONENT_LABELS[item.component].en}
            </Badge>
          </TableCell>
        ),
      },
      {
        key: "students",
        header: isAr ? "الطلاب والتعديلات" : "Students & Marks",
        className: "min-w-[240px]",
        render: (item) => (
          <TableCell className="min-w-[240px]">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                <span>
                  {isAr
                    ? `${item.counts.total} طلاب`
                    : `${item.counts.total} student(s)`}
                </span>
                {item.status !== "PENDING" && (
                  <span className="text-[11px] font-normal text-muted-foreground">
                    (
                    {isAr
                      ? `موافقة: ${item.counts.approved} · رفض: ${item.counts.rejected}`
                      : `Approved: ${item.counts.approved} · Rejected: ${item.counts.rejected}`}
                    )
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                {item.items.slice(0, 3).map((st) => (
                  <span
                    key={st.studentId}
                    className="inline-flex items-center gap-1 rounded-squircle border border-border/60 bg-background/50 px-1.5 py-0.5 text-[10px] font-mono"
                  >
                    <bdi dir="ltr">{st.studentCode}</bdi>:{" "}
                    <span>{st.currentScore ?? "—"}</span>
                    <span>→</span>
                    <strong className="text-primary">
                      {st.proposedScore ?? st.proposedStatus}
                    </strong>
                  </span>
                ))}
                {item.items.length > 3 && (
                  <span className="text-[10px] text-muted-foreground">
                    +{item.items.length - 3}
                  </span>
                )}
              </div>
            </div>
          </TableCell>
        ),
      },
      {
        key: "requester",
        header: isAr ? "مقدّم الطلب والسبب" : "Requester & Reason",
        className: "min-w-[200px]",
        render: (item) => (
          <TableCell className="min-w-[200px]">
            <div className="space-y-0.5">
              <div className="text-xs font-semibold text-foreground">
                {isAr
                  ? item.requestedBy.nameAr || item.requestedBy.name || "—"
                  : item.requestedBy.name || item.requestedBy.nameAr || "—"}
              </div>
              <div className="text-[11px] text-muted-foreground line-clamp-1">
                {item.reason}
              </div>
            </div>
          </TableCell>
        ),
      },
      {
        key: "status",
        header: isAr ? "حالة الطلب" : "Status",
        className: "w-48 text-center",
        render: (item) => {
          const st = STATUS_BADGE_MAP[item.status];
          const isUnreadForRequester =
            item.status !== "PENDING" &&
            item.requesterSeenAt === null &&
            user &&
            item.requestedBy.id === String(user._id);
          return (
            <TableCell className="w-48 text-center">
              <div className="inline-flex flex-col items-center gap-1">
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-squircle border px-2.5 py-1 text-xs font-bold whitespace-nowrap",
                    st.className,
                  )}
                >
                  {item.status === "PENDING" ? (
                    <Clock className="size-3.5" />
                  ) : item.status === "REJECTED" ? (
                    <XCircle className="size-3.5" />
                  ) : (
                    <CheckCircle2 className="size-3.5" />
                  )}
                  <span>{isAr ? st.ar : st.en}</span>
                </span>
                {isUnreadForRequester && (
                  <Badge
                    variant="outline"
                    className="rounded-squircle border-primary bg-primary/15 text-primary text-[10px] font-bold animate-pulse"
                  >
                    <Bell className="size-2.5 me-1" />
                    {isAr ? "قرار جديد غير مقروء" : "New unread decision"}
                  </Badge>
                )}
              </div>
            </TableCell>
          );
        },
      },
      {
        key: "actions",
        header: isAr ? "إجراءات" : "Actions",
        className: "w-14 text-center",
        render: (item) => {
          const options: CustomDropdownOption[] = [
            {
              value: "review",
              label: (
                <div className="flex items-center gap-2 text-xs py-0.5">
                  <Eye className="size-3.5 text-primary" />
                  <span>
                    {item.status === "PENDING" && caps?.canApprovePetitions
                      ? isAr
                        ? "مراجعة والبت في الطلاب (موافقة / رفض)"
                        : "Review & Decide Students"
                      : isAr
                        ? "عرض تفاصيل الطلب والقرارات"
                        : "View Petition & Decisions"}
                  </span>
                </div>
              ),
            },
            {
              value: "open_sheet",
              label: (
                <div className="flex items-center gap-2 text-xs py-0.5">
                  <ExternalLink className="size-3.5 text-primary" />
                  <span>
                    {isAr ? "فتح كشف رصد المقرر" : "Open Course Control Sheet"}
                  </span>
                </div>
              ),
            },
          ];

          return (
            <TableCell className="w-14 text-center">
              <div className="inline-flex justify-center">
                <CustomDropdown
                  value=""
                  ariaLabel={isAr ? "إجراءات الالتماس" : "Petition actions"}
                  placeholder={
                    <MoreVertical className="size-4 text-muted-foreground hover:text-primary" />
                  }
                  options={options}
                  onValueChange={(val) => {
                    if (val === "review") {
                      setSelectedPetition(item);
                      if (
                        item.status !== "PENDING" &&
                        item.requesterSeenAt === null &&
                        user &&
                        item.requestedBy.id === String(user._id)
                      ) {
                        markSeenMutation.mutate(item.id);
                      }
                    } else if (val === "open_sheet") {
                      router.push(`/${locale}/admin/control/${item.sheetId}`);
                    }
                  }}
                  className="h-8 w-8 min-w-8 p-0 justify-center rounded-squircle border border-border/60 hover:bg-primary/10 [&>svg]:hidden"
                  menuClassName="w-64"
                />
              </div>
            </TableCell>
          );
        },
      },
    ],
    [isAr, caps?.canApprovePetitions, user, markSeenMutation, router, locale],
  );

  return (
    <PermissionGuard
      permissions={[
        PERMISSIONS.CONTROL_ACCESS,
        PERMISSIONS.CONTROL_PETITIONS_CREATE,
        PERMISSIONS.CONTROL_PETITIONS_APPROVE,
        PERMISSIONS.CONTROL_SHEETS_VIEW,
      ]}
    >
      <div className="space-y-6" dir={isAr ? "rtl" : "ltr"}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PageTitleBanner
            title={
              isAr
                ? "طلبات التماس تعديل درجات الكنترول"
                : "Control Grade Adjustment Petitions"
            }
            subtitle={
              isAr
                ? "تقديم ومراجعة طلبات تعديل درجات طلاب محددين (الميدتيرم / أعمال السنة / النهائي) مع اعتماد فردي لكل طالب وتحديث تلقائي للدرجة وسجل التدقيق."
                : "Submit and review student grade adjustment petitions with per-student approval and automatic grade updates."
            }
            eyebrow={isAr ? "حوكمة والتماسات الكنترول" : "Control Governance"}
            icon={<FileCheck2 className="size-4" />}
          />
          <Button
            type="button"
            variant="outline"
            className="rounded-squircle gap-1.5"
            onClick={() => router.push(`/${locale}/admin/control`)}
          >
            {isAr ? (
              <ArrowRight className="size-4" />
            ) : (
              <ArrowLeft className="size-4" />
            )}
            <span>
              {isAr ? "العودة إلى كشوف الكنترول" : "Back to Control Sheets"}
            </span>
          </Button>
        </div>

        {/* Quick View Tabs with Live Notification Counts */}
        <div className="flex flex-wrap items-center gap-2">
          {[
            {
              key: "all",
              labelAr: "كل الطلبات",
              labelEn: "All Petitions",
              badge: null,
            },
            {
              key: "pending",
              labelAr: "بانتظار الاعتماد",
              labelEn: "Pending Approval",
              badge: summary?.pendingForApprovalCount ?? 0,
            },
            {
              key: "mine",
              labelAr: "طلباتي المقدّمة",
              labelEn: "My Submitted Petitions",
              badge: summary?.unreadDecisionsCount ?? 0,
            },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilter("tab", tab.key)}
              className={cn(
                "inline-flex items-center gap-2 rounded-squircle border px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer",
                activeTab === tab.key
                  ? "border-primary bg-primary/15 text-primary shadow-xs"
                  : "border-border/70 bg-card/60 text-muted-foreground hover:text-foreground",
              )}
            >
              <span>{isAr ? tab.labelAr : tab.labelEn}</span>
              {tab.badge !== null && tab.badge > 0 && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        <FilterBar
          compact
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder={
            isAr
              ? "ابحث بكود المقرر أو كود الطالب أو اسمه أو السبب..."
              : "Search by course, student code/name, or reason..."
          }
          wrapFilters
        >
          <div className="w-36">
            <Input
              dir="ltr"
              value={academicYear}
              onChange={(e) => setFilter("academicYear", e.target.value)}
              placeholder="2026-2027"
              className="h-10 rounded-squircle text-left font-mono text-xs"
            />
          </div>
          <div className="w-44">
            <Select
              value={semester}
              onValueChange={(v) => setFilter("semester", v)}
            >
              <SelectTrigger className="h-10 rounded-squircle text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent dir={isAr ? "rtl" : "ltr"}>
                <SelectItem value="first">
                  {isAr ? "الفصل الدراسي الأول" : "First Semester"}
                </SelectItem>
                <SelectItem value="second">
                  {isAr ? "الفصل الدراسي الثاني" : "Second Semester"}
                </SelectItem>
                <SelectItem value="summer">
                  {isAr ? "الفصل الصيفي" : "Summer Semester"}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-44">
            <Select
              value={componentFilter}
              onValueChange={(v) => setFilter("component", v)}
            >
              <SelectTrigger className="h-10 rounded-squircle text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent dir={isAr ? "rtl" : "ltr"}>
                <SelectItem value="all">
                  {isAr ? "كل المكوّنات" : "All Components"}
                </SelectItem>
                <SelectItem value="midterm">
                  {isAr ? "الميدتيرم" : "Midterm"}
                </SelectItem>
                <SelectItem value="coursework">
                  {isAr ? "أعمال السنة" : "Coursework"}
                </SelectItem>
                <SelectItem value="final">
                  {isAr ? "النهائي (الفاينل)" : "Final"}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          {activeTab !== "pending" && (
            <div className="w-44">
              <Select
                value={statusFilter}
                onValueChange={(v) => setFilter("status", v)}
              >
                <SelectTrigger className="h-10 rounded-squircle text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent dir={isAr ? "rtl" : "ltr"}>
                  <SelectItem value="all">
                    {isAr ? "كل الحالات" : "All Statuses"}
                  </SelectItem>
                  <SelectItem value="PENDING">
                    {isAr ? "بانتظار الاعتماد" : "Pending"}
                  </SelectItem>
                  <SelectItem value="APPROVED">
                    {isAr ? "مقبول بالكامل" : "Approved"}
                  </SelectItem>
                  <SelectItem value="PARTIALLY_APPROVED">
                    {isAr ? "مقبول جزئيًا" : "Partially Approved"}
                  </SelectItem>
                  <SelectItem value="REJECTED">
                    {isAr ? "مرفوض" : "Rejected"}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </FilterBar>

        <DataTableShell
          columns={columns}
          data={data?.items ?? []}
          keyExtractor={(item) => item.id}
          isLoading={isLoading}
          isError={isError}
          error={error}
          onRetry={() => void refetch()}
          emptyMessage={
            isAr
              ? "لا توجد طلبات التماس تعديل درجات مطابقة للفلاتر الحالية."
              : "No grade adjustment petitions match the current filters."
          }
        />

        {(data?.totalPages ?? 1) > 1 && (
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">
              {isAr
                ? `صفحة ${page} من ${data?.totalPages ?? 1} (${data?.total ?? 0} طلب)`
                : `Page ${page} of ${data?.totalPages ?? 1} (${data?.total ?? 0} total)`}
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-squircle h-8"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                {isAr ? "السابق" : "Previous"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-squircle h-8"
                disabled={page >= (data?.totalPages ?? 1)}
                onClick={() => setPage(page + 1)}
              >
                {isAr ? "التالي" : "Next"}
              </Button>
            </div>
          </div>
        )}

        {selectedPetition && (
          <ControlPetitionReviewDialog
            key={selectedPetition.id}
            petition={selectedPetition}
            open={Boolean(selectedPetition)}
            onOpenChange={(open) => {
              if (!open) setSelectedPetition(null);
            }}
            locale={locale}
            canApprove={Boolean(caps?.canApprovePetitions)}
            currentUserId={user?._id}
            isAdmin={user?.role === "admin"}
          />
        )}
      </div>
    </PermissionGuard>
  );
}

export default function ControlPetitionsPage() {
  return (
    <Suspense fallback={<PageSkeletonLoader />}>
      <ControlPetitionsContent />
    </Suspense>
  );
}
