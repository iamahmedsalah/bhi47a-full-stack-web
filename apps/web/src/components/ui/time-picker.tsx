'use client';

import * as React from 'react';
import { Clock, ChevronDown } from 'lucide-react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cn } from '@/lib/cn';

export interface TimePickerProps {
  value?: string; // e.g. "09:00 AM" or "09:00"
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  locale?: string;
  disabled?: boolean;
  isError?: boolean;
  required?: boolean;
  dir?: 'rtl' | 'ltr';
}

function parseTimeValue(val?: string | null): {
  hour: string;
  minute: string;
  ampm: 'AM' | 'PM';
} {
  if (!val || typeof val !== 'string') {
    return { hour: '09', minute: '00', ampm: 'AM' };
  }

  const raw = val.trim();
  const match12 = raw.match(/^(\d{1,2}):(\d{2})\s*(am|pm|ص|م)?$/i);
  if (match12) {
    let h = parseInt(match12[1], 10);
    const m = parseInt(match12[2], 10);
    const periodRaw = match12[3]?.toLowerCase();

    let ampm: 'AM' | 'PM' = 'AM';
    if (periodRaw === 'pm' || periodRaw === 'م') {
      ampm = 'PM';
    } else if (periodRaw === 'am' || periodRaw === 'ص') {
      ampm = 'AM';
    } else if (h >= 12) {
      ampm = 'PM';
      if (h > 12) h -= 12;
    }

    if (h === 0) h = 12;
    if (h > 12) h = 12;

    const clampedM = Math.min(59, Math.max(0, isNaN(m) ? 0 : m));
    return {
      hour: String(h).padStart(2, '0'),
      minute: String(clampedM).padStart(2, '0'),
      ampm,
    };
  }

  // Fallback 24-hour match
  const match24 = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    let h = parseInt(match24[1], 10);
    const m = parseInt(match24[2], 10);
    const ampm: 'AM' | 'PM' = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;
    const clampedM = Math.min(59, Math.max(0, isNaN(m) ? 0 : m));
    return {
      hour: String(h).padStart(2, '0'),
      minute: String(clampedM).padStart(2, '0'),
      ampm,
    };
  }

  return { hour: '09', minute: '00', ampm: 'AM' };
}

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

export function TimePicker({
  value,
  onChange,
  placeholder = '09:00 AM',
  className,
  locale = 'ar',
  disabled = false,
  isError = false,
  dir,
}: TimePickerProps) {
  const isAr = locale === 'ar';
  const effectiveDir = dir || (isAr ? 'rtl' : 'ltr');
  const [open, setOpen] = React.useState(false);

  const { hour, minute, ampm } = React.useMemo(() => parseTimeValue(value), [value]);

  const hourListRef = React.useRef<HTMLDivElement>(null);
  const minuteListRef = React.useRef<HTMLDivElement>(null);

  // Auto-scroll selected items into view when opened
  React.useEffect(() => {
    if (open) {
      setTimeout(() => {
        const selectedHourEl = hourListRef.current?.querySelector('[data-selected="true"]');
        if (selectedHourEl) {
          selectedHourEl.scrollIntoView({ block: 'center', behavior: 'instant' });
        }
        const selectedMinuteEl = minuteListRef.current?.querySelector('[data-selected="true"]');
        if (selectedMinuteEl) {
          selectedMinuteEl.scrollIntoView({ block: 'center', behavior: 'instant' });
        }
      }, 50);
    }
  }, [open]);

  const handleSelect = (newH: string, newM: string, newP: 'AM' | 'PM') => {
    onChange(`${newH}:${newM} ${newP}`);
  };

  const displayTime = value ? value : '';

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild disabled={disabled}>
        <button
          type="button"
          aria-label={isAr ? 'اختر الوقت' : 'Select time'}
          className={cn(
            'flex h-9 w-full items-center justify-between gap-2 rounded-squircle border border-border bg-background px-3 text-xs font-mono text-foreground transition-colors hover:bg-secondary/40 focus:outline-none focus:ring-1 focus:ring-primary',
            isError && 'border-destructive focus:ring-destructive',
            disabled && 'opacity-50 cursor-not-allowed',
            className,
          )}
        >
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className={cn('text-left', !displayTime && 'text-muted-foreground')}>
              {displayTime || placeholder}
            </span>
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0 opacity-70" />
        </button>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={6}
          dir={effectiveDir}
          className="z-50 w-72 rounded-2xl border border-border/80 bg-card/95 p-3 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150"
        >
          {/* Header summary display */}
          <div className="mb-2 flex items-center justify-center gap-1.5 rounded-squircle bg-secondary/30 p-1.5 text-center font-mono text-sm font-semibold text-foreground">
            <span className="w-12 rounded-lg bg-primary/20 py-1 text-primary">{hour}</span>
            <span className="text-muted-foreground">:</span>
            <span className="w-12 rounded-lg bg-primary/20 py-1 text-primary">{minute}</span>
            <span className="w-14 rounded-lg bg-primary/20 py-1 text-primary">
              {ampm} {isAr ? (ampm === 'AM' ? '(ص)' : '(م)') : ''}
            </span>
          </div>

          {/* 3 Columns Grid */}
          <div className="grid grid-cols-3 gap-1.5 text-xs">
            {/* Column 1: Hours */}
            <div className="flex flex-col">
              <span className="mb-1 text-center text-[10px] font-medium text-muted-foreground">
                {isAr ? 'الساعة' : 'Hour'}
              </span>
              <div
                ref={hourListRef}
                className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-xl border border-border/40 bg-secondary/15 p-1 scrollbar-thin"
              >
                {HOURS.map((h) => {
                  const isSelected = h === hour;
                  return (
                    <button
                      key={h}
                      type="button"
                      data-selected={isSelected}
                      onClick={() => handleSelect(h, minute, ampm)}
                      className={cn(
                        'rounded-lg py-1.5 text-center font-mono text-xs transition-colors hover:bg-secondary/60 cursor-pointer',
                        isSelected &&
                          'bg-primary/25 font-bold text-primary border border-primary/40 shadow-xs',
                      )}
                    >
                      {h}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Column 2: Minutes */}
            <div className="flex flex-col">
              <span className="mb-1 text-center text-[10px] font-medium text-muted-foreground">
                {isAr ? 'الدقيقة' : 'Minute'}
              </span>
              <div
                ref={minuteListRef}
                className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-xl border border-border/40 bg-secondary/15 p-1 scrollbar-thin"
              >
                {MINUTES.map((m) => {
                  const isSelected = m === minute;
                  return (
                    <button
                      key={m}
                      type="button"
                      data-selected={isSelected}
                      onClick={() => handleSelect(hour, m, ampm)}
                      className={cn(
                        'rounded-lg py-1.5 text-center font-mono text-xs transition-colors hover:bg-secondary/60 cursor-pointer',
                        isSelected &&
                          'bg-primary/25 font-bold text-primary border border-primary/40 shadow-xs',
                      )}
                    >
                      {m}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Column 3: AM / PM */}
            <div className="flex flex-col">
              <span className="mb-1 text-center text-[10px] font-medium text-muted-foreground">
                {isAr ? 'الفترة' : 'Period'}
              </span>
              <div className="flex flex-col gap-1 rounded-xl border border-border/40 bg-secondary/15 p-1">
                {(['AM', 'PM'] as const).map((p) => {
                  const isSelected = p === ampm;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => handleSelect(hour, minute, p)}
                      className={cn(
                        'rounded-lg py-2.5 text-center font-mono text-xs font-medium transition-colors hover:bg-secondary/60 cursor-pointer',
                        isSelected &&
                          'bg-primary/25 font-bold text-primary border border-primary/40 shadow-xs',
                      )}
                    >
                      <div>{p}</div>
                      {isAr && (
                        <div className="text-[10px] text-muted-foreground">
                          {p === 'AM' ? 'صباحاً' : 'مساءً'}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
