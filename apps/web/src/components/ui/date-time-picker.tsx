'use client';

import * as React from 'react';
import { Calendar as CalendarIcon, Clock } from 'lucide-react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface DateTimePickerProps {
  value?: string; // Format: YYYY-MM-DDTHH:mm
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  locale?: string;
}

export function DateTimePicker({
  value,
  onChange,
  placeholder = 'Select date & time',
  className,
  locale = 'ar',
}: DateTimePickerProps) {
  const isAr = locale === 'ar';

  // Parse current value
  const { date, hour, minute, ampm } = React.useMemo(() => {
    if (!value) {
      return { date: undefined, hour: '12', minute: '00', ampm: 'PM' };
    }
    const d = new Date(value);
    if (isNaN(d.getTime())) {
      return { date: undefined, hour: '12', minute: '00', ampm: 'PM' };
    }

    let h = d.getHours();
    const m = String(Math.round(d.getMinutes() / 5) * 5 % 60).padStart(2, '0');
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
    if (!newDate) return;

    const updated = new Date(newDate);
    let h = parseInt(newHour, 10);
    if (newAmpm === 'PM' && h < 12) h += 12;
    if (newAmpm === 'AM' && h === 12) h = 0;

    updated.setHours(h);
    updated.setMinutes(parseInt(newMinute, 10));
    updated.setSeconds(0);
    updated.setMilliseconds(0);

    // Format to YYYY-MM-DDTHH:mm in local time
    const pad = (num: number) => String(num).padStart(2, '0');
    const isoString = `${updated.getFullYear()}-${pad(updated.getMonth() + 1)}-${pad(updated.getDate())}T${pad(updated.getHours())}:${pad(updated.getMinutes())}`;
    onChange(isoString);
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
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>
        <Button
          variant="outline"
          className={cn(
            'w-full justify-start text-start font-normal h-10 border-border bg-surface/50 rounded-squircle hover:bg-surface/70 focus:ring-1 focus:ring-primary gap-2.5 px-3.5',
            !value && 'text-muted-foreground',
            className
          )}
        >
          <CalendarIcon className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="truncate flex-1 font-mono text-sm leading-none">{displayText}</span>
        </Button>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={6}
          className="z-50 rounded-2xl border border-border/80 bg-card/95 p-0 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200"
        >
          <div className="flex flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x sm:divide-x-reverse divide-border/60">
            {/* Calendar panel */}
            <div className="p-1">
              <Calendar
                mode="single"
                selected={date}
                onSelect={(selectedDate) => handleUpdate(selectedDate, hour, minute, ampm)}
                autoFocus
              />
            </div>

            {/* Time selection panel */}
            <div className="flex flex-row sm:flex-col items-center justify-center gap-2 p-4 min-w-[100px] bg-surface/30">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1 hidden sm:flex">
                <Clock className="w-3.5 h-3.5" />
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
                    {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map((h) => (
                      <SelectItem key={h} value={h} className="font-mono text-xs cursor-pointer">{h}</SelectItem>
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
                    {Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0')).map((m) => (
                      <SelectItem key={m} value={m} className="font-mono text-xs cursor-pointer">{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Period */}
                <Select
                  value={ampm}
                  onValueChange={(period) => handleUpdate(date, hour, minute, period)}
                >
                  <SelectTrigger className="h-9 w-[64px] sm:w-full border-border bg-surface/50 text-xs font-mono rounded-squircle cursor-pointer">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-border bg-card">
                    <SelectItem value="AM" className="text-xs cursor-pointer">{isAr ? 'ص' : 'AM'}</SelectItem>
                    <SelectItem value="PM" className="text-xs cursor-pointer">{isAr ? 'م' : 'PM'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
