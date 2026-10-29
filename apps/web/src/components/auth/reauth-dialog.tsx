'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ShieldCheck, AlertCircle, Loader2 } from 'lucide-react';
import api, { getApiErrorMessage, registerReauthenticationHandler } from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { PasswordInput } from '@/components/ui/password-input';

export function ReauthDialog() {
  const t = useTranslations('authSecurity');
  const locale = useLocale();
  const isAr = locale === 'ar';

  const pending = useRef<{
    operation: string;
    resolve: () => void;
    reject: (error: Error) => void;
  } | null>(null);

  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const unregister = registerReauthenticationHandler((operation) =>
      new Promise<void>((resolve, reject) => {
        if (pending.current) {
          reject(new Error(t('busy')));
          return;
        }
        pending.current = { operation, resolve, reject };
        setPassword('');
        setError('');
        setOpen(true);
      }),
    );
    return () => {
      unregister();
      pending.current?.reject(new Error(t('cancelled')));
      pending.current = null;
    };
  }, [t]);

  const cancel = () => {
    if (busy) return;
    pending.current?.reject(new Error(t('cancelled')));
    pending.current = null;
    setPassword('');
    setError('');
    setOpen(false);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!pending.current || busy) return;
    setBusy(true);
    setError('');
    try {
      await api.post(
        '/auth/reauthenticate',
        { password, operation: pending.current.operation },
        { timeout: 15000 },
      );
      const request = pending.current;
      pending.current = null;
      setOpen(false);
      request.resolve();
    } catch (cause: any) {
      const serverMsg = cause?.response?.data?.message || '';
      if (
        serverMsg.includes('Password verification failed') ||
        cause?.response?.status === 403 ||
        cause?.response?.status === 401
      ) {
        setError(
          isAr
            ? 'كلمة المرور الحالية غير صحيحة. يرجى التأكد من كلمة المرور والمحاولة مجدداً.'
            : 'Incorrect password. Please verify your password and try again.',
        );
      } else {
        setError(getApiErrorMessage(cause, t('failed')));
      }
    } finally {
      setBusy(false);
      setPassword('');
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) cancel();
      }}
    >
      <DialogContent
        dir={isAr ? 'rtl' : 'ltr'}
        className="max-w-md rounded-2xl border-border bg-card p-6 shadow-xl"
      >
        <DialogHeader className={isAr ? 'sm:text-start' : ''}>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <DialogTitle className="text-base font-bold text-foreground">
              {t('verifyTitle')}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            {t('verifyDescription')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(event) => void submit(event)} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <label
              htmlFor="security-password"
              className="text-xs font-semibold text-foreground block"
            >
              {t('password')}
            </label>
            <PasswordInput
              id="security-password"
              dir="ltr"
              className="text-left h-9 rounded-squircle text-xs"
              autoComplete="current-password"
              placeholder="••••••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              maxLength={256}
              disabled={busy}
            />
          </div>

          {error && (
            <div
              role="alert"
              className="flex items-center gap-2 p-2.5 rounded-squircle bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-medium"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <DialogFooter className="gap-2 rtl:sm:justify-start pt-2">
            <Button
              type="submit"
              disabled={busy || !password}
              className="rounded-squircle text-xs font-semibold bg-primary text-white hover:bg-primary-hover gap-1.5 cursor-pointer"
            >
              {busy ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>{t('working')}</span>
                </>
              ) : (
                t('confirm')
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={cancel}
              disabled={busy}
              className="rounded-squircle text-xs cursor-pointer"
            >
              {t('cancel')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
