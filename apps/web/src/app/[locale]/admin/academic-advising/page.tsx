'use client';

import dynamic from 'next/dynamic';
import { PageSkeletonLoader } from '@/components/ui/page-suspense-fallback';

const AdvisingWorkspace = dynamic(
  () =>
    import('@/features/academic-advising/components/advising-workspace').then(
      (m) => m.AdvisingWorkspace,
    ),
  {
    ssr: false,
    loading: () => <PageSkeletonLoader />,
  },
);

export default function AcademicAdvisingPage() {
  return <AdvisingWorkspace />;
}
