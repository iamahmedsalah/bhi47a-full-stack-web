"use client";

import { Suspense, useState } from "react";
import dynamic from "next/dynamic";
import { useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Bot,
  Calendar,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  GraduationCap,
  GitPullRequest,
} from "lucide-react";
import { PageTitleBanner } from "@/components/ui/page-title-banner";
import { PageSkeletonLoader } from "@/components/ui/page-suspense-fallback";
import { PermissionGuard } from "@/components/ui/permission-guard";
import { useAuth } from "@/providers/auth-provider";
import { cn } from "@/lib/cn";

const GpaRulesPanel = dynamic(() => import("@/features/settings/components/gpa-rules-panel").then(m => m.GpaRulesPanel));
const RegistrationTermsPanel = dynamic(() => import("@/features/settings/components/registration-terms-panel").then(m => m.RegistrationTermsPanel));
const AiSettingsPanel = dynamic(() => import("@/features/settings/components/ai-settings-panel").then(m => m.AiSettingsPanel));
const AdvisingRulesPanel = dynamic(() => import("@/features/settings/components/advising-rules-panel").then(m => m.AdvisingRulesPanel));
const ComplaintRoutingPanel = dynamic(() => import("@/features/settings/components/complaint-routing-panel").then(m => m.ComplaintRoutingPanel));
const PortalControlsPanel = dynamic(() => import("@/features/settings/components/portal-controls-panel").then(m => m.PortalControlsPanel));

function AdminSettingsContent() {
  const params = useParams();
  const locale = params.locale as string;
  const isAr = locale === "ar";
  const t = useTranslations("settings");
  const { user } = useAuth();
  const canAccessRules =
    user?.role === "admin" ||
    Boolean(user?.permissions?.includes("advising.write")) ||
    Boolean(user?.permissions?.includes("study_plan.manage")) ||
    Boolean(user?.permissions?.includes("complaints.manage_settings"));

  const canAccessTerms =
    user?.role === "admin" ||
    Boolean(user?.permissions?.includes("registration.write")) ||
    Boolean(user?.permissions?.includes("complaints.manage_settings"));

  const canAccessComplaintsRouting =
    user?.role === "admin" ||
    Boolean(user?.permissions?.includes("complaints.manage_settings")) ||
    Boolean(user?.permissions?.includes("complaints.read")) ||
    Boolean(user?.permissions?.includes("complaints.write"));

  const canAccessPortal = user?.role === "admin";
  const canAccessAi = user?.role === "admin";

  const tabs = [
    ...(canAccessPortal
      ? [
          {
            id: "portal" as const,
            label: isAr
              ? "إعدادات البوابة والتحكم الأكاديمي"
              : "Portal & Academic Controls",
            icon: SlidersHorizontal,
            description: isAr
              ? "التحكم في ظهور صفحات وخدمات الطلاب، وتصفير السجلات والمعدلات"
              : "Control student portal feature visibility and perform bulk academic resets",
          },
        ]
      : []),
    ...(canAccessRules
      ? [
          {
            id: "rules" as const,
            label: isAr
              ? "قواعد الإرشاد والساعات والمعدل"
              : "Advising & Course Rules",
            icon: GraduationCap,
            description: isAr
              ? "ضوابط التوصية التلقائية، الساعات المعتمدة، وشرائح المعدل التراكمي"
              : "Academic advising policies, credit hours, and GPA limits",
          },
        ]
      : []),
    ...(canAccessTerms
      ? [
          {
            id: "terms" as const,
            label: isAr ? "فصول وسنوات التسجيل" : "Registration Terms",
            icon: Calendar,
            description: isAr
              ? "مواعيد فتح وغلق فصول التسجيل والسنة المعتمدة"
              : "Semesters & authoritative year",
          },
        ]
      : []),
    ...(canAccessComplaintsRouting
      ? [
          {
            id: "complaints" as const,
            label: isAr ? "توزيع الشكاوى والبلاغات" : "Complaint Routing",
            icon: GitPullRequest,
            description: isAr
              ? "التوزيع التلقائي للبلاغات حسب الأقسام وتعيين الموظف المسؤول"
              : "Automated ticket routing by department & designated staff",
          },
        ]
      : []),
    ...(canAccessAi
      ? [
          {
            id: "ai" as const,
            label: isAr ? "المرشد الذكي" : "AI Advisor",
            icon: Bot,
            description: isAr
              ? "إعدادات واستخدام المرشد الآلي للطلاب"
              : "Chatbot & token usage settings",
          },
        ]
      : []),
  ];

  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab") as
    "portal" | "rules" | "terms" | "ai" | "complaints" | null;
  const [selectedTab, setSelectedTab] = useState<
    "portal" | "rules" | "terms" | "ai" | "complaints" | null
  >(null);

  const activeTab =
    selectedTab && tabs.some((t) => t.id === selectedTab)
      ? selectedTab
      : requestedTab && tabs.some((t) => t.id === requestedTab)
        ? requestedTab
        : (tabs[0]?.id ?? "portal");

  const [rulesSubTab, setRulesSubTab] = useState<"advising" | "gpa">(
    "advising",
  );

  return (
    <div
      className="min-w-0 animate-fade-in space-y-5 p-0 sm:p-2 lg:p-6"
      dir={isAr ? "rtl" : "ltr"}
    >
      <PageTitleBanner
        title={t("pageTitle")}
        icon={<Settings className="h-5 w-5" />}
        subtitle={t("pageDescription")}
      >
        <div className="flex flex-wrap items-center gap-2">
          {user?.role === "admin" ? (
            <div className="inline-flex items-center gap-2 rounded-squircle border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary shadow-xs">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              <span>{isAr ? "مدير النظام" : "System administrator"}</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 rounded-squircle border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 shadow-xs">
              <ShieldCheck className="h-4 w-4 text-amber-400" />
              <span>
                {isAr
                  ? `موظف إداري (${user?.permissions?.length ?? 0} صلاحيات مفعلة)`
                  : `Staff Member (${user?.permissions?.length ?? 0} permissions)`}
              </span>
            </div>
          )}
        </div>
      </PageTitleBanner>

      {/* Modern Tabs Navigation Bar */}
      <nav
        aria-label={t("pageTitle")}
        className="grid min-w-0 gap-2 rounded-2xl border border-border/70 bg-card/60 p-2 sm:grid-cols-2 xl:grid-cols-5"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              aria-current={isActive ? "page" : undefined}
              aria-controls="settings-panel"
              onClick={() => setSelectedTab(tab.id)}
              className={cn(
                "flex min-w-0 items-center gap-3 rounded-squircle px-3 py-3 text-start text-xs font-semibold leading-relaxed transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive
                  ? "bg-primary text-primary-foreground shadow-md ring-1 ring-primary/30"
                  : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
              )}
            >
              <Icon
                className={cn(
                  "h-5 w-5 shrink-0",
                  isActive ? "text-primary-foreground" : "text-primary",
                )}
              />
              <span className="min-w-0">{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Tab Panels */}
      <div
        id="settings-panel"
        className="min-w-0 rounded-2xl border border-border/70 bg-card/80 p-3 text-start sm:p-5 lg:p-6"
      >
        {activeTab === "rules" ? (
          <div className="space-y-6">
            {/* Sub-tabs switcher */}
            <div className="grid gap-1 rounded-xl border border-border/70 bg-secondary/15 p-1 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setRulesSubTab("advising")}
                className={cn(
                  "flex min-w-0 items-center gap-2 rounded-squircle px-3 py-3 text-start text-xs font-medium leading-relaxed transition-colors cursor-pointer",
                  rulesSubTab === "advising"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
                )}
              >
                <GraduationCap className="h-4 w-4 shrink-0" />
                <span>
                  {isAr ? "ضوابط التوصية والإرشاد" : "Advising Engine Rules"}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setRulesSubTab("gpa")}
                className={cn(
                  "flex min-w-0 items-center gap-2 rounded-squircle px-3 py-3 text-start text-xs font-medium leading-relaxed transition-colors cursor-pointer",
                  rulesSubTab === "gpa"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
                )}
              >
                <ShieldCheck className="h-4 w-4 shrink-0" />
                <span>
                  {isAr ? "شرائح الساعات والمعدل (GPA)" : "GPA & Course Rules"}
                </span>
              </button>
            </div>

            {rulesSubTab === "advising" ? (
              <AdvisingRulesPanel locale={locale} />
            ) : (
              <GpaRulesPanel locale={locale} />
            )}
          </div>
        ) : activeTab === "portal" ? (
          <PortalControlsPanel locale={locale} />
        ) : activeTab === "terms" ? (
          <RegistrationTermsPanel locale={locale} />
        ) : activeTab === "complaints" ? (
          <ComplaintRoutingPanel locale={locale} />
        ) : (
          <AiSettingsPanel locale={locale} />
        )}
      </div>
    </div>
  );
}

const SETTINGS_PERMISSIONS = [
  "complaints.manage_settings",
  "complaints.read",
  "complaints.write",
  "advising.write",
  "registration.write",
  "study_plan.manage",
];

export default function SettingsPage() {
  return (
    <Suspense fallback={<PageSkeletonLoader />}>
      <PermissionGuard permissions={SETTINGS_PERMISSIONS} anyOf>
        <AdminSettingsContent />
      </PermissionGuard>
    </Suspense>
  );
}
