'use client';

import React, { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Inbox, Calendar, Loader2, Check, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { queryKeys } from '@/lib/query-keys';
import { 
  listStudentNotifications, 
  markNotificationRead, 
  markAllNotificationsRead, 
  deleteNotification, 
  clearAllReadNotifications 
} from '@/lib/features/notifications';
import { useAuth } from '@/providers/auth-provider';
import { cn } from '@/lib/cn';
import Themes from '@/components/ui/Themes';
import LangToggle from '@/components/ui/LangToggle';
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

export default function StudentHeader() {
  const { user } = useAuth();
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const locale = params.locale as string;
  const isAr = locale === 'ar';

  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'unread' | 'read'>('unread');

  const notificationsQuery = useQuery({
    queryKey: queryKeys.notifications.studentList,
    queryFn: listStudentNotifications,
    enabled: !!user && user.role === 'student',
    refetchInterval: 30 * 1000, // Poll every 30 seconds
  });

  const readMutation = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: (updatedItem) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.notifications.studentList,
      });
      queryClient.setQueryData<any>(
        queryKeys.notifications.studentList,
        (oldData: any) => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            items: oldData.items.map((item: any) =>
              item._id === updatedItem?._id || item._id === (updatedItem as any)?.data?._id
                ? { ...item, isRead: true }
                : item
            ),
          };
        }
      );
    },
  });

  const markAllMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.notifications.studentList,
      });
      queryClient.setQueryData<any>(
        queryKeys.notifications.studentList,
        (oldData: any) => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            items: oldData.items.map((item: any) => ({ ...item, isRead: true })),
          };
        }
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteNotification,
    onSuccess: (deletedItem) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.notifications.studentList,
      });
      queryClient.setQueryData<any>(
        queryKeys.notifications.studentList,
        (oldData: any) => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            items: oldData.items.filter((item: any) => 
              item._id !== deletedItem?._id && item._id !== (deletedItem as any)?.data?._id
            ),
          };
        }
      );
    },
  });

  const clearAllReadMutation = useMutation({
    mutationFn: clearAllReadNotifications,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.notifications.studentList,
      });
      queryClient.setQueryData<any>(
        queryKeys.notifications.studentList,
        (oldData: any) => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            items: oldData.items.filter((item: any) => !item.isRead),
          };
        }
      );
    },
  });

  const unreadCount = useMemo(() => {
    return notificationsQuery.data?.items?.filter((n) => !n.isRead).length || 0;
  }, [notificationsQuery.data]);

  const items = notificationsQuery.data?.items || [];

  const filteredItems = useMemo(() => {
    if (activeTab === 'unread') {
      return items.filter((item) => !item.isRead);
    } else {
      return items.filter((item) => item.isRead);
    }
  }, [items, activeTab]);

  const handleNotificationClick = (item: any) => {
    if (!item.isRead) {
      readMutation.mutate(item._id);
    }
    
    setIsOpen(false);
    
    const metaType = item.meta?.type;
    if (metaType === 'complaint_reply' || metaType === 'complaint_status') {
      const ticket = item.meta?.ticketNumber;
      router.push(`/${locale}/dashboard/complaints${ticket ? `?ticket=${ticket}` : ''}`);
    } else if (metaType === 'grade_publish') {
      router.push(`/${locale}/dashboard/results`);
    } else if (metaType === 'attendance_publish') {
      router.push(`/${locale}/dashboard/attendance`);
    } else if (metaType === 'exam_schedule_publish') {
      router.push(`/${locale}/dashboard/exam-schedule`);
    }
  };

  return (
    <header className="sticky top-2 z-30 bg-card/90 backdrop-blur-xl border border-white/10 shadow-2xl p-4 pe-16 md:pe-4 rounded-squircle mx-4 mt-4 md:mx-6 md:mt-6 flex flex-col md:flex-row items-center justify-between gap-4">
      {/* Right/Start section: Logo & Institute Name */}
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
            {isAr ? 'بوابة الطالب الإلكترونية' : 'Student Portal'}
          </span>
        </div>
      </div>

      {/* Left/End section: Release notes, notifications drawer, theme/lang switches */}
      <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
        <div className="flex items-center gap-4">
          {/* Notifications Slide-out Drawer */}
          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                className="relative flex h-10 w-10 items-center rounded-squircle justify-center border border-white/10 bg-black/20 text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
                aria-label={isAr ? 'الإشعارات' : 'Notifications'}
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 end-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-white animate-pulse z-10">
                    {unreadCount}
                  </span>
                )}
              </button>
            </SheetTrigger>
            <SheetContent 
              side={isAr ? 'left' : 'right'} 
              className="w-80 sm:w-96 bg-card/95 border-border shadow-2xl backdrop-blur-md p-6 flex flex-col h-full z-[100]"
            >
              <SheetHeader className="mb-4">
                <SheetTitle className="text-lg font-bold text-foreground text-start flex items-center gap-2">
                  <Bell className="h-5 w-5 text-primary animate-wiggle" />
                  <span>{isAr ? 'التنبيهات' : 'Notifications'}</span>
                </SheetTitle>
              </SheetHeader>

              {/* Tab Selector */}
              <div className="flex border-b border-white/10 mb-3 text-start">
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
                  onClick={() => setActiveTab('read')}
                  className={cn(
                    "flex-1 pb-2 text-xs font-bold text-center border-b-2 transition-all cursor-pointer",
                    activeTab === 'read' 
                      ? "border-primary text-primary" 
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  {isAr ? 'المقروءة' : 'Read'}
                </button>
              </div>

              {/* Mark All As Read Button (Unread Tab) */}
              {activeTab === 'unread' && unreadCount > 0 && (
                <div className="flex justify-end mb-3">
                  <button
                    type="button"
                    onClick={() => markAllMutation.mutate()}
                    disabled={markAllMutation.isPending}
                    className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {markAllMutation.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Check className="h-3 w-3" />
                    )}
                    <span>{isAr ? 'تحديد الكل كمقروء' : 'Mark all as read'}</span>
                  </button>
                </div>
              )}

              {/* Clear All Read Button (Read Tab) */}
              {activeTab === 'read' && filteredItems.length > 0 && (
                <div className="flex justify-end mb-3">
                  <button
                    type="button"
                    onClick={() => clearAllReadMutation.mutate()}
                    disabled={clearAllReadMutation.isPending}
                    className="text-[10px] font-bold text-red-400 hover:text-red-300 hover:underline flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {clearAllReadMutation.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                    <span>{isAr ? 'مسح كل المقروءة' : 'Clear all read'}</span>
                  </button>
                </div>
              )}
              
              <div className="flex-1 overflow-y-auto space-y-4 custom-scroll pr-1 relative">
                {filteredItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                    <Inbox className="w-10 h-10 mb-2 opacity-50" />
                    <p className="text-xs">
                      {activeTab === 'unread' 
                        ? (isAr ? 'لا يوجد تنبيهات غير مقروءة' : 'No unread notifications')
                        : (isAr ? 'لا يوجد تنبيهات مقروءة بعد' : 'No read notifications yet')
                      }
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 relative">
                    <AnimatePresence initial={false} mode="popLayout">
                      {filteredItems.map((item) => (
                        <motion.div
                          key={item._id}
                          layout
                          initial={{ opacity: 0, scale: 0.95, y: 10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.9, y: -10, transition: { duration: 0.2 } }}
                          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                        >
                          <div
                            onClick={() => handleNotificationClick(item)}
                            className={cn(
                              "p-4 bg-card/45 backdrop-blur-sm transition-all flex gap-3 border rounded-xl text-start cursor-pointer hover:bg-card/70 hover:border-primary/30",
                              !item.isRead
                                ? "border-primary/45 shadow-[0_0_12px_rgba(15,118,110,0.06)]"
                                : "border-border shadow-sm"
                            )}
                          >
                            <div
                              className={cn(
                                "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                                !item.isRead
                                  ? "bg-primary/20 text-primary"
                                  : "bg-secondary/60 text-muted-foreground"
                              )}
                            >
                              <Bell className="h-4 w-4" />
                            </div>
                            
                            <div className="min-w-0 flex-1 space-y-2">
                              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                                <h3 className="text-xs font-bold leading-snug text-foreground flex flex-wrap items-center gap-1.5">
                                  {item.title}
                                  {!item.isRead && (
                                    <span className="inline-flex rounded-full bg-primary/10 border border-primary/20 px-1.5 py-0.5 text-[8px] font-bold text-primary uppercase">
                                      {isAr ? 'جديد' : 'New'}
                                    </span>
                                  )}
                                </h3>
                              </div>
                              <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground">
                                {item.body}
                              </p>
                              
                              <div className="flex items-center justify-between mt-1 text-[9px] text-muted pr-1">
                                <time className="font-mono flex items-center gap-1 font-semibold">
                                  <Calendar className="h-3 w-3" />
                                  {new Date(item.createdAt).toLocaleDateString(isAr ? 'ar-EG' : 'en-US')}
                                </time>
                                
                                {/* Mark As Read Action (Unread Tab) */}
                                {!item.isRead && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      readMutation.mutate(item._id);
                                    }}
                                    disabled={readMutation.isPending}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[9px] font-bold rounded-squircle bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 transition-all cursor-pointer"
                                  >
                                    {readMutation.isPending && readMutation.variables === item._id ? (
                                      <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                    ) : (
                                      <Check className="h-2.5 w-2.5" />
                                    )}
                                    <span>{isAr ? 'تمت القراءة' : 'Mark as read'}</span>
                                  </button>
                                )}

                                {/* Delete Action (Read Tab) */}
                                {item.isRead && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      deleteMutation.mutate(item._id);
                                    }}
                                    disabled={deleteMutation.isPending}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[9px] font-bold rounded-squircle bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all cursor-pointer"
                                    title={isAr ? 'حذف' : 'Delete'}
                                  >
                                    {deleteMutation.isPending && deleteMutation.variables === item._id ? (
                                      <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                    ) : (
                                      <Trash2 className="h-2.5 w-2.5" />
                                    )}
                                    <span>{isAr ? 'حذف' : 'Delete'}</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </SheetContent>
          </Sheet>

          <div className="h-6 w-[1px] bg-white/10 hidden md:block" />
          
          <div className="flex items-center gap-3">
            <LangToggle hideLabel />
            <Themes />
          </div>
        </div>
      </div>
    </header>
  );
}
