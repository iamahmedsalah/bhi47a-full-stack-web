"use client";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { ADMISSION_QUEUES, PERMISSIONS, type AdmissionQueue } from "@student-portal/shared";
import { Button } from "@/components/ui/button";
import { useQuery } from '@tanstack/react-query';
import { ProvisionalPolicyPanel } from './provisional-policy-panel';
import { AdmissionFollowupsPanel, LegacyEnrollmentPanel } from './enrollment-admin-tools';
import { getAdmissionEnrollmentSummary } from './workflow-api';
import * as Menu from "@radix-ui/react-dropdown-menu";
import { HelpNote } from "@/components/ui/help-note";
import { RestrictedFeature } from "@/components/admin/restricted-feature";
import { PageTitleBanner } from "@/components/ui/page-title-banner";
import {
  GraduationCap,
  Inbox,
  QrCode,
  CalendarClock,
  UsersRound,
  BadgeCheck,
  FileSpreadsheet,
  ChevronDown,
  Check,
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
  const queues = ADMISSION_QUEUES.filter((value) => value !== 'archive' || can(PERMISSIONS.ADMISSIONS_ARCHIVE_READ));
  const requestedQueue = params.get('queue');
  const queue = requestedQueue === 'all' ? 'all' : queues.find((value) => value === requestedQueue) ?? 'review';
  const changeQueue = (value: AdmissionQueue | 'all') => {
    const next = new URLSearchParams(params.toString());
    next.set('queue', value);
    next.delete('page');
    next.delete('status');
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };
  const tabs = [
    {
      id: "requests",
      icon: <Inbox className="h-4 w-4" />,
      allowed: can(PERMISSIONS.ADMISSIONS_REQUESTS_READ),
      content: <div className="space-y-5">
        <EnrollmentSummary />
        <nav aria-label={t('lifecycle.workQueues')} className="flex flex-wrap gap-2">
          {[...queues, 'all' as const].map((value) => (
            <Button key={value} variant={queue === value ? 'default' : 'outline'} aria-pressed={queue === value} onClick={() => changeQueue(value)}>
              {t(`lifecycle.queue.${value}`)}
            </Button>
          ))}
        </nav>
        <AdmissionRequests queue={queue} />
      </div>,
    },
    {
      id: "access",
      icon: <QrCode className="h-4 w-4" />,
      allowed: can(PERMISSIONS.ADMISSIONS_ACCESS_MANAGE),
      content: <AdmissionAccessPanel />,
    },
    {
      id: "periods",
      icon: <CalendarClock className="h-4 w-4" />,
      allowed:
        can(PERMISSIONS.ADMISSIONS_PERIODS_READ) ||
        can(PERMISSIONS.ADMISSIONS_PERIODS_MANAGE),
      content: <AdmissionPeriodsPage embedded />,
    },
    {
      id: "groups",
      icon: <UsersRound className="h-4 w-4" />,
      allowed: can(PERMISSIONS.ADMISSIONS_GROUPS_MANAGE),
      content: <AdmissionGroupsPanel />,
    },
    {
      id: "codes",
      icon: <BadgeCheck className="h-4 w-4" />,
      allowed: can(PERMISSIONS.STUDENT_CODES_READ),
      content: <StudentCodesPage embedded />,
    },
    {
      id: "imports",
      icon: <FileSpreadsheet className="h-4 w-4" />,
      allowed:
        can(PERMISSIONS.ADMISSIONS_REQUESTS_READ) &&
        can(PERMISSIONS.ADMISSIONS_IMPORT),
      content: <AdmissionImportPanel />,
    },
    { id: 'policy', icon: <GraduationCap className="size-4" />, allowed: can(PERMISSIONS.ADMISSIONS_POLICY_MANAGE), content: <ProvisionalPolicyPanel /> },
    { id: 'legacy', icon: <BadgeCheck className="size-4" />, allowed: can(PERMISSIONS.ADMISSIONS_ENROLLMENT_CONFIRM) && can(PERMISSIONS.STUDENTS_READ), content: <LegacyEnrollmentPanel /> },
    { id: 'contact', icon: <Inbox className="size-4" />, allowed: can(PERMISSIONS.ADMISSIONS_MINISTRY_MANAGE), content: <AdmissionFollowupsPanel kind="contact" /> },
    { id: 'settlement', icon: <FileSpreadsheet className="size-4" />, allowed: can(PERMISSIONS.TUITION_READ), content: <AdmissionFollowupsPanel kind="settlement" /> },
  ].filter((tab) => tab.allowed);
  const requested = params.get("tab") ?? initialTab;
  const active = tabs.find((tab) => tab.id === requested) ?? tabs[0];
  if (!active) return <RestrictedFeature featureName={t("title")} />;
  const show = (tab: string) => {
    if (tab !== active.id) router.replace(`${pathname}?tab=${tab}`, { scroll: false });
  };
  const requestTab = tabs.find((tab) => tab.id === "requests");
  const toolSections = [
    { label: t("lifecycle.toolsSetup"), ids: ["periods", "access", "groups"] },
    { label: t("lifecycle.toolsRecords"), ids: ["codes", "imports"] },
    { label: t("lifecycle.toolsFollowup"), ids: ["policy", "legacy", "contact", "settlement"] },
  ];
  const toolLabel = (id: string) =>
    t(["policy", "legacy", "contact", "settlement"].includes(id) ? `lifecycle.${id}` : `tabs.${id}`);
  return (
    <div className="space-y-6" dir={locale === "ar" ? "rtl" : "ltr"}>
      <PageTitleBanner
        title={t('lifecycle.workspace')}
        subtitle={
          t("requestDescription") ||
          (locale === "ar"
            ? "إدارة طلبات الالتحاق ودعوات الدخول وفترات القبول وأكواد الطلاب"
            : "Manage admission requests, QR invitations, periods, and student codes")
        }
        icon={<GraduationCap className="h-6 w-6 text-primary" />}
      />
      <nav aria-label={t("lifecycle.workspace")} className="flex flex-wrap items-center gap-2 border-b pb-3">
        {requestTab && (
          <Button
            variant={active.id === "requests" ? "default" : "outline"}
            aria-current={active.id === "requests" ? "page" : undefined}
            onClick={() => show("requests")}
          >
            {requestTab.icon}{t("tabs.requests")}
          </Button>
        )}
        {tabs.some((tab) => tab.id !== "requests") && (
          <Menu.Root dir={locale === "ar" ? "rtl" : "ltr"}>
            <Menu.Trigger asChild>
              <Button variant={active.id === "requests" ? "outline" : "secondary"} className="max-w-full">
                <span>{t("lifecycle.tools")}</span>
                {active.id !== "requests" && (
                  <span className="truncate border-s ps-2 font-semibold">{toolLabel(active.id)}</span>
                )}
                <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
              </Button>
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Content align="start" sideOffset={6} className="z-50 max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-56 overflow-y-auto rounded-xl border bg-popover p-1.5 shadow-lg">
                {toolSections.map((section) => {
                  const group = section.ids.flatMap((id) => tabs.filter((tab) => tab.id === id));
                  if (!group.length) return null;
                  return (
                    <Menu.Group key={section.label} className="pb-1">
                      <Menu.Label className="px-2 py-1 text-xs font-semibold text-muted-foreground">{section.label}</Menu.Label>
                      {group.map((tab) => (
                        <Menu.Item key={tab.id} onSelect={() => show(tab.id)} aria-current={active.id === tab.id ? "page" : undefined} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm outline-none data-[highlighted]:bg-primary/10 data-[highlighted]:text-primary">
                          {tab.icon}<span className="flex-1">{toolLabel(tab.id)}</span>
                          {active.id === tab.id && <Check className="size-4 text-primary" aria-hidden="true" />}
                        </Menu.Item>
                      ))}
                    </Menu.Group>
                  );
                })}
              </Menu.Content>
            </Menu.Portal>
          </Menu.Root>
        )}
      </nav>
      {["access", "periods", "groups", "imports"].includes(active.id) && (
        <HelpNote key={active.id} title={t("lifecycle.toolGuide")}>
          <p>{t(`guides.${active.id}`)}</p>
        </HelpNote>
      )}
      <div key={active.id}>{active.content}</div>
    </div>
  );
}

function EnrollmentSummary() {
  const t = useTranslations('admissionWorkflow');
  const locale = useLocale();
  const { user } = useAuth();
  const { data } = useQuery({ queryKey: ['admission-enrollment-summary', user?._id], queryFn: getAdmissionEnrollmentSummary });
  if (typeof data?.official !== 'number') return null;
  const label = { official: 'official', active: 'active', pending: 'queue.transfers', ready: 'queue.ready', archived: 'queue.archive', unverified: 'unverified' } as const;
  return <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
    {(Object.keys(label) as Array<keyof typeof label>).map((key) => <div key={key} className="rounded-xl border bg-card p-3">
      <dt className="text-sm text-muted-foreground">{t(`lifecycle.${label[key]}`)}</dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums">{Number(data[key]).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-GB')}</dd>
    </div>)}
  </dl>;
}
