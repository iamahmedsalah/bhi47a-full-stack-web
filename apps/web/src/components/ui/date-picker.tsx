'use client';

import * as React from 'react';
import { Calendar as CalendarIcon, X } from 'lucide-react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';

interface DatePickerProps {
  value?: string; // Format: YYYY-MM-DD
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  locale?: string;
}

export function DatePicker({
  value,
  onChange,
  placeholder,
  className,
  locale = 'ar',
}: DatePickerProps) {
  const isAr = locale === 'ar';
  const defaultPlaceholder = isAr ? 'اختر التاريخ' : 'Pick a date';

  const date = React.useMemo(() => {
    if (!value) return undefined;
    const d = new Date(value + 'T00:00:00');
    return isNaN(d.getTime()) ? undefined : d;
  }, [value]);

  const displayText = React.useMemo(() => {
    if (!date) return placeholder || defaultPlaceholder;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
  }, [date, placeholder, defaultPlaceholder]);

  const handleSelect = (selectedDate: Date | undefined) => {
    if (!selectedDate) return;
    const pad = (n: number) => String(n).padStart(2, '0');
    const isoDate = `${selectedDate.getFullYear()}-${pad(selectedDate.getMonth() + 1)}-${pad(selectedDate.getDate())}`;
    onChange(isoDate);
  };

  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>
        <Button
          variant="outline"
          className={cn(
            'w-full justify-start text-start font-normal h-10 border-border bg-surface/50 rounded-squircle hover:bg-surface/70 focus:ring-1 focus:ring-primary gap-2.5 px-3.5',
            !value && 'text-muted-foreground',
            className,
          )}
        >
          <CalendarIcon className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="truncate flex-1 text-sm leading-none">{displayText}</span>
          {value && (
            <span
              role="button"
              tabIndex={0}
              className="ms-auto shrink-0 rounded-full p-0.5 text-muted-foreground hover:text-foreground hover:bg-surface cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation();
                  onChange('');
                }
              }}
              aria-label={isAr ? 'مسح التاريخ' : 'Clear date'}
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
        </Button>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={6}
          className="z-50 rounded-2xl border border-border/80 bg-card/95 p-1 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200"
        >
          <Calendar
            mode="single"
            selected={date}
            onSelect={handleSelect}
            autoFocus
          />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
