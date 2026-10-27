'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import StudentSidebar from '@/components/student/sidebar';
import StudentHeader from '@/components/student/header';
import { Footer } from '@/components/ui/footer';
import { useUIStore } from '@/store/ui-store';
import { cn } from '@/lib/cn';
import { FcmInitializer } from '@/providers/fcm-initializer';
import { StudentChatWidget } from '@/features/ai/components/student-chat-widget';
import { useAuth } from '@/providers/auth-provider';
import { LoadingState } from '@/components/ui/feedback';

export default function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const locale = (params?.locale as string) || 'ar';
  const { sidebarOpen } = useUIStore();
  const { user, loading, isLoggingOut } = useAuth();

  if (loading || isLoggingOut || !user || user.role !== 'student' || user.mustChangePassword) {
    return <LoadingState title={locale === 'ar' ? 'جارٍ التحقق من الجلسة...' : 'Checking session...'} />;
  }

  return (
    <div className="min-h-screen">
      {/* FCM push notifications initializer */}
      <FcmInitializer />
      
      {/* Sidebar — fixed to start (left in LTR, right in RTL) */}
      <StudentSidebar />

      {/* Main Content — offset by sidebar width from start */}
      <div
        className={cn(
          'flex min-h-screen flex-col transition-all duration-300',
          sidebarOpen ? 'md:ms-72' : 'md:ms-26',
        )}
      >
        <StudentHeader />
        <main className="flex-1 p-4 pt-6 md:p-6">
          {children}
        </main>

        <Footer role="student" locale={locale} />
      </div>

      {/* Student AI Chatbot Assistant */}
      <StudentChatWidget />
    </div>
  );
}
