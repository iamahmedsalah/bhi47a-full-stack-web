'use client';

import { useDeferredValue, useState } from 'react';
import { Edit2, KeyRound, Plus, Search, ShieldCheck, UserCheck, UserX, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { STAFF_ASSIGNABLE_PERMISSIONS, type Permission } from '@student-portal/shared';
import { Button } from '@/components/ui/button';
import { DataTableShell, type ColumnDef } from '@/components/ui/data-table-shell';
import { Input } from '@/components/ui/input';
import { PageTitleBanner } from '@/components/ui/page-title-banner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TableCell } from '@/components/ui/table';
import { getApiErrorMessage } from '@/lib/api';
import { useStaffList, useStaffMutations } from '../queries';
import type { StaffFormValues } from '../schema';
import type { StaffMember } from '../types';
import { DeactivateStaffDialog } from './deactivate-staff-dialog';
import { ResetStaffPasswordDialog } from './reset-staff-password-dialog';
import { StaffFormDialog } from './staff-form-dialog';
import { StaffPermissionsDialog } from './staff-permissions-dialog';

export function StaffManagementPage() {
  const t = useTranslations('staff');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [permissionsTarget, setPermissionsTarget] = useState<StaffMember | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<StaffMember | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<StaffMember | null>(null);
  const query = useStaffList({ page, limit: 20, search: deferredSearch || undefined, status });
  const mutations = useStaffMutations();

  const fail = (error: unknown) => toast.error(getApiErrorMessage(error, t('toasts.failed')));

  const submitForm = async (values: StaffFormValues) => {
    try {
      const profile = {
        name: values.name,
        email: values.email,
        username: values.username || undefined,
        phone: values.phone || undefined,
      };
      if (editing) {
        await mutations.update.mutateAsync({ id: editing._id, input: profile });
        toast.success(t('toasts.updated'));
      } else {
        await mutations.create.mutateAsync({ ...profile, password: values.password, permissions: [] });
        toast.success(t('toasts.created'));
      }
      setFormOpen(false);
      setEditing(null);
    } catch (error) { fail(error); }
  };

  const savePermissions = async (permissions: Permission[]) => {
    if (!permissionsTarget) return;
    try {
      await mutations.permissions.mutateAsync({ id: permissionsTarget._id, permissions });
      toast.success(t('toasts.permissionsUpdated'));
      setPermissionsTarget(null);
    } catch (error) { fail(error); }
  };

  const resetPassword = async (newPassword: string) => {
    if (!passwordTarget) return;
    try {
      await mutations.resetPassword.mutateAsync({ id: passwordTarget._id, newPassword });
      toast.success(t('toasts.passwordReset'));
      setPasswordTarget(null);
    } catch (error) { fail(error); }
  };

  const deactivate = async (reason?: string) => {
    if (!deactivateTarget) return;
    try {
      await mutations.deactivate.mutateAsync({ id: deactivateTarget._id, reason });
      toast.success(t('toasts.deactivated'));
      setDeactivateTarget(null);
    } catch (error) { fail(error); }
  };

  const activate = async (staff: StaffMember) => {
    try {
      await mutations.activate.mutateAsync(staff._id);
      toast.success(t('toasts.activated'));
    } catch (error) { fail(error); }
  };

  const columns: ColumnDef<StaffMember>[] = [
    {
      key: 'staff', header: t('table.staff'), render: (staff) => (
        <TableCell className="px-4 py-3">
          <div className="font-semibold text-foreground">{staff.name}</div>
          <div className="font-mono text-xs text-muted-foreground">{staff.userCode ?? '—'} · {staff.email ?? '—'}</div>
        </TableCell>
      ),
    },
    {
      key: 'status', header: t('table.status'), render: (staff) => (
        <TableCell className="px-4 py-3">
          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${staff.isActive ? 'border-success/30 bg-success/10 text-success' : 'border-danger/30 bg-danger/10 text-danger'}`}>
            {staff.isActive ? t('active') : t('inactive')}
          </span>
        </TableCell>
      ),
    },
    {
      key: 'permissions', header: t('table.permissions'), render: (staff) => (
        <TableCell className="px-4 py-3 font-mono text-xs">{staff.permissions.length} / {STAFF_ASSIGNABLE_PERMISSIONS.length}</TableCell>
      ),
    },
    {
      key: 'lastLogin', header: t('table.lastLogin'), render: (staff) => (
        <TableCell className="px-4 py-3 text-xs text-muted-foreground">
          {staff.lastLoginAt ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(staff.lastLoginAt)) : t('never')}
        </TableCell>
      ),
    },
    {
      key: 'actions', header: t('table.actions'), render: (staff) => (
        <TableCell className="px-4 py-3">
          <div className="flex flex-wrap gap-1.5">
            <Button size="icon" variant="outline" title={t('actions.edit')} aria-label={t('actions.edit')} onClick={() => { setEditing(staff); setFormOpen(true); }}><Edit2 className="h-4 w-4" /></Button>
            <Button size="icon" variant="outline" title={t('actions.permissions')} aria-label={t('actions.permissions')} onClick={() => setPermissionsTarget(staff)}><ShieldCheck className="h-4 w-4" /></Button>
            <Button size="icon" variant="outline" title={t('actions.resetPassword')} aria-label={t('actions.resetPassword')} onClick={() => setPasswordTarget(staff)}><KeyRound className="h-4 w-4" /></Button>
            {staff.isActive ? (
              <Button size="icon" variant="outline" className="text-danger" title={t('actions.deactivate')} aria-label={t('actions.deactivate')} onClick={() => setDeactivateTarget(staff)}><UserX className="h-4 w-4" /></Button>
            ) : (
              <Button size="icon" variant="outline" className="text-success" title={t('actions.activate')} aria-label={t('actions.activate')} disabled={mutations.activate.isPending} onClick={() => activate(staff)}><UserCheck className="h-4 w-4" /></Button>
            )}
          </div>
        </TableCell>
      ),
    },
  ];

  const data = query.data;
  return (
    <div className="animate-fade-in space-y-6 p-2 md:p-6">
      <PageTitleBanner title={t('pageTitle')} subtitle={t('pageDescription')} icon={<Users className="h-5 w-5" />} />
      <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/80 p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row">
          <div className="relative max-w-lg flex-1">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={t('searchPlaceholder')} className="ps-9" />
          </div>
          <Select value={status} onValueChange={(value) => { setStatus(value as typeof status); setPage(1); }}>
            <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder={t('filters.all')} /></SelectTrigger>
            <SelectContent><SelectItem value="all">{t('filters.all')}</SelectItem><SelectItem value="active">{t('active')}</SelectItem><SelectItem value="inactive">{t('inactive')}</SelectItem></SelectContent>
          </Select>
        </div>
        <Button onClick={() => { setEditing(null); setFormOpen(true); }} className="gap-2"><Plus className="h-4 w-4" />{t('addStaff')}</Button>
      </div>

      <DataTableShell columns={columns} data={data?.items ?? []} keyExtractor={(staff) => staff._id} isLoading={query.isLoading} isError={query.isError} error={query.error} loadingMessage={t('loading')} emptyMessage={t('empty')} errorMessage={t('loadFailed')} retryLabel={t('retry')} onRetry={() => query.refetch()} />

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between rounded-xl border border-border/70 bg-card/70 px-4 py-3 text-sm">
          <span>{t('pagination', { page: data.page, totalPages: data.totalPages, total: data.total })}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1 || query.isFetching} onClick={() => setPage((value) => value - 1)}>{t('previous')}</Button>
            <Button variant="outline" size="sm" disabled={page >= data.totalPages || query.isFetching} onClick={() => setPage((value) => value + 1)}>{t('next')}</Button>
          </div>
        </div>
      )}

      <StaffFormDialog open={formOpen} staff={editing} pending={mutations.create.isPending || mutations.update.isPending} onOpenChange={(open) => { setFormOpen(open); if (!open) setEditing(null); }} onSubmit={submitForm} />
      {permissionsTarget && <StaffPermissionsDialog staff={permissionsTarget} pending={mutations.permissions.isPending} onClose={() => setPermissionsTarget(null)} onSave={savePermissions} />}
      {passwordTarget && <ResetStaffPasswordDialog staff={passwordTarget} pending={mutations.resetPassword.isPending} onClose={() => setPasswordTarget(null)} onSubmit={resetPassword} />}
      {deactivateTarget && <DeactivateStaffDialog staff={deactivateTarget} pending={mutations.deactivate.isPending} onClose={() => setDeactivateTarget(null)} onConfirm={deactivate} />}
    </div>
  );
}
