'use client';

import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { BookOpenCheck, Calendar, CheckCircle2, Clock, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

import { LoadingState } from '@/components/ui/feedback';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RegistrationSlipView } from '@/components/registration/registration-slip-view';
import {
  openRegistrationPrintView,
  type PrintableRegistrationForm,
  downloadRegistrationPdf,
} from '@/lib/registration-print';

import {
  getEligibility,
  getLatestRegistration,
  getRegistrationHistory,
  getAvailableCourses,
  getAdvisingStatus,
  submitDirectRegistration,
  requestAdvising,
  submitApprovedPlan,
  acknowledgeAdvising,
  getRegistrationPrintData,
  registrationKeys,
  type Registration,
} from '@/features/registration/api';

import { CompletedRegistrationCard } from '@/features/registration/components/completed-registration-card';
import { AdvisingRequiredCard } from '@/features/registration/components/advising-required-card';
import { DirectRegistrationTable } from '@/features/registration/components/direct-registration-table';
import { RegistrationHistoryCard } from '@/features/registration/components/registration-history-card';
import { getPublicPortalSettings, settingsKeys } from '@/features/settings/api';

function localizePolicyWarning(warning: string, isEnglish: boolean): string | null {
  const normalized = warning.toLowerCase();
  if (normalized.includes('registration modification')) return null;
  if (normalized.includes('gpa is below 2.00') || normalized.includes('gpa registration rule')) {
    return isEnglish
      ? 'Your current GPA range requires academic advisor approval to complete registration.'
      : 'نطاق معدلك التراكمي الحالي يتطلب موافقة المرشد الأكاديمي لإكمال التسجيل.';
  }
  if (normalized.includes('failed course')) {
    return isEnglish ? 'Failed courses require academic advising.' : 'توجد مقررات رسوب تتطلب مراجعة المرشد الأكاديمي.';
  }
  if (normalized.includes('academic warning')) {
    return isEnglish ? 'Academic warnings require advising.' : 'توجد إنذارات أكاديمية تتطلب مراجعة الإرشاد الأكاديمي.';
  }
  if (normalized.includes('graduat')) {
    return isEnglish ? 'The graduation plan requires advisor approval.' : 'تتطلب خطة التخرج اعتماد المرشد الأكاديمي.';
  }
  if (normalized.includes('summer')) {
    return isEnglish ? 'The summer registration policy requires advisor approval.' : 'تتطلب سياسة التسجيل الصيفي اعتماد المرشد الأكاديمي.';
  }
  return isEnglish ? warning.split('/')[0].replace(/^\s*[•-]\s*/, '').trim() : 'تتطلب حالتك الأكاديمية مراجعة المرشد الأكاديمي.';
}

export default function CourseRegistrationPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const locale = params.locale as string;
  const isEnglish = locale === 'en';

  const [selected, setSelected] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [requestingAdvising, setRequestingAdvising] = useState(false);
  const [submittingApprovedPlan, setSubmittingApprovedPlan] = useState(false);
  const [viewSlipOpen, setViewSlipOpen] = useState(false);
  const [activeSlipForm, setActiveSlipForm] = useState<PrintableRegistrationForm | null>(null);

  const eligibilityQuery = useQuery({
    queryKey: registrationKeys.eligibility(),
    queryFn: () => getEligibility(),
  });

  const portalSettingsQuery = useQuery({
    queryKey: settingsKeys.publicPortalSettings,
    queryFn: getPublicPortalSettings,
    staleTime: 60 * 1000,
  });

  const latestRegistrationQuery = useQuery({
    queryKey: registrationKeys.latest(),
    queryFn: () => getLatestRegistration(),
  });

  const registrationHistoryQuery = useQuery({
    queryKey: registrationKeys.history(),
    queryFn: () => getRegistrationHistory(),
  });

  const eligibility = eligibilityQuery.data;
  const latestRegistration = latestRegistrationQuery.data;
  const localizedPolicyWarnings = (eligibility?.policyWarnings ?? [])
    .map((warning) => localizePolicyWarning(warning, isEnglish))
    .filter((warning): warning is string => Boolean(warning));

  const isAlreadyRegistered = useMemo(() => {
    if (!latestRegistration || !eligibility) return false;
    const currentYear = eligibility.registrationTerm?.academicYear;
    const currentSemester = eligibility.semester;
    const regStatus = latestRegistration.status?.toLowerCase();
    return (
      (regStatus === 'approved' || regStatus === 'registered' || regStatus === 'pending') &&
      latestRegistration.academicYear === currentYear &&
      latestRegistration.semester === currentSemester
    );
  }, [latestRegistration, eligibility]);

  React.useEffect(() => {
    if (!latestRegistration || !isAlreadyRegistered) return undefined;
    const timer = window.setTimeout(() => setSelected(latestRegistration.courses), 0);
    return () => window.clearTimeout(timer);
  }, [latestRegistration, isAlreadyRegistered]);

  const coursesQuery = useQuery({
    queryKey: registrationKeys.availableCourses(),
    enabled: eligibilityQuery.data?.canRegisterDirectly === true || (!!eligibilityQuery.data && !eligibilityQuery.data.requiresAdvisor && isAlreadyRegistered),
    queryFn: () => getAvailableCourses(),
  });

  const advisingQuery = useQuery({
    queryKey: registrationKeys.advisingStatus(),
    queryFn: () => getAdvisingStatus(),
  });

  const courses = useMemo(() => coursesQuery.data ?? [], [coursesQuery.data]);
  const selectedHours = useMemo(() => {
    return selected.reduce((sum, code) => {
      const match = courses.find((c) => c.code === code);
      return sum + (match?.creditHours ?? 0);
    }, 0);
  }, [selected, courses]);

  const registeredCourseDetails = useMemo(() => {
    if (!latestRegistration || !courses.length) return [];
    return latestRegistration.courses.map((code) => {
      const course = courses.find((c) => c.code === code);
      return {
        code,
        name: course ? (isEnglish ? course.nameEn ?? course.name : course.nameAr ?? course.name) : code,
        creditHours: course?.creditHours ?? 0,
        type: course?.type ?? 'required',
      };
    });
  }, [latestRegistration, courses, isEnglish]);

  const printRegistration = async (registration?: Registration | null, action: 'print' | 'download' | 'view' = 'print') => {
    if (!registration) return;
    const printWindow = action === 'print' ? window.open('about:blank', '_blank') : null;
    if (action === 'print' && !printWindow) {
      toast.error(isEnglish ? 'Allow pop-ups to open the registration sheet' : 'يرجى السماح بالنوافذ المنبثقة');
      return;
    }
    try {
      const data = await getRegistrationPrintData(registration._id);
      if (action === 'view') {
        setActiveSlipForm(data);
        setViewSlipOpen(true);
      } else if (action === 'download') {
        await downloadRegistrationPdf(data, isEnglish ? 'en' : 'ar');
      } else {
        if (!openRegistrationPrintView(data, action, isEnglish ? 'en' : 'ar', printWindow)) {
          toast.error(isEnglish ? 'Allow pop-ups to open the registration sheet' : 'يرجى السماح بالنوافذ المنبثقة لفتح استمارة التسجيل');
        }
      }
    } catch {
      printWindow?.close();
      toast.error(isEnglish ? 'Failed to prepare registration PDF' : 'فشل تجهيز استمارة التسجيل أو ملف PDF');
    }
  };

  const handleDirectSubmit = async () => {
    setSubmitting(true);
    try {
      const newReg = await submitDirectRegistration(selected);
      toast.success(isEnglish ? 'Registration successful' : 'تم تسجيل المواد بنجاح');
      void queryClient.invalidateQueries({ queryKey: registrationKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['student-syllabi'] });
      if (newReg) await printRegistration(newReg, 'view');
    } catch {
      toast.error(isEnglish ? 'Registration failed' : 'فشل تسجيل المواد');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestAdvising = async () => {
    setRequestingAdvising(true);
    try {
      await requestAdvising();
      router.push(`/${locale}/dashboard/academic-advising`);
    } catch {
      toast.error(isEnglish ? 'Failed to open advising request' : 'فشل فتح طلب الإرشاد');
    } finally {
      setRequestingAdvising(false);
    }
  };

  const handleAcknowledgeAndSubmitApprovedPlan = async () => {
    setSubmittingApprovedPlan(true);
    try {
      if (!advisingQuery.data?.approvedPlan?.studentAcknowledgedAt) {
        await acknowledgeAdvising();
      }
      const newReg = await submitApprovedPlan();
      toast.success(isEnglish ? 'The approved advising plan was registered successfully' : 'تم تسجيل خطة الإرشاد المعتمدة بنجاح');
      void queryClient.invalidateQueries({ queryKey: registrationKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['student-syllabi'] });
      if (newReg) await printRegistration(newReg, 'view');
    } catch {
      toast.error(isEnglish ? 'Failed to submit approved plan' : 'فشل تسجيل الخطة المعتمدة');
    } finally {
      setSubmittingApprovedPlan(false);
    }
  };

  if (eligibilityQuery.isLoading || (eligibility?.canRegisterDirectly && coursesQuery.isLoading)) {
    return <LoadingState title={isEnglish ? 'Loading...' : 'جاري التحميل...'} />;
  }

  const registrationVisible = portalSettingsQuery.data?.registrationVisible ?? true;

  if (portalSettingsQuery.data && !registrationVisible) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center space-y-4 animate-fade-in" dir={isEnglish ? 'ltr' : 'rtl'}>
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-sm">
          <BookOpenCheck className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-bold text-foreground">
          {isEnglish ? 'Course Registration Closed' : 'خدمة تسجيل المقررات غير متاحة'}
        </h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
          {isEnglish
            ? 'Course registration is currently disabled by institute administration. Please check back later or consult student affairs.'
            : 'خدمة تسجيل المقررات الدراسية مغلقة حالياً من قبل إدارة المعهد. يُرجى مراجعة إدارة شؤون الطلاب أو متابعة الإعلانات.'}
        </p>
        <div className="pt-2">
          <button
            type="button"
            onClick={() => router.push(`/${locale}/dashboard`)}
            className="rounded-squircle px-5 py-2.5 bg-primary text-primary-foreground text-xs font-semibold cursor-pointer shadow-md hover:bg-primary/90 transition-all"
          >
            {isEnglish ? 'Return to Dashboard' : 'العودة للوحة التحكم'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6" dir={isEnglish ? 'ltr' : 'rtl'}>
      <div className="relative flex flex-col justify-between gap-6 overflow-hidden rounded-2xl border border-primary/20 bg-linear-to-r from-teal-950/40 via-teal-900/20 to-transparent p-6 shadow-lg md:flex-row md:items-center">
        <div className="z-10 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-3 py-0.5 font-semibold text-xs text-primary">
              <BookOpenCheck className="h-3 w-3" />
              {isEnglish ? 'Academic Advising & Course Registration' : 'تسجيل المواد والإرشاد الأكاديمي'}
            </div>
            {eligibility && !eligibility.requiresAdvisor && (
              <div className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-0.5 font-medium text-xs text-emerald-400">
                <CheckCircle2 className="h-3 w-3" />
                {isEnglish ? 'Direct Registration Active' : 'مؤهل للتسجيل المباشر (وضع أكاديمي متميز)'}
              </div>
            )}
            {eligibility && eligibility.requiresAdvisor && (
              <div className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/15 px-2.5 py-0.5 font-medium text-xs text-amber-400">
                <ShieldAlert className="h-3 w-3" />
                {isEnglish ? 'Advising Required' : 'يتطلب مراجعة المرشد الأكاديمي'}
              </div>
            )}
          </div>
          <h2 className="font-bold text-foreground text-xl">
            {isEnglish ? 'GPA' : 'المعدل التراكمي'}: {eligibility?.gpa?.toFixed(2) ?? '-'} ·{' '}
            {isEnglish ? `Level ${eligibility?.academicLevel ?? '-'}` : `المستوى ${eligibility?.academicLevel ?? '-'}`} ·{' '}
            {eligibility?.semester === 'first'
              ? isEnglish ? 'First Semester' : 'الفصل الدراسي الأول'
              : eligibility?.semester === 'second'
                ? isEnglish ? 'Second Semester' : 'الفصل الدراسي الثاني'
                : eligibility?.semester === 'summer'
                  ? isEnglish ? 'Summer Semester' : 'الفصل الصيفي'
                  : eligibility?.semester ?? '-'}
          </h2>
          <p className="max-w-xl text-xs text-muted-foreground">
            {isEnglish
              ? 'Select eligible courses, review credit hours caps, and download registration slips'
              : 'اختر المواد التي ترغب في تسجيلها، راجع الحد الأقصى للساعات المعتمدة، واطبع كشف التسجيل الخاص بك.'}
          </p>
        </div>
        <div className="z-10 shrink-0 font-bold font-mono text-xs text-foreground rounded-xl border border-border bg-secondary/40 px-4 py-2.5 text-center">
          {isEnglish ? 'Courses' : 'المواد'}: {eligibility?.minCourses ?? '-'}–{eligibility?.maxCourses ?? '-'} ·{' '}
          {isEnglish ? 'Max hours' : 'الحد الأقصى للساعات'}: {eligibility?.maxCreditHours ?? '-'}
        </div>
      </div>

      {/* Active Scheduled Window Notice */}
      {eligibility?.registrationTerm?.isCurrentlyOpen && eligibility.registrationTerm.closesAt && (
        <div className="flex items-center gap-2.5 rounded-xl border border-teal-500/30 bg-teal-500/10 px-4 py-2.5 text-xs text-teal-300 shadow-sm">
          <Clock className="h-4 w-4 shrink-0 text-teal-400 animate-pulse" />
          <span className="font-semibold leading-relaxed">
            {isEnglish
              ? `Course registration is officially active until: ${new Date(eligibility.registrationTerm.closesAt).toLocaleString('en-US', { timeZone: 'Africa/Cairo', dateStyle: 'long', timeStyle: 'short' })}`
              : `فترة تسجيل المقررات مفتوحة حالياً ومتاحة حتى: ${new Date(eligibility.registrationTerm.closesAt).toLocaleString('ar-EG', { timeZone: 'Africa/Cairo', dateStyle: 'long', timeStyle: 'short' })}`}
          </span>
        </div>
      )}

      {/* When student already registered but registration window closed, show info notice */}
      {isAlreadyRegistered && !eligibility?.registrationTerm?.isCurrentlyOpen && (
        <div className="flex items-center gap-2 rounded-xl border border-border/80 bg-secondary/30 px-4 py-2.5 text-xs text-muted-foreground">
          <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
          <span>
            {isEnglish
              ? 'Course registration for this semester has concluded. You can review and print your confirmed registration slip below.'
              : 'انتهت فترة التسجيل لهذا الفصل. يمكنك استعراض وطباعة استمارة تسجيل المقررات المعتمدة الخاصة بك أدناه.'}
          </span>
        </div>
      )}

      {/* Registration Content or Scheduled Window Status Card */}
      {!isAlreadyRegistered && !eligibility?.registrationTerm?.isCurrentlyOpen ? (
        <div className="rounded-2xl border border-border/80 bg-card/50 backdrop-blur-sm p-8 text-center space-y-4 shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
            {eligibility?.registrationTerm?.opensAt && new Date() < new Date(eligibility.registrationTerm.opensAt) ? (
              <Clock className="h-7 w-7 text-amber-400" />
            ) : eligibility?.registrationTerm?.closesAt && new Date() > new Date(eligibility.registrationTerm.closesAt) ? (
              <Calendar className="h-7 w-7 text-rose-400" />
            ) : (
              <ShieldAlert className="h-7 w-7 text-amber-400" />
            )}
          </div>
          <div className="space-y-1.5 max-w-lg mx-auto">
            <h3 className="text-base font-bold text-foreground">
              {eligibility?.registrationTerm?.opensAt && new Date() < new Date(eligibility.registrationTerm.opensAt)
                ? isEnglish
                  ? 'Course Registration: Opening Soon'
                  : 'موعد فتح باب التسجيل: سيبدأ قريباً'
                : eligibility?.registrationTerm?.closesAt && new Date() > new Date(eligibility.registrationTerm.closesAt)
                  ? isEnglish
                    ? 'Registration Window Concluded'
                    : 'انتهت الفترة المحددة لتسجيل المقررات'
                  : isEnglish
                    ? 'Registration Portal Closed'
                    : 'نظام تسجيل المقررات مغلق حالياً'}
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {eligibility?.registrationTerm?.opensAt && new Date() < new Date(eligibility.registrationTerm.opensAt)
                ? isEnglish
                  ? `Course registration for this semester is scheduled to open on: ${new Date(eligibility.registrationTerm.opensAt).toLocaleString('en-US', { timeZone: 'Africa/Cairo', dateStyle: 'full', timeStyle: 'short' })}.`
                  : `من المقرر فتح باب تسجيل المواد للفصل الدراسي في: ${new Date(eligibility.registrationTerm.opensAt).toLocaleString('ar-EG', { timeZone: 'Africa/Cairo', dateStyle: 'full', timeStyle: 'short' })}.`
                : eligibility?.registrationTerm?.closesAt && new Date() > new Date(eligibility.registrationTerm.closesAt)
                  ? isEnglish
                    ? `The official enrollment period concluded on: ${new Date(eligibility.registrationTerm.closesAt).toLocaleString('en-US', { timeZone: 'Africa/Cairo', dateStyle: 'full', timeStyle: 'short' })}. Course additions or adjustments are currently locked.`
                    : `انتهت الفترة الرسمية المحددة لتسجيل وتعديل المواد في: ${new Date(eligibility.registrationTerm.closesAt).toLocaleString('ar-EG', { timeZone: 'Africa/Cairo', dateStyle: 'full', timeStyle: 'short' })}. تم تجميد كشوف التسجيل لحين إشعار آخر.`
                  : isEnglish
                    ? 'Course registration is temporarily closed by the academic affairs administration.'
                    : 'تم إيقاف استقبال طلبات تسجيل المقررات مؤقتاً بقرار من الشؤون الأكاديمية.'}
            </p>
          </div>
        </div>
      ) : eligibility?.requiresAdvisor ? (
        <AdvisingRequiredCard
          localizedPolicyWarnings={localizedPolicyWarnings}
          advising={advisingQuery.data?.request ?? eligibility?.advisingRequest}
          approvedAdvisorPlan={advisingQuery.data?.registration}
          approvedAcademicPlan={advisingQuery.data?.approvedPlan}
          isEnglish={isEnglish}
          submittingApprovedPlan={submittingApprovedPlan}
          onAcknowledgeAndSubmitPlan={handleAcknowledgeAndSubmitApprovedPlan}
          onPrintAction={printRegistration}
        />
      ) : isAlreadyRegistered && latestRegistration ? (
        <CompletedRegistrationCard
          registration={latestRegistration}
          eligibility={eligibility}
          registeredCourseDetails={registeredCourseDetails}
          isEnglish={isEnglish}
          onPrintAction={printRegistration}
        />
      ) : (
        <DirectRegistrationTable
          courses={courses}
          eligibility={eligibility}
          selected={selected}
          setSelected={setSelected}
          selectedHours={selectedHours}
          isEnglish={isEnglish}
          submitting={submitting}
          requestingAdvising={requestingAdvising}
          onSubmitRegistration={handleDirectSubmit}
          onRequestAdvising={handleRequestAdvising}
        />
      )}

      <RegistrationHistoryCard
        history={registrationHistoryQuery.data ?? []}
        isEnglish={isEnglish}
        onPrintAction={printRegistration}
      />

      <Dialog open={viewSlipOpen} onOpenChange={setViewSlipOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEnglish ? 'Registration Slip Preview' : 'معاينة استمارة تسجيل المقررات'}</DialogTitle>
          </DialogHeader>
          {activeSlipForm && <RegistrationSlipView form={activeSlipForm} locale={locale} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
