'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Edit2, Lock, Trash2, UserCheck, UserX } from 'lucide-react';
import { DataTableShell, type ColumnDef } from '@/components/ui/data-table-shell';
import { StatusBadge } from '@/components/ui/status-badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { TableCell } from '@/components/ui/table';
import { CopyButton } from '@/components/ui/copy-button';
import { cn } from '@/lib/cn';

export interface StudentUserRef {
  isActive?: boolean;
  mustChangePassword?: boolean;
  lastLoginAt?: string;
  phone?: string;
  nationalIdMasked?: string;
  nationalId?: string;
}

export interface Student {
  _id: string;
  studentCode: string;
  fullName: string;
  nationalIdMasked?: string;
  nationalId?: string;
  academicEmail?: string;
  department?: string;
  level: string;
  group?: string;
  section?: string;
  academicYear: string;
  semester: string;
  enrollmentStatus: string;
  seatNumber?: string;
  examRoom?: string;
  examFloor?: string;
  examBuilding?: string;
  createdAt?: string;
  updatedAt?: string;
  userId?: StudentUserRef | string;
  registrationSummary?: {
    academicYear?: string;
    semester?: string;
    isTermOpen: boolean;
    status: string;
    registrationId?: string;
    courseCount: number;
    totalCreditHours: number;
    advisingCaseId?: string;
    advisingStatus: string;
  };
}

function getUserRef(student: Student): StudentUserRef | null {
  return typeof student.userId === 'object' && student.userId ? student.userId : null;
}

function ActionButton({
  children,
  variant = 'neutral',
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode;
  variant?: 'neutral' | 'primary' | 'danger' | 'success';
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-squircle border px-3 py-1.5 text-xs font-bold transition-all disabled:cursor-not-allowed disabled:opacity-45',
        variant === 'primary' && 'border-primary/30 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground',
        variant === 'danger' && 'border-danger/30 bg-danger/10 text-danger hover:bg-danger hover:text-danger-foreground',
        variant === 'success' && 'border-success/30 bg-success/10 text-success hover:bg-success hover:text-white',
        variant === 'neutral' && 'border-border bg-surface/50 text-muted-foreground hover:border-primary/35 hover:bg-primary/10 hover:text-primary',
      )}
    >
      {children}
    </button>
  );
}

function SensitiveNationalId({
  value,
  realValue,
  canView,
}: {
  value?: string;
  realValue?: string;
  canView: boolean;
}) {
  if (!canView) {
    return (
      <span className="rounded-squircle border border-border/70 bg-surface/50 px-2.5 py-1 text-xs font-semibold text-muted-foreground">
        Restricted
      </span>
    );
  }

  const displayValue = realValue || value;

  if (!displayValue) {
    return <span className="text-sm text-muted-foreground">N/A</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-sm text-muted-foreground">{displayValue}</span>
      <CopyButton
        value={realValue || displayValue}
        label="Copy"
        successMessage="National ID copied"
        className="rounded-squircle px-2 py-1"
      />
    </div>
  );
}

interface StudentTableProps {
  students: Student[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  locale: string;
  canViewSensitiveStudentData: boolean;
  selectedKeys: string[];
  onSelectedKeysChange: (keys: string[]) => void;
  onViewStudent: (student: Student) => void;
  onEditStudent: (student: Student) => void;
  onResetPassword: (student: Student) => void;
  onActivateStudent: (student: Student) => void;
  onDeactivateStudent: (ids: string[]) => void;
  onBulkEdit: () => void;
  onOpenBulkDeactivate: () => void;
  onRetry: () => void;
  t: (key: string) => string;
  tCommon: (key: string) => string;
}

export function StudentTable({
  students,
  isLoading,
  isError,
  error,
  locale,
  canViewSensitiveStudentData,
  selectedKeys,
  onSelectedKeysChange,
  onViewStudent,
  onEditStudent,
  onResetPassword,
  onActivateStudent,
  onDeactivateStudent,
  onBulkEdit,
  onOpenBulkDeactivate,
  onRetry,
  t,
  tCommon,
}: StudentTableProps) {
  const router = useRouter();

  const columns: ColumnDef<Student>[] = [
    {
      key: 'studentCode',
      header: t('studentCode'),
      render: (student) => (
        <TableCell className="min-w-44 p-4 font-mono">
          <button
            type="button"
            onClick={() => onViewStudent(student)}
            className="text-start font-bold text-primary hover:underline"
          >
            {student.studentCode}
          </button>
        </TableCell>
      ),
    },
    {
      key: 'fullName',
      header: t('studentName'),
      render: (student) => (
        <TableCell className="min-w-56 p-4">
          <div className="font-semibold text-foreground">{student.fullName}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {student.academicEmail || 'No academic email'}
          </div>
        </TableCell>
      ),
    },
    {
      key: 'academic',
      header: 'Academic Info',
      render: (student) => (
        <TableCell className="min-w-52 p-4 text-sm">
          <div className="font-semibold text-foreground">Level {student.level} · {student.academicYear}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {student.department || 'No department'} · {student.group || 'No group'} · {student.section || 'No section'}
          </div>
        </TableCell>
      ),
    },
    {
      key: 'exam',
      header: 'Exam / Seat',
      render: (student) => (
        <TableCell className="min-w-44 p-4 text-sm">
          <div className="font-mono text-foreground">{student.seatNumber || 'No seat'}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {[student.examBuilding, student.examFloor, student.examRoom].filter(Boolean).join(' / ') || 'No exam place'}
          </div>
        </TableCell>
      ),
    },
    {
      key: 'nationalId',
      header: t('nationalId'),
      render: (student) => (
        <TableCell className="p-4">
          <SensitiveNationalId
            value={student.nationalIdMasked || getUserRef(student)?.nationalIdMasked}
            realValue={getUserRef(student)?.nationalId}
            canView={canViewSensitiveStudentData}
          />
        </TableCell>
      ),
    },
    {
      key: 'registration',
      header: locale === 'ar' ? 'التسجيل' : 'Registration',
      render: (student) => {
        const summary = student.registrationSummary;
        const registered = summary?.status === 'approved';
        return (
          <TableCell className="min-w-52 p-4">
            <button
              type="button"
              onClick={() => router.push(`/${locale}/admin/academic-advising?student=${student.studentCode}`)}
              className="text-start"
            >
              <StatusBadge
                label={registered ? (locale === 'ar' ? 'مسجل' : 'Registered') : (locale === 'ar' ? 'غير مسجل' : 'Not registered')}
                variant={registered ? 'success' : 'warning'}
              />
              <span className="mt-1 block text-xs text-muted-foreground">
                {summary?.academicYear ?? '—'} · {summary?.semester ?? '—'}
              </span>
            </button>
          </TableCell>
        );
      },
    },
    {
      key: 'status',
      header: t('enrollmentStatus'),
      render: (student) => (
        <TableCell className="p-4">
          <StatusBadge
            label={t(`status_${student.enrollmentStatus}`)}
            variant={
              student.enrollmentStatus === 'active'
                ? 'success'
                : student.enrollmentStatus === 'suspended'
                  ? 'warning'
                  : 'danger'
            }
          />
        </TableCell>
      ),
    },
    {
      key: 'actions',
      header: tCommon('actions'),
      className: 'min-w-[300px] text-center',
      render: (student) => (
        <TableCell className="min-w-[300px] p-4 text-center">
          <div className="flex flex-nowrap items-center justify-center gap-2">
            <ActionButton onClick={() => onEditStudent(student)} title={tCommon('edit')}>
              <Edit2 className="h-3.5 w-3.5" />
              {tCommon('edit')}
            </ActionButton>
            <ActionButton onClick={() => onResetPassword(student)} title={t('resetPassword')}>
              <Lock className="h-3.5 w-3.5" />
              Reset
            </ActionButton>
            {student.enrollmentStatus === 'active' ? (
              <ConfirmDialog
                trigger={
                  <span>
                    <ActionButton variant="danger" title={t('deactivate')}>
                      <UserX className="h-3.5 w-3.5" />
                      {t('deactivate')}
                    </ActionButton>
                  </span>
                }
                title={t('deactivate')}
                description={
                  <>
                    {locale === 'ar' ? 'هل أنت متأكد من تعطيل حساب هذا الطالب؟' : 'Are you sure you want to suspend this student?'}{' '}
                    <span className="font-bold text-danger">&quot;{student.fullName}&quot;</span>
                  </>
                }
                confirmLabel={t('deactivate')}
                cancelLabel={tCommon('cancel')}
                onConfirm={() => onDeactivateStudent([student._id])}
              />
            ) : (
              <ActionButton variant="success" onClick={() => onActivateStudent(student)} title="Activate">
                <UserCheck className="h-3.5 w-3.5" />
                Activate
              </ActionButton>
            )}
          </div>
        </TableCell>
      ),
    },
  ];

  return (
    <DataTableShell
      columns={columns}
      data={students}
      keyExtractor={(student) => student._id}
      isLoading={isLoading}
      isError={isError}
      error={error}
      errorMessage={tCommon('errorLoading')}
      emptyMessage={tCommon('noData')}
      loadingMessage={tCommon('loading')}
      onRetry={onRetry}
      retryLabel={tCommon('retry')}
      enableSelection={canViewSensitiveStudentData}
      selectedKeys={selectedKeys}
      onSelectedKeysChange={onSelectedKeysChange}
      bulkActions={[
        ...(selectedKeys.length === 1
          ? [{
              label: locale === 'ar' ? 'تعديل' : 'Edit',
              onClick: onBulkEdit,
              variant: 'default' as const,
              icon: <Edit2 className="h-3.5 w-3.5" />,
            }]
          : []),
        {
          label: locale === 'ar' ? 'تعطيل الحساب' : 'Deactivate',
          onClick: onOpenBulkDeactivate,
          variant: 'destructive' as const,
          icon: <Trash2 className="h-3.5 w-3.5" />,
        },
      ]}
    />
  );
}
