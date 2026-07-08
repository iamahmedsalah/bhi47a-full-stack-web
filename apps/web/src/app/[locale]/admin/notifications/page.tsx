'use client';

import { FormEvent, useMemo, useState, Suspense } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Bell, Plus, Send, Loader2 } from 'lucide-react';
import { COURSE_LEVEL_VALUES } from '@student-portal/shared';
import { Button } from '@/components/ui/button';
import { DataTable, DataTableColumn } from '@/components/ui/data-table';
import { AlertMessage, EmptyState, ErrorState, LoadingState } from '@/components/ui/feedback';
import { Field, Select, Textarea, TextInput } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';
import { getApiErrorMessage } from '@/lib/api';
import {
  listAdminNotifications,
  NotificationLog,
  NotificationTarget,
  sendNotification,
} from '@/lib/features/notifications';
import { queryKeys } from '@/lib/query-keys';

const initialForm = {
  title: '',
  body: '',
  targetType: 'all' as NotificationTarget,
  targetLevel: '1',
  targetStudentCode: '',
};

import { PageTitleBanner } from '@/components/ui/page-title-banner';
import { PageSkeletonLoader } from '@/components/ui/page-suspense-fallback';

function NotificationsPageContent() {
  const t = useTranslations('notifications');
  const tCommon = useTranslations('common');
  const tGrades = useTranslations('grades');
  const queryClient = useQueryClient();

  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  const notificationsQuery = useQuery({
    queryKey: queryKeys.notifications.adminList,
    queryFn: listAdminNotifications,
  });

  const sendMutation = useMutation({
    mutationFn: sendNotification,
    onSuccess: async () => {
      setFormSuccess(t('success'));
      await queryClient.invalidateQueries({
        queryKey: queryKeys.notifications.adminList,
      });
      window.setTimeout(() => {
        setIsOpen(false);
        setFormSuccess('');
      }, 1200);
    },
    onError: (error) => {
      setFormError(getApiErrorMessage(error, 'Error occurred while sending'));
    },
  });

  const logs = notificationsQuery.data?.items || [];
  const total = notificationsQuery.data?.total || 0;

  const columns = useMemo<DataTableColumn<NotificationLog>[]>(
    () => [
      {
        key: 'title',
        header: t('notificationTitle'),
        className: 'min-w-72',
        cell: (log) => (
          <div className="max-w-md">
            <div className="font-semibold leading-snug text-foreground">{log.title}</div>
            <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {log.body}
            </div>
          </div>
        ),
      },
      {
        key: 'target',
        header: t('targetType'),
        cell: (log) => (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="badge badge-success">{t(`target_${log.targetType}`)}</span>
            {log.targetType === 'level' ? (
              <span className="text-xs text-muted">
                ({tGrades('level')} {log.targetLevel})
              </span>
            ) : null}
            {log.targetType === 'student' && log.targetStudentId ? (
              <span className="text-xs text-muted">({log.targetStudentId.name})</span>
            ) : null}
          </div>
        ),
      },
      {
        key: 'status',
        header: tCommon('status'),
        cell: (log) => (
          <span className="badge badge-info">
            {log.deliveryStatus || 'pending'}
          </span>
        ),
      },
      {
        key: 'sentBy',
        header: t('sentBy'),
        cell: (log) => (
          <div className="font-medium">
            {log.sentBy?.name || 'System admin'}
          </div>
        ),
      },
      {
        key: 'sentAt',
        header: t('sentAt'),
        cell: (log) => (
          <time className="text-xs text-muted" dateTime={log.createdAt}>
            {new Date(log.createdAt).toLocaleString('ar-EG')}
          </time>
        ),
      },
    ],
    [t, tCommon, tGrades],
  );

  const openSendModal = () => {
    setForm(initialForm);
    setFormError('');
    setFormSuccess('');
    setIsOpen(true);
  };

  const closeSendModal = () => {
    if (sendMutation.isPending) {
      return;
    }
    setIsOpen(false);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');
    setFormSuccess('');

    sendMutation.mutate({
      title: form.title.trim(),
      body: form.body.trim(),
      targetType: form.targetType,
      targetLevel: form.targetType === 'level' ? form.targetLevel : undefined,
      targetStudentCode:
        form.targetType === 'student' ? form.targetStudentCode.trim() : undefined,
    });
  };

  return (
    <div className="animate-fade-in space-y-6">
      <PageTitleBanner
        title={t('title')}
        icon={<Bell className="h-5 w-5 text-primary" />}
        subtitle={t('title')}
      >
        <Button onClick={openSendModal} className="flex items-center gap-2">
          <Plus className="h-5 w-5" />
          <span>{t('addNotification')}</span>
        </Button>
      </PageTitleBanner>

      <section className="overflow-hidden rounded-2xl border border-border bg-card/70">
        {notificationsQuery.isLoading ? (
          <LoadingState title={tCommon('loading')} />
        ) : notificationsQuery.isError ? (
          <ErrorState
            description={getApiErrorMessage(notificationsQuery.error)}
            error={notificationsQuery.error}
            onRetry={() => notificationsQuery.refetch()}
          />
        ) : logs.length === 0 ? (
          <EmptyState title={tCommon('noData')} />
        ) : (
          <DataTable rows={logs} columns={columns} />
        )}
      </section>

      <Modal
        open={isOpen}
        title={t('addNotification')}
        onClose={closeSendModal}
      >
        <form onSubmit={submit} className="space-y-4">
          {formError ? <AlertMessage>{formError}</AlertMessage> : null}
          {formSuccess ? (
            <AlertMessage tone="success">{formSuccess}</AlertMessage>
          ) : null}

          <Field label={`${t('notificationTitle')} *`}>
            <TextInput
              required
              value={form.title}
              onChange={(event) =>
                setForm((current) => ({ ...current, title: event.target.value }))
              }
              placeholder="Notification title"
            />
          </Field>

          <Field label={`${t('notificationBody')} *`}>
            <Textarea
              required
              rows={3}
              value={form.body}
              onChange={(event) =>
                setForm((current) => ({ ...current, body: event.target.value }))
              }
              placeholder="Notification message"
            />
          </Field>

          <Field label={`${t('targetType')} *`}>
            <Select
              value={form.targetType}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  targetType: event.target.value as NotificationTarget,
                }))
              }
            >
              <option value="all">{t('target_all')}</option>
              <option value="level">{t('target_level')}</option>
              <option value="student">{t('target_student')}</option>
            </Select>
          </Field>

          {form.targetType === 'level' ? (
            <Field label={`${tGrades('level')} *`}>
              <Select
                value={form.targetLevel}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    targetLevel: event.target.value,
                  }))
                }
              >
                {COURSE_LEVEL_VALUES.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          {form.targetType === 'student' ? (
            <Field label="Student code *">
              <TextInput
                required
                value={form.targetStudentCode}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    targetStudentCode: event.target.value,
                  }))
                }
                placeholder="20231002"
                className="font-mono"
              />
            </Field>
          ) : null}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={closeSendModal}>
              {tCommon('cancel')}
            </Button>
            <Button
              type="submit"
              disabled={sendMutation.isPending || Boolean(formSuccess)}
              className="flex items-center gap-2"
            >
              {sendMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              <Send className="h-4 w-4" />
              <span>{tCommon('confirm')}</span>
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <Suspense fallback={<PageSkeletonLoader />}>
      <NotificationsPageContent />
    </Suspense>
  );
}
