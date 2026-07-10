'use client';

import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Bell, Calendar, CheckCheck, Loader2, Sparkles, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/feedback';
import { getApiErrorMessage } from '@/lib/api';
import {
  listStudentNotifications,
  markNotificationRead,
} from '@/lib/features/notifications';
import { queryKeys } from '@/lib/query-keys';
import { motion } from 'framer-motion';

export default function StudentNotificationsPage() {
  const t = useTranslations('studentPortal');
  const tCommon = useTranslations('common');
  const queryClient = useQueryClient();

  const notificationsQuery = useQuery({
    queryKey: queryKeys.notifications.studentList,
    queryFn: listStudentNotifications,
  });

  const readMutation = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.notifications.studentList,
      });
    },
  });

  const items = notificationsQuery.data?.items || [];
  const isEnglish = tCommon('search') === 'Search...';
  const unreadCount = items.filter((item) => !item.isRead).length;

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
          <h2 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <Bell className="h-6 w-6 text-primary animate-wiggle" />
            <span>{t('notifications')}</span>
          </h2>
          <p className="text-sm text-muted-foreground">
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

      {items.length === 0 ? (
        <Card className="p-12 text-center bg-card/45 backdrop-blur-sm border-border shadow-sm">
          <Inbox className="w-12 h-12 text-muted mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">
            {isEnglish ? 'Your inbox is clear' : 'صندوق الوارد فارغ حالياً'}
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {items.map((item, idx) => (
            <motion.div
              key={item._id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: idx * 0.04 }}
            >
              <Card
                className={`p-5 bg-card/45 backdrop-blur-sm transition-all flex gap-4 ${
                  !item.isRead
                    ? 'border-primary/45 shadow-[0_0_12px_rgba(15,118,110,0.06)]'
                    : 'border-border shadow-sm'
                }`}
              >
                <div
                  className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${
                    !item.isRead
                      ? 'bg-primary/20 text-primary'
                      : 'bg-secondary/60 text-muted-foreground'
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
                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                    {item.body}
                  </p>

                  {!item.isRead && (
                    <div className="pt-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={readMutation.isPending}
                        onClick={() => readMutation.mutate(item._id)}
                        className="flex items-center gap-1.5 h-8 text-xs px-3 font-semibold rounded-lg hover:bg-primary/10 hover:text-primary transition-all cursor-pointer"
                      >
                        {readMutation.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <CheckCheck className="h-3.5 w-3.5" />
                        )}
                        <span>{isEnglish ? 'Mark as Read' : 'تمت القراءة'}</span>
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
