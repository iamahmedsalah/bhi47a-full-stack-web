'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { PasswordInput } from '@/components/ui/password-input';
import { resetStaffPasswordSchema, type ResetStaffPasswordValues } from '../schema';
import type { StaffMember } from '../types';

interface Props {
  staff: StaffMember;
  pending: boolean;
  onClose: () => void;
  onSubmit: (password: string) => Promise<void>;
}

export function ResetStaffPasswordDialog({ staff, pending, onClose, onSubmit }: Props) {
  const t = useTranslations('staff');
  const form = useForm<ResetStaffPasswordValues>({
    resolver: zodResolver(resetStaffPasswordSchema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md border-border bg-card">
        <DialogHeader>
          <DialogTitle>{t('resetPassword.title', { name: staff.name })}</DialogTitle>
          <DialogDescription>{t('resetPassword.description')}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((values) => onSubmit(values.newPassword))} className="space-y-4">
            <FormField control={form.control} name="newPassword" render={({ field }) => (
              <FormItem><FormLabel>{t('resetPassword.newPassword')}</FormLabel><FormControl><PasswordInput autoComplete="new-password" dir="ltr" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="confirmPassword" render={({ field, fieldState }) => (
              <FormItem><FormLabel>{t('resetPassword.confirmPassword')}</FormLabel><FormControl><PasswordInput autoComplete="new-password" dir="ltr" {...field} /></FormControl><FormMessage>{fieldState.error?.message === 'passwordMismatch' ? t('validation.passwordMismatch') : undefined}</FormMessage></FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={onClose}>{t('cancel')}</Button>
              <Button type="submit" disabled={pending} className="gap-2">{pending && <Loader2 className="h-4 w-4 animate-spin" />}{t('resetPassword.action')}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
