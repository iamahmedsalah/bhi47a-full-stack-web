'use client';
import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import api, { getApiErrorMessage, registerReauthenticationHandler } from '@/lib/api';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { PasswordInput } from '@/components/ui/password-input';

export function ReauthDialog() {
  const t = useTranslations('authSecurity'); const locale = useLocale();
  const pending = useRef<{ operation: string; resolve: () => void; reject: (error: Error) => void } | null>(null);
  const [open, setOpen] = useState(false); const [password, setPassword] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  useEffect(() => {
    const unregister = registerReauthenticationHandler((operation) => new Promise<void>((resolve, reject) => {
      if (pending.current) { reject(new Error(t('busy'))); return; }
      pending.current = { operation, resolve, reject }; setPassword(''); setError(''); setOpen(true);
    }));
    return () => { unregister(); pending.current?.reject(new Error(t('cancelled'))); pending.current = null; };
  }, [t]);
  const cancel = () => { if (busy) return; pending.current?.reject(new Error(t('cancelled'))); pending.current = null; setPassword(''); setOpen(false); };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (!pending.current || busy) return; setBusy(true); setError('');
    try {
      await api.post('/auth/reauthenticate', { password, operation: pending.current.operation }, { timeout: 15000 });
      const request = pending.current; pending.current = null; setOpen(false); request.resolve();
    } catch (cause) { setError(getApiErrorMessage(cause, t('failed'))); }
    finally { setBusy(false); setPassword(''); }
  };
  return <Dialog open={open} onOpenChange={(value) => { if (!value) cancel(); }}><DialogContent dir={locale === 'ar' ? 'rtl' : 'ltr'} className="rounded-2xl"><DialogHeader className="text-start"><DialogTitle>{t('verifyTitle')}</DialogTitle><DialogDescription>{t('verifyDescription')}</DialogDescription></DialogHeader><form onSubmit={(event) => void submit(event)} className="space-y-4"><label htmlFor="security-password">{t('password')}</label><PasswordInput id="security-password" dir="ltr" className="text-left" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required maxLength={256} disabled={busy}/><p role="alert">{error}</p><DialogFooter className="gap-2 rtl:sm:justify-start"><Button type="submit" disabled={busy || !password}>{busy ? t('working') : t('confirm')}</Button><Button type="button" variant="outline" onClick={cancel} disabled={busy}>{t('cancel')}</Button></DialogFooter></form></DialogContent></Dialog>;
}
