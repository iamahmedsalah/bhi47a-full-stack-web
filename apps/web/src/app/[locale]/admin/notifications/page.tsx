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
  Sparkles,
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
} from 'lucide-react';
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
          <div className="flex flex-col items-start gap-1">
            <span className="badge badge-info">
              {log.deliveryStatus || 'pending'}
            </span>
            {(log as any).meta?.sendWhatsApp && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                <MessageSquare className="h-2.5 w-2.5" />
                WhatsApp
              </span>
            )}
          </div>
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
            {new Date(log.createdAt).toLocaleString(isArabic ? 'ar-EG' : 'en-US')}
          </time>
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

    sendMutation.mutate({
      title: form.title.trim(),
      body: form.body.trim(),
      targetType: form.targetType,
      targetLevel: form.targetType === 'level' ? form.targetLevel : undefined,
      targetStudentCode:
        form.targetType === 'student' ? form.targetStudentCode.trim() : undefined,
      sendWhatsApp,
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
                <Sparkles className="h-4 w-4 text-amber-400" />
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

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-1">
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

                {/* WhatsApp Automation Channel */}
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500/20 text-emerald-400">
                        <MessageSquare className="h-3.5 w-3.5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-foreground">
                            {t('channelWhatsApp')}
                          </span>
                          <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-medium text-emerald-400 border border-emerald-500/30">
                            {t('channelWhatsAppBadge')}
                          </span>
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {t('channelWhatsAppDesc')}
                        </div>
                      </div>
                    </div>
                    <label className="relative inline-flex cursor-pointer items-center shrink-0">
                      <input
                        type="checkbox"
                        className="peer sr-only"
                        checked={sendWhatsApp}
                        onChange={(e) => setSendWhatsApp(e.target.checked)}
                      />
                      <div className="peer h-5 w-9 rounded-full bg-muted peer-checked:bg-emerald-500 after:absolute after:start-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full"></div>
                    </label>
                  </div>

                  {sendWhatsApp ? (
                    <div className="rounded border border-emerald-500/20 bg-emerald-500/10 p-2 text-[11px] text-emerald-300 flex items-start gap-1.5">
                      <Smartphone className="h-3.5 w-3.5 shrink-0 mt-0.5 text-emerald-400" />
                      <span>
                        {isArabic
                          ? 'سيتم استخدام أرقام هواتف الطلاب (Phone) المسجلة في ملفاتهم بقاعدة البيانات لبث الرسالة تلقائياً فور تشغيل أتمتة WhatsApp API.'
                          : 'Alerts will be dispatched using student phone numbers registered in database profiles once WhatsApp Business API is connected.'}
                      </span>
                    </div>
                  ) : null}
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
