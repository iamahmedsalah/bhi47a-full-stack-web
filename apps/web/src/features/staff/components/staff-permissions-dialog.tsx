'use client';

import { useState } from 'react';
import { CheckSquare, Loader2, Square } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { STAFF_ASSIGNABLE_PERMISSIONS, STAFF_TYPE_VALUES, STAFF_TYPE_DEFAULT_PERMISSIONS, type Permission } from '@student-portal/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { STAFF_PERMISSION_GROUPS } from '../permission-groups';
import type { StaffMember } from '../types';

interface Props {
  staff: StaffMember;
  pending: boolean;
  onClose: () => void;
  onSave: (permissions: Permission[]) => Promise<void>;
}

export function StaffPermissionsDialog({ staff, pending, onClose, onSave }: Props) {
  const t = useTranslations('staff');
  const [selected, setSelected] = useState<Permission[]>(staff.permissions ?? []);
  const toggle = (permission: Permission) => {
    setSelected((current) => current.includes(permission)
      ? current.filter((item) => item !== permission)
      : [...current, permission]);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[88vh] max-w-3xl flex-col overflow-hidden border-border bg-card">
        <DialogHeader>
          <DialogTitle>{t('permissions.title', { name: staff.name })}</DialogTitle>
          <DialogDescription>{t('permissions.description')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-3">
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{t('permissions.presets')}:</span>
            {STAFF_TYPE_VALUES.map((type) => (
              <Button
                key={type}
                type="button"
                size="sm"
                variant="secondary"
                className="h-7 text-xs"
                onClick={() => setSelected([...STAFF_TYPE_DEFAULT_PERMISSIONS[type]])}
              >
                {t(`types.${type}`)}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setSelected([...STAFF_ASSIGNABLE_PERMISSIONS])}>{t('permissions.selectAll')}</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setSelected([])}>{t('permissions.clearAll')}</Button>
          </div>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto py-2">
          {STAFF_PERMISSION_GROUPS.map((group) => (
            <section key={group.key} className="rounded-xl border border-border/70 bg-surface/30 p-4">
              <h3 className="mb-3 text-sm font-bold">{t(`permissions.groups.${group.key}`)}</h3>
              <div className="grid gap-2 md:grid-cols-2">
                {group.permissions.map((permission) => {
                  const checked = selected.includes(permission);
                  return (
                    <button
                      key={permission}
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      onClick={() => toggle(permission)}
                      className={`flex items-start gap-3 rounded-xl border p-3 text-start transition-colors ${checked ? 'border-primary/50 bg-primary/10' : 'border-border/60 bg-card/40 hover:bg-surface/60'}`}
                    >
                      {checked ? <CheckSquare className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> : <Square className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
                      <span><span className="block text-xs font-semibold">{t(`permissions.labels.${permission.replaceAll('.', '_')}`)}</span><span className="mt-1 block font-mono text-[10px] text-muted-foreground">{permission}</span></span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>{t('cancel')}</Button>
          <Button type="button" disabled={pending} onClick={() => onSave(selected)} className="gap-2">
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}{t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
