'use client';

import { useEffect, useMemo } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Loader2, Sparkles, User, Mail, Shield, Phone, KeyRound, AtSign } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { STAFF_TYPE_VALUES, type StaffType } from '@student-portal/shared';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { staffFormSchema, type StaffFormValues } from '../schema';
import type { StaffMember } from '../types';

interface Props {
  open: boolean;
  staff: StaffMember | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: StaffFormValues) => Promise<void>;
}

export function StaffFormDialog({
  open,
  staff,
  pending,
  onOpenChange,
  onSubmit,
}: Props) {
  const t = useTranslations('staff');
  const locale = useLocale();
  const isAr = locale === 'ar';
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const allowedStaffTypes = useMemo<StaffType[]>(
    () =>
      isAdmin
        ? (STAFF_TYPE_VALUES as unknown as StaffType[])
        : ['doctor', 'teaching_assistant'],
    [isAdmin],
  );

  const form = useForm<StaffFormValues>({
    resolver: zodResolver(staffFormSchema),
    defaultValues: {
      name: '',
      email: '',
      username: '',
      phone: '',
      password: '',
      role: 'staff',
      staffType: 'doctor',
      isCreate: true,
    },
  });

  const selectedRole = form.watch('role');

  useEffect(() => {
    if (!open) return;
    form.reset({
      name: staff?.name ?? '',
      email: staff?.email ?? '',
      username: staff?.username ?? '',
      phone: staff?.phone ?? '',
      password: '',
      role: staff?.role ?? 'staff',
      staffType: (staff?.staffType as StaffType) ?? allowedStaffTypes[0] ?? 'doctor',
      isCreate: !staff,
    });
  }, [form, open, staff, allowedStaffTypes]);

  const errorText = (message?: string) =>
    message === 'passwordLength' ? t('validation.passwordLength') : message;

  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$';
    let pwd = 'BHI@';
    for (let i = 0; i < 6; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    pwd += '2026';
    form.setValue('password', pwd, { shouldValidate: true });
    toast.info(t('toasts.passwordGenerated'));
  };

  const handleEmailBlur = (emailVal: string) => {
    const currentUsername = form.getValues('username');
    if (!currentUsername && emailVal.includes('@')) {
      const suggested = emailVal
        .split('@')[0]
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, '');
      if (suggested.length >= 3) {
        form.setValue('username', suggested, { shouldValidate: true });
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl rounded-2xl border border-white/10 bg-card/95 p-6 shadow-2xl backdrop-blur-xl">
        <DialogHeader className="border-b border-border/70 pb-3 text-start">
          <DialogTitle className="flex items-center gap-2 text-lg font-bold text-foreground">
            <User className="h-5 w-5 text-primary" />
            <span>{staff ? t('editTitle') : t('createTitle')}</span>
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Full Name */}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1.5 text-xs font-semibold">
                      <User className="h-3.5 w-3.5 text-primary" />
                      {t('fields.name')}
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t('placeholders.name')}
                        className="rounded-squircle border-white/15 bg-background/60 text-sm"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Account Role (Only selectable by Admin during creation) */}
              {isAdmin && !staff && (
                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5 text-xs font-semibold">
                        <Shield className="h-3.5 w-3.5 text-primary" />
                        {isAr ? 'نوع الحساب' : 'Account Role'}
                      </FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="rounded-squircle border-white/15 bg-background/60 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="staff">
                            {isAr ? 'حساب كادر (أكاديمي / إداري)' : 'Staff Account'}
                          </SelectItem>
                          <SelectItem value="admin">
                            {isAr ? 'مدير نظام (Administrator)' : 'System Administrator'}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Staff Type (Only when role is staff) */}
              {selectedRole !== 'admin' && (
                <FormField
                  control={form.control}
                  name="staffType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5 text-xs font-semibold">
                        <Shield className="h-3.5 w-3.5 text-primary" />
                        {t('fields.staffType')}
                      </FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="rounded-squircle border-white/15 bg-background/60 text-sm">
                            <SelectValue placeholder={t('fields.selectStaffType')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {allowedStaffTypes.map((type) => (
                            <SelectItem key={type} value={type}>
                              {t(`types.${type}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Email Address */}
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1.5 text-xs font-semibold">
                      <Mail className="h-3.5 w-3.5 text-primary" />
                      {t('fields.email')}
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        dir="ltr"
                        placeholder={t('placeholders.email')}
                        className="rounded-squircle border-white/15 bg-background/60 text-sm text-left"
                        {...field}
                        onBlur={(e) => {
                          field.onBlur();
                          handleEmailBlur(e.target.value);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Username (Primary for login) */}
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center justify-between text-xs font-semibold">
                      <span className="flex items-center gap-1.5">
                        <AtSign className="h-3.5 w-3.5 text-primary" />
                        {t('fields.username')}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-normal">
                        {t('fields.primaryLoginHint')}
                      </span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        dir="ltr"
                        placeholder={t('placeholders.username')}
                        className="rounded-squircle border-white/15 bg-background/60 text-sm font-mono text-left"
                        {...field}
                      />
                    </FormControl>
                    <p className="text-[11px] text-muted-foreground">
                      {t('fields.usernameHelp')}
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Phone */}
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel className="flex items-center gap-1.5 text-xs font-semibold">
                      <Phone className="h-3.5 w-3.5 text-primary" />
                      {t('fields.phone')}
                    </FormLabel>
                    <FormControl>
                      <Input
                        dir="ltr"
                        placeholder={t('placeholders.phone')}
                        className="rounded-squircle border-white/15 bg-background/60 text-sm text-left"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Password (for creation) */}
            {!staff && (
              <FormField
                control={form.control}
                name="password"
                render={({ field, fieldState }) => (
                  <FormItem className="rounded-xl border border-white/10 bg-secondary/30 p-3.5">
                    <div className="flex items-center justify-between pb-1">
                      <FormLabel className="flex items-center gap-1.5 text-xs font-semibold">
                        <KeyRound className="h-3.5 w-3.5 text-primary" />
                        {t('fields.temporaryPassword')}
                      </FormLabel>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={generateRandomPassword}
                        className="h-7 text-xs text-primary hover:bg-primary/10 gap-1 rounded-squircle"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        <span>{t('fields.generatePassword')}</span>
                      </Button>
                    </div>
                    <FormControl>
                      <PasswordInput
                        dir="ltr"
                        autoComplete="new-password"
                        placeholder="••••••••••••"
                        className="rounded-squircle border-white/15 bg-background/60 text-sm font-mono text-left"
                        {...field}
                      />
                    </FormControl>
                    <p className="text-[11px] text-muted-foreground pt-1">
                      {t('fields.passwordHelp')}
                    </p>
                    <FormMessage>{errorText(fieldState.error?.message)}</FormMessage>
                  </FormItem>
                )}
              />
            )}

            <DialogFooter className="mt-6 gap-2 border-t border-border/70 pt-4 rtl:sm:justify-start">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="rounded-squircle"
              >
                {t('cancel')}
              </Button>
              <Button
                type="submit"
                disabled={pending}
                className="rounded-squircle gap-2 bg-primary font-semibold text-white hover:bg-primary-hover"
              >
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                {staff ? t('save') : t('create')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
