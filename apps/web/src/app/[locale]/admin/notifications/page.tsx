'use client';

import { FormEvent, useMemo, useState, Suspense } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations, useLocale } from 'next-intl';
import {
  Bell,
  Plus,
  Send,
  Loader2,
  CloudRain,
  GraduationCap,
  BookOpen,
  Clock,
  CalendarDays,
  Zap,
  CheckCircle2,
  Smartphone,
  MessageSquare,
  Users,
  Layers,
  UserCheck,
  Check,
  Building2,
  ExternalLink,
  User,
  Trash2,
  Eye,
  CheckCheck,
} from 'lucide-react';
import { COURSE_LEVEL_VALUES } from '@student-portal/shared';
import { Button } from '@/components/ui/button';
import { DataTable, DataTableColumn } from '@/components/ui/data-table';
import { AlertMessage, EmptyState, ErrorState, LoadingState } from '@/components/ui/feedback';
import { Field, Select, Textarea, TextInput } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { getApiErrorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { toast } from 'sonner';
import {
  listAdminNotifications,
  NotificationLog,
  NotificationTarget,
  sendNotification,
  deleteAdminNotification,
} from '@/lib/features/notifications';
import { queryKeys } from '@/lib/query-keys';
import { PageTitleBanner } from '@/components/ui/page-title-banner';
import { PageSkeletonLoader } from '@/components/ui/page-suspense-fallback';

interface NotificationTemplate {
  id: string;
  icon: typeof CloudRain;
  titleKey: string;
  descKey: string;
  borderClass: string;
  bgClass: string;
  textClass: string;
  badgeClass: string;
  titleAr: string;
  bodyAr: string;
  titleEn: string;
  bodyEn: string;
}

const TEMPLATES: NotificationTemplate[] = [
  {
    id: 'weather',
    icon: CloudRain,
    titleKey: 'tpl_weather',
    descKey: 'tpl_weather_desc',
    borderClass: 'border-sky-500/40 hover:border-sky-400',
    bgClass: 'bg-sky-500/10 hover:bg-sky-500/15',
    textClass: 'text-sky-400',
    badgeClass: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
    titleAr: 'تنبيه عاجل: تعليق الدراسة الحضورية وتحويل المحاضرات عن بُعد لسوء الأحوال الجوية',
    bodyAr: 'نظراً للتقارير الجوية وحالة الطقس غير المستقرة، وحرصاً على سلامة جميع الطلاب، تقرر تعليق الحضور بمقر المعهد وتحويل كافة المحاضرات لتكون بنظام التعلم عن بُعد (Online) لهذا اليوم. يرجى متابعة منصة المقررات لحضور المحاضرات وفق الجدول المعلن.',
    titleEn: 'Urgent Alert: In-Person Classes Suspended (Switching to Online Lectures)',
    bodyEn: 'Due to severe weather forecasts and to guarantee student safety, in-person classes at the campus are suspended today. All lectures will proceed online via the portal. Please log in according to your announced schedule.',
  },
  {
    id: 'results',
    icon: GraduationCap,
    titleKey: 'tpl_results',
    descKey: 'tpl_results_desc',
    borderClass: 'border-emerald-500/40 hover:border-emerald-400',
    bgClass: 'bg-emerald-500/10 hover:bg-emerald-500/15',
    textClass: 'text-emerald-400',
    badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    titleAr: 'إعلان رسمي: اعتماد وإعلان نتائج امتحانات الفصل الدراسي',
    bodyAr: 'يسر إدارة المعهد أن تعلن عن اعتماد ونشر نتائج امتحانات الفصل الدراسي رسمياً عبر البوابة الطلابية. يمكن للطلاب الآن الدخول إلى صفحة النتائج للاطلاع على بيان الدرجات التفصيلي والمعدل التراكمي (GPA). مع أطيب تمنياتنا بدوام التوفيق.',
    titleEn: 'Official Announcement: Semester Exam Results Published',
    bodyEn: 'The institute administration is pleased to announce that semester exam results are now officially approved and published on the student portal. You may now access the Results tab to view your transcript and GPA.',
  },
  {
    id: 'registration',
    icon: BookOpen,
    titleKey: 'tpl_registration',
    descKey: 'tpl_registration_desc',
    borderClass: 'border-amber-500/40 hover:border-amber-400',
    bgClass: 'bg-amber-500/10 hover:bg-amber-500/15',
    textClass: 'text-amber-400',
    badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    titleAr: 'إعلان رسمي: بدء فترة تسجيل المقررات الدراسية للفصل الحالي',
    bodyAr: 'نحيطكم علماً ببدء فترة تسجيل المقررات الدراسية رسمياً عبر البوابة الإلكترونية. يرجى من جميع الطلاب مراجعة الخطة الدراسية وسرعة تسجيل مقرراتهم المطلوبة والتواصل مع المرشد الأكاديمي عند الحاجة قبل انتهاء الموعد المحدد.',
    titleEn: 'Official Notice: Semester Course Registration is Now Open',
    bodyEn: 'Please be advised that course registration for the current semester is now officially open on the portal. All students are requested to review their degree audits and finalize course selections before the deadline.',
  },
  {
    id: 'deadline',
    icon: Clock,
    titleKey: 'tpl_deadline',
    descKey: 'tpl_deadline_desc',
    borderClass: 'border-rose-500/40 hover:border-rose-400',
    bgClass: 'bg-rose-500/10 hover:bg-rose-500/15',
    textClass: 'text-rose-400',
    badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
    titleAr: 'تذكير عاجل: اقتراب موعد إغلاق باب تسجيل وتعديل المقررات الدراسية',
    bodyAr: 'تذكير هام لجميع الطلاب الذين لم يستكملوا تسجيل مقرراتهم بعد: تفيد إدارة شؤون الطلاب باقتراب المهلة النهائية لتسجيل المقررات للفصل الحالي. يرجى سرعة تثبيت مقرراتكم لضمان استمرار القيد وتفادي تأخير التسجيل.',
    titleEn: 'Urgent Reminder: Course Registration Deadline Approaching',
    bodyEn: 'Important reminder for students who have not yet finalized their course enrollment: the registration period will conclude shortly. Please confirm your registered courses promptly to ensure continued enrollment.',
  },
  {
    id: 'exam_schedule',
    icon: CalendarDays,
    titleKey: 'tpl_exam_schedule',
    descKey: 'tpl_exam_schedule_desc',
    borderClass: 'border-purple-500/40 hover:border-purple-400',
    bgClass: 'bg-purple-500/10 hover:bg-purple-500/15',
    textClass: 'text-purple-400',
    badgeClass: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    titleAr: 'إعلان: صدور جداول الامتحانات الرسمية وتوزيع مقار اللجان وأرقام الجلوس',
    bodyAr: 'تم اعتماد ونشر جدول الامتحانات الرسمية وتوزيع مقار اللجان وأرقام الجلوس لجميع المستويات الدراسية. يرجى من الطلاب مراجعة صفحة جدول الامتحانات عبر البوابة لمعرفة مواعيد الاختبارات والقاعات المخصصة لكل مادة والالتزام بالتعليمات.',
    titleEn: 'Official Notice: Exam Schedules, Seating & Hall Allocations Published',
    bodyEn: 'The official exam timetables and hall assignments have been finalized. Please check your personalized exam schedule and seating details on the portal, adhering strictly to examination rules.',
  },
];

const initialForm = {
  title: '',
  body: '',
  targetType: 'all' as NotificationTarget,
  targetLevel: '1',
  targetStudentCode: '',
};

function NotificationsPageContent() {
  const t = useTranslations('notifications');
  const tCommon = useTranslations('common');
  const tGrades = useTranslations('grades');
  const locale = useLocale();
  const isArabic = locale.startsWith('ar');
  const queryClient = useQueryClient();

  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [sendWhatsApp, setSendWhatsApp] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [selectedLogForReaders, setSelectedLogForReaders] = useState<NotificationLog | null>(null);
  const [notificationToDelete, setNotificationToDelete] = useState<NotificationLog | null>(null);

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
      setFormError(getApiErrorMessage(error, isArabic ? 'حدث خطأ أثناء إرسال الإشعار' : 'Error occurred while sending'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAdminNotification,
    onSuccess: () => {
      toast.success(t('deleteSuccess'));
      queryClient.invalidateQueries({
        queryKey: queryKeys.notifications.adminList,
      });
      setNotificationToDelete(null);
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, isArabic ? 'فشل حذف الإشعار' : 'Failed to delete notification'));
    },
  });

  const logs = notificationsQuery.data?.items || [];

  const columns = useMemo<DataTableColumn<NotificationLog>[]>(
    () => [
      {
        key: 'title',
        header: t('notificationTitle'),
        className: 'min-w-72',
        cell: (log) => (
          <div className="max-w-md text-start">
            <div className="font-semibold leading-snug text-foreground">
              <bdi>{log.title}</bdi>
            </div>
            <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              <bdi>{log.body}</bdi>
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
              <span className="text-xs text-muted font-mono">
                ({t('level')} {log.targetLevel})
              </span>
            ) : null}
            {log.targetType === 'student' ? (
              <span className="text-xs text-muted font-mono" dir="ltr">
                <bdi>({log.targetStudentId?.name || log.targetStudentId?.studentCode || 'Student'})</bdi>
              </span>
            ) : null}
          </div>
        ),
      },
      {
        key: 'status',
        header: tCommon('status'),
        cell: (log) => {
          const statusKey = `status_${log.deliveryStatus || 'pending'}`;
          const statusLabel = t(statusKey as any) || log.deliveryStatus;
          const statusBadge =
            log.deliveryStatus === 'sent'
              ? 'badge-success'
              : log.deliveryStatus === 'failed'
              ? 'badge-danger'
              : 'badge-info';
          return (
            <div className="flex flex-col items-start gap-1">
              <span className={cn('badge', statusBadge)}>{statusLabel}</span>
              {(log as any).meta?.sendWhatsApp && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                  <MessageSquare className="h-2.5 w-2.5" />
                  WhatsApp
                </span>
              )}
            </div>
          );
        },
      },
      {
        key: 'readCount',
        header: t('readCount'),
        cell: (log) => {
          const count = log.readCount ?? (Array.isArray(log.readBy) ? log.readBy.length : 0);
          return (
            <button
              type="button"
              onClick={() => setSelectedLogForReaders(log)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-squircle bg-cyan-500/10 border border-cyan-500/25 text-cyan-300 hover:bg-cyan-500/20 text-xs font-semibold cursor-pointer transition-all"
              title={t('viewReaders')}
            >
              <Users className="h-3.5 w-3.5 text-cyan-400" />
              <span className="font-mono font-bold">{count}</span>
              <span className="text-[10px] text-cyan-400/80 underline ms-0.5">
                {isArabic ? 'عرض' : 'View'}
              </span>
            </button>
          );
        },
      },
      {
        key: 'sentBy',
        header: t('sentBy'),
        cell: (log) => (
          <div className="font-medium text-xs">
            {log.sentBy?.name || 'System admin'}
          </div>
        ),
      },
      {
        key: 'sentAt',
        header: t('sentAt'),
        cell: (log) => (
          <time className="text-xs text-muted font-mono" dateTime={log.createdAt}>
            <bdi>{new Date(log.createdAt).toLocaleString(isArabic ? 'ar-EG' : 'en-US')}</bdi>
          </time>
        ),
      },
      {
        key: 'actions',
        header: isArabic ? 'إجراءات' : 'Actions',
        className: 'w-16 text-center',
        cell: (log) => (
          <button
            type="button"
            onClick={() => setNotificationToDelete(log)}
            className="p-1.5 rounded-squircle text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all cursor-pointer"
            title={t('deleteNotification')}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ),
      },
    ],
    [t, tCommon, tGrades, isArabic],
  );

  const openSendModal = () => {
    setForm(initialForm);
    setSelectedTemplateId(null);
    setSendWhatsApp(false);
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

  const handleApplyTemplate = (tpl: NotificationTemplate) => {
    setSelectedTemplateId(tpl.id);
    setForm((prev) => ({
      ...prev,
      title: isArabic ? tpl.titleAr : tpl.titleEn,
      body: isArabic ? tpl.bodyAr : tpl.bodyEn,
    }));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');
    setFormSuccess('');

    if (!form.title.trim()) {
      setFormError(isArabic ? 'يرجى كتابة عنوان الإشعار' : 'Please provide notification title');
      return;
    }
    if (!form.body.trim()) {
      setFormError(isArabic ? 'يرجى كتابة نص الإشعار' : 'Please provide notification message body');
      return;
    }
    if (form.targetType === 'student' && !form.targetStudentCode.trim()) {
      setFormError(isArabic ? 'يرجى إدخال الكود الأكاديمي للطالب' : 'Please provide target student code');
      return;
    }

    sendMutation.mutate({
      title: form.title.trim(),
      body: form.body.trim(),
      targetType: form.targetType,
      targetLevel: form.targetType === 'level' ? form.targetLevel : undefined,
      targetStudentCode:
        form.targetType === 'student' ? form.targetStudentCode.trim() : undefined,
      sendWhatsApp: false,
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
        size="xl"
      >
        <form onSubmit={submit} className="space-y-5">
          {formError ? <AlertMessage>{formError}</AlertMessage> : null}
          {formSuccess ? (
            <AlertMessage tone="success">{formSuccess}</AlertMessage>
          ) : null}

          {/* Quick Recommended Templates Bar */}
          <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-card to-card/60 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                  {t('quickTemplates')}
                </span>
              </div>
              <span className="text-[11px] text-muted-foreground">
                {isArabic ? 'اختر قالب للتعبئة التلقائية' : '1-Click auto fill'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('quickTemplatesDesc')}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2.5 pt-1">
              {TEMPLATES.map((tpl) => {
                const Icon = tpl.icon;
                const isSelected = selectedTemplateId === tpl.id;
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => handleApplyTemplate(tpl)}
                    className={`group relative flex flex-col items-start gap-1.5 rounded-xl border p-3 text-start transition-all ${
                      isSelected
                        ? 'border-primary bg-primary/10 shadow-sm ring-2 ring-primary/30'
                        : `${tpl.borderClass} ${tpl.bgClass}`
                    }`}
                  >
                    <div className="flex w-full items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Icon className={`h-4 w-4 ${tpl.textClass}`} />
                        <span className="text-xs font-bold text-foreground">
                          {t(tpl.titleKey)}
                        </span>
                      </div>
                      {isSelected ? (
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                          <Check className="h-2.5 w-2.5" />
                        </span>
                      ) : null}
                    </div>
                    <span className="text-[11px] text-muted-foreground leading-snug line-clamp-2">
                      {t(tpl.descKey)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Form Inputs (Left / Main) */}
            <div className="lg:col-span-7 space-y-4">
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

              <Field label={`${t('notificationTitle')} *`}>
                <TextInput
                  required
                  value={form.title}
                  onChange={(event) => {
                    setSelectedTemplateId(null);
                    setForm((current) => ({ ...current, title: event.target.value }));
                  }}
                  placeholder={
                    isArabic
                      ? 'مثال: تنبيه هام بتعليق الدراسة لسوء الأحوال الجوية'
                      : 'e.g. Urgent Notice: Bad Weather Alert'
                  }
                />
              </Field>

              <Field label={`${t('notificationBody')} *`}>
                <Textarea
                  required
                  rows={4}
                  value={form.body}
                  onChange={(event) => {
                    setSelectedTemplateId(null);
                    setForm((current) => ({ ...current, body: event.target.value }));
                  }}
                  placeholder={
                    isArabic
                      ? 'اكتب نص التنبيه أو اختر قالباً جاهزاً من الأعلى...'
                      : 'Type the notification message or select a recommended template...'
                  }
                />
              </Field>

              {/* Channels & WhatsApp Integration */}
              <div className="rounded-xl border border-border bg-card/60 p-3.5 space-y-3">
                <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5 text-primary" />
                  <span>{t('channelsTitle')}</span>
                </div>

                {/* Portal & FCM Channel */}
                <div className="flex items-center justify-between rounded-lg border border-border/50 bg-background/50 p-2.5">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/15 text-primary">
                      <Bell className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-foreground">
                        {t('channelPortal')}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {t('channelPortalDesc')}
                      </div>
                    </div>
                  </div>
                  <span className="rounded bg-primary/20 px-2 py-0.5 text-[10px] font-medium text-primary">
                    {isArabic ? 'نشط' : 'Active'}
                  </span>
                </div>

                {/* WhatsApp Automation Channel (Disabled / Coming Soon) */}
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-400">
                        <MessageSquare className="h-3.5 w-3.5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-semibold text-foreground">
                            {t('channelWhatsApp')}
                          </span>
                          <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[9px] font-bold text-amber-300 border border-amber-500/35">
                            {isArabic ? 'قريباً · Future' : 'Coming Soon'}
                          </span>
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {t('channelWhatsAppDesc')}
                        </div>
                      </div>
                    </div>
                    <label
                      className="relative inline-flex cursor-not-allowed items-center shrink-0 opacity-60"
                      title={isArabic ? 'هذه الميزة قيد التطوير وستتوفر قريباً فور تفعيل حساب WhatsApp API' : 'Coming Soon - Under development'}
                    >
                      <input
                        type="checkbox"
                        className="peer sr-only"
                        checked={false}
                        disabled={true}
                        readOnly
                      />
                      <div className="peer h-5 w-9 rounded-full bg-muted/60 after:absolute after:start-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white/50 after:transition-all"></div>
                    </label>
                  </div>

                  <div className="rounded border border-amber-500/20 bg-amber-500/10 p-2 text-[11px] text-amber-200/90 flex items-start gap-1.5">
                    <Smartphone className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-300" />
                    <span>
                      {isArabic
                        ? 'ميزة الإرسال التلقائي عبر WhatsApp API للطلاب قيد المراجعة الفنية وستكون متاحة في التحديث القادم.'
                        : 'Automated student WhatsApp broadcast is under final integration and will be activated in the next release.'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Live Notification Preview (Right Column) */}
            <div className="lg:col-span-5 space-y-4">
              <div className="rounded-2xl border border-primary/20 bg-gradient-to-b from-card/80 to-card/40 p-4 space-y-3 h-full flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between border-b border-border/50 pb-2 mb-3">
                    <div className="flex items-center gap-1.5">
                      <Smartphone className="h-4 w-4 text-primary" />
                      <span className="text-xs font-bold text-foreground">
                        {t('previewTitle')}
                      </span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {isArabic ? 'معاينة شاشة القفل' : 'Lockscreen Preview'}
                    </span>
                  </div>

                  {/* Mock Device Notification Banner */}
                  <div className="rounded-xl border border-border/80 bg-background/95 p-3.5 shadow-lg space-y-2.5">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground border-b border-border/40 pb-1.5">
                      <div className="flex items-center gap-1.5">
                        <div className="h-4 w-4 rounded-full bg-primary/25 flex items-center justify-center text-primary font-bold text-[9px]">
                          BIS
                        </div>
                        <span className="font-semibold text-foreground/90">
                          {isArabic ? 'بوابة المعهد العالي' : 'Student Portal'}
                        </span>
                      </div>
                      <span className="text-[10px]">{isArabic ? 'الآن' : 'now'}</span>
                    </div>

                    <div className="font-bold text-xs text-foreground leading-snug">
                      {form.title.trim() || (isArabic ? 'عنوان التنبيه سيظهر هنا...' : 'Alert title will appear here...')}
                    </div>

                    <div className="text-xs text-muted-foreground leading-relaxed">
                      {form.body.trim() ||
                        (isArabic
                          ? 'نص الإشعار والتفاصيل ستظهر للطلاب على هواتفهم الذكية وشاشة القفل وتطبيق البوابة...'
                          : 'Notification body text will be displayed here for students on mobile lockscreens and web portal...')}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 pt-1.5 text-[10px]">
                      <span className="inline-flex items-center gap-1 rounded-md bg-primary/15 px-1.5 py-0.5 text-primary border border-primary/20">
                        <Bell className="h-2.5 w-2.5" />
                        FCM Push
                      </span>
                      {sendWhatsApp ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-emerald-400 border border-emerald-500/25">
                          <MessageSquare className="h-2.5 w-2.5" />
                          WhatsApp
                        </span>
                      ) : null}
                      <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-1.5 py-0.5 text-muted-foreground">
                        {form.targetType === 'all' ? (
                          <>
                            <Users className="h-2.5 w-2.5" />
                            <span>{isArabic ? 'كافة الطلاب' : 'All Students'}</span>
                          </>
                        ) : form.targetType === 'level' ? (
                          <>
                            <BookOpen className="h-2.5 w-2.5" />
                            <span>{isArabic ? `المستوى ${form.targetLevel}` : `Level ${form.targetLevel}`}</span>
                          </>
                        ) : (
                          <>
                            <User className="h-2.5 w-2.5" />
                            <span>{isArabic ? `طالب ${form.targetStudentCode || ''}` : `Student ${form.targetStudentCode || ''}`}</span>
                          </>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Future WhatsApp Preview if toggled */}
                  {sendWhatsApp ? (
                    <div className="mt-3 rounded-xl border border-emerald-500/30 bg-[#075e54]/15 p-3 space-y-2">
                      <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-semibold">
                        <MessageSquare className="h-3.5 w-3.5" />
                        <span>{isArabic ? 'معاينة رسالة WhatsApp' : 'WhatsApp Message Format'}</span>
                      </div>
                      <div className="rounded-lg bg-[#0b141a] p-2.5 text-[11px] text-[#e9edef] space-y-1 font-sans">
                        <p className="font-bold text-emerald-400 flex items-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5 shrink-0" />
                          <span>{isArabic ? 'المعهد العالي للعلوم التجارية والحاسب' : 'Higher Institute of BIS'}</span>
                        </p>
                        <p className="font-semibold">{form.title || (isArabic ? 'عنوان الإشعار' : 'Notification Title')}</p>
                        <p className="text-muted-foreground whitespace-pre-wrap">{form.body || (isArabic ? 'محتوى الرسالة...' : 'Message text...')}</p>
                        <p className="text-[9px] text-[#8696a0] pt-1 border-t border-white/10 flex items-center gap-1">
                          <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                          <span>{isArabic ? 'للمزيد والتفاصيل يرجى مراجعة البوابة الطلابية' : 'For details, log in to your student portal'}</span>
                        </p>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5 text-[11px] text-muted-foreground flex items-center gap-2 mt-3">
                  <UserCheck className="h-4 w-4 shrink-0 text-primary" />
                  <span>
                    {isArabic
                      ? 'يتم فحص أرقام الهواتف وأجهزة FCM المسجلة للطلاب المستهدفين تلقائياً عند الإرسال.'
                      : 'Target student phone numbers and FCM tokens are validated automatically during dispatch.'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-border">
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

      {/* Modal for viewing students who read this notification */}
      <Modal
        open={Boolean(selectedLogForReaders)}
        title={t('readersModalTitle')}
        onClose={() => setSelectedLogForReaders(null)}
        size="lg"
      >
        <div className="space-y-4">
          <div className="rounded-xl bg-card/60 border border-border p-3.5 text-start">
            <h4 className="text-sm font-bold text-foreground">
              <bdi>{selectedLogForReaders?.title}</bdi>
            </h4>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              <bdi>{selectedLogForReaders?.body}</bdi>
            </p>
          </div>

          {!selectedLogForReaders?.readBy || selectedLogForReaders.readBy.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-xs">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p>{t('noReadersYet')}</p>
            </div>
          ) : (
            <div className="max-h-72 overflow-y-auto space-y-2">
              {selectedLogForReaders.readBy.map((reader, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2.5 rounded-lg border border-border/50 bg-background/50 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
                      {idx + 1}
                    </div>
                    <div className="text-start">
                      <div className="font-semibold text-foreground">
                        {reader.userId?.name || 'Student'}
                      </div>
                      {reader.userId?.studentCode && (
                        <div className="text-[10px] font-mono text-muted-foreground" dir="ltr">
                          <bdi>{reader.userId.studentCode}</bdi>
                        </div>
                      )}
                    </div>
                  </div>
                  <time className="text-[11px] font-mono text-muted-foreground">
                    <bdi>
                      {reader.readAt
                        ? new Date(reader.readAt).toLocaleString(isArabic ? 'ar-EG' : 'en-US')
                        : ''}
                    </bdi>
                  </time>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end pt-2 border-t border-border">
            <Button variant="secondary" onClick={() => setSelectedLogForReaders(null)}>
              {tCommon('close')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Confirmation Dialog for Deleting Notification */}
      <ConfirmDialog
        open={Boolean(notificationToDelete)}
        onOpenChange={(open) => !open && setNotificationToDelete(null)}
        title={t('deleteConfirmTitle')}
        description={t('deleteConfirmDesc')}
        confirmLabel={t('deleteNotification')}
        cancelLabel={tCommon('cancel')}
        destructive
        disabled={deleteMutation.isPending}
        onConfirm={() => {
          if (notificationToDelete) {
            deleteMutation.mutate(notificationToDelete._id);
          }
        }}
      />
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
