'use client';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/providers/auth-provider';
import api, { getApiErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

interface Session { _id: string; createdAt: string; expiresAt: string; current: boolean; }
export function SessionManager() {
  const t = useTranslations('authSecurity'); const locale = useLocale(); const { user, logout } = useAuth(); const client = useQueryClient();
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const key = ['authSessions', user?._id];
  const query = useQuery({ queryKey: key, queryFn: async () => (await api.get<Session[]>('/auth/sessions')).data, enabled: Boolean(user), retry: false });
  if (!user) return null;
  const date = (value: string) => new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Cairo' }).format(new Date(value));
  const revoke = async (session?: Session) => {
    setBusy(true); setError('');
    try { if (session) await api.delete(`/auth/sessions/${session._id}`); else await api.post('/auth/logout-all');
      if (!session || session.current) await logout(); else await client.invalidateQueries({ queryKey: key });
    } catch (cause) { setError(getApiErrorMessage(cause, t('failed'))); }
    finally { setBusy(false); }
  };
  return <Card className="space-y-4 rounded-2xl p-5"><h2 className="text-lg font-semibold">{t('sessions')}</h2><p className="text-sm text-muted-foreground">{t('sessionsDescription')}</p>{query.isPending && <p role="status">{t('loading')}</p>}{query.isError && <Button type="button" onClick={() => void query.refetch()}>{t('retry')}</Button>}{query.data?.length === 0 && <p>{t('empty')}</p>}<ul className="space-y-3">{query.data?.map((session) => <li key={session._id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"><div><p>{session.current ? t('current') : t('other')}</p><p className="text-xs text-muted-foreground">{date(session.createdAt)}</p></div><Button type="button" variant="outline" disabled={busy} onClick={() => void revoke(session)}>{t('signOut')}</Button></li>)}</ul><ConfirmDialog dir={locale === 'ar' ? 'rtl' : 'ltr'} trigger={<Button type="button" variant="outline" disabled={busy}>{t('signOutAll')}</Button>} title={t('signOutAll')} description={t('signOutAllDescription')} confirmLabel={t('confirm')} cancelLabel={t('cancel')} onConfirm={() => void revoke()} disabled={busy}/><p role="alert">{error}</p></Card>;
}
