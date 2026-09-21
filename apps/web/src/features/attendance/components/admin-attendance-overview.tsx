"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Filter,
  Layers,
  Play,
  QrCode,
  Search,
  ShieldAlert,
  Users,
  XCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/feedback";
import {
  attendanceApi,
  type AttendanceSessionDto,
  type AttendanceRecordDto,
} from "../api/attendance-api";
import { toast } from "sonner";

interface AdminAttendanceOverviewProps {
  isArabic?: boolean;
  onOpenSessionPresenter?: (session: AttendanceSessionDto) => void;
}

export function AdminAttendanceOverview({
  isArabic = true,
  onOpenSessionPresenter,
}: AdminAttendanceOverviewProps) {
  const [statusFilter, setStatusFilter] = useState<"all" | "OPEN" | "CLOSED">(
    "all",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSessionForDetails, setSelectedSessionForDetails] =
    useState<AttendanceSessionDto | null>(null);

  // Correction state
  const [selectedRecordForEdit, setSelectedRecordForEdit] =
    useState<AttendanceRecordDto | null>(null);
  const [editStatus, setEditStatus] = useState<string>("present");
  const [editReason, setEditReason] = useState<string>("");
  const [isUpdatingRecord, setIsUpdatingRecord] = useState(false);

  // Fetch admin overview
  const overviewQuery = useQuery({
    queryKey: ["admin-attendance-overview"],
    queryFn: () => attendanceApi.getAdminOverview(),
    refetchInterval: 10000,
  });

  // Fetch session records when details dialog is open
  const sessionRecordsQuery = useQuery({
    queryKey: ["admin-session-records", selectedSessionForDetails?._id],
    enabled: Boolean(selectedSessionForDetails?._id),
    queryFn: () =>
      attendanceApi.getSessionRecords(selectedSessionForDetails!._id, {
        limit: 200,
      }),
  });

  const kpi = overviewQuery.data?.kpi || {
    totalSessions: 0,
    activeSessions: 0,
    totalCheckedIn: 0,
    presentCount: 0,
    lateCount: 0,
  };

  const sessions = overviewQuery.data?.sessions || [];

  const filteredSessions = sessions.filter((s) => {
    if (statusFilter !== "all" && s.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const code = s.courseCode.toLowerCase();
      const name = (s.courseName || "").toLowerCase();
      const staff = (s.createdByName || "").toLowerCase();
      if (!code.includes(q) && !name.includes(q) && !staff.includes(q)) {
        return false;
      }
    }
    return true;
  });

  const handleUpdateRecordStatus = async () => {
    if (!selectedRecordForEdit) return;
    setIsUpdatingRecord(true);
    try {
      await attendanceApi.manualUpdateRecord(selectedRecordForEdit._id, {
        status: editStatus,
        reason: editReason || "Manual correction by Administrator",
      });
      toast.success(
        isArabic
          ? "تم تصحيح وتحديث حالة الحضور بنجاح"
          : "Attendance status corrected successfully",
      );
      setSelectedRecordForEdit(null);
      setEditReason("");
      sessionRecordsQuery.refetch();
      overviewQuery.refetch();
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message ||
          (isArabic ? "فشل تحديث السجل" : "Failed to update record"),
      );
    } finally {
      setIsUpdatingRecord(false);
    }
  };

  if (overviewQuery.isLoading) {
    return (
      <LoadingState
        title={
          isArabic
            ? "جاري تحميل لوحة إدارة الحضور العامة..."
            : "Loading system attendance dashboard..."
        }
      />
    );
  }

  if (overviewQuery.isError) {
    return (
      <ErrorState
        description={
          isArabic
            ? "تعذر تحميل بيانات لوحة الإدارة."
            : "Failed to load admin attendance metrics."
        }
        onRetry={() => overviewQuery.refetch()}
      />
    );
  }

  return (
    <div className="space-y-6" dir={isArabic ? "rtl" : "ltr"}>
      {/* System KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="p-4 bg-card/45 border-border/70 backdrop-blur-sm">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{isArabic ? "إجمالي الجلسات" : "Total Sessions"}</span>
            <Layers className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-2 font-mono text-2xl font-black text-foreground">
            {kpi.totalSessions}
          </div>
        </Card>

        <Card className="p-4 bg-card/45 border-border/70 backdrop-blur-sm">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{isArabic ? "جلسات نشطة الآن" : "Active Sessions"}</span>
            <Activity className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-2 font-mono text-2xl font-black text-primary">
            {kpi.activeSessions}
          </div>
        </Card>

        <Card className="p-4 bg-card/45 border-border/70 backdrop-blur-sm">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{isArabic ? "إجمالي المسجلين" : "Total Attendees"}</span>
            <Users className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-2 font-mono text-2xl font-black text-foreground">
            {kpi.totalCheckedIn}
          </div>
        </Card>

        <Card className="p-4 bg-card/45 border-border/70 backdrop-blur-sm">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{isArabic ? "حضور في الموعد" : "Present (On-Time)"}</span>
            <CheckCircle2 className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-2 font-mono text-2xl font-black text-primary">
            {kpi.presentCount}
          </div>
        </Card>

        <Card className="p-4 bg-card/45 border-border/70 backdrop-blur-sm">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{isArabic ? "تأخير" : "Late Arrivals"}</span>
            <Clock className="h-4 w-4 text-amber-400" />
          </div>
          <div className="mt-2 font-mono text-2xl font-black text-amber-400">
            {kpi.lateCount}
          </div>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
              statusFilter === "all"
                ? "bg-primary/10 text-primary border border-primary/20 font-bold"
                : "bg-secondary/40 text-muted-foreground border border-border/60 hover:text-foreground"
            }`}
          >
            {isArabic ? "جميع الجلسات" : "All Sessions"} ({sessions.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("OPEN")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
              statusFilter === "OPEN"
                ? "bg-primary/10 text-primary border border-primary/20 font-bold"
                : "bg-secondary/40 text-muted-foreground border border-border/60 hover:text-foreground"
            }`}
          >
            {isArabic ? "الجلسات النشطة" : "Active (Live)"} (
            {kpi.activeSessions})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("CLOSED")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
              statusFilter === "CLOSED"
                ? "bg-secondary text-foreground border border-border font-bold"
                : "bg-secondary/40 text-muted-foreground border border-border/60 hover:text-foreground"
            }`}
          >
            {isArabic ? "المغلقة والمنتهية" : "Closed"}
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute start-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              isArabic
                ? "بحث بالمقرر، الكود أو القائم بالتدريس..."
                : "Search course, code or instructor..."
            }
            className="ps-8 h-9 text-xs bg-background/50 border-border/70"
          />
        </div>
      </div>

      {/* Sessions Table */}
      {filteredSessions.length === 0 ? (
        <Card className="p-8 text-center bg-card/40 border-border/70">
          <EmptyState
            title={
              isArabic ? "لا توجد جلسات مطابقة" : "No attendance sessions found"
            }
            description={
              isArabic
                ? "لم يتم العثور على جلسات حضور مطابقة لمعايير البحث."
                : "No sessions match your search or status filter."
            }
          />
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/70 bg-card/40 backdrop-blur-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start">
              <thead className="bg-secondary/40 border-b border-border/60 text-muted-foreground font-semibold">
                <tr>
                  <th className="p-3 text-start">
                    {isArabic ? "المقرر" : "Course"}
                  </th>
                  <th className="p-3 text-center">
                    {isArabic ? "النوع" : "Type"}
                  </th>
                  <th className="p-3 text-start">
                    {isArabic ? "القائم بالتدريس" : "Instructor"}
                  </th>
                  <th className="p-3 text-center">
                    {isArabic ? "الموعد" : "Date & Time"}
                  </th>
                  <th className="p-3 text-center">
                    {isArabic ? "الحضور" : "Attendance"}
                  </th>
                  <th className="p-3 text-center">
                    {isArabic ? "الحالة" : "Status"}
                  </th>
                  <th className="p-3 text-end">
                    {isArabic ? "الإجراءات" : "Actions"}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 font-mono">
                {filteredSessions.map((session) => (
                  <tr
                    key={session._id}
                    className="hover:bg-secondary/20 transition-colors"
                  >
                    <td className="p-3 text-start font-sans">
                      <div className="font-bold text-foreground font-mono">
                        {session.courseCode}
                      </div>
                      <div className="text-[11px] text-muted-foreground font-sans truncate max-w-[160px]">
                        {session.courseName || "—"}
                      </div>
                    </td>

                    <td className="p-3 text-center font-sans">
                      <span className="px-2 py-0.5 rounded bg-secondary/60 text-muted-foreground text-[11px]">
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
                    </td>

                    <td className="p-3 text-start font-sans">
                      <span className="font-medium text-foreground">
                        {session.createdByName}
                      </span>
                      <span className="text-[10px] text-muted-foreground block">
                        {session.academicPosition === "doctor"
                          ? isArabic
                            ? "دكتور المادة"
                            : "Doctor"
                          : isArabic
                            ? "معيد"
                            : "Teaching Assistant"}
                      </span>
                    </td>

                    <td className="p-3 text-center text-muted-foreground text-[11px]">
                      {new Date(session.startsAt).toLocaleString(
                        isArabic ? "ar-EG" : "en-US",
                        {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        },
                      )}
                    </td>

                    <td className="p-3 text-center">
                      <div className="inline-flex items-center gap-2">
                        <span className="text-primary font-bold">
                          {session.stats?.presentCount ?? 0}
                        </span>
                        <span className="text-muted-foreground">/</span>
                        <span className="text-amber-400 font-bold">
                          {session.stats?.lateCount ?? 0}
                        </span>
                      </div>
                    </td>

                    <td className="p-3 text-center font-sans">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                          session.status === "OPEN"
                            ? "bg-primary/10 text-primary border-primary/20"
                            : "bg-secondary text-muted-foreground border-border"
                        }`}
                      >
                        {session.status === "OPEN"
                          ? isArabic
                            ? "نشطة الآن"
                            : "LIVE"
                          : isArabic
                            ? "مغلقة"
                            : "CLOSED"}
                      </span>
                    </td>

                    <td className="p-3 text-end font-sans">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedSessionForDetails(session)}
                          className="h-7 px-2.5 text-xs cursor-pointer"
                        >
                          {isArabic ? "سجل الطلاب" : "Attendees"}
                        </Button>

                        {session.status === "OPEN" &&
                          onOpenSessionPresenter && (
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => onOpenSessionPresenter(session)}
                              className="h-7 px-2.5 text-xs bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer"
                            >
                              {isArabic ? "عرض QR" : "Presenter"}
                            </Button>
                          )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Session Details & Attendees Dialog */}
      <Dialog
        open={Boolean(selectedSessionForDetails)}
        onOpenChange={(open) => !open && setSelectedSessionForDetails(null)}
      >
        <DialogContent
          className="max-w-3xl max-h-[85vh] flex flex-col border-border/80 bg-card/95 backdrop-blur-md"
          dir={isArabic ? "rtl" : "ltr"}
        >
          <DialogHeader className="border-b border-border/60 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-lg font-bold text-foreground flex items-center gap-2">
                  <QrCode className="h-5 w-5 text-primary" />
                  <span>
                    {isArabic
                      ? "سجل حضور الجلسة"
                      : "Session Attendance Register"}
                  </span>
                </DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                  {selectedSessionForDetails?.courseCode} •{" "}
                  {selectedSessionForDetails?.createdByName} •{" "}
                  {selectedSessionForDetails &&
                    new Date(selectedSessionForDetails.startsAt).toLocaleString(
                      isArabic ? "ar-EG" : "en-US",
                      { dateStyle: "medium", timeStyle: "short" },
                    )}
                </p>
              </div>

              <span
                className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
                  selectedSessionForDetails?.status === "OPEN"
                    ? "bg-primary/10 text-primary border-primary/20"
                    : "bg-secondary text-muted-foreground border-border"
                }`}
              >
                {selectedSessionForDetails?.status}
              </span>
            </div>
          </DialogHeader>

          {/* Attendees List in Modal */}
          <div className="flex-1 overflow-y-auto py-3 space-y-2">
            {sessionRecordsQuery.isLoading ? (
              <LoadingState
                title={isArabic ? "جاري تحميل الحضور..." : "Loading records..."}
              />
            ) : (sessionRecordsQuery.data?.items || []).length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-xs">
                {isArabic
                  ? "لم يسجل أي طالب حضوره في هذه الجلسة حتى الآن."
                  : "No student attendance records found for this session."}
              </div>
            ) : (
              <div className="rounded-xl border border-border/60 overflow-hidden">
                <table className="w-full text-xs text-start">
                  <thead className="bg-secondary/40 border-b border-border/60 text-muted-foreground">
                    <tr>
                      <th className="p-2.5 text-start">
                        {isArabic ? "الطالب" : "Student"}
                      </th>
                      <th className="p-2.5 text-center">
                        {isArabic ? "الكود" : "Code"}
                      </th>
                      <th className="p-2.5 text-center">
                        {isArabic ? "الوقت" : "Time"}
                      </th>
                      <th className="p-2.5 text-center">
                        {isArabic ? "الوسيلة" : "Method"}
                      </th>
                      <th className="p-2.5 text-center">
                        {isArabic ? "الحالة" : "Status"}
                      </th>
                      <th className="p-2.5 text-end">
                        {isArabic ? "تعديل" : "Edit"}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40 font-mono">
                    {sessionRecordsQuery.data?.items.map((rec) => (
                      <tr key={rec._id} className="hover:bg-secondary/20">
                        <td className="p-2.5 text-start font-sans font-medium text-foreground">
                          {rec.studentName}
                        </td>
                        <td className="p-2.5 text-center text-muted-foreground">
                          {rec.studentCode}
                        </td>
                        <td className="p-2.5 text-center text-muted-foreground text-[11px]">
                          {new Date(rec.checkedInAt).toLocaleTimeString(
                            isArabic ? "ar-EG" : "en-US",
                            { hour: "2-digit", minute: "2-digit" },
                          )}
                        </td>
                        <td className="p-2.5 text-center text-[11px] font-sans">
                          {rec.method === "qr"
                            ? "QR"
                            : isArabic
                              ? "يدوي"
                              : "Manual"}
                        </td>
                        <td className="p-2.5 text-center font-sans">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              rec.status === "present"
                                ? "bg-primary/10 text-primary"
                                : rec.status === "late"
                                  ? "bg-amber-500/15 text-amber-400"
                                  : rec.status === "excused"
                                    ? "bg-blue-500/15 text-blue-400"
                                    : "bg-rose-500/15 text-rose-400"
                            }`}
                          >
                            {rec.status}
                          </span>
                        </td>
                        <td className="p-2.5 text-end font-sans">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setSelectedRecordForEdit(rec);
                              setEditStatus(rec.status);
                            }}
                            className="h-6 text-xs text-primary hover:text-primary/80 p-1 cursor-pointer"
                          >
                            {isArabic ? "تصحيح" : "Correct"}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedSessionForDetails(null)}
              className="cursor-pointer"
            >
              {isArabic ? "إغلاق" : "Close"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual Attendance Correction Dialog */}
      <Dialog
        open={Boolean(selectedRecordForEdit)}
        onOpenChange={(open) => !open && setSelectedRecordForEdit(null)}
      >
        <DialogContent
          className="max-w-md border-border/80 bg-card/95 backdrop-blur-md"
          dir={isArabic ? "rtl" : "ltr"}
        >
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground">
              {isArabic
                ? "تصحيح حالة حضور الطالب"
                : "Correct Student Attendance"}
            </DialogTitle>
          </DialogHeader>

          {selectedRecordForEdit && (
            <div className="space-y-4 py-2">
              <div className="p-3 rounded-xl bg-secondary/40 border border-border/60">
                <p className="font-bold text-sm text-foreground">
                  {selectedRecordForEdit.studentName}
                </p>
                <p className="text-xs text-muted-foreground font-mono">
                  {selectedRecordForEdit.studentCode}
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  {isArabic ? "الحالة الجديدة:" : "New Status:"}
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="w-full h-9 rounded-lg border border-border/70 bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="present">
                    {isArabic ? "حاضر | Present" : "Present"}
                  </option>
                  <option value="late">
                    {isArabic ? "متأخر | Late" : "Late"}
                  </option>
                  <option value="excused">
                    {isArabic ? "معذور | Excused" : "Excused"}
                  </option>
                  <option value="absent">
                    {isArabic ? "غائب | Absent" : "Absent"}
                  </option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  {isArabic
                    ? "سبب التصحيح (يسجل في سجل التدقيق):"
                    : "Reason for correction (Audited):"}
                </label>
                <Input
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder={
                    isArabic
                      ? "مثال: تقديم عذر طبي معتمد / خطأ في مسح الرمز"
                      : "e.g. Medical excuse provided / Scanner error"
                  }
                  className="text-xs h-9"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedRecordForEdit(null)}
              disabled={isUpdatingRecord}
              className="cursor-pointer"
            >
              {isArabic ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleUpdateRecordStatus}
              disabled={isUpdatingRecord}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold cursor-pointer"
            >
              {isUpdatingRecord
                ? isArabic
                  ? "جاري الحفظ..."
                  : "Saving..."
                : isArabic
                  ? "تأكيد وحفظ التصحيح"
                  : "Save Correction"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
