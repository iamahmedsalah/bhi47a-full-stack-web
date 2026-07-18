'use client';

import React, { useState, Suspense } from 'react';
import { useTranslations } from 'next-intl';
import api, { getApiErrorMessage } from '@/lib/api';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle,
  AlertTriangle,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

import { PageTitleBanner } from '@/components/ui/page-title-banner';
import { PageSkeletonLoader } from '@/components/ui/page-suspense-fallback';
import { CustomDropdown } from '@/components/ui/custom-dropdown';

interface UploadResult {
  success: boolean;
  successCount: number;
  failedCount: number;
  errors: string[];
}

function UploadsPageContent() {
  const t = useTranslations('uploads');
  const tCommon = useTranslations('common');

  // Form State
  const [uploadType, setUploadType] = useState('students');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // Result state
  const [result, setResult] = useState<UploadResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [showErrorsList, setShowErrorsList] = useState(false);
  const uploadTypeOptions = [
    { value: 'students', label: t('type_students') },
    { value: 'courses', label: t('type_courses') },
    { value: 'grades', label: t('type_grades') },
    { value: 'quizzes', label: t('type_quizzes') },
    { value: 'attendance', label: t('type_attendance') },
    { value: 'academic-emails', label: t('type_academic_emails') },
  ];

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
      } else {
        setErrorMsg('يرجى اختيار ملف صالح بصيغة xlsx أو xls أو csv');
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
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
      setErrorMsg(getApiErrorMessage(err, 'Upload failed'));
    } finally {
      setLoading(false);
    }
  };

  // Expected headers based on selected upload type
  const getExpectedHeaders = () => {
    switch (uploadType) {
      case 'students':
        return [
          { ar: 'كود الطالب', en: 'studentCode' },
          { ar: 'الاسم بالكامل', en: 'fullName' },
          { ar: 'الرقم القومي', en: 'nationalId' },
          { ar: 'المستوى (1-4)', en: 'level' },
          { ar: 'القسم العلمي', en: 'department' },
          { ar: 'رقم الجلوس', en: 'seatNumber' },
          { ar: 'المجموعة', en: 'group' },
          { ar: 'السكشن', en: 'section' },
          { ar: 'إلزام تغيير كلمة المرور', en: 'mustChangePassword' },
        ];
      case 'courses':
        return [
          { ar: 'اسم المادة', en: 'courseName' },
          { ar: 'كود المادة', en: 'courseCode' },
          { ar: 'المستوى الدراسي', en: 'level' },
          { ar: 'الفصل الدراسي', en: 'semester' },
          { ar: 'القسم العلمي', en: 'department' },
          { ar: 'الساعات المعتمدة', en: 'creditHours' },
          { ar: 'المتطلبات السابقة', en: 'prerequisites' },
          { ar: 'المتطلبات المتزامنة', en: 'coRequisites' },
          { ar: 'المقررات المعادلة', en: 'equivalentCourses' },
          { ar: 'فصول الطرح', en: 'offeredTerms' },
          { ar: 'نوع المقرر', en: 'type' },
          { ar: 'الفصل المقترح', en: 'recommendedSemester' },
          { ar: 'الحد الأدنى للمعدل', en: 'minimumGpa' },
        ];
      case 'grades':
        return [
          { ar: 'كود الطالب', en: 'studentCode' },
          { ar: 'كود المادة', en: 'courseCode' },
          { ar: 'نوع الامتحان (midterm / final)', en: 'examType' },
          { ar: 'الدرجة', en: 'grade' },
          { ar: 'الدرجة العظمى', en: 'maxGrade' },
          { ar: 'حالة الحضور (present / absent)', en: 'status' },
          { ar: 'السنة الدراسية', en: 'academicYear' },
          { ar: 'الفصل الدراسي', en: 'semester' },
        ];
      case 'quizzes':
        return [
          { ar: 'كود الطالب', en: 'studentCode' },
          { ar: 'كود المادة', en: 'courseCode' },
          { ar: 'رقم الكويز (1, 2, ...)', en: 'quizNumber' },
          { ar: 'عنوان الكويز', en: 'title' },
          { ar: 'الدرجة', en: 'grade' },
          { ar: 'الدرجة العظمى', en: 'maxGrade' },
          { ar: 'حالة الحضور', en: 'status' },
          { ar: 'السنة الدراسية', en: 'academicYear' },
          { ar: 'الفصل الدراسي', en: 'semester' },
        ];
      case 'attendance':
        return [
          { ar: 'كود الطالب', en: 'studentCode' },
          { ar: 'المحاضرات الكلية', en: 'totalLectures' },
          { ar: 'المحاضرات الحاضرة', en: 'attendedLectures' },
          { ar: 'المحاضرات الغائبة', en: 'absenceLectures' },
          { ar: 'السنة الدراسية', en: 'academicYear' },
          { ar: 'الفصل الدراسي', en: 'semester' },
        ];
      case 'academic-emails':
        return [
          { ar: 'كود الطالب', en: 'studentCode' },
          { ar: 'الاسم', en: 'studentName' },
          { ar: 'البريد الأكاديمي', en: 'academicEmail' },
          { ar: 'الحالة (active / inactive)', en: 'status' },
        ];
      default:
        return [];
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
      <PageTitleBanner
        title={t('title')}
        icon={<UploadCloud className="w-5 h-5" />}
        subtitle={
          tCommon('search') === 'Search...'
            ? 'Import databases directly from Excel workbooks'
            : 'استيراد البيانات من ملفات Excel'
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Main form */}
        <div className="md:col-span-2 space-y-6">
          <form onSubmit={handleSubmit} className="glass rounded-2xl border border-border p-6 space-y-6">
            {/* Selection Dropdown */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">{t('selectType')}</label>
              <CustomDropdown
                value={uploadType}
                options={uploadTypeOptions}
                ariaLabel={t('selectType')}
                className="w-full rounded-xl bg-input px-4 py-3 text-sm"
                onValueChange={(value) => {
                  setUploadType(value);
                  setResult(null);
                  setErrorMsg('');
                  setFile(null);
                }}
              />
            </div>

            {/* Dropzone */}
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={() => document.getElementById('excelFileInput')?.click()}
              className={`border-2 border-dashed rounded-squircle p-8 flex flex-col items-center justify-center cursor-pointer transition-all duration-300 ${
                dragActive
                  ? 'border-primary bg-primary/5'
                  : file
                  ? 'border-accent bg-accent/5'
                  : 'border-border hover:border-primary/50 bg-surface/30'
              }`}
            >
              <input
                id="excelFileInput"
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="hidden"
              />

              {file ? (
                <div className="flex flex-col items-center space-y-2">
                  <FileSpreadsheet className="w-12 h-12 text-accent" />
                  <p className="text-foreground font-semibold text-sm">{file.name}</p>
                  <p className="text-muted text-xs">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
              ) : (
                <div className="flex flex-col items-center space-y-2">
                  <UploadCloud className="w-12 h-12 text-muted" />
                  <p className="text-foreground text-sm font-semibold text-center">{t('dropzoneText')}</p>
                  <p className="text-muted text-xs">Excel or CSV (*.xlsx, *.xls, *.csv)</p>
                </div>
              )}
            </div>

            {errorMsg && (
              <div className="bg-danger/10 border border-danger/30 text-danger rounded-xl px-4 py-3 text-sm">
                {errorMsg}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !file}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary hover:bg-primary-hover disabled:bg-primary/50 text-white font-semibold transition-all duration-300 shadow-lg shadow-primary/20 active:scale-[0.98] text-sm"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {tCommon('loading')}
                </>
              ) : (
                <>
                  <FileSpreadsheet className="w-5 h-5" />
                  {tCommon('confirm')}
                </>
              )}
            </button>
          </form>

          {/* Results feedback */}
          {result && (
            <div className="glass rounded-2xl border border-border p-6 space-y-4">
              <div className="flex items-center gap-3">
                {result.failedCount === 0 ? (
                  <CheckCircle className="w-6 h-6 text-success shrink-0" />
                ) : (
                  <AlertTriangle className="w-6 h-6 text-warning shrink-0" />
                )}
                <div>
                  <h4 className="font-bold text-foreground text-sm">
                    {result.failedCount === 0 ? t('uploadSuccess') : t('uploadFailed')}
                  </h4>
                  <p className="text-muted text-xs">
                    {result.successCount} {tCommon('search') === 'Search...' ? 'imported successfully' : 'تم استيرادهم بنجاح'}
                    {result.failedCount > 0 && ` | ${result.failedCount} ${tCommon('search') === 'Search...' ? 'failed rows' : 'سطور فشل تحليلها'}`}
                  </p>
                </div>
              </div>

              {/* Errors List */}
              {result.failedCount > 0 && (
                <div className="border border-border rounded-xl overflow-hidden bg-surface/30">
                  <button
                    onClick={() => setShowErrorsList(!showErrorsList)}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-foreground hover:bg-surface/50 transition-colors"
                  >
                    <span>{tCommon('search') === 'Search...' ? 'View Error Logs' : 'سجل تفاصيل الأخطاء والسطور'}</span>
                    {showErrorsList ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {showErrorsList && (
                    <div className="p-4 border-t border-border bg-black/20 text-danger text-xs font-mono space-y-2 max-h-60 overflow-y-auto">
                      {result.errors.map((err, idx) => (
                        <div key={idx} className="flex gap-2">
                          <span>•</span>
                          <span className="leading-5">{err}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Expected Format side card */}
        <div className="space-y-6">
          <div className="glass rounded-2xl border border-border p-6 space-y-4">
            <h3 className="font-bold text-foreground text-sm flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-primary" />
              {t('templateHeaders')}
            </h3>
            <p className="text-muted text-xs leading-5">
              {tCommon('search') === 'Search...'
                ? 'Your spreadsheet columns must exactly match one of these names (either Arabic or English headers are accepted):'
                : 'يجب أن تطابق عناوين الأعمدة في ملف Excel أحد الأسماء التالية ليتم تصنيفها وتخزينها بالشكل الصحيح:'}
            </p>

            <div className="space-y-3 pt-2">
              {getExpectedHeaders().map((header, idx) => (
                <div key={idx} className="flex flex-col border-b border-border/40 pb-2 text-xs">
                  <span className="text-foreground font-semibold text-start">{header.ar}</span>
                  <span className="text-muted font-mono mt-0.5 text-start">{header.en}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
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
