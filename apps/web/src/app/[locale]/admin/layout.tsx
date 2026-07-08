'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { AuthProvider } from '@/providers/auth-provider';
import AdminSidebar from '@/components/admin/sidebar';
import AdminHeader from '@/components/admin/header';
import { useUIStore } from '@/store/ui-store';
import { cn } from '@/lib/cn';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const locale = (params?.locale as string) || 'ar';
  const { sidebarOpen } = useUIStore();

  return (
    <AuthProvider locale={locale}>
      <div className="min-h-screen">
        {/* Sidebar — fixed to end (right in RTL, left in LTR) */}
        <AdminSidebar />

        {/* Main Content — offset by sidebar width */}
        <div
          className={cn(
            'flex min-h-screen flex-col transition-all duration-300',
            sidebarOpen ? 'md:me-72' : 'md:me-26',
          )}
        >
          <AdminHeader />
          <main className="flex-1 p-4 pt-6 md:p-6">
            {children}
          </main>
        </div>
      </div>
    </AuthProvider>
  );
}
