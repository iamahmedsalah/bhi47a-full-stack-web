'use client';

import { getUserDisplayName } from "@/lib/user-name";
import React, { useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useParams, usePathname } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { listStudentNotifications } from '@/lib/features/notifications';
import { getPublicPortalSettings, settingsKeys } from '@/features/settings/api';
import {
  Award,
  Calendar,
  CalendarDays,
  ClipboardList,
  BookOpenCheck,
  BookOpen,
  FileText,
  Home,
  Loader2,
  LogOut,
  MapPin,
  MessageCircle,
  User,
  X,
  Sidebar,
} from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { cn } from '@/lib/cn';
import Themes from '@/components/ui/Themes';
import LangToggle from '@/components/ui/LangToggle';
import { useUIStore } from '@/store/ui-store';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';

interface NavItem {
  key: string;
  href: string;
  icon: React.ReactNode;
}

export default function StudentSidebar() {
  const t = useTranslations('studentPortal');
  const tHeader = useTranslations('header');
  const tNav = useTranslations('nav');
  const { user, logout, isLoggingOut } = useAuth();
  const params = useParams();
  const pathname = usePathname();
  const locale = params.locale as string;
  const sidebarOpen = useUIStore((state) => state.sidebarOpen);
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);
  const mobileOpen = useUIStore((state) => state.studentMobileSidebarOpen);
  const setMobileOpen = useUIStore((state) => state.setStudentMobileSidebarOpen);
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 768px)');
    const closeOnDesktop = () => {
      if (desktop.matches) setMobileOpen(false);
    };
    desktop.addEventListener('change', closeOnDesktop);
    return () => {
      desktop.removeEventListener('change', closeOnDesktop);
      setMobileOpen(false);
    };
  }, [setMobileOpen]);

  const notificationsQuery = useQuery({
    queryKey: queryKeys.notifications.studentList,
    queryFn: listStudentNotifications,
    enabled: !!user && user.role === 'student',
    staleTime: 60 * 1000,
    refetchInterval: 120 * 1000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });

  const unreadCount = useMemo(() => {
    return notificationsQuery.data?.items?.filter((n) => !n.isRead).length || 0;
  }, [notificationsQuery.data]);

  const portalSettingsQuery = useQuery({
    queryKey: settingsKeys.publicPortalSettings,
    queryFn: getPublicPortalSettings,
    staleTime: 60 * 1000,
  });

  const registrationVisible =
    portalSettingsQuery.data?.registrationVisible ?? true;
  const syllabiVisible = portalSettingsQuery.data?.syllabiVisible ?? true;

  const navItems: NavItem[] = useMemo(() => {
    return [
      { key: 'dashboard', href: `/${locale}/dashboard`, icon: <Home className="h-5 w-5" /> },
      { key: 'profile', href: `/${locale}/dashboard/profile`, icon: <User className="h-5 w-5" /> },
      { key: 'attendance', href: `/${locale}/dashboard/attendance`, icon: <ClipboardList className="h-5 w-5" /> },
      { key: 'schedules', href: `/${locale}/dashboard/schedules`, icon: <CalendarDays className="h-5 w-5" /> },
      ...(syllabiVisible
        ? [{ key: 'courses', href: `/${locale}/dashboard/courses`, icon: <BookOpen className="h-5 w-5" /> }]
        : []),
      ...(registrationVisible
        ? [
            {
              key: 'registration',
              href: `/${locale}/dashboard/registration`,
              icon: <BookOpenCheck className="h-5 w-5" />,
            },
          ]
        : []),
      { key: 'quizzes', href: `/${locale}/dashboard/quizzes`, icon: <FileText className="h-5 w-5" /> },
      { key: 'results', href: `/${locale}/dashboard/results`, icon: <Award className="h-5 w-5" /> },
      { key: 'examSchedule', href: `/${locale}/dashboard/exam-schedule`, icon: <Calendar className="h-5 w-5" /> },
      { key: 'examPlace', href: `/${locale}/dashboard/exam-place`, icon: <MapPin className="h-5 w-5" /> },
      { key: 'complaints', href: `/${locale}/dashboard/complaints`, icon: <MessageCircle className="h-5 w-5" /> },
    ];
  }, [locale, registrationVisible, syllabiVisible]);

  const renderContent = (isForceOpen: boolean) => {
    const isSidebarOpen = isForceOpen || sidebarOpen;
    return (
      <div className={cn(
        "flex h-full flex-col border border-white/5 bg-card/95 p-4 shadow-[var(--shadow-glow)] backdrop-blur-sm transition-all duration-300",
        isSidebarOpen ? "rounded-3xl" : "rounded-squircle"
      )}>
        {/* Sidebar Header with Toggle Icon */}
        <div className={cn("flex items-center mb-5", isSidebarOpen ? "justify-between" : "flex-col justify-center gap-3")}>
          {isSidebarOpen ? (
            <Link
              href={`/${locale}/dashboard`}
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
              <div className="min-w-0">
                <h2 className="truncate text-xs font-bold leading-tight text-white/95">
                  {getUserDisplayName(user, locale) || tHeader('portal')}
                </h2>
                <p className="truncate text-[10px] text-muted-foreground">{user?.studentCode || tHeader('instituteName')}</p>
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

        <nav className={cn("custom-scroll min-h-0 flex-1 w-full space-y-1.5 overflow-y-auto overscroll-contain", !isSidebarOpen && "flex w-fit flex-col items-center")}>
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.key !== 'dashboard' && pathname.startsWith(item.href));

            return (
              <Link
                key={item.key}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'relative flex items-center rounded-squircle text-sm transition-colors cursor-pointer',
                  isSidebarOpen ? 'w-full gap-3 px-3 py-3' : 'justify-center w-12 h-12',
                  isActive
                    ? 'border border-white/15 bg-secondary/60 font-semibold text-white shadow-sm'
                    : 'text-white/70 hover:bg-secondary/35 hover:text-white',
                )}
                title={!isSidebarOpen ? t(item.key) : undefined}
              >
                <div className="shrink-0">{item.icon}</div>
                {isSidebarOpen && (
                  <span className="truncate">
                    {t(item.key)}
                  </span>
                )}
                {isSidebarOpen && item.key === 'notifications' && unreadCount > 0 && (
                  <span className="ms-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-white shadow-sm animate-pulse">
                    {unreadCount}
                  </span>
                )}
                {!isSidebarOpen && item.key === 'notifications' && unreadCount > 0 && (
                  <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-white animate-pulse">
                    {unreadCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className={cn("mt-3 shrink-0 space-y-3 border-t border-white/10 pt-3", !isSidebarOpen && "flex flex-col items-center")}>
          <div className={cn("flex items-center justify-between", isSidebarOpen ? "w-full px-3 py-1" : "flex-col gap-2")}>
            <LangToggle hideLabel={!isSidebarOpen} />
            <Themes />
          </div>
          <button
            onClick={logout}
            disabled={isLoggingOut}
            className={cn(
              "flex items-center justify-center bg-danger text-white transition-colors duration-200 hover:bg-danger/80 cursor-pointer disabled:cursor-not-allowed rounded-squircle",
              isSidebarOpen ? "w-full gap-2 px-3 py-2 text-sm" : "w-12 h-12"
            )}
            title={!isSidebarOpen ? tNav('logout') : undefined}
          >
            {isSidebarOpen ? (
              <>
                <span>{isLoggingOut ? (locale === 'ar' ? 'جاري تسجيل الخروج...' : 'Logging out...') : tNav('logout')}</span>
                {isLoggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
              </>
            ) : (
              isLoggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      <aside className={cn("fixed inset-y-0 start-0 z-40 hidden p-4 md:block transition-all duration-300", sidebarOpen ? "w-72" : "w-28")}>
        {renderContent(false)}
      </aside>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          id="student-mobile-navigation"
          side={locale === 'ar' ? 'right' : 'left'}
          dir={locale === 'ar' ? 'rtl' : 'ltr'}
          aria-describedby={undefined}
          className="flex h-dvh w-80 max-w-[88vw] flex-col gap-0 overflow-hidden bg-[#0d1821] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden [&>button:last-child]:hidden"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            document.getElementById('student-navigation-trigger')?.focus();
          }}
        >
          <SheetTitle className="sr-only">{tNav('openNavigation')}</SheetTitle>
          <button type="button" onClick={() => setMobileOpen(false)} aria-label={tNav('closeNavigation')} className="mb-2 size-10 self-end rounded-squircle hover:bg-white/10">
            <X className="mx-auto size-5" />
          </button>
          <div className="min-h-0 flex-1">{renderContent(true)}</div>
        </SheetContent>
      </Sheet>
    </>
  );
}
