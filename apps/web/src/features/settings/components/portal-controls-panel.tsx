"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  BookOpenCheck,
  AlertTriangle,
  RotateCcw,
  ShieldAlert,
  GraduationCap,
  SlidersHorizontal,
  Flame,
  Loader2,
  Eye,
  EyeOff,
  Wrench,
  Clock,
  Lock,
  Unlock,
} from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { getApiErrorMessage } from "@/lib/api";
import {
  CAIRO_TIME_ZONE,
  cairoDateTimeToIso,
  toCairoDateTimeLocal,
} from "@/lib/cairo-time";
import { useAuth } from "@/providers/auth-provider";
import {
  getPortalSettings,
  updatePortalSettings,
  resetAcademicRecords,
  settingsKeys,
  type PortalSettingsItem,
} from "../api";

interface PortalControlsPanelProps {
  locale: string;
}

export function PortalControlsPanel({ locale }: PortalControlsPanelProps) {
  const isAr = locale === "ar";
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  // Reset Confirmation Dialog State
  const [resetModalType, setResetModalType] = useState<
    "warnings" | "gpa" | "all" | null
  >(null);
  const [etaDraft, setEtaDraft] = useState<string | undefined>(undefined);
  const [msgDraft, setMsgDraft] = useState<string | undefined>(undefined);

  // Queries
  const portalSettingsQuery = useQuery({
    queryKey: settingsKeys.portalSettings,
    queryFn: getPortalSettings,
  });

  const settings: PortalSettingsItem = portalSettingsQuery.data ?? {
    registrationVisible: true,
    syllabiVisible: true,
    studentLoginMaintenance: false,
    studentLoginMaintenanceEta: null,
    studentLoginMaintenanceMessage: null,
  };

  const maintenanceActive = Boolean(settings.studentLoginMaintenance);
  const resolvedEtaInput =
    etaDraft !== undefined
      ? etaDraft
      : toCairoDateTimeLocal(settings.studentLoginMaintenanceEta ?? undefined);
  const resolvedMsgInput =
    msgDraft !== undefined
      ? msgDraft
      : settings.studentLoginMaintenanceMessage ?? "";

  // Mutations
  const updateSettingsMutation = useMutation({
    mutationFn: (dto: Partial<PortalSettingsItem>) => updatePortalSettings(dto),
    onSuccess: (updated) => {
      setEtaDraft(undefined);
      setMsgDraft(undefined);
      queryClient.setQueryData(settingsKeys.portalSettings, updated);
      void queryClient.invalidateQueries({
        queryKey: settingsKeys.publicPortalSettings,
      });
      void queryClient.invalidateQueries({
        queryKey: ["student-login-maintenance-status"],
      });
      toast.success(
        isAr
          ? "تم تحديث إعدادات البوابة بنجاح"
          : "Portal settings updated successfully",
      );
    },
    onError: (err) => {
      toast.error(
        getApiErrorMessage(
          err,
          isAr
            ? "فشل تحديث إعدادات البوابة"
            : "Failed to update portal settings",
        ),
      );
    },
  });

  const resetRecordsMutation = useMutation({
    mutationFn: (options: { resetWarnings?: boolean; resetGpa?: boolean }) =>
      resetAcademicRecords(options),
    onSuccess: (res) => {
      setResetModalType(null);
      void queryClient.invalidateQueries({ queryKey: ["admin-students"] });
      void queryClient.invalidateQueries({
        queryKey: ["admin-students-stats"],
      });
      void queryClient.invalidateQueries({ queryKey: ["student-profile"] });
      void queryClient.invalidateQueries({
        queryKey: ["registration-eligibility"],
      });

      const details: string[] = [];
      if (res.warningsResetCount > 0) {
        details.push(
          isAr
            ? `تصفير الإنذارات لـ ${res.warningsResetCount} سجل`
            : `Reset warnings for ${res.warningsResetCount} records`,
        );
      }
      if (res.gpaResetCount > 0) {
        details.push(
          isAr
            ? `تصفير المعدل لـ ${res.gpaResetCount} طالب`
            : `Reset GPA for ${res.gpaResetCount} students`,
        );
      }

      toast.success(
        res.message ||
          (isAr
            ? "تم تصفير السجلات الأكاديمية بنجاح"
            : "Academic records reset successfully"),
        {
          description: details.join(" · "),
        },
      );
    },
    onError: (err) => {
      toast.error(
        getApiErrorMessage(
          err,
          isAr
            ? "فشل تنفيذ عملية التصفير الأكاديمي"
            : "Failed to execute academic reset",
        ),
      );
    },
  });

  const handleToggleRegistration = () => {
    updateSettingsMutation.mutate({
      registrationVisible: !settings.registrationVisible,
    });
  };

  const handleToggleSyllabi = () => {
    updateSettingsMutation.mutate({
      syllabiVisible: !settings.syllabiVisible,
    });
  };

  const handleExecuteReset = () => {
    if (resetModalType === "warnings") {
      resetRecordsMutation.mutate({ resetWarnings: true, resetGpa: false });
    } else if (resetModalType === "gpa") {
      resetRecordsMutation.mutate({ resetWarnings: false, resetGpa: true });
    } else if (resetModalType === "all") {
      resetRecordsMutation.mutate({ resetWarnings: true, resetGpa: true });
    }
  };

  const features = [
    {
      id: "registration",
      Icon: BookOpenCheck,
      visible: settings.registrationVisible,
      title: isAr ? "صفحة تسجيل المقررات الأكاديمية" : "Course Registration Page",
      subtitle: "dashboard/registration/",
      description: isAr
        ? "عند إخفاء الصفحة، يُزال رابط التسجيل من القائمة الجانبية والأزرار السريعة في لوحة تحكم الطالب، ويتم منع الدخول المباشر إليها."
        : "When hidden, the registration link is removed from student navigation and quick actions, and direct access is blocked.",
      statusText: settings.registrationVisible
        ? isAr
          ? "الخدمة ظاهرة ومتاحة للطلاب"
          : "Visible and open to students"
        : isAr
          ? "الخدمة معطلة ومخفية عن الطلاب"
          : "Hidden from students",
      btnText: settings.registrationVisible
        ? isAr
          ? "إخفاء الصفحة للطلاب"
          : "Hide page from students"
        : isAr
          ? "إتاحة الصفحة للطلاب"
          : "Make page available",
      toggle: handleToggleRegistration,
    },
    {
      id: "syllabi",
      Icon: BookOpen,
      visible: settings.syllabiVisible,
      title: isAr
        ? "المناهج ومحتوى المقررات الدراسية (PDF)"
        : "Course Syllabi & Materials (PDF)",
      subtitle: isAr
        ? "كارت استعراض وتحميل المنهج بلوحة الطالب"
        : "Syllabi card on student dashboard",
      description: isAr
        ? "عند إخفاء هذا الكارت، لن يظهر كارت المناهج وتحميل المقررات الدراسية (PDF) للطلاب على الصفحة الرئيسية وتتسع بطاقة لجان الامتحانات تلقائياً."
        : "When hidden, the syllabi card will not appear on the student dashboard, allowing the exam room card to expand automatically.",
      statusText: settings.syllabiVisible
        ? isAr
          ? "الكارت ظاهر في لوحة تحكم الطالب"
          : "Card is visible on student dashboard"
        : isAr
          ? "الكارت مخفي من لوحة الطالب"
          : "Card is hidden from student dashboard",
      btnText: settings.syllabiVisible
        ? isAr
          ? "إخفاء كارت المناهج"
          : "Hide syllabi card"
        : isAr
          ? "إظهار كارت المناهج"
          : "Show syllabi card",
      toggle: handleToggleSyllabi,
    },
  ];
  const resetOptions = [
    {
      id: "warnings" as const,
      Icon: AlertTriangle,
      title: isAr ? "تصفير الإنذارات" : "Reset warnings",
      description: isAr
        ? "تعيين عدد الإنذارات الأكاديمية إلى صفر لجميع الطلاب."
        : "Set academic warning counts to zero for every student.",
      action: isAr ? "تصفير جميع الإنذارات" : "Reset all warnings",
    },
    {
      id: "gpa" as const,
      Icon: GraduationCap,
      title: isAr ? "تصفير المعدل التراكمي" : "Reset cumulative GPA",
      description: isAr
        ? "تعيين المعدل التراكمي إلى 0.00 لجميع الطلاب."
        : "Set the cumulative GPA to 0.00 for every student.",
      action: isAr ? "تصفير جميع المعدلات" : "Reset all GPAs",
    },
    {
      id: "all" as const,
      Icon: Flame,
      title: isAr ? "تصفير المعدل والإنذارات" : "Reset GPA and warnings",
      description: isAr
        ? "تصفير المعدلات والإنذارات لجميع الطلاب في عملية واحدة."
        : "Reset both GPA and academic warnings for every student in one operation.",
      action: isAr ? "تصفير المعدل والإنذارات" : "Reset GPA and warnings",
    },
  ];

  return (
    <div className="@container min-w-0 space-y-8 animate-fade-in text-start">
      <section aria-labelledby="portal-visibility-title" className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-squircle border border-primary/20 bg-primary/10 text-primary mt-0.5">
            <SlidersHorizontal className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 space-y-1">
            <h2 id="portal-visibility-title" className="text-base font-bold break-words">
              {isAr
                ? "مفاتيح ظهور وإتاحة خدمات بوابة الطلاب"
                : "Student portal services"}
            </h2>
            <p className="text-xs md:text-sm leading-relaxed text-muted-foreground break-words">
              {isAr
                ? "تفعيل أو إخفاء الأقسام من واجهة ولوحة تحكم الطالب بشكل فوري."
                : "Choose which services students can see. Changes apply as soon as they are saved."}
            </p>
          </div>
        </div>

        {portalSettingsQuery.isPending ? (
          <div
            role="status"
            className="flex items-center gap-2 rounded-xl border border-border p-4 text-sm text-muted-foreground"
          >
            <Loader2 className="size-4 shrink-0 animate-spin" />
            {isAr ? "جارٍ تحميل إعدادات البوابة…" : "Loading portal settings…"}
          </div>
        ) : portalSettingsQuery.isError ? (
          <div
            role="alert"
            className="space-y-3 rounded-xl border border-danger/30 bg-danger/5 p-4"
          >
            <p className="text-sm">
              {isAr
                ? "تعذر تحميل الإعدادات. أعد المحاولة قبل إجراء تغييرات."
                : "Could not load settings. Try again before making changes."}
            </p>
            <Button
              variant="outline"
              onClick={() => void portalSettingsQuery.refetch()}
            >
              {isAr ? "إعادة المحاولة" : "Try again"}
            </Button>
          </div>
        ) : (
          <div className="grid min-w-0 gap-4 @2xl:grid-cols-2">
            {features.map(
              ({
                id,
                Icon,
                visible,
                title,
                subtitle,
                description,
                statusText,
                btnText,
                toggle,
              }) => (
                <Card
                  key={id}
                  className="@container/feature min-w-0 flex flex-col justify-between rounded-2xl border border-border/70 bg-secondary/10 p-4 sm:p-5 shadow-sm hover:border-primary/30 transition-all gap-4"
                >
                  <div className="flex flex-col gap-3 min-w-0">
                    {/* Header: Title + Subtitle + Icon & Badge */}
                    <div className="flex flex-col gap-3 min-w-0 @sm/feature:flex-row @sm/feature:items-start @sm/feature:justify-between">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-squircle border border-primary/20 bg-primary/10 text-primary mt-0.5">
                          <Icon className="size-5" aria-hidden="true" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-bold text-foreground leading-snug break-words">
                            {title}
                          </h3>
                          {subtitle && (
                            <p
                              className="text-[11px] font-mono text-primary/80 mt-0.5 break-all"
                              dir="ltr"
                            >
                              {subtitle}
                            </p>
                          )}
                        </div>
                      </div>
                      <StatusBadge
                        label={
                          visible
                            ? isAr
                              ? "مفعل وظاهر"
                              : "Active & Visible"
                            : isAr
                              ? "معطل ومخفي"
                              : "Disabled"
                        }
                        variant={visible ? "success" : "neutral"}
                        className="shrink-0 text-[11px] px-2.5 py-0.5 rounded-squircle"
                      />
                    </div>

                    {/* Description with proper wrap */}
                    <p className="text-xs leading-relaxed text-muted-foreground break-words [overflow-wrap:anywhere]">
                      {description}
                    </p>
                  </div>

                  {/* Footer: One column on phone view, button in single column */}
                  <div className="border-t border-border/60 pt-3.5 flex flex-col gap-2.5 w-full">
                    {/* Status Text Indicator */}
                    <div className="flex items-center gap-2 text-xs font-medium">
                      <span
                        className={`inline-block size-2 rounded-full shrink-0 ${
                          visible ? "bg-teal-400" : "bg-muted-foreground/50"
                        }`}
                      />
                      <span
                        className={`break-words text-[11px] sm:text-xs ${
                          visible
                            ? "text-teal-400 font-semibold"
                            : "text-muted-foreground"
                        }`}
                      >
                        {statusText}
                      </span>
                    </div>

                    {/* Toggle Button in single column / full width */}
                    <Button
                      type="button"
                      onClick={toggle}
                      disabled={
                        updateSettingsMutation.isPending ||
                        portalSettingsQuery.isFetching
                      }
                      variant={visible ? "outline" : "default"}
                      className={`h-auto min-h-11 w-full whitespace-normal rounded-squircle px-3 py-2.5 text-xs font-semibold gap-2 transition-all cursor-pointer ${
                        visible
                          ? "border-rose-500/30 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 active:scale-[0.99]"
                          : "bg-primary text-primary-foreground hover:bg-primary-hover shadow-sm active:scale-[0.99]"
                      }`}
                    >
                      {updateSettingsMutation.isPending ? (
                        <Loader2 className="size-4 animate-spin shrink-0" />
                      ) : visible ? (
                        <EyeOff className="size-4 shrink-0" />
                      ) : (
                        <Eye className="size-4 shrink-0" />
                      )}
                      <span className="min-w-0 break-words leading-relaxed">{btnText}</span>
                    </Button>
                  </div>
                </Card>
              ),
            )}

            {/* Admin-Only Student Login Maintenance Lock Card */}
            {isAdmin && (
              <Card className="@container/feature @2xl:col-span-2 min-w-0 flex flex-col justify-between rounded-2xl border border-border/70 bg-secondary/10 p-4 sm:p-5 shadow-sm hover:border-primary/30 transition-all gap-4">
                <div className="flex flex-col gap-3 min-w-0">
                  <div className="flex flex-col gap-3 min-w-0 @sm/feature:flex-row @sm/feature:items-start @sm/feature:justify-between">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-squircle border border-primary/20 bg-primary/10 text-primary mt-0.5">
                        <Wrench className="size-5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-bold text-foreground leading-snug break-words">
                          {isAr
                            ? "قفل واجهة تسجيل دخول الطلاب (وضع الصيانة)"
                            : "Student Login Maintenance Mode"}
                        </h3>
                        <p
                          className="text-[11px] font-mono text-primary/80 mt-0.5 break-all"
                          dir="ltr"
                        >
                          /login/student · Admin Only
                        </p>
                      </div>
                    </div>

                    <StatusBadge
                      label={
                        maintenanceActive
                          ? isAr
                            ? "وضع الصيانة مفعّل"
                            : "Maintenance Active"
                          : isAr
                            ? "متاح للطلاب"
                            : "Open to Students"
                      }
                      variant={maintenanceActive ? "warning" : "success"}
                      className="shrink-0 text-[11px] px-2.5 py-0.5 rounded-squircle"
                    />
                  </div>

                  <p className="text-xs leading-relaxed text-muted-foreground break-words [overflow-wrap:anywhere]">
                    {isAr
                      ? "خاص بالأدمن فقط: عند التفعيل تُعرض شاشة صيانة رسمية على صفحة دخول الطلاب مع الوقت التقريبي لعودة النظام، ويتم إيقاف دخول الطلاب من السيرفر (كود الطالب، Google، Passkey) بينما يظل دخول الأدمن وأعضاء هيئة التدريس متاحًا."
                      : "Admin-only control: Displays a maintenance screen on /login/student with your approximate return time and blocks student sign-in on the server while keeping Admin/Staff access open."}
                  </p>

                  {/* ETA Presets + shadcn DateTimePicker + Custom Notice */}
                  <div className="grid min-w-0 gap-3.5 @xl/feature:grid-cols-2 rounded-xl border border-border/60 bg-secondary/20 p-3.5 sm:p-4">
                    <div className="min-w-0 space-y-2">
                      <span className="flex items-center gap-1.5 text-xs font-bold text-foreground break-words">
                        <Clock className="size-3.5 shrink-0 text-primary" />
                        <span>
                          {isAr
                            ? "الوقت التقريبي لعودة النظام (توقيت القاهرة):"
                            : "Approximate return time (Cairo):"}
                        </span>
                      </span>

                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { mins: 30, ar: "+30 دقيقة", en: "+30m" },
                          { mins: 60, ar: "+1 ساعة", en: "+1h" },
                          { mins: 120, ar: "+2 ساعة", en: "+2h" },
                          { mins: 240, ar: "+4 ساعات", en: "+4h" },
                        ].map((preset) => (
                          <button
                            key={preset.mins}
                            type="button"
                            onClick={() => {
                              const next = new Date(
                                Date.now() + preset.mins * 60 * 1000,
                              );
                              setEtaDraft(toCairoDateTimeLocal(next));
                            }}
                            className="rounded-squircle border border-border/75 bg-card px-2.5 py-1 text-[11px] font-bold text-foreground hover:border-primary/45 transition-colors cursor-pointer"
                          >
                            {isAr ? preset.ar : preset.en}
                          </button>
                        ))}
                        {resolvedEtaInput && (
                          <button
                            type="button"
                            onClick={() => setEtaDraft("")}
                            className="rounded-squircle border border-border/75 bg-card px-2.5 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground cursor-pointer"
                          >
                            {isAr ? "مسح الوقت" : "Clear"}
                          </button>
                        )}
                      </div>

                      <DateTimePicker
                        value={resolvedEtaInput}
                        onChange={(val) => setEtaDraft(val)}
                        locale={locale}
                        timeZone="Africa/Cairo"
                        placeholder={
                          isAr
                            ? "اختر التاريخ والوقت التقريبي للعودة"
                            : "Pick approximate return date & time"
                        }
                        className="min-w-0 w-full bg-card/85 border-border/70"
                      />

                      {settings.studentLoginMaintenanceEta && maintenanceActive && (
                        <p className="text-[11px] text-primary break-words">
                          {isAr ? "الموعد المعلن للطلاب: " : "Displayed ETA: "}
                          <bdi className="font-semibold">
                            {new Intl.DateTimeFormat(
                              isAr ? "ar-EG" : "en-GB",
                              {
                                timeZone: CAIRO_TIME_ZONE,
                                dateStyle: "medium",
                                timeStyle: "short",
                              },
                            ).format(
                              new Date(settings.studentLoginMaintenanceEta),
                            )}
                          </bdi>
                        </p>
                      )}
                    </div>

                    <div className="min-w-0 space-y-2">
                      <label
                        htmlFor="student-maintenance-msg"
                        className="block text-xs font-bold text-foreground break-words"
                      >
                        {isAr
                          ? "رسالة تنبيه إضافية للطلاب (اختياري):"
                          : "Custom maintenance message (optional):"}
                      </label>
                      <Input
                        id="student-maintenance-msg"
                        value={resolvedMsgInput}
                        maxLength={400}
                        onChange={(e) => setMsgDraft(e.target.value)}
                        placeholder={
                          isAr
                            ? "مثال: جاري تحديث نتائج الفصل الدراسي وتحسين الخوادم..."
                            : "e.g. Updating semester servers and academic services..."
                        }
                        className="h-10 min-w-0 w-full rounded-squircle bg-card/85 border-border/70 text-xs"
                      />
                      <p className="text-[11px] text-muted-foreground leading-relaxed break-words">
                        {isAr
                          ? "إذا تُركت فارغة ستظهر الرسالة الرسمية: «جاري العمل على صيانة النظام في الوقت الحالي، الرجاء المحاولة في وقت لاحق»."
                          : "Leave blank to show the default bilingual maintenance notice."}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="border-t border-border/60 pt-3.5 flex flex-col @lg/feature:flex-row gap-2.5 w-full">
                  <Button
                    type="button"
                    disabled={
                      updateSettingsMutation.isPending ||
                      portalSettingsQuery.isFetching
                    }
                    onClick={() => {
                      const parsedEta = resolvedEtaInput
                        ? cairoDateTimeToIso(resolvedEtaInput) ?? null
                        : null;
                      updateSettingsMutation.mutate({
                        studentLoginMaintenance: true,
                        studentLoginMaintenanceEta: parsedEta,
                        studentLoginMaintenanceMessage:
                          resolvedMsgInput.trim() || null,
                      });
                    }}
                    variant={maintenanceActive ? "default" : "outline"}
                    className={`h-auto min-h-11 flex-1 min-w-0 whitespace-normal rounded-squircle px-3 py-2.5 text-xs font-bold gap-2 transition-all cursor-pointer ${
                      maintenanceActive
                        ? "bg-primary text-primary-foreground hover:bg-primary-hover shadow-sm"
                        : "border-rose-500/30 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20"
                    }`}
                  >
                    {updateSettingsMutation.isPending ? (
                      <Loader2 className="size-4 animate-spin shrink-0" />
                    ) : (
                      <Lock className="size-4 shrink-0" />
                    )}
                    <span className="min-w-0 break-words leading-relaxed">
                      {maintenanceActive
                        ? isAr
                          ? "حفظ تحديث وقت العودة / رسالة الصيانة"
                          : "Save Updated ETA / Maintenance Notice"
                        : isAr
                          ? "تفعيل الصيانة وقفل دخول الطلاب"
                          : "Enable Maintenance & Lock Student Login"}
                    </span>
                  </Button>

                  {maintenanceActive && (
                    <Button
                      type="button"
                      disabled={
                        updateSettingsMutation.isPending ||
                        portalSettingsQuery.isFetching
                      }
                      onClick={() => {
                        updateSettingsMutation.mutate({
                          studentLoginMaintenance: false,
                          studentLoginMaintenanceEta: null,
                        });
                      }}
                      className="h-auto min-h-11 flex-1 min-w-0 whitespace-normal rounded-squircle px-3 py-2.5 text-xs font-bold gap-2 bg-primary text-primary-foreground hover:bg-primary-hover shadow-sm cursor-pointer"
                    >
                      <Unlock className="size-4 shrink-0" />
                      <span className="min-w-0 break-words leading-relaxed">
                        {isAr
                          ? "إنهاء الصيانة وفتح الدخول للطلاب"
                          : "End Maintenance & Reopen Student Login"}
                      </span>
                    </Button>
                  )}
                </div>
              </Card>
            )}
          </div>
        )}
      </section>

      <section
        aria-labelledby="academic-reset-title"
        className="space-y-4 border-t border-border/70 pt-6"
      >
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-squircle border border-danger/20 bg-danger/10 text-danger">
            <ShieldAlert className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 space-y-1">
            <h2 id="academic-reset-title" className="text-base font-bold">
              {isAr ? "تصفير السجلات الأكاديمية" : "Reset academic records"}
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {isAr
                ? "تؤثر هذه العمليات على جميع الطلاب ولا يمكن التراجع عنها. يلزم تأكيد كل عملية."
                : "These actions affect every student and cannot be undone. Each action requires confirmation."}
            </p>
          </div>
        </div>
        <div className="grid min-w-0 gap-4 @2xl:grid-cols-2 @4xl:grid-cols-3">
          {resetOptions.map(({ id, Icon, title, description, action }) => (
            <Card
              key={id}
              className="flex min-w-0 flex-col gap-4 rounded-2xl border border-danger/20 bg-danger/5 p-4 sm:p-5"
            >
              <div className="flex items-start gap-2.5">
                <Icon
                  className="mt-0.5 size-5 shrink-0 text-danger"
                  aria-hidden="true"
                />
                <h3 className="min-w-0 text-sm font-bold leading-relaxed">
                  {title}
                </h3>
              </div>
              <p className="flex-1 text-sm leading-relaxed text-muted-foreground">
                {description}
              </p>
              <Button
                type="button"
                variant="outline"
                disabled={resetRecordsMutation.isPending}
                onClick={() => setResetModalType(id)}
                className={`h-auto min-h-11 w-full whitespace-normal rounded-squircle px-3 py-2.5 text-sm leading-relaxed ${id === "all" ? "border-danger bg-danger text-danger-foreground hover:bg-danger-hover hover:text-danger-foreground" : "border-danger/30 text-danger hover:border-danger/50 hover:bg-danger/10 hover:text-danger"}`}
              >
                <RotateCcw />
                <span>{action}</span>
              </Button>
            </Card>
          ))}
        </div>
      </section>

      <ConfirmDialog
        dir={isAr ? "rtl" : "ltr"}
        disabled={resetRecordsMutation.isPending}
        open={Boolean(resetModalType)}
        onOpenChange={(open) => {
          if (!open && !resetRecordsMutation.isPending) setResetModalType(null);
        }}
        title={
          resetModalType === "warnings"
            ? isAr
              ? "تأكيد تصفير الإنذارات الأكاديمية لجميع الطلاب"
              : "Confirm Reset Academic Warnings for All Students"
            : resetModalType === "gpa"
              ? isAr
                ? "تأكيد تصفير المعدل التراكمي لجميع الطلاب (0.00)"
                : "Confirm Reset GPA to 0.00 for All Students"
              : isAr
                ? "تأكيد التصفير الشامل للمعدل والإنذارات للجميع"
                : "Confirm Comprehensive Reset of GPA & Warnings"
        }
        description={
          resetModalType === "warnings"
            ? isAr
              ? "هل أنت متأكد من تصفير الإنذارات الأكاديمية لكافة الطلاب المسجلين؟ سيتم تعيين عداد الإنذارات إلى (0) في جميع السجلات."
              : "Are you sure you want to reset academic warnings for all students? Warning counters will be permanently set to 0."
            : resetModalType === "gpa"
              ? isAr
                ? "هل أنت متأكد من تصفير المعدل التراكمي (GPA) لجميع الطلاب؟ سيتم تعيين المعدل إلى (0.00) في الملفات الأكاديمية."
                : "Are you sure you want to reset GPA to 0.00 for all students across the entire institution database?"
              : isAr
                ? "تحذير شديد: سيتم تصفير كلاً من المعدل التراكمي وجميع الإنذارات الأكاديمية لكل الطلاب ليصبح المعدل 0.00 والإنذارات 0. هذا الإجراء لا يمكن التراجع عنه."
                : "Critical Warning: This will reset both cumulative GPA (0.00) and all academic warnings (0) for all students. This action cannot be undone."
        }
        destructive
        confirmLabel={
          resetRecordsMutation.isPending
            ? isAr
              ? "جاري التنفيذ..."
              : "Executing..."
            : resetModalType === "warnings"
              ? isAr
                ? "نعم، صفر جميع الإنذارات (0)"
                : "Yes, Reset Warnings to 0"
              : resetModalType === "gpa"
                ? isAr
                  ? "نعم، صفر المعدل التراكمي (0.00)"
                  : "Yes, Reset GPA to 0.00"
                : isAr
                  ? "نعم، نفذ التصفير الشامل الآن"
                  : "Yes, Reset GPA & Warnings Now"
        }
        cancelLabel={isAr ? "إلغاء" : "Cancel"}
        onConfirm={handleExecuteReset}
      />
    </div>
  );
}
