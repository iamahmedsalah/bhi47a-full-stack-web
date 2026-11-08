'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FileText,
  UploadCloud,
  Download,
  Trash2,
  Loader2,
  Lock,
  Layers,
  BookOpen,
  Calendar,
  User,
  Plus,
  AlertTriangle,
  X,
  FileCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import api, { getApiErrorMessage, apiBaseUrl } from '@/lib/api';
import { downloadFileBlob } from '@/lib/export-utils';
import { useAuth } from '@/providers/auth-provider';
import {
  COURSE_MATERIAL_TYPES,
  COURSE_MATERIAL_MAX_BYTES,
  type CourseMaterialsResponse,
  type CourseMaterialType,
  type CourseMaterialDto,
} from '@student-portal/shared';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

interface CourseMaterialsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  courseCode: string;
  courseName: string;
  locale: string;
  isStudent?: boolean;
  isStudentBlocked?: boolean;
}

export function CourseMaterialsDialog({
  open,
  onOpenChange,
  courseId,
  courseCode,
  courseName,
  locale,
  isStudent = false,
  isStudentBlocked = false,
}: CourseMaterialsDialogProps) {
  const isAr = locale === 'ar';
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const isAdmin = user?.role === 'admin';
  const staffType = (user as any)?.staffType;
  const isDoctor = user?.role === 'staff' && staffType === 'doctor';
  const isTeachingAssistant = user?.role === 'staff' && staffType === 'teaching_assistant';

  // Permissions to upload
  const canUploadLecture = isAdmin || isDoctor;
  const canUploadSection = isAdmin || isTeachingAssistant;
  const canUploadAny = !isStudent && (canUploadLecture || canUploadSection);

  // Filter state
  const [activeTab, setActiveTab] = useState<'all' | 'lecture' | 'section'>('all');

  // Upload Form state
  const [isUploadFormOpen, setIsUploadFormOpen] = useState(false);
  const [uploadType, setUploadType] = useState<CourseMaterialType>(
    isTeachingAssistant && !isAdmin ? COURSE_MATERIAL_TYPES.SECTION : COURSE_MATERIAL_TYPES.LECTURE,
  );
  const [title, setTitle] = useState('');
  const [weekNumber, setWeekNumber] = useState<string>('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const uploadController = React.useRef<AbortController | null>(null);
  React.useEffect(() => () => uploadController.current?.abort(), []);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const MAX_MATERIAL_FILE_SIZE = COURSE_MATERIAL_MAX_BYTES;

  const handleFileSelect = (selectedFile: File | null) => {
    if (!selectedFile) {
      setFile(null);
      return;
    }
    if (selectedFile.size > MAX_MATERIAL_FILE_SIZE) {
      toast.error(
        isAr
          ? `حجم الملف (${(selectedFile.size / (1024 * 1024)).toFixed(1)} ميجابايت) يتجاوز الحد الأقصى المسموح به (25 ميجابايت)`
          : `File size (${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB) exceeds the maximum limit of 25 MB`,
      );
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setFile(selectedFile);
    if (!title.trim()) {
      const defaultTitle = selectedFile.name.replace(/\.[^/.]+$/, '');
      setTitle(defaultTitle);
    }
  };

  // Delete state
  const [materialToDelete, setMaterialToDelete] = useState<CourseMaterialDto | null>(null);

  // Fetch materials
  const { data, isLoading, refetch } = useQuery<CourseMaterialsResponse>({
    queryKey: ['course-materials', courseId],
    queryFn: async () => {
      if (!courseId) return { courseId: '', courseCode: '', courseName: '', materials: [], totalCount: 0 };
      const res = await api.get<CourseMaterialsResponse>(`/courses/${courseId}/materials`);
      return res.data;
    },
    enabled: open && Boolean(courseId),
  });

  const materials = data?.materials || [];
  const filteredMaterials =
    activeTab === 'all'
      ? materials
      : materials.filter((m) => m.type === activeTab);

  // Create material mutation
  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error(isAr ? 'يرجى اختيار ملف' : 'Please select a file');
      if (file.size > MAX_MATERIAL_FILE_SIZE) {
        throw new Error(
          isAr
            ? 'حجم الملف يتجاوز الحد الأقصى المسموح به (25 ميجابايت)'
            : 'File size exceeds 25 MB limit',
        );
      }
      if (!title.trim()) throw new Error(isAr ? 'يرجى إدخال عنوان للمحتوى' : 'Please enter a title');

      const fd = new FormData();
      fd.append('file', file);
      fd.append('title', title.trim());
      fd.append('type', uploadType);
      if (weekNumber) fd.append('weekNumber', String(Number(weekNumber)));
      if (description.trim()) fd.append('description', description.trim());

      uploadController.current = new AbortController();
      setUploadProgress(0);
      const res = await api.post(`/courses/${courseId}/materials`, fd, {
        signal: uploadController.current.signal,
        onUploadProgress: (event) => setUploadProgress(Math.min(100, Math.round(100 * event.loaded / (event.total || file.size)))),
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success(
        uploadType === COURSE_MATERIAL_TYPES.LECTURE
          ? isAr
            ? 'تم رفع المحاضرة بنجاح'
            : 'Lecture uploaded successfully'
          : isAr
            ? 'تم رفع السكشن بنجاح'
            : 'Section uploaded successfully',
      );
      // Reset form
      setTitle('');
      setWeekNumber('');
      setDescription('');
      setFile(null);
      setIsUploadFormOpen(false);
      void refetch();
      void queryClient.invalidateQueries({ queryKey: ['course-materials', courseId] });
    },
    onError: (err) => {
      if ((err as { code?: string }).code === 'ERR_CANCELED') {
        void queryClient.invalidateQueries({ queryKey: ['course-materials', courseId] });
        return;
      }
      toast.error(getApiErrorMessage(err, isAr ? 'فشل رفع الملف' : 'Failed to upload file'));
    },
  });

  // Delete material mutation
  const deleteMutation = useMutation({
    mutationFn: async (materialId: string) => {
      const res = await api.delete(`/courses/materials/${materialId}`);
      return res.data;
    },
    onSuccess: () => {
      toast.success(isAr ? 'تم حذف الملف بنجاح' : 'Material deleted successfully');
      setMaterialToDelete(null);
      void refetch();
      void queryClient.invalidateQueries({ queryKey: ['course-materials', courseId] });
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, isAr ? 'فشل حذف الملف' : 'Failed to delete material'));
    },
  });

  // Download handler
  const handleDownload = async (material: CourseMaterialDto) => {
    if (isStudentBlocked) {
      toast.error(
        isAr
          ? 'عفواً، لا يمكن تحميل المحاضرات أو السكاشن نظراً لحجب الحساب بسبب المصروفات الدراسية'
          : 'Download restricted due to unpaid tuition fees',
      );
      return;
    }

    try {
      const res = await api.get(`/courses/materials/${material._id}/download`, {
        responseType: 'blob',
      });
      await downloadFileBlob(
        res,
        material.fileName || `${material.title}.pdf`,
        material.mimeType || 'application/octet-stream',
      );
    } catch (err) {
      toast.error(
        getApiErrorMessage(err, isAr ? 'فشل تحميل الملف' : 'Failed to download file'),
      );
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return '';
    try {
      return new Date(isoString).toLocaleDateString(isAr ? 'ar-EG' : 'en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'Africa/Cairo',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => { if (!next) uploadController.current?.abort(); onOpenChange(next); }}>
        <DialogContent
          className="max-w-2xl max-h-[88vh] overflow-y-auto rounded-2xl border-border bg-card p-6"
          dir={isAr ? 'rtl' : 'ltr'}
        >
          <DialogHeader className="text-start space-y-1">
            <div className="flex items-center justify-between gap-2">
              <DialogTitle className="text-base font-bold flex items-center gap-2 text-foreground">
                <BookOpen className="h-5 w-5 text-primary" />
                <span>
                  {isAr ? 'المحاضرات والسكاشن التعليمية' : 'Course Lectures & Sections'}
                </span>
              </DialogTitle>
              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-squircle bg-primary/10 text-primary border border-primary/20">
                {courseCode}
              </span>
            </div>
            <p className="text-xs text-muted-foreground font-medium truncate">
              {courseName}
            </p>
          </DialogHeader>

          {/* Student Withholding Alert */}
          {isStudent && isStudentBlocked && (
            <div className="my-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-start flex items-start gap-2.5">
              <Lock className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
              <div className="text-xs space-y-0.5">
                <p className="font-bold text-rose-600 dark:text-rose-400">
                  {isAr
                    ? 'الحساب محجوب مؤقتاً لعدم سداد المصروفات الدراسية'
                    : 'Account Withheld for Outstanding Tuition'}
                </p>
                <p className="text-muted-foreground">
                  {isAr
                    ? 'تم حجب إمكانية تحميل المحاضرات والسكاشن لحين مراجعة شؤون الطلاب وسداد المصروفات المقررة.'
                    : 'Downloading lecture notes and sections is withheld until tuition fees are settled.'}
                </p>
              </div>
            </div>
          )}

          {/* Header Actions: Tabs & Upload Button */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/60">
            {/* Filter Tabs */}
            <div className="flex items-center gap-1 rounded-lg bg-secondary/40 p-1 border border-border/40 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('all')}
                className={`px-2.5 py-1 rounded-squircle font-semibold transition-all cursor-pointer ${
                  activeTab === 'all'
                    ? 'bg-card text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {isAr ? 'الكل' : 'All'} ({materials.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('lecture')}
                className={`px-2.5 py-1 rounded-squircle font-semibold transition-all cursor-pointer ${
                  activeTab === 'lecture'
                    ? 'bg-card text-teal-600 dark:text-teal-400 shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {isAr ? 'المحاضرات' : 'Lectures'} (
                {materials.filter((m) => m.type === 'lecture').length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('section')}
                className={`px-2.5 py-1 rounded-squircle font-semibold transition-all cursor-pointer ${
                  activeTab === 'section'
                    ? 'bg-card text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {isAr ? 'السكاشن' : 'Sections'} (
                {materials.filter((m) => m.type === 'section').length})
              </button>
            </div>

            {/* Upload Trigger Button for Staff/Admin */}
            {canUploadAny && !isUploadFormOpen && (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  if (isTeachingAssistant && !isAdmin) {
                    setUploadType(COURSE_MATERIAL_TYPES.SECTION);
                  } else {
                    setUploadType(COURSE_MATERIAL_TYPES.LECTURE);
                  }
                  setIsUploadFormOpen(true);
                }}
                className="h-8 rounded-squircle bg-primary text-xs font-semibold text-white hover:bg-primary-hover gap-1.5 shadow-xs cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>
                  {isTeachingAssistant && !isAdmin
                    ? isAr
                      ? 'إضافة سكشن جديد'
                      : 'Add New Section'
                    : isDoctor && !isAdmin
                      ? isAr
                        ? 'إضافة محاضرة جديدة'
                        : 'Add New Lecture'
                      : isAr
                        ? 'إضافة محتوى تعليمي'
                        : 'Add Material'}
                </span>
              </Button>
            )}
          </div>

          {/* Upload Form Box */}
          {isUploadFormOpen && canUploadAny && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-start space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between pb-1 border-b border-primary/20">
                <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <UploadCloud className="h-4 w-4 text-primary" />
                  <span>
                    {uploadType === 'lecture'
                      ? isAr
                        ? 'رفع محاضرة جديدة'
                        : 'Upload New Lecture'
                      : isAr
                        ? 'رفع سكشن جديد'
                        : 'Upload New Section'}
                  </span>
                </h4>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => { uploadController.current?.abort(); setIsUploadFormOpen(false); }}
                  className="h-6 w-6 p-0 rounded-squircle text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Material Type Selector (Admin only can switch; Doctor locked to lecture; TA locked to section) */}
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground mb-1 block">
                    {isAr ? 'نوع المرفق' : 'Material Type'}
                  </label>
                  {isAdmin ? (
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={uploadType === 'lecture' ? 'default' : 'outline'}
                        onClick={() => setUploadType(COURSE_MATERIAL_TYPES.LECTURE)}
                        className="h-8 text-xs rounded-squircle flex-1"
                      >
                        {isAr ? 'محاضرة' : 'Lecture'}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={uploadType === 'section' ? 'default' : 'outline'}
                        onClick={() => setUploadType(COURSE_MATERIAL_TYPES.SECTION)}
                        className="h-8 text-xs rounded-squircle flex-1"
                      >
                        {isAr ? 'سكشن' : 'Section'}
                      </Button>
                    </div>
                  ) : (
                    <div className="h-8 px-3 rounded-squircle bg-secondary/60 border border-border/60 text-xs font-bold flex items-center text-foreground">
                      {uploadType === 'lecture'
                        ? isAr
                          ? 'محاضرة (أستاذ المادة)'
                          : 'Lecture (Doctor)'
                        : isAr
                          ? 'سكشن (معيد المادة)'
                          : 'Section (Teaching Assistant)'}
                    </div>
                  )}
                </div>

                {/* Week Number */}
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground mb-1 block">
                    {isAr ? 'رقم الأسبوع (اختياري)' : 'Week Number (Optional)'}
                  </label>
                  <Input
                    type="number"
                    min={1}
                    max={16}
                    value={weekNumber}
                    onChange={(e) => setWeekNumber(e.target.value)}
                    placeholder={isAr ? 'مثال: 1, 2, 3...' : 'e.g., 1, 2, 3...'}
                    className="h-8 text-xs rounded-squircle"
                  />
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground mb-1 block">
                  {isAr ? 'عنوان المحاضرة أو السكشن *' : 'Title *'}
                </label>
                <Input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={
                    isAr
                      ? uploadType === 'lecture'
                        ? 'مثال: المحاضرة الأولى - مقدمة في نظم المعلومات'
                        : 'مثال: السكشن الأول - تدريبات عملية'
                      : 'e.g., Week 1 - Introduction to Information Systems'
                  }
                  className="h-8 text-xs rounded-squircle"
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground mb-1 block">
                  {isAr ? 'وصف أو ملاحظات (اختياري)' : 'Description (Optional)'}
                </label>
                <Input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={isAr ? 'ملاحظات للطلاب حول هذا المرفق...' : 'Notes for students...'}
                  className="h-8 text-xs rounded-squircle"
                />
              </div>

              {/* Modern Drag-and-Drop File Upload Zone */}
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground mb-1 block">
                  {isAr ? 'ملف المحتوى التعليمي (الحد الأقصى: 25 ميجابايت) *' : 'Material File (Max 25 MB) *'}
                </label>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.zip,.rar"
                  onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
                  className="hidden"
                />

                {!file ? (
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      const droppedFile = e.dataTransfer.files?.[0] || null;
                      handleFileSelect(droppedFile);
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    className={`flex flex-col items-center justify-center p-5 rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-200 text-center ${
                      isDragging
                        ? 'border-primary bg-primary/10 shadow-sm scale-[1.01]'
                        : 'border-border/80 hover:border-primary/50 bg-secondary/20 hover:bg-secondary/40'
                    }`}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary mb-2">
                      <UploadCloud className="h-5 w-5" />
                    </div>
                    <p className="text-xs font-semibold text-foreground">
                      {isAr
                        ? 'اسحب وأفلت الملف هنا أو انقر لاختياره'
                        : 'Drag & drop file here or click to browse'}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {isAr
                        ? 'PDF, Word, PowerPoint, Excel — الحد الأقصى 25 ميجابايت'
                        : 'PDF, Word, PowerPoint, Excel — Max size 25 MB'}
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center justify-between rounded-xl border border-teal-500/30 bg-teal-500/5 dark:bg-teal-500/10 p-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-500/20 text-teal-600 dark:text-teal-400">
                        <FileCheck className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 text-start">
                        <p className="text-xs font-semibold text-foreground truncate">
                          {file.name}
                        </p>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                          <span className="font-mono">{formatFileSize(file.size)}</span>
                          <span>•</span>
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                            {isAr ? 'جاهز للرفع (أقل من 25 ميجابايت)' : 'Ready to upload (< 25 MB)'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      className="h-7 w-7 p-0 rounded-full text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 cursor-pointer shrink-0"
                      title={isAr ? 'إلغاء اختيار الملف' : 'Remove selected file'}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>

              {uploadMutation.isPending && <p role="status" className="text-sm text-muted-foreground">{isAr ? 'جاري الرفع' : 'Uploading'}: {uploadProgress}%</p>}
              {/* Form Actions */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-primary/20">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => { uploadController.current?.abort(); setIsUploadFormOpen(false); }}
                  className="h-8 rounded-squircle text-xs"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={uploadMutation.isPending || !file || !title.trim()}
                  onClick={() => uploadMutation.mutate()}
                  className="h-8 rounded-squircle bg-primary text-xs font-semibold text-white hover:bg-primary-hover gap-1.5 cursor-pointer"
                >
                  {uploadMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <UploadCloud className="h-3.5 w-3.5" />
                  )}
                  <span>{isAr ? 'رفع وحفظ' : 'Upload & Save'}</span>
                </Button>
              </div>
            </div>
          )}

          {/* Materials List */}
          <div className="space-y-2.5 pt-1">
            {isLoading ? (
              <div className="py-12 text-center text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary mb-2" />
                <span className="text-xs">
                  {isAr ? 'جاري تحميل المحاضرات والسكاشن...' : 'Loading materials...'}
                </span>
              </div>
            ) : filteredMaterials.length === 0 ? (
              <div className="py-12 text-center rounded-xl border border-dashed border-border/80 bg-secondary/10">
                <Layers className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-xs font-semibold text-foreground">
                  {isAr ? 'لا توجد مرفقات متاحة حالياً' : 'No materials available yet'}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {isAr
                    ? 'سيتم إدراج المحاضرات والسكاشن فور قيام أستاذ المقرر أو المعيد برفعها'
                    : 'Lectures and sections will appear once uploaded'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border/60 rounded-xl border border-border/80 bg-card/60 overflow-hidden">
                {filteredMaterials.map((item) => {
                  const isLecture = item.type === 'lecture';
                  const canDelete =
                    isAdmin ||
                    (item.uploadedBy && user?._id && String(item.uploadedBy) === String(user._id));

                  return (
                    <div
                      key={item._id}
                      className="p-3 hover:bg-secondary/20 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-start"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        {/* Type Icon Badge */}
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
                            isLecture
                              ? 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20'
                              : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20'
                          }`}
                        >
                          <FileText className="h-4 w-4" />
                        </div>

                        {/* Details */}
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                isLecture
                                  ? 'bg-teal-500/15 text-teal-700 dark:text-teal-300'
                                  : 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300'
                              }`}
                            >
                              {isLecture ? (isAr ? 'محاضرة' : 'Lecture') : isAr ? 'سكشن' : 'Section'}
                            </span>

                            {item.weekNumber ? (
                              <span className="text-[10px] font-semibold text-muted-foreground bg-secondary/60 px-1.5 py-0.5 rounded">
                                {isAr ? `الأسبوع ${item.weekNumber}` : `Week ${item.weekNumber}`}
                              </span>
                            ) : null}

                            <h5 className="text-xs font-bold text-foreground truncate">
                              {item.title}
                            </h5>
                          </div>

                          {item.description ? (
                            <p className="text-[11px] text-muted-foreground line-clamp-1">
                              {item.description}
                            </p>
                          ) : null}

                          <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground/80">
                            {item.uploadedByName ? (
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                <span>{item.uploadedByName}</span>
                              </span>
                            ) : null}

                            {item.fileSize ? (
                              <span>• {formatFileSize(item.fileSize)}</span>
                            ) : null}

                            {item.createdAt ? (
                              <span>• {formatDate(item.createdAt)}</span>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      {/* Item Actions */}
                      <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                        {/* Download button with locked state for withheld students */}
                        {isStudent && isStudentBlocked ? (
                          <div
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-squircle bg-rose-500/10 text-rose-500 text-xs font-semibold border border-rose-500/20 cursor-not-allowed"
                            title={
                              isAr
                                ? 'محجوب لعدم سداد المصروفات'
                                : 'Withheld for outstanding tuition'
                            }
                          >
                            <Lock className="h-3 w-3" />
                            <span>{isAr ? 'محجوب' : 'Locked'}</span>
                          </div>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleDownload(item)}
                            className="h-8 rounded-squircle text-xs font-semibold gap-1.5 hover:bg-primary/10 hover:text-primary cursor-pointer border-border"
                          >
                            <Download className="h-3.5 w-3.5 text-primary" />
                            <span>{isAr ? 'تحميل' : 'Download'}</span>
                          </Button>
                        )}

                        {/* Delete button (Admin or Uploader) */}
                        {canDelete && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setMaterialToDelete(item)}
                            className="h-8 w-8 p-0 rounded-squircle text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 cursor-pointer"
                            title={isAr ? 'حذف الملف' : 'Delete'}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <DialogFooter className="mt-4 border-t border-border/60 pt-3 rtl:sm:justify-start">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="rounded-squircle text-xs"
            >
              {isAr ? 'إغلاق' : 'Close'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(materialToDelete)}
        onOpenChange={(isOpen) => !isOpen && setMaterialToDelete(null)}
        title={isAr ? 'تأكيد حذف الملف التعليمي' : 'Confirm Delete Material'}
        description={
          isAr
            ? `هل أنت متأكد من رغبتك في حذف "${materialToDelete?.title}"؟ لا يمكن التراجع عن هذا الإجراء.`
            : `Are you sure you want to delete "${materialToDelete?.title}"? This cannot be undone.`
        }
        confirmLabel={isAr ? 'حذف نهائي' : 'Delete'}
        cancelLabel={isAr ? 'إلغاء' : 'Cancel'}
        destructive
        disabled={deleteMutation.isPending}
        onConfirm={() => {
          if (materialToDelete) {
            deleteMutation.mutate(materialToDelete._id);
          }
        }}
      />
    </>
  );
}
