"use client";

import React, { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useParams, usePathname } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  Award,
  BookOpen,
  BookOpenCheck,
  Calendar,
  Loader2,
  LogOut,
  Mail,
  MessageSquareWarning,
  MessagesSquare,
  Activity,
  Settings,
  Upload,
  Users,
  UserCog,
  X,
  Sidebar,
  LayoutDashboard,
  QrCode,
  HelpCircle,
  CalendarDays,
  ShieldCheck,
  FileSpreadsheet,
} from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { cn } from "@/lib/cn";
import { useUIStore } from "@/store/ui-store";
import Themes from "@/components/ui/Themes";
import LangToggle from "@/components/ui/LangToggle";
import { Sheet, SheetClose, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  PERMISSIONS,
  formatStaffDisplayName,
  getStaffRoleLabel,
  type Permission,
} from "@student-portal/shared";

interface NavItem {
  key: string;
  href: string;
  icon: React.ReactNode;
  permission?: Permission;
  permissions?: Permission[];
  adminOnly?: boolean;
}

export default function AdminSidebar() {
  const t = useTranslations("nav");
  const params = useParams();
  const pathname = usePathname();
  const { user, logout, isLoggingOut } = useAuth();
  const sidebarOpen = useUIStore((state) => state.sidebarOpen);
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);
  const mobileOpen = useUIStore((state) => state.adminMobileSidebarOpen);
  const setMobileOpen = useUIStore((state) => state.setAdminMobileSidebarOpen);
  const locale = params.locale as string;

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)");
    const closeOnDesktop = () => {
      if (desktop.matches) setMobileOpen(false);
    };
    closeOnDesktop();
    desktop.addEventListener("change", closeOnDesktop);
    return () => {
      desktop.removeEventListener("change", closeOnDesktop);
      setMobileOpen(false);
    };
  }, [setMobileOpen]);

  const navItems: NavItem[] = [
    {
      key: "dashboard",
      href: `/${locale}/admin`,
      icon: <LayoutDashboard className="h-5 w-5" />,
    },
    {
      key: "attendance",
      href: `/${locale}/admin/attendance`,
      icon: <QrCode className="h-5 w-5" />,
      permission: PERMISSIONS.ATTENDANCE_READ,
    },
    {
      key: "students",
      href: `/${locale}/admin/students`,
      icon: <Users className="h-5 w-5" />,
      permission: PERMISSIONS.STUDENTS_READ,
    },
    {
      key: "courses",
      href: `/${locale}/admin/courses`,
      icon: <BookOpen className="h-5 w-5" />,
      permission: PERMISSIONS.COURSES_READ,
    },
    {
      key: "quizzes",
      href: `/${locale}/admin/quizzes`,
      icon: <HelpCircle className="h-5 w-5" />,
      permission: PERMISSIONS.QUIZZES_READ,
    },
    {
      key: "registrations",
      href: `/${locale}/admin/academic-advising`,
      icon: <BookOpenCheck className="h-5 w-5" />,
      permission: PERMISSIONS.ADVISING_READ,
    },
    {
      key: "grades",
      href: `/${locale}/admin/grades`,
      icon: <Award className="h-5 w-5" />,
      permission: PERMISSIONS.GRADES_READ,
    },
    {
      key: "control",
      href: `/${locale}/admin/control`,
      icon: <FileSpreadsheet className="h-5 w-5" />,
      permission: PERMISSIONS.CONTROL_ACCESS,
    },
    {
      key: "admissions",
      href: `/${locale}/admin/admissions`,
      icon: <CalendarDays className="h-5 w-5" />,
      permissions: [PERMISSIONS.ADMISSIONS_PERIODS_READ, PERMISSIONS.ADMISSIONS_PERIODS_MANAGE, PERMISSIONS.STUDENT_CODES_READ, PERMISSIONS.ADMISSIONS_REQUESTS_READ, PERMISSIONS.ADMISSIONS_ACCESS_MANAGE, PERMISSIONS.ADMISSIONS_GROUPS_MANAGE],
    },
    {
      key: "academicEmails",
      href: `/${locale}/admin/academic-emails`,
      icon: <Mail className="h-5 w-5" />,
      permission: PERMISSIONS.ACADEMIC_EMAILS_READ,
    },
    {
      key: "complaints",
      href: `/${locale}/admin/complaints`,
      icon: <MessageSquareWarning className="h-5 w-5" />,
      permission: PERMISSIONS.COMPLAINTS_READ,
    },
    {
      key: "lectureSchedules",
      href: `/${locale}/admin/schedules`,
      icon: <CalendarDays className="h-5 w-5" />,
      permission: PERMISSIONS.COURSE_SCHEDULES_READ,
    },
    {
      key: "staff",
      href: `/${locale}/admin/staff`,
      icon: <UserCog className="h-5 w-5" />,
      permission: PERMISSIONS.STAFF_READ,
    },
    ...(user?.role === "admin"
      ? [
          {
            key: "chatAudit",
            href: `/${locale}/admin/chat-audit`,
            icon: <MessagesSquare className="h-5 w-5" />,
            adminOnly: true,
          },
          {
            key: "metrics",
            href: `/${locale}/admin/metrics`,
            icon: <Activity className="h-5 w-5" />,
            adminOnly: true,
          },
        ]
      : []),
    {
      key: "uploads",
      href: `/${locale}/admin/uploads`,
      icon: <Upload className="h-5 w-5" />,
      permission: PERMISSIONS.UPLOADS_IMPORT,
    },
    {
      key: "examSchedules",
      href: `/${locale}/admin/exam-schedules`,
      icon: <Calendar className="h-5 w-5" />,
      permission: PERMISSIONS.EXAM_SCHEDULES_READ,
    },
    {
      key: "faq",
      href: `/${locale}/admin/faqs`,
      icon: <BookOpen className="h-5 w-5" />,
      permission: PERMISSIONS.FAQS_READ,
    },
    {
      key: "settings",
      href: `/${locale}/admin/settings`,
      icon: <Settings className="h-5 w-5" />,
      permissions: [
        PERMISSIONS.COMPLAINTS_MANAGE_SETTINGS,
        PERMISSIONS.ADVISING_WRITE,
        PERMISSIONS.REGISTRATION_WRITE,
        PERMISSIONS.STUDY_PLAN_MANAGE,
      ],
    },
    {
      key: "security",
      href: `/${locale}/admin/security`,
      icon: <ShieldCheck className="h-5 w-5" />,
    },
  ].filter((item) => {
    if (user?.role === "admin") return true;
    if (item.adminOnly) return false;

    // Exam schedules management is strictly administrative (hide from doctor, TA, accountant)
    const staffType = user?.staffType;
    const isAcademicOrFinanceStaff =
      user?.role === "staff" &&
      [
        "doctor",
        "teaching_assistant",
        "assistant_lecturer",
        "ta",
        "accountant",
      ].includes(staffType || "");
    if (isAcademicOrFinanceStaff && item.key === "examSchedules") {
      return false;
    }

    // Doctor specific visibility rules:
    // - Hide grades, academicEmails, and generic uploads
    // - Keep students, courses, quizzes, attendance, complaints, control (when granted)
    const isDoctor = user?.role === "staff" && staffType === "doctor";
    if (isDoctor) {
      if (item.key === "grades" || item.key === "academicEmails" || item.key === "uploads") {
        return false;
      }
    }

    if (item.permissions) {
      return item.permissions.some((p) => user?.permissions?.includes(p));
    }
    return !item.permission || user?.permissions?.includes(item.permission);
  });

  const renderContent = (isForceOpen: boolean) => {
    const isSidebarOpen = isForceOpen || sidebarOpen;
    return (
      <div
        className={cn(
          "flex h-full min-h-0 flex-col overflow-hidden border border-white/5 bg-card/95 p-4 shadow-(--shadow-glow) backdrop-blur-sm transition-all duration-300",
          isSidebarOpen ? "rounded-2xl" : "rounded-squircle",
        )}
      >
        {/* Sidebar Header with Toggle Icon */}
        <div
          className={cn(
            "mb-4 flex shrink-0 items-center gap-2",
            isSidebarOpen ? "justify-between" : "flex-col justify-center gap-3",
          )}
        >
          {isSidebarOpen ? (
            <Link
              href={`/${locale}/admin`}
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-3 min-w-0"
            >
              <Image
                src="/logo.webp"
                alt="Institute Logo"
                width={36}
                height={36}
                className="h-9 w-9 rounded object-contain"
                priority
              />
              <div className="min-w-0 text-start">
                <h2 className="truncate text-xs font-bold leading-tight text-white/95">
                  {locale === "ar" ? "مرحباً، " : "Welcome, "}
                  {user
                    ? formatStaffDisplayName(user, locale)
                    : locale === "ar"
                      ? "مدير النظام"
                      : "Admin"}
                </h2>
                <p className="text-[10px] text-muted-foreground">
                  {getStaffRoleLabel(user?.staffType, user?.role, locale, user?.titlePrefix)} ·{" "}
                  {locale === "ar" ? "متصل الآن" : "Online"}
                </p>
              </div>
            </Link>
          ) : (
            <Image
              src="/logo.webp"
              alt="Institute Logo"
              width={36}
              height={36}
              className="h-9 w-9 rounded object-contain"
              priority
            />
          )}
          {isForceOpen && (
            <SheetClose asChild>
              <button
                type="button"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-squircle text-white hover:bg-white/10"
                aria-label={t("closeNavigation")}
              >
                <X className="h-5 w-5" />
              </button>
            </SheetClose>
          )}
          {!isForceOpen && (
            <button
              onClick={toggleSidebar}
              className="p-1.5 rounded-lg border border-white/10 bg-surface/60 text-white hover:bg-secondary/40 cursor-pointer flex items-center justify-center shrink-0"
              title={isSidebarOpen ? "Collapse Sidebar" : "Expand Sidebar"}
            >
              <Sidebar className="h-4 w-4" />
            </button>
          )}
        </div>

        <nav
          className={cn(
            "custom-scroll min-h-0 flex-1 w-full space-y-1.5 overflow-y-auto overscroll-contain",
            !isSidebarOpen && "w-fit flex flex-col items-center",
          )}
        >
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== `/${locale}/admin` &&
                pathname.startsWith(item.href));

            return (
              <Link
                key={item.key}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center rounded-squircle text-sm transition-colors cursor-pointer",
                  isSidebarOpen
                    ? "w-full gap-3 px-5 py-2.5"
                    : "justify-center w-12 h-12",
                  isActive
                    ? "border border-white/15 bg-secondary/60 font-semibold text-white shadow-sm"
                    : "text-white/70 hover:bg-secondary/35 hover:text-white",
                )}
                title={
                  !isSidebarOpen
                    ? item.key === "registrations"
                      ? locale === "ar"
                        ? "التسجيل والإرشاد"
                        : "Registration"
                      : t(item.key)
                    : undefined
                }
              >
                <div className="shrink-0">{item.icon}</div>
                {isSidebarOpen && (
                  <span className="truncate">
                    {item.key === "registrations"
                      ? locale === "ar"
                        ? "التسجيل والإرشاد"
                        : "Registration"
                      : t(item.key)}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div
          className={cn(
            "mt-4 shrink-0 border-t border-white/10 pt-4",
            !isSidebarOpen && "flex flex-col items-center",
          )}
        >
          <div
            className={cn(
              "mb-4 flex items-center justify-center gap-3",
              isSidebarOpen
                ? "flex-row w-full justify-between px-1"
                : "flex-col",
            )}
          >
            <Themes />
            <LangToggle hideLabel={!isSidebarOpen} />
          </div>
          <button
            onClick={logout}
            disabled={isLoggingOut}
            className={cn(
              "flex items-center justify-center bg-danger rounded-squircle text-white transition-colors hover:bg-danger/90 cursor-pointer disabled:cursor-not-allowed",
              isSidebarOpen
                ? "w-full gap-2 px-3 py-2.5 text-sm font-semibold"
                : "w-12 h-12 p-0",
            )}
            title={!isSidebarOpen ? t("logout") : undefined}
          >
            {isSidebarOpen ? (
              <>
                <span>
                  {isLoggingOut
                    ? locale === "ar"
                      ? "جاري الخروج..."
                      : "Logging out..."
                    : t("logout")}
                </span>
                {isLoggingOut ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LogOut className="h-4 w-4" />
                )}
              </>
            ) : isLoggingOut ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LogOut className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      <aside
        className={cn(
          "fixed inset-y-0 inset-s-0 z-40 hidden p-4 md:block transition-all duration-300",
          sidebarOpen ? "w-72" : "w-28",
        )}
      >
        {renderContent(false)}
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          id="admin-mobile-navigation"
          side={locale === "ar" ? "right" : "left"}
          dir={locale === "ar" ? "rtl" : "ltr"}
          aria-describedby={undefined}
          className="flex h-dvh w-80 max-w-[88vw] flex-col gap-0 overflow-hidden bg-[#0d1821] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden [&>button]:hidden"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            document.getElementById("admin-navigation-trigger")?.focus();
          }}
        >
          <SheetTitle className="sr-only">{t("navigation")}</SheetTitle>
          {renderContent(true)}
        </SheetContent>
      </Sheet>
    </>
  );
}
