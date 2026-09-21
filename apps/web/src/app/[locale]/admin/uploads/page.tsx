'use client';

import React, { useState, Suspense, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle,
  AlertTriangle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Download,
  Users,
  BookOpen,
  Calendar,
  Mail,
  CheckCircle2,
  FileText,
  Info,
  X,
  FileCheck,
  Eye,
  Trash2,
  AlertOctagon,
  RotateCcw,
  Check,
} from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { readSheet as readXlsxFile } from 'read-excel-file/browser';

import api, { getApiErrorMessage } from '@/lib/api';
import { PageTitleBanner } from '@/components/ui/page-title-banner';
import { PageSkeletonLoader } from '@/components/ui/page-suspense-fallback';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { downloadExcel } from '@/lib/utils';
import { cn } from '@/lib/cn';

interface UploadResult {
  success: boolean;
  successCount: number;
  failedCount: number;
  errors: string[];
}

interface UploadTypeConfig {
  id: string;
  titleAr: string;
  titleEn: string;
  descAr: string;
  descEn: string;
  icon: React.ReactNode;
  sampleHeaders: string[];
  sampleData: Record<string, unknown>[];
  fields: { ar: string; en: string; required?: boolean; note?: string }[];
}

const UPLOAD_CONFIGS: UploadTypeConfig[] = [
  {
    id: 'students',
    titleAr: 'بيانات الطلاب',
    titleEn: 'Students Master Data',
    descAr: 'استيراد وتحديث الأرقام القومية، المستويات، مقار ولجان الامتحان وحالة القيد.',
    descEn: 'Import & update national IDs, levels, exam placements, and status.',
    icon: <Users className="h-5 w-5" />,
    sampleHeaders: ['studentCode', 'fullName', 'nationalId', 'level', 'department', 'seatNumber', 'group', 'section', 'academicYear', 'semester', 'mustChangePassword'],
    sampleData: [
      {
        studentCode: '2024001',
        fullName: 'أحمد محمود علي',
        nationalId: '30101011234567',
        level: '1',
        department: 'نظم معلومات الأعمال',
        seatNumber: '101',
        group: 'أ',
        section: '1',
        academicYear: '2024-2025',
        semester: 'first',
        mustChangePassword: 'true',
      },
    ],
    fields: [
      { ar: 'كود الطالب', en: 'studentCode', required: true },
      { ar: 'الاسم بالكامل', en: 'fullName', required: true },
      { ar: 'الرقم القومي', en: 'nationalId', required: true, note: '14 رقم' },
      { ar: 'المستوى الدراسي (1-4)', en: 'level', required: true },
      { ar: 'القسم العلمي', en: 'department' },
      { ar: 'رقم الجلوس', en: 'seatNumber' },
      { ar: 'المجموعة', en: 'group' },
      { ar: 'السكشن', en: 'section' },
      { ar: 'السنة الدراسية', en: 'academicYear' },
      { ar: 'الفصل الدراسي', en: 'semester' },
      { ar: 'إلزام تغيير كلمة المرور', en: 'mustChangePassword' },
    ],
  },
  {
    id: 'courses',
    titleAr: 'المقررات الدراسية',
    titleEn: 'Courses Catalog',
    descAr: 'استيراد المواد الدراسية، الساعات المعتمدة، المتطلبات السابقة والتصنيفات.',
    descEn: 'Import courses catalog, credit hours, prerequisites, and semesters.',
    icon: <BookOpen className="h-5 w-5" />,
    sampleHeaders: ['courseCode', 'courseName', 'level', 'semester', 'creditHours', 'department', 'type'],
    sampleData: [
      {
        courseCode: 'CS101',
        courseName: 'مقدمة في علوم الحاسب',
        level: '1',
        semester: 'first',
        creditHours: 3,
        department: 'نظم معلومات الأعمال',
        type: 'required',
      },
    ],
    fields: [
      { ar: 'كود المادة', en: 'courseCode', required: true },
      { ar: 'اسم المادة', en: 'courseName', required: true },
      { ar: 'المستوى الدراسي', en: 'level', required: true },
      { ar: 'الفصل الدراسي', en: 'semester', required: true },
      { ar: 'الساعات المعتمدة', en: 'creditHours', required: true },
      { ar: 'القسم العلمي', en: 'department' },
      { ar: 'المتطلبات السابقة', en: 'prerequisites' },
      { ar: 'نوع المقرر', en: 'type' },
    ],
  },
  {
    id: 'grades',
    titleAr: 'نتائج ورصد الدرجات',
    titleEn: 'Student Grades',
    descAr: 'رفع نتائج الامتحانات (ميدترم / نهائي / عملي) ونسب النجاح.',
    descEn: 'Upload midterm, final exam, and practical scores.',
    icon: <FileSpreadsheet className="h-5 w-5" />,
    sampleHeaders: ['studentCode', 'courseCode', 'examType', 'grade', 'maxGrade', 'status', 'academicYear', 'semester'],
    sampleData: [
      {
        studentCode: '2024001',
        courseCode: 'CS101',
        examType: 'midterm',
        grade: 18,
        maxGrade: 20,
        status: 'present',
        academicYear: '2024-2025',
        semester: 'first',
      },
    ],
    fields: [
      { ar: 'كود الطالب', en: 'studentCode', required: true },
      { ar: 'كود المادة', en: 'courseCode', required: true },
      { ar: 'نوع الامتحان', en: 'examType', required: true, note: 'midterm / final / practical' },
      { ar: 'الدرجة المحققة', en: 'grade', required: true },
      { ar: 'الدرجة العظمى', en: 'maxGrade', required: true },
      { ar: 'حالة الحضور', en: 'status', note: 'present / absent' },
      { ar: 'السنة الدراسية', en: 'academicYear', required: true },
      { ar: 'الفصل الدراسي', en: 'semester', required: true },
    ],
  },
  {
    id: 'quizzes',
    titleAr: 'الكويزات والتكليفات',
    titleEn: 'Course Quizzes',
    descAr: 'رفع درجات الاختبارات الدورية والتطبيقات العملية خلال الفصل الدراسي.',
    descEn: 'Upload quiz results, evaluations, and coursework.',
    icon: <CheckCircle2 className="h-5 w-5" />,
    sampleHeaders: ['studentCode', 'courseCode', 'quizNumber', 'title', 'grade', 'maxGrade', 'academicYear', 'semester'],
    sampleData: [
      {
        studentCode: '2024001',
        courseCode: 'CS101',
        quizNumber: 1,
        title: 'Quiz 1 - Introduction',
        grade: 10,
        maxGrade: 10,
        academicYear: '2024-2025',
        semester: 'first',
      },
    ],
    fields: [
      { ar: 'كود الطالب', en: 'studentCode', required: true },
      { ar: 'كود المادة', en: 'courseCode', required: true },
      { ar: 'رقم الكويز', en: 'quizNumber', required: true },
      { ar: 'عنوان الكويز', en: 'title' },
      { ar: 'الدرجة', en: 'grade', required: true },
      { ar: 'الدرجة العظمى', en: 'maxGrade', required: true },
      { ar: 'السنة الدراسية', en: 'academicYear' },
      { ar: 'الفصل الدراسي', en: 'semester' },
    ],
  },
  {
    id: 'attendance',
    titleAr: 'سجلات الحضور والغياب',
    titleEn: 'Attendance Logs',
    descAr: 'استيراد إحصائيات حضور وغياب الطلاب للمحاضرات والسكاشن.',
    descEn: 'Upload lecture attendance and absence counts.',
    icon: <Calendar className="h-5 w-5" />,
    sampleHeaders: ['studentCode', 'totalLectures', 'attendedLectures', 'absenceLectures', 'academicYear', 'semester'],
    sampleData: [
      {
        studentCode: '2024001',
        totalLectures: 14,
        attendedLectures: 12,
        absenceLectures: 2,
        academicYear: '2024-2025',
        semester: 'first',
      },
    ],
    fields: [
      { ar: 'كود الطالب', en: 'studentCode', required: true },
      { ar: 'المحاضرات الكلية', en: 'totalLectures', required: true },
      { ar: 'المحاضرات الحاضرة', en: 'attendedLectures', required: true },
      { ar: 'المحاضرات الغائبة', en: 'absenceLectures', required: true },
      { ar: 'السنة الدراسية', en: 'academicYear' },
      { ar: 'الفصل الدراسي', en: 'semester' },
    ],
  },
  {
    id: 'academic-emails',
    titleAr: 'البريد الأكاديمي',
    titleEn: 'Academic Emails',
    descAr: 'ربط الطلاب بإيميلاتهم الجامعية الرسمية وتفعيل حساباتهم.',
    descEn: 'Link student codes with institution email accounts.',
    icon: <Mail className="h-5 w-5" />,
    sampleHeaders: ['studentCode', 'studentName', 'academicEmail', 'status'],
    sampleData: [
      {
        studentCode: '2024001',
        studentName: 'أحمد محمود علي',
        academicEmail: 's2024001@institute.edu',
        status: 'active',
      },
    ],
    fields: [
      { ar: 'كود الطالب', en: 'studentCode', required: true },
      { ar: 'الاسم', en: 'studentName' },
      { ar: 'البريد الأكاديمي', en: 'academicEmail', required: true },
      { ar: 'الحالة', en: 'status', note: 'active / inactive' },
    ],
  },
];

function parseXmlSpreadsheet(xmlText: string): { headers: string[]; rows: string[][] } | null {
  try {
    if (!xmlText.includes('<Workbook') && !xmlText.includes('<?xml')) {
      return null;
    }
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'text/xml');
    const parserError = doc.getElementsByTagName('parsererror');
    if (parserError.length > 0) return null;

    const rowElements = Array.from(doc.getElementsByTagName('Row'));
    if (!rowElements.length) return null;

    const parsedRows: string[][] = [];
    for (const rowEl of rowElements) {
      const cellElements = Array.from(rowEl.getElementsByTagName('Cell'));
      const rowData = cellElements.map((c) => {
        const dataEl = c.getElementsByTagName('Data')[0];
        return (dataEl?.textContent ?? c.textContent ?? '').trim();
      });
      if (rowData.some((val) => val.length > 0)) {
        parsedRows.push(rowData);
      }
    }

    if (parsedRows.length === 0) return null;
    return {
      headers: parsedRows[0],
      rows: parsedRows.slice(1),
    };
  } catch {
    return null;
  }
}

function UploadsPageContent() {
  const params = useParams();
  const locale = (params?.locale as string) || 'ar';
  const isAr = locale === 'ar';

  const t = useTranslations('uploads');

  // Form State
  const [uploadType, setUploadType] = useState('students');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // File Preview state
  const [preview, setPreview] = useState<{
    headers: string[];
    rows: string[][];
    totalRows: number;
  } | null>(null);
  const [isParsingPreview, setIsParsingPreview] = useState(false);
  const [previewTab, setPreviewTab] = useState<'summary' | 'table'>('summary');

  // Result state
  const [result, setResult] = useState<UploadResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [showErrorsList, setShowErrorsList] = useState(false);

  // Data Wipe / Reset State
  const [wipeDialogOpen, setWipeDialogOpen] = useState(false);
  const [selectedWipeTarget, setSelectedWipeTarget] = useState<'students' | 'grades' | 'attendance' | 'all'>('grades');
  const [wipeConfirmText, setWipeConfirmText] = useState('');

  const wipeSummaryQuery = useQuery({
    queryKey: ['admin-uploads-wipe-summary'],
    queryFn: async () => {
      const res = await api.get<{
        studentsCount: number;
        gradesCount: number;
        attendanceCount: number;
        registrationsCount: number;
        advisingCasesCount: number;
        quizzesCount: number;
      }>('/admin/uploads/wipe-summary');
      return res.data;
    },
  });

  const wipeMutation = useMutation({
    mutationFn: async (target: 'students' | 'grades' | 'attendance' | 'all') => {
      const res = await api.post('/admin/uploads/wipe', { target });
      return res.data;
    },
    onSuccess: (_, target) => {
      toast.success(
        isAr
          ? 'تم مسح البيانات المحددة بنجاح ويمكن الآن بدء رفع البيانات النظيفة'
          : `Data wiped successfully for ${target}. Ready for fresh upload.`,
      );
      void wipeSummaryQuery.refetch();
      setWipeDialogOpen(false);
      setWipeConfirmText('');
    },
    onError: (err: unknown) => {
      toast.error(getApiErrorMessage(err, isAr ? 'فشل مسح البيانات' : 'Failed to wipe data'));
    },
  });

  const activeConfig = useMemo(
    () => UPLOAD_CONFIGS.find((c) => c.id === uploadType) || UPLOAD_CONFIGS[0],
    [uploadType]
  );

  const headerMatchInfo = useMemo(() => {
    if (!preview || !preview.headers.length) return null;
    const normalizedParsed = preview.headers.map((h) =>
      h.toLowerCase().trim().replace(/[\s_\-]/g, ''),
    );

    const matched: string[] = [];
    const missing: string[] = [];

    activeConfig.sampleHeaders.forEach((col) => {
      const normCol = col.toLowerCase().trim().replace(/[\s_\-]/g, '');
      const isFound = normalizedParsed.some(
        (ph) => ph === normCol || ph.includes(normCol) || normCol.includes(ph),
      );
      if (isFound) matched.push(col);
      else missing.push(col);
    });

    return { matched, missing };
  }, [preview, activeConfig.sampleHeaders]);

  const parseFilePreview = async (selectedFile: File) => {
    setIsParsingPreview(true);
    try {
      const isExcelByName = /\.(xlsx|xls|xlsb|ods)$/i.test(selectedFile.name);
      const buffer = await selectedFile.arrayBuffer();
      const firstBytes = new Uint8Array(buffer.slice(0, 4));
      const isZipArchive = firstBytes[0] === 0x50 && firstBytes[1] === 0x4b; // 'PK' magic bytes

      // 1. Try reading binary Excel or Zip archive via read-excel-file
      if (isExcelByName || isZipArchive) {
        try {
          const rows = await readXlsxFile(selectedFile);
          if (rows && rows.length > 0) {
            const headers = rows[0].map((h) => String(h ?? '').trim());
            const dataRows = rows.slice(1).map((r) =>
              r.map((cell) => (cell === null || cell === undefined ? '' : String(cell).trim())),
            );
            setPreview({
              headers,
              rows: dataRows.slice(0, 10),
              totalRows: dataRows.length,
            });
            return;
          }
        } catch {
          // If readXlsxFile fails (e.g. password-protected or XML disguised as xls), proceed to XML check
        }
      }

      // 2. Try XML Spreadsheet 2003 (only if text is real XML, NOT a binary zip)
      const text = new TextDecoder('utf-8').decode(buffer);
      if ((text.includes('<Workbook') || text.includes('<?xml')) && !text.startsWith('PK')) {
        const xmlParsed = parseXmlSpreadsheet(text);
        if (xmlParsed && xmlParsed.headers.length > 0) {
          setPreview({
            headers: xmlParsed.headers,
            rows: xmlParsed.rows.slice(0, 10),
            totalRows: xmlParsed.rows.length,
          });
          return;
        }
      }

      // 3. Fallback for plain text CSV/TSV only if not binary
      if (!isZipArchive && !text.startsWith('PK')) {
        const lines = text
          .split(/\r?\n/)
          .filter((l) => l.trim().length > 0 && !l.trim().startsWith('<?xml') && !l.trim().startsWith('<Workbook'));
        if (lines.length > 0) {
          const headers = lines[0]
            .split(/[,;\t]/)
            .map((h) => h.trim().replace(/^["']|["']$/g, ''));
          const dataRows = lines
            .slice(1)
            .map((line) =>
              line.split(/[,;\t]/).map((c) => c.trim().replace(/^["']|["']$/g, '')),
            );
          setPreview({
            headers,
            rows: dataRows.slice(0, 10),
            totalRows: dataRows.length,
          });
          return;
        }
      }

      setPreview(null);
    } catch {
      setPreview(null);
    } finally {
      setIsParsingPreview(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (/\.(xlsx|xls|csv)$/i.test(droppedFile.name)) {
        setFile(droppedFile);
        setErrorMsg('');
        setResult(null);
        void parseFilePreview(droppedFile);
      } else {
        setErrorMsg(isAr ? 'يرجى اختيار ملف صالح بصيغة xlsx أو xls أو csv' : 'Please choose a valid xlsx, xls, or csv file');
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      setFile(selected);
      setErrorMsg('');
      setResult(null);
      void parseFilePreview(selected);
    }
  };

  const handleDownloadTemplate = () => {
    const fileName = `template_${activeConfig.id}_${new Date().toISOString().slice(0, 10)}`;
    downloadExcel(activeConfig.sampleData, activeConfig.sampleHeaders, fileName);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setErrorMsg('');
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', uploadType);

    try {
      const res = await api.post<UploadResult>('/admin/uploads', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      setResult(res.data);
    } catch (err: unknown) {
      setErrorMsg(getApiErrorMessage(err, isAr ? 'فشلت عملية رفع الملف' : 'Upload failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fade-in space-y-6 p-2 md:p-6" dir={isAr ? 'rtl' : 'ltr'}>
      {/* Header Banner */}
      <PageTitleBanner
        title={t('title')}
        icon={<UploadCloud className="h-6 w-6 text-primary" />}
        subtitle={
          isAr
            ? 'استيراد وتحديث البيانات عبر ملفات Excel و CSV مع التحقق التلقائي ومعالجة الأخطاء.'
            : 'Import and batch-update databases directly from Excel workbooks (*.xlsx, *.xls, *.csv).'
        }
      >
        <Button
          variant="outline"
          onClick={handleDownloadTemplate}
          className="cursor-pointer gap-2 rounded-squircle border border-border/80 bg-card hover:border-primary/40 hover:bg-primary/10 hover:text-primary transition-all text-xs font-semibold"
        >
          <Download className="h-4 w-4 text-primary" />
          {isAr ? `تحميل نموذج (${activeConfig.titleAr})` : `Download Template (${activeConfig.titleEn})`}
        </Button>
      </PageTitleBanner>

      {/* SECTION 1: VISUAL TYPE SELECTOR CARDS */}
      <div className="space-y-2">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          {isAr ? 'اختر نوع البيانات المراد استيرادها' : 'Select Data Category'}
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {UPLOAD_CONFIGS.map((cfg) => {
            const isSelected = uploadType === cfg.id;
            return (
              <button
                key={cfg.id}
                type="button"
                onClick={() => {
                  setUploadType(cfg.id);
                  setFile(null);
                  setErrorMsg('');
                  setResult(null);
                }}
                className={cn(
                  'group relative flex flex-col items-start justify-between rounded-xl border p-4 text-start transition-all duration-200 cursor-pointer shadow-sm',
                  isSelected
                    ? 'border-primary/80 bg-primary/10 shadow-[var(--shadow-glow)] ring-1 ring-primary/40'
                    : 'border-border/70 bg-card/80 hover:border-primary/40 hover:bg-card-hover/80'
                )}
              >
                <div className="flex w-full items-center justify-between">
                  <div
                    className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-squircle transition-colors',
                      isSelected
                        ? 'bg-primary text-white'
                        : 'bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white'
                    )}
                  >
                    {cfg.icon}
                  </div>
                  {isSelected && (
                    <span className="flex h-2 w-2 rounded-full bg-primary ring-4 ring-primary/20" />
                  )}
                </div>

                <div className="mt-3 w-full">
                  <h4 className={cn('text-sm font-bold', isSelected ? 'text-primary' : 'text-foreground')}>
                    {isAr ? cfg.titleAr : cfg.titleEn}
                  </h4>
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                    {isAr ? cfg.descAr : cfg.descEn}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* SECTION 2: MAIN UPLOAD WORKSPACE (2 COLUMNS) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Column: Dropzone & Actions */}
        <div className="lg:col-span-2 space-y-6">
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-border/70 bg-card/90 p-6 shadow-[var(--shadow-glow)] backdrop-blur space-y-6"
          >
            <div className="flex items-center justify-between border-b border-border/50 pb-4">
              <div>
                <h4 className="font-bold text-foreground text-base flex items-center gap-2">
                  <UploadCloud className="h-5 w-5 text-primary" />
                  {isAr ? `رفع ملف ${activeConfig.titleAr}` : `Upload ${activeConfig.titleEn} File`}
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isAr
                    ? 'الملفات المدعومة: Excel (*.xlsx, *.xls) أو CSV بحد أقصى 25 ميجابايت'
                    : 'Accepted formats: Excel (*.xlsx, *.xls) or CSV up to 25MB'}
                </p>
              </div>

              {file && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setFile(null);
                    setErrorMsg('');
                  }}
                  className="text-xs text-muted-foreground hover:text-danger cursor-pointer gap-1"
                >
                  <X className="h-3.5 w-3.5" />
                  {isAr ? 'إلغاء الملف' : 'Clear file'}
                </Button>
              )}
            </div>

            {/* Dropzone */}
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={() => document.getElementById('excelFileInput')?.click()}
              className={cn(
                'group relative border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all duration-300 min-h-[220px]',
                dragActive
                  ? 'border-primary bg-primary/10 shadow-[var(--shadow-glow)] scale-[1.01]'
                  : file
                    ? 'border-primary/60 bg-primary/5'
                    : 'border-border/80 hover:border-primary/50 bg-surface/30 hover:bg-surface/50'
              )}
            >
              <input
                id="excelFileInput"
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="hidden"
              />

              {file ? (
                <div className="flex flex-col items-center space-y-3 text-center animate-fade-in">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15 text-primary shadow-sm">
                    <FileCheck className="h-8 w-8" />
                  </div>
                  <div>
                    <p className="text-foreground font-bold text-sm break-all">{file.name}</p>
                    <div className="mt-1 flex items-center justify-center gap-2">
                      <span className="rounded-md bg-surface px-2 py-0.5 text-xs font-mono text-muted-foreground border border-border">
                        {(file.size / 1024).toFixed(1)} KB
                      </span>
                      <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary border border-primary/20">
                        {file.name.split('.').pop()?.toUpperCase()}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {isAr ? 'انقر لاستبدال الملف المحدد' : 'Click to replace selected file'}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center space-y-3 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface text-muted-foreground group-hover:bg-primary/15 group-hover:text-primary transition-all">
                    <UploadCloud className="h-8 w-8" />
                  </div>
                  <div>
                    <p className="text-foreground text-sm font-bold">
                      {isAr ? 'اسحب ملف Excel أو CSV وأفلته هنا' : 'Drag and drop your spreadsheet here'}
                    </p>
                    <p className="text-muted-foreground text-xs mt-1">
                      {isAr ? 'أو انقر للاختيار من جهازك' : 'or click to browse from your computer'}
                    </p>
                  </div>
                  <div className="flex gap-1.5 pt-1">
                    <span className="text-[11px] font-mono text-muted-foreground bg-surface/70 px-2 py-0.5 rounded border border-border/60">.XLSX</span>
                    <span className="text-[11px] font-mono text-muted-foreground bg-surface/70 px-2 py-0.5 rounded border border-border/60">.XLS</span>
                    <span className="text-[11px] font-mono text-muted-foreground bg-surface/70 px-2 py-0.5 rounded border border-border/60">.CSV</span>
                  </div>
                </div>
              )}
            </div>

            {/* File Details & Data Preview Tabs */}
            {file && (
              <div className="rounded-xl border border-border/70 bg-surface/30 p-4 space-y-3 animate-fade-in">
                <div className="flex items-center justify-between border-b border-border/60 pb-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPreviewTab('summary')}
                      className={cn(
                        'px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer',
                        previewTab === 'summary'
                          ? 'bg-primary text-white shadow-sm'
                          : 'text-muted-foreground hover:bg-surface'
                      )}
                    >
                      {isAr ? 'ملخص والتحقق من الأعمدة' : 'Columns & Validation'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewTab('table')}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer',
                        previewTab === 'table'
                          ? 'bg-primary text-white shadow-sm'
                          : 'text-muted-foreground hover:bg-surface'
                      )}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      {isAr ? 'معاينة البيانات' : 'Data Preview'}
                      {preview && (
                        <span className="ms-1 rounded-full bg-black/20 px-1.5 py-0.5 text-[10px]">
                          {preview.totalRows}
                        </span>
                      )}
                    </button>
                  </div>

                  {isParsingPreview && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                      {isAr ? 'تحليل الملف...' : 'Parsing file...'}
                    </div>
                  )}
                </div>

                {previewTab === 'summary' && (
                  <div className="space-y-3 text-xs">
                    <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
                      <span>
                        {isAr ? 'إجمالي الصفوف المقروءة:' : 'Total detected rows:'}{' '}
                        <strong className="text-foreground">{preview ? preview.totalRows : '...'}</strong>
                      </span>
                      <span>•</span>
                      <span>
                        {isAr ? 'الأعمدة المطابقة:' : 'Matched columns:'}{' '}
                        <strong className="text-success">{headerMatchInfo?.matched.length ?? 0}</strong> /{' '}
                        {activeConfig.sampleHeaders.length}
                      </span>
                    </div>

                    {headerMatchInfo && (
                      <div className="space-y-2">
                        {headerMatchInfo.matched.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-muted-foreground text-[11px]">{isAr ? 'الأعمدة المتطابقة:' : 'Matched:'}</span>
                            {headerMatchInfo.matched.map((col) => (
                              <span
                                key={col}
                                className="inline-flex items-center gap-1 rounded bg-success/10 border border-success/30 px-2 py-0.5 text-[11px] font-mono font-medium text-success"
                              >
                                <Check className="h-3 w-3 shrink-0" />
                                {col}
                              </span>
                            ))}
                          </div>
                        )}
                        {headerMatchInfo.missing.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-muted-foreground text-[11px]">{isAr ? 'أعمدة متوقعة مفقودة:' : 'Missing:'}</span>
                            {headerMatchInfo.missing.map((col) => (
                              <span
                                key={col}
                                className="rounded bg-warning/10 border border-warning/30 px-2 py-0.5 text-[11px] font-mono font-medium text-warning"
                              >
                                ! {col}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {previewTab === 'table' && (
                  preview && preview.rows.length > 0 ? (
                    <div className="overflow-x-auto max-h-56 rounded-lg border border-border/60 bg-card">
                      <table className="w-full text-xs text-start">
                        <thead className="bg-surface sticky top-0 border-b border-border text-foreground font-semibold">
                          <tr>
                            <th className="p-2 border-r border-border/50 text-center w-10">#</th>
                            {preview.headers.map((h, i) => (
                              <th key={`${h}-${i}`} className="p-2 border-r border-border/50 font-mono text-start">
                                {h || `Col ${i + 1}`}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40 font-mono">
                          {preview.rows.map((row, rIdx) => (
                            <tr key={`r-${rIdx}`} className="hover:bg-surface/50">
                              <td className="p-2 text-center text-muted-foreground border-r border-border/50">
                                {rIdx + 1}
                              </td>
                              {row.map((cell, cIdx) => (
                                <td key={`c-${rIdx}-${cIdx}`} className="p-2 truncate max-w-[160px] border-r border-border/50">
                                  {cell || <span className="text-muted-foreground/40 italic">-</span>}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground py-2 text-center">
                      {isAr ? 'لا توجد بيانات للمعاينة أو الملف فارغ' : 'No preview data available or file is empty'}
                    </p>
                  )
                )}
              </div>
            )}

            {errorMsg && (
              <div className="rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger flex items-start gap-3 animate-fade-in">
                <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1 font-medium">{errorMsg}</div>
              </div>
            )}

            {/* Submit CTA */}
            <Button
              type="submit"
              disabled={loading || !file}
              className="w-full h-12 rounded-xl bg-primary hover:bg-primary-hover disabled:bg-primary/40 text-white font-bold transition-all shadow-md shadow-primary/20 text-sm gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>{isAr ? 'جاري التحقق والاستيراد...' : 'Processing and importing...'}</span>
                </>
              ) : (
                <>
                  <FileSpreadsheet className="h-5 w-5" />
                  <span>{isAr ? `بدء استيراد ملف (${activeConfig.titleAr})` : `Start Import (${activeConfig.titleEn})`}</span>
                </>
              )}
            </Button>
          </form>

          {/* Result Feedback Card */}
          {result && (
            <div className="rounded-2xl border border-border/70 bg-card/90 p-6 shadow-[var(--shadow-glow)] space-y-4 animate-fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/50 pb-4">
                <div className="flex items-center gap-3">
                  {result.failedCount === 0 ? (
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-success/15 text-success">
                      <CheckCircle className="h-6 w-6" />
                    </div>
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-warning/15 text-warning">
                      <AlertTriangle className="h-6 w-6" />
                    </div>
                  )}
                  <div>
                    <h4 className="font-bold text-foreground text-base">
                      {result.failedCount === 0
                        ? isAr
                          ? 'اكتمل الاستيراد بنجاح تام'
                          : 'Import Completed Successfully'
                        : isAr
                          ? 'اكتمل الاستيراد مع وجود بعض الأخطاء'
                          : 'Import Finished with Warnings'}
                    </h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {isAr
                        ? `تمت معالجة البيانات وتحديث النظام في تاريخ ${new Date().toLocaleTimeString('ar-EG')}`
                        : `Processed records at ${new Date().toLocaleTimeString()}`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="rounded-lg bg-success/10 border border-success/30 px-3 py-1 text-xs font-bold text-success">
                    {result.successCount} {isAr ? 'ناجح' : 'Passed'}
                  </span>
                  {result.failedCount > 0 && (
                    <span className="rounded-lg bg-danger/10 border border-danger/30 px-3 py-1 text-xs font-bold text-danger">
                      {result.failedCount} {isAr ? 'فاشل' : 'Failed'}
                    </span>
                  )}
                </div>
              </div>

              {/* Error log details */}
              {result.failedCount > 0 && (
                <div className="rounded-xl border border-border/80 overflow-hidden bg-surface/30">
                  <button
                    type="button"
                    onClick={() => setShowErrorsList(!showErrorsList)}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-foreground hover:bg-surface/50 transition-colors cursor-pointer"
                  >
                    <span className="text-danger flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      {isAr ? `عرض تفاصيل الأخطاء والسطور (${result.errors.length})` : `View Error Logs (${result.errors.length})`}
                    </span>
                    {showErrorsList ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>

                  {showErrorsList && (
                    <div className="p-4 border-t border-border/80 bg-black/20 text-danger text-xs font-mono space-y-2 max-h-64 overflow-y-auto">
                      {result.errors.map((err, idx) => (
                        <div key={idx} className="flex gap-2 items-start">
                          <span className="text-danger/60 font-bold shrink-0">#{idx + 1}</span>
                          <span className="leading-5">{err}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Danger Zone: Data Reset & Wipe Section (Directly under Upload Form) */}
          <div className="rounded-2xl border border-red-500/30 bg-gradient-to-br from-red-950/20 via-background to-card p-5 shadow-sm space-y-4">
            <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 border-b border-red-500/20 pb-3.5">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-0.5 text-xs font-semibold text-red-400">
                  <AlertOctagon className="h-3.5 w-3.5" />
                  {isAr ? 'منطقة الخطر وإعادة التعيين' : 'Danger Zone: Data Reset & Purge'}
                </div>
                <h3 className="text-sm font-bold text-foreground">
                  {isAr ? 'مسح بيانات الطلاب والدرجات للبدء من جديد' : 'Wipe Student Records & Grades for Fresh Import'}
                </h3>
                <p className="text-xs text-muted-foreground max-w-xl leading-relaxed">
                  {isAr
                    ? 'تنظيف ومسح البيانات السابقة للطلاب أو الدرجات أو الحضور قبل رفع ملفات جديدة. (تبقى حسابات المشرفين والمقررات وإعدادات النظام محفوظة دائماً).'
                    : 'Purge previous student records, grades, or attendance before uploading fresh datasets. Admin accounts and courses remain protected.'}
                </p>
              </div>

              {/* Live Count Badges */}
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <div className="rounded-xl border border-border bg-surface/50 px-2.5 py-1.5 text-center min-w-[62px]">
                  <p className="text-[10px] text-muted-foreground">{isAr ? 'الطلاب' : 'Students'}</p>
                  <p className="font-mono text-xs font-bold text-foreground">
                    {wipeSummaryQuery.data?.studentsCount?.toLocaleString() ?? '-'}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-surface/50 px-2.5 py-1.5 text-center min-w-[62px]">
                  <p className="text-[10px] text-muted-foreground">{isAr ? 'الدرجات' : 'Grades'}</p>
                  <p className="font-mono text-xs font-bold text-foreground">
                    {wipeSummaryQuery.data?.gradesCount?.toLocaleString() ?? '-'}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-surface/50 px-2.5 py-1.5 text-center min-w-[62px]">
                  <p className="text-[10px] text-muted-foreground">{isAr ? 'الحضور' : 'Attendance'}</p>
                  <p className="font-mono text-xs font-bold text-foreground">
                    {wipeSummaryQuery.data?.attendanceCount?.toLocaleString() ?? '-'}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-surface/50 px-2.5 py-1.5 text-center min-w-[62px]">
                  <p className="text-[10px] text-muted-foreground">{isAr ? 'التسجيلات' : 'Registrations'}</p>
                  <p className="font-mono text-xs font-bold text-foreground">
                    {wipeSummaryQuery.data?.registrationsCount?.toLocaleString() ?? '-'}
                  </p>
                </div>
              </div>
            </div>

            {/* 3 Reset Action Cards with Symmetric Heights */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* 1. Reset Grades */}
              <div className="rounded-xl border border-amber-500/30 bg-card/60 p-3.5 space-y-3 flex flex-col justify-between h-full hover:border-amber-500/50 transition-colors">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-amber-400 font-semibold text-xs">
                    <RotateCcw className="h-3.5 w-3.5 shrink-0" />
                    <span>{isAr ? 'مسح سجلات الدرجات فقط' : 'Wipe Grades & Quizzes Only'}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed min-h-[44px]">
                    {isAr
                      ? 'حذف كافة سجلات الدرجات والاختبارات القصيرة مع الحفاظ على حسابات الطلاب، لتتمكن من إعادة رفع ملف الدرجات بدون تداخل.'
                      : 'Deletes all student grade and quiz entries while preserving student profiles, ready for a fresh grades upload.'}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedWipeTarget('grades');
                    setWipeConfirmText('');
                    setWipeDialogOpen(true);
                  }}
                  className="w-full border-amber-500/40 text-amber-400 hover:bg-amber-500/10 hover:border-amber-500 text-xs font-semibold gap-1.5 transition-colors cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {isAr ? 'مسح جميع الدرجات' : 'Purge All Grades'}
                </Button>
              </div>

              {/* 2. Reset Attendance */}
              <div className="rounded-xl border border-amber-500/30 bg-card/60 p-3.5 space-y-3 flex flex-col justify-between h-full hover:border-amber-500/50 transition-colors">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-amber-400 font-semibold text-xs">
                    <RotateCcw className="h-3.5 w-3.5 shrink-0" />
                    <span>{isAr ? 'مسح سجلات الحضور فقط' : 'Wipe Attendance Only'}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed min-h-[44px]">
                    {isAr
                      ? 'حذف سجلات الحضور والغياب لجميع الطلاب لإعادة رفع كشوف حضور نظيفة ومحدثة.'
                      : 'Deletes all student attendance and absence records, allowing fresh attendance sheets to be uploaded.'}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedWipeTarget('attendance');
                    setWipeConfirmText('');
                    setWipeDialogOpen(true);
                  }}
                  className="w-full border-amber-500/40 text-amber-400 hover:bg-amber-500/10 hover:border-amber-500 text-xs font-semibold gap-1.5 transition-colors cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {isAr ? 'مسح سجلات الحضور' : 'Purge All Attendance'}
                </Button>
              </div>

              {/* 3. Full Student Wipe (Red Outline Style Matching Yellow Cards) */}
              <div className="rounded-xl border border-red-500/40 bg-card/60 p-3.5 space-y-3 flex flex-col justify-between h-full hover:border-red-500/60 transition-colors">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-red-400 font-semibold text-xs">
                    <AlertOctagon className="h-3.5 w-3.5 shrink-0" />
                    <span>{isAr ? 'مسح شامل لجميع بيانات الطلاب' : 'Full Student Accounts & Data Reset'}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed min-h-[44px]">
                    {isAr
                      ? 'حذف كامل حسابات الطلاب والملفات الأكاديمية والدرجات والتسجيلات للبدء من نقطة الصفر باستيراد دفعة جديدة.'
                      : 'Permanently deletes all student accounts, profiles, grades, and registrations for a complete fresh start.'}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedWipeTarget('students');
                    setWipeConfirmText('');
                    setWipeDialogOpen(true);
                  }}
                  className="w-full border-red-500/40 text-red-400 hover:bg-red-500/10 hover:border-red-500 text-xs font-semibold gap-1.5 transition-colors cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {isAr ? 'مسح شامل للطلاب والدرجات' : 'Purge All Students & Data'}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Side Column: Expected Schema & Guidance */}
        <div className="space-y-6">
          {/* Schema Card */}
          <div className="rounded-2xl border border-border/70 bg-card/90 p-5 shadow-[var(--shadow-glow)] space-y-4">
            <div className="flex items-center justify-between border-b border-border/50 pb-3">
              <h4 className="font-bold text-foreground text-sm flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-primary" />
                {isAr ? 'مخطط الأعمدة المطلوب' : 'Required Columns'}
              </h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDownloadTemplate}
                className="h-8 text-xs text-primary hover:bg-primary/10 cursor-pointer gap-1 font-semibold"
              >
                <Download className="h-3.5 w-3.5" />
                {isAr ? 'قالب' : 'Template'}
              </Button>
            </div>

            <p className="text-xs text-muted-foreground leading-5">
              {isAr
                ? 'يجب أن يحتوي ملفك على أسماء الأعمدة التالية (يقبل النظام العناوين العربية أو الإنجليزية):'
                : 'Your file columns must match either of the Arabic or English header names:'}
            </p>

            <div className="space-y-2 max-h-[340px] overflow-y-auto pe-1">
              {activeConfig.fields.map((field, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border border-border/60 bg-surface/30 p-2.5 text-xs flex flex-col gap-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground">{field.ar}</span>
                    {field.required ? (
                      <span className="text-[10px] rounded bg-danger/10 text-danger border border-danger/20 px-1.5 py-0.2 font-medium">
                        {isAr ? 'مطلوب' : 'Required'}
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">
                        {isAr ? 'اختياري' : 'Optional'}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground font-mono text-[11px]">
                    <span>{field.en}</span>
                    {field.note && <span className="text-[10px] text-primary">{field.note}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Best Practices Guidance Card */}
          <div className="rounded-2xl border border-border/70 bg-card/90 p-5 shadow-[var(--shadow-glow)] space-y-3">
            <h4 className="font-bold text-foreground text-sm flex items-center gap-2">
              <Info className="h-4 w-4 text-primary" />
              {isAr ? 'إرشادات الاستيراد الناجح' : 'Import Guidelines'}
            </h4>
            <ul className="space-y-2 text-xs text-muted-foreground leading-5">
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold">•</span>
                <span>{isAr ? 'تأكد من عدم وجود صفوف مدمجة (Merged Cells) في ورقة العمل الأولى.' : 'Ensure no merged cells exist in the first worksheet.'}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold">•</span>
                <span>{isAr ? 'يتم تحديث السجلات الموجودة تلقائياً بناءً على الكود المحدد دون تكرار.' : 'Existing rows are safely updated based on unique codes.'}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold">•</span>
                <span>{isAr ? 'احرص على استخدام ترميز UTF-8 لتجنب مشاكل تشوه النصوص العربية.' : 'Use UTF-8 encoding to preserve Arabic character typography.'}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Danger Zone Confirmation Dialog */}
      <Dialog open={wipeDialogOpen} onOpenChange={setWipeDialogOpen}>
        <DialogContent className="max-w-md" dir={isAr ? 'rtl' : 'ltr'}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive text-base font-bold">
              <AlertOctagon className="h-5 w-5" />
              {selectedWipeTarget === 'grades'
                ? isAr
                  ? 'تأكيد مسح سجلات الدرجات والاختبارات'
                  : 'Confirm Wipe: Grades & Quizzes'
                : selectedWipeTarget === 'attendance'
                  ? isAr
                    ? 'تأكيد مسح سجلات الحضور والغياب'
                    : 'Confirm Wipe: Attendance Records'
                  : isAr
                    ? 'تأكيد المسح الشامل لبيانات وحسابات الطلاب'
                    : 'Confirm Full Reset: All Student Accounts & Data'}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground leading-relaxed pt-1">
              {selectedWipeTarget === 'grades'
                ? isAr
                  ? 'سيتم حذف جميع سجلات الدرجات والاختبارات القصيرة نهائياً مع الحفاظ على حسابات الطلاب والملفات الأكاديمية.'
                  : 'All student grades and quiz scores will be permanently deleted while preserving student profiles.'
                : selectedWipeTarget === 'attendance'
                  ? isAr
                    ? 'سيتم حذف جميع سجلات الحضور والغياب نهائياً لجميع الطلاب لإعادة رفع كشوف حضور جديدة.'
                    : 'All attendance records will be permanently deleted.'
                  : isAr
                    ? 'تحذير شديد الخطورة: سيتم حذف جميع حسابات الطلاب وملفاتهم الأكاديمية ودرجاتهم وسجلات تسجيل المواد بالكامل. ستبقى حسابات المشرفين والمقررات سالمة.'
                    : 'Extreme caution: All student accounts, academic profiles, grades, and registrations will be deleted.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <p className="text-xs text-foreground font-semibold">
              {selectedWipeTarget === 'attendance'
                ? isAr
                  ? 'لتأكيد مسح الحضور، يرجى كتابة "DELETE ATTENDANCE" أو "حذف الحضور" أدناه:'
                  : 'To confirm, please type "DELETE ATTENDANCE" below:'
                : selectedWipeTarget === 'grades'
                  ? isAr
                    ? 'لتأكيد مسح الدرجات، يرجى كتابة "DELETE GRADES" أو "حذف الدرجات" أدناه:'
                    : 'To confirm, please type "DELETE GRADES" below:'
                  : isAr
                    ? 'لتأكيد المسح الشامل، يرجى كتابة "DELETE ALL DATA" أو "حذف شامل" أدناه:'
                    : 'To confirm full wipe, please type "DELETE ALL DATA" below:'}
            </p>
            <Input
              value={wipeConfirmText}
              onChange={(e) => setWipeConfirmText(e.target.value)}
              placeholder={
                selectedWipeTarget === 'attendance'
                  ? 'Type DELETE ATTENDANCE'
                  : selectedWipeTarget === 'grades'
                    ? 'Type DELETE GRADES'
                    : 'Type DELETE ALL DATA'
              }
              className="font-mono text-sm border-destructive/50 focus-visible:ring-destructive"
              autoFocus
            />
          </div>

          <DialogFooter className="pt-2 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setWipeDialogOpen(false)}
              className="cursor-pointer"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={
                wipeMutation.isPending ||
                (() => {
                  const norm = wipeConfirmText.trim().toUpperCase();
                  const raw = wipeConfirmText.trim();
                  if (norm === 'DELETE' || raw === 'مسح') return false;
                  if (selectedWipeTarget === 'attendance') {
                    return !(
                      norm === 'DELETE ATTENDANCE' ||
                      norm === 'WIPE ATTENDANCE' ||
                      norm === 'DELETE_ATTENDANCE' ||
                      raw === 'حذف الحضور'
                    );
                  }
                  if (selectedWipeTarget === 'grades') {
                    return !(
                      norm === 'DELETE GRADES' ||
                      norm === 'WIPE GRADES' ||
                      norm === 'WIPE GRADES & QUIZZES' ||
                      norm === 'DELETE_GRADES' ||
                      raw === 'حذف الدرجات'
                    );
                  }
                  if (selectedWipeTarget === 'students') {
                    return !(
                      norm === 'DELETE ALL DATA' ||
                      norm === 'DELETE ALL' ||
                      norm === 'DELETE STUDENTS' ||
                      norm === 'DELETE_STUDENTS' ||
                      raw === 'حذف شامل'
                    );
                  }
                  return true;
                })()
              }
              onClick={() => wipeMutation.mutate(selectedWipeTarget)}
              className="gap-2 font-bold cursor-pointer"
            >
              <Trash2 className="h-4 w-4" />
              {wipeMutation.isPending
                ? isAr
                  ? 'جاري المسح...'
                  : 'Wiping...'
                : isAr
                  ? 'تأكيد المسح النهائي'
                  : 'Confirm Permanent Wipe'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function UploadsPage() {
  return (
    <Suspense fallback={<PageSkeletonLoader />}>
      <UploadsPageContent />
    </Suspense>
  );
}
