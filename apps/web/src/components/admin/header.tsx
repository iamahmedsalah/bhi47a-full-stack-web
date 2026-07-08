'use client';

import React, { useState, useEffect } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import Image from 'next/image';
import Link from 'next/link';
import { Bell, LogOut, Clock, Loader2, Plus } from 'lucide-react';

export default function AdminHeader() {
  const { user, logout, isLoggingOut } = useAuth();
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const locale = params.locale as string;

  const isAr = locale === 'ar';

  // 20 minutes session window (1200 seconds)
  const SESSION_MAX_SECONDS = 20 * 60;
  const [remainingSeconds, setRemainingSeconds] = useState(SESSION_MAX_SECONDS);
  const [prevPathname, setPrevPathname] = useState(pathname);

  const extendSession = () => {
    setRemainingSeconds(SESSION_MAX_SECONDS);
  };

  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setRemainingSeconds(SESSION_MAX_SECONDS);
  }

  // Session timer countdown tick
  useEffect(() => {
    const interval = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          // Handle auto logout
          logout();
          router.push(`/${locale}/login?error=session_expired`);
          return 0;
        }

        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [logout, router, locale]);

  const formatRemaining = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const pct = Math.max(0, Math.min(100, Math.round((remainingSeconds / SESSION_MAX_SECONDS) * 100)));
  const barColor = pct > 60 ? 'bg-green-400' : pct > 20 ? 'bg-yellow-400' : 'bg-red-400';

  return (
    <header className="relative bg-card/90 backdrop-blur-xl border border-white/10 shadow-2xl p-4 rounded-squircle mx-6 mt-6 flex flex-col md:flex-row items-center justify-between gap-4">
      {/* Right section: Logo & Institute Name */}
      <div className="flex items-center gap-4">
        <Image
          src="https://res.cloudinary.com/dkocrxpu4/image/upload/w_112,h_112,c_limit,f_auto,q_auto/v1770685642/logo_k8bbtk.webp"
          alt={isAr ? 'شعار المعهد' : 'Institute Logo'}
          width={48}
          height={48}
          className="object-contain rounded"
          priority
        />
        <div className="text-start">
          <h2 className="text-sm md:text-base font-bold text-foreground/90 leading-tight">
            {isAr ? 'المعهد العالى للعلوم الادارية المتقدمة والحاسبات' : 'Higher Institute for Advanced Administrative Sciences & Computer'}
          </h2>
          <span className="text-xs text-foreground/70">
            {isAr ? 'لوحة تحكم الإدارة' : 'Admin Control Panel'}
          </span>
        </div>
      </div>

      {/* Left section: Session timer, language switcher, logout */}
      <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
        {/* Session Expiry Timer widget */}
        <div 
          onClick={extendSession}
          className="flex items-center gap-2 bg-black/20 px-3 py-1.5 rounded-squircle border border-white/5 cursor-pointer hover:bg-black/30 transition-all"
          title={isAr ? 'انقر لتمديد الجلسة' : 'Click to extend session'}
        >
          <Clock className="w-4 h-4 text-slate-300" />
          <div className="flex flex-col">
            <span className="text-xs font-mono text-white text-center leading-none">
              {formatRemaining(remainingSeconds)}
            </span>
            <div className="w-16 h-1 bg-white/10 rounded-full overflow-hidden mt-1">
              <div className={`${barColor} h-1 rounded-full transition-all duration-1000`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          <Link
            href={`/${locale}/admin/complaints`}
            className="hidden items-center gap-2 rounded-squircle border border-primary/20 bg-primary/10 px-3 py-2 text-xs font-bold text-primary transition-colors hover:bg-primary/20 xl:flex cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            {isAr ? 'إجراء سريع' : 'Quick Action'}
          </Link>

          <button
            type="button"
            className="relative flex h-10 w-10 items-center rounded-squircle justify-center border border-white/10 bg-black/20 text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
            aria-label={isAr ? 'الإشعارات' : 'Notifications'}
          >
            <Bell className="h-4 w-4" />
            <span className="absolute end-2 top-2 h-2 w-2 rounded-full bg-red-400" />
          </button>
        </div>
      </div>
    </header>
  );
}
