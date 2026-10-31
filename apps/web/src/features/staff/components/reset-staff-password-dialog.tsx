'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Loader2, Sparkles, Copy, Check } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { formatStaffDisplayName } from '@student-portal/shared';
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

function generateStrongPassword(length = 14): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%^&*';

  const pwd = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    symbols[Math.floor(Math.random() * symbols.length)],
  ];

  const allChars = upper + lower + digits + symbols;
  for (let i = pwd.length; i < length; i++) {
    pwd.push(allChars[Math.floor(Math.random() * allChars.length)]);
  }

  return pwd.sort(() => Math.random() - 0.5).join('');
}

export function ResetStaffPasswordDialog({ staff, pending, onClose, onSubmit }: Props) {
  const t = useTranslations('staff');
  const [copied, setCopied] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);

  const form = useForm<ResetStaffPasswordValues>({
    resolver: zodResolver(resetStaffPasswordSchema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  });

  const handleAutoGenerate = () => {
    const pwd = generateStrongPassword(14);
    form.setValue('newPassword', pwd, { shouldValidate: true });
    form.setValue('confirmPassword', pwd, { shouldValidate: true });
    setGeneratedPassword(pwd);

    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(pwd).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
        toast.success(t('resetPassword.copied'));
      }).catch(() => {
        // Fallback if clipboard permission denied
      });
    }
  };

  const handleCopy = () => {
    if (!generatedPassword) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(generatedPassword).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
        toast.success(t('resetPassword.copied'));
      });
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md border-border bg-card">
        <DialogHeader>
          <DialogTitle>{t('resetPassword.title', { name: formatStaffDisplayName(staff, useLocale()) })}</DialogTitle>
          <DialogDescription>{t('resetPassword.description')}</DialogDescription>
        </DialogHeader>

        {/* Auto-Generate Action Card */}
        <div className="flex items-center justify-between rounded-xl border border-primary/25 bg-primary/5 p-2.5 text-xs">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="font-medium text-foreground">
              {t('resetPassword.autoGenerate')}
            </span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAutoGenerate}
            className="h-7 text-xs font-semibold text-primary border-primary/40 hover:bg-primary/10 gap-1.5 rounded-squircle cursor-pointer"
          >
            <Sparkles className="h-3 w-3" />
            <span>{t('resetPassword.autoGenerate')}</span>
          </Button>
        </div>

        {/* Generated Password Quick-Copy Banner */}
        {generatedPassword && (
          <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs">
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="text-[11px] text-muted-foreground shrink-0">
                {t('resetPassword.newPassword')}:
              </span>
              <code className="font-mono font-bold text-emerald-400 select-all truncate text-xs" dir="ltr">
                {generatedPassword}
              </code>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              className="h-6 px-2 text-[11px] text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/20 gap-1 rounded-squircle"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              <span>{copied ? 'تم النسخ' : 'نسخ'}</span>
            </Button>
          </div>
        )}

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
