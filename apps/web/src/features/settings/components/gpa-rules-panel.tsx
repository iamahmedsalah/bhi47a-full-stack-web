'use client';

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Edit2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DataTableShell, type ColumnDef } from '@/components/ui/data-table-shell';
import { StatusBadge } from '@/components/ui/status-badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { TableCell } from '@/components/ui/table';
import { listGpaRules, createGpaRule, updateGpaRule, deleteGpaRule, type GpaRuleItem } from '../api';

export function GpaRulesPanel({ locale }: { locale: string }) {
  const isAr = locale === 'ar';
  const queryClient = useQueryClient();

  const rulesQuery = useQuery({
    queryKey: ['admin-gpa-rules'],
    queryFn: () => listGpaRules(),
  });

  const rules = rulesQuery.data ?? [];

  const columns: ColumnDef<GpaRuleItem>[] = [
    {
      key: 'gpaRange',
      header: isAr ? 'المعدل (GPA)' : 'GPA Range',
      render: (rule) => (
        <TableCell className="font-mono text-foreground font-bold">
          {rule.minGpa.toFixed(2)} - {rule.maxGpa.toFixed(2)}
        </TableCell>
      ),
    },
    {
      key: 'creditHours',
      header: isAr ? 'ساعات التسجيل' : 'Credit Hours',
      render: (rule) => (
        <TableCell className="font-mono text-sm">
          {rule.minCreditHours} - {rule.maxCreditHours} hrs
        </TableCell>
      ),
    },
    {
      key: 'requiresAdvisor',
      header: isAr ? 'يتطلب موافقة مرشد' : 'Requires Advisor',
      render: (rule) => (
        <TableCell>
          <StatusBadge
            label={rule.requiresAdvisor ? (isAr ? 'نعم' : 'Yes') : (isAr ? 'لا' : 'No')}
            variant={rule.requiresAdvisor ? 'warning' : 'success'}
          />
        </TableCell>
      ),
    },
    {
      key: 'status',
      header: isAr ? 'الحالة' : 'Status',
      render: (rule) => (
        <TableCell>
          <StatusBadge
            label={rule.isActive ? (isAr ? 'مفعل' : 'Active') : (isAr ? 'معطل' : 'Disabled')}
            variant={rule.isActive ? 'success' : 'neutral'}
          />
        </TableCell>
      ),
    },
    {
      key: 'actions',
      header: isAr ? 'الإجراءات' : 'Actions',
      render: (rule) => (
        <TableCell className="text-center">
          <ConfirmDialog
            trigger={
              <Button size="sm" variant="ghost" className="text-danger hover:bg-danger/10">
                <Trash2 className="h-4 w-4" />
              </Button>
            }
            title={isAr ? 'حذف قاعدة GPA' : 'Delete GPA Rule'}
            description={isAr ? 'هل أنت متأكد من حذف هذه القاعدة؟' : 'Are you sure you want to delete this rule?'}
            confirmLabel={isAr ? 'حذف' : 'Delete'}
            cancelLabel={isAr ? 'إلغاء' : 'Cancel'}
            onConfirm={async () => {
              await deleteGpaRule(rule._id);
              toast.success(isAr ? 'تم حذف القاعدة' : 'Rule deleted');
              void queryClient.invalidateQueries({ queryKey: ['admin-gpa-rules'] });
            }}
          />
        </TableCell>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-foreground">{isAr ? 'قواعد المعدل التراكمي (GPA Rules)' : 'GPA Registration Rules'}</h3>
      </div>
      <DataTableShell
        columns={columns}
        data={rules}
        keyExtractor={(rule) => rule._id}
        isLoading={rulesQuery.isLoading}
        isError={rulesQuery.isError}
        error={rulesQuery.error}
        errorMessage={isAr ? 'فشل تحميل القواعد' : 'Failed to load rules'}
        emptyMessage={isAr ? 'لا توجد قواعد مسجلة' : 'No rules recorded'}
        loadingMessage={isAr ? 'جاري التحميل...' : 'Loading rules...'}
        onRetry={() => rulesQuery.refetch()}
        retryLabel={isAr ? 'إعادة المحاولة' : 'Retry'}
      />
    </div>
  );
}
