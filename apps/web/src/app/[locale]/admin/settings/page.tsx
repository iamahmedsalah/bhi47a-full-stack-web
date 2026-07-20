"use client";

import { Suspense, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Bot, Calendar, Settings, ShieldCheck, Users } from "lucide-react";

import { PageTitleBanner } from "@/components/ui/page-title-banner";
import { PageSkeletonLoader } from "@/components/ui/page-suspense-fallback";
import { PermissionGuard } from "@/components/ui/permission-guard";
import { Button } from "@/components/ui/button";
import { GpaRulesPanel } from "@/features/settings/components/gpa-rules-panel";
import { RegistrationTermsPanel } from "@/features/settings/components/registration-terms-panel";
import { StaffPermissionsPanel } from "@/features/settings/components/staff-permissions-panel";
import { AiSettingsPanel } from "@/features/settings/components/ai-settings-panel";
import { useAuth } from "@/providers/auth-provider";

function AdminSettingsContent() {
  const params = useParams();
  const locale = params.locale as string;
  const isAr = locale === "ar";
  const t = useTranslations("settings");
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<
    "gpa" | "terms" | "permissions" | "ai"
  >("gpa");

  return (
    <div className="animate-fade-in space-y-6 p-2 md:p-6">
      <PageTitleBanner
        title={t("pageTitle")}
        icon={<Settings className="h-5 w-5" />}
        subtitle={t("pageDescription")}
      />

      <div className="flex flex-wrap gap-2 border-b border-border/70 pb-3">
        <Button
          variant={activeTab === "gpa" ? "default" : "ghost"}
          onClick={() => setActiveTab("gpa")}
          className="gap-2 cursor-pointer"
        >
          <ShieldCheck className="h-4 w-4" />
          {isAr ? "قواعد GPA والحدود" : "GPA & Course Rules"}
        </Button>
        {user?.role === "admin" ? (
          <Button
            variant={activeTab === "ai" ? "default" : "ghost"}
            onClick={() => setActiveTab("ai")}
            className="cursor-pointer gap-2"
          >
            <Bot className="h-4 w-4" />
            {t("ai.tab")}
          </Button>
        ) : null}
        <Button
          variant={activeTab === "terms" ? "default" : "ghost"}
          onClick={() => setActiveTab("terms")}
          className="gap-2 cursor-pointer"
        >
          <Calendar className="h-4 w-4" />
          {isAr ? "مواعيد التسجيل" : "Registration Terms"}
        </Button>
        <Button
          variant={activeTab === "permissions" ? "default" : "ghost"}
          onClick={() => setActiveTab("permissions")}
          className="gap-2 cursor-pointer"
        >
          <Users className="h-4 w-4" />
          {isAr ? "إدارة صلاحيات الموظفين" : "Staff Permissions"}
        </Button>
      </div>

      <div className="rounded-xl border border-border/70 bg-card/90 p-6 shadow-(--shadow-glow) text-start">
        {activeTab === "gpa" ? (
          <GpaRulesPanel locale={locale} />
        ) : activeTab === "terms" ? (
          <RegistrationTermsPanel locale={locale} />
        ) : activeTab === "permissions" ? (
          <StaffPermissionsPanel locale={locale} />
        ) : (
          <AiSettingsPanel locale={locale} />
        )}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<PageSkeletonLoader />}>
      <PermissionGuard permission="complaints.manage_settings">
        <AdminSettingsContent />
      </PermissionGuard>
    </Suspense>
  );
}
