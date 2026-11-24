"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isAxiosError } from "axios";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ATTENDANCE_RECORD_DELETE_LIMIT, getStaffRoleLabel } from "@student-portal/shared";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Activity,
  CheckCircle2,
  Clock,
  Layers,
  Users,
  Search,
  MoreVertical,
  QrCode,
  UserRound,
  Trash2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TableCell } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { CustomDropdown } from "@/components/ui/custom-dropdown";
import {
  DataTableShell,
  type ColumnDef,
} from "@/components/ui/data-table-shell";
import { LoadingState, ErrorState } from "@/components/ui/feedback";
import { useTableState } from "@/hooks/use-table-state";
import {
  attendanceApi,
  type AttendanceSessionDto,
  type AttendanceRecordDto,
  type QrPayload,
} from "../api/attendance-api";
import { getAttendanceErrorMessage } from "../schemas/attendance-schemas";
import { AttendanceExportButton } from "./attendance-export-button";
import { AttendancePagination } from "./attendance-pagination";
import { LiveAttendeeStream } from "./live-attendee-stream";
import { AttendanceBonusDialog } from "./attendance-bonus-dialog";
import { toast } from "sonner";

function SessionSearch({
  value,
  onSearch,
  isArabic,
}: {
  value: string;
  onSearch: (value: string) => void;
  isArabic: boolean;
}) {
  const [input, setInput] = useState({ urlValue: value, draft: value });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callback = useRef(onSearch);
  useEffect(() => {
    callback.current = onSearch;
  }, [onSearch]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
  }, [value]);
  if (input.urlValue !== value) setInput({ urlValue: value, draft: value });
  return (
    <div className="relative min-w-0 flex-1">
      <Search
        className="pointer-events-none absolute start-3 top-3 h-4 w-4 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        value={input.draft}
        maxLength={100}
        aria-label={
          isArabic
            ? "بحث بالمقرر أو القائم بالتدريس"
            : "Search course or instructor"
        }
        onChange={(event) => {
          const draft = event.target.value;
          setInput({ urlValue: value, draft });
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => callback.current(draft), 300);
        }}
        placeholder={
          isArabic
            ? "بحث بالمقرر، الكود أو القائم بالتدريس…"
            : "Search course, code or instructor…"
        }
        className="h-10 ps-9"
      />
    </div>
  );
}

export function AdminAttendanceOverview({
  isArabic = true,
  canDeleteRecords = false,
  onOpenSessionPresenter,
}: {
  isArabic?: boolean;
  canDeleteRecords?: boolean;
  onOpenSessionPresenter?: (session: AttendanceSessionDto, qr: QrPayload) => void;
}) {
  const t = useTranslations("attendanceDelete");
  const queryClient = useQueryClient();
  const table = useTableState({
    defaultFilters: { status: "all", level: "all", courseCode: "all" },
    defaultLimit: 20,
  });
  const [selectedSession, setSelectedSession] =
    useState<AttendanceSessionDto | null>(null);
  const [sessionToDelete, setSessionToDelete] =
    useState<AttendanceSessionDto | null>(null);
  const [recordsPage, setRecordsPage] = useState(1);
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([]);
  const [editRecord, setEditRecord] = useState<AttendanceRecordDto | null>(
    null,
  );
  const [bonusRecord, setBonusRecord] = useState<AttendanceRecordDto | null>(
    null,
  );
  const [editStatus, setEditStatus] = useState("present");
  const [editReason, setEditReason] = useState("");
  const [saving, setSaving] = useState(false);
  const locale = isArabic ? "ar-EG" : "en-GB";
  const params = {
    page: Math.max(1, Math.trunc(table.page)),
    limit: [10, 20, 50, 100].includes(table.limit) ? table.limit : 20,
    search: table.search.slice(0, 100),
    status: ["OPEN", "CLOSED", "EXPIRED", "ENDED"].includes(
      table.filters.status,
    )
      ? table.filters.status
      : "all",
    level: table.filters.level.slice(0, 20),
    courseCode: table.filters.courseCode.slice(0, 50),
  };
  const overview = useQuery({
    queryKey: ["attendance-sessions", params],
    queryFn: () => attendanceApi.getSessions(params),
    placeholderData: keepPreviousData,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });
  const currentSession =
    overview.data?.sessions.find((session) => session._id === selectedSession?._id) ??
    selectedSession;
  const records = useQuery({
    queryKey: ["attendance-session-records", selectedSession?._id, recordsPage],
    enabled: Boolean(selectedSession),
    queryFn: () =>
      attendanceApi.getSessionRecords(selectedSession!._id, {
        page: recordsPage,
        limit: 50,
      }),
    refetchInterval: currentSession?.status === "OPEN" ? 20000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });
  const deleteRecords = useMutation({
    mutationFn: ({
      sessionId,
      recordIds,
    }: {
      sessionId: string;
      recordIds: string[];
    }) => attendanceApi.deleteSessionRecords(sessionId, recordIds),
    onSuccess: async ({ deletedCount }, { sessionId }) => {
      await queryClient.invalidateQueries({
        queryKey: ["attendance-session-records", sessionId],
        refetchType: "none",
      });
      const [updated] = await Promise.all([
        records.refetch(),
        queryClient.invalidateQueries({ queryKey: ["attendance-sessions"] }),
      ]);
      if (updated.isSuccess) {
        const lastPage = Math.max(1, updated.data.totalPages);
        setRecordsPage((page) => Math.min(page, lastPage));
      }
      setSelectedRecordIds([]);
      if (deletedCount > 0) toast.success(t("deleted", { count: deletedCount }));
      else toast.info(t("alreadyRemoved"));
    },
    onError: () => toast.error(t("failed")),
  });
  const deleteSession = useMutation({
    mutationFn: attendanceApi.deleteSession,
    onSuccess: async (_, sessionId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["attendance-sessions"] }),
        queryClient.invalidateQueries({
          queryKey: ["attendance-session-records", sessionId],
        }),
      ]);
      toast.success(t("sessionDeleted"));
    },
    onError: () => toast.error(t("sessionDeleteFailed")),
  });
  const kpi = overview.data?.kpi || {
    totalSessions: 0,
    activeSessions: 0,
    totalCheckedIn: 0,
    presentCount: 0,
    lateCount: 0,
  };
  const openRecords = useCallback((session: AttendanceSessionDto) => {
    setSelectedSession(session);
    setRecordsPage(1);
    setSelectedRecordIds([]);
  }, []);
  const { mutate: openPresenter, isPending: isOpeningPresenter } = useMutation({
    mutationFn: (session: AttendanceSessionDto) => attendanceApi.getCurrentQr(session._id),
    onSuccess: (qr, session) => onOpenSessionPresenter?.(session, qr),
    onError: (error, session) => {
      if (isAxiosError(error) && error.response?.status === 400) {
        openRecords(session);
        void queryClient.invalidateQueries({ queryKey: ["attendance-sessions"] });
        return;
      }
      toast.error(isArabic ? "تعذر فتح عرض الجلسة" : "Failed to open session presenter");
    },
  });
  const columns = useMemo<ColumnDef<AttendanceSessionDto>[]>(
    () => [
      {
        key: "course",
        header: isArabic ? "المقرر" : "Course",
        render: (session) => {
          const showPresenter = session.status === "OPEN" && Boolean(onOpenSessionPresenter);
          const action = showPresenter
            ? isArabic ? "عرض رمز QR" : "Show QR code"
            : isArabic ? "فتح سجل الحضور" : "Open attendance record";

          return (
            <button
              type="button"
              className="group min-w-40 cursor-pointer rounded-squircle text-start focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary disabled:cursor-wait"
              disabled={isOpeningPresenter}
              onClick={() => showPresenter ? openPresenter(session) : openRecords(session)}
              title={action}
            >
              <bdi dir="ltr" className="block font-mono text-xs font-semibold text-primary">
                {session.courseCode}
              </bdi>
              <bdi className="mt-1 block text-xs group-hover:text-primary group-hover:underline">
                {session.courseName || "—"}
              </bdi>
              <span className="sr-only">{action}</span>
            </button>
          );
        },
      },
      {
        key: "level",
        header: isArabic ? "المستوى" : "Level",
        render: (session) => <Badge variant="outline">{session.level}</Badge>,
      },
      {
        key: "type",
        header: isArabic ? "النوع" : "Type",
        render: (session) => (
          <span className="whitespace-nowrap text-xs">
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
          </span>
        ),
      },
      {
        key: "instructor",
        header: isArabic ? "القائم بالتدريس" : "Instructor",
        render: (session) => (
          <div className="min-w-32 text-xs">
            <bdi>{(isArabic ? session.createdByNameAr : session.createdByNameEn) || session.createdByName}</bdi>
            <p className="mt-1 text-muted-foreground">
              {getStaffRoleLabel(
                session.instructorStaffType ??
                  (session.academicPosition === "doctor" ? "doctor" : "teaching_assistant"),
                "staff",
                locale,
                session.instructorTitlePrefix,
              )}
            </p>
          </div>
        ),
      },
      {
        key: "date",
        header: isArabic ? "الموعد (القاهرة)" : "Date & time (Cairo)",
        render: (session) => (
          <time
            dateTime={session.startsAt}
            className="whitespace-nowrap text-xs text-muted-foreground"
          >
            {new Date(session.startsAt).toLocaleString(locale, {
              timeZone: "Africa/Cairo",
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </time>
        ),
      },
      {
        key: "attendance",
        header: isArabic ? "الحضور" : "Attendance",
        render: (session) => (
          <div className="space-y-1 whitespace-nowrap text-xs">
            <p>
              <span className="font-semibold text-primary">
                {session.stats?.totalCheckedIn || 0}
              </span>{" "}
              {isArabic ? "مسجل" : "recorded"}
            </p>
            <p className="text-muted-foreground">
              {session.stats?.presentCount || 0} {isArabic ? "حاضر" : "present"}{" "}
              · {session.stats?.lateCount || 0} {isArabic ? "متأخر" : "late"}
            </p>
          </div>
        ),
      },
      {
        key: "status",
        header: isArabic ? "الحالة" : "Status",
        render: (session) => (
          <Badge
            variant="outline"
            className={
              session.status === "OPEN"
                ? "border-primary/20 bg-primary/10 text-primary"
                : "text-muted-foreground"
            }
          >
            {session.status === "OPEN"
              ? isArabic
                ? "نشطة"
                : "Live"
              : session.status === "EXPIRED"
                ? isArabic
                  ? "منتهية"
                  : "Expired"
                : isArabic
                  ? "مغلقة"
                  : "Closed"}
          </Badge>
        ),
      },
      {
        key: "actions",
        header: isArabic ? "الإجراءات" : "Actions",
        className: "w-16",
        render: (session) => (
          <DropdownMenu.Root dir={isArabic ? "rtl" : "ltr"}>
            <DropdownMenu.Trigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={
                  isArabic
                    ? `إجراءات جلسة ${session.courseCode}`
                    : `Actions for session ${session.courseCode}`
                }
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content asChild align="end" sideOffset={4}>
                <div
                  dir={isArabic ? "rtl" : "ltr"}
                  className="z-50 min-w-44 rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-lg"
                >
                  <DropdownMenu.Item
                    onSelect={() => openRecords(session)}
                    className="flex cursor-pointer items-center gap-2 rounded-squircle px-3 py-2 text-sm outline-none focus:bg-accent"
                  >
                    <UserRound className="h-4 w-4" />
                    {isArabic ? "سجل الطلاب" : "View attendees"}
                  </DropdownMenu.Item>
                  {session.status === "OPEN" && onOpenSessionPresenter && (
                    <DropdownMenu.Item
                      disabled={isOpeningPresenter}
                      onSelect={() => openPresenter(session)}
                      className="flex cursor-pointer items-center gap-2 rounded-squircle px-3 py-2 text-sm outline-none focus:bg-accent data-disabled:opacity-50"
                    >
                      <QrCode className="h-4 w-4" />
                      {isArabic ? "عرض QR" : "Open presenter"}
                    </DropdownMenu.Item>
                  )}
                  {canDeleteRecords && (
                    <>
                      <DropdownMenu.Separator className="my-1 border-t border-border" />
                      <DropdownMenu.Item
                        disabled={deleteSession.isPending}
                        onSelect={() => setSessionToDelete(session)}
                        className="flex cursor-pointer items-center gap-2 rounded-squircle px-3 py-2 text-sm text-destructive outline-none focus:bg-destructive/10 data-disabled:opacity-50"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                        {t("menuAction")}
                      </DropdownMenu.Item>
                    </>
                  )}
                </div>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        ),
      },
    ],
    [canDeleteRecords, deleteSession.isPending, isArabic, isOpeningPresenter, locale, onOpenSessionPresenter, openPresenter, openRecords, t],
  );
  const updateRecord = async () => {
    if (!editRecord || saving) return;
    setSaving(true);
    try {
      await attendanceApi.manualUpdateRecord(editRecord._id, {
        status: editStatus,
        reason:
          editReason.trim() ||
          (isArabic ? "تصحيح يدوي للحضور" : "Manual attendance correction"),
      });
      setEditRecord(null);
      await Promise.all([records.refetch(), overview.refetch()]);
      toast.success(isArabic ? "تم تحديث حالة الحضور." : "Attendance updated.");
    } catch (error) {
      toast.error(getAttendanceErrorMessage(error, isArabic ? "ar" : "en"));
    } finally {
      setSaving(false);
    }
  };
  const courseOptions = Array.from(
    new Map(
      (overview.data?.filters.courses || []).map((course) => [
        course.code,
        course,
      ]),
    ).values(),
  );
  const activeFilters =
    params.search ||
    params.level !== "all" ||
    params.courseCode !== "all" ||
    params.status !== "all";
  if (overview.isLoading)
    return (
      <LoadingState
        title={isArabic ? "جاري تحميل الحضور…" : "Loading attendance…"}
      />
    );
  if (overview.isError)
    return (
      <ErrorState
        description={
          isArabic
            ? "تعذر تحميل جلسات الحضور."
            : "Could not load attendance sessions."
        }
        onRetry={() => overview.refetch()}
      />
    );
  return (
    <div className="space-y-5" dir={isArabic ? "rtl" : "ltr"}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          {
            label: isArabic ? "إجمالي الجلسات" : "Total sessions",
            value: kpi.totalSessions,
            Icon: Layers,
          },
          {
            label: isArabic ? "نشطة الآن" : "Active sessions",
            value: kpi.activeSessions,
            Icon: Activity,
          },
          {
            label: isArabic ? "إجمالي التسجيلات" : "Total check-ins",
            value: kpi.totalCheckedIn,
            Icon: Users,
          },
          {
            label: isArabic ? "حضور في الموعد" : "On time",
            value: kpi.presentCount,
            Icon: CheckCircle2,
          },
          {
            label: isArabic ? "متأخر" : "Late",
            value: kpi.lateCount,
            Icon: Clock,
          },
        ].map(({ label, value, Icon }) => (
          <Card key={label} className="p-4">
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{label}</span>
              <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums">
              {value.toLocaleString(locale)}
            </p>
          </Card>
        ))}
      </div>
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {(["all", "OPEN", "ENDED"] as const).map((value) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={params.status === value ? "default" : "outline"}
                aria-pressed={params.status === value}
                onClick={() => table.setFilter("status", value)}
              >
                {value === "all"
                  ? isArabic
                    ? "كل الجلسات"
                    : "All sessions"
                  : value === "OPEN"
                    ? isArabic
                      ? "نشطة الآن"
                      : "Live"
                    : isArabic
                      ? "مغلقة ومنتهية"
                      : "Closed & expired"}
              </Button>
            ))}
          </div>
          <AttendanceExportButton
            isArabic={isArabic}
            filters={params}
            disabled={overview.isPlaceholderData || !overview.data?.total}
          />
        </div>
        <div className="grid gap-3 md:grid-cols-[minmax(200px,1fr)_170px_minmax(200px,1fr)]">
          <SessionSearch
            value={table.search}
            onSearch={table.setSearch}
            isArabic={isArabic}
          />
          <CustomDropdown
            value={params.level}
            onValueChange={(value) => table.setFilter("level", value)}
            ariaLabel={isArabic ? "تصفية حسب المستوى" : "Filter by level"}
            options={[
              { value: "all", label: isArabic ? "كل المستويات" : "All levels" },
              ...(overview.data?.filters.levels || []).map((level) => ({
                value: level,
                label: `${isArabic ? "المستوى" : "Level"} ${level}`,
              })),
            ]}
            className="w-full"
          />
          <CustomDropdown
            value={params.courseCode}
            onValueChange={(value) => table.setFilter("courseCode", value)}
            ariaLabel={isArabic ? "تصفية حسب المقرر" : "Filter by course"}
            options={[
              { value: "all", label: isArabic ? "كل المقررات" : "All courses" },
              ...courseOptions.map((course) => ({
                value: course.code,
                label: (
                  <span>
                    <bdi>{course.code}</bdi> ·{" "}
                    <bdi>{course.name || course.code}</bdi>
                  </span>
                ),
              })),
            ]}
            className="w-full"
          />
        </div>
        {activeFilters && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={table.resetAll}
          >
            {isArabic ? "مسح التصفية" : "Clear filters"}
          </Button>
        )}
      </Card>
      <div aria-busy={overview.isFetching || table.isPending}>
      <DataTableShell<AttendanceSessionDto>
          columns={columns.map((column) => ({
            ...column,
            render: (session, index) => (
              <TableCell className={column.className}>
                {column.render(session, index)}
              </TableCell>
            ),
          }))}
          data={overview.data?.sessions || []}
          keyExtractor={(session) => session._id}
          emptyMessage={
            isArabic
              ? "لا توجد جلسات مطابقة. جرّب تغيير المستوى أو المقرر أو البحث."
              : "No matching sessions. Try another level, course, or search."
          }
        />
        <AttendancePagination
          page={overview.data?.page || 1}
          limit={params.limit}
          total={overview.data?.total || 0}
          totalPages={overview.data?.totalPages || 0}
          onPage={table.setPage}
          onLimit={table.setLimit}
          isArabic={isArabic}
          disabled={overview.isPlaceholderData || table.isPending}
        />
      </div>
      {canDeleteRecords && (
        <ConfirmDialog
          dir={isArabic ? "rtl" : "ltr"}
          open={Boolean(sessionToDelete)}
          onOpenChange={(open) => {
            if (!open) setSessionToDelete(null);
          }}
          title={t("deleteSessionTitle")}
          description={
            <>
              <span className="mb-2 block font-medium text-foreground">
                <bdi>{sessionToDelete?.courseCode}</bdi>{" "}
                <bdi>{sessionToDelete?.courseName}</bdi>
              </span>
              {t("deleteSessionDescription")}
            </>
          }
          confirmLabel={t("yes")}
          cancelLabel={t("no")}
          disabled={deleteSession.isPending}
          onConfirm={() => {
            if (sessionToDelete) deleteSession.mutate(sessionToDelete._id);
          }}
        />
      )}
      <Dialog
        open={Boolean(selectedSession)}
        onOpenChange={(open) => {
          if (!open && !deleteRecords.isPending) setSelectedSession(null);
        }}
      >
        <DialogContent
          className="flex max-h-[90vh] flex-col overflow-y-auto sm:max-w-3xl"
          dir={isArabic ? "rtl" : "ltr"}
        >
          <DialogHeader>
            <DialogTitle>
              {isArabic ? "سجل حضور الجلسة" : "Session attendance register"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              <bdi>{selectedSession?.courseCode}</bdi> ·{" "}
              <bdi>{selectedSession?.courseName}</bdi>
            </DialogDescription>
          </DialogHeader>
          {selectedSession && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {canDeleteRecords && (
                <>
                  <span
                    className="me-auto text-sm text-muted-foreground"
                    aria-live="polite"
                  >
                    {selectedRecordIds.length > 0
                      ? t("selected", { count: selectedRecordIds.length })
                      : t("selectHint")}
                    {selectedRecordIds.length === ATTENDANCE_RECORD_DELETE_LIMIT &&
                      ` · ${t("limit", { count: ATTENDANCE_RECORD_DELETE_LIMIT })}`}
                  </span>
                  {selectedRecordIds.length > 0 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={deleteRecords.isPending}
                      onClick={() => setSelectedRecordIds([])}
                    >
                      {t("clear")}
                    </Button>
                  )}
                  <ConfirmDialog
                    dir={isArabic ? "rtl" : "ltr"}
                    trigger={
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={
                          deleteRecords.isPending || selectedRecordIds.length === 0
                        }
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                        {deleteRecords.isPending
                          ? t("deleting")
                          : t("deleteSelected")}
                      </Button>
                    }
                    title={t("title")}
                    description={t("description", {
                      count: selectedRecordIds.length,
                    })}
                    confirmLabel={t("confirm")}
                    cancelLabel={t("cancel")}
                    disabled={deleteRecords.isPending || selectedRecordIds.length === 0}
                    onConfirm={() =>
                      deleteRecords.mutate({
                        sessionId: selectedSession._id,
                        recordIds: selectedRecordIds,
                      })
                    }
                  />
                </>
              )}
              <AttendanceExportButton
                isArabic={isArabic}
                sessionId={selectedSession._id}
              />
            </div>
          )}
          {records.isLoading ? (
            <LoadingState
              title={isArabic ? "جاري تحميل التسجيلات…" : "Loading records…"}
            />
          ) : records.isError ? (
            <ErrorState
              description={
                isArabic
                  ? "تعذر تحميل الطلاب المسجلين."
                  : "Could not load attendees."
              }
              onRetry={() => records.refetch()}
            />
          ) : (
            selectedSession && (
              <>
                <LiveAttendeeStream
                  records={records.data?.items || []}
                  stats={{
                    total: records.data?.total || 0,
                    present: currentSession?.stats?.presentCount || 0,
                    late: currentSession?.stats?.lateCount || 0,
                  }}
                  hall={selectedSession.location}
                  isArabic={isArabic}
                  isLive={currentSession?.status === "OPEN"}
                  selection={
                    canDeleteRecords
                      ? {
                          ids: selectedRecordIds,
                          disabled: deleteRecords.isPending,
                          onChange: setSelectedRecordIds,
                        }
                      : undefined
                  }
                  onEdit={(record) => {
                    setEditRecord(record);
                    setEditStatus(record.status);
                    setEditReason("");
                  }}
                  onAwardBonus={(record) => setBonusRecord(record)}
                />
                <AttendancePagination
                  page={records.data?.page || 1}
                  limit={50}
                  total={records.data?.total || 0}
                  totalPages={records.data?.totalPages || 0}
                  onPage={setRecordsPage}
                  isArabic={isArabic}
                  disabled={records.isFetching || deleteRecords.isPending}
                />
              </>
            )
          )}
          <DialogFooter className="rtl:sm:justify-start">
            <Button
              variant="outline"
              disabled={deleteRecords.isPending}
              onClick={() => setSelectedSession(null)}
            >
              {isArabic ? "إغلاق" : "Close"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(editRecord)}
        onOpenChange={(open) => {
          if (!open && !saving) setEditRecord(null);
        }}
      >
        <DialogContent dir={isArabic ? "rtl" : "ltr"} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {isArabic ? "تصحيح حالة الحضور" : "Correct attendance status"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            <bdi>{editRecord?.studentName}</bdi> ·{" "}
            <bdi>{editRecord?.studentCode}</bdi>
          </p>
          <CustomDropdown
            value={editStatus}
            onValueChange={setEditStatus}
            ariaLabel={isArabic ? "حالة الحضور" : "Attendance status"}
            options={[
              { value: "present", label: isArabic ? "حاضر" : "Present" },
              { value: "late", label: isArabic ? "متأخر" : "Late" },
              { value: "excused", label: isArabic ? "بعذر" : "Excused" },
              { value: "absent", label: isArabic ? "غائب" : "Absent" },
            ]}
          />
          <Input
            value={editReason}
            onChange={(event) => setEditReason(event.target.value)}
            aria-label={isArabic ? "سبب التصحيح" : "Correction reason"}
            placeholder={
              isArabic
                ? "سبب التصحيح (يسجل في سجل التدقيق)"
                : "Correction reason (recorded in audit history)"
            }
          />
          <DialogFooter className="gap-2 rtl:sm:justify-start">
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => setEditRecord(null)}
            >
              {isArabic ? "إلغاء" : "Cancel"}
            </Button>
            <Button disabled={saving} onClick={updateRecord}>
              {saving
                ? isArabic
                  ? "جاري الحفظ…"
                  : "Saving…"
                : isArabic
                  ? "حفظ التصحيح"
                  : "Save correction"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AttendanceBonusDialog
        record={bonusRecord}
        isArabic={isArabic}
        onClose={() => setBonusRecord(null)}
        onSaved={() => {
          void records.refetch();
        }}
      />
    </div>
  );
}
