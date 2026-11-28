'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  UploadCloud,
  Download,
  Trash2,
  Loader2,
  Lock,
  Layers,
  BookOpen,
  User,
  Plus,
  X,
  Video,
  ExternalLink,
  Pencil,
  Eye,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import api, { getApiErrorMessage } from '@/lib/api';
import { downloadFileBlob } from '@/lib/export-utils';
import { useAuth } from '@/providers/auth-provider';
import {
  COURSE_MATERIAL_TYPES,
  COURSE_MATERIAL_MAX_BYTES,
  COURSE_MATERIAL_MAX_FILES,
  COURSE_MATERIAL_EXTENSIONS,
  formatStaffDisplayName,
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
import { FileTypeIcon, getFileTypeMeta } from '@/components/ui/file-type-icon';
import { useMaterialUploadActions } from '@/features/courses/material-upload-provider';
import { MaterialUploadNotifications } from '@/features/courses/material-upload-status';
import { CourseMaterialPreviewDialog } from './course-material-preview-dialog';

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
  const { start: startUpload } = useMaterialUploadActions();

  // Filter state
  const [activeTab, setActiveTab] = useState<'all' | 'lecture' | 'section'>('all');

  // Upload Form state
  const [isUploadFormOpen, setIsUploadFormOpen] = useState(false);
  const [editing, setEditing] = useState<CourseMaterialDto | null>(null);
  const [uploadType, setUploadType] = useState<CourseMaterialType>(COURSE_MATERIAL_TYPES.LECTURE);
  const [title, setTitle] = useState('');
  const [titleAr, setTitleAr] = useState('');
  const [weekNumber, setWeekNumber] = useState<string>('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const totalFileSize = files.reduce((sum, file) => sum + file.size, 0);
  const [videoUrl, setVideoUrl] = useState('');
  const isValidVideoUrl = (() => {
    try {
      const url = new URL(videoUrl.trim());
      return (
        url.protocol === 'https:' &&
        Boolean(url.hostname.includes('.')) &&
        !url.username &&
        !url.password &&
        videoUrl.trim().length <= 2048
      );
    } catch {
      return false;
    }
  })();
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const titleInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (editing) titleInputRef.current?.focus();
  }, [editing]);

  const handleFileSelect = (selected: File[]) => {
    const next = [...files];
    const errors: string[] = [];
    let total = totalFileSize;
    for (const file of selected) {
      const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
      let reason: string | undefined;
      if (
        !file.name.includes('.') ||
        !COURSE_MATERIAL_EXTENSIONS.some((allowed) => allowed === extension)
      )
        reason = isAr ? 'نوع الملف غير مدعوم' : 'Unsupported file type';
      else if (file.size === 0) reason = isAr ? 'الملف فارغ' : 'The file is empty';
      else if (next.length >= COURSE_MATERIAL_MAX_FILES)
        reason = isAr ? 'الحد الأقصى 10 ملفات' : 'Limit of 10 files reached';
      else if (total + file.size > COURSE_MATERIAL_MAX_BYTES)
        reason = isAr ? 'الإجمالي يتجاوز 25 ميجابايت' : 'Total exceeds 25 MB';
      if (reason) {
        errors.push(`${file.name} — ${reason}`);
        continue;
      }
      next.push(file);
      total += file.size;
    }
    setFiles(next);
    setFileErrors(errors);
    if (!title.trim() && next[0]) setTitle(next[0].name.replace(/\.[^/.]+$/, ''));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Delete & Preview state
  const [materialToDelete, setMaterialToDelete] = useState<CourseMaterialDto | null>(null);
  const [previewMaterialId, setPreviewMaterialId] = useState<string | null>(null);

  // Fetch materials
  const { data, isLoading, isError, error, refetch } = useQuery<CourseMaterialsResponse>({
    queryKey: ['course-materials', courseId, user?._id],
    queryFn: async () => {
      if (!courseId)
        return {
          courseId: '',
          courseCode: '',
          courseName: '',
          materials: [],
          totalCount: 0,
        };
      const res = await api.get<CourseMaterialsResponse>(`/courses/${courseId}/materials`);
      return res.data;
    },
    enabled: open && Boolean(courseId),
  });

  const allowedTypes = isStudent ? [] : (data?.allowedUploadTypes ?? []);
  const canUploadAny = allowedTypes.length > 0;
  const effectiveUploadType = editing?.type ?? (allowedTypes.includes(uploadType)
    ? uploadType
    : (allowedTypes[0] ?? COURSE_MATERIAL_TYPES.LECTURE));
  const materials = data?.materials || [];
  const materialToPreview = materials.find((item) => item._id === previewMaterialId) ?? null;
  const filteredMaterials =
    activeTab === 'all' ? materials : materials.filter((m) => m.type === activeTab);

  // Create material mutation
  const resetForm = () => {
    setTitle('');
    setTitleAr('');
    setWeekNumber('');
    setDescription('');
    setFiles([]);
    setFileErrors([]);
    setVideoUrl('');
    setEditing(null);
    setIsUploadFormOpen(false);
  };
  const openEdit = (item: CourseMaterialDto) => {
    resetForm();
    setEditing(item);
    setTitle(item.title);
    setTitleAr(item.titleAr ?? '');
    setDescription(item.description ?? '');
    setWeekNumber(item.weekNumber?.toString() ?? '');
    setVideoUrl(item.videoUrl ?? '');
    setIsUploadFormOpen(true);
  };
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetForm();
      setPreviewMaterialId(null);
    }
    onOpenChange(nextOpen);
  };
  const editMutation = useMutation({
    mutationFn: ({ id, payload }: {
      id: string;
      payload: {
        title: string;
        titleAr?: string;
        weekNumber: number | null;
        description: string;
        videoUrl: string;
      };
    }) => api.patch(`/courses/materials/${id}`, payload),
    onSuccess: () => {
      toast.success(isAr ? 'تم حفظ التعديلات' : 'Changes saved');
      resetForm();
      void queryClient.invalidateQueries({ queryKey: ['course-materials', courseId] });
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });
  const recordingMutation = useMutation({
    mutationFn: () =>
      api.post(`/courses/${courseId}/materials`, {
        title: title.trim(),
        ...(titleAr.trim() ? { titleAr: titleAr.trim() } : {}),
        type: effectiveUploadType,
        videoUrl: videoUrl.trim(),
        ...(weekNumber ? { weekNumber: Number(weekNumber) } : {}),
        ...(description.trim() ? { description: description.trim() } : {}),
      }),
    onSuccess: () => {
      toast.success(isAr ? 'تم حفظ رابط التسجيل بنجاح' : 'Recording link saved');
      resetForm();
      void queryClient.invalidateQueries({
        queryKey: ['course-materials', courseId],
      });
    },
    onError: (err) =>
      toast.error(
        getApiErrorMessage(err, isAr ? 'تعذر حفظ رابط التسجيل' : 'Failed to save recording link'),
      ),
  });
  const handleUpload = () => {
    try {
      if (!title.trim())
        throw new Error(isAr ? 'يرجى إدخال عنوان للمحتوى' : 'Please enter a title');
      if (videoUrl.trim() && !isValidVideoUrl)
        throw new Error(
          isAr ? 'أدخل رابط فيديو صحيح يبدأ بـ https://' : 'Enter a valid HTTPS video URL',
        );
      if (!files.length) {
        if (editing && (editing.hasFile && editing.fileAvailable !== false || isValidVideoUrl)) {
          editMutation.mutate({
            id: editing._id,
            payload: {
              title: title.trim(),
              titleAr: titleAr.trim(),
              weekNumber: weekNumber ? Number(weekNumber) : null,
              description: description.trim(),
              videoUrl: videoUrl.trim(),
            },
          });
          return;
        }
        if (!isValidVideoUrl)
          throw new Error(isAr ? 'أضف ملفًا أو رابط فيديو' : 'Add a file or a video link');
        recordingMutation.mutate();
        return;
      }
      const selectedFiles = files;
      const payload = {
        title: title.trim(),
        titleAr: titleAr.trim(),
        type: effectiveUploadType,
        weekNumber,
        description: description.trim(),
        videoUrl: videoUrl.trim(),
      };
      startUpload({
        key: `material:${editing?._id ?? courseId}:${JSON.stringify(payload)}:${JSON.stringify(selectedFiles.map(({ name, size, lastModified }) => [name, size, lastModified]))}`,
        courseId,
        label: `${courseCode} · ${payload.titleAr || payload.title}`,
        fileName: files.length === 1 ? files[0].name : `${payload.title}.zip`,
        fileSize: totalFileSize,
        request: (config) => {
          const fd = new FormData();
          for (const file of selectedFiles) fd.append('file', file);
          fd.append('title', payload.title);
          if (editing || payload.titleAr) fd.append('titleAr', payload.titleAr);
          if (!editing) fd.append('type', payload.type);
          if (editing || payload.weekNumber) fd.append('weekNumber', payload.weekNumber);
          if (editing || payload.description) fd.append('description', payload.description);
          if (editing || payload.videoUrl) fd.append('videoUrl', payload.videoUrl);
          if (editing) return api.patch(`/courses/materials/${editing._id}`, fd, config);
          return api.post(`/courses/${courseId}/materials`, fd, config);
        },
      });
      // Reset form
      resetForm();
    } catch (err) {
      toast.error(getApiErrorMessage(err, isAr ? 'فشل رفع الملف' : 'Failed to upload file'));
    }
  };

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
      void queryClient.invalidateQueries({
        queryKey: ['course-materials', courseId],
      });
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
      toast.error(getApiErrorMessage(err, isAr ? 'فشل تحميل الملف' : 'Failed to download file'));
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
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className="max-w-2xl max-h-[88vh] overflow-y-auto rounded-2xl border-border bg-card p-6"
          dir={isAr ? 'rtl' : 'ltr'}
        >
          <DialogHeader className="text-start space-y-1">
            <div className="flex items-center justify-between gap-2">
              <DialogTitle className="text-base font-bold flex items-center gap-2 text-foreground">
                <BookOpen className="h-5 w-5 text-primary" />
                <span>{isAr ? 'المحاضرات والسكاشن التعليمية' : 'Course Lectures & Sections'}</span>
              </DialogTitle>
              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-squircle bg-primary/10 text-primary border border-primary/20">
                {courseCode}
              </span>
            </div>
            <p className="text-xs text-muted-foreground font-medium truncate">{courseName}</p>
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
                  const preferred = activeTab === 'all' ? effectiveUploadType : activeTab;
                  setUploadType(allowedTypes.includes(preferred) ? preferred : effectiveUploadType);
                  setIsUploadFormOpen(true);
                }}
                className="h-8 rounded-squircle bg-primary text-xs font-semibold text-white hover:bg-primary-hover gap-1.5 shadow-xs cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>
                  {allowedTypes.length > 1
                    ? (isAr ? 'إضافة محتوى تعليمي' : 'Add Material')
                    : effectiveUploadType === 'lecture'
                      ? (isAr ? 'إضافة محاضرة جديدة' : 'Add New Lecture')
                      : (isAr ? 'إضافة سكشن جديد' : 'Add New Section')}
                </span>
              </Button>
            )}
          </div>

          {/* Upload Form Box */}
          {isUploadFormOpen && (canUploadAny || editing) && (
            <fieldset
              disabled={recordingMutation.isPending || editMutation.isPending}
              className="min-w-0 rounded-xl border border-primary/30 bg-primary/5 p-4 text-start space-y-3 animate-in fade-in"
            >
              <div className="flex items-center justify-between pb-1 border-b border-primary/20">
                <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <UploadCloud className="h-4 w-4 text-primary" />
                  <span>
                    {editing ? (isAr ? 'تعديل المحتوى' : 'Edit Material') : effectiveUploadType === 'lecture'
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
                  onClick={resetForm}
                  className="h-6 w-6 p-0 rounded-squircle text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Material type selector */}
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground mb-1 block">
                    {isAr ? 'نوع المرفق' : 'Material Type'}
                  </label>
                  {!editing && allowedTypes.length > 1 ? (
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
                      {effectiveUploadType === 'lecture'
                        ? (isAr ? 'محاضرة' : 'Lecture')
                        : (isAr ? 'سكشن' : 'Section')}
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
                    max={20}
                    value={weekNumber}
                    onChange={(e) => setWeekNumber(e.target.value)}
                    placeholder={isAr ? 'مثال: 1, 2, 3...' : 'e.g., 1, 2, 3...'}
                    className="h-8 text-xs rounded-squircle"
                  />
                </div>
              </div>

              {/* Title (English / Primary) & Optional Arabic Title */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground mb-1 block">
                    {isAr ? 'عنوان المحاضرة أو السكشن *' : 'Title *'}
                  </label>
                  <Input
                    type="text"
                    ref={titleInputRef}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={
                      isAr
                        ? effectiveUploadType === 'lecture'
                          ? 'مثال: المحاضرة الأولى - مقدمة'
                          : 'مثال: السكشن الأول - تدريبات عملية'
                        : 'e.g., Week 1 - Introduction'
                    }
                    className="h-8 text-xs rounded-squircle"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground mb-1 block">
                    {isAr ? 'العنوان بالعربية (اختياري للترجمة)' : 'Arabic Title (Optional)'}
                  </label>
                  <Input
                    type="text"
                    dir="rtl"
                    value={titleAr}
                    onChange={(e) => setTitleAr(e.target.value)}
                    placeholder={
                      isAr
                        ? 'يظهر عند تصفح البوابة بالعربية'
                        : 'Displayed when viewing in Arabic'
                    }
                    className="h-8 text-xs rounded-squircle text-right"
                  />
                </div>
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

              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-foreground">
                    {isAr ? 'المرفقات' : 'Attachments'}
                  </p>
                  {files.length > 0 && (
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span>
                        {isAr
                          ? `${files.length} / ${COURSE_MATERIAL_MAX_FILES} ملفات`
                          : `${files.length} / ${COURSE_MATERIAL_MAX_FILES} files`}
                      </span>
                      <span>·</span>
                      <bdi dir="ltr" className="font-mono font-medium text-foreground">
                        {formatFileSize(totalFileSize)} / 25 MB
                      </bdi>
                    </div>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={COURSE_MATERIAL_EXTENSIONS.map((extension) => `.${extension}`).join(',')}
                  onChange={(event) => handleFileSelect(Array.from(event.target.files ?? []))}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                      setIsDragging(false);
                    }
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    setIsDragging(false);
                    handleFileSelect(Array.from(event.dataTransfer.files));
                  }}
                  className={`group flex min-h-40 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-7 text-center transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    isDragging
                      ? 'border-primary bg-primary/15 scale-[1.005] shadow-sm'
                      : 'border-primary/45 bg-card/75 hover:border-primary hover:bg-primary/5'
                  }`}
                >
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-2xl transition-transform duration-200 ${
                      isDragging
                        ? 'bg-primary/20 text-primary scale-110'
                        : 'bg-primary/10 text-primary group-hover:scale-105'
                    }`}
                  >
                    <UploadCloud className="h-7 w-7" />
                  </div>
                  <p className="text-sm font-bold text-foreground">
                    {isDragging
                      ? isAr
                        ? 'أفلت الملفات هنا لإضافتها'
                        : 'Drop files here to attach'
                      : isAr
                        ? 'اضغط لاختيار الملفات أو اسحب الملفات وأفلتها هنا'
                        : 'Click to choose files or drag and drop them here'}
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {isAr
                      ? 'PDF، Word، Excel، PowerPoint، CSV، الصور، ZIP، RAR (حتى 10 ملفات بإجمالي 25 ميجابايت)'
                      : 'PDF, Word, Excel, PowerPoint, CSV, Images, ZIP, RAR (Up to 10 files · 25 MB total)'}
                  </p>
                </button>
                {files.length > 0 && (
                  <div className="space-y-2">
                    <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/80 bg-card/85">
                      {files.map((file, index) => {
                        const meta = getFileTypeMeta(file.name, file.type);
                        return (
                          <li
                            key={`${file.name}-${file.size}-${index}`}
                            className="flex items-center gap-3 px-3 py-2.5 text-xs transition-colors hover:bg-secondary/25"
                          >
                            <FileTypeIcon fileName={file.name} mimeType={file.type} size="md" />
                            <div className="min-w-0 flex-1 text-start">
                              <p
                                className="truncate text-xs font-semibold text-foreground"
                                title={file.name}
                              >
                                <bdi>{file.name}</bdi>
                              </p>
                              <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                <span
                                  className={`inline-flex items-center rounded-squircle border px-1.5 py-0.2 font-mono text-[10px] font-bold ${meta.bgClass} ${meta.borderClass} ${meta.textClass}`}
                                >
                                  {meta.label}
                                </span>
                                <span aria-hidden="true">·</span>
                                <bdi dir="ltr" className="font-mono">
                                  {formatFileSize(file.size)}
                                </bdi>
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 shrink-0 rounded-squircle p-0 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-500 cursor-pointer"
                              aria-label={isAr ? `إزالة ${file.name}` : `Remove ${file.name}`}
                              onClick={() => {
                                setFiles(files.filter((_, i) => i !== index));
                                setFileErrors([]);
                              }}
                            >
                              <X className="size-4" />
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <p>
                        {isAr ? `المرفقات: ${files.length}` : `Files: ${files.length}`} ·{' '}
                        <bdi dir="ltr">{formatFileSize(totalFileSize)}</bdi>
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setFiles([]);
                          setFileErrors([]);
                        }}
                        className="text-[11px] font-medium text-muted-foreground hover:text-rose-500 transition-colors cursor-pointer"
                      >
                        {isAr ? 'مسح الكل' : 'Clear all'}
                      </button>
                    </div>
                  </div>
                )}
                {fileErrors.length > 0 && (
                  <ul role="alert" className="space-y-1 break-all text-xs text-destructive">
                    {fileErrors.map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="space-y-2 rounded-xl border border-primary/20 bg-primary/5 p-3">
                <label htmlFor="material-video-url" className="block text-xs font-semibold">
                  {isAr
                    ? 'رابط فيديو المحاضرة أو السكشن (اختياري)'
                    : 'Lecture or section video URL (optional)'}
                </label>
                <Input
                  id="material-video-url"
                  type="url"
                  dir="ltr"
                  maxLength={2048}
                  value={videoUrl}
                  onChange={(event) => setVideoUrl(event.target.value)}
                  placeholder="https://drive.google.com/file/d/.../view"
                  className="rounded-squircle text-left text-xs"
                  aria-describedby="material-video-help"
                  aria-invalid={Boolean(videoUrl) && !isValidVideoUrl}
                />
                <p id="material-video-help" className="text-xs text-muted-foreground">
                  {isAr
                    ? 'أضف رابط فيديو من Google Drive أو YouTube أو منصة أخرى. تأكد من منح الطلاب صلاحية المشاهدة؛ سيفتح التسجيل في تبويب جديد.'
                    : 'Paste a Google Drive, YouTube or other hosted video link. Give students viewing access; the recording opens in a new tab.'}
                </p>
                {videoUrl && !isValidVideoUrl && (
                  <p role="alert" className="text-xs text-destructive">
                    {isAr
                      ? 'أدخل رابطًا صحيحًا يبدأ بـ https://'
                      : 'Enter a valid URL starting with https://'}
                  </p>
                )}
              </div>
              {/* Form Actions */}
              <div className="flex items-center justify-end rtl:justify-start gap-2 pt-2 border-t border-primary/20">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsUploadFormOpen(false)}
                  className="order-2 h-8 rounded-squircle text-xs"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={
                    recordingMutation.isPending || editMutation.isPending ||
                    !title.trim() ||
                    (!files.length && !isValidVideoUrl && !(editing?.hasFile && editing?.fileAvailable !== false)) ||
                    (Boolean(videoUrl.trim()) && !isValidVideoUrl)
                  }
                  onClick={handleUpload}
                  className="h-8 rounded-squircle bg-primary text-xs font-semibold text-white hover:bg-primary-hover gap-1.5 cursor-pointer"
                >
                  {recordingMutation.isPending || editMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : !files.length ? (
                    <Video className="h-3.5 w-3.5" />
                  ) : (
                    <UploadCloud className="h-3.5 w-3.5" />
                  )}
                  <span>
                    {editing ? (isAr ? 'حفظ التعديلات' : 'Save Changes') : !files.length
                      ? isAr
                        ? 'حفظ رابط التسجيل'
                        : 'Save recording link'
                      : isAr
                        ? 'رفع وحفظ'
                        : 'Upload & Save'}
                  </span>
                </Button>
              </div>
            </fieldset>
          )}

          {/* Materials List */}
          <MaterialUploadNotifications locale={locale} courseId={courseId} />
          <div className="space-y-2.5 pt-1">
            {isLoading ? (
              <div className="py-12 text-center text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary mb-2" />
                <span className="text-xs">
                  {isAr ? 'جاري تحميل المحاضرات والسكاشن...' : 'Loading materials...'}
                </span>
              </div>
            ) : isError && !isStudentBlocked ? (
              <div role="alert" className="space-y-2 py-6 text-center text-sm">
                <p>{getApiErrorMessage(error, isAr ? 'تعذر تحميل المرفقات' : 'Could not load materials')}</p>
                <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
                  {isAr ? 'إعادة المحاولة' : 'Retry'}
                </Button>
              </div>
            ) : filteredMaterials.length === 0 ? (
              <div className="py-12 text-center rounded-xl border border-dashed border-border/80 bg-secondary/10">
                <Layers className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-xs font-semibold text-foreground">
                  {isAr ? 'لا توجد مرفقات متاحة حالياً' : 'No materials available yet'}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {isAr
                    ? 'سيتم إدراج المحاضرات والسكاشن فور قيام أستاذ المقرر أو الهيئة المعاونة برفعها'
                    : 'Lectures and sections will appear once uploaded'}
                </p>
              </div>
            ) : (
              <div role="list" className="divide-y divide-border/60 rounded-xl border border-border/80 bg-card/60 overflow-hidden">
                {filteredMaterials.map((item) => {
                  const isLecture = item.type === 'lecture';
                  const canDelete = !isStudent && item.canDelete;
                  const attachmentCount = item.attachments?.length ?? 0;
                  const hasFile =
                    item.hasFile ?? Boolean(item.mimeType || item.fileSize || !item.videoUrl);
                  const isFileMissing = hasFile && item.fileAvailable === false;
                  const canPreview =
                    !(isStudent && isStudentBlocked) &&
                    ((hasFile && !isFileMissing) || Boolean(item.videoUrl));
                  const displayTitle = isAr ? item.titleAr || item.title : item.title;
                  const localizedUploaderName = formatStaffDisplayName(
                    {
                      name: item.uploadedByName,
                      nameAr: item.uploadedByNameAr,
                      staffType: item.uploadedByRole === 'admin' ? undefined : item.uploadedByRole,
                      role: item.uploadedByRole === 'admin' ? 'admin' : 'staff',
                      titlePrefix: item.uploadedByTitlePrefix,
                    },
                    locale,
                  );

                  return (
                    <div
                      key={item._id}
                      role="listitem"
                      className="p-3 hover:bg-secondary/20 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-start"
                    >
                      <div
                        role={canPreview ? 'button' : undefined}
                        tabIndex={canPreview ? 0 : undefined}
                        onClick={canPreview ? () => setPreviewMaterialId(item._id) : undefined}
                        onKeyDown={
                          canPreview
                            ? (event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  setPreviewMaterialId(item._id);
                                }
                              }
                            : undefined
                        }
                        className={`group flex items-start gap-3 min-w-0 flex-1 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                          canPreview ? 'cursor-pointer' : ''
                        }`}
                      >
                        {/* File Extension / Recording Icon */}
                        {!hasFile && item.videoUrl ? (
                          <div
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
                              isLecture
                                ? 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20'
                                : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20'
                            }`}
                          >
                            <Video className="h-4 w-4" />
                          </div>
                        ) : (
                          <FileTypeIcon
                            fileName={
                              attachmentCount > 1
                                ? 'bundle.zip'
                                : item.attachments?.[0]?.name || item.fileName
                            }
                            mimeType={attachmentCount > 1 ? 'application/zip' : item.mimeType}
                            size="md"
                          />
                        )}

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
                              {isLecture
                                ? isAr
                                  ? 'محاضرة'
                                  : 'Lecture'
                                : isAr
                                  ? 'سكشن'
                                  : 'Section'}
                            </span>

                            {item.weekNumber ? (
                              <span className="text-[10px] font-semibold text-muted-foreground bg-secondary/60 px-1.5 py-0.5 rounded">
                                {isAr ? `الأسبوع ${item.weekNumber}` : `Week ${item.weekNumber}`}
                              </span>
                            ) : null}

                            <h5
                              className={`text-xs font-bold text-foreground truncate transition-colors ${
                                canPreview ? 'group-hover:text-primary' : ''
                              }`}
                            >
                              <bdi>{displayTitle}</bdi>
                            </h5>

                            {isFileMissing && (
                              <span className="inline-flex items-center gap-1 rounded-squircle border border-amber-500/35 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                                <AlertTriangle className="h-3 w-3 shrink-0" />
                                <span>
                                  {isStudent
                                    ? isAr
                                      ? 'الملف غير متوفر حالياً'
                                      : 'File unavailable'
                                    : isAr
                                      ? 'الملف مفقود على الخادم'
                                      : 'File missing on server'}
                                </span>
                              </span>
                            )}
                          </div>

                          {item.description ? (
                            <p className="text-[11px] text-muted-foreground line-clamp-1">
                              {item.description}
                            </p>
                          ) : null}

                          <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground/80">
                            {localizedUploaderName ? (
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                <span>
                                  <bdi>{localizedUploaderName}</bdi> ·{' '}
                                  {
                                    {
                                      doctor: isAr ? 'دكتور' : 'Doctor',
                                      teaching_assistant: isAr ? 'معيد' : 'Teaching Assistant',
                                      assistant_lecturer: isAr
                                        ? 'مدرس مساعد'
                                        : 'Assistant Lecturer',
                                      admin: isAr ? 'الإدارة' : 'Administration',
                                    }[item.uploadedByRole]
                                  }
                                </span>
                              </span>
                            ) : null}

                            {attachmentCount > 1 && (
                              <span>
                                {isAr
                                  ? `المرفقات: ${attachmentCount}`
                                  : `Files: ${attachmentCount}`}
                              </span>
                            )}
                            {item.fileSize ? (
                              <span>
                                • <bdi dir="ltr">{formatFileSize(item.fileSize)}</bdi>
                              </span>
                            ) : null}

                            {item.createdAt ? <span>• {formatDate(item.createdAt)}</span> : null}
                          </div>
                        </div>
                      </div>

                      {/* Item Actions */}
                      <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5 self-stretch sm:max-w-[58%] sm:self-center">
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
                          <>
                            {!isStudent && isFileMissing && item.canEdit && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => openEdit(item)}
                                className="h-8 rounded-squircle border-amber-500/35 bg-amber-500/10 px-2.5 text-xs font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 gap-1.5 cursor-pointer"
                              >
                                <UploadCloud className="h-3.5 w-3.5" />
                                <span>{isAr ? 'إعادة رفع' : 'Re-upload'}</span>
                              </Button>
                            )}
                            {(hasFile || item.videoUrl) && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={isFileMissing && !item.videoUrl}
                                onClick={() => setPreviewMaterialId(item._id)}
                                title={
                                  isFileMissing && !item.videoUrl
                                    ? isAr
                                      ? 'الملف المادي غير متوفر على الخادم للمعاينة'
                                      : 'File missing on server'
                                    : isAr
                                      ? 'معاينة المحتوى'
                                      : 'Preview material'
                                }
                                className="h-8 rounded-squircle border-primary/35 bg-primary/10 px-2.5 text-xs font-semibold text-primary hover:bg-primary/20 gap-1.5 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                <span>{isAr ? 'معاينة' : 'Preview'}</span>
                              </Button>
                            )}
                            {item.videoUrl && (
                              <Button
                                asChild
                                variant="outline"
                                size="sm"
                                className="h-8 rounded-squircle text-xs gap-1.5"
                              >
                                <a
                                  href={
                                    item.videoUrl.startsWith('https://') ? item.videoUrl : undefined
                                  }
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <ExternalLink className="h-3.5 w-3.5 text-primary" />
                                  {isAr ? 'مشاهدة التسجيل' : 'Watch recording'}
                                </a>
                              </Button>
                            )}
                            {hasFile && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={isFileMissing}
                                onClick={() => handleDownload(item)}
                                title={
                                  isFileMissing
                                    ? isAr
                                      ? 'الملف المادي غير متوفر على الخادم'
                                      : 'File missing on server'
                                    : undefined
                                }
                                className="h-8 rounded-squircle text-xs font-semibold gap-1.5 hover:bg-primary/10 hover:text-primary cursor-pointer border-border disabled:opacity-45 disabled:cursor-not-allowed"
                              >
                                <Download className="h-3.5 w-3.5 text-primary" />
                                <span>
                                  {attachmentCount > 1
                                    ? isAr
                                      ? 'تحميل الملفات (ZIP)'
                                      : 'Download files (ZIP)'
                                    : isAr
                                      ? 'تحميل'
                                      : 'Download'}
                                </span>
                              </Button>
                            )}
                          </>
                        )}

                        {!isStudent && item.canEdit && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(item)}
                            className="h-8 w-8 p-0 rounded-squircle"
                            aria-label={isAr ? 'تعديل المحتوى' : 'Edit Material'}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
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
              onClick={() => handleOpenChange(false)}
              className="rounded-squircle text-xs"
            >
              {isAr ? 'إغلاق' : 'Close'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Material Preview Dialog */}
      <CourseMaterialPreviewDialog
        material={materialToPreview}
        open={Boolean(materialToPreview)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setPreviewMaterialId(null);
        }}
        courseCode={courseCode}
        locale={locale}
      />

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
