'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useParams, usePathname } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import {
  Award,
  Bell,
  Calendar,
  ClipboardList,
  BookOpenCheck,
  FileText,
  Home,
  Loader2,
  LogOut,
  Mail,
  MapPin,
  Menu,
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const { sidebarOpen, toggleSidebar } = useUIStore();

  const navItems: NavItem[] = [
    { key: 'dashboard', href: `/${locale}/dashboard`, icon: <Home className="h-5 w-5" /> },
    { key: 'profile', href: `/${locale}/dashboard/profile`, icon: <User className="h-5 w-5" /> },
    { key: 'attendance', href: `/${locale}/dashboard/attendance`, icon: <ClipboardList className="h-5 w-5" /> },
    { key: 'registration', href: `/${locale}/dashboard/registration`, icon: <BookOpenCheck className="h-5 w-5" /> },
    { key: 'quizzes', href: `/${locale}/dashboard/quizzes`, icon: <FileText className="h-5 w-5" /> },
    { key: 'results', href: `/${locale}/dashboard/results`, icon: <Award className="h-5 w-5" /> },
    { key: 'academicEmail', href: `/${locale}/dashboard/academic-email`, icon: <Mail className="h-5 w-5" /> },
    { key: 'examSchedule', href: `/${locale}/dashboard/exam-schedule`, icon: <Calendar className="h-5 w-5" /> },
    { key: 'examPlace', href: `/${locale}/dashboard/exam-place`, icon: <MapPin className="h-5 w-5" /> },
    { key: 'complaints', href: `/${locale}/dashboard/complaints`, icon: <MessageCircle className="h-5 w-5" /> },
    { key: 'notifications', href: `/${locale}/dashboard/notifications`, icon: <Bell className="h-5 w-5" /> },
  ];

  const renderContent = (isForceOpen: boolean) => {
    const isSidebarOpen = isForceOpen || sidebarOpen;
    return (
      <div className="flex h-full flex-col rounded-2xl border border-white/5 bg-card/95 p-4 shadow-[var(--shadow-glow)] backdrop-blur-sm transition-all duration-300">
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
                  {user?.name || tHeader('portal')}
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

        <nav className={cn("custom-scroll flex-1 w-full  space-y-1.5 overflow-y-auto", !isSidebarOpen && "flex w-fit flex-col items-center")}>
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
                  'flex items-center rounded-squircle text-sm transition-colors cursor-pointer',
                  isSidebarOpen ? 'w-full gap-3 px-3 py-3' : 'justify-center w-12 h-12',
                  isActive
                    ? 'border border-white/15 bg-secondary/60 font-semibold text-white shadow-sm'
                    : 'text-white/70 hover:bg-secondary/35 hover:text-white',
                )}
                title={!isSidebarOpen ? (item.key === 'registration' ? (locale === 'ar' ? 'تسجيل المواد' : 'Registration') : t(item.key)) : undefined}
              >
                <div className="shrink-0">{item.icon}</div>
                {isSidebarOpen && (
                  <span className="truncate">
                    {item.key === 'registration'
                      ? locale === 'ar'
                        ? 'تسجيل المواد'
                        : 'Registration'
                      : t(item.key)}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className={cn("mt-4 space-y-3 border-t border-white/10 pt-4", !isSidebarOpen && "flex flex-col items-center")}>
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
                <span>{isLoggingOut ? (locale === 'ar' ? 'جاري الخروج...' : 'Logging out...') : tNav('logout')}</span>
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
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed end-4 top-4 z-50 inline-flex h-11 w-11 items-center justify-center rounded-lg border border-white/10 bg-card/95 text-foreground shadow-[var(--shadow-glow)] backdrop-blur md:hidden cursor-pointer"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      <aside className={cn("fixed inset-y-0 end-0 z-40 hidden p-4 md:block transition-all duration-300", sidebarOpen ? "w-72" : "w-28")}>
        {renderContent(false)}
      </aside>

      <div
        className={cn(
          'fixed inset-0 z-[100] md:hidden',
          mobileOpen ? 'pointer-events-auto' : 'pointer-events-none',
        )}
        aria-hidden={!mobileOpen}
      >
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
          className={cn(
            'absolute inset-0 bg-black/60 transition-opacity cursor-pointer',
            mobileOpen ? 'opacity-100' : 'opacity-0',
          )}
        />
        <div
          className={cn(
            'absolute inset-y-0 end-0 w-80 max-w-[88vw] bg-[#0d1821] p-4 transition-transform',
            mobileOpen ? 'translate-x-0' : 'translate-x-full rtl:-translate-x-full',
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
