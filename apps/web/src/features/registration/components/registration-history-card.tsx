'use client';

import React from 'react';
import { Eye, FileText, Printer } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { Registration } from '../api';

interface RegistrationHistoryCardProps {
  history: Registration[];
  isEnglish: boolean;
  onPrintAction: (registration: Registration, action: 'print' | 'download' | 'view') => Promise<void>;
}

function localizeSemester(value: string | undefined, isEnglish: boolean) {
  if (value === 'first') return isEnglish ? 'First Semester' : 'الفصل الدراسي الأول';
  if (value === 'second') return isEnglish ? 'Second Semester' : 'الفصل الدراسي الثاني';
  if (value === 'summer') return isEnglish ? 'Summer Semester' : 'الفصل الدراسي الصيفي';
  return value ?? '—';
}

function localizeRegistrationStatus(value: string | undefined, isEnglish: boolean) {
  const status = value?.toLowerCase();
  if (status === 'approved') return isEnglish ? 'Approved' : 'معتمد';
  if (status === 'pending') return isEnglish ? 'Pending' : 'قيد المراجعة';
  if (status === 'registered') return isEnglish ? 'Registered' : 'مسجل';
  if (status === 'rejected') return isEnglish ? 'Rejected' : 'مرفوض';
  return value ?? '—';
}

export function RegistrationHistoryCard({ history, isEnglish, onPrintAction }: RegistrationHistoryCardProps) {
  if (history.length === 0) return null;

  return (
    <Card className="space-y-4 border-border/70 bg-card/45 p-5">
      <div className="flex items-center gap-3 border-b border-border pb-4">
        <FileText className="h-5 w-5 text-primary" />
        <div>
          <h3 className="font-bold">{isEnglish ? 'Saved registration history' : 'سجل التسجيلات المحفوظة'}</h3>
          <p className="text-xs text-muted-foreground">
            {isEnglish
              ? 'View, print, or download any previous registration slip.'
              : 'يمكنك عرض أو طباعة أو تنزيل أي استمارة تسجيل سابقة.'}
          </p>
        </div>
      </div>
      <div className="space-y-3">
        {history.map((registration) => (
          <div
            key={registration._id}
            className="flex flex-col gap-3 rounded-xl border border-border bg-secondary/20 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="font-semibold">
                {registration.academicYear} · {localizeSemester(registration.semester, isEnglish)}
              </p>
              <p className="text-xs text-muted-foreground">
                {registration.courses.join(', ')} · {registration.totalCreditHours} {isEnglish ? 'hours' : 'ساعة'} ·{' '}
                {localizeRegistrationStatus(registration.status, isEnglish)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => onPrintAction(registration, 'view')}>
                <Eye className="me-1 h-4 w-4" /> {isEnglish ? 'View' : 'عرض'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => onPrintAction(registration, 'print')}>
                <Printer className="me-1 h-4 w-4" /> {isEnglish ? 'Print' : 'طباعة'}
              </Button>
              <Button size="sm" onClick={() => onPrintAction(registration, 'download')}>
                <FileText className="me-1 h-4 w-4" /> {isEnglish ? 'Download' : 'تنزيل'}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
