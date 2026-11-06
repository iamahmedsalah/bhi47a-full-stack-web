'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import {
  ArrowLeftRight,
  Edit2,
  ExternalLink,
  Eye,
  GraduationCap,
  Hash,
  Lock,
  Mail,
  MoreVertical,
  Trash2,
  User,
  UserCheck,
  UserX,
} from 'lucide-react';
import { DataTableShell, type ColumnDef } from '@/components/ui/data-table-shell';
import { StatusBadge } from '@/components/ui/status-badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { TableCell } from '@/components/ui/table';
import { CopyButton } from '@/components/ui/copy-button';
import { CustomDropdown, type CustomDropdownOption } from '@/components/ui/custom-dropdown';
import { useAuth } from '@/providers/auth-provider';
import { deleteStudent } from '../api';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/api';

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
  fullNameAr?: string;
  fullNameEn?: string;
  nationalIdMasked?: string;
  nationalId?: string;
  phone?: string;
  address?: string;
  guardians?: Array<{ name: string; relation: string; phone: string }>;
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

function SensitiveNationalId({
  value,
  canView,
}: {
  value?: string;
  canView: boolean;
}) {
  if (!canView || !value) {
    return (
      <span className="rounded-squircle border border-border/70 bg-surface/50 px-2.5 py-1 text-xs font-semibold text-muted-foreground">
        Restricted
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-sm font-medium text-foreground">{value}</span>
      <CopyButton
        value={value}
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
  onTransferDepartment?: (student: Student) => void;
  onBulkTransferDepartment?: () => void;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  onSortChange?: (field: string, order: 'asc' | 'desc') => void;
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
  sortBy,
  sortOrder,
  onSortChange,
  onViewStudent,
  onEditStudent,
  onResetPassword,
  onActivateStudent,
  onDeactivateStudent,
  onBulkEdit,
  onOpenBulkDeactivate,
  onTransferDepartment,
  onBulkTransferDepartment,
  onRetry,
  t,
  tCommon,
}: StudentTableProps) {
  const tCodes = useTranslations('studentCodes');
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const canWriteStudents = isAdmin || Boolean(user?.permissions?.includes('students.write'));
  const canResetPassword = isAdmin || Boolean(user?.permissions?.includes('students.reset_password'));
  const canAdvising = isAdmin || Boolean(user?.permissions?.includes('advising.read')) || Boolean(user?.permissions?.includes('advising.write'));
  const [studentToDeactivate, setStudentToDeactivate] = React.useState<Student | null>(null);
  const [studentToDelete, setStudentToDelete] = React.useState<Student | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const columns: ColumnDef<Student>[] = [
    {
      key: 'studentCode',
      header: (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <Hash className="h-3.5 w-3.5 text-primary/70 shrink-0" />
          <span>{t('studentCode')}</span>
        </span>
      ),
      sortable: true,
      className: 'min-w-[150px] whitespace-nowrap text-start',
      render: (student) => (
        <TableCell className="min-w-[150px] py-2.5 px-3 font-mono font-bold text-foreground whitespace-nowrap">
          <button
            type="button"
            onClick={() => onViewStudent(student)}
            className="group inline-flex items-center gap-1.5 rounded-squircle border border-border/70 bg-card/60 px-2.5 py-1 text-xs font-mono font-bold text-primary transition-all hover:border-primary/50 hover:bg-primary/10 hover:shadow-xs cursor-pointer select-none"
            title={locale === 'ar' ? 'عرض الملف الأكاديمي' : 'View academic profile'}
          >
            <Hash className="h-3 w-3 text-primary/60 group-hover:text-primary transition-colors shrink-0" />
            <span dir="ltr">{student.studentCode}</span>
          </button>
        </TableCell>
      ),
    },
    {
      key: 'fullName',
      header: (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <User className="h-3.5 w-3.5 text-primary/70 shrink-0" />
          <span>{t('studentName')}</span>
        </span>
      ),
      sortable: true,
      sortKey: 'fullName',
      className: 'min-w-[220px] text-start',
      render: (student) => {
        const isAr = locale === 'ar';
        const primaryName = isAr
          ? (student.fullNameAr || student.fullName)
          : (student.fullNameEn || student.fullName);
        const secondaryName = isAr ? student.fullNameEn : student.fullNameAr;

        return (
          <TableCell className="min-w-[220px] py-2.5 px-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-squircle border border-border/60 bg-secondary/40 text-muted-foreground group-hover:border-primary/30 group-hover:text-primary transition-colors">
                <GraduationCap className="h-4 w-4 text-primary/80" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-foreground leading-tight truncate">
                  {primaryName}
                </div>
                {secondaryName && secondaryName !== primaryName ? (
                  <div className="text-[11px] text-muted-foreground/80 mt-0.5 truncate max-w-[240px]">
                    {secondaryName}
                  </div>
                ) : null}
                <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground truncate max-w-[240px]">
                  {student.academicEmail ? (
                    <>
                      <Mail className="h-2.5 w-2.5 shrink-0 opacity-70" />
                      <span className="truncate font-mono text-[11px]" dir="ltr">
                        {student.academicEmail}
                      </span>
                    </>
                  ) : (
                    <span className="text-[10px] text-muted-foreground/60 italic">
                      {locale === 'ar' ? 'لا يوجد بريد أكاديمي' : 'No academic email'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </TableCell>
        );
      },
    },
    {
      key: 'academic',
      header: locale === 'ar' ? 'المستوى والقسم' : 'Academic Info',
      className: 'min-w-[140px] text-start',
      render: (student) => (
        <TableCell className="min-w-[140px] py-2.5 px-3 text-xs">
          <div className="font-semibold text-foreground">Level {student.level} · {student.academicYear}</div>
          <div className="mt-0.5 text-muted-foreground">
            {[student.department, student.group, student.section].filter(Boolean).join(' · ') || '—'}
          </div>
        </TableCell>
      ),
    },
    {
      key: 'exam',
      header: locale === 'ar' ? 'اللجنة / المقر' : 'Exam / Seat',
      className: 'min-w-[120px] text-start',
      render: (student) => (
        <TableCell className="min-w-[120px] py-2.5 px-3 text-xs">
          <div className="font-mono font-semibold text-foreground">{student.seatNumber || '—'}</div>
          <div className="mt-0.5 text-muted-foreground">
            {[student.examBuilding, student.examRoom].filter(Boolean).join(' / ') || '—'}
          </div>
        </TableCell>
      ),
    },
    {
      key: 'nationalId',
      header: t('nationalId'),
      className: 'min-w-[130px] text-start',
      render: (student) => (
        <TableCell className="min-w-[130px] py-2.5 px-3">
          <SensitiveNationalId
            value={student.nationalId || getUserRef(student)?.nationalId}
            canView={canViewSensitiveStudentData}
          />
        </TableCell>
      ),
    },
    {
      key: 'registration',
      header: locale === 'ar' ? 'التسجيل' : 'Registration',
      className: 'min-w-[110px] text-start',
      render: (student) => {
        const summary = student.registrationSummary;
        const registered = summary?.status === 'approved';
        return (
          <TableCell className="min-w-[110px] py-2.5 px-3">
            <button
              type="button"
              onClick={() => router.push(`/${locale}/admin/academic-advising?student=${student.studentCode}`)}
              className="text-start"
            >
              <StatusBadge
                label={registered ? (locale === 'ar' ? 'مسجل' : 'Registered') : (locale === 'ar' ? 'غير مسجل' : 'Not registered')}
                variant={registered ? 'success' : 'warning'}
              />
              <span className="mt-0.5 block text-[11px] text-muted-foreground">
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
      className: 'w-24 text-center',
      render: (student) => (
        <TableCell className="w-24 py-2.5 px-2 text-center">
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
      className: 'w-14 text-center',
      render: (student) => {
        const actionOptions: CustomDropdownOption[] = [
          {
            value: 'profile',
            label: (
              <div className="flex items-center gap-2 text-xs py-0.5">
                <Eye className="h-3.5 w-3.5 text-primary" />
                <span>{locale === 'ar' ? 'عرض الملف الكامل' : 'View Full Profile'}</span>
              </div>
            ),
          },
          ...(canWriteStudents
            ? [
                {
                  value: 'edit',
                  label: (
                    <div className="flex items-center gap-2 text-xs py-0.5">
                      <Edit2 className="h-3.5 w-3.5 text-primary" />
                      <span>{tCommon('edit')}</span>
                    </div>
                  ),
                },
              ]
            : []),
          ...(canResetPassword
            ? [
                {
                  value: 'resetPassword',
                  label: (
                    <div className="flex items-center gap-2 text-xs py-0.5">
                      <Lock className="h-3.5 w-3.5 text-warning" />
                      <span>{t('resetPassword')}</span>
                    </div>
                  ),
                },
              ]
            : []),
          ...(canWriteStudents
            ? [
                {
                  value: 'transfer',
                  label: (
                    <div className="flex items-center gap-2 text-xs py-0.5">
                      <ArrowLeftRight className="h-3.5 w-3.5 text-primary" />
                      <span>{locale === 'ar' ? 'تحويل الشعبة (BIS ⇄ محاسبة)' : 'Transfer Department'}</span>
                    </div>
                  ),
                },
              ]
            : []),
          ...(canAdvising
            ? [
                {
                  value: 'advising',
                  label: (
                    <div className="flex items-center gap-2 text-xs py-0.5">
                      <ExternalLink className="h-3.5 w-3.5 text-info" />
                      <span>{locale === 'ar' ? 'التسجيل والإرشاد الأكاديمي' : 'Academic Advising'}</span>
                    </div>
                  ),
                },
              ]
            : []),
          ...(canWriteStudents
            ? student.enrollmentStatus === 'active'
              ? [
                  {
                    value: 'deactivate',
                    label: (
                      <div className="flex items-center gap-2 text-xs py-0.5 text-danger font-medium">
                        <UserX className="h-3.5 w-3.5 text-danger" />
                        <span>{t('deactivate')}</span>
                      </div>
                    ),
                  },
                ]
              : [
                  {
                    value: 'activate',
                    label: (
                      <div className="flex items-center gap-2 text-xs py-0.5 text-success font-medium">
                        <UserCheck className="h-3.5 w-3.5 text-success" />
                        <span>{locale === 'ar' ? 'تفعيل الحساب' : 'Activate'}</span>
                      </div>
                    ),
                  },
                ]
            : []),
          ...(isAdmin
            ? [
                {
                  value: 'delete',
                  label: (
                    <div className="flex items-center gap-2 text-xs py-0.5 text-danger font-medium">
                      <Trash2 className="h-3.5 w-3.5 text-danger" />
                      <span>{locale === 'ar' ? 'حذف الطالب نهائياً' : 'Delete Student'}</span>
                    </div>
                  ),
                },
              ]
            : []),
        ];

        return (
          <TableCell className="w-14 py-2.5 px-2 text-center">
            <div className="inline-flex justify-center" onClick={(e) => e.stopPropagation()}>
              <CustomDropdown
                value=""
                ariaLabel={tCommon('actions')}
                placeholder={<MoreVertical className="h-4 w-4 text-muted-foreground hover:text-primary transition-colors" />}
                options={actionOptions}
                onValueChange={(val) => {
                  if (val === 'profile') onViewStudent(student);
                  else if (val === 'edit') onEditStudent(student);
                  else if (val === 'resetPassword') onResetPassword(student);
                  else if (val === 'transfer') onTransferDepartment?.(student);
                  else if (val === 'advising') router.push(`/${locale}/admin/academic-advising?student=${student.studentCode}`);
                  else if (val === 'deactivate') setStudentToDeactivate(student);
                  else if (val === 'activate') onActivateStudent(student);
                  else if (val === 'delete') setStudentToDelete(student);
                }}
                className="h-8 w-8 min-w-8 p-0 justify-center rounded-lg border border-border/60 hover:bg-primary/10 hover:border-primary/40 [&>svg]:hidden cursor-pointer"
                menuClassName="w-52"
              />
            </div>
          </TableCell>
        );
      },
    },
  ];

  return (
    <>
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
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortChange={onSortChange}
        bulkActions={[
          ...(canWriteStudents && selectedKeys.length === 1
            ? [{
                label: locale === 'ar' ? 'تعديل' : 'Edit',
                onClick: onBulkEdit,
                variant: 'default' as const,
                icon: <Edit2 className="h-3.5 w-3.5" />,
              }]
            : []),
          ...(canWriteStudents
            ? [
                {
                  label: locale === 'ar' ? 'تحويل الشعبة / القسم' : 'Transfer Department',
                  onClick: onBulkTransferDepartment || (() => {}),
                  variant: 'outline' as const,
                  icon: <ArrowLeftRight className="h-3.5 w-3.5" />,
                },
                {
                  label: locale === 'ar' ? 'تعطيل الحساب' : 'Deactivate',
                  onClick: onOpenBulkDeactivate,
                  variant: 'destructive' as const,
                  icon: <Trash2 className="h-3.5 w-3.5" />,
                },
              ]
            : []),
        ]}
      />
      <ConfirmDialog
        open={studentToDeactivate != null}
        onOpenChange={(open) => {
          if (!open) setStudentToDeactivate(null);
        }}
        title={t('deactivate')}
        description={
          <>
            {locale === 'ar'
              ? 'هل أنت متأكد من تعطيل حساب الطالب '
              : 'Are you sure you want to suspend the account of student '}
            <span className="font-bold text-danger">&quot;{studentToDeactivate?.fullName}&quot;</span>
            {locale === 'ar'
              ? '؟ سيتم إيقاف دخوله إلى البوابة.'
              : '? Their portal access will be deactivated.'}
          </>
        }
        confirmLabel={t('deactivate')}
        cancelLabel={tCommon('cancel')}
        onConfirm={() => {
          if (studentToDeactivate) {
            onDeactivateStudent([studentToDeactivate._id]);
            setStudentToDeactivate(null);
          }
        }}
      />
      <ConfirmDialog
        open={Boolean(studentToDelete)}
        onOpenChange={(open) => {
          if (!open) setStudentToDelete(null);
        }}
        title={locale === 'ar' ? 'حذف الطالب نهائياً' : 'Delete Student Permanently'}
        description={
          /^\d{6}$/.test(studentToDelete?.studentCode ?? '')
            ? tCodes('deleteStudentHint')
            : locale === 'ar'
            ? `هل أنت متأكد من حذف الطالب "${studentToDelete?.fullNameAr || studentToDelete?.fullName}" (${studentToDelete?.studentCode}) نهائياً؟ سيتم إزالة حسابه وجميع بياناته وسجلاته الأكاديمية ولا يمكن التراجع عن هذا الإجراء.`
            : `Are you sure you want to permanently delete student "${studentToDelete?.fullName}" (${studentToDelete?.studentCode})? All academic records and account data will be permanently removed.`
        }
        confirmLabel={locale === 'ar' ? 'حذف نهائي' : 'Delete Permanently'}
        cancelLabel={tCommon('cancel')}
        destructive
        disabled={isDeleting}
        onConfirm={async () => {
          if (!studentToDelete) return;
          setIsDeleting(true);
          try {
            await deleteStudent(studentToDelete._id);
            toast.success(
              locale === 'ar'
                ? 'تم حذف الطالب بنجاح'
                : 'Student deleted successfully',
            );
            setStudentToDelete(null);
            onRetry();
          } catch (e) {
            toast.error(
              getApiErrorMessage(
                e,
                locale === 'ar'
                  ? 'تعذر حذف الطالب'
                  : 'Failed to delete student',
              ),
            );
          } finally {
            setIsDeleting(false);
          }
        }}
      />
    </>
  );
}
