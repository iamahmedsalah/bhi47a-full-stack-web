"use client";
import React from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  STAFF_ASSIGNABLE_PERMISSIONS,
  STAFF_TYPE_VALUES,
  STAFF_TYPE_DEFAULT_PERMISSIONS,
  type Permission,
  type StaffType,
} from "@student-portal/shared";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CONTROL_PERMISSION_SUBGROUPS,
  CONTROL_ROLE_PRESETS,
  STAFF_PERMISSION_GROUPS,
} from "../permission-groups";
import {
  Users,
  BookOpen,
  GraduationCap,
  Mail,
  MessageSquare,
  Send,
  HelpCircle,
  Upload,
  Calendar,
  Award,
  CheckCircle2,
  FileText,
  FileSpreadsheet,
  Compass,
  Clock,
  CreditCard,
  Folder,
  ShieldCheck,
  TrendingUp,
  UserPlus,
  Hash,
  Sparkles,
  Layers,
} from "lucide-react";

const GROUP_ICONS: Record<string, React.ReactNode> = {
  students: <Users className="h-3.5 w-3.5 text-primary shrink-0" />,
  courses: <BookOpen className="h-3.5 w-3.5 text-primary shrink-0" />,
  grades: <GraduationCap className="h-3.5 w-3.5 text-primary shrink-0" />,
  academicEmails: <Mail className="h-3.5 w-3.5 text-primary shrink-0" />,
  complaints: <MessageSquare className="h-3.5 w-3.5 text-primary shrink-0" />,
  communications: <Send className="h-3.5 w-3.5 text-primary shrink-0" />,
  faqs: <HelpCircle className="h-3.5 w-3.5 text-primary shrink-0" />,
  uploads: <Upload className="h-3.5 w-3.5 text-primary shrink-0" />,
  exams: <Calendar className="h-3.5 w-3.5 text-primary shrink-0" />,
  quizzes: <Award className="h-3.5 w-3.5 text-primary shrink-0" />,
  attendance: <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />,
  registration: <FileText className="h-3.5 w-3.5 text-primary shrink-0" />,
  advising: <Compass className="h-3.5 w-3.5 text-primary shrink-0" />,
  courseSchedules: <Clock className="h-3.5 w-3.5 text-primary shrink-0" />,
  tuition: <CreditCard className="h-3.5 w-3.5 text-primary shrink-0" />,
  courseMaterials: <Folder className="h-3.5 w-3.5 text-primary shrink-0" />,
  staffManagement: (
    <ShieldCheck className="h-3.5 w-3.5 text-primary shrink-0" />
  ),
  admissions: <UserPlus className="h-3.5 w-3.5 text-primary shrink-0" />,
  studentCodes: <Hash className="h-3.5 w-3.5 text-primary shrink-0" />,
  analytics: <TrendingUp className="h-3.5 w-3.5 text-primary shrink-0" />,
  control: <FileSpreadsheet className="h-3.5 w-3.5 text-primary shrink-0" />,
};

export function StaffPermissionFields({
  value,
  onChange,
  disabled = false,
  currentStaffType,
}: {
  value: Permission[];
  onChange: (value: Permission[]) => void;
  disabled?: boolean;
  currentStaffType?: StaffType;
}) {
  const t = useTranslations("staff");
  const locale = useLocale();
  const [search, setSearch] = React.useState("");
  const [section, setSection] = React.useState("all");
  const [selection, setSelection] = React.useState("all");
  const query = search.trim().toLocaleLowerCase(locale).normalize("NFKC");
  const visibleGroups = STAFF_PERMISSION_GROUPS.filter(
    (group) => section === "all" || group.key === section,
  )
    .map((group) => ({
      ...group,
      permissions: group.permissions.filter((permission) => {
        const matchesSelection =
          selection === "all" ||
          (selection === "selected"
            ? value.includes(permission)
            : !value.includes(permission));
        const text = `${t(`permissions.groups.${group.key}`)} ${t(`permissions.labels.${permission.replaceAll(".", "_")}`)} ${permission}`;
        return (
          matchesSelection &&
          text.toLocaleLowerCase(locale).normalize("NFKC").includes(query)
        );
      }),
    }))
    .filter((group) => group.permissions.length > 0);
  const visibleCount = visibleGroups.reduce(
    (count, group) => count + group.permissions.length,
    0,
  );

  return (
    <fieldset
      disabled={disabled}
      className="space-y-4 rounded-xl border border-border/80 bg-card/60 p-4"
    >
      <legend className="flex items-center gap-1.5 px-1.5 text-sm font-bold text-foreground">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <span>{t("table.permissions")}</span>
      </legend>

      {/* Quick Selection by Role Presets */}
      <div className="space-y-2 rounded-xl border border-primary/20 bg-primary/5 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs font-bold text-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span>{t("permissions.presets")}</span>
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled}
              className="h-6 rounded-squircle px-2 text-[11px]"
              onClick={() => onChange([...STAFF_ASSIGNABLE_PERMISSIONS])}
            >
              {t("permissions.selectAll")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={disabled}
              className="h-6 rounded-squircle px-2 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={() => onChange([])}
            >
              {t("permissions.clearAll")}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 pt-1">
          {STAFF_TYPE_VALUES.map((type) => {
            const isCurrent = currentStaffType === type;
            return (
              <Button
                key={type}
                type="button"
                size="sm"
                disabled={disabled}
                variant={isCurrent ? "default" : "secondary"}
                className={`h-7 rounded-squircle text-xs transition-all cursor-pointer ${
                  isCurrent
                    ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                    : "hover:border-primary/40"
                }`}
                onClick={() =>
                  onChange([...STAFF_TYPE_DEFAULT_PERMISSIONS[type]])
                }
              >
                {t(`types.${type}`)}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px_150px]">
        <Input
          aria-label={t("permissions.search")}
          placeholder={t("permissions.search")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          disabled={disabled}
        />
        <Select value={section} onValueChange={setSection} disabled={disabled}>
          <SelectTrigger aria-label={t("permissions.section")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent dir={locale === "ar" ? "rtl" : "ltr"}>
            <SelectItem value="all">{t("permissions.allSections")}</SelectItem>
            {STAFF_PERMISSION_GROUPS.map((group) => (
              <SelectItem key={group.key} value={group.key}>
                {t(`permissions.groups.${group.key}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={selection}
          onValueChange={setSelection}
          disabled={disabled}
        >
          <SelectTrigger aria-label={t("permissions.selection")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent dir={locale === "ar" ? "rtl" : "ltr"}>
            <SelectItem value="all">
              {t("permissions.allPermissions")}
            </SelectItem>
            <SelectItem value="selected">
              {t("permissions.selectedOnly")}
            </SelectItem>
            <SelectItem value="unselected">
              {t("permissions.unselectedOnly")}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <p role="status" className="text-xs text-muted-foreground">
        {t("permissions.visibleCount", {
          count: visibleCount,
          total: STAFF_ASSIGNABLE_PERMISSIONS.length,
        })}
      </p>
      {/* Group selection affects only the permissions visible under the filters. */}
      <div className="space-y-3">
        {visibleGroups.length === 0 && (
          <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
            {t("permissions.noMatches")}
          </p>
        )}
        {visibleGroups.map((group) => {
          const groupCount = group.permissions.filter((p) =>
            value.includes(p),
          ).length;
          const allChecked =
            groupCount === group.permissions.length &&
            group.permissions.length > 0;

          return (
            <div
              key={group.key}
              className="space-y-2 rounded-xl border border-border/50 bg-card/40 p-3"
            >
              <div className="flex items-center justify-between border-b border-border/40 pb-1.5">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  {GROUP_ICONS[group.key] ?? (
                    <Layers className="h-3.5 w-3.5 text-primary shrink-0" />
                  )}
                  <span>{t(`permissions.groups.${group.key}`)}</span>
                  <span className="text-[10px] text-muted-foreground font-normal">
                    ({groupCount}/{group.permissions.length})
                  </span>
                </h3>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    if (allChecked) {
                      onChange(
                        value.filter(
                          (p) =>
                            !group.permissions.some(
                              (permission) => permission === p,
                            ),
                        ),
                      );
                    } else {
                      const next = new Set([...value, ...group.permissions]);
                      onChange(Array.from(next));
                    }
                  }}
                  className="text-[10px] text-primary hover:underline font-medium cursor-pointer"
                >
                  {allChecked
                    ? t("permissions.clearAll")
                    : t("permissions.selectAll")}
                </button>
              </div>

              {group.key === "control" ? (
                <div className="space-y-3 pt-1">
                  {/* One-click Control Role Presets */}
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-2.5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-[11px] font-bold text-foreground">
                        <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span>
                          {locale === "ar"
                            ? "قوالب صلاحيات الكنترول السريعة (تُحدّث صلاحيات الكنترول فقط)"
                            : "Quick Control Role Presets (updates Control permissions only)"}
                        </span>
                      </span>
                    </div>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {CONTROL_ROLE_PRESETS.map((preset) => {
                        const allControlPerms =
                          STAFF_PERMISSION_GROUPS.find(
                            (g) => g.key === "control",
                          )?.permissions ?? [];
                        const selectedControlPerms = value.filter((p) =>
                          allControlPerms.includes(p),
                        );
                        const isExactMatch =
                          selectedControlPerms.length ===
                            preset.permissions.length &&
                          preset.permissions.every((p) =>
                            selectedControlPerms.includes(p),
                          );
                        return (
                          <button
                            key={preset.key}
                            type="button"
                            disabled={disabled}
                            onClick={() => {
                              const nonControl = value.filter(
                                (p) => !allControlPerms.includes(p),
                              );
                              onChange([...nonControl, ...preset.permissions]);
                            }}
                            className={`flex flex-col items-start gap-0.5 rounded-squircle border p-2 text-start transition-all cursor-pointer ${
                              isExactMatch
                                ? "border-primary bg-primary/15 text-foreground shadow-xs"
                                : "border-border/70 bg-background/60 hover:border-primary/40 hover:bg-primary/5"
                            }`}
                          >
                            <span className="text-xs font-bold text-foreground">
                              {locale === "ar"
                                ? preset.labelAr
                                : preset.labelEn}
                            </span>
                            <span className="text-[10px] text-muted-foreground leading-snug">
                              {locale === "ar"
                                ? preset.descriptionAr
                                : preset.descriptionEn}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Grouped Control Sub-sections */}
                  {CONTROL_PERMISSION_SUBGROUPS.map((subgroup) => {
                    const visibleSubPerms = subgroup.permissions.filter((p) =>
                      group.permissions.includes(p),
                    );
                    if (visibleSubPerms.length === 0) return null;
                    return (
                      <div
                        key={subgroup.key}
                        className="space-y-1.5 rounded-xl border border-border/40 bg-background/30 p-2.5"
                      >
                        <div className="text-[11px] font-bold text-primary">
                          {locale === "ar"
                            ? subgroup.titleAr
                            : subgroup.titleEn}
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {visibleSubPerms.map((permission) => {
                            const checked = value.includes(permission);
                            return (
                              <label
                                key={permission}
                                className={`flex cursor-pointer items-start gap-2.5 rounded-squircle border p-2 text-xs transition-all select-none ${
                                  checked
                                    ? "border-primary/50 bg-primary/10 text-foreground font-medium shadow-xs"
                                    : "border-border/60 bg-background/40 hover:border-border hover:bg-secondary/30 text-muted-foreground"
                                }`}
                              >
                                <Checkbox
                                  checked={checked}
                                  disabled={disabled}
                                  onCheckedChange={(c) =>
                                    onChange(
                                      c === true
                                        ? [...value, permission]
                                        : value.filter(
                                            (item) => item !== permission,
                                          ),
                                    )
                                  }
                                  className="mt-0.5"
                                />
                                <span className="leading-snug">
                                  {t(
                                    `permissions.labels.${permission.replaceAll(".", "_")}`,
                                  )}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {group.permissions.map((permission) => {
                    const checked = value.includes(permission);
                    return (
                      <label
                        key={permission}
                        className={`flex cursor-pointer items-start gap-2.5 rounded-squircle border p-2 text-xs transition-all select-none ${
                          checked
                            ? "border-primary/50 bg-primary/10 text-foreground font-medium shadow-xs"
                            : "border-border/60 bg-background/40 hover:border-border hover:bg-secondary/30 text-muted-foreground"
                        }`}
                      >
                        <Checkbox
                          checked={checked}
                          disabled={disabled}
                          onCheckedChange={(c) =>
                            onChange(
                              c === true
                                ? [...value, permission]
                                : value.filter((item) => item !== permission),
                            )
                          }
                          className="mt-0.5"
                        />
                        <span className="leading-snug">
                          {t(
                            `permissions.labels.${permission.replaceAll(".", "_")}`,
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
