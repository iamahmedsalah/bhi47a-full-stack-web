'use client';

import React, { useState, Suspense } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import api, { getApiErrorMessage } from '@/lib/api';
import { 
  Settings, 
  Loader2, 
  Plus, 
  Edit2, 
  Trash2, 
  Key, 
  CheckCircle, 
  ShieldAlert, 
  Users, 
  ShieldCheck, 
  Lock, 
  CheckSquare, 
  Square 
} from 'lucide-react';
import { toast } from 'sonner';

// Reusable components
import { PageTitleBanner } from '@/components/ui/page-title-banner';
import { DataTableShell, type ColumnDef } from '@/components/ui/data-table-shell';
import { StatusBadge } from '@/components/ui/status-badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { PageSkeletonLoader } from '@/components/ui/page-suspense-fallback';
import { GlassCard } from '@/components/ui/glass-card';
import { useAuth } from '@/providers/auth-provider';

// shadcn / UI components
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';

interface GpaRule {
  _id: string;
  minGpa: number;
  maxGpa: number;
  maxCreditHours: number;
  requiresAdvisor: boolean;
  isActive: boolean;
}

const ALL_PERMISSIONS_GROUPS = [
  {
    category: { en: 'Students Management', ar: 'إدارة الطلاب' },
    permissions: [
      { key: 'students.read', label: { en: 'View Students List', ar: 'عرض قوائم الطلاب' } },
      { key: 'students.write', label: { en: 'Create/Edit Students', ar: 'إضافة وتعديل بيانات الطلاب' } },
      { key: 'students.reset_password', label: { en: 'Reset Student Passwords', ar: 'إعادة تعيين كلمات مرور الطلاب' } },
    ]
  },
  {
    category: { en: 'Courses Management', ar: 'إدارة المواد والمساقات' },
    permissions: [
      { key: 'courses.read', label: { en: 'View Courses List', ar: 'عرض قوائم المواد الدراسية' } },
      { key: 'courses.write', label: { en: 'Add/Edit Courses', ar: 'إضافة وتعديل المواد الدراسية' } },
    ]
  },
  {
    category: { en: 'Grades & Academic Profiles', ar: 'الدرجات والملفات الأكاديمية' },
    permissions: [
      { key: 'grades.read', label: { en: 'View Grades', ar: 'عرض كشوف ورصد الدرجات' } },
      { key: 'grades.write', label: { en: 'Update Grades', ar: 'تحديث ورصد درجات الطلاب' } },
      { key: 'grades.delete', label: { en: 'Delete Grades', ar: 'حذف درجات الطلاب المسجلة' } },
    ]
  },
  {
    category: { en: 'Academic Emails', ar: 'البريد الأكاديمي للطلاب' },
    permissions: [
      { key: 'academic_emails.read', label: { en: 'View Academic Emails', ar: 'عرض إيميلات الطلاب الأكاديمية' } },
      { key: 'academic_emails.write', label: { en: 'Create/Deactivate Emails', ar: 'إنشاء وتعطيل الإيميلات الأكاديمية' } },
    ]
  },
  {
    category: { en: 'Complaints & Inquiries', ar: 'الشكاوى والاستفسارات' },
    permissions: [
      { key: 'complaints.read', label: { en: 'View Student Tickets', ar: 'عرض طلبات وشكاوى الطلاب' } },
      { key: 'complaints.reply', label: { en: 'Reply to Tickets', ar: 'الرد على الشكاوى والاستفسارات' } },
      { key: 'complaints.manage_settings', label: { en: 'Configure Tickets Settings', ar: 'إدارة إعدادات وترميز الشكاوى' } },
    ]
  },
  {
    category: { en: 'General Operations', ar: 'العمليات العامة وإدارة الدفعات' },
    permissions: [
      { key: 'emails.read', label: { en: 'View System E-mail Logs', ar: 'عرض سجل البريد الصادر للمعهد' } },
      { key: 'emails.send', label: { en: 'Send Emails', ar: 'إرسال بريد إلكتروني عام' } },
      { key: 'notifications.read', label: { en: 'View Push Logs', ar: 'عرض سجل إشعارات الهاتف' } },
      { key: 'notifications.send', label: { en: 'Send Push Notifications', ar: 'إرسال إشعارات عامة للهاتف' } },
      { key: 'faqs.read', label: { en: 'View FAQs & AI Chat', ar: 'عرض الأسئلة الشائعة ومحادثات البوت' } },
      { key: 'faqs.write', label: { en: 'Manage FAQ Questions', ar: 'إدارة الأسئلة الشائعة للروبوت' } },
      { key: 'uploads.import', label: { en: 'Bulk Excel Import', ar: 'استيراد البيانات ورفع ملفات Excel' } },
      { key: 'exam_schedules.read', label: { en: 'View Exam Schedules', ar: 'عرض جداول وأماكن الامتحانات' } },
      { key: 'exam_schedules.write', label: { en: 'Manage Exam Schedules', ar: 'تعديل وإدارة جداول وأماكن الامتحانات' } },
    ]
  }
];

function SettingsPageContent() {
  const t = useTranslations('settings');
  const tCommon = useTranslations('common');
  const tAuth = useTranslations('auth');
  const params = useParams();
  const locale = params.locale as string;
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<'gpa' | 'staffPermissions' | 'password'>('gpa');

  // GPA Rules States
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedRule, setSelectedRule] = useState<GpaRule | null>(null);

  // GPA Rule Form States
  const [minGpa, setMinGpa] = useState<string>('0');
  const [maxGpa, setMaxGpa] = useState<string>('4');
  const [maxCreditHours, setMaxCreditHours] = useState<string>('18');
  const [requiresAdvisor, setRequiresAdvisor] = useState<boolean>(false);
  const [ruleActive, setRuleActive] = useState<boolean>(true);
  const [ruleError, setRuleError] = useState<string>('');
  const [ruleLoading, setRuleLoading] = useState<boolean>(false);

  // Change Password Form States
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passError, setPassError] = useState('');
  const [passSuccess, setPassSuccess] = useState('');
  const [passLoading, setPassLoading] = useState(false);

  // Staff Permissions States
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<any>(null);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [savePermissionsLoading, setSavePermissionsLoading] = useState(false);

  // Query to fetch GPA Rules
  const gpaRulesQuery = useQuery({
    queryKey: ['admin-gpa-rules'],
    queryFn: async () => {
      const res = await api.get<GpaRule[]>('/admin/gpa-rules');
      return res.data;
    },
  });

  // Query to fetch staff list
  const staffQuery = useQuery({
    queryKey: ['admin-staff-users'],
    queryFn: async () => {
      const res = await api.get<any[]>('/admin/staff');
      return res.data;
    },
    enabled: user?.role === 'admin' && activeTab === 'staffPermissions',
  });

  const rules = gpaRulesQuery.data || [];
  const staffList = staffQuery.data || [];

  const openAddModal = () => {
    setMinGpa('0');
    setMaxGpa('4');
    setMaxCreditHours('18');
    setRequiresAdvisor(false);
    setRuleActive(true);
    setRuleError('');
    setIsAddOpen(true);
  };

  const openEditModal = (rule: GpaRule) => {
    setSelectedRule(rule);
    setMinGpa(rule.minGpa.toString());
    setMaxGpa(rule.maxGpa.toString());
    setMaxCreditHours(rule.maxCreditHours.toString());
    setRequiresAdvisor(rule.requiresAdvisor);
    setRuleActive(rule.isActive);
    setRuleError('');
    setIsEditOpen(true);
  };

  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setRuleError('');
    const minGpaNum = parseFloat(minGpa);
    const maxGpaNum = parseFloat(maxGpa);
    const maxHoursNum = parseInt(maxCreditHours);

    if (isNaN(minGpaNum) || minGpaNum < 0 || minGpaNum > 4) {
      setRuleError(locale === 'ar' ? 'المعدل الأدنى غير صحيح (0-4)' : 'Invalid Min GPA (0-4)');
      return;
    }
    if (isNaN(maxGpaNum) || maxGpaNum < 0 || maxGpaNum > 4) {
      setRuleError(locale === 'ar' ? 'المعدل الأقصى غير صحيح (0-4)' : 'Invalid Max GPA (0-4)');
      return;
    }
    if (minGpaNum > maxGpaNum) {
      setRuleError(locale === 'ar' ? 'يجب أن يكون المعدل الأدنى أقل من أو يساوي الأقصى' : 'Min GPA must be <= Max GPA');
      return;
    }
    if (isNaN(maxHoursNum) || maxHoursNum < 1) {
      setRuleError(locale === 'ar' ? 'يجب ألا يقل عدد الساعات عن 1' : 'Credit Hours must be at least 1');
      return;
    }

    setRuleLoading(true);
    try {
      await api.post('/admin/gpa-rules', {
        minGpa: minGpaNum,
        maxGpa: maxGpaNum,
        maxCreditHours: maxHoursNum,
        requiresAdvisor,
        isActive: ruleActive,
      });
      setIsAddOpen(false);
      toast.success(t('saveSuccess'));
      void queryClient.invalidateQueries({ queryKey: ['admin-gpa-rules'] });
    } catch (err: unknown) {
      setRuleError(getApiErrorMessage(err, locale === 'ar' ? 'فشل حفظ القاعدة' : 'Failed to save rule'));
    } finally {
      setRuleLoading(false);
    }
  };

  const handleEditRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRule) return;
    setRuleError('');

    const minGpaNum = parseFloat(minGpa);
    const maxGpaNum = parseFloat(maxGpa);
    const maxHoursNum = parseInt(maxCreditHours);

    if (isNaN(minGpaNum) || minGpaNum < 0 || minGpaNum > 4) {
      setRuleError(locale === 'ar' ? 'المعدل الأدنى غير صحيح (0-4)' : 'Invalid Min GPA (0-4)');
      return;
    }
    if (isNaN(maxGpaNum) || maxGpaNum < 0 || maxGpaNum > 4) {
      setRuleError(locale === 'ar' ? 'المعدل الأقصى غير صحيح (0-4)' : 'Invalid Max GPA (0-4)');
      return;
    }
    if (minGpaNum > maxGpaNum) {
      setRuleError(locale === 'ar' ? 'يجب أن يكون المعدل الأدنى أقل من أو يساوي الأقصى' : 'Min GPA must be <= Max GPA');
      return;
    }
    if (isNaN(maxHoursNum) || maxHoursNum < 1) {
      setRuleError(locale === 'ar' ? 'يجب ألا يقل عدد الساعات عن 1' : 'Credit Hours must be at least 1');
      return;
    }

    setRuleLoading(true);
    try {
      await api.patch(`/admin/gpa-rules/${selectedRule._id}`, {
        minGpa: minGpaNum,
        maxGpa: maxGpaNum,
        maxCreditHours: maxHoursNum,
        requiresAdvisor,
        isActive: ruleActive,
      });
      setIsEditOpen(false);
      toast.success(t('saveSuccess'));
      void queryClient.invalidateQueries({ queryKey: ['admin-gpa-rules'] });
    } catch (err: unknown) {
      setRuleError(getApiErrorMessage(err, locale === 'ar' ? 'فشل تحديث القاعدة' : 'Failed to update rule'));
    } finally {
      setRuleLoading(false);
    }
  };

  const handleDeleteRule = async (id: string) => {
    try {
      await api.delete(`/admin/gpa-rules/${id}`);
      toast.success(locale === 'ar' ? 'تم حذف القاعدة بنجاح' : 'Rule deleted successfully');
      void queryClient.invalidateQueries({ queryKey: ['admin-gpa-rules'] });
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    }
  };

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassError('');
    setPassSuccess('');

    if (!currentPassword) {
      setPassError(locale === 'ar' ? 'كلمة المرور الحالية مطلوبة' : 'Current password is required');
      return;
    }
    if (newPassword.length < 8) {
      setPassError(locale === 'ar' ? 'يجب ألا تقل كلمة المرور الجديدة عن 8 أحرف' : 'New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPassError(locale === 'ar' ? 'كلمات المرور الجديدة غير متطابقة' : 'Passwords do not match');
      return;
    }

    setPassLoading(true);
    try {
      const res = await api.post<{ message: string }>('/auth/change-password', {
        currentPassword,
        newPassword,
      });
      setPassSuccess(res.data?.message || (locale === 'ar' ? 'تم تغيير كلمة المرور بنجاح' : 'Password changed successfully'));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success(locale === 'ar' ? 'تم تغيير كلمة المرور بنجاح' : 'Password changed successfully');
    } catch (err: unknown) {
      setPassError(getApiErrorMessage(err, locale === 'ar' ? 'فشل تغيير كلمة المرور' : 'Failed to change password'));
    } finally {
      setPassLoading(false);
    }
  };

  const handleSavePermissions = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaff) return;
    setSavePermissionsLoading(true);

    try {
      await api.patch(`/admin/staff/${selectedStaff._id}/permissions`, {
        permissions: selectedPermissions,
      });
      setIsStaffModalOpen(false);
      toast.success(locale === 'ar' ? 'تم حفظ الصلاحيات بنجاح' : 'Permissions updated successfully');
      void queryClient.invalidateQueries({ queryKey: ['admin-staff-users'] });
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, locale === 'ar' ? 'فشل حفظ الصلاحيات' : 'Failed to save permissions'));
    } finally {
      setSavePermissionsLoading(false);
    }
  };

  const togglePermission = (permKey: string) => {
    setSelectedPermissions((prev) =>
      prev.includes(permKey) ? prev.filter((k) => k !== permKey) : [...prev, permKey]
    );
  };

  const selectAllPermissions = () => {
    const allKeys = ALL_PERMISSIONS_GROUPS.flatMap((g) => g.permissions.map((p) => p.key));
    setSelectedPermissions(allKeys);
  };

  const clearAllPermissions = () => {
    setSelectedPermissions([]);
  };

  // GPA columns definitions
  const columns: ColumnDef<GpaRule>[] = [
    {
      key: 'gpaRange',
      header: locale === 'ar' ? 'نطاق المعدل (GPA)' : 'GPA Range',
      render: (r) => (
        <TableCell className="p-4 font-mono font-bold text-foreground">
          {r.minGpa.toFixed(2)} - {r.maxGpa.toFixed(2)}
        </TableCell>
      ),
    },
    {
      key: 'maxCreditHours',
      header: t('maxCreditHours'),
      render: (r) => (
        <TableCell className="p-4 font-mono font-semibold text-primary">
          {r.maxCreditHours} {locale === 'ar' ? 'ساعة' : 'Hrs'}
        </TableCell>
      ),
    },
    {
      key: 'requiresAdvisor',
      header: t('requiresAdvisor'),
      render: (r) => (
        <TableCell className="p-4">
          <StatusBadge
            label={r.requiresAdvisor ? (locale === 'ar' ? 'نعم' : 'Yes') : (locale === 'ar' ? 'لا' : 'No')}
            variant={r.requiresAdvisor ? 'warning' : 'success'}
          />
        </TableCell>
      ),
    },
    {
      key: 'isActive',
      header: tCommon('status'),
      render: (r) => (
        <TableCell className="p-4">
          <StatusBadge
            label={r.isActive ? t('ruleActive') : t('ruleInactive')}
            variant={r.isActive ? 'success' : 'neutral'}
          />
        </TableCell>
      ),
    },
    {
      key: 'actions',
      header: tCommon('actions'),
      className: 'text-center',
      render: (r) => (
        <TableCell className="p-4 text-center">
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => openEditModal(r)}
              className="flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-muted transition-all hover:border-primary/30 hover:text-primary"
            >
              <Edit2 className="w-3.5 h-3.5" />
              <span>{tCommon('edit')}</span>
            </button>

            <ConfirmDialog
              trigger={
                <button className="flex items-center gap-1 rounded-lg border border-red-500/20 px-3 py-1.5 text-xs text-red-400 transition-all hover:border-red-500 hover:text-red-500">
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{tCommon('delete')}</span>
                </button>
              }
              title={tCommon('deleteConfirmTitle')}
              description={tCommon('deleteConfirmMessage')}
              confirmLabel={tCommon('delete')}
              cancelLabel={tCommon('cancel')}
              onConfirm={() => handleDeleteRule(r._id)}
            />
          </div>
        </TableCell>
      ),
    },
  ];

  // Staff Table columns definitions
  const staffColumns: ColumnDef<any>[] = [
    {
      key: 'userCode',
      header: locale === 'ar' ? 'كود المستخدم' : 'User Code',
      render: (s) => (
        <TableCell className="p-4 font-mono font-bold text-foreground">
          {s.userCode || 'STF-0000'}
        </TableCell>
      ),
    },
    {
      key: 'name',
      header: locale === 'ar' ? 'الاسم' : 'Name',
      render: (s) => (
        <TableCell className="p-4 font-semibold text-foreground">
          {s.name}
        </TableCell>
      ),
    },
    {
      key: 'email',
      header: locale === 'ar' ? 'البريد الإلكتروني' : 'Email Address',
      render: (s) => (
        <TableCell className="p-4 text-muted-foreground font-semibold">
          {s.email || '-'}
        </TableCell>
      ),
    },
    {
      key: 'permissionsCount',
      header: locale === 'ar' ? 'عدد الصلاحيات' : 'Permissions Count',
      render: (s) => (
        <TableCell className="p-4">
          <StatusBadge
            label={
              locale === 'ar'
                ? `${s.permissions?.length || 0} صلاحيات`
                : `${s.permissions?.length || 0} Perms`
            }
            variant={(s.permissions?.length || 0) > 0 ? 'success' : 'neutral'}
          />
        </TableCell>
      ),
    },
    {
      key: 'actions',
      header: tCommon('actions'),
      className: 'text-center',
      render: (s) => (
        <TableCell className="p-4 text-center">
          <button
            onClick={() => {
              setSelectedStaff(s);
              setSelectedPermissions(s.permissions || []);
              setIsStaffModalOpen(true);
            }}
            className="flex items-center gap-1.5 mx-auto rounded-lg border border-white/10 px-3 py-1.5 text-xs text-muted transition-all hover:border-primary/30 hover:text-primary cursor-pointer"
          >
            <Key className="w-3.5 h-3.5 text-primary" />
            <span>{locale === 'ar' ? 'تعديل الصلاحيات' : 'Edit Permissions'}</span>
          </button>
        </TableCell>
      ),
    },
  ];

  return (
    <div className="animate-fade-in space-y-6 p-2 md:p-6" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      {/* Title */}
      <PageTitleBanner title={t('title')} icon={<Settings className="h-5 w-5" />} subtitle={t('title')} />

      {/* Tabs */}
      <div className="flex border-b border-border gap-2">
        <button
          onClick={() => setActiveTab('gpa')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'gpa'
              ? 'border-primary text-primary font-bold bg-primary/5'
              : 'border-transparent text-muted hover:text-foreground hover:bg-secondary/10'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          <span>{t('gpaRules')}</span>
        </button>

        {user?.role === 'admin' && (
          <button
            onClick={() => setActiveTab('staffPermissions')}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'staffPermissions'
                ? 'border-primary text-primary font-bold bg-primary/5'
                : 'border-transparent text-muted hover:text-foreground hover:bg-secondary/10'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>{locale === 'ar' ? 'صلاحيات الموظفين' : 'Staff Permissions'}</span>
          </button>
        )}

        <button
          onClick={() => setActiveTab('password')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'password'
              ? 'border-primary text-primary font-bold bg-primary/5'
              : 'border-transparent text-muted hover:text-foreground hover:bg-secondary/10'
          }`}
        >
          <Key className="w-4 h-4" />
          <span>{t('changePassword')}</span>
        </button>
      </div>

      {activeTab === 'gpa' && (
        <div className="space-y-6 text-start">
          <div className="flex justify-between items-center gap-4 flex-col sm:flex-row">
            <p className="text-sm text-muted">
              {locale === 'ar'
                ? 'تحكم في القواعد المنظمة لعدد الساعات المعتمدة التي يسجلها الطالب بناءً على معدله التراكمي'
                : 'Configure GPA registration rules which regulate course registration hourly limits based on GPA.'}
            </p>
            <Button
              onClick={openAddModal}
              className="flex items-center gap-2 rounded-xl bg-primary font-semibold text-white shadow-lg hover:bg-primary-hover active:scale-[0.98] shrink-0"
            >
              <Plus className="h-5 w-5" />
              <span>{t('addRule')}</span>
            </Button>
          </div>

          <DataTableShell
            columns={columns}
            data={rules}
            keyExtractor={(r) => r._id}
            isLoading={gpaRulesQuery.isLoading}
            isError={gpaRulesQuery.isError}
            errorMessage={tCommon('errorLoading')}
            emptyMessage={tCommon('noData')}
            loadingMessage={tCommon('loading')}
            onRetry={() => gpaRulesQuery.refetch()}
            retryLabel={tCommon('retry')}
          />
        </div>
      )}

      {activeTab === 'staffPermissions' && user?.role === 'admin' && (
        <div className="space-y-6 text-start">
          <div>
            <p className="text-sm text-muted mb-2">
              {locale === 'ar'
                ? 'قم بإدارة وتعديل الصلاحيات الممنوحة لكل موظف دعم للتحكم في الأقسام والصفحات التي يمكنه الدخول إليها.'
                : 'Manage and modify the access control permissions granted to support staff accounts.'}
            </p>
          </div>

          <DataTableShell
            columns={staffColumns}
            data={staffList}
            keyExtractor={(s) => s._id}
            isLoading={staffQuery.isLoading}
            isError={staffQuery.isError}
            errorMessage={tCommon('errorLoading')}
            emptyMessage={tCommon('noData')}
            loadingMessage={tCommon('loading')}
            onRetry={() => staffQuery.refetch()}
            retryLabel={tCommon('retry')}
          />
        </div>
      )}

      {activeTab === 'password' && (
        <div className="max-w-md mx-auto text-start">
          <GlassCard className="p-6 border border-white/5 shadow-xl space-y-6">
            <div className="text-center space-y-2">
              <Key className="w-12 h-12 text-primary mx-auto opacity-80" />
              <h3 className="text-lg font-bold text-foreground">{t('changePassword')}</h3>
              <p className="text-xs text-muted-foreground">
                {locale === 'ar' ? 'قم بتحديث كلمة المرور لحماية حسابك من الاختراق.' : 'Update password to secure your portal account.'}
              </p>
            </div>

            {passError && (
              <div className="bg-danger/10 border border-danger/30 text-danger rounded-xl px-4 py-3 text-xs text-center font-medium">
                {passError}
              </div>
            )}

            {passSuccess && (
              <div className="bg-success/10 border border-success/30 text-success rounded-xl px-4 py-3 text-xs text-center font-medium flex items-center justify-center gap-2">
                <CheckCircle className="w-4 h-4" />
                <span>{passSuccess}</span>
              </div>
            )}

            <form onSubmit={handleChangePasswordSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted block text-start">{tAuth('currentPassword')}</label>
                <Input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="********"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted block text-start">{tAuth('newPassword')}</label>
                <Input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="********"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted block text-start">{tAuth('confirmPassword')}</label>
                <Input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="********"
                />
              </div>

              <Button
                type="submit"
                disabled={passLoading}
                className="w-full bg-primary hover:bg-primary-hover text-white font-semibold flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] h-11"
              >
                {passLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{locale === 'ar' ? 'تحديث كلمة المرور' : 'Update Password'}</span>
              </Button>
            </form>
          </GlassCard>
        </div>
      )}

      {/* GPA Rule Add Modal */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="glass max-w-md border border-white/10 rounded-2xl">
          <DialogHeader className="border-b border-border pb-4">
            <DialogTitle className="text-foreground">{t('addRule')}</DialogTitle>
            <DialogDescription className="sr-only">
              إضافة قاعدة معدل تراكمي جديدة لتسجيل المواد
            </DialogDescription>
          </DialogHeader>

          {ruleError && (
            <div className="bg-danger/10 border border-danger/30 text-danger rounded-xl px-4 py-3 text-sm">
              {ruleError}
            </div>
          )}

          <form onSubmit={handleAddRule} className="space-y-4 pt-4 text-start">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted">{t('minGpa')} *</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="4"
                  required
                  value={minGpa}
                  onChange={(e) => setMinGpa(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted">{t('maxGpa')} *</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="4"
                  required
                  value={maxGpa}
                  onChange={(e) => setMaxGpa(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted">{t('maxCreditHours')} *</label>
              <Input
                type="number"
                min="1"
                required
                value={maxCreditHours}
                onChange={(e) => setMaxCreditHours(e.target.value)}
                className="font-mono text-sm"
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="requiresAdvisorAdd"
                checked={requiresAdvisor}
                onChange={(e) => setRequiresAdvisor(e.target.checked)}
                className="h-4 w-4 rounded-full border-input-border bg-input text-primary focus:ring-primary cursor-pointer"
              />
              <label htmlFor="requiresAdvisorAdd" className="text-sm font-semibold text-foreground cursor-pointer">
                {t('requiresAdvisor')}
              </label>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isActiveAdd"
                checked={ruleActive}
                onChange={(e) => setRuleActive(e.target.checked)}
                className="h-4 w-4 rounded-full border-input-border bg-input text-primary focus:ring-primary cursor-pointer"
              />
              <label htmlFor="isActiveAdd" className="text-sm font-semibold text-foreground cursor-pointer">
                {locale === 'ar' ? 'نشطة (مفعلة للاستخدام)' : 'Active (Available for use)'}
              </label>
            </div>

            <DialogFooter className="border-t border-border pt-4 mt-6 gap-2">
              <Button variant="secondary" type="button" onClick={() => setIsAddOpen(false)}>
                {tCommon('cancel')}
              </Button>
              <Button
                type="submit"
                disabled={ruleLoading}
                className="bg-primary hover:bg-primary-hover text-white font-semibold flex items-center gap-2"
              >
                {ruleLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                {tCommon('save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* GPA Rule Edit Modal */}
      {selectedRule && (
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent className="glass max-w-md border border-white/10 rounded-2xl">
            <DialogHeader className="border-b border-border pb-4">
              <DialogTitle className="text-foreground">{t('editRule')}</DialogTitle>
              <DialogDescription className="sr-only">
                تعديل قاعدة المعدل التراكمي ونطاق الساعات المعتمدة
              </DialogDescription>
            </DialogHeader>

            {ruleError && (
              <div className="bg-danger/10 border border-danger/30 text-danger rounded-xl px-4 py-3 text-sm">
                {ruleError}
              </div>
            )}

            <form onSubmit={handleEditRule} className="space-y-4 pt-4 text-start">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted">{t('minGpa')} *</label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="4"
                    required
                    value={minGpa}
                    onChange={(e) => setMinGpa(e.target.value)}
                    className="font-mono text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted">{t('maxGpa')} *</label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="4"
                    required
                    value={maxGpa}
                    onChange={(e) => setMaxGpa(e.target.value)}
                    className="font-mono text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted">{t('maxCreditHours')} *</label>
                <Input
                  type="number"
                  min="1"
                  required
                  value={maxCreditHours}
                  onChange={(e) => setMaxCreditHours(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="requiresAdvisorEdit"
                  checked={requiresAdvisor}
                  onChange={(e) => setRequiresAdvisor(e.target.checked)}
                  className="h-4 w-4 rounded-full border-input-border bg-input text-primary focus:ring-primary cursor-pointer"
                />
                <label htmlFor="requiresAdvisorEdit" className="text-sm font-semibold text-foreground cursor-pointer">
                  {t('requiresAdvisor')}
                </label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isActiveEdit"
                  checked={ruleActive}
                  onChange={(e) => setRuleActive(e.target.checked)}
                  className="h-4 w-4 rounded-full border-input-border bg-input text-primary focus:ring-primary cursor-pointer"
                />
                <label htmlFor="isActiveEdit" className="text-sm font-semibold text-foreground cursor-pointer">
                  {locale === 'ar' ? 'نشطة (مفعلة للاستخدام)' : 'Active (Available for use)'}
                </label>
              </div>

              <DialogFooter className="border-t border-border pt-4 mt-6 gap-2">
                <Button variant="secondary" type="button" onClick={() => setIsEditOpen(false)}>
                  {tCommon('cancel')}
                </Button>
                <Button
                  type="submit"
                  disabled={ruleLoading}
                  className="bg-primary hover:bg-primary-hover text-white font-semibold flex items-center gap-2"
                >
                  {ruleLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {tCommon('save')}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Staff Permissions Dialog Modal */}
      {selectedStaff && (
        <Dialog open={isStaffModalOpen} onOpenChange={setIsStaffModalOpen}>
          <DialogContent className="glass max-w-2xl border border-white/10 rounded-2xl max-h-[85vh] flex flex-col">
            <DialogHeader className="border-b border-border pb-4">
              <DialogTitle className="text-foreground flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-primary" />
                <span>
                  {locale === 'ar' 
                    ? `تعديل صلاحيات: ${selectedStaff.name}` 
                    : `Edit Permissions: ${selectedStaff.name}`}
                </span>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground pt-1">
                {locale === 'ar'
                  ? `قم باختيار أو إلغاء الصلاحيات المتاحة للمستخدم (${selectedStaff.userCode || 'STF-0000'})`
                  : `Assign or lift permissions from the staff account (${selectedStaff.userCode || 'STF-0000'})`}
              </DialogDescription>
            </DialogHeader>

            {/* Quick Actions */}
            <div className="flex gap-2 justify-end px-1 pt-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={selectAllPermissions} 
                className="text-xs border-white/5 hover:bg-secondary/30 h-8 font-semibold"
              >
                {locale === 'ar' ? 'تفعيل الكل (فتح جميع الصلاحيات)' : 'Select All (Open)'}
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={clearAllPermissions} 
                className="text-xs border-red-500/10 text-red-400 hover:bg-red-500/10 h-8 font-semibold"
              >
                {locale === 'ar' ? 'تعطيل الكل (إغلاق جميع الصلاحيات)' : 'Clear All (Close)'}
              </Button>
            </div>

            {/* Permissions Categories Grid */}
            <div className="flex-1 overflow-y-auto pr-1 py-4 custom-scroll space-y-5 text-start">
              {ALL_PERMISSIONS_GROUPS.map((group, groupIdx) => (
                <div key={groupIdx} className="rounded-xl border border-white/5 bg-secondary/15 p-4 space-y-3">
                  <h4 className="font-bold text-foreground text-sm border-b border-white/5 pb-1.5 flex items-center gap-2">
                    <div className="w-1.5 h-3 bg-primary rounded-full" />
                    <span>{locale === 'ar' ? group.category.ar : group.category.en}</span>
                  </h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {group.permissions.map((perm) => {
                      const isChecked = selectedPermissions.includes(perm.key);
                      return (
                        <div
                          key={perm.key}
                          onClick={() => togglePermission(perm.key)}
                          className={`flex items-start gap-3 p-2.5 rounded-lg border transition-all cursor-pointer select-none ${
                            isChecked
                              ? 'bg-primary/5 border-primary/20 hover:bg-primary/10'
                              : 'bg-transparent border-white/5 hover:bg-white/5'
                          }`}
                        >
                          <div className="shrink-0 mt-0.5 text-primary">
                            {isChecked ? (
                              <CheckSquare className="w-4 h-4 fill-primary/10" />
                            ) : (
                              <Square className="w-4 h-4 text-muted" />
                            )}
                          </div>
                          <div className="space-y-0.5">
                            <span className="text-xs font-semibold text-foreground block">
                              {locale === 'ar' ? perm.label.ar : perm.label.en}
                            </span>
                            <span className="text-[10px] text-muted block font-mono">
                              {perm.key}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <DialogFooter className="border-t border-border pt-4 mt-2 gap-2 shrink-0">
              <Button variant="secondary" type="button" onClick={() => setIsStaffModalOpen(false)}>
                {tCommon('cancel')}
              </Button>
              <Button
                onClick={handleSavePermissions}
                disabled={savePermissionsLoading}
                className="bg-primary hover:bg-primary-hover text-white font-semibold flex items-center gap-2 h-10 px-5 rounded-xl shadow-lg"
              >
                {savePermissionsLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{locale === 'ar' ? 'حفظ التعديلات' : 'Save Changes'}</span>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<PageSkeletonLoader />}>
      <SettingsPageContent />
    </Suspense>
  );
}
