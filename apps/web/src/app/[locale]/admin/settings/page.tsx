'use client';

import { Suspense, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Bot, Calendar, Settings, ShieldCheck } from 'lucide-react';
import { PageTitleBanner } from '@/components/ui/page-title-banner';
import { PageSkeletonLoader } from '@/components/ui/page-suspense-fallback';
import { PermissionGuard } from '@/components/ui/permission-guard';
import { Button } from '@/components/ui/button';
import { GpaRulesPanel } from '@/features/settings/components/gpa-rules-panel';
import { RegistrationTermsPanel } from '@/features/settings/components/registration-terms-panel';
import { AiSettingsPanel } from '@/features/settings/components/ai-settings-panel';
import { AdvisingRulesPanel } from '@/features/settings/components/advising-rules-panel';
import { GraduationCap } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { cn } from '@/lib/cn';

function AdminSettingsContent() {
  const params = useParams();
  const locale = params.locale as string;
  const isAr = locale === 'ar';
  const t = useTranslations('settings');
  const { user } = useAuth();
  const canAccessRules =
    user?.role === 'admin' ||
    Boolean(user?.permissions?.includes('advising.write')) ||
    Boolean(user?.permissions?.includes('study_plan.manage')) ||
    Boolean(user?.permissions?.includes('complaints.manage_settings'));

  const canAccessTerms =
    user?.role === 'admin' ||
    Boolean(user?.permissions?.includes('registration.write')) ||
    Boolean(user?.permissions?.includes('complaints.manage_settings'));

  const canAccessAi = user?.role === 'admin';

  const tabs = [
    ...(canAccessRules
      ? [
          {
            id: 'rules' as const,
            label: isAr ? 'قواعد الإرشاد والساعات والمعدل' : 'Advising & Course Rules',
            icon: GraduationCap,
            description: isAr
              ? 'ضوابط التوصية التلقائية، الساعات المعتمدة، وشرائح المعدل التراكمي'
              : 'Academic advising policies, credit hours, and GPA limits',
          },
        ]
      : []),
    ...(canAccessTerms
      ? [
          {
            id: 'terms' as const,
            label: isAr ? 'فصول وسنوات التسجيل' : 'Registration Terms',
            icon: Calendar,
            description: isAr ? 'مواعيد فتح وغلق فصول التسجيل والسنة المعتمدة' : 'Semesters & authoritative year',
          },
        ]
      : []),
    ...(canAccessAi
      ? [
          {
            id: 'ai' as const,
            label: isAr ? 'المرشد الذكي' : 'AI Advisor',
            icon: Bot,
            description: isAr ? 'إعدادات واستخدام المرشد الآلي للطلاب' : 'Chatbot & token usage settings',
          },
        ]
      : []),
  ];

  const defaultTab = tabs[0]?.id ?? 'rules';
  const [activeTabState, setActiveTabState] = useState<'rules' | 'terms' | 'ai'>(defaultTab);
  const activeTab = tabs.some((t) => t.id === activeTabState) ? activeTabState : defaultTab;
  const [rulesSubTab, setRulesSubTab] = useState<'advising' | 'gpa'>('advising');

  return (
    <div className="animate-fade-in space-y-6 p-2 md:p-6" dir={isAr ? 'rtl' : 'ltr'}>
      <PageTitleBanner
        title={t('pageTitle')}
        icon={<Settings className="h-5 w-5" />}
        subtitle={t('pageDescription')}
      />

      {/* Modern Tabs Navigation Bar */}
      <div className="flex flex-wrap gap-2.5 rounded-2xl border border-white/10 bg-card/60 p-1.5 backdrop-blur-sm shadow-sm">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTabState(tab.id)}
              className={cn(
                'flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-xs font-semibold transition-all duration-200 cursor-pointer',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-md ring-1 ring-primary/30'
                  : 'text-muted-foreground hover:bg-white/5 hover:text-foreground',
              )}
            >
              <Icon className={cn('h-4 w-4', isActive ? 'text-primary-foreground' : 'text-primary')} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      <div className="rounded-2xl border border-white/10 bg-card/80 p-5 md:p-6 text-start shadow-(--shadow-glow) backdrop-blur-sm">
        {activeTab === 'rules' ? (
          <div className="space-y-6">
            {/* Sub-tabs switcher */}
            <div className="inline-flex rounded-xl border border-white/10 bg-card/60 p-1 backdrop-blur-sm">
              <button
                type="button"
                onClick={() => setRulesSubTab('advising')}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium transition-all duration-200 cursor-pointer',
                  rulesSubTab === 'advising'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-white/5 hover:text-foreground',
                )}
              >
                <GraduationCap className="h-3.5 w-3.5" />
                <span>{isAr ? 'ضوابط التوصية والإرشاد' : 'Advising Engine Rules'}</span>
              </button>

              <button
                type="button"
                onClick={() => setRulesSubTab('gpa')}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium transition-all duration-200 cursor-pointer',
                  rulesSubTab === 'gpa'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-white/5 hover:text-foreground',
                )}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>{isAr ? 'شرائح الساعات والمعدل (GPA)' : 'GPA & Course Rules'}</span>
              </button>
            </div>

            {rulesSubTab === 'advising' ? (
              <AdvisingRulesPanel locale={locale} />
            ) : (
              <GpaRulesPanel locale={locale} />
            )}
          </div>
        ) : activeTab === 'terms' ? (
          <RegistrationTermsPanel locale={locale} />
        ) : (
          <AiSettingsPanel locale={locale} />
        )}
      </div>
    </div>
  );
}

const SETTINGS_PERMISSIONS = [
  'complaints.manage_settings',
  'advising.write',
  'registration.write',
  'study_plan.manage',
];

export default function SettingsPage() {
  return (
    <Suspense fallback={<PageSkeletonLoader />}>
      <PermissionGuard permissions={SETTINGS_PERMISSIONS} anyOf>
        <AdminSettingsContent />
      </PermissionGuard>
    </Suspense>
  );
}
