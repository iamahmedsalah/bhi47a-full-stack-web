'use client';

import React, {
  useMemo,
  useState,
  useEffect,
  Suspense,
  useSyncExternalStore,
} from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Copy,
  Loader2,
  Send,
  Ticket,
  Upload,
  Wrench,
} from 'lucide-react';
import { toast } from 'sonner';
import api, { getApiErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import LangToggle from '@/components/ui/LangToggle';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageSkeletonLoader } from '@/components/ui/page-suspense-fallback';
import { getPublicComplaintSchema } from '@/lib/validations';
import { cn } from '@/lib/cn';
import { useComplaintStore } from '@/store/complaint-store';

type ComplaintType = 'complaint' | 'technical_issue' | 'academic' | 'financial' | 'facility' | 'other';
type ComplaintDepartment = 'student_affairs' | 'technical_support' | 'finance' | 'control' | 'academic_advising';

interface PublicComplaintResponse {
  ticketNumber: string;
}

const initialForm = {
  requesterName: '',
  studentCode: '',
  contactPhone: '',
  nationalId: '',
  contactEmail: '',
  type: 'complaint' as ComplaintType,
  department: 'student_affairs' as ComplaintDepartment,
  title: '',
  description: '',
};

const subscribeHydration = () => () => undefined;
const getClientHydrationSnapshot = () => true;
const getServerHydrationSnapshot = () => false;

function PublicComplaintsContent() {
  const params = useParams();
  const locale = params.locale as string;
  const isAr = locale === 'ar';
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ticketNumber, setTicketNumber] = useState<string | null>(null);
  const [screenshotName, setScreenshotName] = useState('');
  const [screenshotBase64, setScreenshotBase64] = useState<string | undefined>(undefined);

  const isHydrated = useSyncExternalStore(
    subscribeHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot,
  );

  const storeForm = useComplaintStore((state) => state.draft);
  const updateDraft = useComplaintStore((state) => state.updateDraft);
  const resetDraft = useComplaintStore((state) => state.resetDraft);

  const form = isHydrated ? storeForm : initialForm;

  const [settings, setSettings] = useState<{
    complaintsSystemOpen: boolean;
    complaintOpenAt?: string;
    complaintCloseAt?: string;
  } | null>(null);

  useEffect(() => {
    api.get('/public/complaints/settings')
      .then((res) => setSettings(res.data))
      .catch(() => {});
  }, []);

  const formatDateString = (dateStr: string) => {
    return new Date(dateStr).toLocaleString(isAr ? 'ar-EG' : 'en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  };

  const systemStatusMessage = useMemo(() => {
    if (!settings) return null;
    const now = new Date();
    const isSystemOpen = settings.complaintsSystemOpen;
    const openAt = settings.complaintOpenAt ? new Date(settings.complaintOpenAt) : null;
    const closeAt = settings.complaintCloseAt ? new Date(settings.complaintCloseAt) : null;

    if (!isSystemOpen) {
      return {
        type: 'closed',
        text: isAr
          ? 'نظام استقبال الشكاوى مغلق حالياً بقرار من إدارة المعهد.'
          : 'Complaints system is currently closed by the institute administration.',
      };
    }

    if (openAt && now < openAt) {
      return {
        type: 'pending',
        text: isAr
          ? `سيبدأ استقبال الشكاوى في: ${formatDateString(settings.complaintOpenAt!)}`
          : `Complaints system will open on: ${formatDateString(settings.complaintOpenAt!)}`,
      };
    }

    if (closeAt && now > closeAt) {
      return {
        type: 'closed',
        text: isAr
          ? `انتهت فترة استقبال الشكاوى في: ${formatDateString(settings.complaintCloseAt!)}`
          : `Complaints system closed on: ${formatDateString(settings.complaintCloseAt!)}`,
      };
    }

    if (openAt || closeAt) {
      return {
        type: 'open',
        text: isAr
          ? `استقبال الشكاوى متاح حالياً ${openAt ? `من: ${formatDateString(settings.complaintOpenAt!)}` : ''} ${closeAt ? `حتى: ${formatDateString(settings.complaintCloseAt!)}` : 'إلى إشعار آخر'}`
          : `Complaints portal is open ${openAt ? `from: ${formatDateString(settings.complaintOpenAt!)}` : ''} ${closeAt ? `until: ${formatDateString(settings.complaintCloseAt!)}` : 'until further notice'}`,
      };
    }


    return null;
  }, [settings, isAr]);

  const typeOptions = useMemo(
    () => [
      { value: 'complaint' as const, ar: 'شكوى', en: 'Complaint' },
      { value: 'technical_issue' as const, ar: 'عطل فني', en: 'Technical Issue' },
      { value: 'academic' as const, ar: 'أكاديمية', en: 'Academic' },
      { value: 'financial' as const, ar: 'مالية', en: 'Financial' },
      { value: 'facility' as const, ar: 'خدمات ومرافق', en: 'Facility / Services' },
      { value: 'other' as const, ar: 'أخرى', en: 'Other' },
    ],
    [],
  );

  const departmentOptions = useMemo(
    () => [
      { value: 'student_affairs' as const, ar: 'شؤون الطلاب', en: 'Student Affairs' },
      { value: 'technical_support' as const, ar: 'الدعم الفني', en: 'Technical Support' },
      { value: 'finance' as const, ar: 'المالية', en: 'Financial Department' },
      { value: 'control' as const, ar: 'الكنترول', en: 'Control / Exams' },
      { value: 'academic_advising' as const, ar: 'الإرشاد الأكاديمي', en: 'Academic Advising' },
    ],
    [],
  );

  const validationResult = useMemo(() => {
    const dummyT = (key: string) => key;
    const schema = getPublicComplaintSchema(dummyT);
    return schema.safeParse(form);
  }, [form]);

  const canSubmit = validationResult.success && !isSubmitting;

  const updateField = <Key extends keyof typeof form>(
    key: Key,
    value: (typeof form)[Key],
  ) => {
    updateDraft({ [key]: value });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    setTicketNumber(null);

    try {
      const res = await api.post<PublicComplaintResponse>('/public/complaints', {
        requesterName: form.requesterName.trim(),
        studentCode: form.studentCode.trim(),
        contactPhone: form.contactPhone.trim(),
        nationalId: form.nationalId.trim(),
        contactEmail: form.contactEmail.trim() || undefined,
        type: form.type,
        department: form.department,
        title: form.title.trim(),
        description: form.description.trim(),
        screenshotUrl: screenshotBase64,
      });

      setTicketNumber(res.data.ticketNumber);
      resetDraft();
      setScreenshotName('');
      setScreenshotBase64(undefined);
      toast.success(isAr ? 'تم إرسال البلاغ بنجاح' : 'Issue submitted successfully');
    } catch (error) {
      toast.error(
        getApiErrorMessage(
          error,
          isAr ? 'تعذر إرسال البلاغ' : 'Could not submit the issue',
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyTicket = async () => {
    if (!ticketNumber) return;

    try {
      await navigator.clipboard.writeText(ticketNumber);
      toast.success(isAr ? 'تم نسخ رقم التذكرة' : 'Ticket number copied');
    } catch {
      toast.error(isAr ? 'تعذر نسخ رقم التذكرة' : 'Could not copy ticket number');
    }
  };

  return (
    <div
      className="flex min-h-screen flex-col p-4 sm:p-6 md:p-8"
      style={{ background: 'var(--gradient-primary)' }}
      dir={isAr ? 'rtl' : 'ltr'}
    >
      <div className="fixed inset-e-4 top-4 z-20">
        <LangToggle />
      </div>

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5">
        <Button asChild variant="ghost" className="w-fit gap-2 text-muted-foreground hover:text-foreground">
          <Link href={`/${locale}/login`}>
            <ArrowRight className={isAr ? 'h-4 w-4' : 'h-4 w-4 rotate-180'} />
            {isAr ? 'الرجوع' : 'Back'}
          </Link>
        </Button>

        <Card className="rounded-xl border-border bg-card/95 p-5 shadow-(--shadow-glow) backdrop-blur-sm sm:p-7">
          <div className="space-y-5">
            <div className="border-b border-border pb-4 text-center">
              <div className="mb-2 flex items-center justify-center gap-2">
                <h1 className="text-2xl font-bold text-foreground">
                  {isAr ? 'نظام الأعطال والشكاوى' : 'Issues & Complaints'}
                </h1>
                <Ticket className="h-7 w-7 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground">
                {isAr
                  ? 'يمكنك تقديم شكوى أو الإبلاغ عن عطل، والاستعلام متاح بعد تسجيل الدخول.'
                  : 'Submit a complaint or technical issue. Tracking is available after sign-in.'}
              </p>
            </div>

            {ticketNumber && (
              <div className="rounded-squircle border border-green-500/30 bg-green-500/10 p-4 text-center">
                <CheckCircle2 className="mx-auto mb-2 h-10 w-10 text-green-400" />
                <p className="text-sm text-muted-foreground">
                  {isAr ? 'احتفظ برقم التذكرة التالي' : 'Keep this ticket number'}
                </p>
                <p className="mt-2 font-mono text-2xl font-bold text-green-400">{ticketNumber}</p>
                <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
                  <Button type="button" variant="outline" onClick={copyTicket} className="gap-2">
                    <Copy className="h-4 w-4" />
                    {isAr ? 'نسخ الرقم' : 'Copy'}
                  </Button>
                  <Button asChild variant="secondary">
                    <Link href={`/${locale}/login/student`}>
                      {isAr ? 'تسجيل الدخول للمتابعة' : 'Sign in to track'}
                    </Link>
                  </Button>
                </div>
              </div>
            )}

            {systemStatusMessage ? (
              <div className={cn(
                'rounded-squircle border p-3.5 text-sm font-semibold transition-all animate-in fade-in',
                systemStatusMessage.type === 'closed' || systemStatusMessage.type === 'pending'
                  ? 'border-red-500/30 bg-red-500/10 text-red-200'
                  : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
              )}>
                <div className="flex gap-2">
                  <AlertCircle className={cn(
                    'mt-0.5 h-4 w-4 shrink-0',
                    systemStatusMessage.type === 'closed' || systemStatusMessage.type === 'pending' ? 'text-red-400' : 'text-emerald-400'
                  )} />
                  <p>{systemStatusMessage.text}</p>
                </div>
              </div>
            ) : (
              <div className="rounded-squircle border border-primary/30 bg-primary/10 p-3 text-sm text-muted-foreground animate-in fade-in">
                <div className="flex gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <p>
                    {isAr
                      ? 'نظام الشكاوى والأعطال مغلق حالياً عن الزوار إذا لم يتم تحديد وقت فتحه.'
                      : 'For privacy, ticket status lookup is available inside the student dashboard only.'}
                  </p>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{isAr ? 'نوع البلاغ *' : 'Type of Issue *'}</Label>
                  <Select value={form.type} onValueChange={(value) => updateField('type', value as ComplaintType)}>
                    <SelectTrigger className="border-border bg-surface/70 h-10 rounded-squircle">
                      <SelectValue placeholder={isAr ? 'اختر نوع البلاغ' : 'Select type'} />
                    </SelectTrigger>
                    <SelectContent className="border-border bg-card">
                      {typeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {isAr ? option.ar : option.en}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{isAr ? 'القسم المختص *' : 'Target Department *'}</Label>
                  <Select value={form.department} onValueChange={(value) => updateField('department', value as ComplaintDepartment)}>
                    <SelectTrigger className="border-border bg-surface/70 h-10 rounded-squircle">
                      <SelectValue placeholder={isAr ? 'اختر القسم المختص' : 'Select department'} />
                    </SelectTrigger>
                    <SelectContent className="border-border bg-card">
                      {departmentOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {isAr ? option.ar : option.en}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-surface/35 p-4">
                <h2 className="mb-4 text-sm font-bold text-foreground">
                  {isAr ? 'معلومات التواصل' : 'Contact Information'}
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="requesterName">{isAr ? 'الاسم *' : 'Name *'}</Label>
                    <Input
                      id="requesterName"
                      value={form.requesterName}
                      onChange={(event) =>
                        updateField('requesterName', event.target.value.slice(0, 120))
                      }
                      placeholder={isAr ? 'الاسم' : 'Full name'}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="studentCode">{isAr ? 'كود الطالب *' : 'Student Code *'}</Label>
                    <Input
                      id="studentCode"
                      inputMode="numeric"
                      value={form.studentCode}
                      onChange={(event) =>
                        updateField('studentCode', event.target.value.replace(/\D/g, '').slice(0, 12))
                      }
                      placeholder={isAr ? 'كود الطالب' : 'Student code'}
                      dir="ltr"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="contactPhone">{isAr ? 'رقم الهاتف *' : 'Phone Number *'}</Label>
                    <Input
                      id="contactPhone"
                      type="tel"
                      inputMode="tel"
                      value={form.contactPhone}
                      onChange={(event) =>
                        updateField('contactPhone', event.target.value.replace(/[^\d+]/g, '').slice(0, 15))
                      }
                      placeholder={isAr ? 'رقم الهاتف' : 'Phone number'}
                      dir="ltr"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="nationalId">{isAr ? 'الرقم القومي *' : 'National ID *'}</Label>
                    <Input
                      id="nationalId"
                      inputMode="numeric"
                      value={form.nationalId}
                      onChange={(event) =>
                        updateField('nationalId', event.target.value.replace(/\D/g, '').slice(0, 14))
                      }
                      placeholder={isAr ? 'الرقم القومي (14 رقم)' : '14 digit national ID'}
                      dir="ltr"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="contactEmail">{isAr ? 'البريد الإلكتروني (اختياري)' : 'Email (optional)'}</Label>
                    <Input
                      id="contactEmail"
                      type="email"
                      value={form.contactEmail}
                      onChange={(event) =>
                        updateField('contactEmail', event.target.value.slice(0, 120))
                      }
                      placeholder={isAr ? 'البريد الإلكتروني' : 'Email address'}
                      dir="ltr"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="screenshot">{isAr ? 'إرفاق صورة' : 'Attach Screenshot'}</Label>
                    <label
                      htmlFor="screenshot"
                      className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-squircle border border-dashed border-border bg-background px-3 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                    >
                      <Upload className="h-4 w-4" />
                      <span className="truncate">
                        {screenshotName || (isAr ? 'اختر صورة' : 'Choose image')}
                      </span>
                    </label>
                    <input
                      id="screenshot"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="sr-only cursor-pointer"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) {
                          if (file.size > 3 * 1024 * 1024) {
                            toast.error(isAr ? 'حجم الصورة يجب أن لا يتجاوز 3 ميجابايت' : 'Image size must not exceed 3MB');
                            event.target.value = '';
                            setScreenshotName('');
                            setScreenshotBase64(undefined);
                            return;
                          }
                          setScreenshotName(file.name);
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            setScreenshotBase64(reader.result as string);
                          };
                          reader.readAsDataURL(file);
                        } else {
                          setScreenshotName('');
                          setScreenshotBase64(undefined);
                        }
                      }}
                    />
                    <p className="text-center text-[11px] text-muted-foreground">
                      {isAr ? 'PNG, JPG, WebP حتى 3MB' : 'PNG, JPG, WebP up to 3MB'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="title">{isAr ? 'الموضوع *' : 'Subject *'}</Label>
                <Input
                  id="title"
                  value={form.title}
                  onChange={(event) => updateField('title', event.target.value.slice(0, 120))}
                  placeholder={isAr ? 'عنوان الشكوى أو العطل' : 'Complaint or issue subject'}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">{isAr ? 'التفاصيل *' : 'Details *'}</Label>
                <Textarea
                  id="description"
                  value={form.description}
                  onChange={(event) => updateField('description', event.target.value.slice(0, 1000))}
                  placeholder={isAr ? '    اكتب التفاصيل بشكل واضح وباللغة العربية فقط...' : '  Write the details clearly...'}
                  rows={7}
                  className=""
                  required
                />
                <p className="text-xs text-muted-foreground" dir="ltr">
                  {form.description.length}/1000
                </p>
              </div>

              <Button type="submit" disabled={!canSubmit} className="h-11 w-full gap-2">
                <span>
                  {isSubmitting
                    ? isAr
                      ? 'جاري إرسال البلاغ...'
                      : 'Submitting...'
                    : isAr
                      ? 'إرسال البلاغ'
                      : 'Submit Issue'}
                </span>
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>

              <div className="rounded-squircle border border-primary/25 bg-primary/10 p-4 text-xs leading-6 text-muted-foreground">
                <p className="mb-1 font-bold text-foreground">
                  {isAr ? 'ملاحظة مهمة:' : 'Important note:'}
                </p>
                <ul className="list-inside list-disc">
                  <li>{isAr ? 'جميع الحقول المعلمة (*) إلزامية' : 'All fields marked (*) are required.'}</li>
                  <li>{isAr ? 'يجب أن يكون كود الطالب موجوداً في قاعدة بيانات المعهد' : 'Student code must exist in the institute database.'}</li>
                  <li>{isAr ? 'سيتم إرسال رسالة تأكيد عند تسجيل البلاغ بنجاح' : 'You will receive confirmation when the ticket is created.'}</li>
                </ul>
              </div>
            </form>
          </div>
        </Card>

        <footer className="mt-auto text-center text-[11px] leading-relaxed text-muted-foreground">
          {isAr ? (
            <>
              جميع الحقوق محفوظة، 2026 © <br />
              قسم تكنولوجيا المعلومات - المعهد العالي للعلوم الإدارية المتقدمة والحاسبات
            </>
          ) : (
            <>
              All Rights Reserved, 2026 © <br />
              IT Department - High Institute for Advanced Management Sciences and Computer
            </>
          )}
        </footer>
      </div>
    </div>
  );
}

export default function PublicComplaintsPage() {
  return (
    <Suspense fallback={<PageSkeletonLoader />}>
      <PublicComplaintsContent />
    </Suspense>
  );
}
