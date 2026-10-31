'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { formatStaffDisplayName } from '@student-portal/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { StaffMember } from '../types';

interface Props {
  staff: StaffMember;
  pending: boolean;
  onClose: () => void;
  onConfirm: (reason?: string) => Promise<void>;
}

export function DeactivateStaffDialog({ staff, pending, onClose, onConfirm }: Props) {
  const t = useTranslations('staff');
  const locale = useLocale();
  const [reason, setReason] = useState('');
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md border-border bg-card">
        <DialogHeader>
          <DialogTitle>{t('deactivate.title', { name: formatStaffDisplayName(staff, locale) })}</DialogTitle>
          <DialogDescription>{t('deactivate.description')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="deactivation-reason">{t('deactivate.reason')}</Label>
          <Textarea id="deactivation-reason" value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} />
        </div>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>{t('cancel')}</Button>
          <Button type="button" variant="destructive" disabled={pending} onClick={() => onConfirm(reason.trim() || undefined)} className="gap-2">
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}{t('deactivate.action')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
