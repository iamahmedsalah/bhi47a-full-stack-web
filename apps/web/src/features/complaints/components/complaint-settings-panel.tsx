'use client';

import React from 'react';
import { CalendarClock, CheckCircle2, Play, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { cn } from '@/lib/cn';

export interface ComplaintSettingsData {
  complaintsSystemOpen: boolean;
  complaintOpenAt?: string;
  complaintCloseAt?: string;
  blacklistedStudentCodes: string[];
  updatedAt?: string;
}

export interface ComplaintSettingsPanelProps {
  settings: ComplaintSettingsData | null | undefined;
  windowOpenAt: string;
  setWindowOpenAt: (val: string) => void;
  windowCloseAt: string;
  setWindowCloseAt: (val: string) => void;
  handleUpdateSettings: (patch: { complaintsSystemOpen?: boolean; complaintOpenAt?: string; complaintCloseAt?: string }) => void;
  targetStudentCode: string;
  setTargetStudentCode: (code: string) => void;
  handleStudentCodeStatus: (disable: boolean) => void;
  isAr: boolean;
  locale: string;
  formatDate: (value?: string, locale?: string) => string;
}

export function ComplaintSettingsPanel({
  settings,
  windowOpenAt,
  setWindowOpenAt,
  windowCloseAt,
  setWindowCloseAt,
  handleUpdateSettings,
  targetStudentCode,
  setTargetStudentCode,
  handleStudentCodeStatus,
  isAr,
  locale,
  formatDate,
}: ComplaintSettingsPanelProps) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
      <Card className="border-border/70 bg-card/90 p-5 shadow-[var(--shadow-glow)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-bold text-foreground">
                {isAr ? 'إعدادات استقبال الشكاوى' : 'Complaints System Settings'}
              </h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {isAr
                ? 'تحكم في فترة فتح البلاغات للطلاب مع إمكانية الفتح أو الإغلاق الفوري.'
                : 'Control opening/closing windows for students and force override system status.'}
            </p>
          </div>
          <Badge
            className={cn(
              'w-fit border px-3 py-1 flex items-center gap-2 rounded-squircle',
              settings?.complaintsSystemOpen
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                : 'border-red-500/30 bg-red-500/10 text-red-200',
            )}
          >
            <span
              className={cn(
                'relative flex h-2 w-2 rounded-full',
                settings?.complaintsSystemOpen ? 'bg-emerald-400' : 'bg-red-400',
              )}
            >
              <span
                className={cn(
                  'animate-ping absolute inline-flex h-full w-full rounded-full opacity-75',
                  settings?.complaintsSystemOpen ? 'bg-emerald-400' : 'bg-red-400',
                )}
              ></span>
            </span>
            {settings?.complaintsSystemOpen
              ? isAr
                ? 'الاستقبال مفتوح'
                : 'System Open'
              : isAr
                ? 'الاستقبال مغلق'
                : 'System Closed'}
          </Badge>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 text-start">
          <div className="space-y-2">
            <Label>{isAr ? 'وقت فتح استقبال الشكاوى' : 'Opening Date'}</Label>
            <DateTimePicker
              value={windowOpenAt}
              onChange={setWindowOpenAt}
              placeholder={locale === 'ar' ? 'حدد وقت الفتح' : 'Select opening time'}
              locale={locale}
            />
          </div>
          <div className="space-y-2">
            <Label>{isAr ? 'وقت إغلاق استقبال الشكاوى' : 'Closing Date'}</Label>
            <DateTimePicker
              value={windowCloseAt}
              onChange={setWindowCloseAt}
              placeholder={locale === 'ar' ? 'حدد وقت الإغلاق' : 'Select closing time'}
              locale={locale}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button
            onClick={() => handleUpdateSettings({})}
            variant="secondary"
            className="gap-2 cursor-pointer"
          >
            {isAr ? 'حفظ المواعيد' : 'Save Dates'}
            <CheckCircle2 className="h-4 w-4" />
          </Button>
          <Button
            onClick={() =>
              handleUpdateSettings({
                complaintsSystemOpen: true,
                complaintOpenAt: new Date().toISOString(),
                complaintCloseAt: undefined,
              })
            }
            className="gap-2 cursor-pointer"
          >
            {isAr ? 'فتح الآن' : 'Force Open'}
            {settings?.complaintsSystemOpen ? (
              <Play className="h-4 w-4 text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.6)] animate-pulse shrink-0" />
            ) : (
              <Play className="h-4 w-4 shrink-0" />
            )}
          </Button>
          <Button
            onClick={() => handleUpdateSettings({ complaintsSystemOpen: false })}
            variant="destructive"
            className="gap-2.5 bg-red-400/30 text-foreground cursor-pointer items-center"
          >
            {isAr ? 'إغلاق الآن' : 'Force Close'}
            {!settings?.complaintsSystemOpen ? (
              <span className="relative flex h-2 w-2 rounded-full bg-red-400 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              </span>
            ) : (
              <span className="h-2 w-2 rounded-full bg-red-500/50 shrink-0" />
            )}
          </Button>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          {isAr ? 'آخر تحديث' : 'Last Update'}:{' '}
          {formatDate(settings?.updatedAt, locale)}
        </p>
      </Card>

      <Card className="border-border/70 bg-card/90 p-5 shadow-[var(--shadow-glow)]">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-red-300" />
          <h2 className="text-lg font-bold text-foreground">
            {isAr ? 'إدارة أكواد الطلاب' : 'Blacklist Student Codes'}
          </h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {isAr
            ? 'فعّل أو عطّل قدرة كود طالب على إنشاء بلاغات جديدة.'
            : 'Enable or disable student codes from submitting complaint tickets.'}
        </p>

        <div className="mt-4 space-y-3">
          <Input
            value={targetStudentCode}
            onChange={(event) =>
              setTargetStudentCode(
                event.target.value.replace(/\D/g, '').slice(0, 12),
              )
            }
            placeholder={isAr ? 'ابحث بكود الطالب' : 'Search student code'}
            dir="ltr"
            className="text-center font-mono"
          />
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="destructive"
              disabled={!targetStudentCode}
              onClick={() => handleStudentCodeStatus(true)}
              className="cursor-pointer bg-red-400/30 text-foreground disabled:cursor-not-allowed"
            >
              {isAr ? 'تعطيل الكود' : 'Disable Code'}
            </Button>
            <Button
              disabled={!targetStudentCode}
              onClick={() => handleStudentCodeStatus(false)}
              className="cursor-pointer disabled:cursor-not-allowed"
            >
              {isAr ? 'تفعيل الكود' : 'Enable Code'}
            </Button>
          </div>
        </div>

        <div className="mt-4 max-h-24 space-y-1 overflow-y-auto border-t border-border/60 pt-3">
          {(settings?.blacklistedStudentCodes ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {isAr ? 'لا توجد أكواد معطلة حالياً.' : 'No codes suspended currently.'}
            </p>
          ) : (
            settings?.blacklistedStudentCodes.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setTargetStudentCode(code)}
                className="ms-1 rounded-md border border-border bg-surface px-2 py-1 font-mono text-xs text-foreground cursor-pointer"
              >
                {code}
              </button>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
