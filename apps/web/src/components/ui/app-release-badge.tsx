'use client';

import { Info } from 'lucide-react';
import { APP_RELEASE_NOTES, APP_VERSION } from '@/config/app-release';
import { cn } from '@/lib/cn';

interface AppReleaseBadgeProps {
  role: 'student' | 'admin';
  locale: string;
  compact?: boolean;
  placement?: 'top' | 'bottom';
  inline?: boolean;
}

export function AppReleaseBadge({
  role,
  locale,
  compact = false,
  placement = 'top',
  inline = false,
}: AppReleaseBadgeProps) {
  const isEnglish = locale === 'en';
  const notes = APP_RELEASE_NOTES[role][isEnglish ? 'en' : 'ar'];

  if (inline) {
    return (
      <span className="group relative inline-flex items-center">
        <button
          type="button"
          className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:text-primary-hover transition cursor-pointer underline decoration-dotted underline-offset-2"
          aria-label={isEnglish ? `Version ${APP_VERSION}` : `الإصدار ${APP_VERSION}`}
        >
          <Info className="h-3 w-3" />
          <span dir="ltr">v{APP_VERSION}</span>
        </button>
        <span
          className={cn(
            'pointer-events-none absolute left-1/2 -translate-x-1/2 z-50 w-72 rounded-3xl border border-border bg-card p-3 text-start text-xs text-foreground opacity-0 shadow-[var(--shadow-glow)] transition group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100',
            placement === 'top'
              ? 'bottom-full mb-2 translate-y-1 group-hover:translate-y-0 group-focus-within:translate-y-0'
              : 'top-full mt-2 -translate-y-1 group-hover:translate-y-0 group-focus-within:translate-y-0',
          )}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="font-bold">
              {isEnglish ? "What's new" : 'ما الجديد'}
            </p>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[10px] text-primary">
              v{APP_VERSION}
            </span>
          </div>
          <ul className="space-y-1.5 text-muted-foreground font-normal">
            {notes.map((note) => (
              <li key={note} className="leading-relaxed">
                {note}
              </li>
            ))}
          </ul>
        </span>
      </span>
    );
  }

  return (
    <div className="group relative">
      <button
        type="button"
        className={cn(
          'inline-flex items-center justify-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary transition hover:bg-primary/15',
          compact && 'h-9 w-9 px-0',
        )}
        aria-label={isEnglish ? `Version ${APP_VERSION}` : `الإصدار ${APP_VERSION}`}
      >
        <Info className="h-3.5 w-3.5" />
        {!compact && <span dir="ltr">v{APP_VERSION}</span>}
      </button>
      <div
        className={cn(
          'pointer-events-none absolute left-1/2 -translate-x-1/2 z-50 w-72 rounded-squircle border border-border bg-card p-3 text-start text-xs text-foreground opacity-0 shadow-[var(--shadow-glow)] transition group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100',
          placement === 'top'
            ? 'bottom-full mb-2 translate-y-1 group-hover:translate-y-0 group-focus-within:translate-y-0'
            : 'top-full mt-2 -translate-y-1 group-hover:translate-y-0 group-focus-within:translate-y-0',
        )}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="font-bold">
            {isEnglish ? "What's new" : 'ما الجديد'}
          </p>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[10px] text-primary">
            v{APP_VERSION}
          </span>
        </div>
        <ul className="space-y-1.5 text-muted-foreground">
          {notes.map((note) => (
            <li key={note} className="leading-relaxed">
              {note}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
