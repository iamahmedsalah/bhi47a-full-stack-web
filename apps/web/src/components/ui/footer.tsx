import React from 'react';
import { AppReleaseBadge } from './app-release-badge';
import { cn } from '@/lib/cn';

interface FooterProps {
  role: 'student' | 'admin';
  locale: string;
  className?: string;
}

export function Footer({ role, locale, className }: FooterProps) {
  const isAr = locale === 'ar';

  return (
    <footer className={cn("text-center text-[10px] text-muted-foreground leading-relaxed pb-6", className)}>
      {isAr ? (
        <>
          جميع الحقوق محفوظة، 2026 © | <AppReleaseBadge role={role} locale={locale} inline /> <br />
          قسم تكنولوجيا المعلومات - المعهد العالي للعلوم الإدارية المتقدمة والحاسبات
        </>
      ) : (
        <>
          All Rights Reserved, 2026 © | <AppReleaseBadge role={role} locale={locale} inline /> <br />
          IT Department - High Institute for Advanced Management Sciences and Computer
        </>
      )}
    </footer>
  );
}
