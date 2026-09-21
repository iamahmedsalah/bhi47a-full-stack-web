'use client';

import React, { useMemo } from 'react';
import { useParams, usePathname } from 'next/navigation';
import AdminSidebar from '@/components/admin/sidebar';
import AdminHeader from '@/components/admin/header';
import { Footer } from '@/components/ui/footer';
import { useUIStore } from '@/store/ui-store';
import { useAuth } from '@/providers/auth-provider';
import { RestrictedFeature } from '@/components/admin/restricted-feature';
import { PERMISSIONS } from '@student-portal/shared';
import { cn } from '@/lib/cn';

interface AdminRouteRule {
  pattern: RegExp;
  permission?: string;
  adminOnly?: boolean;
  nameAr: string;
  nameEn: string;
}

const ADMIN_ROUTE_RULES: AdminRouteRule[] = [
  {
    pattern: /^\/[^/]+\/admin\/academic-advising/,
    permission: PERMISSIONS.ADVISING_READ,
    nameAr: 'الإرشاد والتسجيل الأكاديمي',
    nameEn: 'Academic Advising & Course Registration',
  },
  {
    pattern: /^\/[^/]+\/admin\/registrations/,
    permission: PERMISSIONS.ADVISING_READ,
    nameAr: 'تسجيل المقررات',
    nameEn: 'Course Registrations',
  },
  {
    pattern: /^\/[^/]+\/admin\/students/,
    permission: PERMISSIONS.STUDENTS_READ,
    nameAr: 'إدارة شؤون الطلاب',
    nameEn: 'Students Management',
  },
  {
    pattern: /^\/[^/]+\/admin\/attendance/,
    permission: PERMISSIONS.ATTENDANCE_READ,
    nameAr: 'الحضور والغياب الذكي',
    nameEn: 'Smart QR Attendance',
  },
  {
    pattern: /^\/[^/]+\/admin\/courses/,
    permission: PERMISSIONS.COURSES_READ,
    nameAr: 'إدارة المواد والمقررات الدراسية',
    nameEn: 'Courses Management',
  },
  {
    pattern: /^\/[^/]+\/admin\/grades/,
    permission: PERMISSIONS.GRADES_READ,
    nameAr: 'إدارة الدرجات والنتائج',
    nameEn: 'Grades & Results Management',
  },
  {
    pattern: /^\/[^/]+\/admin\/academic-emails/,
    permission: PERMISSIONS.ACADEMIC_EMAILS_READ,
    nameAr: 'البريد الأكاديمي للطلاب',
    nameEn: 'Academic Emails Management',
  },
  {
    pattern: /^\/[^/]+\/admin\/complaints/,
    permission: PERMISSIONS.COMPLAINTS_READ,
    nameAr: 'إدارة الشكاوى والتذاكر الأكاديمية',
    nameEn: 'Complaints & Inquiries',
  },
  {
    pattern: /^\/[^/]+\/admin\/uploads/,
    permission: PERMISSIONS.UPLOADS_IMPORT,
    nameAr: 'رفع واستيراد البيانات',
    nameEn: 'Data Uploads & Import',
  },
  {
    pattern: /^\/[^/]+\/admin\/exam-schedules/,
    permission: PERMISSIONS.EXAM_SCHEDULES_READ,
    nameAr: 'جداول الامتحانات وتوزيع اللجان',
    nameEn: 'Exam Schedules & Hall Allocations',
  },
  {
    pattern: /^\/[^/]+\/admin\/settings/,
    permission: PERMISSIONS.COMPLAINTS_MANAGE_SETTINGS,
    nameAr: 'إعدادات النظام الأكاديمي',
    nameEn: 'System Settings',
  },
  {
    pattern: /^\/[^/]+\/admin\/notifications/,
    permission: PERMISSIONS.NOTIFICATIONS_READ,
    nameAr: 'إدارة الإشعارات الفورية',
    nameEn: 'FCM Push Notifications',
  },
  {
    pattern: /^\/[^/]+\/admin\/staff/,
    adminOnly: true,
    nameAr: 'إدارة حسابات الموظفين والصلاحيات',
    nameEn: 'Staff & Permissions Management',
  },
  {
    pattern: /^\/[^/]+\/admin\/chat-audit/,
    adminOnly: true,
    nameAr: 'سجل محادثات المساعد الذكي',
    nameEn: 'AI Chat Audit',
  },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const pathname = usePathname();
  const locale = (params?.locale as string) || 'ar';
  const isArabic = locale.startsWith('ar');
  const { sidebarOpen } = useUIStore();
  const { user, loading } = useAuth();

  // Route-level staff permission validation
  const restriction = useMemo(() => {
    if (loading || !user || user.role === 'admin') {
      return null;
    }

    if (user.role === 'staff') {
      for (const rule of ADMIN_ROUTE_RULES) {
        if (rule.pattern.test(pathname)) {
          if (rule.adminOnly) {
            return {
              featureName: isArabic ? rule.nameAr : rule.nameEn,
              description: isArabic
                ? 'هذا القسم مخصص لمدير النظام فقط (Administrator Only).'
                : 'This section is strictly reserved for Administrators.',
            };
          }
          if (rule.permission && !user.permissions?.includes(rule.permission)) {
            return {
              permission: rule.permission,
              featureName: isArabic ? rule.nameAr : rule.nameEn,
            };
          }
          break;
        }
      }
    }

    return null;
  }, [loading, user, pathname, isArabic]);

  return (
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
          {restriction ? (
            <RestrictedFeature
              permission={restriction.permission}
              featureName={restriction.featureName}
              description={restriction.description}
            />
          ) : (
            children
          )}
        </main>
        
        <Footer role="admin" locale={locale} />
      </div>
    </div>
  );
}
