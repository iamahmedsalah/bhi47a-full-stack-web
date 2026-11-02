"use client";
import React from "react";
import { useTranslations } from "next-intl";
import {
  STAFF_ASSIGNABLE_PERMISSIONS,
  STAFF_TYPE_VALUES,
  STAFF_TYPE_DEFAULT_PERMISSIONS,
  type Permission,
  type StaffType,
} from "@student-portal/shared";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { STAFF_PERMISSION_GROUPS } from "../permission-groups";
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
  staffManagement: <ShieldCheck className="h-3.5 w-3.5 text-primary shrink-0" />,
  admissions: <UserPlus className="h-3.5 w-3.5 text-primary shrink-0" />,
  studentCodes: <Hash className="h-3.5 w-3.5 text-primary shrink-0" />,
  analytics: <TrendingUp className="h-3.5 w-3.5 text-primary shrink-0" />,
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

      {/* Permission Categories */}
      <div className="space-y-3">
        {STAFF_PERMISSION_GROUPS.map((group) => {
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
                        value.filter((p) => !group.permissions.includes(p)),
                      );
                    } else {
                      const next = new Set([...value, ...group.permissions]);
                      onChange(Array.from(next));
                    }
                  }}
                  className="text-[10px] text-primary hover:underline font-medium cursor-pointer"
                >
                  {allChecked ? t("permissions.clearAll") : t("permissions.selectAll")}
                </button>
              </div>

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
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
