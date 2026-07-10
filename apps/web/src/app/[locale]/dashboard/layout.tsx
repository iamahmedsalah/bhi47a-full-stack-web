'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import StudentSidebar from '@/components/student/sidebar';
import { useUIStore } from '@/store/ui-store';
import { cn } from '@/lib/cn';

export default function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const locale = (params?.locale as string) || 'ar';
  const { sidebarOpen } = useUIStore();

  return (
    <div className="min-h-screen">
      {/* Sidebar */}
      <StudentSidebar />

      {/* Main Content */}
      <div
        className={cn(
          'flex min-h-screen flex-col transition-all duration-300',
          sidebarOpen ? 'md:me-72' : 'md:me-26',
        )}
      >
        <main className="flex-1 p-4 pt-20 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
