import { Suspense } from 'react';
import { PageSkeletonLoader } from '@/components/ui/page-suspense-fallback';
import { PermissionGuard } from '@/components/ui/permission-guard';
import AdminExamSchedulesManager from '@/features/exam-schedules/admin-exam-schedules-manager';

export default function ExamSchedulesPage() {
  return (
    <Suspense fallback={<PageSkeletonLoader />}>
      <PermissionGuard permission="exam_schedules.read">
        <AdminExamSchedulesManager />
      </PermissionGuard>
    </Suspense>
  );
}
