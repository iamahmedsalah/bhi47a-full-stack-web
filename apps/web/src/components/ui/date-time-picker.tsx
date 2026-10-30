'use client';

import * as React from 'react';
import { Calendar as CalendarIcon, Clock, X, Check } from 'lucide-react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { toCairoDateTimeLocal } from '@/lib/cairo-time';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface DateTimePickerProps {
  value?: string; // Format: YYYY-MM-DDTHH:mm
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  locale?: string;
  isError?: boolean;
  disabled?: boolean;
  minDate?: Date;
  timeZone?: 'Africa/Cairo';
}

export function DateTimePicker({
  value,
  onChange,
  placeholder = 'Select date & time',
  className,
  locale = 'ar',
  isError = false,
  disabled = false,
  minDate,
  timeZone,
}: DateTimePickerProps) {
  const isAr = locale === 'ar';
  const [open, setOpen] = React.useState(false);

  // Parse current value
  const { date, hour, minute, ampm } = React.useMemo(() => {
    if (!value) {
      return { date: undefined, hour: '12', minute: '00', ampm: 'PM' };
    }
    const [day, time] = value.split('T');
    // Calendar dates use noon; hours remain plain wall-clock fields so a browser's
    // own DST transition cannot shift a Cairo selection.
    const d = new Date(`${day}T12:00:00`);
    if (isNaN(d.getTime())) {
      return { date: undefined, hour: '12', minute: '00', ampm: 'PM' };
    }

    let h = Number(time?.split(':')[0] || 0);
    const m = time?.split(':')[1] || '00';
    const am = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    h = h ? h : 12; // 0 should be 12
    const hStr = String(h).padStart(2, '0');

    return { date: d, hour: hStr, minute: m, ampm: am };
  }, [value]);

  // Handle updates
  const handleUpdate = (
    newDate: Date | undefined,
    newHour: string,
    newMinute: string,
    newAmpm: string,
  ) => {
    const today = timeZone ? new Date(`${toCairoDateTimeLocal(new Date()).split('T')[0]}T12:00:00`) : new Date();
    const baseDate = newDate || date || today;
    const updated = new Date(baseDate);
    let h = parseInt(newHour, 10);
    if (newAmpm === 'PM' && h < 12) h += 12;
    if (newAmpm === 'AM' && h === 12) h = 0;

    // Format to YYYY-MM-DDTHH:mm in local time
    const pad = (num: number) => String(num).padStart(2, '0');
    const isoString = `${updated.getFullYear()}-${pad(updated.getMonth() + 1)}-${pad(updated.getDate())}T${pad(h)}:${newMinute}`;
    onChange(isoString);
  };

  const handleSetNow = () => {
    if (timeZone) {
      onChange(toCairoDateTimeLocal(new Date()));
      return;
    }
    const now = new Date();
    const pad = (num: number) => String(num).padStart(2, '0');
    const isoString = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    onChange(isoString);
  };

  const handleClear = () => {
    onChange('');
    setOpen(false);
  };

  // Format date-time for display
  const displayText = React.useMemo(() => {
    if (!date) return placeholder;

    const pad = (num: number) => String(num).padStart(2, '0');
    const dateStr = `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
    const period = isAr ? (ampm === 'AM' ? 'ص' : 'م') : ampm;
    return `${dateStr} ${hour}:${minute} ${period}`;
  }, [date, hour, minute, ampm, isAr, placeholder]);

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <div className="relative flex items-center w-full">
        <PopoverPrimitive.Trigger asChild disabled={disabled}>
          <Button
            type="button"
            variant="outline"
            className={cn(
              'w-full justify-start text-start font-normal h-10 border-border bg-surface/50 rounded-squircle hover:bg-surface/70 focus:ring-1 focus:ring-primary gap-2.5 px-3.5',
              !value && 'text-muted-foreground',
              isError &&
                'border-rose-500/60 bg-rose-500/10 text-rose-300 ring-1 ring-rose-500/30 hover:border-rose-500/80',
              className,
            )}
          >
            <CalendarIcon
              className={cn(
                'h-4 w-4 shrink-0',
                isError ? 'text-rose-400' : 'text-primary',
              )}
            />
            <span className="truncate flex-1 font-mono text-xs leading-none">
              {displayText}
            </span>
          </Button>
        </PopoverPrimitive.Trigger>

        {value && !disabled && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              handleClear();
            }}
            className="absolute end-2.5 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors"
            title={isAr ? 'مسح التاريخ' : 'Clear date'}
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={6}
          dir={isAr ? 'rtl' : 'ltr'}
          className="z-50 rounded-2xl border border-border/80 bg-card/95 p-0 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200"
        >
          <div className="flex flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x sm:divide-x-reverse divide-border/60">
            {/* Calendar panel */}
            <div className="p-3">
              <Calendar
                mode="single"
                selected={date}
                disabled={
                  minDate
                    ? (d) =>
                        d <
                        new Date(
                          (timeZone ? new Date(`${toCairoDateTimeLocal(minDate).split('T')[0]}T12:00:00`) : new Date(minDate)).setHours(0, 0, 0, 0),
                        )
                    : undefined
                }
                onSelect={(selectedDate) =>
                  handleUpdate(selectedDate, hour, minute, ampm)
                }
                autoFocus
              />
            </div>

            {/* Time selection panel */}
            <div className="flex flex-row sm:flex-col items-center justify-center gap-3 p-4 sm:p-5 min-w-[130px] bg-secondary/15">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1 hidden sm:flex">
                <Clock className="w-3.5 h-3.5 text-primary" />
                <span>{isAr ? 'الوقت' : 'Time'}</span>
              </div>

              <div className="flex sm:flex-col gap-2 w-full">
                {/* Hours */}
                <Select
                  value={hour}
                  onValueChange={(h) => handleUpdate(date, h, minute, ampm)}
                >
                  <SelectTrigger className="h-9 w-[64px] sm:w-full border-border bg-surface/50 text-xs font-mono rounded-squircle cursor-pointer">
                    <SelectValue placeholder="HH" />
                  </SelectTrigger>
                  <SelectContent className="border-border bg-card">
                    {Array.from({ length: 12 }, (_, i) =>
                      String(i + 1).padStart(2, '0'),
                    ).map((h) => (
                      <SelectItem
                        key={h}
                        value={h}
                        className="font-mono text-xs cursor-pointer"
                      >
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Minutes */}
                <Select
                  value={minute}
                  onValueChange={(m) => handleUpdate(date, hour, m, ampm)}
                >
                  <SelectTrigger className="h-9 w-[64px] sm:w-full border-border bg-surface/50 text-xs font-mono rounded-squircle cursor-pointer">
                    <SelectValue placeholder="MM" />
                  </SelectTrigger>
                  <SelectContent className="border-border bg-card">
                    {Array.from({ length: 60 }, (_, i) =>
                      String(i).padStart(2, '0'),
                    ).map((m) => (
                      <SelectItem
                        key={m}
                        value={m}
                        className="font-mono text-xs cursor-pointer"
                      >
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Period */}
                <Select
                  value={ampm}
                  onValueChange={(period) =>
                    handleUpdate(date, hour, minute, period)
                  }
                >
                  <SelectTrigger className="h-9 w-[64px] sm:w-full border-border bg-surface/50 text-xs font-mono rounded-squircle cursor-pointer">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-border bg-card">
                    <SelectItem value="AM" className="text-xs cursor-pointer">
                      {isAr ? 'ص' : 'AM'}
                    </SelectItem>
                    <SelectItem value="PM" className="text-xs cursor-pointer">
                      {isAr ? 'م' : 'PM'}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Bottom helper actions */}
          <div className="flex items-center justify-between border-t border-border/70 p-2.5 bg-secondary/20">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleSetNow}
              className="text-xs h-7 text-primary hover:text-primary hover:bg-primary/10 rounded-squircle font-semibold"
            >
              {isAr ? 'تعيين الآن' : 'Set to Now'}
            </Button>
            <div className="flex items-center gap-1.5">
              {value && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleClear}
                  className="text-xs h-7 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-squircle"
                >
                  {isAr ? 'مسح' : 'Clear'}
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                onClick={() => setOpen(false)}
                className="text-xs h-7 bg-primary text-white hover:bg-primary-hover rounded-squircle font-bold px-3 gap-1"
              >
                <Check className="h-3 w-3" />
                <span>{isAr ? 'تم' : 'Done'}</span>
              </Button>
            </div>
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
