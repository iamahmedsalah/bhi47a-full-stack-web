'use client';

import React, { Suspense } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { PageSkeletonLoader } from '@/components/ui/page-suspense-fallback';
import { PermissionGuard } from '@/components/ui/permission-guard';
import AdminExamSchedulesManager from '@/features/exam-schedules/admin-exam-schedules-manager';
import StudentExamSchedulePage from '@/features/exam-schedules/student-exam-schedule-page';

function ExamSchedulesContent() {
  const { user } = useAuth();
  const isDoctor =
    user?.role === 'staff' && (user as any)?.staffType === 'doctor';

  if (isDoctor) {
    return <StudentExamSchedulePage />;
  }

  return (
    <PermissionGuard permission="exam_schedules.read">
      <AdminExamSchedulesManager />
    </PermissionGuard>
  );
}

export default function ExamSchedulesPage() {
  return (
    <Suspense fallback={<PageSkeletonLoader />}>
      <ExamSchedulesContent />
    </Suspense>
  );
}
