'use client';

import React, { useState, Suspense } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { Award, Plus, UploadCloud, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/providers/auth-provider';
import { PermissionGuard } from '@/components/ui/permission-guard';
import { PageSkeletonLoader } from '@/components/ui/page-suspense-fallback';
import { PageTitleBanner } from '@/components/ui/page-title-banner';
import { DataUploadDialog } from '@/components/ui/data-upload-dialog';
import { Button } from '@/components/ui/button';
import { listAdminGrades, saveGrade, updateGrade, deleteGrade, publishGradesBulk, recalculateAcademicProgress } from '@/features/grades/api';
import { GradeFormDialog } from '@/features/grades/components/grade-form-dialog';
import type { GradeItem } from '@/features/grades/api';

const gradeImportColumns = ['studentCode', 'courseCode', 'examType', 'grade', 'maxGrade', 'status', 'academicYear', 'semester'];

function GradesPageContent() {
  const t = useTranslations('grades');
  const tCommon = useTranslations('common');
  const params = useParams();
  const locale = params.locale as string;
  const isAr = locale === 'ar';
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<string>('midterm');
  const [page, setPage] = useState(1);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [selectedGrade, setSelectedGrade] = useState<GradeItem | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  const gradesQuery = useQuery({
    queryKey: ['grades', activeTab, page],
    queryFn: () => listAdminGrades({ page, limit: 10, examType: activeTab }),
  });

  const grades = gradesQuery.data?.items ?? [];

  const handleCreate = async (values: any) => {
    setFormLoading(true);
    try {
      await saveGrade(values);
      toast.success(isAr ? 'تم حفظ الدرجة' : 'Grade saved');
      setIsAddOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['grades'] });
    } catch {
      toast.error(isAr ? 'فشل حفظ الدرجة' : 'Failed to save grade');
    } finally {
      setFormLoading(false);
    }
  };

  const handleUpdate = async (values: any) => {
    if (!selectedGrade) return;
    setFormLoading(true);
    try {
      await updateGrade(selectedGrade._id, values);
      toast.success(isAr ? 'تم تحديث الدرجة' : 'Grade updated');
      setIsEditOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['grades'] });
    } catch {
      toast.error(isAr ? 'فشل تحديث الدرجة' : 'Failed to update grade');
    } finally {
      setFormLoading(false);
    }
  };

  return (
    <div className="animate-fade-in space-y-6 p-2 md:p-6">
      <PageTitleBanner title={t('title')} icon={<Award className="h-5 w-5" />} subtitle="Manage midterm & final exam grades, bulk publish results, and recalculate student GPAs.">
        <Button variant="outline" onClick={() => setIsUploadOpen(true)}>
          <UploadCloud className="h-4 w-4" />
          {isAr ? 'رفع الدرجات' : 'Upload Grades'}
        </Button>
        <Button onClick={() => setIsAddOpen(true)}>
          <Plus className="h-4 w-4" />
          {isAr ? 'إضافة درجة' : 'Add Grade'}
        </Button>
      </PageTitleBanner>

      <div className="rounded-xl border border-border/70 bg-card/90 p-6 shadow-[var(--shadow-glow)] text-start">
        <div className="flex gap-2 mb-4 border-b border-border/70 pb-3">
          {['midterm', 'final', 'quiz'].map((tab) => (
            <Button key={tab} variant={activeTab === tab ? 'default' : 'ghost'} onClick={() => { setActiveTab(tab); setPage(1); }}>
              {tab.toUpperCase()}
            </Button>
          ))}
        </div>

        {gradesQuery.isLoading ? (
          <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : grades.length === 0 ? (
          <p className="text-sm text-muted-foreground">{isAr ? 'لا توجد درجات مسجلة لهذا الاختبار.' : 'No grades recorded.'}</p>
        ) : (
          <div className="space-y-3">
            {grades.map((item) => (
              <div key={item._id} className="flex items-center justify-between p-4 rounded-xl border border-border/70 bg-surface/35">
                <div>
                  <p className="font-semibold text-foreground">{item.studentCode} · {item.courseCode}</p>
                  <p className="text-xs text-muted-foreground mt-1">{item.examType} · {item.academicYear}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold text-primary text-base">{item.grade} / {item.maxGrade}</span>
                  <Button size="sm" variant="outline" onClick={() => { setSelectedGrade(item); setIsEditOpen(true); }}>
                    {tCommon('edit')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <GradeFormDialog open={isAddOpen} onOpenChange={setIsAddOpen} isEditing={false} courses={[]} onSubmit={handleCreate} isSubmitting={formLoading} />
      <GradeFormDialog open={isEditOpen} onOpenChange={setIsEditOpen} isEditing={true} courses={[]} onSubmit={handleUpdate} isSubmitting={formLoading} defaultValues={selectedGrade ? { studentCode: selectedGrade.studentCode, courseCode: selectedGrade.courseCode, grade: selectedGrade.grade, maxGrade: selectedGrade.maxGrade } : undefined} />
      <DataUploadDialog open={isUploadOpen} onOpenChange={setIsUploadOpen} title={isAr ? 'رفع درجات الطلاب' : 'Upload Grades'} description="Upload XLSX/CSV file with grades." uploadType="grades" expectedColumns={gradeImportColumns} onSuccess={() => void queryClient.invalidateQueries({ queryKey: ['grades'] })} />
    </div>
  );
}

export default function GradesPage() {
  return (
    <Suspense fallback={<PageSkeletonLoader />}>
      <PermissionGuard permission="grades.read">
        <GradesPageContent />
      </PermissionGuard>
    </Suspense>
  );
}
