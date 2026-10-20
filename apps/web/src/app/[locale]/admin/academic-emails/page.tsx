'use client';

import React, { useState, Suspense } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import api, { getApiErrorMessage, PaginatedResponse } from '@/lib/api';
import { Download, Edit2, Loader2, Mail, UploadCloud, UserCheck, UserX } from 'lucide-react';
import { toast } from 'sonner';
import { downloadExcel } from '@/lib/utils';

// Reusable components
import { PageTitleBanner } from '@/components/ui/page-title-banner';
import { DataTableShell, type ColumnDef } from '@/components/ui/data-table-shell';
import { FilterBar } from '@/components/ui/filter-bar';
import { CopyButton } from '@/components/ui/copy-button';
import { StatusBadge } from '@/components/ui/status-badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { PageSkeletonLoader } from '@/components/ui/page-suspense-fallback';
import { DataUploadDialog } from '@/components/ui/data-upload-dialog';
import { PermissionGuard } from '@/components/ui/permission-guard';
import { TableActionButton } from '@/components/ui/table-action-button';
import { useAuth } from '@/providers/auth-provider';

// shadcn
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface AcademicEmail {
  _id: string;
  studentCode: string;
  studentName: string;
  academicEmail: string;
  status: 'active' | 'inactive';
}

const academicEmailImportColumns = ['studentCode', 'academicEmail', 'status'];

function AcademicEmailsPageContent() {
  const t = useTranslations('academicEmails');
  const tCommon = useTranslations('common');
  const params = useParams();
  const locale = params.locale as string;
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const canWriteEmails = isAdmin || Boolean(user?.permissions?.includes('academicEmails.write'));
  const canUploadEmails = isAdmin || Boolean(user?.permissions?.includes('uploads.import'));

  // Filter States
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const limit = 10;

  // Modal States
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<AcademicEmail | null>(null);

  // Form States
  const [academicEmail, setAcademicEmail] = useState('');
  const [emailStatus, setEmailStatus] = useState<'active' | 'inactive'>('active');
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');

  const recordsQuery = useQuery({
    queryKey: ['academic-emails', search, status, page, limit],
    queryFn: async () => {
      const queryParams: Record<string, string | number> = {
        page,
        limit,
      };
      if (search) queryParams.search = search;
      if (status !== 'all') queryParams.status = status;

      const res = await api.get<PaginatedResponse<AcademicEmail>>(
        '/admin/academic-emails',
        { params: queryParams },
      );
      return res.data;
    },
  });

  const records = recordsQuery.data?.items || [];
  const total = recordsQuery.data?.total || 0;
  const totalPages = recordsQuery.data?.totalPages || 1;
  const fromRow = total === 0 ? 0 : (page - 1) * limit + 1;
  const toRow = Math.min(page * limit, total);

  const openEditModal = (record: AcademicEmail) => {
    setSelectedRecord(record);
    setAcademicEmail(record.academicEmail);
    setEmailStatus(record.status);
    setFormError('');
    setIsEditOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecord) return;
    setFormError('');
    setFormLoading(true);

    try {
      await api.patch(`/admin/academic-emails/${selectedRecord._id}`, {
        academicEmail,
        status: emailStatus,
      });
      setIsEditOpen(false);
      toast.success(t('updateSuccess'));
      void queryClient.invalidateQueries({ queryKey: ['academic-emails'] });
    } catch (err: unknown) {
      setFormError(getApiErrorMessage(err, t('updateError')));
    } finally {
      setFormLoading(false);
    }
  };

  const toggleEmailStatus = async (record: AcademicEmail) => {
    const newStatus = record.status === 'active' ? 'inactive' : 'active';
    try {
      await api.patch(`/admin/academic-emails/${record._id}`, {
        status: newStatus,
      });
      toast.success(
        locale === 'ar'
          ? 'تم تحديث حالة البريد بنجاح'
          : 'Email status updated successfully'
      );
      void queryClient.invalidateQueries({ queryKey: ['academic-emails'] });
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    }
  };

  const exportAcademicEmails = async () => {
    setIsExporting(true);
    try {
      const allRecords: AcademicEmail[] = [];
      let exportPage = 1;
      let totalPages = 1;

      do {
        const queryParams: Record<string, string | number> = {
          page: exportPage,
          limit: 100,
        };
        if (search) queryParams.search = search;
        if (status !== 'all') queryParams.status = status;

        const res = await api.get<PaginatedResponse<AcademicEmail>>('/admin/academic-emails', {
          params: queryParams,
        });
        allRecords.push(...res.data.items);
        totalPages = res.data.totalPages || 1;
        exportPage += 1;
      } while (exportPage <= totalPages);

      downloadExcel(
        allRecords.map((record) => ({
          studentCode: record.studentCode,
          studentName: record.studentName,
          academicEmail: record.academicEmail,
          status: record.status,
        })),
        ['Student Code', 'Student Name', 'Academic Email', 'Status'],
        `academic_emails_export_${new Date().toISOString().slice(0, 10)}`,
      );
      toast.success(locale === 'ar' ? 'تم تجهيز ملف البريد الأكاديمي' : 'Academic emails export is ready');
    } catch (err) {
      toast.error(getApiErrorMessage(err, locale === 'ar' ? 'فشل تصدير البريد الأكاديمي' : 'Failed to export academic emails'));
    } finally {
      setIsExporting(false);
    }
  };

  /* ─── Column Definitions ──────────────────────────── */
  const columns: ColumnDef<AcademicEmail>[] = [
    {
      key: 'studentCode',
      header: t('studentCode'),
      render: (r) => (
        <TableCell className="p-4 font-mono font-semibold text-foreground">
          {r.studentCode}
        </TableCell>
      ),
    },
    {
      key: 'studentName',
      header: t('studentName'),
      render: (r) => (
        <TableCell className="p-4 font-medium text-foreground">
          {r.studentName}
        </TableCell>
      ),
    },
    {
      key: 'academicEmail',
      header: t('emailAddress'),
      render: (r) => (
        <TableCell className="p-4 font-mono text-primary">
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-muted shrink-0" />
            <span className="truncate max-w-[200px] md:max-w-xs">{r.academicEmail}</span>
            <CopyButton value={r.academicEmail} successMessage={tCommon('copied')} />
          </div>
        </TableCell>
      ),
    },
    {
      key: 'status',
      header: t('status'),
      render: (r) => (
        <TableCell className="p-4">
          <StatusBadge
            label={r.status === 'active' ? tCommon('active') : tCommon('inactive')}
            variant={r.status === 'active' ? 'success' : 'danger'}
          />
        </TableCell>
      ),
    },
    ...((canWriteEmails)
      ? [
          {
            key: 'actions',
            header: tCommon('actions'),
            className: 'text-center',
            render: (r: AcademicEmail) => (
              <TableCell className="p-4 text-center">
                <div className="flex items-center justify-center gap-2">
                  <TableActionButton
                    onClick={() => openEditModal(r)}
                    title={tCommon('edit')}
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>{tCommon('edit')}</span>
                  </TableActionButton>
                  <ConfirmDialog
                    trigger={
                      <TableActionButton
                        title={r.status === 'active' ? tCommon('disable') : tCommon('enable')}
                        variant={r.status === 'active' ? 'danger' : 'success'}
                      >
                        {r.status === 'active' ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                        <span>{r.status === 'active' ? tCommon('disable') : tCommon('enable')}</span>
                      </TableActionButton>
                    }
                    title={r.status === 'active' ? tCommon('deactivateConfirmTitle') : tCommon('confirm')}
                    description={
                      r.status === 'active'
                        ? tCommon('deactivateConfirmMessage')
                        : locale === 'ar'
                        ? 'هل أنت متأكد من تفعيل هذا الحساب؟'
                        : 'Are you sure you want to activate this account?'
                    }
                    confirmLabel={r.status === 'active' ? tCommon('disable') : tCommon('enable')}
                    cancelLabel={tCommon('cancel')}
                    onConfirm={() => toggleEmailStatus(r)}
                    destructive={r.status === 'active'}
                  />
                </div>
              </TableCell>
            ),
          } satisfies ColumnDef<AcademicEmail>,
        ]
      : []),
  ];

  return (
    <div className="animate-fade-in space-y-6 p-2 md:p-6">
      {/* Page Header */}
      <PageTitleBanner
        title={t('title')}
        icon={<Mail className="h-5 w-5" />}
        subtitle={t('subtitle')}
      >
        {canUploadEmails && (
          <Button variant="outline" onClick={() => setIsUploadOpen(true)}>
            <UploadCloud className="h-4 w-4" />
            <span>{t('uploadEmails')}</span>
          </Button>
        )}
        <Button variant="outline" onClick={exportAcademicEmails} disabled={isExporting}>
          {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          <span>{tCommon('export')}</span>
        </Button>
      </PageTitleBanner>

      {/* Filters */}
      <FilterBar
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        searchPlaceholder={t('searchPlaceholder')}
      >
        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[180px] border-border bg-secondary/50">
            <SelectValue placeholder={t('status')} />
          </SelectTrigger>
          <SelectContent className="border-border bg-card">
            <SelectItem value="all">{t('status')}: {tCommon('all')}</SelectItem>
            <SelectItem value="active">{tCommon('active')}</SelectItem>
            <SelectItem value="inactive">{tCommon('inactive')}</SelectItem>
          </SelectContent>
        </Select>
      </FilterBar>

      {/* Total Count */}
      <p className="text-sm text-muted">
        Showing <span className="font-bold text-foreground">{fromRow}-{toRow}</span> of{' '}
        <span className="font-bold text-foreground">{total}</span>
      </p>

      {/* Reusable Data Table Shell */}
      <DataTableShell
        columns={columns}
        data={records}
        keyExtractor={(r) => r._id}
        isLoading={recordsQuery.isLoading}
        isError={recordsQuery.isError}
        errorMessage={tCommon('errorLoading')}
        emptyMessage={tCommon('noData')}
        loadingMessage={tCommon('loading')}
        onRetry={() => recordsQuery.refetch()}
        retryLabel={tCommon('retry')}
      />

      <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/70 p-3 sm:flex-row sm:items-center sm:justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPage((current) => Math.max(1, current - 1))}
          disabled={page === 1 || recordsQuery.isLoading}
        >
          {tCommon('previous')}
        </Button>
        <span className="text-center font-mono text-sm text-muted-foreground">
          Page <span className="text-foreground">{page}</span> / {Math.max(1, totalPages)}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
          disabled={page >= totalPages || recordsQuery.isLoading}
        >
          {tCommon('next')}
        </Button>
      </div>

      {/* Mobile Card View */}
      <div className="grid grid-cols-1 gap-4 md:hidden">
        {records.map((r) => (
          <div key={r._id} className="rounded-xl border border-border bg-card/95 p-4 backdrop-blur-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-mono font-bold text-foreground">{r.studentCode}</span>
              <StatusBadge
                label={r.status === 'active' ? tCommon('active') : tCommon('inactive')}
                variant={r.status === 'active' ? 'success' : 'danger'}
              />
            </div>
            <div className="text-sm font-semibold text-foreground">{r.studentName}</div>
            <div className="flex items-center gap-2 text-xs font-mono text-primary bg-black/10 p-2 rounded-lg break-all">
              <Mail className="w-3.5 h-3.5 shrink-0" />
              <span>{r.academicEmail}</span>
              <CopyButton value={r.academicEmail} successMessage={tCommon('copied')} className="ms-auto" />
            </div>
            <div className="flex gap-2 border-t border-border/50 pt-3 justify-end">
              <TableActionButton
                onClick={() => openEditModal(r)}
              >
                <Edit2 className="h-3 w-3" /> {tCommon('edit')}
              </TableActionButton>
              <ConfirmDialog
                trigger={
                  <TableActionButton variant={r.status === 'active' ? 'danger' : 'success'}>
                    {r.status === 'active' ? <UserX className="w-3 h-3" /> : <UserCheck className="w-3 h-3" />}
                    <span>{r.status === 'active' ? tCommon('disable') : tCommon('enable')}</span>
                  </TableActionButton>
                }
                title={r.status === 'active' ? tCommon('deactivateConfirmTitle') : tCommon('confirm')}
                description={r.status === 'active' ? tCommon('deactivateConfirmMessage') : 'تأكيد تفعيل الحساب؟'}
                confirmLabel={r.status === 'active' ? tCommon('disable') : tCommon('enable')}
                cancelLabel={tCommon('cancel')}
                onConfirm={() => toggleEmailStatus(r)}
                destructive={r.status === 'active'}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="glass max-w-md border border-white/10 rounded-2xl">
          <DialogHeader className="border-b border-border pb-4">
            <DialogTitle className="text-foreground">{t('updateEmail')}</DialogTitle>
          </DialogHeader>

          {formError && (
            <div className="bg-danger/10 border border-danger/30 text-danger rounded-xl px-4 py-3 text-sm mb-4">
              {formError}
            </div>
          )}

          <form onSubmit={handleEditSubmit} className="space-y-4 pt-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted">{t('emailAddress')} *</label>
              <Input
                type="email"
                required
                value={academicEmail}
                onChange={(e) => setAcademicEmail(e.target.value)}
                className="font-mono text-sm"
                dir="ltr"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted">{t('status')} *</label>
              <Select
                value={emailStatus}
                onValueChange={(val) => setEmailStatus(val as 'active' | 'inactive')}
              >
                <SelectTrigger className="border-border bg-secondary/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-border bg-card">
                  <SelectItem value="active">active</SelectItem>
                  <SelectItem value="inactive">inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <DialogFooter className="border-t border-border pt-4 mt-6 gap-2">
              <Button
                variant="secondary"
                type="button"
                onClick={() => setIsEditOpen(false)}
              >
                {tCommon('cancel')}
              </Button>
              <Button
                type="submit"
                disabled={formLoading}
                className="bg-primary hover:bg-primary-hover text-white font-semibold flex items-center gap-2"
              >
                {formLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                {tCommon('save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <DataUploadDialog
        open={isUploadOpen}
        onOpenChange={setIsUploadOpen}
        title="Upload Academic Emails"
        description="Upload an xlsx, xls, or csv file. Rows are matched by student code and update or create the academic email record."
        uploadType="academic-emails"
        expectedColumns={academicEmailImportColumns}
        onSuccess={() => {
          void queryClient.invalidateQueries({ queryKey: ['academic-emails'] });
        }}
      />
    </div>
  );
}

export default function AcademicEmailsPage() {
  return (
    <Suspense fallback={<PageSkeletonLoader />}>
      <PermissionGuard permission="academic_emails.read">
        <AcademicEmailsPageContent />
      </PermissionGuard>
    </Suspense>
  );
}
