'use client';

import { ReactNode } from 'react';
import { AppQueryProvider } from '@/lib/query-client';
import { AuthProvider } from './auth-provider';
import { ConsoleBanner } from './console-banner';

export function AppProviders({
  children,
  locale,
}: {
  children: ReactNode;
  locale: string;
}) {
  return (
    <AppQueryProvider>
      <ConsoleBanner />
      <AuthProvider locale={locale}>{children}</AuthProvider>
    </AppQueryProvider>
  );
}
