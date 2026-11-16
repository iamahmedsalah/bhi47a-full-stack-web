'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import api, { getApiErrorMessage } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/feedback';
import { Mail, Copy, Check, ExternalLink, HelpCircle, Globe } from 'lucide-react';
import { motion } from 'framer-motion';

interface AcademicEmailRecord {
  _id: string;
  studentCode: string;
  studentName: string;
  academicEmail: string;
  status: 'active' | 'inactive';
}

export default function StudentAcademicEmailPage() {
  const t = useTranslations('studentPortal');
  const tCommon = useTranslations('common');
  const tEmails = useTranslations('academicEmails');
  const [copied, setCopied] = useState(false);

  const emailQuery = useQuery({
    queryKey: ['student-academic-email'],
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const res = await api.get<AcademicEmailRecord | null>('/students/me/academic-email');
      return res.data;
    },
  });

  const handleCopy = () => {
    if (!emailQuery.data?.academicEmail) return;
    navigator.clipboard.writeText(emailQuery.data.academicEmail);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isEnglish = tCommon('search') === 'Search...';

  if (emailQuery.isLoading) {
    return <LoadingState title={tCommon('loading')} />;
  }

  if (emailQuery.isError) {
    const isNotFound = (emailQuery.error as { statusCode?: number })?.statusCode === 404;
    if (isNotFound) {
      return (
        <div className="mx-auto max-w-3xl animate-fade-in space-y-6" dir={isEnglish ? 'ltr' : 'rtl'}>
          <div>
            <h2 className="flex items-center gap-2 text-2xl font-bold text-foreground">
              <Mail className="h-6 w-6 text-primary" />
              <span>{t('academicEmail')}</span>
            </h2>
          </div>
          <Card className="p-6 bg-card/45 backdrop-blur-sm border-border/70 shadow-[var(--shadow-glow)] hover:border-primary/30 transition-all duration-300">
            <EmptyState
              title={tEmails('noEmail')}
              description={
                isEnglish
                  ? 'Your institutional academic email has not been provisioned yet. Please contact the IT center or student affairs office.'
                  : 'لم يتم إنشاء بريد أكاديمي مخصص لك بعد. يرجى مراجعة إدارة شؤون الطلاب أو مركز تكنولوجيا المعلومات لتسجيل بريدك.'
              }
            />
          </Card>
        </div>
      );
    }

    return (
      <ErrorState
        description={getApiErrorMessage(emailQuery.error)}
        error={emailQuery.error}
        onRetry={() => emailQuery.refetch()}
      />
    );
  }

  const record = emailQuery.data;

  if (!record || !record.academicEmail) {
    return (
      <div className="mx-auto max-w-3xl animate-fade-in space-y-6" dir={isEnglish ? 'ltr' : 'rtl'}>
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <Mail className="h-6 w-6 text-primary" />
            <span>{t('academicEmail')}</span>
          </h2>
        </div>
        <Card className="p-6 bg-card/45 backdrop-blur-sm border-border/70 shadow-[var(--shadow-glow)] hover:border-primary/30 transition-all duration-300">
          <EmptyState
            title={tEmails('noEmail')}
            description={
              isEnglish
                ? 'Your institutional academic email has not been provisioned yet. Please contact the IT center or student affairs office.'
                : 'لم يتم إنشاء بريد أكاديمي مخصص لك بعد. يرجى مراجعة إدارة شؤون الطلاب أو مركز تكنولوجيا المعلومات لتسجيل بريدك.'
            }
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6" dir={isEnglish ? 'ltr' : 'rtl'}>
      {/* Title */}
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <Mail className="h-6 w-6 text-primary" />
          <span>{t('academicEmail')}</span>
        </h2>
        <p className="text-sm text-muted-foreground">
          {isEnglish
            ? 'Access your institutional Microsoft 365 email account and instructions'
            : 'بيانات حساب البريد الإلكتروني الأكاديمي المخصص لك وتعليمات تفعيل الخدمة'}
        </p>
      </div>

      {/* Main Credentials Card */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Card className="p-6 bg-card/45 backdrop-blur-sm border-border/70 shadow-[var(--shadow-glow)] hover:border-primary/30 transition-all duration-300 space-y-6 relative overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-5">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Mail className="h-6 w-6" />
              </div>
              <div className="space-y-0.5">
                <h3 className="font-bold text-foreground text-base">
                  {isEnglish ? 'Institutional Webmail' : 'البريد الأكاديمي الرسمي'}
                </h3>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Globe className="w-3.5 h-3.5 text-primary" />
                  {isEnglish ? 'Powered by Google Workspace' : 'مقدم بالتعاون مع Google Workspace'}
                </p>
              </div>
            </div>
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold self-start sm:self-center border ${record.status === 'active'
                  ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                  : 'bg-red-500/10 text-red-500 border-red-500/20'
                }`}
            >
              {isEnglish
                ? record.status
                : record.status === 'active'
                  ? 'نشط ومفعل'
                  : 'معطل مؤقتاً'}
            </span>
          </div>

          {/* Email Copy Box */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-foreground">
              {tEmails('emailAddress')}
            </label>
            <div className="relative flex items-center">
              <input
                type="text"
                readOnly
                value={record.academicEmail}
                dir="ltr"
                style={{ paddingRight: '6.5rem', paddingLeft: '1rem', textAlign: 'left' }}
                className="w-full rounded-xl border border-border bg-secondary/50 py-3.5 font-mono text-sm font-semibold text-foreground outline-none focus:border-primary/50 transition-colors text-left"
              />
              <button
                onClick={handleCopy}
                className="absolute top-1/2 -translate-y-1/2 flex items-center gap-1.5 rounded-lg bg-card hover:bg-secondary border border-border px-3 py-1.5 text-xs font-bold text-foreground transition-all duration-200 cursor-pointer z-10"
                style={{ right: '0.5rem', left: 'auto' }}
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="text-emerald-500">{isEnglish ? 'Copied' : 'تم النسخ'}</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{isEnglish ? 'Copy' : 'نسخ'}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Action Button to Gmail */}
          {record.status === 'active' && (
            <div className="pt-2">
              <a
                href="https://mail.google.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-squircle bg-gradient-to-r from-teal-700 via-teal-600 to-teal-700 hover:from-teal-600 hover:to-teal-500 py-3.5 text-sm font-bold text-white shadow-lg shadow-teal-900/20 border border-teal-500/30 transition-all cursor-pointer"
              >
                <Mail className="h-4.5 w-4.5 text-teal-100" />
                <span>{isEnglish ? 'Sign In to Google Mail (Gmail)' : 'الدخول لبريد Google المؤسسي (Gmail)'}</span>
                <ExternalLink className="h-4 w-4 opacity-80" />
              </a>
            </div>
          )}
          <div className="absolute -right-20 -top-20 w-40 h-40 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
        </Card>
      </motion.div>

      {/* Guide / Instructions Panel */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <Card className="p-6 bg-card/45 backdrop-blur-sm border-border shadow-sm space-y-4">
          <div className="flex items-center gap-2 text-foreground font-bold text-sm border-b border-border pb-3">
            <HelpCircle className="h-5 w-5 text-primary" />
            <span>{isEnglish ? 'Access & Password Instructions' : 'تعليمات تسجيل الدخول وتعيين كلمة المرور'}</span>
          </div>
          <div className="space-y-4 text-xs leading-relaxed text-muted-foreground">
            <div className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-secondary text-foreground flex items-center justify-center shrink-0 font-bold">1</span>
              <p className="mt-0.5">
                {isEnglish
                  ? 'Your default initial password is your full national ID number (14 digits) as registered in your official file.'
                  : 'كلمة المرور الافتراضية الأولى لحسابك هي الرقم القومي الكامل الخاص بك والمكون من 14 رقماً كما هو مسجل في ملفك الرسمي.'}
              </p>
            </div>
            <div className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-secondary text-foreground flex items-center justify-center shrink-0 font-bold">2</span>
              <p className="mt-0.5">
                {isEnglish
                  ? 'When signing in for the first time on Google Workspace, you may be prompted to accept terms and set an updated secure password.'
                  : 'عند دخولك للمرة الأولى لموقع Google Workspace، سيُطلب منك الموافقة على البنود وتحديث كلمة المرور لضمان أمان حسابك.'}
              </p>
            </div>
            <div className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-secondary text-foreground flex items-center justify-center shrink-0 font-bold">3</span>
              <p className="mt-0.5">
                {isEnglish
                  ? 'With this academic email, you have full access to Google Workspace for Education (Gmail, Drive, Meet, Classroom, Docs, Sheets).'
                  : 'هذا البريد يمنحك وصولاً تعليمياً كاملاً لخدمات Google Workspace (Gmail, Drive, Meet, Classroom, Docs, Sheets).'}
              </p>
            </div>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
