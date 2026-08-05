'use client';

import { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { staffFormSchema, type StaffFormValues } from '../schema';
import type { StaffMember } from '../types';

interface Props {
  open: boolean;
  staff: StaffMember | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: StaffFormValues) => Promise<void>;
}

export function StaffFormDialog({ open, staff, pending, onOpenChange, onSubmit }: Props) {
  const t = useTranslations('staff');
  const form = useForm<StaffFormValues>({
    resolver: zodResolver(staffFormSchema),
    defaultValues: { name: '', email: '', username: '', phone: '', password: '', isCreate: true },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      name: staff?.name ?? '',
      email: staff?.email ?? '',
      username: staff?.username ?? '',
      phone: staff?.phone ?? '',
      password: '',
      isCreate: !staff,
    });
  }, [form, open, staff]);

  const errorText = (message?: string) =>
    message === 'passwordLength' ? t('validation.passwordLength') : message;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl border-border bg-card">
        <DialogHeader><DialogTitle>{staff ? t('editTitle') : t('createTitle')}</DialogTitle></DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem><FormLabel>{t('fields.name')}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem><FormLabel>{t('fields.email')}</FormLabel><FormControl><Input type="email" dir="ltr" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="username" render={({ field }) => (
                <FormItem><FormLabel>{t('fields.username')}</FormLabel><FormControl><Input dir="ltr" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem><FormLabel>{t('fields.phone')}</FormLabel><FormControl><Input dir="ltr" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
            {!staff && (
              <FormField control={form.control} name="password" render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>{t('fields.temporaryPassword')}</FormLabel>
                  <FormControl><PasswordInput dir="ltr" autoComplete="new-password" {...field} /></FormControl>
                  <FormMessage>{errorText(fieldState.error?.message)}</FormMessage>
                </FormItem>
              )} />
            )}
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>{t('cancel')}</Button>
              <Button type="submit" disabled={pending} className="gap-2">
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}{staff ? t('save') : t('create')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
