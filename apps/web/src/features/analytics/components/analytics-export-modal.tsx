'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FileSpreadsheet, Loader2, Download, Layers } from 'lucide-react';
import { toast } from 'sonner';
import { downloadComprehensiveAnalyticsExcel, type ExportReportParams } from '../api';
import { getApiErrorMessage } from '@/lib/api';

interface AnalyticsExportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale?: string;
}

export function AnalyticsExportModal({
  open,
  onOpenChange,
  locale = 'ar',
}: AnalyticsExportModalProps) {
  const isAr = locale === 'ar';
  const [isExporting, setIsExporting] = useState(false);

  const [academicYear, setAcademicYear] = useState<string>('2026-2027');
  const [semester, setSemester] = useState<string>('all');
  const [department, setDepartment] = useState<string>('all');
  const [level, setLevel] = useState<string>('all');
  const [reportLocale, setReportLocale] = useState<'ar' | 'en'>(isAr ? 'ar' : 'en');
  const [includeSubmissions, setIncludeSubmissions] = useState<boolean>(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const params: ExportReportParams = {
        locale: reportLocale,
        includeSubmissions,
      };
      if (academicYear && academicYear !== 'all') params.academicYear = academicYear;
      if (semester && semester !== 'all') params.semester = semester as any;
      if (department && department !== 'all') params.department = department;
      if (level && level !== 'all') params.level = level;

      await downloadComprehensiveAnalyticsExcel(params);
      toast.success(
        isAr
          ? 'تم تصدير ملف Excel الشامل بجميع أوراق التحليلات بنجاح'
          : 'Comprehensive multi-sheet Excel report exported successfully',
      );
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error(
        getApiErrorMessage(
          err,
          isAr ? 'فشل تصدير ملف التحليلات' : 'Failed to export analytics report',
        ),
      );
    } finally {
      setIsExporting(false);
    }
  };

  const sheetsIncluded = isAr
    ? [
        'معلومات التقرير والمنهجية',
        'المؤشرات العامة (KPIs)',
        'الأقسام والشعب والطاقة',
        'استبقاء الدفعات والتعثر',
        'توزيع المعدلات (GPA)',
        'حالات القيد الأكاديمي',
        'تحليل الكويزات ونسب الدخول والنجاح',
        'أداء هيئة التدريس والمعاونة في الكويزات',
        'تحليل المقررات والمسجلين ونسب النجاح',
        'بيانات الطلاب الأكاديمية المفصلة',
        'تحليل تذاكر الشكاوى والمتابعة',
      ]
    : [
        'Report Info & Methodology',
        'Summary KPIs',
        'Departments & Capacity',
        'Cohort Retention & Probation',
        'GPA Distribution',
        'Enrollment Status',
        'Quiz Analysis & Pass Rates',
        'Staff Quiz Performance',
        'Course Analysis & Enrollment',
        'Students Academic Data',
        'Complaints Resolution Analysis',
      ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-xl rounded-2xl"
        dir={isAr ? 'rtl' : 'ltr'}
      >
        <DialogHeader className="sm:text-start rtl:sm:text-right">
          <div className="flex items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-squircle bg-teal-500/10 text-teal-600 dark:text-teal-400">
              <FileSpreadsheet className="h-5 w-5" />
            </span>
            <div>
              <DialogTitle className="text-lg font-bold">
                {isAr
                  ? 'تصدير التقرير التحليلي الأكاديمي الشامل (.xlsx)'
                  : 'Export Comprehensive Academic Analytics (.xlsx)'}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                {isAr
                  ? 'ملف Excel تفصيلي متعدد الأوراق يحسب نسب الكويزات، أداء الدكاترة والمعيدين، المقررات، والطلبة مباشرة من قاعدة البيانات.'
                  : 'Multi-sheet live Excel report compiling quiz rates, faculty performance, courses, and student records.'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2 text-sm">
          {/* Filter Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Academic Year */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                {isAr ? 'العام الأكاديمي' : 'Academic Year'}
              </Label>
              <Select value={academicYear} onValueChange={setAcademicYear}>
                <SelectTrigger className="rounded-squircle">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent dir={isAr ? 'rtl' : 'ltr'}>
                  <SelectItem value="all">{isAr ? 'جميع الأعوام' : 'All Years'}</SelectItem>
                  <SelectItem value="2026-2027">2026-2027</SelectItem>
                  <SelectItem value="2025-2026">2025-2026</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Semester */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                {isAr ? 'الفصل الدراسي' : 'Semester'}
              </Label>
              <Select value={semester} onValueChange={setSemester}>
                <SelectTrigger className="rounded-squircle">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent dir={isAr ? 'rtl' : 'ltr'}>
                  <SelectItem value="all">{isAr ? 'جميع الفصول' : 'All Semesters'}</SelectItem>
                  <SelectItem value="first">{isAr ? 'الفصل الدراسي الأول' : 'First Semester'}</SelectItem>
                  <SelectItem value="second">{isAr ? 'الفصل الدراسي الثاني' : 'Second Semester'}</SelectItem>
                  <SelectItem value="summer">{isAr ? 'الفصل الصيفي' : 'Summer Semester'}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Department */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                {isAr ? 'القسم / المسار' : 'Department'}
              </Label>
              <Select value={department} onValueChange={setDepartment}>
                <SelectTrigger className="rounded-squircle">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent dir={isAr ? 'rtl' : 'ltr'}>
                  <SelectItem value="all">{isAr ? 'جميع الأقسام' : 'All Departments'}</SelectItem>
                  <SelectItem value="GEN">{isAr ? 'الشعبة العامة' : 'General Division'}</SelectItem>
                  <SelectItem value="BIS">{isAr ? 'نظم معلومات الأعمال (BIS)' : 'Business Information Systems'}</SelectItem>
                  <SelectItem value="ACC">{isAr ? 'المحاسبة والمراجعة' : 'Accounting & Auditing'}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Level */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                {isAr ? 'الفرقة الدراسية' : 'Academic Level'}
              </Label>
              <Select value={level} onValueChange={setLevel}>
                <SelectTrigger className="rounded-squircle">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent dir={isAr ? 'rtl' : 'ltr'}>
                  <SelectItem value="all">{isAr ? 'جميع الفرق' : 'All Levels'}</SelectItem>
                  <SelectItem value="1">{isAr ? 'الفرقة الأولى' : 'Level 1'}</SelectItem>
                  <SelectItem value="2">{isAr ? 'الفرقة الثانية' : 'Level 2'}</SelectItem>
                  <SelectItem value="3">{isAr ? 'الفرقة الثالثة' : 'Level 3'}</SelectItem>
                  <SelectItem value="4">{isAr ? 'الفرقة الرابعة' : 'Level 4'}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Language */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs font-semibold">
                {isAr ? 'لغة ملف التقرير' : 'Report Language'}
              </Label>
              <Select value={reportLocale} onValueChange={(val: any) => setReportLocale(val)}>
                <SelectTrigger className="rounded-squircle">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent dir={isAr ? 'rtl' : 'ltr'}>
                  <SelectItem value="ar">العربية (RTL - الافتراضي)</SelectItem>
                  <SelectItem value="en">English (LTR)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Detailed Submissions Checkbox */}
          <div className="flex items-start gap-3 rounded-xl border border-border/70 bg-secondary/30 p-3">
            <Checkbox
              id="include-subs"
              checked={includeSubmissions}
              onCheckedChange={(checked) => setIncludeSubmissions(Boolean(checked))}
            />
            <div className="space-y-0.5">
              <label
                htmlFor="include-subs"
                className="text-xs font-semibold text-foreground cursor-pointer"
              >
                {isAr
                  ? 'تضمين شيت تسليمات الطلاب التفصيلية لكل كويز'
                  : 'Include detailed individual quiz submissions roster'}
              </label>
              <p className="text-[11px] text-muted-foreground">
                {isAr
                  ? 'يضيف ورقة عمل إضافية تسرد كل تسليم بالاسم والدرجة ووقت التسليم.'
                  : 'Adds an extra worksheet with every student submission timestamp and score.'}
              </p>
            </div>
          </div>

          {/* Sheets Included Preview Badge List */}
          <div className="rounded-xl border border-teal-500/20 bg-teal-500/5 p-3 space-y-2">
            <span className="flex items-center gap-1.5 text-xs font-bold text-teal-600 dark:text-teal-400">
              <Layers className="h-3.5 w-3.5" />
              <span>{isAr ? 'أوراق العمل المتضمنة بالتقرير (11 ورقة عمل):' : 'Worksheets Included in Report (11 Sheets):'}</span>
            </span>
            <div className="flex flex-wrap gap-1">
              {sheetsIncluded.map((s, idx) => (
                <span
                  key={idx}
                  className="rounded-squircle border border-border/60 bg-card px-2 py-0.5 text-[10px] text-muted-foreground"
                >
                  {s}
                </span>
              ))}
              {includeSubmissions && (
                <span className="rounded-squircle border border-teal-500/40 bg-teal-500/10 px-2 py-0.5 text-[10px] font-semibold text-teal-600 dark:text-teal-300">
                  {isAr ? '+ نتائج الكويزات التفصيلية' : '+ Detailed Submissions'}
                </span>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="rtl:sm:justify-start gap-2 pt-2">
          <Button
            type="button"
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-2 rounded-squircle bg-teal-600 hover:bg-teal-700 text-white font-semibold cursor-pointer shadow-md"
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            <span>
              {isExporting
                ? isAr
                  ? 'جاري إنشاء وتصدير الملف...'
                  : 'Generating Report...'
                : isAr
                  ? 'تحميل ملف Excel الشامل (.xlsx)'
                  : 'Download Complete Excel Report'}
            </span>
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isExporting}
            className="rounded-squircle cursor-pointer"
          >
            {isAr ? 'إلغاء' : 'Cancel'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
