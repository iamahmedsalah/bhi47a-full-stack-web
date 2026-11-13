"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  Search,
  ShieldAlert,
  ShieldCheck,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { getApiErrorMessage } from "@/lib/api";
import { auditAcademicWarnings } from "../api";

interface AuditWarningsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAr: boolean;
  onSuccess?: () => void;
}

export function AuditWarningsModal({
  open,
  onOpenChange,
  isAr,
  onSuccess,
}: AuditWarningsModalProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState<
    "all" | "warned" | "cleared" | "good"
  >("all");

  const previewQuery = useQuery({
    queryKey: ["admin", "grades", "audit-warnings-preview"],
    queryFn: () => auditAcademicWarnings({ dryRun: true }),
    enabled: open,
    staleTime: 1000 * 30,
  });

  const applyMutation = useMutation({
    mutationFn: () => auditAcademicWarnings({ dryRun: false }),
    onSuccess: (data) => {
      toast.success(
        isAr
          ? `تم تحديث الإنذارات بنجاح: تم تطبيق الإنذار على ${data.warnedCount} طالب، وإلغاء الإنذار عن ${data.clearedCount} طالب`
          : `Academic warnings updated: ${data.warnedCount} warned, ${data.clearedCount} cleared`,
      );
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error));
    },
  });

  const details = useMemo(() => previewQuery.data?.details ?? [], [previewQuery.data?.details]);

  const filteredDetails = useMemo(() => {
    return details.filter((item) => {
      const matchesSearch =
        !searchTerm.trim() ||
        item.studentCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.studentName.toLowerCase().includes(searchTerm.toLowerCase());

      if (!matchesSearch) return false;

      if (activeFilter === "warned") return item.status === "WARNED";
      if (activeFilter === "cleared") return item.status === "CLEARED";
      if (activeFilter === "good") return item.status === "GOOD_STANDING";
      return true;
    });
  }, [details, searchTerm, activeFilter]);

  const summary = previewQuery.data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto rounded-2xl border-border bg-card p-6">
        <DialogHeader className="text-start">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-squircle bg-amber-500/15 text-amber-500">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold">
                {isAr
                  ? "تدقيق الإنذارات الأكاديمية (CGPA)"
                  : "Audit Academic Warnings (CGPA)"}
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                {isAr
                  ? "فحص وتحديث الإنذارات الأكاديمية بناءً على المعدل التراكمي (CGPA < 2.00) وتقييد الساعات المسموحة إلى 12 ساعة."
                  : "Audit and update academic warnings based on cumulative GPA (< 2.00) and enforce 12 credit hour registration limit."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {previewQuery.isLoading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
            <p className="text-sm text-muted-foreground">
              {isAr
                ? "جاري تدقيق المعدلات التراكمية وسجلات الطلاب..."
                : "Auditing cumulative GPAs and student standing..."}
            </p>
          </div>
        ) : previewQuery.isError ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-center text-sm text-destructive">
            {getApiErrorMessage(previewQuery.error)}
          </div>
        ) : (
          <div className="space-y-6 pt-2">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-border/80 bg-background/50 p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Users className="h-4 w-4" />
                  <span>{isAr ? "إجمالي المفحوصين" : "Total Audited"}</span>
                </div>
                <div className="mt-1 font-mono text-2xl font-bold">
                  {summary?.totalAudited ?? 0}
                </div>
              </div>

              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                <div className="flex items-center gap-2 text-xs text-amber-400">
                  <AlertTriangle className="h-4 w-4" />
                  <span>{isAr ? "تحت الإنذار (< 2.00)" : "Under Warning"}</span>
                </div>
                <div className="mt-1 font-mono text-2xl font-bold text-amber-400">
                  {summary?.warnedCount ?? 0}
                </div>
              </div>

              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                <div className="flex items-center gap-2 text-xs text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{isAr ? "تم إلغاء الإنذار" : "Warnings Cleared"}</span>
                </div>
                <div className="mt-1 font-mono text-2xl font-bold text-emerald-400">
                  {summary?.clearedCount ?? 0}
                </div>
              </div>

              <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-3">
                <div className="flex items-center gap-2 text-xs text-sky-400">
                  <ShieldCheck className="h-4 w-4" />
                  <span>{isAr ? "وضع أكاديمي سليم" : "Good Standing"}</span>
                </div>
                <div className="mt-1 font-mono text-2xl font-bold text-sky-400">
                  {summary?.goodStandingCount ?? 0}
                </div>
              </div>
            </div>

            {/* Notice Alert */}
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-amber-300">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <div>
                <p className="font-semibold">
                  {isAr
                    ? "القواعد الأكاديمية للساعات المعتمدة:"
                    : "Credit Hour System Academic Regulations:"}
                </p>
                <p className="mt-1 opacity-90">
                  {isAr
                    ? "الطلاب الذين يقل معدلهم التراكمي (CGPA) عن 2.00 يقعون تحت الإنذار الأكاديمي، ويُقيد الحد الأقصى لساعات التسجيل بـ 12 ساعة معتمدة ويلزم مراجعة واعتماد المرشد الأكاديمي."
                    : "Students with CGPA < 2.00 receive academic warnings, restricting their max registration to 12 credit hours and requiring mandatory academic advisor approval."}
                </p>
              </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1 sm:max-w-xs">
                <Search className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={
                    isAr ? "بحث بكود أو اسم الطالب..." : "Search code or name..."
                  }
                  className="rounded-squircle ps-9 text-sm"
                />
              </div>

              <div className="flex flex-wrap gap-1.5">
                {[
                  { key: "all", label: isAr ? "الكل" : "All" },
                  { key: "warned", label: isAr ? "تحت الإنذار" : "Under Warning" },
                  { key: "cleared", label: isAr ? "رفع الإنذار" : "Cleared" },
                  { key: "good", label: isAr ? "سليم" : "Good Standing" },
                ].map((f) => (
                  <Button
                    key={f.key}
                    size="sm"
                    variant={activeFilter === f.key ? "default" : "outline"}
                    onClick={() => setActiveFilter(f.key as typeof activeFilter)}
                    className="rounded-squircle text-xs"
                  >
                    {f.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Table of affected students */}
            <div className="max-h-72 overflow-y-auto rounded-xl border border-border/80">
              <table className="w-full text-start text-sm">
                <thead className="sticky top-0 bg-secondary/80 text-xs text-muted-foreground backdrop-blur">
                  <tr>
                    <th className="p-3 text-start">{isAr ? "كود الطالب" : "Code"}</th>
                    <th className="p-3 text-start">{isAr ? "اسم الطالب" : "Name"}</th>
                    <th className="p-3 text-center">CGPA</th>
                    <th className="p-3 text-center">{isAr ? "الإنذار السابق" : "Prev"}</th>
                    <th className="p-3 text-center">{isAr ? "الإنذار الجديد" : "New"}</th>
                    <th className="p-3 text-end">{isAr ? "الحالة" : "Status"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50 font-mono text-xs">
                  {filteredDetails.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-muted-foreground">
                        {isAr ? "لا توجد نتائج مطابقة" : "No matching records"}
                      </td>
                    </tr>
                  ) : (
                    filteredDetails.map((item) => (
                      <tr
                        key={item.studentId}
                        className={
                          item.status === "WARNED"
                            ? "bg-amber-500/5 hover:bg-amber-500/10"
                            : "hover:bg-muted/30"
                        }
                      >
                        <td className="p-3 font-bold text-foreground">
                          {item.studentCode}
                        </td>
                        <td className="p-3 font-sans font-medium text-foreground">
                          {item.studentName}
                        </td>
                        <td className="p-3 text-center font-bold">
                          <span
                            className={
                              item.gpa < 2.0
                                ? "text-amber-400"
                                : "text-emerald-400"
                            }
                          >
                            {item.gpa.toFixed(2)}
                          </span>
                        </td>
                        <td className="p-3 text-center text-muted-foreground">
                          {item.previousWarnings}
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={
                              item.newWarnings > 0
                                ? "font-bold text-amber-400"
                                : "text-muted-foreground"
                            }
                          >
                            {item.newWarnings}
                          </span>
                        </td>
                        <td className="p-3 text-end font-sans">
                          <StatusBadge
                            label={
                              item.status === "WARNED"
                                ? isAr
                                  ? `إنذار ${item.newWarnings}`
                                  : `Warning ${item.newWarnings}`
                                : item.status === "CLEARED"
                                  ? isAr
                                    ? "إلغاء الإنذار"
                                    : "Cleared"
                                  : isAr
                                    ? "سليم"
                                    : "Good"
                            }
                            variant={
                              item.status === "WARNED"
                                ? "danger"
                                : item.status === "CLEARED"
                                  ? "success"
                                  : "neutral"
                            }
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-3">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="rounded-squircle"
              >
                {isAr ? "إلغاء" : "Cancel"}
              </Button>
              <Button
                onClick={() => applyMutation.mutate()}
                disabled={applyMutation.isPending}
                className="rounded-squircle bg-amber-600 text-white hover:bg-amber-500"
              >
                {applyMutation.isPending ? (
                  <Loader2 className="me-2 h-4 w-4 animate-spin" />
                ) : (
                  <ShieldAlert className="me-2 h-4 w-4" />
                )}
                {isAr
                  ? "تطبيق وحفظ الإنذارات الأكاديمية"
                  : "Apply Academic Warnings"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
