'use client';

import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale } from 'next-intl';
import { toast } from 'sonner';
import { ShieldAlert, Unlock, Search, RotateCcw, Loader2, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/cn';
import { getApiErrorMessage } from '@/lib/api';
import {
  getLockedAccounts,
  unlockAccount,
  unlockAllAccounts,
  type LockedAccountItem,
} from '@/features/metrics/api';

interface LockedAccountsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LockedAccountsModal({
  open,
  onOpenChange,
}: LockedAccountsModalProps) {
  const locale = useLocale();
  const isAr = locale === 'ar';
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'student' | 'staff' | 'admin'>('all');
  const [unlockingId, setUnlockingId] = useState<string | null>(null);
  const [isBulkUnlocking, setIsBulkUnlocking] = useState(false);
  const [confirmBulkOpen, setConfirmBulkOpen] = useState(false);

  const {
    data: lockedAccounts = [],
    isLoading,
    isFetching,
    dataUpdatedAt,
    refetch,
  } = useQuery<LockedAccountItem[]>({
    queryKey: ['admin-locked-accounts'],
    queryFn: getLockedAccounts,
    enabled: open,
    refetchInterval: open ? 15000 : false,
  });

  const filteredAccounts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return lockedAccounts.filter((acc) => {
      if (roleFilter !== 'all' && acc.role !== roleFilter) return false;
      if (!q) return true;
      const haystack = [
        acc.name,
        acc.nameAr,
        acc.email,
        acc.studentCode,
        acc.staffCode,
        acc.userCode,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [lockedAccounts, search, roleFilter]);

  const studentCount = useMemo(
    () => lockedAccounts.filter((a) => a.role === 'student').length,
    [lockedAccounts],
  );
  const staffCount = useMemo(
    () => lockedAccounts.filter((a) => a.role === 'staff').length,
    [lockedAccounts],
  );
  const adminCount = useMemo(
    () => lockedAccounts.filter((a) => a.role === 'admin').length,
    [lockedAccounts],
  );

  const handleUnlockSingle = async (acc: LockedAccountItem) => {
    try {
      setUnlockingId(acc._id);
      const res = await unlockAccount(acc._id);
      toast.success(
        res.message ||
          (isAr
            ? `تم فك حظر حساب ${acc.nameAr || acc.name} فورياً بنجاح`
            : `Unlocked account for ${acc.name} instantly`),
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-locked-accounts'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-metrics-summary'] }),
      ]);
    } catch (err) {
      toast.error(getApiErrorMessage(err, isAr ? 'فشل فك حظر الحساب' : 'Failed to unlock account'));
    } finally {
      setUnlockingId(null);
    }
  };

  const handleUnlockAll = async () => {
    try {
      setIsBulkUnlocking(true);
      const res = await unlockAllAccounts();
      toast.success(
        res.message ||
          (isAr
            ? `تم فك حظر جميع الحسابات بنجاح (${res.unlockedCount} حساب)`
            : `Successfully unlocked all ${res.unlockedCount} accounts`),
      );
      setConfirmBulkOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-locked-accounts'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-metrics-summary'] }),
      ]);
    } catch (err) {
      toast.error(getApiErrorMessage(err, isAr ? 'فشل فك حظر الحسابات' : 'Failed to unlock accounts'));
    } finally {
      setIsBulkUnlocking(false);
    }
  };

  const formatRemainingMinutes = (lockUntilStr?: string) => {
    if (!lockUntilStr) return isAr ? 'مؤقت' : 'Temporary';
    const lockTime = new Date(lockUntilStr).getTime();
    const diff = lockTime - dataUpdatedAt;
    if (diff <= 0) return isAr ? 'منتهي' : 'Expired';
    const mins = Math.ceil(diff / 60000);
    return isAr ? `متبقي ${mins} دقيقة` : `${mins} min left`;
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="w-[95vw] max-w-3xl max-h-[85vh] p-0 border-border bg-card shadow-2xl overflow-hidden flex flex-col rounded-2xl"
          dir={isAr ? 'rtl' : 'ltr'}
        >
          {/* Header */}
          <DialogHeader className="p-5 pb-4 border-b border-border/70 bg-secondary/20">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-squircle bg-rose-500/15 text-rose-400 border border-rose-500/30">
                    <ShieldAlert className="h-5 w-5" />
                  </div>
                  <div>
                    <DialogTitle className="text-base sm:text-lg font-bold flex items-center gap-2">
                      <span>
                        {isAr
                          ? 'الحسابات المقفلة وفك الحظر اللحظي'
                          : 'Locked Accounts & Instant Unlock'}
                      </span>
                      <Badge
                        variant={(lockedAccounts.length > 0 ? 'destructive' : 'secondary')}
                        className="rounded-squircle text-xs px-2 py-0.5"
                      >
                        {lockedAccounts.length}
                      </Badge>
                    </DialogTitle>
                    <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                      {isAr
                        ? 'الحسابات المقيدة مؤقتاً نتيجة تكرار المحاولات الخاطئة (Brute-Force). يمكنك فك القفل فورياً بنقرة واحدة.'
                        : 'Accounts locked due to brute-force security limits. Unlock immediately with a single click.'}
                    </DialogDescription>
                  </div>
                </div>
              </div>

              {/* Top Refresh */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isFetching}
                className="rounded-squircle h-8 px-2.5 text-xs shrink-0 self-center"
              >
                <RotateCcw className={cn('h-3.5 w-3.5 me-1.5', isFetching && 'animate-spin')} />
                {isAr ? 'تحديث' : 'Refresh'}
              </Button>
            </div>

            {/* Filter and Bulk Action Bar */}
            <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
              <div className="relative flex-1">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={
                    isAr
                      ? 'بحث بالاسم، كود الطالب، البريد الإلكتروني...'
                      : 'Search by name, student code, email...'
                  }
                  className="rounded-squircle ps-8 h-8 text-xs bg-background/60"
                />
              </div>

              {/* Role Filter Tabs */}
              <div className="flex items-center gap-1 bg-background/60 p-0.5 rounded-squircle border border-border/70 text-xs">
                {(['all', 'student', 'staff', 'admin'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRoleFilter(r)}
                    className={cn(
                      'px-2.5 py-1 rounded-squircle text-[11px] font-medium transition-colors',
                      roleFilter === r
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {r === 'all' && (isAr ? `الكل (${lockedAccounts.length})` : `All (${lockedAccounts.length})`)}
                    {r === 'student' && (isAr ? `الطلاب (${studentCount})` : `Students (${studentCount})`)}
                    {r === 'staff' && (isAr ? `هيئة التدريس (${staffCount})` : `Staff (${staffCount})`)}
                    {r === 'admin' && (isAr ? `المسؤولين (${adminCount})` : `Admins (${adminCount})`)}
                  </button>
                ))}
              </div>

              {/* Bulk Unlock All Button */}
              {lockedAccounts.length > 0 && (
                <Button
                  size="sm"
                  onClick={() => setConfirmBulkOpen(true)}
                  disabled={isBulkUnlocking}
                  className="rounded-squircle h-8 text-xs bg-teal-600 hover:bg-teal-500 text-white shadow-sm shrink-0 font-medium"
                >
                  <Unlock className="h-3.5 w-3.5 me-1.5" />
                  {isAr ? 'فك حظر الجميع لحظياً' : 'Unlock All Instant'}
                </Button>
              )}
            </div>
          </DialogHeader>

          {/* List Content */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
            {isLoading ? (
              <div className="py-16 text-center space-y-3">
                <Loader2 className="h-7 w-7 animate-spin text-primary mx-auto" />
                <p className="text-xs text-muted-foreground">
                  {isAr ? 'جاري فحص الحسابات المقفلة...' : 'Checking locked accounts...'}
                </p>
              </div>
            ) : filteredAccounts.length === 0 ? (
              <div className="py-14 text-center space-y-3 border border-dashed border-border/70 rounded-2xl bg-secondary/10">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 mx-auto">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold">
                    {search || (roleFilter !== 'all' && lockedAccounts.length > 0)
                      ? isAr
                        ? 'لا توجد نتائج مطابقة لبحثك'
                        : 'No accounts match your search filter'
                      : isAr
                        ? 'لا توجد أي حسابات مقفلة حالياً'
                        : 'No accounts are currently locked'}
                  </h4>
                  <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                    {search || roleFilter !== 'all'
                      ? isAr
                        ? 'جرّب تعديل كلمات البحث أو اختيار فلتر آخر'
                        : 'Try adjusting your search terms or filters'
                      : isAr
                        ? 'جميع محاولات تسجيل الدخول طبيعية ولا توجد أي حسابات تحت طائلة الحظر المؤقت.'
                        : 'All authentication attempts are nominal. No accounts are blocked.'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                {filteredAccounts.map((acc) => {
                  const isBusy = unlockingId === acc._id;
                  const displayName = isAr ? acc.nameAr || acc.name : acc.name;
                  const roleLabel =
                    acc.role === 'student'
                      ? isAr
                        ? 'طالب'
                        : 'Student'
                      : acc.role === 'staff'
                        ? isAr
                          ? 'هيئة تدريس'
                          : 'Staff'
                        : isAr
                          ? 'مسؤول نظام'
                          : 'Admin';

                  const identifier =
                    acc.studentCode ||
                    acc.staffCode ||
                    acc.userCode ||
                    acc.email ||
                    '';

                  return (
                    <div
                      key={acc._id}
                      className="group flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-border/70 bg-card hover:border-primary/40 hover:bg-secondary/25 transition-all shadow-sm"
                    >
                      {/* User Info */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary border border-primary/20 font-bold text-sm">
                          {acc.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={acc.avatarUrl}
                              alt={displayName}
                              className="h-full w-full rounded-full object-cover"
                            />
                          ) : (
                            displayName.charAt(0).toUpperCase()
                          )}
                          <span className="absolute -bottom-0.5 -end-0.5 h-3.5 w-3.5 rounded-full bg-rose-500 border-2 border-card flex items-center justify-center" />
                        </div>

                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm truncate text-foreground">
                              {displayName}
                            </span>
                            <Badge
                              variant="outline"
                              className={cn(
                                'rounded-squircle text-[10px] py-0 px-1.5 h-4.5',
                                acc.role === 'student' && 'border-cyan-500/40 text-cyan-400 bg-cyan-500/10',
                                acc.role === 'staff' && 'border-teal-500/40 text-teal-400 bg-teal-500/10',
                                acc.role === 'admin' && 'border-purple-500/40 text-purple-400 bg-purple-500/10',
                              )}
                            >
                              {roleLabel}
                            </Badge>
                          </div>

                          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                            {identifier && (
                              <span className="font-mono" dir="ltr">
                                <bdi>{identifier}</bdi>
                              </span>
                            )}
                            {acc.email && acc.email !== identifier && (
                              <>
                                <span>•</span>
                                <span className="font-mono truncate" dir="ltr">
                                  <bdi>{acc.email}</bdi>
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Lock Status & Instant Unlock Action */}
                      <div className="flex items-center justify-between sm:justify-end gap-2.5 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/50 shrink-0">
                        {/* Threat badges */}
                        <div className="flex items-center gap-1.5 text-xs">
                          <Badge
                            variant="destructive"
                            className="rounded-squircle text-[10px] py-0.5 px-2 font-mono h-6"
                          >
                            <AlertTriangle className="h-3 w-3 me-1 text-rose-200" />
                            {acc.failedLoginAttempts ?? acc.loginAttempts ?? 0}{' '}
                            {isAr ? 'محاولات فاشلة' : 'failed attempts'}
                          </Badge>

                          <Badge
                            variant="outline"
                            className="rounded-squircle text-[10px] py-0.5 px-2 text-amber-400 border-amber-500/30 bg-amber-500/10 h-6 flex items-center"
                          >
                            <Clock className="h-3 w-3 me-1 text-amber-400" />
                            {formatRemainingMinutes(acc.lockUntil || acc.lockedUntil)}
                          </Badge>
                        </div>

                        {/* Instant Unlock Button */}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleUnlockSingle(acc)}
                          disabled={isBusy}
                          className="rounded-squircle h-8 text-xs border-teal-500/40 hover:bg-teal-500/15 hover:text-teal-300 hover:border-teal-400 font-medium transition-all"
                        >
                          {isBusy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin me-1.5 text-teal-400" />
                          ) : (
                            <Unlock className="h-3.5 w-3.5 me-1.5 text-teal-400" />
                          )}
                          {isAr ? 'فك الحظر اللحظي' : 'Unlock Now'}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm Bulk Unlock Dialog */}
      <ConfirmDialog
        open={confirmBulkOpen}
        onOpenChange={setConfirmBulkOpen}
        title={isAr ? 'تأكيد فك الحظر عن جميع الحسابات' : 'Confirm Bulk Unlock'}
        description={
          isAr
            ? `هل أنت متأكد من فك حظر جميع الحسابات المقفلة حالياً (${lockedAccounts.length} حساب)؟ سيتم تصفير عداد المحاولات الفاشلة فورياً ويتمكن الجميع من الدخول دون انتظار انتهاء فترة الحظر.`
            : `Are you sure you want to instantly unlock all currently locked accounts (${lockedAccounts.length} accounts)? Their failed attempt counts will be reset immediately.`
        }
        confirmLabel={isAr ? 'فك الحظر اللحظي للجميع' : 'Unlock All Now'}
        cancelLabel={isAr ? 'إلغاء' : 'Cancel'}
        destructive={false}
        disabled={isBulkUnlocking}
        onConfirm={handleUnlockAll}
      />
    </>
  );
}
