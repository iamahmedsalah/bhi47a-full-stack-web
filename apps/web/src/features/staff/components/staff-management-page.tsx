'use client';

import { useDeferredValue, useState } from 'react';
import {
  Edit2,
  ExternalLink,
  Eye,
  KeyRound,
  LayoutGrid,
  List,
  Mail,
  MoreVertical,
  Phone,
  Plus,
  Search,
  Shield,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { toast } from 'sonner';
import {
  STAFF_ASSIGNABLE_PERMISSIONS,
  STAFF_TYPE_VALUES,
  formatStaffDisplayName,
  getCleanStaffName,
  type Permission,
  type StaffType,
} from '@student-portal/shared';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTableShell, type ColumnDef } from '@/components/ui/data-table-shell';
import { Input } from '@/components/ui/input';
import { PageTitleBanner } from '@/components/ui/page-title-banner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TableCell } from '@/components/ui/table';
import { getApiErrorMessage } from '@/lib/api';
import { useAuth } from '@/providers/auth-provider';
import { useStaffList, useStaffMutations } from '../queries';
import type { StaffFormValues } from '../schema';
import type { StaffMember } from '../types';
import { DeactivateStaffDialog } from './deactivate-staff-dialog';
import { ResetStaffPasswordDialog } from './reset-staff-password-dialog';
import { StaffDetailsDialog } from './staff-details-dialog';
import { StaffFormDialog } from './staff-form-dialog';
import { StaffPermissionsDialog } from './staff-permissions-dialog';

export function StaffManagementPage() {
  const t = useTranslations('staff');
  const locale = useLocale();
  const isAr = locale === 'ar';
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [roleFilter, setRoleFilter] = useState<'all' | 'staff' | 'admin'>('all');
  const [staffType, setStaffType] = useState<'all' | StaffType>('all');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('grid');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [detailsTarget, setDetailsTarget] = useState<StaffMember | null>(null);
  const [permissionsTarget, setPermissionsTarget] = useState<StaffMember | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<StaffMember | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<StaffMember | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StaffMember | null>(null);

  const query = useStaffList({
    page,
    limit: 20,
    search: deferredSearch || undefined,
    status,
    role: isAdmin ? roleFilter : 'staff',
    staffType: roleFilter === 'admin' ? undefined : staffType,
  });
  const mutations = useStaffMutations();

  const fail = (error: unknown) => toast.error(getApiErrorMessage(error, t('toasts.failed')));

  const submitForm = async (values: StaffFormValues) => {
    const profile = {
      name: values.name,
      nameAr: values.nameAr ?? '',
      email: values.email,
      username: values.username,
      phone: values.phone,
      staffType: values.role === 'admin' ? undefined : (values.staffType as StaffType),
    };
    if (editing) {
      await mutations.update.mutateAsync({ id: editing._id, input: profile });
      toast.success(t('toasts.updated'), { id: 'staff-profile-save' });
    } else {
      await mutations.create.mutateAsync({
        ...profile,
        role: values.role,
        nameAr: values.nameAr || undefined,
        username: values.username || undefined,
        phone: values.phone || undefined,
        password: values.password,
        permissions: [],
      });
      toast.success(t('toasts.created'), { id: 'staff-profile-save' });
    }
    setFormOpen(false);
    setEditing(null);
  };

  const savePermissions = async (permissions: Permission[]) => {
    if (!permissionsTarget) return;
    try {
      await mutations.permissions.mutateAsync({ id: permissionsTarget._id, permissions });
      toast.success(t('toasts.permissionsUpdated'));
      setPermissionsTarget(null);
    } catch (error) {
      fail(error);
    }
  };

  const resetPassword = async (newPassword: string) => {
    if (!passwordTarget) return;
    try {
      await mutations.resetPassword.mutateAsync({ id: passwordTarget._id, newPassword });
      toast.success(t('toasts.passwordReset'));
      setPasswordTarget(null);
    } catch (error) {
      fail(error);
    }
  };

  const deactivate = async (reason?: string) => {
    if (!deactivateTarget) return;
    try {
      await mutations.deactivate.mutateAsync({ id: deactivateTarget._id, reason });
      toast.success(t('toasts.deactivated'));
      setDeactivateTarget(null);
    } catch (error) {
      fail(error);
    }
  };

  const activate = async (staff: StaffMember) => {
    try {
      await mutations.activate.mutateAsync(staff._id);
      toast.success(t('toasts.activated'));
    } catch (error) {
      fail(error);
    }
  };

  const deleteStaff = async () => {
    if (!deleteTarget) return;
    try {
      await mutations.delete.mutateAsync(deleteTarget._id);
      toast.success(t('toasts.deleted'));
      setDeleteTarget(null);
    } catch (error) {
      fail(error);
    }
  };

  const getInitials = (name?: string) => {
    if (!name) return 'ST';
    return name
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  const getRoleBadgeClasses = (type?: string, role?: string) => {
    if (role === 'admin') {
      return 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400';
    }
    switch (type) {
      case 'doctor':
        return 'border-teal-500/30 bg-teal-500/10 text-teal-600 dark:text-teal-400';
      case 'teaching_assistant':
        return 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400';
      case 'assistant_lecturer':
        return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400';
      case 'accountant':
        return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
      default:
        return 'border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400';
    }
  };

  const renderStaffActionsMenu = (staff: StaffMember) => {
    const isTargetAdmin = staff.role === 'admin';
    const isTargetAdministrative = staff.staffType === 'administrative';
    const canModifyTarget =
      isAdmin || (!isTargetAdmin && !isTargetAdministrative);

    return (
      <DropdownMenu.Root dir={isAr ? 'rtl' : 'ltr'}>
        <DropdownMenu.Trigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 rounded-squircle text-muted-foreground hover:bg-secondary/60 hover:text-foreground cursor-pointer"
            aria-label={t('table.actions')}
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            className="z-50 min-w-48 overflow-hidden rounded-xl border border-border/80 bg-popover/95 p-1 text-popover-foreground shadow-xl backdrop-blur-md animate-in fade-in-0 zoom-in-95 text-start"
          >
            <DropdownMenu.Item
              onClick={() => setDetailsTarget(staff)}
              className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium cursor-pointer outline-none hover:bg-primary/10 hover:text-primary transition-colors"
            >
              <Eye className="h-3.5 w-3.5 text-primary" />
              <span>{t('actions.viewDetails')}</span>
            </DropdownMenu.Item>

            {canModifyTarget && (
              <DropdownMenu.Item
                onClick={() => {
                  setEditing(staff);
                  setFormOpen(true);
                }}
                className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium cursor-pointer outline-none hover:bg-secondary/60 transition-colors"
              >
                <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{t('actions.edit')}</span>
              </DropdownMenu.Item>
            )}

            {isAdmin && (
              <DropdownMenu.Item
                onClick={() => setPermissionsTarget(staff)}
                className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium cursor-pointer outline-none hover:bg-secondary/60 transition-colors"
              >
                <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{t('actions.permissions')}</span>
              </DropdownMenu.Item>
            )}

            {canModifyTarget && (
              <DropdownMenu.Item
                onClick={() => setPasswordTarget(staff)}
                className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium cursor-pointer outline-none hover:bg-secondary/60 transition-colors"
              >
                <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{t('actions.resetPassword')}</span>
              </DropdownMenu.Item>
            )}

            {canModifyTarget && (
              <>
                <DropdownMenu.Separator className="my-1 h-px bg-border/60" />

                {staff.isActive ? (
                  <DropdownMenu.Item
                    onClick={() => setDeactivateTarget(staff)}
                    className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium cursor-pointer outline-none text-danger hover:bg-danger/10 transition-colors"
                  >
                    <UserX className="h-3.5 w-3.5 text-danger" />
                    <span>{t('actions.deactivate')}</span>
                  </DropdownMenu.Item>
                ) : (
                  <DropdownMenu.Item
                    onClick={() => activate(staff)}
                    disabled={mutations.activate.isPending}
                    className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium cursor-pointer outline-none text-success hover:bg-success/10 transition-colors"
                  >
                    <UserCheck className="h-3.5 w-3.5 text-success" />
                    <span>{t('actions.activate')}</span>
                  </DropdownMenu.Item>
                )}
              </>
            )}

            {isAdmin && (
              <>
                <DropdownMenu.Separator className="my-1 h-px bg-border/60" />

                <DropdownMenu.Item
                  onClick={() => setDeleteTarget(staff)}
                  className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium cursor-pointer outline-none text-danger hover:bg-danger/10 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5 text-danger" />
                  <span>{t('actions.delete')}</span>
                </DropdownMenu.Item>
              </>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    );
  };

  const columns: ColumnDef<StaffMember>[] = [
    {
      key: 'staff',
      header: t('table.staff'),
      render: (staff) => (
        <TableCell className="px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setDetailsTarget(staff)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-teal-500/20 to-teal-700/30 text-teal-600 dark:text-teal-400 font-bold border border-teal-500/30 text-xs shadow-sm hover:scale-105 transition-transform cursor-pointer"
              title={t('actions.viewDetails')}
            >
              {getInitials(getCleanStaffName(staff, locale))}
            </button>
            <div className="space-y-1 text-start">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDetailsTarget(staff)}
                  className="font-bold text-foreground hover:text-primary transition-colors text-sm flex items-center gap-1 group cursor-pointer"
                >
                  <span>{formatStaffDisplayName(staff, locale)}</span>
                  <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-primary" />
                </button>
                <span
                  className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${getRoleBadgeClasses(
                    staff.staffType,
                    staff.role,
                  )}`}
                >
                  {staff.role === 'admin'
                    ? isAr
                      ? 'مدير نظام'
                      : 'Administrator'
                    : t(`types.${staff.staffType ?? 'administrative'}`)}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-primary">
                  <bdi>@{staff.username || '—'}</bdi>
                </span>
                {staff.email && (
                  <span className="flex items-center gap-1 text-[11px] truncate max-w-55">
                    <Mail className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span dir="ltr" className="truncate">
                      {staff.email}
                    </span>
                  </span>
                )}
                {staff.phone && (
                  <span className="flex items-center gap-1 text-[11px]">
                    <Phone className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span dir="ltr">{staff.phone}</span>
                  </span>
                )}
              </div>
            </div>
          </div>
        </TableCell>
      ),
    },
    {
      key: 'status',
      header: t('table.status'),
      render: (staff) => (
        <TableCell className="px-4 py-3">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
              staff.isActive
                ? 'border-success/30 bg-success/10 text-success'
                : 'border-danger/30 bg-danger/10 text-danger'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                staff.isActive ? 'bg-success animate-pulse' : 'bg-danger'
              }`}
            />
            {staff.isActive ? t('active') : t('inactive')}
          </span>
        </TableCell>
      ),
    },
    {
      key: 'permissions',
      header: t('table.permissions'),
      render: (staff) => (
        <TableCell className="px-4 py-3 font-mono text-xs">
          {staff.role === 'admin' ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>{isAr ? 'صلاحيات كاملة' : 'Full Access'}</span>
            </span>
          ) : (
            <span className="rounded-md border border-border/70 bg-secondary/30 px-2 py-1">
              {staff.permissions.length} / {STAFF_ASSIGNABLE_PERMISSIONS.length}
            </span>
          )}
        </TableCell>
      ),
    },
    {
      key: 'lastLogin',
      header: t('table.lastLogin'),
      render: (staff) => (
        <TableCell className="px-4 py-3 text-xs text-muted-foreground">
          {staff.lastLoginAt
            ? new Intl.DateTimeFormat(isAr ? 'ar-EG' : 'en-US', {
                timeZone: 'Africa/Cairo',
                dateStyle: 'medium',
                timeStyle: 'short',
              }).format(new Date(staff.lastLoginAt))
            : t('never')}
        </TableCell>
      ),
    },
    {
      key: 'actions',
      header: t('table.actions'),
      className: 'w-16 text-center',
      render: (staff) => (
        <TableCell className="px-4 py-3 text-center">
          {renderStaffActionsMenu(staff)}
        </TableCell>
      ),
    },
  ];

  const data = query.data;
  const staffItems = data?.items ?? [];

  return (
    <div className="animate-fade-in space-y-6 p-2 md:p-6">
      <PageTitleBanner
        title={t('pageTitle')}
        subtitle={t('pageDescription')}
        icon={<Users className="h-5 w-5" />}
      />

      {/* Filter and View Mode Toolbar (Responsive 2-Tier Layout) */}
      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-card/60 p-3.5 md:p-4 shadow-sm backdrop-blur-md">
        {/* Top Tier: Search Bar + Action Controls */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute inset-s-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder={t('searchPlaceholder')}
              className="rounded-squircle ps-10 h-10 border-white/10 bg-background/60 text-sm focus-visible:ring-primary w-full"
            />
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
            {/* View Mode Toggle: Table / Grid */}
            <div className="inline-flex rounded-squircle border border-white/10 bg-background/50 p-1 shrink-0">
              <Button
                type="button"
                variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('grid')}
                className="h-8 px-2.5 rounded-squircle gap-1.5 text-xs cursor-pointer"
                title={t('viewModes.grid')}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t('viewModes.grid')}</span>
              </Button>
              <Button
                type="button"
                variant={viewMode === 'table' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('table')}
                className="h-8 px-2.5 rounded-squircle gap-1.5 text-xs cursor-pointer"
                title={t('viewModes.table')}
              >
                <List className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t('viewModes.table')}</span>
              </Button>
            </div>

            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
              className="h-10 rounded-squircle px-4 text-xs font-bold gap-1.5 bg-primary text-white hover:bg-primary-hover shadow-sm shrink-0 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>{isAr ? (roleFilter === 'admin' ? 'إضافة حساب مدير' : 'إضافة موظف') : (roleFilter === 'admin' ? 'Add Administrator' : 'Add Staff')}</span>
            </Button>
          </div>
        </div>

        {/* Lower Tier: Filter Selects */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/50">
          {isAdmin && (
            <div className="w-full sm:w-48">
              <Select
                value={roleFilter}
                onValueChange={(value) => {
                  setRoleFilter(value as typeof roleFilter);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-9 w-full rounded-squircle border-white/10 bg-background/60 text-xs">
                  <SelectValue placeholder={isAr ? 'نوع الحساب' : 'Account Role'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{isAr ? 'كل الحسابات' : 'All Accounts'}</SelectItem>
                  <SelectItem value="staff">{isAr ? 'الكادر الأكاديمي والإداري' : 'Academic & Admin Staff'}</SelectItem>
                  <SelectItem value="admin">{isAr ? 'مديرو النظام (Admins)' : 'Administrators (Admins)'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="w-full sm:w-36">
            <Select
              value={status}
              onValueChange={(value) => {
                setStatus(value as typeof status);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-9 w-full rounded-squircle border-white/10 bg-background/60 text-xs">
                <SelectValue placeholder={t('filters.all')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('filters.all')}</SelectItem>
                <SelectItem value="active">{t('active')}</SelectItem>
                <SelectItem value="inactive">{t('inactive')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="w-full sm:w-48">
            <Select
              value={staffType}
              onValueChange={(value) => {
                setStaffType(value as typeof staffType);
                setPage(1);
              }}
              disabled={roleFilter === 'admin'}
            >
              <SelectTrigger className="h-9 w-full rounded-squircle border-white/10 bg-background/60 text-xs">
                <SelectValue placeholder={t('filters.allTypes')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('filters.allTypes')}</SelectItem>
                {STAFF_TYPE_VALUES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {t(`types.${type}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Main Content: Grid View OR Table View */}
      {viewMode === 'grid' ? (
        query.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="h-56 animate-pulse rounded-2xl border border-white/10 bg-card/40 p-5"
              />
            ))}
          </div>
        ) : query.isError ? (
          <div className="rounded-2xl border border-danger/30 bg-card/60 p-8 text-center backdrop-blur-md">
            <p className="text-sm font-semibold text-danger">{t('loadFailed')}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => query.refetch()}
              className="mt-3 rounded-squircle"
            >
              {t('retry')}
            </Button>
          </div>
        ) : staffItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/80 bg-card/40 p-12 text-center backdrop-blur-md">
            <Users className="mx-auto h-12 w-12 text-muted-foreground/50 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">{t('empty')}</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {staffItems.map((staff) => (
              <div
                key={staff._id}
                className="group relative flex flex-col justify-between rounded-2xl border border-white/10 bg-card/60 p-5 shadow-sm backdrop-blur-md hover:border-primary/40 hover:shadow-lg transition-all text-start"
              >
                <div>
                  {/* Top Bar with Avatar, Name, Role & 3-dots */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <button
                        type="button"
                        onClick={() => setDetailsTarget(staff)}
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-teal-500/20 to-teal-700/30 text-teal-600 dark:text-teal-400 font-bold border border-teal-500/30 text-sm shadow-inner group-hover:scale-105 transition-transform cursor-pointer"
                        title={t('actions.viewDetails')}
                      >
                        {getInitials(getCleanStaffName(staff, locale))}
                      </button>
                      <div className="min-w-0 space-y-1">
                        <button
                          type="button"
                          onClick={() => setDetailsTarget(staff)}
                          className="font-bold text-foreground hover:text-primary transition-colors text-base truncate block text-start cursor-pointer"
                          title={formatStaffDisplayName(staff, locale)}
                        >
                          {formatStaffDisplayName(staff, locale)}
                        </button>
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getRoleBadgeClasses(
                            staff.staffType,
                            staff.role,
                          )}`}
                        >
                          {staff.role === 'admin'
                            ? isAr
                              ? 'مدير نظام'
                              : 'Administrator'
                            : t(`types.${staff.staffType ?? 'administrative'}`)}
                        </span>
                      </div>
                    </div>

                    <div className="shrink-0">{renderStaffActionsMenu(staff)}</div>
                  </div>

                  {/* Identification Pills */}
                  <div className="mt-3 flex flex-wrap items-center gap-1.5 font-mono text-xs">
                    {staff.userCode && (
                      <span className="rounded bg-muted/70 px-2 py-0.5 text-[11px] text-foreground font-medium">
                        <bdi>{staff.userCode}</bdi>
                      </span>
                    )}
                    {staff.username && (
                      <span className="rounded bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                        <bdi>@{staff.username}</bdi>
                      </span>
                    )}
                  </div>

                  {/* Contact Info */}
                  <div className="mt-3 space-y-1.5 text-xs text-muted-foreground border-t border-border/50 pt-2.5">
                    {staff.email ? (
                      <div className="flex items-center gap-2 truncate">
                        <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span dir="ltr" className="truncate">
                          {staff.email}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-muted-foreground/60 italic">
                        <Mail className="h-3.5 w-3.5 shrink-0" />
                        <span>{t('details.notProvided')}</span>
                      </div>
                    )}
                    {staff.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span dir="ltr">{staff.phone}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Footer: Status, Permissions & View Action */}
                <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                        staff.isActive
                          ? 'border-success/30 bg-success/10 text-success'
                          : 'border-danger/30 bg-danger/10 text-danger'
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          staff.isActive ? 'bg-success animate-pulse' : 'bg-danger'
                        }`}
                      />
                      {staff.isActive ? t('active') : t('inactive')}
                    </span>
                    {staff.role === 'admin' ? (
                      <span
                        className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400"
                        title={isAr ? 'صلاحيات كاملة غير مقيدة لكافة أجزاء النظام' : 'Full unrestricted administrator access'}
                      >
                        <ShieldCheck className="h-3 w-3 text-amber-500" />
                        <span>{isAr ? 'صلاحيات كاملة' : 'Full Access'}</span>
                      </span>
                    ) : (
                      <span
                        className="rounded bg-secondary/50 px-2 py-0.5 text-[11px] font-mono text-muted-foreground flex items-center gap-1"
                        title={t('table.permissions')}
                      >
                        <Shield className="h-3 w-3 text-muted-foreground" />
                        <span>{staff.permissions.length}</span>
                      </span>
                    )}
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setDetailsTarget(staff)}
                    className="h-7 text-xs rounded-squircle gap-1 text-primary hover:bg-primary/10"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    <span>{t('actions.viewDetails')}</span>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <DataTableShell
          columns={columns}
          data={staffItems}
          keyExtractor={(staff) => staff._id}
          isLoading={query.isLoading}
          isError={query.isError}
          error={query.error}
          loadingMessage={t('loading')}
          emptyMessage={t('empty')}
          errorMessage={t('loadFailed')}
          retryLabel={t('retry')}
          onRetry={() => query.refetch()}
        />
      )}

      {/* Pagination Footer */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between rounded-xl border border-border/70 bg-card/70 px-4 py-3 text-sm">
          <span>
            {t('pagination', {
              page: data.page,
              totalPages: data.totalPages,
              total: data.total,
            })}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || query.isFetching}
              onClick={() => setPage((value) => value - 1)}
            >
              {t('previous')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= data.totalPages || query.isFetching}
              onClick={() => setPage((value) => value + 1)}
            >
              {t('next')}
            </Button>
          </div>
        </div>
      )}

      {/* Dialogs */}
      <StaffFormDialog
        open={formOpen}
        staff={editing}
        pending={mutations.create.isPending || mutations.update.isPending}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
        onSubmit={submitForm}
      />

      <StaffDetailsDialog
        staff={detailsTarget}
        open={Boolean(detailsTarget)}
        onOpenChange={(open) => {
          if (!open) setDetailsTarget(null);
        }}
        onEdit={(staff) => {
          setEditing(staff);
          setFormOpen(true);
        }}
        onPermissions={(staff) => {
          setPermissionsTarget(staff);
        }}
        onResetPassword={(staff) => {
          setPasswordTarget(staff);
        }}
      />

      {permissionsTarget && (
        <StaffPermissionsDialog
          staff={permissionsTarget}
          pending={mutations.permissions.isPending}
          onClose={() => setPermissionsTarget(null)}
          onSave={savePermissions}
        />
      )}

      {passwordTarget && (
        <ResetStaffPasswordDialog
          staff={passwordTarget}
          pending={mutations.resetPassword.isPending}
          onClose={() => setPasswordTarget(null)}
          onSubmit={resetPassword}
        />
      )}

      {deactivateTarget && (
        <DeactivateStaffDialog
          staff={deactivateTarget}
          pending={mutations.deactivate.isPending}
          onClose={() => setDeactivateTarget(null)}
          onConfirm={deactivate}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={deleteTarget ? t('delete.title', { name: deleteTarget.name }) : ''}
        description={
          deleteTarget ? (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">{t('delete.description')}</p>
              <div className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-xs text-danger font-medium space-y-1">
                <div className="font-bold">{deleteTarget.name}</div>
                <div className="font-mono text-[11px] text-danger/80">
                  {deleteTarget.userCode ? `${deleteTarget.userCode} · ` : ''}
                  {deleteTarget.email || deleteTarget.username}
                </div>
              </div>
            </div>
          ) : null
        }
        confirmLabel={t('delete.confirm')}
        cancelLabel={t('delete.cancel')}
        destructive
        disabled={mutations.delete.isPending}
        onConfirm={deleteStaff}
      />
    </div>
  );
}
