import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { routing } from '@/i18n/routing';
import {
  GraduationCap,
  MessageSquare,
  Shield,
  Clock,
  ArrowRight,
  ArrowLeft,
  Home,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import LangToggle from '@/components/ui/LangToggle';
import { Footer } from '@/components/ui/footer';
import { INSTITUTE_INFO } from '@/data/institutional-data';

interface LoginPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateMetadata({ params }: LoginPageProps): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === 'ar';

  return {
    title: isAr
      ? `البوابة الإلكترونية الموحدة | ${INSTITUTE_INFO.nameAr}`
      : `Unified Electronic Portal | ${INSTITUTE_INFO.nameEn}`,
    description: isAr
      ? 'تسجيل الدخول لبوابة الطالب، نتائج الامتحانات، البريد الأكاديمي، ومنظومة الشكاوى والأعطال الفنية بالمعهد.'
      : 'Unified portal login for student records, exam results, academic mail, and technical support.',
  };
}

export default async function LoginPage({ params, searchParams }: LoginPageProps) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const sp = await searchParams;
  const reason = typeof sp.reason === 'string' ? sp.reason : undefined;
  const error = typeof sp.error === 'string' ? sp.error : undefined;
  const isSessionExpired = reason === 'session_expired' || error === 'session_expired';

  const isAr = locale === 'ar';
  const BackArrow = isAr ? ArrowRight : ArrowLeft;

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center p-4 md:p-8 relative"
      style={{ background: 'var(--gradient-primary)' }}
      dir={isAr ? 'rtl' : 'ltr'}
    >
      {/* Top Bar with Back to Website and Language Toggle */}
      <div className="fixed top-4 inset-x-4 max-w-6xl mx-auto flex items-center justify-between z-20 pointer-events-none">
        <Link
          href={`/${locale}`}
          className="pointer-events-auto inline-flex items-center gap-2 px-3.5 py-2 rounded-squircle bg-card/90 hover:bg-card border border-border text-foreground text-xs sm:text-sm font-semibold shadow-md backdrop-blur-md transition-colors"
        >
          <BackArrow className="w-4 h-4 text-primary" />
          <Home className="w-4 h-4 text-primary hidden sm:inline" />
          <span>{isAr ? 'العودة إلى الموقع الرئيسي للمعهد' : 'Back to Website'}</span>
        </Link>

        <div className="pointer-events-auto">
          <LangToggle />
        </div>
      </div>

      <div className="flex w-full max-w-4xl flex-col items-center gap-8 mt-14 sm:mt-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <Link
            href={`/${locale}`}
            className="group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-full"
            aria-label={isAr ? 'العودة للموقع الرئيسي' : 'Return to main website'}
          >
            <Image
              src="/logo.webp"
              alt="Institute Logo"
              width={144}
              height={144}
              priority
              className="h-24 w-24 rounded-full object-contain shadow-[var(--shadow-glow)] md:h-36 md:w-36 transition-transform group-hover:scale-105"
            />
          </Link>
          <h1 className="text-xl font-bold text-foreground md:text-2xl">
            {isAr ? INSTITUTE_INFO.nameAr : INSTITUTE_INFO.nameEn}
          </h1>
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-primary/10 border border-primary/20">
            <p className="text-sm font-bold text-primary md:text-base">
              {isAr ? 'البوابة الإلكترونية الموحدة' : 'Unified Electronic Portal'}
            </p>
          </div>

          {isSessionExpired && (
            <Alert className="max-w-md border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200 py-3 mt-2 text-start">
              <Clock className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <AlertDescription className="text-xs leading-relaxed">
                {isAr
                  ? 'انتهت صلاحية جلستك السابقة تلقائياً لدواعي الأمان (الحد الأقصى للجلسة 20 دقيقة). يرجى اختيار بوابتك لتسجيل الدخول مجدداً.'
                  : 'Your previous session expired for security reasons (20-minute limit). Please choose your portal to log in again.'}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <div className="grid w-full grid-cols-1 gap-6 md:grid-cols-2">
          {/* Student Portal Card */}
          <Card className="border-border bg-card/95 p-8 text-center shadow-[var(--shadow-glow)] backdrop-blur-sm transition-all hover:border-primary/40 flex flex-col justify-between">
            <div className="flex flex-col items-center gap-4">
              <div className="flex h-20 w-20 items-center justify-center rounded-squircle bg-primary/20">
                <GraduationCap className="h-10 w-10 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-foreground">
                {isAr ? 'بوابة الطالب' : 'Student Portal'}
              </h2>
              <p className="min-h-10 text-sm font-semibold text-muted-foreground">
                {isAr
                  ? 'تسجيل الدخول للدرجات والبريد الأكاديمي وجداول الامتحانات ومتابعة التذاكر'
                  : 'Sign in for grades, academic email, exam schedules, and ticket tracking'}
              </p>
            </div>
            <div className="mt-6">
              <Button asChild className="h-12 w-full text-base font-bold rounded-squircle">
                <Link href={`/${locale}/login/student`}>
                  {isAr ? 'تسجيل دخول الطالب' : 'Student Sign In'}
                </Link>
              </Button>
            </div>
          </Card>

          {/* Complaints & Technical Issues Card */}
          <Card className="border-border bg-card/95 p-8 text-center shadow-[var(--shadow-glow)] backdrop-blur-sm transition-all hover:border-green-500/40 flex flex-col justify-between">
            <div className="flex flex-col items-center gap-4">
              <div className="flex h-20 w-20 items-center justify-center rounded-squircle bg-green-500/20">
                <MessageSquare className="h-10 w-10 text-green-400" />
              </div>
              <h2 className="text-2xl font-bold text-foreground">
                {isAr ? 'الأعطال الفنية والشكاوى' : 'Complaints & Technical Issues'}
              </h2>
              <p className="min-h-10 text-sm font-semibold text-muted-foreground">
                {isAr
                  ? 'تقديم بلاغ جديد بدون تسجيل دخول ومتابعة حالة التذكرة برقم الهاتف'
                  : 'Submit a new issue without signing in and track status via phone number'}
              </p>
            </div>
            <div className="mt-6">
              <Button asChild className="h-12 w-full bg-green-600 text-base font-bold text-white hover:bg-green-700 rounded-squircle">
                <Link href={`/${locale}/complaints`}>
                  {isAr ? 'إرسال بلاغ أو استعلام' : 'Submit Issue or Inquire'}
                </Link>
              </Button>
            </div>
          </Card>
        </div>

        {/* Admin and Staff Login */}
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <Link
            href={`/${locale}/login/admin`}
            className="inline-flex items-center gap-2 rounded-squircle border border-border bg-surface/60 px-5 py-2.5 text-sm font-semibold text-muted transition-colors hover:border-primary hover:text-foreground"
          >
            <Shield className="h-4 w-4 text-teal-400" />
            {isAr ? 'دخول الإدارة وأعضاء هيئة التدريس والمعاونين' : 'Admin and Faculty/Staff Login'}
          </Link>
        </div>

        <Footer role="student" locale={locale} />
      </div>
    </div>
  );
}
