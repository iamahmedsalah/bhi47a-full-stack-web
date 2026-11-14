"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Lock,
  TableProperties,
  Unlock,
} from "lucide-react";
import { toast } from "sonner";
import { PERMISSIONS } from "@student-portal/shared";
import { getApiErrorMessage } from "@/lib/api";
import { useAuth } from "@/providers/auth-provider";
import { useTableState } from "@/hooks/use-table-state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { PageSkeletonLoader } from "@/components/ui/page-suspense-fallback";
import { PageTitleBanner } from "@/components/ui/page-title-banner";
import { PermissionGuard } from "@/components/ui/permission-guard";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import {
  controlKeys,
  getControlSheet,
  lockControlSheet,
  unlockControlSheet,
} from "@/features/control/api";
import { ControlAuditDrawer } from "@/features/control/components/control-audit-drawer";
import { ControlWorkbookGrid as ControlGrid } from "@/features/control/components/control-workbook-grid";
import { GradingSchemeDialog } from "@/features/control/components/grading-scheme-dialog";
import type { ControlRosterRow } from "@/features/control/types";

function ControlSheetEditorContent() {
  const { user } = useAuth();
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const locale = (params?.locale as string) || "ar";
  const sheetId = (params?.sheetId as string) || "";
  const isAr = locale === "ar";

  const { search, setSearch } = useTableState({
    shallow: true,
    defaultFilters: {
      filter: "all",
    },
  });

  const {
    data: sheetDetails,
    isLoading: sheetLoading,
    isError: sheetError,
    error: sheetErrObj,
    refetch: refetchSheet,
  } = useQuery({
    queryKey: controlKeys.sheet(sheetId),
    queryFn: () => getControlSheet(sheetId),
    enabled: Boolean(sheetId),
    staleTime: 10_000,
  });

  const [hasPending, setHasPending] = useState(false);
  const [schemeOpen, setSchemeOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditStudent, setAuditStudent] = useState<ControlRosterRow | null>(
    null,
  );
  const [lockDialogOpen, setLockDialogOpen] = useState(false);
  const [lockReason, setLockReason] = useState("");

  useEffect(() => {
    const targetSlug = sheetDetails?.sheet.slug;
    if (targetSlug && sheetId && sheetId !== targetSlug) {
      router.replace(`/${locale}/admin/control/${targetSlug}`);
    }
  }, [sheetDetails?.sheet.slug, sheetId, locale, router]);

  const lockMutation = useMutation({
    mutationFn: () => {
      if (!sheetDetails) throw new Error("Sheet not loaded");
      return sheetDetails.sheet.locked
        ? unlockControlSheet(sheetId, lockReason.trim())
        : lockControlSheet(sheetId, lockReason.trim() || undefined);
    },
    onSuccess: (updated) => {
      toast.success(
        updated.sheet.locked
          ? isAr
            ? "تم قفل كشف الرصد بنجاح"
            : "Sheet locked successfully"
          : isAr
            ? "تم فك قفل الكشف بنجاح"
            : "Sheet unlocked successfully",
      );
      setLockDialogOpen(false);
      setLockReason("");
      queryClient.invalidateQueries({ queryKey: controlKeys.sheet(sheetId) });
      queryClient.invalidateQueries({ queryKey: controlKeys.all });
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err));
    },
  });

  if (sheetLoading) {
    return <PageSkeletonLoader />;
  }

  if (sheetError || !sheetDetails) {
    return (
      <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-center space-y-3">
        <div className="text-sm font-bold text-rose-300">
          {getApiErrorMessage(sheetErrObj)}
        </div>
        <Button
          type="button"
          variant="outline"
          className="rounded-squircle"
          onClick={() => void refetchSheet()}
        >
          {isAr ? "إعادة المحاولة" : "Retry"}
        </Button>
      </div>
    );
  }

  const courseTitle = isAr
    ? sheetDetails.course.nameAr || sheetDetails.course.name
    : sheetDetails.course.nameEn || sheetDetails.course.name;

  return (
    <PermissionGuard
      permissions={[
        PERMISSIONS.CONTROL_ACCESS,
        PERMISSIONS.CONTROL_SHEETS_VIEW,
      ]}
    >
      <div className="space-y-5" dir={isAr ? "rtl" : "ltr"}>
        <PageTitleBanner
          title={`${sheetDetails.course.code} — ${courseTitle}`}
          subtitle={
            isAr
              ? `كشف رصد ${sheetDetails.rules.nameAr} · العام الدراسي ${sheetDetails.sheet.academicYear} · الدرجة العظمى ${sheetDetails.rules.max}`
              : `${sheetDetails.rules.nameEn} Sheet · Academic Year ${sheetDetails.sheet.academicYear} · Max ${sheetDetails.rules.max}`
          }
          eyebrow={isAr ? "شبكة رصد الكنترول" : "Control Grade Sheet"}
          icon={<TableProperties className="h-4 w-4" />}
        >
          <StatusBadge
            label={sheetDetails.sheet.locked ? "locked" : "unlocked"}
            variant={sheetDetails.sheet.locked ? "warning" : "success"}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-squircle"
            disabled={hasPending}
            onClick={() => router.push(`/${locale}/admin/control`)}
          >
            {isAr ? (
              <ArrowRight className="h-4 w-4 me-1.5" />
            ) : (
              <ArrowLeft className="h-4 w-4 me-1.5" />
            )}
            <span>{isAr ? "العودة لقائمة الكشوف" : "Back to Sheets"}</span>
          </Button>
        </PageTitleBanner>

        <ControlGrid
          canPublish={
            user?.role === "admin" ||
            Boolean(user?.permissions?.includes("grades.publish"))
          }
          key={`${user?._id ?? ""}:${sheetId}`}
          principalId={user?._id}
          sheetDetails={sheetDetails}
          locale={locale}
          onPendingChange={setHasPending}
          search={search}
          onSearchChange={setSearch}
          onOpenScheme={() => setSchemeOpen(true)}
          onOpenSheetAudit={() => {
            setAuditStudent(null);
            setAuditOpen(true);
          }}
          onOpenRowAudit={(row) => {
            setAuditStudent(row);
            setAuditOpen(true);
          }}
          onLockToggleRequest={() => {
            setLockReason("");
            setLockDialogOpen(true);
          }}
        />

        <GradingSchemeDialog
          open={schemeOpen}
          onOpenChange={setSchemeOpen}
          courseId={sheetDetails.course.id}
          courseCode={sheetDetails.course.code}
          courseTitle={courseTitle}
          academicYear={sheetDetails.sheet.academicYear}
          semester={sheetDetails.sheet.semester}
          locale={locale}
          onSaved={() => {
            void refetchSheet();
          }}
        />

        <ControlAuditDrawer
          open={auditOpen}
          onOpenChange={setAuditOpen}
          sheetId={sheetId}
          studentId={auditStudent?.studentId}
          studentLabel={
            auditStudent
              ? `${isAr ? auditStudent.nameAr || auditStudent.name : auditStudent.name} (${auditStudent.studentCode})`
              : null
          }
          locale={locale}
        />

        {/* Lock / Unlock Confirmation Dialog */}
        <Dialog open={lockDialogOpen} onOpenChange={setLockDialogOpen}>
          <DialogContent
            dir={isAr ? "rtl" : "ltr"}
            className="sm:max-w-md rounded-2xl border-border/80 bg-card/95 backdrop-blur-xl"
          >
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {sheetDetails.sheet.locked ? (
                  <Unlock className="h-5 w-5 text-amber-400" />
                ) : (
                  <Lock className="h-5 w-5 text-primary" />
                )}
                <span>
                  {sheetDetails.sheet.locked
                    ? isAr
                      ? "فك قفل كشف الرصد"
                      : "Unlock Grade Sheet"
                    : isAr
                      ? "قفل كشف الرصد"
                      : "Lock Grade Sheet"}
                </span>
              </DialogTitle>
              <DialogDescription>
                {sheetDetails.sheet.locked
                  ? isAr
                    ? "فك القفل يتيح التعديل مرة أخرى لمن يملك الصلاحية. السبب اختياري، ويُسجل الإجراء في التدقيق."
                    : "Unlocking allows edits again for authorized users. The reason is optional; the action is audited."
                  : isAr
                    ? "قفل الكشف يمنع أي تعديل من الشبكة أو من استيراد الإكسيل حتى يتم فك القفل."
                    : "Locking prevents any edits from both the grid and Excel imports until unlocked."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-1.5 py-2">
              <Label className="text-xs font-semibold">
                {sheetDetails.sheet.locked
                  ? isAr
                    ? "سبب فك القفل (اختياري)"
                    : "Reason for unlocking (optional)"
                  : isAr
                    ? "ملاحظة أو سبب القفل (اختياري)"
                    : "Lock note / reason (optional)"}
              </Label>
              <Textarea
                value={lockReason}
                onChange={(e) => setLockReason(e.target.value)}
                rows={3}
                className="rounded-squircle text-sm"
                placeholder={
                  sheetDetails.sheet.locked
                    ? isAr
                      ? "مثال: تصحيح خطأ مادي في رصد درجة طالب..."
                      : "e.g. Correcting a data entry typo..."
                    : isAr
                      ? "مثال: تم الانتهاء من رصد ومراجعة درجات الميدتيرم..."
                      : "e.g. Midterm marks reviewed and finalized..."
                }
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="rounded-squircle"
                onClick={() => setLockDialogOpen(false)}
              >
                {isAr ? "إلغاء" : "Cancel"}
              </Button>
              <Button
                type="button"
                className="rounded-squircle"
                disabled={lockMutation.isPending}
                onClick={() => lockMutation.mutate()}
              >
                {lockMutation.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin me-1.5" />
                )}
                <span>
                  {sheetDetails.sheet.locked
                    ? isAr
                      ? "تأكيد فك القفل"
                      : "Confirm Unlock"
                    : isAr
                      ? "تأكيد قفل الكشف"
                      : "Confirm Lock"}
                </span>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PermissionGuard>
  );
}

export default function ControlSheetEditorPage() {
  return (
    <Suspense fallback={<PageSkeletonLoader />}>
      <ControlSheetEditorContent />
    </Suspense>
  );
}
