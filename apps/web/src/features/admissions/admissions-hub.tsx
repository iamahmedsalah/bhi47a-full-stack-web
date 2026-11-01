"use client";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { PERMISSIONS } from "@student-portal/shared";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RestrictedFeature } from "@/components/admin/restricted-feature";
import { PageTitleBanner } from "@/components/ui/page-title-banner";
import {
  GraduationCap,
  Inbox,
  QrCode,
  CalendarRange,
  Users,
  Fingerprint,
  FileSpreadsheet,
} from "lucide-react";
import AdmissionPeriodsPage from "./admission-periods-page";
import StudentCodesPage from "@/features/student-codes/audit-page";
import { AdmissionRequests } from "./requests-panel";
import {
  AdmissionAccessPanel,
  AdmissionGroupsPanel,
} from "./management-panels";
import { AdmissionImportPanel } from "./import-panel";

export function AdmissionsHub({ initialTab }: { initialTab?: string }) {
  const t = useTranslations("admissionWorkflow"),
    locale = useLocale();
  const { user } = useAuth();
  const router = useRouter(),
    params = useSearchParams(),
    pathname = usePathname();
  const can = (p: string) =>
    user?.role === "admin" || Boolean(user?.permissions?.includes(p));
  const tabs = [
    {
      id: "requests",
      icon: <Inbox className="h-4 w-4" />,
      allowed: can(PERMISSIONS.ADMISSIONS_REQUESTS_READ),
      content: <AdmissionRequests />,
    },
    {
      id: "access",
      icon: <QrCode className="h-4 w-4" />,
      allowed: can(PERMISSIONS.ADMISSIONS_ACCESS_MANAGE),
      content: <AdmissionAccessPanel />,
    },
    {
      id: "periods",
      icon: <CalendarRange className="h-4 w-4" />,
      allowed:
        can(PERMISSIONS.ADMISSIONS_PERIODS_READ) ||
        can(PERMISSIONS.ADMISSIONS_PERIODS_MANAGE),
      content: <AdmissionPeriodsPage />,
    },
    {
      id: "groups",
      icon: <Users className="h-4 w-4" />,
      allowed: can(PERMISSIONS.ADMISSIONS_GROUPS_MANAGE),
      content: <AdmissionGroupsPanel />,
    },
    {
      id: "codes",
      icon: <Fingerprint className="h-4 w-4" />,
      allowed: can(PERMISSIONS.STUDENT_CODES_READ),
      content: <StudentCodesPage />,
    },
    {
      id: "imports",
      icon: <FileSpreadsheet className="h-4 w-4" />,
      allowed:
        can(PERMISSIONS.ADMISSIONS_REQUESTS_READ) &&
        can(PERMISSIONS.ADMISSIONS_IMPORT),
      content: <AdmissionImportPanel />,
    },
  ].filter((tab) => tab.allowed);
  const requested = params.get("tab") ?? initialTab;
  const active = tabs.find((tab) => tab.id === requested)?.id ?? tabs[0]?.id;
  if (!active) return <RestrictedFeature featureName={t("title")} />;
  return (
    <div className="space-y-6" dir={locale === "ar" ? "rtl" : "ltr"}>
      <PageTitleBanner
        title={t("title")}
        subtitle={
          t("requestDescription") ||
          (locale === "ar"
            ? "إدارة طلبات الالتحاق ودعوات الدخول وفترات القبول وأكواد الطلاب"
            : "Manage admission requests, QR invitations, periods, and student codes")
        }
        icon={<GraduationCap className="h-6 w-6 text-primary" />}
      />
      <Tabs
        value={active}
        dir={locale === "ar" ? "rtl" : "ltr"}
        onValueChange={(tab) => router.replace(`${pathname}?tab=${tab}`)}
        className="space-y-5"
      >
        <TabsList className="h-auto max-w-full flex-wrap justify-start gap-1 p-1 bg-surface/50 border border-border/50 rounded-xl">
          {tabs.map((tab) => (
            <TabsTrigger
              className="gap-2 px-3 py-1.5 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all"
              key={tab.id}
              value={tab.id}
            >
              {tab.icon}
              <span>{t(`tabs.${tab.id}`)}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map((tab) => (
          <TabsContent
            key={tab.id}
            value={tab.id}
            className="mt-4 outline-none"
          >
            {tab.content}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
