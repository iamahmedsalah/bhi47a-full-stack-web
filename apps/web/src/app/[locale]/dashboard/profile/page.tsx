'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import api, { getApiErrorDetails, getApiErrorMessage } from '@/lib/api';
import { GlassCard } from '@/components/ui/glass-card';
import { Button } from '@/components/ui/button';
import { LoadingState, ErrorState, AlertMessage } from '@/components/ui/feedback';
import {
  User,
  Loader2,
  GraduationCap,
  Key,
  Mail,
  Phone,
} from 'lucide-react';
import { toast } from 'sonner';

interface StudentProfile {
  _id: string;
  studentCode: string;
  fullName: string;
  nationalIdMasked: string;
  department?: string;
  level: string;
  group?: string;
  section?: string;
  academicYear: string;
  semester: string;
  seatNumber?: string;
  enrollmentStatus: string;
  email: string;
  phone: string;
  googleEmail: string;
  googleLinkedAt?: string;
  googleLinkPending: boolean;
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
  const [googleLoading, setGoogleLoading] = useState(false);

  const profileQuery = useQuery({
    queryKey: ['student-profile'],
    queryFn: async () => {
      const res = await api.get<StudentProfile>('/students/me/profile');
      return res.data;
    },
  });

  const isEnglish = tCommon('search') === 'Search...';
  const email = emailDraft ?? profileQuery.data?.email ?? '';
  const phone = phoneDraft ?? profileQuery.data?.phone ?? '';

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setContactError('');
    setContactLoading(true);

    try {
      await api.patch('/students/me/contact', {
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      setEmailDraft(undefined);
      setPhoneDraft(undefined);
      toast.success(isEnglish ? 'Contact information updated' : 'تم تحديث بيانات التواصل');
      void profileQuery.refetch();
    } catch (err: unknown) {
      setContactError(getApiErrorMessage(err, isEnglish ? 'Could not update contact information' : 'تعذر تحديث بيانات التواصل'));
    } finally {
      setContactLoading(false);
    }
  };

  const handleGoogleLink = async () => {
    if (!email.trim()) {
      setContactError(isEnglish ? 'Add your Gmail first.' : 'أضف بريد Gmail أولاً.');
      return;
    }

    setGoogleLoading(true);
    setContactError('');
    try {
      await api.post('/auth/google/link/start', { email: email.trim() });
      toast.success(isEnglish ? 'Google account saved for linking' : 'تم حفظ حساب Google للربط');
      void profileQuery.refetch();
    } catch (err: unknown) {
      setContactError(getApiErrorMessage(err, isEnglish ? 'Could not start Google linking' : 'تعذر بدء ربط Google'));
    } finally {
      setGoogleLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    setPwSuccess('');

    if (newPassword !== confirmPassword) {
      setPwError(
        tCommon('search') === 'Search...'
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
        tCommon('search') === 'Search...'
          ? 'Password updated successfully'
          : 'تم تحديث كلمة المرور بنجاح'
      );
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      void profileQuery.refetch();
    } catch (err: unknown) {
      setPwError(getApiErrorMessage(err, 'فشل تغيير كلمة المرور'));
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
        <div className="mx-auto max-w-xl animate-fade-in space-y-6">
          <div>
            <h2 className="flex items-center gap-2 text-2xl font-bold text-foreground">
              <Key className="h-6 w-6 text-primary" />
              <span>{tAuth('changePassword')}</span>
            </h2>
            <p className="mt-1 text-sm text-muted">
              {isEnglish
                ? 'Your initial password must be changed before opening the student portal.'
                : 'ÙŠØ¬Ø¨ ØªØºÙŠÙŠØ± ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ± Ø§Ù„Ø§ÙØªØ±Ø§Ø¶ÙŠØ© Ù‚Ø¨Ù„ ÙØªØ­ Ø¨ÙˆØ§Ø¨Ø© Ø§Ù„Ø·Ø§Ù„Ø¨.'}
            </p>
          </div>

          <GlassCard glow className="space-y-5">
            {pwError && <AlertMessage tone="danger">{pwError}</AlertMessage>}
            {pwSuccess && <AlertMessage tone="success">{pwSuccess}</AlertMessage>}

            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted">
                  {tAuth('currentPassword')}
                </label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full rounded-xl border border-input-border bg-input px-4 py-2.5 text-sm text-foreground outline-none transition-all duration-200 placeholder-muted-foreground focus:border-input-focus"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted">
                  {tAuth('newPassword')}
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-xl border border-input-border bg-input px-4 py-2.5 text-sm text-foreground outline-none transition-all duration-200 placeholder-muted-foreground focus:border-input-focus"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted">
                  {tAuth('confirmPassword')}
                </label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-xl border border-input-border bg-input px-4 py-2.5 text-sm text-foreground outline-none transition-all duration-200 placeholder-muted-foreground focus:border-input-focus"
                />
              </div>

              <Button
                type="submit"
                disabled={pwLoading}
                className="flex w-full items-center justify-center gap-2"
              >
                {pwLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                <span>{tAuth('changePassword')}</span>
              </Button>
            </form>
          </GlassCard>
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

  return (
    <div className="mx-auto max-w-5xl animate-fade-in space-y-8">
      {/* Page Title */}
      <div>
        <h2 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <User className="h-6 w-6 text-primary" />
          <span>{tCommon('search') === 'Search...' ? 'Personal Profile' : 'الملف الشخصي'}</span>
        </h2>
        <p className="mt-1 text-sm text-muted">
          {tCommon('search') === 'Search...'
            ? 'View your academic profile and manage your security settings'
            : 'عرض بياناتك الأكاديمية والملف الشخصي وتعديل إعدادات الأمان'}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Profile Card */}
        <div className="lg:col-span-2 space-y-6">
          <GlassCard glow className="space-y-6">
            <div className="flex items-center gap-4 border-b border-border pb-6">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <GraduationCap className="h-8 w-8" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">{profile.fullName}</h3>
                <p className="font-mono text-sm text-muted-foreground">{profile.studentCode}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="space-y-1">
                <span className="text-xs font-semibold text-muted">{t('nationalId')}</span>
                <p className="text-sm font-medium text-foreground font-mono">
                  {profile.nationalIdMasked || '—'}
                </p>
              </div>

              <div className="space-y-1">
                <span className="text-xs font-semibold text-muted">{t('level')}</span>
                <p className="text-sm font-medium text-foreground">
                  {tCommon('welcome') === 'Welcome' ? `Level ${profile.level}` : `المستوى ${profile.level}`}
                </p>
              </div>

              <div className="space-y-1">
                <span className="text-xs font-semibold text-muted">{t('department')}</span>
                <p className="text-sm font-medium text-foreground">
                  {profile.department || '—'}
                </p>
              </div>

              <div className="space-y-1">
                <span className="text-xs font-semibold text-muted">{t('seatNumber')}</span>
                <p className="text-sm font-medium text-foreground font-mono">
                  {profile.seatNumber || '—'}
                </p>
              </div>

              <div className="space-y-1">
                <span className="text-xs font-semibold text-muted">{t('group')}</span>
                <p className="text-sm font-medium text-foreground">
                  {profile.group || '—'}
                </p>
              </div>

              <div className="space-y-1">
                <span className="text-xs font-semibold text-muted">{t('section')}</span>
                <p className="text-sm font-medium text-foreground font-mono">
                  {profile.section || '—'}
                </p>
              </div>

              <div className="space-y-1">
                <span className="text-xs font-semibold text-muted">{t('academicYear')}</span>
                <p className="text-sm font-medium text-foreground">
                  {profile.academicYear}
                </p>
              </div>

              <div className="space-y-1">
                <span className="text-xs font-semibold text-muted">{t('semester')}</span>
                <p className="text-sm font-medium text-foreground">
                  {tCommon('welcome') === 'Welcome'
                    ? profile.semester
                    : profile.semester === 'first'
                    ? 'الفصل الدراسي الأول'
                    : 'الفصل الدراسي الثاني'}
                </p>
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Change Password Card */}
        <div className="space-y-6">
          <GlassCard glow className="space-y-5">
            <div className="flex items-center gap-3 border-b border-border pb-4">
              <Mail className="h-5 w-5 text-primary" />
              <h3 className="text-base font-bold text-foreground">
                {isEnglish ? 'Contact and Google' : 'بيانات التواصل و Google'}
              </h3>
            </div>

            {contactError && <AlertMessage tone="danger">{contactError}</AlertMessage>}

            <form onSubmit={handleContactSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="flex items-center gap-2 text-xs font-semibold text-muted">
                  <Mail className="h-3.5 w-3.5" />
                  {isEnglish ? 'Email (optional)' : 'البريد الإلكتروني (اختياري)'}
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmailDraft(e.target.value)}
                  placeholder="student@gmail.com"
                  className="w-full rounded-squircle border border-input-border bg-input px-4 py-2.5 text-sm text-foreground outline-none transition-all duration-200 placeholder:text-muted-foreground focus:border-input-focus"
                  dir="ltr"
                />
              </div>

              <div className="space-y-1">
                <label className="flex items-center gap-2 text-xs font-semibold text-muted">
                  <Phone className="h-3.5 w-3.5" />
                  {isEnglish ? 'Phone number (optional)' : 'رقم الهاتف (اختياري)'}
                </label>
                <input
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhoneDraft(e.target.value.replace(/[^\d+]/g, '').slice(0, 15))}
                  placeholder="01012345678"
                  className="w-full rounded-squircle border border-input-border bg-input px-4 py-2.5 text-sm text-foreground outline-none transition-all duration-200 placeholder:text-muted-foreground focus:border-input-focus"
                  dir="ltr"
                />
              </div>

              <Button
                type="submit"
                disabled={contactLoading}
                className="w-full"
              >
                {contactLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                {isEnglish ? 'Save contact info' : 'حفظ بيانات التواصل'}
              </Button>
            </form>

            <div className="rounded-squircle border border-primary/25 bg-primary/10 p-3">
              <div className="mb-3 flex items-start gap-2 text-xs text-muted-foreground">
                <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                <span>
                  {profile.googleLinkedAt
                    ? isEnglish
                      ? `Linked to ${profile.googleEmail || email}`
                      : `مرتبط بـ ${profile.googleEmail || email}`
                    : profile.googleLinkPending
                      ? isEnglish
                        ? `Pending Google setup for ${profile.googleEmail || email}`
                        : `في انتظار تفعيل ربط Google لـ ${profile.googleEmail || email}`
                      : isEnglish
                        ? 'Save a Gmail to prepare faster Google sign-in.'
                        : 'احفظ بريد Gmail لبدء تجهيز تسجيل الدخول السريع عبر Google.'}
                </span>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={googleLoading || !email.trim()}
                onClick={handleGoogleLink}
                className="w-full border-primary/30 bg-transparent text-primary hover:bg-primary/10"
              >
                {googleLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                )}
                {isEnglish ? 'Prepare Google link' : 'تجهيز ربط Google'}
              </Button>
            </div>
          </GlassCard>

          <GlassCard glow className="space-y-5">
            <div className="flex items-center gap-3 border-b border-border pb-4">
              <Key className="h-5 w-5 text-accent" />
              <h3 className="text-base font-bold text-foreground">
                {tAuth('changePassword')}
              </h3>
            </div>

            {pwError && <AlertMessage tone="danger">{pwError}</AlertMessage>}
            {pwSuccess && <AlertMessage tone="success">{pwSuccess}</AlertMessage>}

            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted">
                  {tAuth('currentPassword')}
                </label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-input border border-input-border text-foreground placeholder-muted-foreground focus:border-input-focus outline-none transition-all duration-200 text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted">
                  {tAuth('newPassword')}
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-input border border-input-border text-foreground placeholder-muted-foreground focus:border-input-focus outline-none transition-all duration-200 text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted">
                  {tAuth('confirmPassword')}
                </label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-input border border-input-border text-foreground placeholder-muted-foreground focus:border-input-focus outline-none transition-all duration-200 text-sm"
                />
              </div>

              <Button
                type="submit"
                disabled={pwLoading}
                className="w-full flex items-center justify-center gap-2"
              >
                {pwLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{tAuth('changePassword')}</span>
              </Button>
            </form>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
