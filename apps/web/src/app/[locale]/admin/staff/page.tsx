'use client';

import { ShieldAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { StaffManagementPage } from '@/features/staff/components/staff-management-page';
import { useAuth } from '@/providers/auth-provider';

export default function AdminStaffPage() {
  const t = useTranslations('staff');
  const { user, loading } = useAuth();
  if (loading) return <div className="flex min-h-[50vh] items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;
  if (user?.role !== 'admin') {
    return <div className="flex min-h-[65vh] flex-col items-center justify-center gap-3 p-6 text-center"><ShieldAlert className="h-12 w-12 text-danger" /><h1 className="text-xl font-bold">{t('adminOnlyTitle')}</h1><p className="max-w-md text-sm text-muted-foreground">{t('adminOnlyDescription')}</p></div>;
  }
  return <StaffManagementPage />;
}
