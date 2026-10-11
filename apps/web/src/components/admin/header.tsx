'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import Image from 'next/image';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import {
  listAdminNotifications,
  deleteAdminNotification,
  clearAllAdminNotifications,
  bulkDeleteAdminNotifications,
  getLocalizedNotification,
} from '@/lib/features/notifications';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Bell,
  Loader2,
  Inbox,
  Send,
  ExternalLink,
  Calendar,
  Check,
  Trash2,
  CheckCheck,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { toast } from 'sonner';
import { SessionTimerWidget } from '@/components/common/session-timer-widget';
import LangToggle from '@/components/ui/LangToggle';
import { Themes } from '@/components/ui/Themes';

const ADMIN_READ_STORAGE_KEY = 'sp_admin_read_notifications_v1';
const ADMIN_DISMISSED_STORAGE_KEY = 'sp_admin_dismissed_notifications_v1';

export default function AdminHeader() {
  const { logout } = useAuth();
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const locale = params.locale as string;

  const isAr = locale === 'ar';
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'unread'>('unread');
  const [readIds, setReadIds] = useState<string[]>([]);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);

  // Load read and dismissed notifications from localStorage
  useEffect(() => {
    try {
      const storedRead = localStorage.getItem(ADMIN_READ_STORAGE_KEY);
      if (storedRead) {
        setReadIds(JSON.parse(storedRead));
      }
      const storedDismissed = localStorage.getItem(ADMIN_DISMISSED_STORAGE_KEY);
      if (storedDismissed) {
        setDismissedIds(JSON.parse(storedDismissed));
      }
    } catch {
      // ignore
    }
  }, []);

  const saveReadIds = (ids: string[]) => {
    setReadIds(ids);
    try {
      localStorage.setItem(ADMIN_READ_STORAGE_KEY, JSON.stringify(ids));
    } catch {
      // ignore
    }
  };

  const saveDismissedIds = (ids: string[]) => {
    setDismissedIds(ids);
    try {
      localStorage.setItem(ADMIN_DISMISSED_STORAGE_KEY, JSON.stringify(ids));
    } catch {
      // ignore
    }
  };

  // Admin notifications query
  const notificationsQuery = useQuery({
    queryKey: queryKeys.notifications.adminList,
    queryFn: listAdminNotifications,
    staleTime: 60 * 1000,
  });

  const rawNotifications = notificationsQuery.data?.items || [];

  // Filter out any locally dismissed notifications
  const notifications = useMemo(
    () => rawNotifications.filter((item) => !dismissedIds.includes(item._id)),
    [rawNotifications, dismissedIds],
  );

  const unreadItems = useMemo(
    () => notifications.filter((item) => !readIds.includes(item._id)),
    [notifications, readIds],
  );

  const displayedNotifications = activeTab === 'unread' ? unreadItems : notifications;
  const unreadCount = unreadItems.length;

  // Delete notification mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAdminNotification(id),
    onSuccess: (_, deletedId) => {
      toast.success(isAr ? 'تم حذف الإشعار بنجاح' : 'Notification deleted');
      saveDismissedIds(Array.from(new Set([...dismissedIds, deletedId])));
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.adminList });
    },
    onError: () => {
      toast.error(isAr ? 'فشل حذف الإشعار' : 'Failed to delete notification');
    },
  });

  const handleMarkAllRead = () => {
    const allIds = Array.from(new Set([...readIds, ...notifications.map((n) => n._id)]));
    saveReadIds(allIds);
    toast.success(isAr ? 'تم تحديد جميع الإشعارات كمقروءة' : 'All marked as read');
  };

  const handleClearRead = async () => {
    const readToClear = notifications.filter((n) => readIds.includes(n._id)).map((n) => n._id);
    if (readToClear.length === 0) {
      toast.info(isAr ? 'لا توجد إشعارات مقروءة لمسحها' : 'No read notifications to clear');
      return;
    }

    const nextDismissed = Array.from(new Set([...dismissedIds, ...readToClear]));
    saveDismissedIds(nextDismissed);
    toast.success(isAr ? 'تم مسح الإشعارات المقروءة' : 'Read notifications cleared');

    try {
      await bulkDeleteAdminNotifications(readToClear);
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.adminList });
    } catch {
      // Optimistic dismissal remains active in localStorage
    }
  };

  const handleClearAll = async () => {
    const allIds = notifications.map((n) => n._id);
    if (allIds.length === 0) return;

    const nextDismissed = Array.from(new Set([...dismissedIds, ...allIds]));
    saveDismissedIds(nextDismissed);
    toast.success(isAr ? 'تم مسح جميع الإشعارات' : 'All notifications cleared');

    try {
      await clearAllAdminNotifications();
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.adminList });
    } catch {
      // Optimistic dismissal remains active
    }
  };

  const toggleItemRead = (id: string) => {
    if (readIds.includes(id)) {
      saveReadIds(readIds.filter((i) => i !== id));
    } else {
      saveReadIds([...readIds, id]);
    }
  };

  return (
    <header className="z-30 bg-card/90 backdrop-blur-xl border border-white/10 shadow-2xl p-3 sm:p-4 pe-14 md:pe-4 rounded-2xl mx-3 mt-3 md:mx-6 md:mt-6 flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4">
      {/* Right/Start section: Logo & Institute Name */}
      <div className="flex items-center gap-3 min-w-0">
        <Image
          src="https://res.cloudinary.com/dkocrxpu4/image/upload/w_112,h_112,c_limit,f_auto,q_auto/v1770685642/logo_k8bbtk.webp"
          alt={isAr ? 'شعار المعهد' : 'Institute Logo'}
          width={44}
          height={44}
          className="object-contain rounded shrink-0"
          priority
        />
        <div className="text-start min-w-0">
          <h2 className="text-sm md:text-base font-bold text-foreground/90 leading-tight truncate">
            {isAr ? 'المعهد العالى للعلوم الادارية المتقدمة والحاسبات' : 'Higher Institute for Advanced Administrative Sciences & Computer'}
          </h2>
          <span className="text-xs text-primary font-semibold flex items-center gap-1.5 mt-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-primary inline-block" />
            {isAr ? 'لوحة تحكم الإدارة الأكاديمية' : 'Admin Control Panel'}
          </span>
        </div>
      </div>

      {/* Left/End section: Session timer, language switcher, themes, notifications */}
      <div className="flex items-center justify-between md:justify-end gap-2 sm:gap-3 w-full md:w-auto pt-2.5 border-t border-white/10 md:border-t-0 md:pt-0">
        {/* Session Expiry Timer widget */}
        <SessionTimerWidget role="admin" />

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <div className="h-6 w-[1px] bg-white/10 hidden md:block" />
          <LangToggle hideLabel />
          <Themes />

          {/* Notifications Slide-out Drawer */}
          <Sheet open={isNotificationsOpen} onOpenChange={setIsNotificationsOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                className="relative flex h-10 w-10 items-center rounded-squircle justify-center border border-border/80 bg-background/80 text-foreground transition-colors hover:text-primary hover:border-primary/50 cursor-pointer shadow-xs"
                aria-label={isAr ? 'الإشعارات' : 'Notifications'}
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 end-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-white animate-pulse z-10">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
            </SheetTrigger>
            <SheetContent
              side={isAr ? 'left' : 'right'}
              className="w-80 sm:w-96 bg-card border-border shadow-2xl backdrop-blur-md p-6 flex flex-col h-full z-[100]"
            >
              <SheetHeader className="mb-3">
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

              {/* Tabs: Unread vs All */}
              <div className="flex border-b border-border/70 mb-3 text-start">
                <button
                  type="button"
                  onClick={() => setActiveTab('unread')}
                  className={cn(
                    "flex-1 pb-2 text-xs font-bold text-center border-b-2 transition-all cursor-pointer",
                    activeTab === 'unread'
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  {isAr ? `غير مقروءة (${unreadCount})` : `Unread (${unreadCount})`}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('all')}
                  className={cn(
                    "flex-1 pb-2 text-xs font-bold text-center border-b-2 transition-all cursor-pointer",
                    activeTab === 'all'
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  {isAr ? `الكل (${notifications.length})` : `All (${notifications.length})`}
                </button>
              </div>

              {/* Actions Header Bar: Mark all read / Clear */}
              <div className="flex items-center justify-between mb-2 px-1">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAllRead}
                    className="text-[11px] font-bold text-primary hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    <span>{isAr ? 'تحديد الكل كمقروء' : 'Mark all read'}</span>
                  </button>
                )}
                <div className="ms-auto flex items-center gap-2">
                  {notifications.some((n) => readIds.includes(n._id)) && (
                    <button
                      type="button"
                      onClick={handleClearRead}
                      className="text-[11px] font-bold text-amber-500 hover:text-amber-600 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="h-3 w-3" />
                      <span>{isAr ? 'مسح المقروء' : 'Clear read'}</span>
                    </button>
                  )}
                  {notifications.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearAll}
                      className="text-[11px] font-bold text-rose-500 hover:text-rose-600 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="h-3 w-3" />
                      <span>{isAr ? 'مسح الكل' : 'Clear all'}</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3 custom-scroll pr-1">
                {notificationsQuery.isLoading ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin text-primary mb-2" />
                    <span className="text-xs">{isAr ? 'جاري تحميل الإشعارات...' : 'Loading notifications...'}</span>
                  </div>
                ) : displayedNotifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                    <Inbox className="w-10 h-10 mb-2 opacity-40 text-muted-foreground" />
                    <p className="text-xs font-medium">
                      {activeTab === 'unread'
                        ? (isAr ? 'لا توجد إشعارات غير مقروءة' : 'No unread notifications')
                        : (isAr ? 'لا توجد إشعارات مسجلة حتى الآن' : 'No notifications recorded yet')}
                    </p>
                    <Link
                      href={`/${locale}/admin/notifications`}
                      onClick={() => setIsNotificationsOpen(false)}
                      className="mt-3 text-xs text-primary hover:underline font-bold"
                    >
                      {isAr ? 'إرسال أول إشعار للطلاب' : 'Send notification to students'}
                    </Link>
                  </div>
                ) : (
                  displayedNotifications.slice(0, 30).map((item) => {
                    const isRead = readIds.includes(item._id);
                    const loc = getLocalizedNotification(item, isAr);
                    const cleanBody = (loc.body || '').replace(/\s*\(undefined\)/g, '').trim();
                    return (
                      <div
                        key={item._id}
                        onClick={() => toggleItemRead(item._id)}
                        className={cn(
                          "p-3.5 transition-all border rounded-xl text-start space-y-2 cursor-pointer shadow-xs",
                          !isRead
                            ? "bg-card border-primary/50 hover:border-primary hover:bg-card/90"
                            : "bg-secondary/40 border-border/80 hover:bg-secondary/70 hover:border-border"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-xs font-bold text-foreground leading-snug flex items-center gap-1.5">
                            {!isRead && (
                              <span className="inline-block h-2 w-2 rounded-full bg-primary shrink-0" />
                            )}
                            <bdi>{loc.title}</bdi>
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
                          <bdi>{cleanBody}</bdi>
                        </p>
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1.5 border-t border-border/50">
                          <time className="font-mono flex items-center gap-1 font-medium">
                            <Calendar className="h-3 w-3 opacity-80" />
                            <bdi>{new Date(item.createdAt).toLocaleDateString(isAr ? 'ar-EG' : 'en-US')}</bdi>
                          </time>
                          <div className="flex items-center gap-2">
                            <span className="capitalize text-[9px] font-semibold text-muted-foreground">
                              {item.deliveryStatus || 'sent'}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteMutation.mutate(item._id);
                              }}
                              disabled={deleteMutation.isPending}
                              title={isAr ? 'حذف الإشعار' : 'Delete notification'}
                              className="p-1 rounded text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {notifications.length > 0 && (
                <div className="pt-3 border-t border-border/70 mt-auto">
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
