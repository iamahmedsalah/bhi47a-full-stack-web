'use client';

import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Calendar, Lock, Unlock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DataTableShell, type ColumnDef } from '@/components/ui/data-table-shell';
import { StatusBadge } from '@/components/ui/status-badge';
import { TableCell } from '@/components/ui/table';
import { listRegistrationTerms, toggleRegistrationTerm, type RegistrationTermItem } from '../api';

export function RegistrationTermsPanel({ locale }: { locale: string }) {
  const isAr = locale === 'ar';
  const queryClient = useQueryClient();

  const termsQuery = useQuery({
    queryKey: ['admin-registration-terms'],
    queryFn: () => listRegistrationTerms(),
  });

  const terms = termsQuery.data ?? [];

  const handleToggle = async (term: RegistrationTermItem) => {
    try {
      await toggleRegistrationTerm(term._id, !term.isOpen);
      toast.success(isAr ? 'تم تعديل حالة فترة التسجيل' : 'Term status updated');
      void queryClient.invalidateQueries({ queryKey: ['admin-registration-terms'] });
    } catch {
      toast.error(isAr ? 'فشل تعديل حالة الفصل' : 'Failed to toggle term');
    }
  };

  const columns: ColumnDef<RegistrationTermItem>[] = [
    {
      key: 'academicYear',
      header: isAr ? 'السنة الدراسية' : 'Academic Year',
      render: (term) => (
        <TableCell className="font-mono font-bold text-foreground">
          {term.academicYear}
        </TableCell>
      ),
    },
    {
      key: 'semester',
      header: isAr ? 'الفصل الدراسي' : 'Semester',
      render: (term) => (
        <TableCell className="font-semibold text-foreground">
          {term.semester.toUpperCase()}
        </TableCell>
      ),
    },
    {
      key: 'status',
      header: isAr ? 'استقبال التسجيل' : 'Registration Status',
      render: (term) => (
        <TableCell>
          <StatusBadge
            label={term.isOpen ? (isAr ? 'مفتوح الآن' : 'Open') : (isAr ? 'مغلق' : 'Closed')}
            variant={term.isOpen ? 'success' : 'danger'}
          />
        </TableCell>
      ),
    },
    {
      key: 'actions',
      header: isAr ? 'الإجراءات' : 'Actions',
      render: (term) => (
        <TableCell className="text-center">
          <Button
            size="sm"
            variant={term.isOpen ? 'destructive' : 'default'}
            onClick={() => handleToggle(term)}
            className="gap-1.5"
          >
            {term.isOpen ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
            {term.isOpen ? (isAr ? 'إغلاق التسجيل' : 'Close Term') : (isAr ? 'فتح التسجيل' : 'Open Term')}
          </Button>
        </TableCell>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-foreground">{isAr ? 'مواعيد فصول التسجيل' : 'Registration Terms'}</h3>
      </div>
      <DataTableShell
        columns={columns}
        data={terms}
        keyExtractor={(term) => term._id}
        isLoading={termsQuery.isLoading}
        isError={termsQuery.isError}
        error={termsQuery.error}
        errorMessage={isAr ? 'فشل تحميل مواعيد التسجيل' : 'Failed to load terms'}
        emptyMessage={isAr ? 'لا توجد فصول دراسية مسجلة' : 'No terms recorded'}
        loadingMessage={isAr ? 'جاري التحميل...' : 'Loading terms...'}
        onRetry={() => termsQuery.refetch()}
        retryLabel={isAr ? 'إعادة المحاولة' : 'Retry'}
      />
    </div>
  );
}
