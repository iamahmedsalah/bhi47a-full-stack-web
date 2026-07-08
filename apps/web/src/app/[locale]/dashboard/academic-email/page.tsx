'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import api, { getApiErrorMessage } from '@/lib/api';
import { GlassCard } from '@/components/ui/glass-card';
import { Button } from '@/components/ui/button';
import { LoadingState, ErrorState, EmptyState, AlertMessage } from '@/components/ui/feedback';
import { Mail, Copy, Check, ExternalLink, HelpCircle } from 'lucide-react';

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
    queryFn: async () => {
      // Fetch academic email record
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

  if (emailQuery.isLoading) {
    return <LoadingState title={tCommon('loading')} />;
  }

  if (emailQuery.isError) {
    // If it's a 404/not found error, we can handle it gracefully as empty state
    const isNotFound = (emailQuery.error as { statusCode?: number })?.statusCode === 404;
    if (isNotFound) {
      return (
        <div className="mx-auto max-w-3xl animate-fade-in space-y-6">
          <div>
            <h2 className="flex items-center gap-2 text-2xl font-bold text-foreground">
              <Mail className="h-6 w-6 text-primary" />
              <span>{t('academicEmail')}</span>
            </h2>
          </div>
          <GlassCard glow>
            <EmptyState
              title={tEmails('noEmail')}
              description={
                tCommon('search') === 'Search...'
                  ? 'Your institutional academic email has not been provisioned yet. Please contact the IT center or student affairs office.'
                  : 'لم يتم إنشاء بريد أكاديمي مخصص لك بعد. يرجى مراجعة إدارة شؤون الطلاب أو مركز تكنولوجيا المعلومات لتسجيل بريدك.'
              }
            />
          </GlassCard>
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
      <div className="mx-auto max-w-3xl animate-fade-in space-y-6">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <Mail className="h-6 w-6 text-primary" />
            <span>{t('academicEmail')}</span>
          </h2>
        </div>
        <GlassCard glow>
          <EmptyState
            title={tEmails('noEmail')}
            description={
              tCommon('search') === 'Search...'
                ? 'Your institutional academic email has not been provisioned yet. Please contact the IT center or student affairs office.'
                : 'لم يتم إنشاء بريد أكاديمي مخصص لك بعد. يرجى مراجعة إدارة شؤون الطلاب أو مركز تكنولوجيا المعلومات لتسجيل بريدك.'
            }
          />
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl animate-fade-in space-y-8">
      {/* Title */}
      <div>
        <h2 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <Mail className="h-6 w-6 text-primary" />
          <span>{t('academicEmail')}</span>
        </h2>
        <p className="mt-1 text-sm text-muted">
          {tCommon('search') === 'Search...'
            ? 'Access your institutional Microsoft 365 email account and instructions'
            : 'بيانات حساب البريد الإلكتروني الأكاديمي المخصص لك وتعليمات تفعيل الخدمة'}
        </p>
      </div>

      {/* Main Credentials Card */}
      <GlassCard glow className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Mail className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-bold text-foreground text-base">
                {tCommon('search') === 'Search...' ? 'Institutional Webmail' : 'البريد الأكاديمي الرسمي'}
              </h3>
              <p className="text-xs text-muted-foreground">
                {tCommon('search') === 'Search...' ? 'Powered by Microsoft Office 365' : 'مقدم بالتعاون مع مايكروسوفت أوفيس 365'}
              </p>
            </div>
          </div>
          <span
            className={`badge self-start sm:self-center ${
              record.status === 'active' ? 'badge-success' : 'badge-danger'
            }`}
          >
            {tCommon('search') === 'Search...'
              ? record.status
              : record.status === 'active'
              ? 'نشط ومفعل'
              : 'معطل مؤقتاً'}
          </span>
        </div>

        {/* Email Copy Box */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-muted">
            {tEmails('emailAddress')}
          </label>
          <div className="relative flex items-center">
            <input
              type="text"
              readOnly
              value={record.academicEmail}
              dir="ltr"
              className="w-full rounded-xl border border-input-border bg-input py-3.5 pe-24 ps-4 font-mono text-sm font-semibold text-foreground outline-none focus:border-primary"
            />
            <button
              onClick={handleCopy}
              className="absolute end-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 rounded-lg bg-surface hover:bg-surface-hover px-3 py-1.5 text-xs font-semibold text-foreground transition-all duration-200"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-success" />
                  <span className="text-success">{tCommon('search') === 'Search...' ? 'Copied' : 'تم النسخ'}</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 text-muted" />
                  <span>{tCommon('search') === 'Search...' ? 'Copy' : 'نسخ'}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Action Button to Outlook */}
        {record.status === 'active' && (
          <div className="pt-2">
            <a
              href="https://outlook.office.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-hover py-3.5 text-sm font-bold text-white shadow-lg shadow-primary/20 transition-all hover:shadow-xl hover:shadow-primary/25 active:scale-[0.98]"
            >
              <span>{tCommon('search') === 'Search...' ? 'Sign In to Outlook Web' : 'الدخول لعلبة الوارد (Outlook)'}</span>
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        )}
      </GlassCard>

      {/* Guide / Instructions Panel */}
      <GlassCard className="space-y-4">
        <div className="flex items-center gap-2 text-foreground font-bold text-sm">
          <HelpCircle className="h-5 w-5 text-accent" />
          <span>{tCommon('search') === 'Search...' ? 'Access & Password Instructions' : 'تعليمات تسجيل الدخول وتعيين كلمة المرور'}</span>
        </div>
        <div className="space-y-3 text-xs leading-relaxed text-muted-foreground">
          <p>
            {tCommon('search') === 'Search...'
              ? '1. Your default initial password is your full national ID number (14 digits) as registered in your official file.'
              : '1. كلمة المرور الافتراضية الأولى لحسابك هي الرقم القومي الكامل الخاص بك والمكون من 14 رقماً كما هو مسجل في ملفك الرسمي.'}
          </p>
          <p>
            {tCommon('search') === 'Search...'
              ? '2. When signing in for the first time on Microsoft Portal, you will be prompted to register your mobile phone number or alternative email for password recovery.'
              : '2. عند دخولك للمرة الأولى لموقع مايكروسوفت، سيُطلب منك إدخال رقم هاتفك المحمول أو بريدك البديل لتأمين الحساب واستعادة كلمة المرور لاحقاً.'}
          </p>
          <p>
            {tCommon('search') === 'Search...'
              ? '3. With this academic email, you are entitled to free access to Microsoft Office 365 applications, including Word, Excel, Teams, and PowerPoint.'
              : '3. هذا البريد يمنحك ترخيصاً مجانياً لاستخدام تطبيقات أوفيس 365 التعليمية بالكامل مثل (Teams, Word, Excel, PowerPoint) مجاناً.'}
          </p>
        </div>
      </GlassCard>
    </div>
  );
}
