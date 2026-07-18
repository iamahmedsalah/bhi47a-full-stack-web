'use client';

import React, { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Bell, Calendar, CheckCheck, Loader2, Sparkles, Inbox, Check, Trash2 } from 'lucide-react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/feedback';
import { getApiErrorMessage } from '@/lib/api';
import {
  listStudentNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  clearAllReadNotifications,
  deleteNotification,
} from '@/lib/features/notifications';
import { queryKeys } from '@/lib/query-keys';
import { motion, AnimatePresence } from 'framer-motion';

export default function StudentNotificationsPage() {
  const t = useTranslations('studentPortal');
  const tCommon = useTranslations('common');
  const queryClient = useQueryClient();
  const router = useRouter();
  const params = useParams();
  const locale = params.locale as string;

  const [activeTab, setActiveTab] = useState<'unread' | 'read'>('unread');

  const notificationsQuery = useQuery({
    queryKey: queryKeys.notifications.studentList,
    queryFn: listStudentNotifications,
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

  const items = notificationsQuery.data?.items || [];
  const isEnglish = tCommon('search') === 'Search...';
  const unreadCount = items.filter((item) => !item.isRead).length;

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

  if (notificationsQuery.isLoading) {
    return <LoadingState title={tCommon('loading')} />;
  }

  if (notificationsQuery.isError) {
    return (
      <ErrorState
        description={getApiErrorMessage(notificationsQuery.error)}
        error={notificationsQuery.error}
        onRetry={() => notificationsQuery.refetch()}
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6" dir={isEnglish ? 'ltr' : 'rtl'}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 text-2xl font-bold text-foreground text-start">
            <Bell className="h-6 w-6 text-primary animate-wiggle" />
            <span>{t('notifications')}</span>
          </h2>
          <p className="text-sm text-muted-foreground text-start">
            {isEnglish
              ? 'Stay updated with the latest alerts and announcements'
              : 'تابع آخر التنبيهات والإعلانات الرسمية المرسلة لحسابك أولاً بأول'}
          </p>
        </div>
        {unreadCount > 0 && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-semibold text-primary self-start sm:self-center">
            <Sparkles className="w-3.5 h-3.5 animate-pulse" />
            <span>
              {isEnglish
                ? `${unreadCount} New Alerts`
                : `${unreadCount} تنبيهات جديدة`}
            </span>
          </div>
        )}
      </div>

      {/* Tabs Selector */}
      <div className="flex border-b border-border/60 text-start">
        <button
          type="button"
          onClick={() => setActiveTab('unread')}
          className={`flex-1 pb-2.5 text-sm font-bold text-center border-b-2 transition-all cursor-pointer ${
            activeTab === 'unread'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          {isEnglish ? `Unread (${unreadCount})` : `غير مقروءة (${unreadCount})`}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('read')}
          className={`flex-1 pb-2.5 text-sm font-bold text-center border-b-2 transition-all cursor-pointer ${
            activeTab === 'read'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          {isEnglish ? 'Read' : 'المقروءة'}
        </button>
      </div>

      {/* Action Bar (Mark All / Clear All) */}
      {activeTab === 'unread' && unreadCount > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => markAllMutation.mutate()}
            disabled={markAllMutation.isPending}
            className="text-xs font-bold text-primary hover:underline flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {markAllMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            <span>{isEnglish ? 'Mark all as read' : 'تحديد الكل كمقروء'}</span>
          </button>
        </div>
      )}

      {activeTab === 'read' && filteredItems.length > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => clearAllReadMutation.mutate()}
            disabled={clearAllReadMutation.isPending}
            className="text-xs font-bold text-red-400 hover:text-red-300 hover:underline flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {clearAllReadMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            <span>{isEnglish ? 'Clear all read' : 'مسح كل المقروءة'}</span>
          </button>
        </div>
      )}

      <div className="relative">
        <AnimatePresence initial={false} mode="popLayout">
          {filteredItems.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <Card className="p-12 text-center bg-card/45 backdrop-blur-sm border-border/70 shadow-[var(--shadow-glow)] hover:border-primary/30 transition-all duration-300">
                <Inbox className="w-12 h-12 text-muted mx-auto mb-3 opacity-50" />
                <p className="text-muted-foreground text-sm">
                  {activeTab === 'unread'
                    ? (isEnglish ? 'No unread notifications' : 'لا يوجد تنبيهات غير مقروءة')
                    : (isEnglish ? 'No read notifications yet' : 'لا يوجد تنبيهات مقروءة بعد')
                  }
                </p>
              </Card>
            </motion.div>
          ) : (
            <motion.div key="list" className="space-y-4">
              {filteredItems.map((item, idx) => (
                <motion.div
                  key={item._id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.18 } }}
                  transition={{ duration: 0.2, delay: idx * 0.02 }}
                >
                  <Card
                    onClick={() => handleNotificationClick(item)}
                    className={`p-5 bg-card/45 backdrop-blur-sm transition-all duration-300 flex gap-4 cursor-pointer hover:bg-card/70 hover:border-primary/30 shadow-[var(--shadow-glow)] rounded-xl ${
                      !item.isRead ? 'border-primary/45' : 'border-border/70'
                    }`}
                  >
                    <div
                      className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${
                        !item.isRead ? 'bg-primary/20 text-primary' : 'bg-secondary/60 text-muted-foreground'
                      }`}
                    >
                      <Bell className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-1">
                          <h3 className="text-sm font-bold leading-snug text-foreground flex flex-wrap items-center gap-2">
                            {item.title}
                            {!item.isRead && (
                              <span className="inline-flex rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-[9px] font-bold text-primary uppercase">
                                {isEnglish ? 'New' : 'جديد'}
                              </span>
                            )}
                          </h3>
                        </div>
                        <time
                          className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground font-mono font-bold"
                          dateTime={item.createdAt}
                        >
                          <Calendar className="h-3.5 w-3.5" />
                          {new Date(item.createdAt).toLocaleDateString(isEnglish ? 'en-US' : 'ar-EG')}
                        </time>
                      </div>
                      <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground text-start">
                        {item.body}
                      </p>

                      {/* Action buttons */}
                      {activeTab === 'unread' ? (
                        <div className="pt-1 text-start">
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={readMutation.isPending && readMutation.variables === item._id}
                            onClick={(e) => {
                              e.stopPropagation();
                              readMutation.mutate(item._id);
                            }}
                            className="flex items-center gap-1.5 h-8 text-xs px-3 font-semibold rounded-squircle bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 transition-all cursor-pointer"
                          >
                            {readMutation.isPending && readMutation.variables === item._id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <CheckCheck className="h-3.5 w-3.5" />
                            )}
                            <span>{isEnglish ? 'Mark as Read' : 'تمت القراءة'}</span>
                          </Button>
                        </div>
                      ) : (
                        <div className="pt-1 text-start">
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={deleteMutation.isPending && deleteMutation.variables === item._id}
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteMutation.mutate(item._id);
                            }}
                            className="flex items-center gap-1.5 h-8 text-xs px-3 font-semibold rounded-squircle bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all cursor-pointer"
                          >
                            {deleteMutation.isPending && deleteMutation.variables === item._id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                            <span>{isEnglish ? 'Delete' : 'حذف'}</span>
                          </Button>
                        </div>
                      )}
                    </div>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
