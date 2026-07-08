import { AlertCircle, Inbox, Loader2 } from 'lucide-react';
import { ReactNode } from 'react';
import { getApiErrorDetails } from '@/lib/api';
import { Button } from './button';

export function LoadingState({
  title = 'Loading...',
  description,
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center gap-4 p-10 text-center">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center gap-3 p-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Inbox className="h-6 w-6" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {description ? (
          <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  description,
  error,
  code,
  reason,
  onRetry,
}: {
  title?: string;
  description?: string;
  error?: unknown;
  code?: string;
  reason?: string;
  onRetry?: () => void;
}) {
  const details = error ? getApiErrorDetails(error, description ?? title) : null;
  const message = description ?? details?.message ?? 'An unexpected error occurred';
  const displayCode = code ?? details?.code;
  const displayReason = reason ?? details?.reason;
  const hasDiagnostics = Boolean(displayCode || displayReason || details?.path);

  return (
    <div className="flex min-h-56 flex-col items-center justify-center gap-4 p-8 text-center animate-in fade-in zoom-in-95 duration-200">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-danger/10 text-danger shadow-[0_0_15px_rgba(239,68,68,0.15)]">
        <AlertCircle className="h-7 w-7" />
      </div>
      <div className="space-y-1">
        <p className="text-base font-bold text-foreground">{title}</p>
        {message ? (
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
            {message}
          </p>
        ) : null}
      </div>
      {hasDiagnostics ? (
        <div className="mt-2 w-full max-w-md rounded-xl border border-danger/20 bg-danger/5 p-4 text-start text-xs text-danger shadow-inner">
          <div className="flex flex-col gap-2 font-mono">
            {displayCode && (
              <div className="flex items-start gap-2">
                <span className="font-semibold text-danger/70 min-w-16">Code:</span>
                <span className="select-all rounded bg-danger/10 px-1.5 py-0.5 font-bold">
                  {displayCode}
                </span>
              </div>
            )}
            {displayReason && (
              <div className="flex items-start gap-2">
                <span className="font-semibold text-danger/70 min-w-16">Reason:</span>
                <span className="leading-relaxed">{displayReason}</span>
              </div>
            )}
            {details?.path && (
              <div className="flex items-start gap-2 border-t border-danger/10 pt-1.5 mt-0.5 text-[10px] text-danger/60">
                <span className="font-semibold min-w-16">Path:</span>
                <span className="truncate">{details.path}</span>
              </div>
            )}
          </div>
        </div>
      ) : null}
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-2 cursor-pointer border-border hover:bg-surface/50">
          Retry
        </Button>
      ) : null}
    </div>
  );
}

export function AlertMessage({
  tone = 'danger',
  children,
}: {
  tone?: 'danger' | 'success' | 'warning' | 'info';
  children: ReactNode;
}) {
  const toneClass = {
    danger: 'border-danger/30 bg-danger/10 text-danger',
    success: 'border-success/30 bg-success/10 text-success',
    warning: 'border-warning/30 bg-warning/10 text-warning',
    info: 'border-accent/30 bg-accent/10 text-accent',
  }[tone];

  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${toneClass}`} role="status">
      {children}
    </div>
  );
}
