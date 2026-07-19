'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Eye, FileText, Printer } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Course, Eligibility, Registration } from '../api';

interface CompletedRegistrationCardProps {
  registration: Registration;
  eligibility: Eligibility | undefined;
  registeredCourseDetails: {
    code: string;
    name: string;
    creditHours: number;
    type: string;
  }[];
  isEnglish: boolean;
  onPrintAction: (registration: Registration, action: 'print' | 'download' | 'view') => Promise<void>;
}

export function CompletedRegistrationCard({
  registration,
  eligibility,
  registeredCourseDetails,
  isEnglish,
  onPrintAction,
}: CompletedRegistrationCardProps) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <Card className="space-y-5 p-6 border-border/70 bg-card/45 backdrop-blur-sm shadow-[var(--shadow-glow)] transition-all duration-300 hover:border-primary/30">
        <div className="flex flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">
                {isEnglish ? 'Registration Completed' : 'تم تسجيل المقررات بنجاح'}
              </h3>
              <p className="text-xs text-muted-foreground">
                {isEnglish
                  ? 'You are successfully registered for this semester'
                  : 'تم تسجيل مقرراتك الدراسية بنجاح للفصل الحالي'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 self-start sm:self-auto">
            <Button
              onClick={() => onPrintAction(registration, 'view')}
              className="flex h-11 items-center gap-1.5 bg-blue-600 font-semibold text-xs text-white shadow-md transition-all hover:bg-blue-700 cursor-pointer"
            >
              <Eye className="h-4 w-4" />
              {isEnglish ? 'View' : 'عرض'}
            </Button>
            <Button
              onClick={() => onPrintAction(registration, 'print')}
              className="flex h-11 items-center gap-1.5 bg-primary font-semibold text-xs text-primary-foreground shadow-md transition-all hover:bg-primary/80 cursor-pointer"
            >
              <Printer className="h-4 w-4" />
              {isEnglish ? 'Print' : 'طباعة'}
            </Button>
            <Button
              variant="outline"
              onClick={() => onPrintAction(registration, 'download')}
              className="flex h-11 items-center gap-1.5 border-primary font-semibold text-xs text-primary shadow-md transition-all hover:bg-primary/10 cursor-pointer"
            >
              <FileText className="h-4 w-4" />
              {isEnglish ? 'Download PDF' : 'تحميل PDF'}
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24 font-bold text-start">{isEnglish ? 'Code' : 'الكود الأكاديمي'}</TableHead>
                <TableHead className="font-bold text-start">{isEnglish ? 'Course' : 'المقرر الدراسي'}</TableHead>
                <TableHead className="w-24 font-bold text-center">{isEnglish ? 'Hours' : 'عدد الساعات'}</TableHead>
                <TableHead className="w-24 font-bold text-end">{isEnglish ? 'Type' : 'النوع'}</TableHead>
                <TableHead className="w-28 font-bold text-end">{isEnglish ? 'Status' : 'الحالة'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {registeredCourseDetails.map((course) => (
                <TableRow key={course.code}>
                  <TableCell className="font-bold font-mono text-foreground text-start">{course.code}</TableCell>
                  <TableCell className="font-bold text-foreground text-start">{course.name}</TableCell>
                  <TableCell className="font-bold font-mono text-center">{course.creditHours}</TableCell>
                  <TableCell className="text-end text-muted-foreground">
                    {isEnglish ? course.type : course.type === 'elective' ? 'اختياري' : 'إجباري'}
                  </TableCell>
                  <TableCell className="text-end">
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-1 font-medium text-xs ring-1 ring-inset ${
                        registration.status?.toLowerCase() === 'approved'
                          ? 'bg-emerald-500/10 text-emerald-500 ring-emerald-500/20'
                          : registration.status?.toLowerCase() === 'pending'
                            ? 'bg-amber-500/10 text-amber-500 ring-amber-500/20'
                            : 'bg-blue-500/10 text-blue-500 ring-blue-500/20'
                      }`}
                    >
                      {(() => {
                        const s = registration.status?.toLowerCase();
                        if (s === 'approved') return isEnglish ? 'Approved' : 'معتمد';
                        if (s === 'pending') return isEnglish ? 'Pending' : 'قيد المراجعة';
                        if (s === 'registered') return isEnglish ? 'Registered' : 'مسجل';
                        return registration.status;
                      })()}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 md:flex-row md:items-center md:justify-between">
          <p className="font-bold font-mono text-xs text-muted-foreground">
            {isEnglish ? 'Total credit hours:' : 'إجمالي الساعات المعتمدة:'} {registration.totalCreditHours} /{' '}
            {eligibility?.maxCreditHours ?? 18}
          </p>
        </div>
      </Card>
    </motion.div>
  );
}
