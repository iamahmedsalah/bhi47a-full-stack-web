'use client';

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, Loader2, CheckSquare, Square, Edit2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DataTableShell, type ColumnDef } from '@/components/ui/data-table-shell';
import { TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { listStaffUsers, updateStaffPermissions, type StaffUserItem } from '../api';

export const ALL_PERMISSIONS_GROUPS = [
  {
    category: { en: 'Students Management', ar: 'إدارة الطلاب' },
    permissions: [
      { key: 'students.read', label: { en: 'View Students List', ar: 'عرض قوائم الطلاب' } },
      { key: 'students.write', label: { en: 'Create/Edit Students', ar: 'إضافة وتعديل بيانات الطلاب' } },
    ],
  },
  {
    category: { en: 'Courses Management', ar: 'إدارة المقررات الدراسية' },
    permissions: [
      { key: 'courses.read', label: { en: 'View Courses Catalog', ar: 'عرض دليل المواد' } },
      { key: 'courses.write', label: { en: 'Manage Courses Data', ar: 'إضافة وتعديل المواد' } },
    ],
  },
  {
    category: { en: 'Grades & Results', ar: 'إدارة رصد الدرجات والنتائج' },
    permissions: [
      { key: 'grades.read', label: { en: 'View Student Grades', ar: 'عرض درجات الطلاب' } },
      { key: 'grades.write', label: { en: 'Upload/Edit Exam Grades', ar: 'رصد وتعديل الدرجات' } },
      { key: 'grades.delete', label: { en: 'Delete Grade Records', ar: 'حذف سجلات الدرجات' } },
    ],
  },
  {
    category: { en: 'Complaints & Support', ar: 'إدارة الشكاوى والدعم الفني' },
    permissions: [
      { key: 'complaints.read', label: { en: 'View Tickets List', ar: 'متابعة وتصفح الشكاوى' } },
      { key: 'complaints.write', label: { en: 'Reply & Resolve Tickets', ar: 'الرد على الشكاوى وإغلاقها' } },
      { key: 'complaints.manage_settings', label: { en: 'Control System Settings', ar: 'التحكم في مواعيد واستقبال الشكاوى' } },
    ],
  },
  {
    category: { en: 'Academic Advising', ar: 'الإرشاد الأكاديمي' },
    permissions: [
      { key: 'advising.read', label: { en: 'View Advising Cases', ar: 'متابعة حالات الإرشاد' } },
      { key: 'advising.write', label: { en: 'Approve & Recommend Plans', ar: 'اعتماد وصياغة خطط الإرشاد' } },
    ],
  },
  {
    category: { en: 'Bulk Data Imports', ar: 'رفع واستيراد البيانات' },
    permissions: [
      { key: 'uploads.import', label: { en: 'Import Excel/XLSX Files', ar: 'رفع ملفات الطلاب والدرجات' } },
    ],
  },
  {
    category: { en: 'Exam Schedules & Placement', ar: 'جداول وأماكن الامتحانات' },
    permissions: [
      { key: 'exam_schedules.read', label: { en: 'View Exam Schedules', ar: 'عرض جداول وأماكن الاختبارات' } },
      { key: 'exam_schedules.write', label: { en: 'Manage Exam Places', ar: 'تنسيق أماكن وأرقام الجلوس' } },
    ],
  },
  {
    category: { en: 'FAQs & Knowledge Base', ar: 'الأسئلة الشائعة والدليل' },
    permissions: [
      { key: 'faqs.read', label: { en: 'View FAQs Corpus', ar: 'عرض الأسئلة الشائعة' } },
      { key: 'faqs.write', label: { en: 'Edit FAQs Answers', ar: 'تعديل وتحديث إجابات الدليل' } },
    ],
  },
];

export function StaffPermissionsPanel({ locale }: { locale: string }) {
  const isAr = locale === 'ar';
  const queryClient = useQueryClient();

  const [selectedStaff, setSelectedStaff] = useState<StaffUserItem | null>(null);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);

  const staffQuery = useQuery({
    queryKey: ['admin-staff-users'],
    queryFn: () => listStaffUsers(),
  });

  const staffList = staffQuery.data ?? [];

  const openEditModal = (staff: StaffUserItem) => {
    setSelectedStaff(staff);
    setSelectedPermissions(staff.permissions ?? []);
    setIsStaffModalOpen(true);
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

  const handleSavePermissions = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaff) return;
    setSaveLoading(true);
    try {
      await updateStaffPermissions(selectedStaff._id, selectedPermissions);
      toast.success(isAr ? 'تم حفظ الصلاحيات بنجاح' : 'Permissions updated successfully');
      setIsStaffModalOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['admin-staff-users'] });
    } catch {
      toast.error(isAr ? 'فشل حفظ الصلاحيات' : 'Failed to save permissions');
    } finally {
      setSaveLoading(false);
    }
  };

  const columns: ColumnDef<StaffUserItem>[] = [
    {
      key: 'name',
      header: isAr ? 'الموظف / الكود' : 'Staff Name / Code',
      render: (staff) => (
        <TableCell className="p-4">
          <div className="font-bold text-foreground">{staff.name}</div>
          <div className="font-mono text-xs text-muted-foreground">{staff.userCode || 'STF-0000'} · {staff.email}</div>
        </TableCell>
      ),
    },
    {
      key: 'permissionsCount',
      header: isAr ? 'عدد الصلاحيات الممنوحة' : 'Assigned Permissions',
      render: (staff) => {
        const count = (staff.permissions ?? []).length;
        const total = ALL_PERMISSIONS_GROUPS.reduce((acc, g) => acc + g.permissions.length, 0);
        return (
          <TableCell className="p-4">
            <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-bold font-mono text-xs text-primary">
              {count} / {total} {isAr ? 'صلاحية' : 'permissions'}
            </span>
          </TableCell>
        );
      },
    },
    {
      key: 'actions',
      header: isAr ? 'الإجراءات' : 'Actions',
      render: (staff) => (
        <TableCell className="p-4 text-center">
          <Button
            size="sm"
            onClick={() => openEditModal(staff)}
            className="gap-1.5 font-semibold text-xs cursor-pointer"
          >
            <ShieldCheck className="h-4 w-4 text-primary-foreground" />
            {isAr ? 'تعديل الصلاحيات' : 'Edit Permissions'}
          </Button>
        </TableCell>
      ),
    },
  ];

  return (
    <div className="space-y-4 text-start">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-foreground text-base">{isAr ? 'إدارة صلاحيات موظفي النظام' : 'Staff Accounts & Permissions'}</h3>
      </div>

      <DataTableShell
        columns={columns}
        data={staffList}
        keyExtractor={(staff) => staff._id}
        isLoading={staffQuery.isLoading}
        isError={staffQuery.isError}
        error={staffQuery.error}
        errorMessage={isAr ? 'فشل تحميل قائمة الموظفين' : 'Failed to load staff list'}
        emptyMessage={isAr ? 'لا يوجد حسابات موظفين مسجلة' : 'No staff accounts found'}
        loadingMessage={isAr ? 'جاري التحميل...' : 'Loading staff accounts...'}
        onRetry={() => staffQuery.refetch()}
        retryLabel={isAr ? 'إعادة المحاولة' : 'Retry'}
      />

      {selectedStaff && (
        <Dialog open={isStaffModalOpen} onOpenChange={setIsStaffModalOpen}>
          <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden flex flex-col border border-border/70 bg-[#0d1821] text-foreground">
            <DialogHeader className="border-b border-border pb-4 text-start">
              <DialogTitle className="flex items-center gap-2 text-lg">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <span>{isAr ? `تعديل صلاحيات: ${selectedStaff.name}` : `Edit Permissions: ${selectedStaff.name}`}</span>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground pt-1">
                {isAr
                  ? `قم باختيار أو إلغاء الصلاحيات المتاحة للمستخدم (${selectedStaff.userCode || 'STF-0000'})`
                  : `Assign or lift permissions from the staff account (${selectedStaff.userCode || 'STF-0000'})`}
              </DialogDescription>
            </DialogHeader>

            <div className="flex justify-end gap-2 px-1 pt-2">
              <Button variant="outline" size="sm" onClick={selectAllPermissions} className="h-8 font-semibold text-xs border-border bg-surface/40 hover:bg-surface">
                {isAr ? 'تفعيل الكل (فتح جميع الصلاحيات)' : 'Select All (Open)'}
              </Button>
              <Button variant="outline" size="sm" onClick={clearAllPermissions} className="h-8 font-semibold text-xs border-red-500/30 text-red-400 hover:bg-red-500/10">
                {isAr ? 'تعطيل الكل (إغلاق جميع الصلاحيات)' : 'Clear All (Close)'}
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 py-4 pr-1 text-start">
              {ALL_PERMISSIONS_GROUPS.map((group, groupIdx) => (
                <div key={groupIdx} className="rounded-xl border border-border/70 bg-card/60 p-4 space-y-3">
                  <h4 className="font-bold text-foreground text-sm border-b border-border/60 pb-1.5 flex items-center gap-2">
                    <div className="h-3 w-1.5 rounded-full bg-primary" />
                    <span>{isAr ? group.category.ar : group.category.en}</span>
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {group.permissions.map((perm) => {
                      const isChecked = selectedPermissions.includes(perm.key);
                      return (
                        <div
                          key={perm.key}
                          onClick={() => togglePermission(perm.key)}
                          className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer select-none ${
                            isChecked
                              ? 'bg-primary/10 border-primary/40 text-primary'
                              : 'bg-surface/30 border-border/60 hover:bg-surface/50 text-muted-foreground'
                          }`}
                        >
                          <div className="shrink-0 mt-0.5 text-primary">
                            {isChecked ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4 opacity-50" />}
                          </div>
                          <div className="space-y-0.5">
                            <span className="font-semibold text-xs text-foreground block">
                              {isAr ? perm.label.ar : perm.label.en}
                            </span>
                            <span className="font-mono text-[10px] opacity-70 block">{perm.key}</span>
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
                {isAr ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button onClick={handleSavePermissions} disabled={saveLoading} className="font-semibold text-xs cursor-pointer gap-2">
                {saveLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                <span>{isAr ? 'حفظ التعديلات' : 'Save Changes'}</span>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
