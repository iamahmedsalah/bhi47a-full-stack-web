'use client';

import React from 'react';
import { AlertTriangle, Clock, Loader2, LogOut, RefreshCw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useSessionTimer } from '@/hooks/use-session-timer';

interface SessionTimeoutDialogProps {
  role: 'admin' | 'student' | 'staff';
  locale: string;
  enabled: boolean;
  serverIdleExpiresAt?: string | null;
  idleTimeoutSeconds?: number | null;
  onLogout: () => Promise<void> | void;
}

/**
 * Headless sliding-session watcher: renders nothing during normal activity and
 * opens a warning modal only during the final 2 minutes of inactivity.
 */
export function SessionTimeoutDialog({
  role,
  locale,
  enabled,
  serverIdleExpiresAt,
  idleTimeoutSeconds,
  onLogout,
}: SessionTimeoutDialogProps) {
  const isAr = locale === 'ar';

  const {
    formattedTime,
    warnPct,
    isExtending,
    extendSession,
    isExpiringSoon,
  } = useSessionTimer({
    role,
    locale,
    enabled,
    serverIdleExpiresAt,
    idleTimeoutSeconds,
  });

  if (!enabled || !isExpiringSoon) return null;

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent
        dir={isAr ? 'rtl' : 'ltr'}
        className="sm:max-w-md rounded-2xl border-amber-500/40 bg-card/95 backdrop-blur-xl shadow-2xl"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="text-start">
          <DialogTitle className="flex items-center gap-2 text-amber-400">
            <AlertTriangle className="size-5 shrink-0" />
            <span>
              {isAr
                ? 'تنبيه: جلستك على وشك الانتهاء'
                : 'Session About to Expire'}
            </span>
          </DialogTitle>
          <DialogDescription className="text-start leading-relaxed">
            {isAr
              ? 'لم يُسجَّل أي نشاط منذ قرابة 24 ساعة. لحماية حسابك، سيتم تسجيل الخروج تلقائيًا فور انتهاء العد التنازلي.'
              : 'No activity has been recorded for nearly 24 hours. To protect your account, you will be signed out automatically when the countdown reaches zero.'}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Clock className="size-4 text-amber-400 shrink-0 animate-pulse" />
              <span>
                {isAr ? 'الوقت المتبقي قبل الخروج:' : 'Time remaining:'}
              </span>
            </span>
            <span
              dir="ltr"
              className="rounded-squircle border border-amber-500/40 bg-background/80 px-3 py-1 font-mono text-base font-bold text-amber-400 tabular-nums"
            >
              <bdi>{formattedTime}</bdi>
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-background/60">
            <div
              className="h-full rounded-full bg-amber-400 transition-all duration-1000"
              style={{ width: `${warnPct}%` }}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-start rtl:sm:justify-start">
          <Button
            type="button"
            className="rounded-squircle gap-1.5 font-bold"
            disabled={isExtending}
            onClick={() => void extendSession()}
          >
            {isExtending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            <span>{isAr ? 'متابعة الجلسة' : 'Continue Session'}</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="rounded-squircle gap-1.5"
            disabled={isExtending}
            onClick={() => void onLogout()}
          >
            <LogOut className="size-4" />
            <span>{isAr ? 'تسجيل الخروج الآن' : 'Sign Out Now'}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Legacy export kept as a no-op so any older references or test stubs remain compatible.
 * Session countdown is hidden from headers and managed globally by SessionTimeoutDialog.
 */
export function SessionTimerWidget(props?: {
  role?: 'admin' | 'student' | 'staff';
  className?: string;
}) {
  void props;
  return null;
}
