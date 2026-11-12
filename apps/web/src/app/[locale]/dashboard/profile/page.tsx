'use client';
import { PasskeyManager } from '@/components/auth/passkey-manager';
import { SessionManager } from '@/components/auth/session-manager';

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import api, { getApiErrorDetails, getApiErrorMessage } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { LoadingState, ErrorState, AlertMessage } from '@/components/ui/feedback';
import { PasswordInput } from '@/components/ui/password-input';
import { CopyButton } from '@/components/ui/copy-button';
import { useGoogleSignIn } from '@/hooks/use-google-signin';
import {
  Loader2,
  GraduationCap,
  Key,
  Mail,
  Phone,
  Lock,
  Calendar,
  Building2,
  Layers,
  Users2,
  Hash,
  Fingerprint,
  Link2,
  Unlink,
  XCircle,
  MapPin,
  ShieldCheck,
  Check,
  X,
  AlertCircle,
  Edit3,
  BadgeCheck,
  AlertTriangle,
  ExternalLink,
  Award,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import {
  getGpaScale,
  isValidStudentPassword,
  STUDENT_PASSWORD_MAX_LENGTH,
  STUDENT_PASSWORD_MIN_LENGTH,
} from '@student-portal/shared';

interface StudentProfile {
  _id: string;
  studentCode: string;
  fullName: string;
  fullNameAr?: string;
  fullNameEn?: string;
  nationalIdMasked: string;
  department?: string;
  level: string;
  group?: string;
  section?: string;
  academicYear: string;
  semester: string;
  seatNumber?: string;
  examRoom?: string;
  examFloor?: string;
  examBuilding?: string;
  enrollmentStatus: string;
  email: string;
  phone: string;
  googleEmail: string;
  googleLinkedAt?: string;
  googleLinkPending: boolean;
  academicWarnings?: number;
  gpa?: number;
  completedCreditHours?: number;
  completedCoursesCount?: number;
}

interface GoogleLinkStartResponse {
  googleEmail?: string;
  googleLinkPending?: boolean;
  emailDeliveryStatus?: 'sent' | 'failed';
  devOtp?: string;
  message?: string;
}

function isPasswordChangeRequiredError(error: unknown) {
  const details = getApiErrorDetails(error);
  return (
    details.statusCode === 403 &&
    details.message.toLowerCase().includes('password change is required')
  );
}

export default function StudentProfilePage() {
  const t = useTranslations('students');
  const tCommon = useTranslations('common');
  const tAuth = useTranslations('auth');

  // Active section tabs
  const [activeTab, setActiveTab] = useState<'academic' | 'contact' | 'security'>('academic');

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');
  const [emailDraft, setEmailDraft] = useState<string>();
  const [phoneDraft, setPhoneDraft] = useState<string>();
  const [contactLoading, setContactLoading] = useState(false);
  const [contactError, setContactError] = useState('');
  const [emailFieldError, setEmailFieldError] = useState('');
  const [phoneFieldError, setPhoneFieldError] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleUnlinking, setGoogleUnlinking] = useState(false);
  const [isEditingContact, setIsEditingContact] = useState(false);
  const [googleOtp, setGoogleOtp] = useState('');
  const [verifyingGoogleOtp, setVerifyingGoogleOtp] = useState(false);
  const [googleOtpError, setGoogleOtpError] = useState('');
  const [googleDevOtp, setGoogleDevOtp] = useState('');

  const profileQuery = useQuery({
    queryKey: ['student-profile'],
    queryFn: async () => {
      const res = await api.get<StudentProfile>('/students/me/profile');
      return res.data;
    },
  });

  const academicEmailQuery = useQuery({
    queryKey: ['student-academic-email'],
    queryFn: async () => {
      try {
        const res = await api.get<{
          _id: string;
          studentCode: string;
          studentName: string;
          academicEmail: string;
          status: 'active' | 'inactive';
        } | null>('/students/me/academic-email');
        return res.data;
      } catch {
        return null;
      }
    },
  });

  const isEnglish = tCommon('search') === 'Search...';

  // Password strength calculation
  const strengthChecks = useMemo(() => {
    return {
      length:
        newPassword.length >= STUDENT_PASSWORD_MIN_LENGTH &&
        newPassword.length <= STUDENT_PASSWORD_MAX_LENGTH,
      hasLetter: /[A-Za-z]/.test(newPassword),
      hasNumber: /[0-9]/.test(newPassword),
      hasSpecial: /[^A-Za-z0-9]/.test(newPassword),
      hasNoWhitespace: !/\s/.test(newPassword),
    };
  }, [newPassword]);

  const strengthScore = useMemo(() => {
    let score = 0;
    if (strengthChecks.length) score += 25;
    if (strengthChecks.hasLetter) score += 25;
    if (strengthChecks.hasNumber) score += 25;
    if (strengthChecks.hasSpecial) score += 25;
    return score;
  }, [strengthChecks]);

  const strengthLabel = useMemo(() => {
    if (!newPassword) return '';
    if (strengthScore <= 25) return isEnglish ? 'Weak' : 'ضعيفة';
    if (strengthScore <= 50) return isEnglish ? 'Fair' : 'مقبولة';
    if (strengthScore <= 75) return isEnglish ? 'Good' : 'جيدة';
    return isEnglish ? 'Very Strong' : 'قوية جداً';
  }, [strengthScore, newPassword, isEnglish]);

  const strengthColor = useMemo(() => {
    if (strengthScore <= 25) return 'bg-rose-500';
    if (strengthScore <= 50) return 'bg-amber-500';
    if (strengthScore <= 75) return 'bg-teal-400';
    return 'bg-emerald-500';
  }, [strengthScore]);

  const isMatching = useMemo(() => {
    if (!confirmPassword) return null;
    return newPassword === confirmPassword;
  }, [newPassword, confirmPassword]);

  useGoogleSignIn({
    locale: isEnglish ? 'en' : 'ar',
    onSuccess: async (credential, flow) => {
      setVerifyingGoogleOtp(true);
      try {
        await api.post('/auth/google/link/verify-oauth', { credential, ...flow });
        setGoogleDevOtp('');
        toast.success(
          isEnglish ? 'Google account linked successfully' : 'تم ربط حساب Google بنجاح'
        );
        void profileQuery.refetch();
      } catch (err: unknown) {
        toast.error(getApiErrorMessage(err, isEnglish ? 'Could not link Google account' : 'تعذر ربط حساب Google'));
      } finally {
        setVerifyingGoogleOtp(false);
      }
    },
  });


  const email = emailDraft ?? profileQuery.data?.email ?? '';
  const phone = phoneDraft ?? profileQuery.data?.phone ?? '';

  const EGYPTIAN_PHONE_REGEX = /^(?:(?:\+20|0020)?1[0125]\d{8}|01[0125]\d{8})$/;
  const REAL_DOMAIN_EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setContactError('');
    setEmailFieldError('');
    setPhoneFieldError('');

    const trimmedEmail = email.trim().toLowerCase();
    const cleanPhone = phone.trim().replace(/[\s-]/g, '');

    let hasError = false;

    if (trimmedEmail) {
      if (!REAL_DOMAIN_EMAIL_REGEX.test(trimmedEmail)) {
        const msg = isEnglish
          ? 'Invalid email format. Please enter a valid email with a real domain (e.g. student@gmail.com)'
          : 'البريد الإلكتروني غير صحيح. يجب إدخال بريد إلكتروني بنطاق حقيقي رسمي (مثل student@gmail.com أو name@bhi.edu.eg)';
        setEmailFieldError(msg);
        setContactError(msg);
        hasError = true;
      }
    }

    if (cleanPhone) {
      if (!EGYPTIAN_PHONE_REGEX.test(cleanPhone)) {
        const msg = isEnglish
          ? 'Invalid phone number. Must be an 11-digit Egyptian mobile number starting with 010, 011, 012, or 015'
          : 'رقم الهاتف غير صحيح. يجب أن يكون رقماً مصرياً مكوناً من 11 رقماً ويبدأ بـ 010 أو 011 أو 012 أو 015 (مثال: 01012345678)';
        setPhoneFieldError(msg);
        if (!hasError) setContactError(msg);
        hasError = true;
      }
    }

    if (!trimmedEmail && !cleanPhone) {
      const msg = isEnglish
        ? 'Please enter at least an email address or a mobile phone number.'
        : 'يرجى إدخال البريد الإلكتروني أو رقم الهاتف المحمول على الأقل.';
      setContactError(msg);
      hasError = true;
    }

    if (hasError) return;

    setContactLoading(true);

    try {
      await api.patch('/students/me/contact', {
        email: trimmedEmail || undefined,
        phone: cleanPhone || undefined,
      });
      setEmailDraft(undefined);
      setPhoneDraft(undefined);
      setEmailFieldError('');
      setPhoneFieldError('');
      setIsEditingContact(false);
      toast.success(isEnglish ? 'Contact information updated' : 'تم تحديث بيانات التواصل بنجاح');
      void profileQuery.refetch();
    } catch (err: unknown) {
      setContactError(getApiErrorMessage(err, isEnglish ? 'Could not update contact information' : 'تعذر تحديث بيانات التواصل'));
    } finally {
      setContactLoading(false);
    }
  };

  const handleCancelContactEdit = () => {
    setEmailDraft(undefined);
    setPhoneDraft(undefined);
    setEmailFieldError('');
    setPhoneFieldError('');
    setContactError('');
    setIsEditingContact(false);
  };

  const handleGoogleLink = async () => {
    if (!email.trim()) {
      setContactError(isEnglish ? 'Add your Gmail first.' : 'أضف بريد Gmail أولاً.');
      return;
    }

    setGoogleLoading(true);
    setContactError('');
    try {
      const res = await api.post<GoogleLinkStartResponse>('/auth/google/link/start', { email: email.trim() });
      const response = res.data;
      setGoogleOtp('');
      setGoogleDevOtp(response.devOtp ?? '');
      if (response.emailDeliveryStatus === 'failed' && response.devOtp) {
        toast.warning(isEnglish ? 'Email delivery failed. Use the dev OTP shown below.' : 'تعذر إرسال البريد. استخدم رمز التطوير المعروض.');
      }
      toast.success(isEnglish ? 'Google account saved for linking' : 'تم حفظ حساب Google للربط');
      void profileQuery.refetch();
    } catch (err: unknown) {
      setContactError(getApiErrorMessage(err, isEnglish ? 'Could not start Google linking' : 'تعذر بدء ربط Google'));
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleVerifyGoogleOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (googleOtp.length !== 6 || !/^\d+$/.test(googleOtp)) {
      setGoogleOtpError(isEnglish ? 'OTP must be exactly 6 digits.' : 'يجب أن يتكون رمز التحقق من 6 أرقام.');
      return;
    }
    setVerifyingGoogleOtp(true);
    setGoogleOtpError('');
    try {
      await api.post('/auth/google/link/verify-otp', { otp: googleOtp });
      setGoogleDevOtp('');
      toast.success(isEnglish ? 'Google account linked successfully' : 'تم ربط حساب Google بنجاح');
      setGoogleOtp('');
      void profileQuery.refetch();
    } catch (err: unknown) {
      setGoogleOtpError(getApiErrorMessage(err, isEnglish ? 'Invalid OTP' : 'رمز التحقق غير صحيح'));
    } finally {
      setVerifyingGoogleOtp(false);
    }
  };

  const handleUnlinkGoogle = async () => {
    setGoogleUnlinking(true);
    setContactError('');
    setGoogleOtpError('');
    try {
      await api.delete('/auth/google/link');
      setGoogleDevOtp('');
      setGoogleOtp('');
      toast.success(
        isEnglish
          ? 'Google account link removed'
          : 'تم إلغاء ربط حساب Google'
      );
      void profileQuery.refetch();
    } catch (err: unknown) {
      setContactError(
        getApiErrorMessage(
          err,
          isEnglish
            ? 'Could not remove Google link'
            : 'تعذر إلغاء ربط حساب Google'
        )
      );
    } finally {
      setGoogleUnlinking(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    setPwSuccess('');

    if (!isValidStudentPassword(newPassword)) {
      setPwError(
        isEnglish
          ? 'Password must be 8-100 characters with at least one letter and one number, no spaces.'
          : 'يجب أن تتكون كلمة المرور من 8 أحرف على الأقل، وتحتوي على حرف ورقم وبدون مسافات.'
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setPwError(
        isEnglish
          ? 'Passwords do not match'
          : 'كلمتا المرور غير متطابقتين'
      );
      return;
    }

    setPwLoading(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword,
        newPassword,
      });
      setPwSuccess(
        isEnglish
          ? 'Password updated successfully'
          : 'تم تحديث كلمة المرور بنجاح'
      );
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success(isEnglish ? 'Password changed successfully' : 'تم تغيير كلمة المرور بنجاح');
      void profileQuery.refetch();
    } catch (err: unknown) {
      setPwError(getApiErrorMessage(err, isEnglish ? 'Failed to update password' : 'فشل تغيير كلمة المرور'));
    } finally {
      setPwLoading(false);
    }
  };

  if (profileQuery.isLoading) {
    return <LoadingState title={tCommon('loading')} />;
  }

  if (profileQuery.isError) {
    if (isPasswordChangeRequiredError(profileQuery.error)) {
      return (
        <div className="mx-auto max-w-xl space-y-6 animate-fade-in" dir={isEnglish ? 'ltr' : 'rtl'}>
          <div className="space-y-1">
            <h2 className="flex items-center gap-2 text-2xl font-bold text-foreground">
              <Key className="h-6 w-6 text-primary animate-pulse" />
              <span>{tAuth('changePassword')}</span>
            </h2>
            <p className="text-sm text-muted-foreground">
              {isEnglish
                ? 'Your initial password must be changed before opening the student portal.'
                : 'يجب تغيير كلمة المرور الافتراضية قبل فتح بوابة الطالب.'}
            </p>
          </div>

          <Card className="p-6 bg-card/60 backdrop-blur-md border-border/70 shadow-xl space-y-5 rounded-2xl">
            {pwError && <AlertMessage tone="danger">{pwError}</AlertMessage>}
            {pwSuccess && <AlertMessage tone="success">{pwSuccess}</AlertMessage>}

            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="space-y-1.5 text-start">
                <label className="text-xs font-bold text-foreground">
                  {tAuth('currentPassword')}
                </label>
                <PasswordInput
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full h-11 bg-secondary/50 border-border text-foreground outline-none transition-colors"
                />
              </div>

              <div className="space-y-1.5 text-start">
                <label className="text-xs font-bold text-foreground">
                  {tAuth('newPassword')}
                </label>
                <PasswordInput
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full h-11 bg-secondary/50 border-border text-foreground outline-none transition-colors"
                />
              </div>

              <div className="space-y-1.5 text-start">
                <label className="text-xs font-bold text-foreground">
                  {tAuth('confirmPassword')}
                </label>
                <PasswordInput
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full h-11 bg-secondary/50 border-border text-foreground outline-none transition-colors"
                />
              </div>

              <Button
                type="submit"
                disabled={pwLoading}
                className="w-full h-11 text-sm font-semibold bg-primary hover:bg-primary/80 text-primary-foreground transition-all cursor-pointer flex items-center justify-center gap-2 mt-2 rounded-squircle"
              >
                {pwLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                <span>{tAuth('changePassword')}</span>
              </Button>
            </form>
          </Card>
        </div>
      );
    }

    return (
      <ErrorState
        description={getApiErrorMessage(profileQuery.error)}
        error={profileQuery.error}
        onRetry={() => profileQuery.refetch()}
      />
    );
  }

  const profile = profileQuery.data;

  if (!profile) {
    return <ErrorState title={tCommon('noData')} />;
  }

  const googleStatus = profile.googleLinkedAt
    ? 'linked'
    : profile.googleLinkPending
      ? 'pending'
      : 'unlinked';


  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12" dir={isEnglish ? 'ltr' : 'rtl'}>
      {/* ─── Hero Profile Header Banner ─── */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <Card className="relative overflow-hidden rounded-3xl border border-border/80 bg-linear-to-br from-card/80 via-card/50 to-primary/5 p-6 md:p-8 backdrop-blur-xl shadow-xl">
          {/* Ambient Glow Orbs */}
          <div className="absolute -top-24 inset-e-0 w-72 h-72 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 inset-s-0 w-72 h-72 rounded-full bg-teal-500/10 blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            {/* Student Identity Left/Start */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
              <div className="relative group">
                <div className="flex h-20 w-20 md:h-24 md:w-24 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-primary/25 via-teal-500/20 to-sky-500/20 text-primary border border-primary/30 shadow-inner">
                  <GraduationCap className="h-10 w-10 md:h-12 md:w-12 text-primary" />
                </div>
                <div className="absolute -bottom-1 -inset-e-1 flex h-6 w-6 items-center justify-center rounded-full bg-background border border-border shadow-sm">
                  <BadgeCheck className="h-4 w-4 text-primary" />
                </div>
              </div>

              <div className="space-y-1.5 text-start">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="text-xl md:text-2xl font-extrabold text-foreground tracking-tight">
                    {profile.fullName}
                  </h1>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-0.5 text-xs font-semibold text-emerald-400">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>{isEnglish ? 'Active Student' : 'طالب مقيد'}</span>
                  </span>
                  {(profile.academicWarnings ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-0.5 text-xs font-semibold text-amber-400">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                      <span>
                        {isEnglish
                          ? `Academic Warning (${profile.academicWarnings})`
                          : `إنذار أكاديمي (${profile.academicWarnings})`}
                      </span>
                    </span>
                  )}
                </div>

                {profile.fullNameEn && profile.fullNameEn !== profile.fullName && (
                  <p className="text-xs font-medium text-muted-foreground" dir="ltr">
                    {profile.fullNameEn}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  {/* Student Code Badge with copy */}
                  <div className="inline-flex items-center gap-1.5 rounded-squircle bg-secondary/60 border border-border/80 px-2.5 py-1 text-xs">
                    <Hash className="h-3.5 w-3.5 text-primary" />
                    <span className="text-[11px] text-muted-foreground">{isEnglish ? 'Code:' : 'الكود:'}</span>
                    <span className="font-mono font-bold text-foreground">{profile.studentCode}</span>
                    <CopyButton
                      value={profile.studentCode}
                      label=""
                      successMessage={isEnglish ? 'Student code copied' : 'تم نسخ كود الطالب'}
                      className="h-6 px-1.5 border-none bg-transparent hover:bg-background/80"
                    />
                  </div>

                  {/* Level Pill */}
                  <span className="inline-flex items-center gap-1 rounded-squircle bg-primary/10 border border-primary/20 px-2.5 py-1 text-xs font-semibold text-primary">
                    <Layers className="h-3.5 w-3.5" />
                    <span>{isEnglish ? `Level ${profile.level}` : `المستوى ${profile.level}`}</span>
                  </span>

                  {/* Department Pill */}
                  {profile.department && (
                    <span className="inline-flex items-center gap-1 rounded-squircle bg-secondary/60 border border-border/70 px-2.5 py-1 text-xs font-medium text-foreground">
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{profile.department}</span>
                    </span>
                  )}

                  {/* Academic Email Pill with copy */}
                  {academicEmailQuery.data?.academicEmail && (
                    <div className="inline-flex items-center gap-1.5 rounded-squircle bg-secondary/60 border border-border/80 px-2.5 py-1 text-xs">
                      <Mail className="h-3.5 w-3.5 text-primary" />
                      <span className="font-mono text-xs font-semibold text-foreground" dir="ltr">
                        {academicEmailQuery.data.academicEmail}
                      </span>
                      <CopyButton
                        value={academicEmailQuery.data.academicEmail}
                        label=""
                        successMessage={isEnglish ? 'Academic email copied' : 'تم نسخ البريد الأكاديمي'}
                        className="h-6 px-1.5 border-none bg-transparent hover:bg-background/80"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Context Chips */}
            <div className="flex md:flex-col items-start md:items-end justify-between border-t md:border-t-0 md:border-s border-border/70 pt-4 md:pt-0 md:ps-6 gap-2">
              <div className="text-start md:text-end">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
                  {t('academicYear')}
                </span>
                <span className="font-mono text-sm font-bold text-foreground block">
                  {profile.academicYear}
                </span>
              </div>
              <div className="text-start md:text-end">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
                  {t('semester')}
                </span>
                <span className="text-xs font-bold text-primary block">
                  {isEnglish
                    ? profile.semester
                    : profile.semester === 'first'
                      ? 'الفصل الدراسي الأول'
                      : profile.semester === 'second'
                        ? 'الفصل الدراسي الثاني'
                        : 'الفصل الصيفي'}
                </span>
              </div>
            </div>
          </div>

          {/* Section Navigation Pills */}
          <div className="mt-6 flex flex-wrap gap-2 border-t border-border/60 pt-4">
            <button
              type="button"
              onClick={() => setActiveTab('academic')}
              className={`inline-flex items-center gap-2 rounded-squircle px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'academic'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              <GraduationCap className="h-4 w-4" />
              <span>{isEnglish ? 'Academic & Exams' : 'البيانات الأكاديمية والامتحانات'}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('contact')}
              className={`inline-flex items-center gap-2 rounded-squircle px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'contact'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              <Mail className="h-4 w-4" />
              <span>{isEnglish ? 'Contact & Google' : 'التواصل و Google'}</span>
              {googleStatus === 'linked' && (
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('security')}
              className={`inline-flex items-center gap-2 rounded-squircle px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'security'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              <Lock className="h-4 w-4" />
              <span>{isEnglish ? 'Password & Security' : 'كلمة المرور والأمان'}</span>
            </button>
          </div>
        </Card>
      </motion.div>

      {/* ─── Main Content Tabs ─── */}
      <div className="space-y-6">
        {/* TAB 1: ACADEMIC & EXAMS */}
        {activeTab === 'academic' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="space-y-6"
          >
            {/* Grid 0: Cumulative Academic Standing & Credit Hours */}
            <Card className="rounded-2xl border border-primary/30 bg-linear-to-br from-card/80 via-card/50 to-primary/5 p-6 backdrop-blur-md shadow-md space-y-4">
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Award className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground">
                      {isEnglish ? 'Cumulative Standing & Credit Hours' : 'المعدل التراكمي والساعات المعتمدة'}
                    </h3>
                    <p className="text-[11px] text-muted-foreground">
                      {isEnglish ? 'Official completed credits and academic standing' : 'الساعات المكتملة وحالة المعدل التراكمي المعتمد'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                {/* GPA Tile */}
                <div className="rounded-xl border border-border/70 bg-secondary/30 p-4 transition-all hover:bg-secondary/50">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                    {isEnglish ? 'Cumulative GPA' : 'المعدل التراكمي (GPA)'}
                  </span>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span dir="ltr" className="font-mono text-xl font-black text-foreground">
                      {typeof profile.gpa === 'number' && !isNaN(profile.gpa) ? profile.gpa.toFixed(2) : '—'}
                    </span>
                    {typeof profile.gpa === 'number' && profile.gpa > 0 && (
                      <span className="text-xs font-bold text-teal-400">
                        ({getGpaScale(profile.gpa).letter} - {isEnglish ? getGpaScale(profile.gpa).nameEn : getGpaScale(profile.gpa).nameAr})
                      </span>
                    )}
                  </div>
                </div>

                {/* Completed Credit Hours */}
                <div className="rounded-xl border border-teal-500/30 bg-teal-500/5 p-4 transition-all hover:bg-teal-500/10">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-teal-400 block">
                    {isEnglish ? 'Completed Credits' : 'الساعات المكتملة'}
                  </span>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="font-mono text-xl font-black text-teal-400">
                      {profile.completedCreditHours ?? 0}
                    </span>
                    <span className="text-xs text-muted-foreground font-normal">
                      {isEnglish ? 'credit hours' : 'ساعة معتمدة'}
                    </span>
                  </div>
                </div>

                {/* Completed Courses */}
                <div className="rounded-xl border border-border/70 bg-secondary/30 p-4 transition-all hover:bg-secondary/50">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                    {isEnglish ? 'Passed Courses' : 'المقررات المجتازة'}
                  </span>
                  <span className="mt-1 font-mono text-xl font-black text-foreground block">
                    {profile.completedCoursesCount ?? 0}
                  </span>
                </div>

                {/* Academic Warnings */}
                <div className="rounded-xl border border-border/70 bg-secondary/30 p-4 transition-all hover:bg-secondary/50">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                    {isEnglish ? 'Academic Warnings' : 'الإنذارات الأكاديمية'}
                  </span>
                  <span
                    className={cn(
                      'mt-1 font-mono text-xl font-black block',
                      (profile.academicWarnings ?? 0) > 0 ? 'text-amber-400' : 'text-emerald-400'
                    )}
                  >
                    {profile.academicWarnings ?? 0}
                  </span>
                </div>
              </div>
            </Card>

            {/* Grid 1: Academic Placement */}
            <Card className="rounded-2xl border border-border/80 bg-card/60 p-6 backdrop-blur-md shadow-md space-y-4">
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <GraduationCap className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground">
                      {isEnglish ? 'Institutional & Academic Record' : 'السجل الأكاديمي والسكاشن'}
                    </h3>
                    <p className="text-[11px] text-muted-foreground">
                      {isEnglish ? 'Core institutional enrollment details' : 'بيانات القيد والمستوى الدراسي المعتمدة'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                {/* National ID Tile */}
                <div className="rounded-xl border border-border/70 bg-secondary/30 p-4 transition-all hover:bg-secondary/50">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Fingerprint className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                        {t('nationalId')}
                      </span>
                      <div className="flex items-center justify-between gap-1 mt-0.5">
                        <span className="font-mono text-sm font-bold text-foreground" dir="ltr">
                          {profile.nationalIdMasked || '—'}
                        </span>
                        {profile.nationalIdMasked && (
                          <CopyButton
                            value={profile.nationalIdMasked}
                            label=""
                            successMessage={isEnglish ? 'ID Copied' : 'تم النسخ'}
                            className="h-6 w-6 p-0 border-none bg-transparent"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Level */}
                <div className="rounded-xl border border-border/70 bg-secondary/30 p-4 transition-all hover:bg-secondary/50">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-500/10 text-teal-400">
                      <Layers className="h-5 w-5" />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                        {t('level')}
                      </span>
                      <span className="text-sm font-bold text-foreground mt-0.5 block">
                        {isEnglish ? `Level ${profile.level}` : `المستوى / المستوى ${profile.level}`}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Department */}
                <div className="rounded-xl border border-border/70 bg-secondary/30 p-4 transition-all hover:bg-secondary/50">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                        {t('department')}
                      </span>
                      <span className="text-sm font-bold text-foreground mt-0.5 block truncate">
                        {profile.department || '—'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Group */}
                <div className="rounded-xl border border-border/70 bg-secondary/30 p-4 transition-all hover:bg-secondary/50">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
                      <Users2 className="h-5 w-5" />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                        {t('group')}
                      </span>
                      <span className="text-sm font-bold text-foreground mt-0.5 block">
                        {profile.group || '—'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Section */}
                <div className="rounded-xl border border-border/70 bg-secondary/30 p-4 transition-all hover:bg-secondary/50">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400">
                      <Hash className="h-5 w-5" />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                        {t('section')}
                      </span>
                      <span className="text-sm font-bold text-foreground mt-0.5 block">
                        {profile.section || '—'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Academic Year */}
                <div className="rounded-xl border border-border/70 bg-secondary/30 p-4 transition-all hover:bg-secondary/50">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                      <Calendar className="h-5 w-5" />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                        {t('academicYear')}
                      </span>
                      <span className="font-mono text-sm font-bold text-foreground mt-0.5 block">
                        {profile.academicYear}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            {/* Grid 2: Examination & Seating Placement */}
            <Card className="rounded-2xl border border-border/80 bg-card/60 p-6 backdrop-blur-md shadow-md space-y-4">
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500/10 text-teal-400">
                    <MapPin className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground">
                      {isEnglish ? 'Exam Seating & Hall Location' : 'بيانات لجنة الامتحانات ورقم الجلوس'}
                    </h3>
                    <p className="text-[11px] text-muted-foreground">
                      {isEnglish ? 'Assigned seat and hall location for midterms and finals' : 'مكان اللجنة ورقم المقعد المخصص للاختبارات'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
                {/* Seat Number */}
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-primary block">
                    {t('seatNumber')}
                  </span>
                  <div className="flex items-center justify-between gap-1 mt-1">
                    <span className="font-mono text-lg font-extrabold text-foreground">
                      {profile.seatNumber || '—'}
                    </span>
                    {profile.seatNumber && (
                      <CopyButton
                        value={profile.seatNumber}
                        label=""
                        successMessage={isEnglish ? 'Seat number copied' : 'تم نسخ رقم الجلوس'}
                        className="h-6 w-6 p-0 border-none bg-transparent"
                      />
                    )}
                  </div>
                </div>

                {/* Exam Room / Hall */}
                <div className="rounded-xl border border-border/70 bg-secondary/30 p-4">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                    {isEnglish ? 'Exam Hall / Room' : 'القاعة / المدرج'}
                  </span>
                  <span className="text-sm font-bold text-foreground mt-1 block">
                    {profile.examRoom || '—'}
                  </span>
                </div>

                {/* Exam Floor */}
                <div className="rounded-xl border border-border/70 bg-secondary/30 p-4">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                    {isEnglish ? 'Floor' : 'الدور / الطابق'}
                  </span>
                  <span className="text-sm font-bold text-foreground mt-1 block">
                    {profile.examFloor || '—'}
                  </span>
                </div>

                {/* Exam Building */}
                <div className="rounded-xl border border-border/70 bg-secondary/30 p-4">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                    {isEnglish ? 'Building' : 'المبنى'}
                  </span>
                  <span className="text-sm font-bold text-foreground mt-1 block">
                    {profile.examBuilding || '—'}
                  </span>
                </div>
              </div>
            </Card>
          </motion.div>
        )}

        {/* TAB 2: CONTACT & GOOGLE */}
        {activeTab === 'contact' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="space-y-6"
          >
            {/* Dedicated Institutional Academic Email Card */}
            <Card className="rounded-2xl border border-border/80 bg-card/60 p-6 backdrop-blur-md shadow-md space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/60 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Mail className="h-6 w-6" />
                  </div>
                  <div className="space-y-0.5">
                    <h3 className="font-bold text-foreground text-sm sm:text-base">
                      {isEnglish ? 'Institutional Academic Email (Microsoft 365)' : 'البريد الإلكتروني الأكاديمي الرسمي (مايكروسوفت 365)'}
                    </h3>
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                      {isEnglish ? 'Official student account for academic services & Office 365 apps' : 'الحساب المعتمد للخدمات الطلابية وتطبيقات مايكروسوفت أوفيس'}
                    </p>
                  </div>
                </div>
                <span
                  className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold self-start sm:self-center border ${
                    academicEmailQuery.data?.status === 'active'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-muted text-muted-foreground border-border'
                  }`}
                >
                  {academicEmailQuery.data?.status === 'active'
                    ? (isEnglish ? 'Active' : 'نشط ومفعل')
                    : (isEnglish ? 'Pending Provisioning' : 'قيد التجهيز')}
                </span>
              </div>

              {academicEmailQuery.data?.academicEmail ? (
                <div className="space-y-4">
                  <div className="space-y-1.5 text-start">
                    <label className="text-xs font-bold text-foreground">
                      {isEnglish ? 'Assigned Academic Email Address' : 'عنوان البريد الأكاديمي المخصص لك'}
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        readOnly
                        value={academicEmailQuery.data.academicEmail}
                        dir="ltr"
                        style={{ paddingRight: '6.5rem', paddingLeft: '1rem', textAlign: 'left' }}
                        className="w-full rounded-xl border border-border bg-secondary/50 py-3 font-mono text-sm font-semibold text-foreground outline-none focus:border-primary/50 transition-colors text-left"
                      />
                      <div
                        className="absolute top-1/2 -translate-y-1/2 z-10"
                        style={{ right: '0.75rem', left: 'auto' }}
                      >
                        <CopyButton
                          value={academicEmailQuery.data.academicEmail}
                          label={isEnglish ? 'Copy' : 'نسخ'}
                          successMessage={isEnglish ? 'Academic email copied' : 'تم نسخ البريد الأكاديمي'}
                          className="h-8 rounded-lg bg-card hover:bg-secondary border border-border px-3 text-xs font-bold shadow-xs"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 pt-1">
                    <a
                      href="https://mail.google.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-squircle bg-primary hover:bg-primary/85 py-3 text-xs sm:text-sm font-bold text-primary-foreground shadow-sm transition-all cursor-pointer"
                    >
                      <Mail className="h-4 w-4" />
                      <span>{isEnglish ? 'Open Google Mail (Gmail)' : 'الدخول إلى بريد Google المؤسسي (Gmail)'}</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>

                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs text-muted-foreground space-y-1.5 text-start">
                    <p className="font-semibold text-foreground">
                      {isEnglish ? '📌 Google Workspace Sign-in Guidelines:' : '📌 تعليمات تسجيل الدخول إلى Google Workspace:'}
                    </p>
                    <p>
                      {isEnglish
                        ? '1. Initial default password is your 14-digit National ID as registered in your official file.'
                        : '1. كلمة المرور الافتراضية الأولى لحسابك هي الرقم القومي الكامل المكون من 14 رقماً.'}
                    </p>
                    <p>
                      {isEnglish
                        ? '2. Grants full access to Google Workspace apps (Gmail, Drive, Meet, Classroom).'
                        : '2. يمنحك وصولاً كاملاً لتطبيقات Google Workspace (Gmail, Drive, Meet, Classroom).'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-border bg-secondary/20 p-4 text-center text-xs text-muted-foreground">
                  {isEnglish
                    ? 'Your academic email is being provisioned. Please contact student affairs or IT center.'
                    : 'جاري إنشاء البريد الأكاديمي المخصص لك. يرجى مراجعة إدارة شؤون الطلاب أو مركز تكنولوجيا المعلومات.'}
                </div>
              )}
            </Card>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Contact Details Card */}
            <Card className="rounded-2xl border border-border/80 bg-card/60 p-6 backdrop-blur-md shadow-md space-y-5">
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Mail className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground">
                      {isEnglish ? 'Personal Contact Information' : 'بيانات التواصل الشخصية'}
                    </h3>
                    <p className="text-[11px] text-muted-foreground">
                      {isEnglish ? 'Used for important notices and notifications' : 'تستخدم للإشعارات الإدارية والتواصل السريع'}
                    </p>
                  </div>
                </div>

                {!isEditingContact && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditingContact(true)}
                    className="gap-1.5 rounded-squircle text-xs font-semibold"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    <span>{isEnglish ? 'Edit Info' : 'تعديل البيانات'}</span>
                  </Button>
                )}
              </div>

              {contactError && <AlertMessage tone="danger">{contactError}</AlertMessage>}

              <form onSubmit={handleContactSubmit} className="space-y-4">
                {/* Email Field */}
                <div className="space-y-1.5 text-start">
                  <label className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{isEnglish ? 'Personal Email Address' : 'البريد الإلكتروني الشخصي'}</span>
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmailDraft(e.target.value);
                      if (emailFieldError) setEmailFieldError('');
                      if (contactError) setContactError('');
                    }}
                    placeholder="student@gmail.com"
                    disabled={!isEditingContact}
                    className={`w-full rounded-squircle border bg-secondary/40 px-4 py-2.5 text-sm text-foreground outline-none transition-colors disabled:opacity-75 disabled:cursor-not-allowed ${
                      emailFieldError
                        ? 'border-rose-500 focus:border-rose-500'
                        : 'border-border focus:border-primary/50'
                    }`}
                    dir="ltr"
                  />
                  {emailFieldError && (
                    <p className="text-xs text-rose-500 font-medium flex items-center gap-1.5 mt-1">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      <span>{emailFieldError}</span>
                    </p>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    {isEnglish
                      ? 'Preferably use a valid Gmail address to enable 1-click Google Sign-in.'
                      : 'يفضل استخدام بريد Gmail مفعل لتمكين تسجيل الدخول السريع بضغطة واحدة.'}
                  </p>
                </div>

                {/* Phone Field */}
                <div className="space-y-1.5 text-start">
                  <label className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{isEnglish ? 'Mobile Phone Number' : 'رقم الهاتف المحمول'}</span>
                  </label>
                  <input
                    type="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={(e) => {
                      setPhoneDraft(e.target.value.replace(/[^\d+]/g, '').slice(0, 15));
                      if (phoneFieldError) setPhoneFieldError('');
                      if (contactError) setContactError('');
                    }}
                    placeholder="01012345678"
                    disabled={!isEditingContact}
                    className={`w-full rounded-squircle border bg-secondary/40 px-4 py-2.5 text-sm font-mono text-foreground outline-none transition-colors disabled:opacity-75 disabled:cursor-not-allowed ${
                      phoneFieldError
                        ? 'border-rose-500 focus:border-rose-500'
                        : 'border-border focus:border-primary/50'
                    }`}
                    dir="ltr"
                  />
                  {phoneFieldError && (
                    <p className="text-xs text-rose-500 font-medium flex items-center gap-1.5 mt-1">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      <span>{phoneFieldError}</span>
                    </p>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    {isEnglish
                      ? 'Egyptian mobile number: 11 digits starting with 010, 011, 012, or 015'
                      : 'رقم هاتف محمول مصري: 11 رقماً يبدأ بـ 010 أو 011 أو 012 أو 015'}
                  </p>
                </div>

                {isEditingContact && (
                  <div className="flex gap-2 pt-2">
                    <Button
                      type="submit"
                      disabled={contactLoading}
                      className="flex-1 h-10 text-xs font-bold bg-primary hover:bg-primary/85 text-primary-foreground rounded-squircle"
                    >
                      {contactLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      <span>{isEnglish ? 'Save Changes' : 'حفظ التعديلات'}</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleCancelContactEdit}
                      disabled={contactLoading}
                      className="flex-1 h-10 text-xs font-bold rounded-squircle"
                    >
                      <span>{isEnglish ? 'Cancel' : 'إلغاء'}</span>
                    </Button>
                  </div>
                )}
              </form>
            </Card>

            {/* Google Single Sign-On Setup Card */}
            <Card className="rounded-2xl border border-border/80 bg-card/60 p-6 backdrop-blur-md shadow-md space-y-5">
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400">
                    <svg className="h-4 w-4" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground">
                      {isEnglish ? 'Google Account Integration' : 'الربط المباشر مع حساب Google'}
                    </h3>
                    <p className="text-[11px] text-muted-foreground">
                      {isEnglish ? 'Sign in seamlessly without typing passwords' : 'تسجيل الدخول المباشر للبوابة بضغطة واحدة'}
                    </p>
                  </div>
                </div>

                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    googleStatus === 'linked'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : googleStatus === 'pending'
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {googleStatus === 'linked' && <Check className="h-3 w-3" />}
                  <span>
                    {googleStatus === 'linked'
                      ? (isEnglish ? 'Linked' : 'مرتبط')
                      : googleStatus === 'pending'
                        ? (isEnglish ? 'Pending OTP' : 'معلق')
                        : (isEnglish ? 'Not Linked' : 'غير مرتبط')}
                  </span>
                </span>
              </div>

              {/* Status Banner */}
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
                <p className="text-xs text-foreground leading-relaxed">
                  {profile.googleLinkedAt ? (
                    isEnglish ? (
                      `Your student account is successfully linked to: ${profile.googleEmail || email}`
                    ) : (
                      `حسابك الأكاديمي مرتبط ومفعل بالبريد: ${profile.googleEmail || email}`
                    )
                  ) : profile.googleLinkPending ? (
                    isEnglish ? (
                      `Pending Google OTP verification for: ${profile.googleEmail || email}`
                    ) : (
                      `في انتظار التحقق من رمز OTP للبريد: ${profile.googleEmail || email}`
                    )
                  ) : (
                    isEnglish ? (
                      'Link your personal Gmail to log into your student portal directly with Google.'
                    ) : (
                      'اربط بريد Gmail لتسجيل الدخول السريع لبوابة الطالب بدون الحاجة لكتابة كلمة المرور.'
                    )
                  )}
                </p>

                {googleStatus !== 'linked' && (
                  <Button
                    type="button"
                    disabled={googleLoading || !email.trim()}
                    onClick={handleGoogleLink}
                    className="w-full h-10 text-xs font-bold gap-2 rounded-squircle"
                  >
                    {googleLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Link2 className="h-4 w-4" />
                    )}
                    <span>
                      {googleStatus === 'pending'
                        ? (isEnglish ? 'Resend or Update Google Email' : 'إعادة إرسال الرمز أو تغيير البريد')
                        : (isEnglish ? 'Start Google Link Process' : 'بدء ربط حساب Google')}
                    </span>
                  </Button>
                )}

                {/* OTP Verification Box */}
                {profile.googleLinkPending && (
                  <div className="border-t border-border/70 pt-3 space-y-3">
                    {googleDevOtp && (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 flex items-center justify-between text-xs">
                        <span className="text-amber-300">{isEnglish ? 'Local Dev OTP:' : 'رمز التطوير (Dev OTP):'}</span>
                        <span className="font-mono font-bold text-amber-200 tracking-widest" dir="ltr">
                          {googleDevOtp}
                        </span>
                      </div>
                    )}

                    <form onSubmit={handleVerifyGoogleOtp} className="space-y-3">
                      <div className="space-y-1 text-start">
                        <label className="text-[11px] font-bold text-foreground block">
                          {isEnglish ? 'Enter 6-digit OTP from email' : 'أدخل رمز التحقق (OTP) المرسل لبريدك'}
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={6}
                          required
                          value={googleOtp}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (/^\d*$/.test(val) && val.length <= 6) {
                              setGoogleOtp(val);
                            }
                          }}
                          placeholder="123456"
                          className="w-full rounded-squircle border border-border bg-secondary/50 px-3.5 py-2 text-center text-sm font-mono tracking-widest text-foreground outline-none focus:border-primary/50 transition-colors"
                          dir="ltr"
                        />
                        {googleOtpError && (
                          <p className="text-[11px] font-semibold text-rose-500 mt-1">
                            {googleOtpError}
                          </p>
                        )}
                      </div>

                      <Button
                        type="submit"
                        disabled={verifyingGoogleOtp || googleOtp.length !== 6}
                        className="w-full h-9 text-xs font-bold rounded-squircle"
                      >
                        {verifyingGoogleOtp && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        <span>{isEnglish ? 'Verify OTP Code' : 'تأكيد رمز التحقق'}</span>
                      </Button>
                    </form>

                    <ConfirmDialog
                      trigger={
                        <Button
                          type="button"
                          variant="outline"
                          disabled={googleUnlinking}
                          className="w-full h-9 text-xs font-bold border-rose-500/30 text-rose-400 hover:bg-rose-500/10 rounded-squircle"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          <span>{isEnglish ? 'Cancel Google Setup' : 'إلغاء إعداد الربط'}</span>
                        </Button>
                      }
                      title={isEnglish ? 'Cancel Google setup?' : 'إلغاء إعداد الربط؟'}
                      description={
                        isEnglish
                          ? 'This removes the pending Google email and code. You can retry anytime.'
                          : 'سيتم حذف بريد Google المعلق ورمز التحقق. يمكنك البدء من جديد لاحقاً.'
                      }
                      confirmLabel={isEnglish ? 'Cancel setup' : 'إلغاء الإعداد'}
                      cancelLabel={isEnglish ? 'Keep setup' : 'إبقاء الإعداد'}
                      onConfirm={handleUnlinkGoogle}
                    />
                  </div>
                )}

                {/* Unlink Action when already linked */}
                {googleStatus === 'linked' && (
                  <ConfirmDialog
                    trigger={
                      <Button
                        type="button"
                        variant="outline"
                        disabled={googleUnlinking}
                        className="w-full h-10 text-xs font-bold border-rose-500/30 text-rose-400 hover:bg-rose-500/10 rounded-squircle"
                      >
                        {googleUnlinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}
                        <span>{isEnglish ? 'Unlink Google Account' : 'إلغاء ربط حساب Google'}</span>
                      </Button>
                    }
                    title={isEnglish ? 'Unlink Google account?' : 'إلغاء ربط حساب Google؟'}
                    description={
                      isEnglish
                        ? 'Google 1-click sign-in will stop working. You will continue to sign in with your password.'
                        : 'سيتوقف تسجيل الدخول السريع عبر Google لهذا الحساب. سيظل تسجيل الدخول بكلمة المرور متاحاً دائماً.'
                    }
                    confirmLabel={isEnglish ? 'Unlink' : 'إلغاء الربط'}
                    cancelLabel={isEnglish ? 'Keep linked' : 'إبقاء الربط'}
                    onConfirm={handleUnlinkGoogle}
                  />
                )}
              </div>
            </Card>
            </div>
          </motion.div>
        )}

        {/* TAB 3: SECURITY & PASSWORD */}
        {activeTab === 'security' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="grid grid-cols-1 gap-6 lg:grid-cols-12"
          >
            <div className="grid items-start gap-6 lg:col-span-12 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]"><SessionManager /><PasskeyManager /></div>
            {/* Password Change Form */}
            <Card className="lg:col-span-8 rounded-2xl border border-border/80 bg-card/60 p-6 backdrop-blur-md shadow-md space-y-5">
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Lock className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground">
                      {isEnglish ? 'Change Portal Password' : 'تحديث كلمة مرور البوابة'}
                    </h3>
                    <p className="text-[11px] text-muted-foreground">
                      {isEnglish
                        ? 'Keep your student account secure with a strong password'
                        : 'اختر كلمة مرور قوية وغير مكررة لحماية حسابك وبياناتك الأكاديمية'}
                    </p>
                  </div>
                </div>
              </div>

              {pwError && <AlertMessage tone="danger">{pwError}</AlertMessage>}
              {pwSuccess && <AlertMessage tone="success">{pwSuccess}</AlertMessage>}

              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                {/* Current Password */}
                <div className="space-y-1.5 text-start">
                  <label className="text-xs font-bold text-foreground">
                    {tAuth('currentPassword')} *
                  </label>
                  <PasswordInput
                    required
                    placeholder="••••••••••••"
                    value={currentPassword}
                    onChange={(e) => {
                      setCurrentPassword(e.target.value);
                      setPwError('');
                    }}
                    className="h-11 bg-secondary/40 border-border text-foreground rounded-squircle text-sm"
                  />
                </div>

                {/* New Password */}
                <div className="space-y-1.5 text-start">
                  <label className="text-xs font-bold text-foreground">
                    {tAuth('newPassword')} *
                  </label>
                  <PasswordInput
                    required
                    placeholder="••••••••••••"
                    minLength={STUDENT_PASSWORD_MIN_LENGTH}
                    maxLength={STUDENT_PASSWORD_MAX_LENGTH}
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value);
                      setPwError('');
                    }}
                    className="h-11 bg-secondary/40 border-border text-foreground rounded-squircle text-sm"
                  />

                  {/* Password Strength Meter */}
                  {newPassword && (
                    <div className="space-y-2 pt-2 animate-fade-in">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground">
                          {isEnglish ? 'Strength:' : 'قوة كلمة المرور:'}
                        </span>
                        <span className="font-bold text-foreground">{strengthLabel}</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                        <div
                          className={`h-full ${strengthColor} transition-all duration-300 rounded-full`}
                          style={{ width: `${strengthScore}%` }}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-1.5 pt-1 text-[11px]">
                        <div
                          className={`flex items-center gap-1.5 ${
                            strengthChecks.length ? 'text-emerald-400 font-medium' : 'text-muted-foreground'
                          }`}
                        >
                          {strengthChecks.length ? (
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                          ) : (
                            <X className="h-3.5 w-3.5" />
                          )}
                          <span>{isEnglish ? '8+ Characters' : '8 أحرف كحد أدنى'}</span>
                        </div>

                        <div
                          className={`flex items-center gap-1.5 ${
                            strengthChecks.hasLetter ? 'text-emerald-400 font-medium' : 'text-muted-foreground'
                          }`}
                        >
                          {strengthChecks.hasLetter ? (
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                          ) : (
                            <X className="h-3.5 w-3.5" />
                          )}
                          <span>{isEnglish ? 'Contains Letters' : 'تحتوي على حروف'}</span>
                        </div>

                        <div
                          className={`flex items-center gap-1.5 ${
                            strengthChecks.hasNumber ? 'text-emerald-400 font-medium' : 'text-muted-foreground'
                          }`}
                        >
                          {strengthChecks.hasNumber ? (
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                          ) : (
                            <X className="h-3.5 w-3.5" />
                          )}
                          <span>{isEnglish ? 'Contains Numbers' : 'تحتوي على أرقام'}</span>
                        </div>

                        <div
                          className={`flex items-center gap-1.5 ${
                            strengthChecks.hasNoWhitespace ? 'text-emerald-400 font-medium' : 'text-muted-foreground'
                          }`}
                        >
                          {strengthChecks.hasNoWhitespace ? (
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                          ) : (
                            <X className="h-3.5 w-3.5" />
                          )}
                          <span>{isEnglish ? 'No Spaces' : 'بدون مسافات'}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Confirm Password */}
                <div className="space-y-1.5 text-start">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-foreground">
                      {tAuth('confirmPassword')} *
                    </label>
                    {isMatching !== null && (
                      <span
                        className={`text-[11px] font-bold inline-flex items-center gap-1 ${
                          isMatching ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {isMatching ? (
                          <>
                            <Check className="h-3 w-3" />
                            <span>{isEnglish ? 'Matches' : 'متطابقتان'}</span>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="h-3 w-3" />
                            <span>{isEnglish ? 'Mismatch' : 'غير متطابقتين'}</span>
                          </>
                        )}
                      </span>
                    )}
                  </div>
                  <PasswordInput
                    required
                    placeholder="••••••••••••"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      setPwError('');
                    }}
                    className={`h-11 bg-secondary/40 text-foreground rounded-squircle text-sm transition-colors ${
                      isMatching === true
                        ? 'border-emerald-500/50'
                        : isMatching === false
                          ? 'border-rose-500/50'
                          : 'border-border'
                    }`}
                  />
                </div>

                <Button
                  type="submit"
                  disabled={pwLoading || !isValidStudentPassword(newPassword) || isMatching !== true}
                  className="w-full h-11 text-xs font-bold bg-primary hover:bg-primary/85 text-primary-foreground transition-all cursor-pointer rounded-squircle mt-2 gap-2"
                >
                  {pwLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                  <span>{isEnglish ? 'Update Password' : 'حفظ كلمة المرور الجديدة'}</span>
                </Button>
              </form>
            </Card>

            {/* Security Guarantee Box */}
            <div className="lg:col-span-4 space-y-4">
              <Card className="rounded-2xl border border-primary/20 bg-primary/5 p-5 space-y-3">
                <div className="flex items-center gap-2 text-primary font-bold text-xs">
                  <ShieldCheck className="h-4 w-4" />
                  <span>{isEnglish ? 'Security & Encryption' : 'الأمان والتشفير المعتمد'}</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {isEnglish
                    ? 'All student credentials are mathematically hashed using irreversible bcrypt with salted rounds. Institute staff and administrators cannot view your raw password.'
                    : 'كلمات المرور مشفرة بخوارزمية Bcrypt الملحية غير القابلة للعكس. لا يمكن لأي من موظفي أو إداريي المعهد الاطلاع على كلمة المرور الأصلية الخاصة بك.'}
                </p>
              </Card>

              <Card className="rounded-2xl border border-border/80 bg-secondary/20 p-5 space-y-2.5">
                <div className="flex items-center gap-2 text-foreground font-bold text-xs">
                  <Key className="h-4 w-4 text-muted-foreground" />
                  <span>{isEnglish ? 'Important Recommendation' : 'توصية أمنية هامة'}</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {isEnglish
                    ? 'Never share your National ID or Student Code password with other colleagues to protect your exam results and courses registration.'
                    : 'لا تشارك بيانات الدخول أو الرقم القومي مع زملائك حفاظاً على خصوصية درجاتك وتسجيل المقررات.'}
                </p>
              </Card>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
