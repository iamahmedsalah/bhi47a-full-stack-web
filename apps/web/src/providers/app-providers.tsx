'use client';

import { ReactNode } from 'react';
import { AppQueryProvider } from '@/lib/query-client';
import { AuthProvider } from './auth-provider';

export function AppProviders({
  children,
  locale,
}: {
  children: ReactNode;
  locale: string;
}) {
  return (
    <AppQueryProvider>
      <AuthProvider locale={locale}>{children}</AuthProvider>
    </AppQueryProvider>
  );
}
