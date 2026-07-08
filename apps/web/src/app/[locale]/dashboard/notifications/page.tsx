'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Bell, Calendar, CheckCheck, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/feedback';
import { getApiErrorMessage } from '@/lib/api';
import {
  listStudentNotifications,
  markNotificationRead,
} from '@/lib/features/notifications';
import { queryKeys } from '@/lib/query-keys';

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

  return (
    <div className="mx-auto max-w-3xl animate-fade-in space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <Bell className="h-6 w-6 text-primary" />
          <span>{t('notifications')}</span>
        </h2>
        <p className="mt-1 text-sm text-muted">
          {tCommon('search') === 'Search...'
            ? 'Stay updated with the latest alerts and announcements'
            : 'تابع آخر التنبيهات والإعلانات الرسمية المرسلة لحسابك'}
        </p>
      </div>

      {notificationsQuery.isLoading ? (
        <LoadingState title={tCommon('loading')} />
      ) : notificationsQuery.isError ? (
        <ErrorState
          description={getApiErrorMessage(notificationsQuery.error)}
          error={notificationsQuery.error}
          onRetry={() => notificationsQuery.refetch()}
        />
      ) : items.length === 0 ? (
        <section className="rounded-2xl border border-border bg-card/70">
          <EmptyState
            title={
              tCommon('search') === 'Search...'
                ? 'Your inbox is clear'
                : 'صندوق الوارد فارغ حاليا'
            }
          />
        </section>
      ) : (
        <section className="space-y-4">
          {items.map((item) => (
            <article
              key={item._id}
              className="flex gap-4 rounded-2xl border border-border bg-card/70 p-5 transition-colors hover:border-primary/30"
            >
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Bell className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-sm font-bold leading-snug text-foreground">
                      {item.title}
                    </h3>
                    {!item.isRead ? (
                      <span className="mt-1 inline-flex rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        New
                      </span>
                    ) : null}
                  </div>
                  <time
                    className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground"
                    dateTime={item.createdAt}
                  >
                    <Calendar className="h-3.5 w-3.5" />
                    {new Date(item.createdAt).toLocaleDateString('ar-EG')}
                  </time>
                </div>
                <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                  {item.body}
                </p>
                {!item.isRead ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={readMutation.isPending}
                    onClick={() => readMutation.mutate(item._id)}
                    className="flex items-center gap-2"
                  >
                    {readMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCheck className="h-4 w-4" />
                    )}
                    <span>{tCommon('confirm')}</span>
                  </Button>
                ) : null}
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
