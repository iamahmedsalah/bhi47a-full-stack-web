'use client';

import React, { useState, useEffect } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import Image from 'next/image';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { listAdminNotifications } from '@/lib/features/notifications';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Bell, Clock, Loader2, Inbox, Send, ExternalLink, Calendar } from 'lucide-react';

import { SessionTimerWidget } from '@/components/common/session-timer-widget';

export default function AdminHeader() {
  const { logout } = useAuth();
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const locale = params.locale as string;

  const isAr = locale === 'ar';
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  // Admin notifications query
  const notificationsQuery = useQuery({
    queryKey: queryKeys.notifications.adminList,
    queryFn: listAdminNotifications,
    staleTime: 60 * 1000,
  });

  const notifications = notificationsQuery.data?.items || [];
  const notificationCount = notifications.length;

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
        <SessionTimerWidget role="admin" />

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          {/* Notifications Slide-out Drawer */}
          <Sheet open={isNotificationsOpen} onOpenChange={setIsNotificationsOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                className="relative flex h-10 w-10 items-center rounded-squircle justify-center border border-white/10 bg-black/20 text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
                aria-label={isAr ? 'الإشعارات' : 'Notifications'}
              >
                <Bell className="h-4 w-4" />
                {notificationCount > 0 && (
                  <span className="absolute top-1.5 end-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-white animate-pulse z-10">
                    {notificationCount > 9 ? '9+' : notificationCount}
                  </span>
                )}
              </button>
            </SheetTrigger>
            <SheetContent
              side={isAr ? 'left' : 'right'}
              className="w-80 sm:w-96 bg-card/95 border-border shadow-2xl backdrop-blur-md p-6 flex flex-col h-full z-[100]"
            >
              <SheetHeader className="mb-4">
                <div className="flex items-center justify-between">
                  <SheetTitle className="text-lg font-bold text-foreground text-start flex items-center gap-2">
                    <Bell className="h-5 w-5 text-primary animate-wiggle" />
                    <span>{isAr ? 'إشعارات النظام' : 'Notifications'}</span>
                  </SheetTitle>
                  <Link
                    href={`/${locale}/admin/notifications`}
                    onClick={() => setIsNotificationsOpen(false)}
                    className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-1"
                  >
                    <span>{isAr ? 'إرسال إشعار' : 'Send'}</span>
                    <Send className="h-3 w-3" />
                  </Link>
                </div>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto space-y-3 custom-scroll pr-1">
                {notificationsQuery.isLoading ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin text-primary mb-2" />
                    <span className="text-xs">{isAr ? 'جاري تحميل الإشعارات...' : 'Loading notifications...'}</span>
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                    <Inbox className="w-10 h-10 mb-2 opacity-40 text-muted-foreground" />
                    <p className="text-xs font-medium">
                      {isAr ? 'لا توجد إشعارات مسجلة حتى الآن' : 'No notifications recorded yet'}
                    </p>
                    <Link
                      href={`/${locale}/admin/notifications`}
                      onClick={() => setIsNotificationsOpen(false)}
                      className="mt-3 text-xs text-primary hover:underline font-bold"
                    >
                      {isAr ? 'إرسال أول إشعار للطلاب' : 'Send first notification to students'}
                    </Link>
                  </div>
                ) : (
                  notifications.slice(0, 15).map((item) => (
                    <div
                      key={item._id}
                      className="p-3.5 bg-card/45 backdrop-blur-sm transition-all border border-border/70 rounded-xl text-start hover:bg-card/80 hover:border-primary/30 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-xs font-bold text-foreground leading-snug">
                          {item.title}
                        </h4>
                        <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                          {item.targetType === 'all'
                            ? (isAr ? 'الجميع' : 'All')
                            : item.targetType === 'level'
                            ? (isAr ? `الفرقة ${item.targetLevel || ''}` : `Level ${item.targetLevel || ''}`)
                            : (isAr ? `طالب: ${item.targetStudentId?.studentCode || ''}` : `Student: ${item.targetStudentId?.studentCode || ''}`)}
                        </span>
                      </div>
                      <p className="text-[11px] leading-relaxed text-muted-foreground line-clamp-3">
                        {item.body}
                      </p>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground/80 pt-1 border-t border-white/5">
                        <time className="font-mono flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(item.createdAt).toLocaleDateString(isAr ? 'ar-EG' : 'en-US')}
                        </time>
                        <span className="capitalize text-[9px] text-muted-foreground">
                          {item.deliveryStatus || 'sent'}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {notifications.length > 0 && (
                <div className="pt-3 border-t border-white/10 mt-auto">
                  <Link
                    href={`/${locale}/admin/notifications`}
                    onClick={() => setIsNotificationsOpen(false)}
                    className="w-full flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-bold rounded-lg bg-primary/15 text-primary hover:bg-primary/25 transition-colors text-center"
                  >
                    <span>{isAr ? 'عرض وإدارة جميع الإشعارات' : 'View all notifications'}</span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </div>
              )}
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
