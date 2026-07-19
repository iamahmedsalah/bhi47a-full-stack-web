'use client';

import React, { useState, Suspense } from 'react';
import { useParams } from 'next/navigation';
import { Settings, ShieldCheck, Calendar, Users } from 'lucide-react';

import { PageTitleBanner } from '@/components/ui/page-title-banner';
import { PageSkeletonLoader } from '@/components/ui/page-suspense-fallback';
import { PermissionGuard } from '@/components/ui/permission-guard';
import { Button } from '@/components/ui/button';
import { GpaRulesPanel } from '@/features/settings/components/gpa-rules-panel';
import { RegistrationTermsPanel } from '@/features/settings/components/registration-terms-panel';
import { StaffPermissionsPanel } from '@/features/settings/components/staff-permissions-panel';

function AdminSettingsContent() {
  const params = useParams();
  const locale = params.locale as string;
  const isAr = locale === 'ar';
  const [activeTab, setActiveTab] = useState<'gpa' | 'terms' | 'permissions'>('gpa');

  return (
    <div className="animate-fade-in space-y-6 p-2 md:p-6">
      <PageTitleBanner
        title={isAr ? 'إعدادات النظام والأذونات' : 'System Settings & Permissions'}
        icon={<Settings className="h-5 w-5" />}
        subtitle="Manage registration limits, GPA advising rules, term windows, and staff account permissions."
      />

      <div className="flex flex-wrap gap-2 border-b border-border/70 pb-3">
        <Button
          variant={activeTab === 'gpa' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('gpa')}
          className="gap-2 cursor-pointer"
        >
          <ShieldCheck className="h-4 w-4" />
          {isAr ? 'قواعد GPA والحدود' : 'GPA & Course Rules'}
        </Button>
        <Button
          variant={activeTab === 'terms' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('terms')}
          className="gap-2 cursor-pointer"
        >
          <Calendar className="h-4 w-4" />
          {isAr ? 'مواعيد التسجيل' : 'Registration Terms'}
        </Button>
        <Button
          variant={activeTab === 'permissions' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('permissions')}
          className="gap-2 cursor-pointer"
        >
          <Users className="h-4 w-4" />
          {isAr ? 'إدارة صلاحيات الموظفين' : 'Staff Permissions'}
        </Button>
      </div>

      <div className="rounded-xl border border-border/70 bg-card/90 p-6 shadow-[var(--shadow-glow)] text-start">
        {activeTab === 'gpa' ? (
          <GpaRulesPanel locale={locale} />
        ) : activeTab === 'terms' ? (
          <RegistrationTermsPanel locale={locale} />
        ) : (
          <StaffPermissionsPanel locale={locale} />
        )}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<PageSkeletonLoader />}>
      <PermissionGuard permission="complaints.manage_settings">
        <AdminSettingsContent />
      </PermissionGuard>
    </Suspense>
  );
}
