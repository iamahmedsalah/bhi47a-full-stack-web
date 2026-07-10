'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import api, { getApiErrorDetails, getApiErrorMessage } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LoadingState, ErrorState, AlertMessage } from '@/components/ui/feedback';
import {
  User,
  Loader2,
  GraduationCap,
  Key,
  Mail,
  Phone,
  Sparkles,
  Lock,
  Calendar,
  Building2,
  Layers,
  Users2,
  Hash,
  Fingerprint,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

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

          <Card className="p-6 bg-card/45 backdrop-blur-sm border-border shadow-[var(--shadow-glow)] space-y-5 rounded-2xl">
            {pwError && <AlertMessage tone="danger">{pwError}</AlertMessage>}
            {pwSuccess && <AlertMessage tone="success">{pwSuccess}</AlertMessage>}

            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="space-y-1.5 text-start">
                <label className="text-xs font-bold text-foreground">
                  {tAuth('currentPassword')}
                </label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full rounded-squircle border border-border bg-secondary/50 px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary/50 transition-colors"
                />
              </div>

              <div className="space-y-1.5 text-start">
                <label className="text-xs font-bold text-foreground">
                  {tAuth('newPassword')}
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-squircle border border-border bg-secondary/50 px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary/50 transition-colors"
                />
              </div>

              <div className="space-y-1.5 text-start">
                <label className="text-xs font-bold text-foreground">
                  {tAuth('confirmPassword')}
                </label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-squircle border border-border bg-secondary/50 px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary/50 transition-colors"
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

  return (
    <div className="mx-auto max-w-5xl space-y-6" dir={isEnglish ? 'ltr' : 'rtl'}>
      {/* Page Title */}
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <User className="h-6 w-6 text-primary" />
          <span>{isEnglish ? 'Personal Profile' : 'الملف الشخصي'}</span>
        </h2>
        <p className="text-sm text-muted-foreground">
          {isEnglish
            ? 'View your academic profile and manage your security settings'
            : 'عرض بياناتك الأكاديمية والملف الشخصي وتعديل إعدادات الأمان'}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Profile Card */}
        <div className="lg:col-span-2 space-y-6">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <Card className="p-6 bg-card/45 backdrop-blur-sm border-border shadow-sm space-y-6 relative overflow-hidden rounded-2xl ">
              <div className="flex items-center gap-4 border-b border-border pb-5">
                <div className="flex h-16 w-16 items-center justify-center rounded-squircle bg-primary/10 text-primary shrink-0">
                  <GraduationCap className="h-8 w-8" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">{profile.fullName}</h3>
                  <p className="font-mono text-sm text-primary flex items-center gap-1.5 font-bold mt-0.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    {profile.studentCode}
                  </p>
                </div>
              </div>

              {/* Identity & Academic Info Cards */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* National ID */}
                <div className="bg-secondary/35 border border-border/70 p-4 rounded-squircle flex items-center gap-3.5 text-start">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Fingerprint className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-muted-foreground block uppercase">
                      {t('nationalId')}
                    </span>
                    <span className="text-sm font-bold text-foreground font-mono mt-0.5 block">
                      {profile.nationalIdMasked || '—'}
                    </span>
                  </div>
                </div>

                {/* Academic Level */}
                <div className="bg-secondary/35 border border-border/70 p-4 rounded-squircle flex items-center gap-3.5 text-start">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-muted-foreground block uppercase">
                      {t('level')}
                    </span>
                    <span className="text-sm font-bold text-foreground mt-0.5 block">
                      {isEnglish ? `Level ${profile.level}` : `المستوى ${profile.level}`}
                    </span>
                  </div>
                </div>

                {/* Department */}
                <div className="bg-secondary/35 border border-border/70 p-4 rounded-squircle flex items-center gap-3.5 text-start">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-muted-foreground block uppercase">
                      {t('department')}
                    </span>
                    <span className="text-sm font-bold text-foreground mt-0.5 block truncate max-w-[180px]">
                      {profile.department || '—'}
                    </span>
                  </div>
                </div>

                {/* Seat Number */}
                <div className="bg-secondary/35 border border-border/70 p-4 rounded-squircle flex items-center gap-3.5 text-start">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Hash className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-muted-foreground block uppercase">
                      {t('seatNumber')}
                    </span>
                    <span className="text-sm font-bold text-foreground font-mono mt-0.5 block">
                      {profile.seatNumber || '—'}
                    </span>
                  </div>
                </div>

                {/* Group */}
                <div className="bg-secondary/35 border border-border/70 p-4 rounded-squircle flex items-center gap-3.5 text-start">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Users2 className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-muted-foreground block uppercase">
                      {t('group')}
                    </span>
                    <span className="text-sm font-bold text-foreground mt-0.5 block">
                      {profile.group || '—'}
                    </span>
                  </div>
                </div>

                {/* Section */}
                <div className="bg-secondary/35 border border-border/70 p-4 rounded-squircle flex items-center gap-3.5 text-start">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Hash className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-muted-foreground block uppercase">
                      {t('section')}
                    </span>
                    <span className="text-sm font-bold text-foreground font-mono mt-0.5 block">
                      {profile.section || '—'}
                    </span>
                  </div>
                </div>

                {/* Academic Year */}
                <div className="bg-secondary/35 border border-border/70 p-4 rounded-squircle flex items-center gap-3.5 text-start">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-muted-foreground block uppercase">
                      {t('academicYear')}
                    </span>
                    <span className="text-sm font-bold text-foreground font-mono mt-0.5 block">
                      {profile.academicYear}
                    </span>
                  </div>
                </div>

                {/* Semester */}
                <div className="bg-secondary/35 border border-border/70 p-4 rounded-squircle flex items-center gap-3.5 text-start">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-muted-foreground block uppercase">
                      {t('semester')}
                    </span>
                    <span className="text-sm font-bold text-foreground mt-0.5 block">
                      {isEnglish
                        ? profile.semester
                        : profile.semester === 'first'
                        ? 'الفصل الدراسي الأول'
                        : 'الفصل الدراسي الثاني'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="absolute -right-20 -top-20 w-40 h-40 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
            </Card>
          </motion.div>
        </div>

        {/* Action side cards */}
        <div className="space-y-6">
          {/* Contact details card */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }}>
            <Card className="p-5 bg-card/45 backdrop-blur-sm border-border shadow-sm space-y-4 rounded-2xl">
              <div className="flex items-center gap-2 border-b border-border pb-3">
                <Mail className="h-5 w-5 text-primary" />
                <h3 className="text-sm font-bold text-foreground">
                  {isEnglish ? 'Contact and Google Setup' : 'بيانات التواصل و Google'}
                </h3>
              </div>

              {contactError && <AlertMessage tone="danger">{contactError}</AlertMessage>}

              <form onSubmit={handleContactSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                    {isEnglish ? 'Email (optional)' : 'البريد الإلكتروني (اختياري)'}
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmailDraft(e.target.value)}
                    placeholder="student@gmail.com"
                    className="w-full rounded-squircle border border-border bg-secondary/50 px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary/50 transition-colors"
                    dir="ltr"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                    {isEnglish ? 'Phone number (optional)' : 'رقم الهاتف (اختياري)'}
                  </label>
                  <input
                    type="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={(e) => setPhoneDraft(e.target.value.replace(/[^\d+]/g, '').slice(0, 15))}
                    placeholder="01012345678"
                    className="w-full rounded-squircle border border-border bg-secondary/50 px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary/50 transition-colors"
                    dir="ltr"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={contactLoading}
                  className="w-full h-10 text-xs font-bold bg-secondary hover:bg-secondary/80 text-foreground transition-all cursor-pointer flex items-center justify-center gap-1.5 rounded-squircle border border-border/60"
                >
                  {contactLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {isEnglish ? 'Save contact info' : 'حفظ بيانات التواصل'}
                </Button>
              </form>

              {/* Google Link Status */}
              <div className="rounded-squircle border border-primary/20 bg-primary/5 p-3.5 space-y-3.5">
                <div className="flex items-start gap-2.5 text-xs text-foreground leading-relaxed text-start">
                  <svg className="mt-0.5 h-4.5 w-4.5 shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  <span>
                    {profile.googleLinkedAt
                      ? (isEnglish
                        ? `Linked to ${profile.googleEmail || email}`
                        : `مرتبط بـ ${profile.googleEmail || email}`)
                      : profile.googleLinkPending
                      ? (isEnglish
                        ? `Pending Google setup for ${profile.googleEmail || email}`
                        : `في انتظار تفعيل ربط Google لـ ${profile.googleEmail || email}`)
                      : (isEnglish
                        ? 'Save a Gmail address to configure faster Google login.'
                        : 'احفظ بريد Gmail لبدء ربط تسجيل الدخول السريع عبر Google.')}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={googleLoading || !email.trim()}
                  onClick={handleGoogleLink}
                  className="w-full h-10 text-xs font-bold border-primary/20 bg-transparent text-primary hover:bg-primary/10 flex items-center justify-center gap-1.5 cursor-pointer rounded-squircle"
                >
                  {googleLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="currentColor" />
                    </svg>
                  )}
                  {isEnglish ? 'Configure Google Link' : 'تجهيز ربط Google'}
                </Button>
              </div>
            </Card>
          </motion.div>

          {/* Change Password Card */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
            <Card className="p-5 bg-card/45 backdrop-blur-sm border-border shadow-sm space-y-4 rounded-2xl">
              <div className="flex items-center gap-2 border-b border-border pb-3">
                <Lock className="h-5 w-5 text-primary" />
                <h3 className="text-sm font-bold text-foreground">
                  {tAuth('changePassword')}
                </h3>
              </div>

              {pwError && <AlertMessage tone="danger">{pwError}</AlertMessage>}
              {pwSuccess && <AlertMessage tone="success">{pwSuccess}</AlertMessage>}

              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground">
                    {tAuth('currentPassword')}
                  </label>
                  <input
                    type="password"
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-squircle bg-secondary/50 border border-border text-foreground placeholder-muted-foreground focus:border-primary/50 outline-none transition-all text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground">
                    {tAuth('newPassword')}
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-squircle bg-secondary/50 border border-border text-foreground placeholder-muted-foreground focus:border-primary/50 outline-none transition-all text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground">
                    {tAuth('confirmPassword')}
                  </label>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-squircle bg-secondary/50 border border-border text-foreground placeholder-muted-foreground focus:border-primary/50 outline-none transition-all text-sm"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={pwLoading}
                  className="w-full h-10 text-xs font-bold bg-secondary hover:bg-secondary/80 text-foreground transition-all flex items-center justify-center gap-1.5 cursor-pointer rounded-squircle border border-border/60"
                >
                  {pwLoading && <Loader2 className="w-3.5 w-3.5 animate-spin" />}
                  <span>{tAuth('changePassword')}</span>
                </Button>
              </form>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
