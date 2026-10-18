"use client";

import React, { useState } from "react";
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
  Menu,
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
} from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { cn } from "@/lib/cn";
import { useUIStore } from "@/store/ui-store";
import Themes from "@/components/ui/Themes";
import LangToggle from "@/components/ui/LangToggle";
import { PERMISSIONS, type Permission } from "@student-portal/shared";

interface NavItem {
  key: string;
  href: string;
  icon: React.ReactNode;
  permission?: Permission;
  adminOnly?: boolean;
}

export default function AdminSidebar() {
  const t = useTranslations("nav");
  const tHeader = useTranslations("header");
  const params = useParams();
  const pathname = usePathname();
  const { user, logout, isLoggingOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { sidebarOpen, toggleSidebar } = useUIStore();
  const locale = params.locale as string;

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
    ...(user?.role === "admin"
      ? [
          {
            key: "staff",
            href: `/${locale}/admin/staff`,
            icon: <UserCog className="h-5 w-5" />,
            adminOnly: true,
          },
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
  ].filter((item) => {
    if (user?.role === "admin") return true;
    if (item.adminOnly) return false;
    if ('permissions' in item && Array.isArray((item as any).permissions)) {
      return (item as any).permissions.some((p: string) => user?.permissions?.includes(p));
    }
    return !item.permission || user?.permissions?.includes(item.permission);
  });

  const renderContent = (isForceOpen: boolean) => {
    const isSidebarOpen = isForceOpen || sidebarOpen;
    return (
      <div
        className={cn(
          "flex h-full flex-col border border-white/5 bg-card/95 p-4 shadow-(--shadow-glow) backdrop-blur-sm transition-all duration-300",
          isSidebarOpen ? "rounded-2xl" : "rounded-squircle",
        )}
      >
        {/* Sidebar Header with Toggle Icon */}
        <div
          className={cn(
            "flex items-center mb-5",
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
                  {user?.name || (locale === "ar" ? "مدير النظام" : "Admin")}
                </h2>
                <p className="text-[10px] text-muted-foreground">
                  {user?.role === "admin"
                    ? locale === "ar"
                      ? "مدير النظام"
                      : "Admin"
                    : locale === "ar"
                      ? "موظف دعم"
                      : "Support Staff"}{" "}
                  · {locale === "ar" ? "متصل الآن" : "Online"}
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
            "custom-scroll flex-1 w-full space-y-1.5 overflow-y-auto",
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
            "mt-4 border-t border-white/10 pt-4",
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
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed start-4 top-4 z-50 inline-flex h-11 w-11 items-center justify-center rounded-squircle border border-white/10 bg-card/95 text-foreground shadow-(--shadow-glow) backdrop-blur md:hidden cursor-pointer"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      <aside
        className={cn(
          "fixed inset-y-0 start-0 z-40 hidden p-4 md:block transition-all duration-300",
          sidebarOpen ? "w-72" : "w-28",
        )}
      >
        {renderContent(false)}
      </aside>

      <div
        className={cn(
          "fixed inset-0 z-100 md:hidden",
          mobileOpen ? "pointer-events-auto" : "pointer-events-none",
        )}
        aria-hidden={!mobileOpen}
      >
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
          className={cn(
            "absolute inset-0 bg-black/60 transition-opacity cursor-pointer",
            mobileOpen ? "opacity-100" : "opacity-0",
          )}
        />
        <div
          className={cn(
            "absolute inset-y-0 start-0 w-80 max-w-[88vw] bg-[#0d1821] p-4 transition-transform",
            mobileOpen
              ? "translate-x-0"
              : "-translate-x-full rtl:translate-x-full",
          )}
        >
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-md text-white hover:bg-white/10 cursor-pointer"
            aria-label="Close navigation"
          >
            <X className="h-5 w-5" />
          </button>
          {renderContent(true)}
        </div>
      </div>
    </>
  );
}
