'use client';

import React, { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import {
  Bell,
  Calendar,
  CheckCheck,
  Loader2,
  Inbox,
  Trash2,
  BookOpenCheck,
  Award,
  ClipboardList,
  ArrowUpRight,
  Filter,
  CheckCircle2,
  Sparkle,
  Megaphone,
} from 'lucide-react';
import Link from 'next/link';
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
import { NotificationDetailsDialog } from '@/components/notifications/notification-details-dialog';

type FilterCategory = 'all' | 'unread' | 'quiz' | 'grade' | 'attendance' | 'system';

export default function StudentNotificationsPage() {
  const t = useTranslations('studentPortal');
  const tCommon = useTranslations('common');
  const queryClient = useQueryClient();
  const router = useRouter();
  const params = useParams();
  const locale = (params?.locale as string) || 'ar';
  const isArabic = locale === 'ar';

  const [activeFilter, setActiveFilter] = useState<FilterCategory>('all');
  const [selectedNotification, setSelectedNotification] = useState<any | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

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
                : item,
            ),
          };
        },
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
        },
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
            items: oldData.items.filter(
              (item: any) =>
                item._id !== deletedItem?._id &&
                item._id !== (deletedItem as any)?.data?._id,
            ),
          };
        },
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
        },
      );
    },
  });

  const rawItems = notificationsQuery.data?.items || [];
  const unreadCount = rawItems.filter((item) => !item.isRead).length;
  const readCount = rawItems.length - unreadCount;

  // Helper function to detect category
  const getItemCategory = (item: any): 'quiz' | 'grade' | 'attendance' | 'system' => {
    const metaType = item.meta?.type || '';
    const title = (item.title || '').toLowerCase();
    if (metaType === 'quiz' || title.includes('quiz') || item.title?.includes('اختبار')) {
      return 'quiz';
    }
    if (
      metaType === 'grade' ||
      metaType === 'grade_publish' ||
      title.includes('grade') ||
      item.title?.includes('نتيجة') ||
      item.title?.includes('درجة')
    ) {
      return 'grade';
    }
    if (
      metaType === 'attendance' ||
      metaType === 'attendance_publish' ||
      title.includes('attendance') ||
      item.title?.includes('حضور')
    ) {
      return 'attendance';
    }
    return 'system';
  };

  // Counts per category
  const counts = useMemo(() => {
    let quiz = 0;
    let grade = 0;
    let attendance = 0;
    let system = 0;
    rawItems.forEach((item) => {
      const cat = getItemCategory(item);
      if (cat === 'quiz') quiz++;
      else if (cat === 'grade') grade++;
      else if (cat === 'attendance') attendance++;
      else system++;
    });
    return { all: rawItems.length, unread: unreadCount, quiz, grade, attendance, system };
  }, [rawItems, unreadCount]);

  // Filtered items
  const filteredItems = useMemo(() => {
    return rawItems.filter((item) => {
      if (activeFilter === 'all') return true;
      if (activeFilter === 'unread') return !item.isRead;
      return getItemCategory(item) === activeFilter;
    });
  }, [rawItems, activeFilter]);

  const handleNotificationClick = (item: any) => {
    if (!item.isRead) {
      readMutation.mutate(item._id);
    }
    setSelectedNotification(item);
    setDetailsOpen(true);
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

  const filterTabs: Array<{ id: FilterCategory; labelAr: string; labelEn: string; icon: any; count: number; colorClass: string }> = [
    {
      id: 'all',
      labelAr: 'كافة الإشعارات',
      labelEn: 'All Alerts',
      icon: Bell,
      count: counts.all,
      colorClass: 'text-primary',
    },
    {
      id: 'unread',
      labelAr: 'غير مقروءة',
      labelEn: 'Unread',
      icon: CheckCircle2,
      count: counts.unread,
      colorClass: 'text-cyan-400',
    },
    {
      id: 'quiz',
      labelAr: 'الاختبارات',
      labelEn: 'Quizzes',
      icon: BookOpenCheck,
      count: counts.quiz,
      colorClass: 'text-purple-400',
    },
    {
      id: 'grade',
      labelAr: 'النتائج والدرجات',
      labelEn: 'Grades',
      icon: Award,
      count: counts.grade,
      colorClass: 'text-amber-400',
    },
    {
      id: 'attendance',
      labelAr: 'الحضور والغياب',
      labelEn: 'Attendance',
      icon: ClipboardList,
      count: counts.attendance,
      colorClass: 'text-emerald-400',
    },
    {
      id: 'system',
      labelAr: 'إعلانات المعهد',
      labelEn: 'Notices',
      icon: Megaphone,
      count: counts.system,
      colorClass: 'text-teal-400',
    },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6 animate-fade-in" dir={isArabic ? 'rtl' : 'ltr'}>
      {/* ─── Hero Header ─── */}
      <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-br from-card/90 via-card/60 to-primary/5 p-6 backdrop-blur-md shadow-[var(--shadow-glow)]">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start sm:items-center gap-4 text-start">
            <div className="relative flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl bg-primary/15 border border-primary/25 text-primary shadow-inner">
              <Bell className="h-6 w-6" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -end-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-black text-white ring-2 ring-background animate-pulse">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-foreground tracking-tight">
                  {isArabic ? 'الإشعارات والتنبيهات الأكاديمية' : 'Academic Notifications & Alerts'}
                </h1>
                {unreadCount > 0 && (
                  <span className="rounded-full bg-primary/20 border border-primary/30 px-2.5 py-0.5 text-xs font-bold text-primary">
                    {isArabic ? `${unreadCount} جديد` : `${unreadCount} New`}
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground">
                {isArabic
                  ? 'متابعة فورية لكافة التنبيهات، مواعيد الاختبارات، رصد الدرجات، وسجلات الحضور الرسمية.'
                  : 'Real-time updates for course quizzes, exam grades, attendance logs, and institute announcements.'}
              </p>
            </div>
          </div>

          {/* Quick Header Actions */}
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
            {unreadCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => markAllMutation.mutate()}
                disabled={markAllMutation.isPending}
                className="h-9 px-3.5 text-xs font-bold rounded-squircle bg-primary/10 border-primary/25 text-primary hover:bg-primary/20 transition-all cursor-pointer flex items-center gap-1.5"
              >
                {markAllMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCheck className="h-4 w-4" />
                )}
                <span>{isArabic ? 'تحديد الكل كمقروء' : 'Mark all read'}</span>
              </Button>
            )}

            {readCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => clearAllReadMutation.mutate()}
                disabled={clearAllReadMutation.isPending}
                className="h-9 px-3 text-xs font-medium rounded-squircle text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all cursor-pointer flex items-center gap-1.5"
              >
                {clearAllReadMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                <span>{isArabic ? 'مسح المقروءة' : 'Clear read'}</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ─── Filter Pills Bar ─── */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {filterTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeFilter === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveFilter(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-squircle text-xs font-bold transition-all shrink-0 cursor-pointer border ${
                isActive
                  ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                  : 'bg-card/70 border-border/70 text-muted-foreground hover:text-foreground hover:bg-card/90'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-primary-foreground' : tab.colorClass}`} />
              <span>{isArabic ? tab.labelAr : tab.labelEn}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  isActive
                    ? 'bg-primary-foreground/20 text-primary-foreground'
                    : 'bg-secondary text-muted-foreground'
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ─── Notifications List ─── */}
      <div className="relative">
        <AnimatePresence initial={false} mode="popLayout">
          {filteredItems.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <Card className="p-12 text-center bg-card/45 backdrop-blur-sm border-border/70 shadow-[var(--shadow-glow)]">
                <div className="w-14 h-14 rounded-2xl bg-secondary/40 border border-border/60 flex items-center justify-center mx-auto mb-3.5 text-muted-foreground">
                  <Inbox className="w-7 h-7 opacity-60" />
                </div>
                <h3 className="font-bold text-base text-foreground mb-1">
                  {isArabic ? 'لا توجد تنبيهات حالياً' : 'No notifications in this category'}
                </h3>
                <p className="text-muted-foreground text-xs max-w-sm mx-auto">
                  {isArabic
                    ? 'ستظهر هنا كافة الإشعارات والإنذارات الأكاديمية ومواعيد الاختبارات فور إعلانها.'
                    : 'All notifications, quiz reminders, and official notices will appear here once published.'}
                </p>
              </Card>
            </motion.div>
          ) : (
            <motion.div key="list" className="space-y-3">
              {filteredItems.map((item, idx) => {
                const catType = getItemCategory(item);

                // Category styling configs
                const categoryConfig = (() => {
                  switch (catType) {
                    case 'quiz':
                      return {
                        label: isArabic ? 'اختبار أكاديمي' : 'Course Quiz',
                        icon: <BookOpenCheck className="h-5 w-5" />,
                        accentBorder: 'border-s-4 border-s-purple-500',
                        badgeClass: 'bg-purple-500/10 text-purple-400 border-purple-500/25',
                        iconBgClass: 'bg-purple-500/15 text-purple-400 border border-purple-500/25',
                        actionLink: `/${locale}/dashboard/quizzes`,
                        actionLabel: isArabic ? 'الذهاب للاختبار' : 'Take Quiz',
                      };
                    case 'grade':
                      return {
                        label: isArabic ? 'الدرجات والنتائج' : 'Academic Grade',
                        icon: <Award className="h-5 w-5" />,
                        accentBorder: 'border-s-4 border-s-amber-500',
                        badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/25',
                        iconBgClass: 'bg-amber-500/15 text-amber-400 border border-amber-500/25',
                        actionLink: `/${locale}/dashboard/results`,
                        actionLabel: isArabic ? 'عرض كشف الدرجات' : 'View Grades',
                      };
                    case 'attendance':
                      return {
                        label: isArabic ? 'الحضور والغياب' : 'Attendance Log',
                        icon: <ClipboardList className="h-5 w-5" />,
                        accentBorder: 'border-s-4 border-s-emerald-500',
                        badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
                        iconBgClass: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25',
                        actionLink: `/${locale}/dashboard/attendance`,
                        actionLabel: isArabic ? 'سجل الحضور' : 'Attendance Log',
                      };
                    default:
                      return {
                        label: isArabic ? 'تنبيه أكاديمي' : 'Notice',
                        icon: <Bell className="h-5 w-5" />,
                        accentBorder: 'border-s-4 border-s-primary',
                        badgeClass: 'bg-primary/10 text-primary border-primary/25',
                        iconBgClass: 'bg-primary/15 text-primary border border-primary/20',
                        actionLink: item.meta?.type === 'exam_schedule_publish'
                          ? `/${locale}/dashboard/exam-schedule`
                          : null,
                        actionLabel: item.meta?.type === 'exam_schedule_publish'
                          ? (isArabic ? 'جدول الامتحانات' : 'Exam Schedule')
                          : null,
                      };
                  }
                })();

                const titleText = isArabic
                  ? item.meta?.titleAr || (item.title?.includes(' | ') ? item.title.split(' | ')[0].trim() : item.title)
                  : item.meta?.titleEn || (item.title?.includes(' | ') ? item.title.split(' | ')[1].trim() : item.title);

                const bodyText = isArabic
                  ? item.meta?.bodyAr || (item.body?.includes('\n') ? item.body.split('\n')[0].trim() : item.body)
                  : item.meta?.bodyEn || (item.body?.includes('\n') ? item.body.split('\n')[1].trim() : item.body);

                return (
                  <motion.div
                    key={item._id}
                    layout
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
                    transition={{ duration: 0.2, delay: idx * 0.02 }}
                  >
                    <Card
                      onClick={() => handleNotificationClick(item)}
                      className={`group relative p-4 sm:p-5 bg-card/65 backdrop-blur-sm transition-all duration-300 flex flex-col sm:flex-row gap-4 cursor-pointer hover:bg-card/90 hover:border-primary/40 shadow-sm rounded-2xl border ${
                        categoryConfig.accentBorder
                      } ${!item.isRead ? 'border-primary/40 bg-card/85 shadow-[0_0_15px_rgba(14,165,233,0.08)]' : 'border-border/70'}`}
                    >
                      {/* Left Category Icon */}
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-squircle transition-transform duration-300 group-hover:scale-105 self-start ${categoryConfig.iconBgClass}`}
                      >
                        {categoryConfig.icon}
                      </div>

                      {/* Content Area */}
                      <div className="min-w-0 flex-1 space-y-2 text-start">
                        {/* Top Meta Line */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold border ${categoryConfig.badgeClass}`}>
                              {categoryConfig.label}
                            </span>
                            {!item.isRead && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-primary/20 border border-primary/35 px-2 py-0.5 text-[9px] font-black text-primary">
                                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-ping" />
                                <span>{isArabic ? 'جديد' : 'NEW'}</span>
                              </span>
                            )}
                            <h3 className="text-sm font-bold text-foreground">
                              <bdi>{titleText}</bdi>
                            </h3>
                          </div>

                          <time
                            className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground font-mono"
                            dateTime={item.createdAt}
                          >
                            <Calendar className="h-3 w-3" />
                            <bdi>
                              {new Date(item.createdAt).toLocaleDateString(isArabic ? 'ar-EG' : 'en-US', {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </bdi>
                          </time>
                        </div>

                        {/* Body Text */}
                        <p className="whitespace-pre-wrap text-xs sm:text-sm leading-relaxed text-muted-foreground">
                          <bdi>{bodyText}</bdi>
                        </p>

                        {/* Action Toolbar */}
                        <div className="pt-2 border-t border-border/40 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {categoryConfig.actionLink && (
                              <Link
                                href={categoryConfig.actionLink}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Button
                                  size="sm"
                                  className="h-8 text-xs px-3 font-bold rounded-squircle bg-primary hover:bg-primary/85 text-primary-foreground flex items-center gap-1.5 shadow-sm"
                                >
                                  <span>{categoryConfig.actionLabel}</span>
                                  <ArrowUpRight className="h-3.5 w-3.5 rtl:rotate-90" />
                                </Button>
                              </Link>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 ms-auto">
                            {!item.isRead ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={readMutation.isPending && readMutation.variables === item._id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  readMutation.mutate(item._id);
                                }}
                                className="h-7 px-2 text-[11px] font-semibold rounded-squircle text-primary hover:bg-primary/10 transition-all cursor-pointer flex items-center gap-1"
                              >
                                {readMutation.isPending && readMutation.variables === item._id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <CheckCheck className="h-3.5 w-3.5" />
                                )}
                                <span>{isArabic ? 'تحديد كمقروء' : 'Mark read'}</span>
                              </Button>
                            ) : null}

                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={deleteMutation.isPending && deleteMutation.variables === item._id}
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteMutation.mutate(item._id);
                              }}
                              className="h-7 w-7 p-0 rounded-squircle text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all cursor-pointer"
                              title={isArabic ? 'حذف الإشعار' : 'Delete'}
                            >
                              {deleteMutation.isPending && deleteMutation.variables === item._id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Big Popup Notification Modal */}
      <NotificationDetailsDialog
        notification={selectedNotification}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        onDelete={(id) => deleteMutation.mutate(id)}
        isDeleting={deleteMutation.isPending}
      />
    </div>
  );
}
