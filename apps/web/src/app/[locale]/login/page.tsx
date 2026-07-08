'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { GraduationCap, MessageSquare, Shield } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import LangToggle from '@/components/ui/LangToggle';

export default function LoginPage() {
  const params = useParams();
  const locale = params.locale as string;
  const isAr = locale === 'ar';

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center p-4 md:p-8"
      style={{ background: 'var(--gradient-primary)' }}
      dir={isAr ? 'rtl' : 'ltr'}
    >
      <div className="fixed end-4 top-4 z-20">
        <LangToggle />
      </div>
      <div className="flex w-full max-w-4xl flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <Image
            src="/logo.webp"
            alt="Institute Logo"
            width={144}
            height={144}
            priority
            className="h-24 w-24 rounded-full object-contain shadow-[var(--shadow-glow)] md:h-36 md:w-36"
          />
          <h1 className="text-xl font-bold text-foreground md:text-2xl">
            {isAr
              ? 'المعهد العالي للعلوم الإدارية المتقدمة والحاسبات'
              : 'High Institute for Advanced Management Sciences and Computer'}
          </h1>
          <p className="text-sm font-semibold text-muted-foreground md:text-base">
            {isAr ? 'البوابة الإلكترونية' : 'Electronic Portal'}
          </p>
        </div>

        <div className="grid w-full grid-cols-1 gap-6 md:grid-cols-2">
          <Card className="border-border bg-card/95 p-8 text-center shadow-[var(--shadow-glow)] backdrop-blur-sm transition-all hover:border-primary/40">
            <div className="flex flex-col items-center gap-4">
              <div className="flex h-20 w-20 items-center justify-center rounded-squircle bg-primary/20">
                <GraduationCap className="h-10 w-10 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-foreground">
                {isAr ? 'بوابة الطالب' : 'Student Portal'}
              </h2>
              <p className="min-h-10 text-sm font-semibold text-muted-foreground">
                {isAr
                  ? 'تسجيل الدخول للدرجات والبريد الأكاديمي ومتابعة التذاكر'
                  : 'Sign in for grades, academic email, and ticket tracking'}
              </p>
              <Button asChild className="h-12 w-full text-lg">
                <Link href={`/${locale}/login/student`}>
                  {isAr ? 'تسجيل الدخول' : 'Sign In'}
                </Link>
              </Button>
            </div>
          </Card>

          <Card className="border-border bg-card/95 p-8 text-center shadow-[var(--shadow-glow)] backdrop-blur-sm transition-all hover:border-green-500/40">
            <div className="flex flex-col items-center gap-4">
              <div className="flex h-20 w-20 items-center justify-center rounded-squircle bg-green-500/20">
                <MessageSquare className="h-10 w-10 text-green-400" />
              </div>
              <h2 className="text-2xl font-bold text-foreground">
                {isAr ? 'الأعطال الفنية والشكاوى' : 'Complaints & Technical Issues'}
              </h2>
              <p className="min-h-10 text-sm font-semibold text-muted-foreground">
                {isAr
                  ? 'تقديم بلاغ جديد بدون تسجيل دخول'
                  : 'Submit a new issue without signing in'}
              </p>
              <Button asChild className="h-12 w-full bg-green-600 text-lg text-white hover:bg-green-700">
                <Link href={`/${locale}/complaints`}>
                  {isAr ? 'إرسال بلاغ' : 'Submit Issue'}
                </Link>
              </Button>
            </div>
          </Card>
        </div>

        <Link
          href={`/${locale}/login/admin`}
          className="inline-flex items-center gap-2 rounded-squircle border border-border bg-surface/60 px-4 py-2 text-sm text-muted transition-colors hover:border-primary hover:text-foreground"
        >
          <Shield className="h-4 w-4" />
          {isAr ? 'دخول الإدارة والموظفين' : 'Admin and staff login'}
        </Link>

        <footer className="text-center text-[11px] leading-relaxed text-muted-foreground">
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
