'use client';

import React, { Suspense, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'next/navigation';

import {
  Clock3,
  Eye,
  FileSpreadsheet,
  LifeBuoy,
  Loader2,
  Lock,
  MessageSquare,
  MessageSquareReply,
  Octagon,
  Play,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  Trash2,
  Wrench,
} from 'lucide-react';
import { toast } from 'sonner';

import { getApiErrorMessage } from '@/lib/api';
import { useAuth } from '@/providers/auth-provider';
import { PermissionGuard } from '@/components/ui/permission-guard';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/cn';
import {
  complaintKeys,
  getComplaintSettings,
  listAdminComplaints,
  listAdminComplaintStats,
  listAssignableStaff,
  replyToComplaint,
  updateComplaint,
  updateComplaintSettings,
  deleteComplaint,
  bulkDeleteComplaints,
  clearAllComplaints,
} from '@/features/complaints/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CustomDropdown } from '@/components/ui/custom-dropdown';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageSkeletonLoader } from '@/components/ui/page-suspense-fallback';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { useComplaintStore } from '@/store/complaint-store';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { DatePicker } from '@/components/ui/date-picker';
import { printElement, downloadExcel } from '@/lib/utils';
import { ComplaintKpiCards } from '@/features/complaints/components/complaint-kpi-cards';
import { ComplaintSettingsPanel } from '@/features/complaints/components/complaint-settings-panel';



type ComplaintType =
  | 'complaint'
  | 'technical_issue'
  | 'academic'
  | 'financial'
  | 'facility'
  | 'other';
type ComplaintStatus = 'open' | 'in_review' | 'in_progress' | 'resolved' | 'closed';
type ComplaintPriority = 'low' | 'medium' | 'high' | 'urgent';

interface Reply {
  senderId: string;
  senderName: string;
  senderRole: 'admin' | 'staff' | 'student';
  message: string;
  createdAt: string;
}

interface InternalNote {
  authorId: string;
  authorName: string;
  message: string;
  createdAt: string;
}

interface StatusHistory {
  fromStatus: string;
  toStatus: string;
  changedByName?: string;
  changedAt: string;
}

interface Complaint {
  _id: string;
  ticketNumber: string;
  studentCode: string;
  studentName: string;
  type: ComplaintType;
  title: string;
  description: string;
  priority: ComplaintPriority;
  status: ComplaintStatus;
  assignedGroup?: string;
  assignedStaffId?: string;
  assignedStaffName?: string;
  replies: Reply[];
  internalNotes?: InternalNote[];
  statusHistory?: StatusHistory[];
  createdAt: string;
  updatedAt: string;
  screenshotUrl?: string;
}

interface SystemSettings {
  complaintsSystemOpen: boolean;
  blacklistedStudentCodes: string[];
  complaintOpenAt?: string;
  complaintCloseAt?: string;
  updatedAt?: string;
}

const statusLabels: Record<ComplaintStatus, string> = {
  open: 'قيد الانتظار',
  in_review: 'قيد المراجعة',
  in_progress: 'جاري العمل',
  resolved: 'تم الحل',
  closed: 'مغلق',
};

const statusLabelsEn: Record<ComplaintStatus, string> = {
  open: 'Pending',
  in_review: 'In Review',
  in_progress: 'Working',
  resolved: 'Resolved',
  closed: 'Closed',
};

const priorityLabels: Record<ComplaintPriority, string> = {
  low: 'منخفضة',
  medium: 'عادية',
  high: 'عالية',
  urgent: 'عاجلة',
};

const priorityLabelsEn: Record<ComplaintPriority, string> = {
  low: 'Low',
  medium: 'Normal',
  high: 'High',
  urgent: 'Urgent',
};

const typeLabels: Record<ComplaintType, string> = {
  complaint: 'شكوى',
  technical_issue: 'عطل فني',
  academic: 'أكاديمية',
  financial: 'مالية',
  facility: 'خدمات ومرافق',
  other: 'أخرى',
};

const assignmentGroups = [
  'شؤون الطلاب',
  'الدعم الفني',
  'المالية',
  'الكنترول',
  'الإرشاد الأكاديمي',
];

const groupTranslations: Record<string, string> = {
  'شؤون الطلاب': 'Student Affairs',
  'الدعم الفني': 'Technical Support',
  'المالية': 'Financial Department',
  'الكنترول': 'Control Room',
  'الإرشاد الأكاديمي': 'Academic Advising',
};

const statusWorkflow: ComplaintStatus[] = ['open', 'in_review', 'in_progress', 'resolved', 'closed'];

function formatDate(value?: string, locale?: string) {
  const isAr = locale === 'ar';
  if (!value) return isAr ? 'غير محدد' : 'N/A';
  return new Date(value).toLocaleString(isAr ? 'ar-EG' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function toDateTimeLocal(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function dateTimeLocalToIso(value: string) {
  return value ? new Date(value).toISOString() : undefined;
}

function getStatusTone(status: ComplaintStatus) {
  if (status === 'open') return 'border-amber-400/30 bg-amber-400/10 text-amber-200';
  if (status === 'in_review') return 'border-sky-400/30 bg-sky-400/10 text-sky-200';
  if (status === 'in_progress') return 'border-violet-400/30 bg-violet-400/10 text-violet-200';
  if (status === 'resolved') return 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200';
  return 'border-slate-400/30 bg-slate-400/10 text-slate-200';
}

function getPriorityTone(priority: ComplaintPriority) {
  if (priority === 'urgent') return 'border-red-400/40 bg-red-500/15 text-red-200';
  if (priority === 'high') return 'border-orange-400/40 bg-orange-500/15 text-orange-200';
  if (priority === 'medium') return 'border-cyan-400/30 bg-cyan-500/10 text-cyan-200';
  return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200';
}

function StatusPill({ status, locale }: { status: ComplaintStatus; locale?: string }) {
  const isAr = locale === 'ar';
  return (
    <span className={cn('inline-flex rounded-squircle border px-2.5 py-1 text-xs font-semibold', getStatusTone(status))}>
      {isAr ? statusLabels[status] : statusLabelsEn[status]}
    </span>
  );
}

function PriorityPill({ priority, locale }: { priority: ComplaintPriority; locale?: string }) {
  const isAr = locale === 'ar';
  return (
    <span className={cn('inline-flex rounded-squircle border px-2.5 py-1 text-xs font-semibold', getPriorityTone(priority))}>
      {isAr ? priorityLabels[priority] : priorityLabelsEn[priority]}
    </span>
  );
}

function AdminComplaintsContent() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const params = useParams();
  const locale = params.locale as string;
  const canManageSettings = user?.role === 'admin';


  const {
    adminFilters: {
      search,
      status,
      type,
      priority,
      assignedGroup,
      assignedStaffId,
      dateFrom,
      dateTo,
    },
    selectedTicketIds,
    setAdminFilter,
    setSelectedTicketIds,
    resetAdminFilters,
  } = useComplaintStore();

  const [targetStudentCode, setTargetStudentCode] = useState('');
  const [windowOpenAt, setWindowOpenAt] = useState('');
  const [windowCloseAt, setWindowCloseAt] = useState('');

  const searchParams = useSearchParams();
  const ticketParam = searchParams ? searchParams.get('ticket') : null;

  React.useEffect(() => {
    if (ticketParam) {
      setAdminFilter('search', ticketParam);
    }
  }, [ticketParam, setAdminFilter]);

  const [selectedTicketOverride, setSelectedTicketOverride] = useState<Complaint | null | 'CLOSED'>('CLOSED');
  const [replyMessage, setReplyMessage] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [clearAllDialogOpen, setClearAllDialogOpen] = useState(false);
  const [clearAllConfirmText, setClearAllConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const complaintListParams = {
    limit: 100,
    search: search.trim() || undefined,
    status: status !== 'all' ? status : undefined,
    type: type !== 'all' ? type : undefined,
    priority: priority !== 'all' ? priority : undefined,
    assignedGroup: assignedGroup !== 'all' ? assignedGroup : undefined,
    assignedStaffId: assignedStaffId !== 'all' ? assignedStaffId : undefined,
    dateFrom: dateFrom ? new Date(dateFrom).toISOString() : undefined,
    dateTo: dateTo ? new Date(dateTo).toISOString() : undefined,
  };

  const complaintsQuery = useQuery({
    queryKey: complaintKeys.adminList(complaintListParams),
    queryFn: async () => {
      return listAdminComplaints(complaintListParams);
    },
  });

  const statsQuery = useQuery({
    queryKey: complaintKeys.stats(),
    queryFn: listAdminComplaintStats,
  });

  const settingsQuery = useQuery({
    queryKey: complaintKeys.settings(),
    queryFn: async () => {
      const settings = await getComplaintSettings();
      setWindowOpenAt(toDateTimeLocal(settings.complaintOpenAt));
      setWindowCloseAt(toDateTimeLocal(settings.complaintCloseAt));
      return settings;
    },
    enabled: canManageSettings,
  });

  const assigneesQuery = useQuery({
    queryKey: complaintKeys.assignees(),
    queryFn: listAssignableStaff,
  });

  const complaints = complaintsQuery.data?.items ?? [];
  const total = complaintsQuery.data?.total ?? 0;
  const settings = settingsQuery.data ?? null;
  const assignees = assigneesQuery.data ?? [];

  const selectedTicket = useMemo(() => {
    if (selectedTicketOverride === 'CLOSED') {
      return null;
    }
    if (selectedTicketOverride) {
      return selectedTicketOverride;
    }
    if (ticketParam && complaints.length > 0) {
      return complaints.find((c) => c.ticketNumber === ticketParam) ?? null;
    }
    return null;
  }, [selectedTicketOverride, ticketParam, complaints]);

  const setSelectedTicket = (ticket: Complaint | null | ((prev: Complaint | null) => Complaint | null)) => {
    if (typeof ticket === 'function') {
      setSelectedTicketOverride((prev) => {
        const current = prev === 'CLOSED' ? null : prev;
        const next = ticket(current);
        return next ?? 'CLOSED';
      });
    } else {
      setSelectedTicketOverride(ticket ?? 'CLOSED');
    }
  };

  const stats = useMemo(() => {
    const allTickets = statsQuery.data ?? [];
    const resolvedTickets = allTickets.filter((ticket) => ['resolved', 'closed'].includes(ticket.status));
    const avgMs = resolvedTickets.length
      ? resolvedTickets.reduce((sum, ticket) => {
          const created = new Date(ticket.createdAt).getTime();
          const updated = new Date(ticket.updatedAt).getTime();
          return sum + Math.max(0, updated - created);
        }, 0) / resolvedTickets.length
      : 0;

    const avgHours = avgMs ? Math.max(1, Math.round(avgMs / 3_600_000)) : 0;

    return {
      total: allTickets.length,
      open: allTickets.filter((ticket) => ticket.status === 'open').length,
      review: allTickets.filter((ticket) => ticket.status === 'in_review').length,
      working: allTickets.filter((ticket) => ticket.status === 'in_progress').length,
      resolved: allTickets.filter((ticket) => ticket.status === 'resolved').length,
      technical: allTickets.filter((ticket) => ticket.type === 'technical_issue' || ticket.type === 'facility').length,
      complaints: allTickets.filter((ticket) => ticket.type === 'complaint').length,
      high: allTickets.filter((ticket) => ticket.priority === 'high' || ticket.priority === 'urgent').length,
      avgResolution: avgHours ? (locale === 'ar' ? `${avgHours} ساعة` : `${avgHours} hours`) : (locale === 'ar' ? 'غير متاح' : 'N/A'),
    };
  }, [statsQuery.data, locale]);

  const updateCachesAfterTicket = (ticket: Complaint) => {
    setSelectedTicket((current) => (current?._id === ticket._id ? ticket : current));
    void queryClient.invalidateQueries({ queryKey: complaintKeys.adminLists() });
    void queryClient.invalidateQueries({ queryKey: complaintKeys.stats() });
  };

  const handleUpdateSettings = async (updates: Partial<SystemSettings>) => {
    if (!settings || !canManageSettings) return;

    try {
      const payload = {
        complaintsSystemOpen: updates.complaintsSystemOpen ?? settings.complaintsSystemOpen,
        blacklistedStudentCodes: updates.blacklistedStudentCodes ?? settings.blacklistedStudentCodes,
        complaintOpenAt:
          'complaintOpenAt' in updates
            ? updates.complaintOpenAt
            : (dateTimeLocalToIso(windowOpenAt) ?? settings.complaintOpenAt),
        complaintCloseAt:
          'complaintCloseAt' in updates
            ? updates.complaintCloseAt
            : (dateTimeLocalToIso(windowCloseAt) ?? settings.complaintCloseAt),
      };
      const updatedSettings = await updateComplaintSettings(payload);
      queryClient.setQueryData(complaintKeys.settings(), updatedSettings);
      toast.success('تم حفظ إعدادات استقبال الشكاوى');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'تعذر تحديث إعدادات الشكاوى'));
    }
  };

  const handleStudentCodeStatus = async (deactivate: boolean) => {
    if (!settings || !targetStudentCode.trim() || !canManageSettings) return;
    const targetCode = targetStudentCode.trim();
    const currentCodes = settings.blacklistedStudentCodes ?? [];
    const nextCodes = deactivate
      ? Array.from(new Set([...currentCodes, targetCode]))
      : currentCodes.filter((code) => code !== targetCode);

    await handleUpdateSettings({ blacklistedStudentCodes: nextCodes });
    setTargetStudentCode('');
    toast.success(
      deactivate
        ? (isAr ? `تم إيقاف كود الطالب ${targetCode}` : `Student code ${targetCode} blocked`)
        : (isAr ? `تم تفعيل كود الطالب ${targetCode}` : `Student code ${targetCode} unblocked`),
    );
  };

  const patchTicket = async (ticketId: string, payload: Record<string, string | undefined>) => {
    setDrawerLoading(true);
    try {
      const ticket = await updateComplaint(ticketId, payload);
      updateCachesAfterTicket(ticket);
      toast.success(
        isAr
          ? 'تم تحديث التذكرة وإرسال الإشعارات اللازمة'
          : 'Ticket updated and notifications sent successfully',
      );
    } catch (error) {
      toast.error(
        getApiErrorMessage(
          error,
          isAr ? 'تعذر تحديث التذكرة' : 'Failed to update ticket',
        ),
      );
    } finally {
      setDrawerLoading(false);
    }
  };

  const handleDeleteTicket = async (ticketId: string) => {
    const toastId = toast.loading(isAr ? 'جاري حذف الشكوى...' : 'Deleting complaint...');
    try {
      await deleteComplaint(ticketId);
      toast.success(isAr ? 'تم حذف الشكوى بنجاح' : 'Complaint deleted successfully', { id: toastId });
      setSelectedTicketIds(selectedTicketIds.filter((id) => id !== ticketId));
      if (selectedTicket?._id === ticketId) {
        setSelectedTicket(null);
      }
      void queryClient.invalidateQueries({ queryKey: complaintKeys.adminLists() });
      void queryClient.invalidateQueries({ queryKey: complaintKeys.stats() });
    } catch (err) {
      toast.error(getApiErrorMessage(err, isAr ? 'فشل حذف الشكوى' : 'Failed to delete complaint'), { id: toastId });
    }
  };

  const handleBulkDelete = async () => {
    if (selectedTicketIds.length === 0) return;
    const toastId = toast.loading(isAr ? 'جاري حذف الشكاوى المحددة...' : 'Deleting selected complaints...');
    try {
      await bulkDeleteComplaints(selectedTicketIds);
      toast.success(isAr ? 'تم حذف الشكاوى المحددة بنجاح' : 'Selected complaints deleted successfully', { id: toastId });
      setSelectedTicketIds([]);
      void queryClient.invalidateQueries({ queryKey: complaintKeys.adminLists() });
      void queryClient.invalidateQueries({ queryKey: complaintKeys.stats() });
    } catch (err) {
      toast.error(getApiErrorMessage(err, isAr ? 'فشل حذف الشكاوى' : 'Failed to delete complaints'), { id: toastId });
    }
  };

  const handleClearAll = async () => {
    setIsDeleting(true);
    const toastId = toast.loading(isAr ? 'جاري مسح كافة الشكاوى...' : 'Clearing all complaints...');
    try {
      await clearAllComplaints();
      toast.success(isAr ? 'تم مسح وتفريغ كافة الشكاوى بنجاح' : 'All complaints cleared successfully', { id: toastId });
      setSelectedTicketIds([]);
      setClearAllDialogOpen(false);
      setClearAllConfirmText('');
      void queryClient.invalidateQueries({ queryKey: complaintKeys.adminLists() });
      void queryClient.invalidateQueries({ queryKey: complaintKeys.stats() });
    } catch (err) {
      toast.error(getApiErrorMessage(err, isAr ? 'فشل مسح الشكاوى' : 'Failed to clear complaints'), { id: toastId });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleReply = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTicket || !replyMessage.trim()) return;

    setDrawerLoading(true);
    try {
      const ticket = await replyToComplaint(selectedTicket._id, replyMessage.trim());
      setReplyMessage('');
      updateCachesAfterTicket(ticket);
      toast.success(isAr ? 'تم إرسال الرد للطالب' : 'Reply sent to student');
    } catch (error) {
      toast.error(getApiErrorMessage(error, isAr ? 'تعذر إرسال الرد' : 'Failed to send reply'));
    } finally {
      setDrawerLoading(false);
    }
  };

  const handleInternalNote = async () => {
    if (!selectedTicket || !internalNote.trim()) return;
    await patchTicket(selectedTicket._id, { internalNote: internalNote.trim() });
    setInternalNote('');
  };

  const resetFilters = () => {
    resetAdminFilters();
  };


  const exportExcelReport = () => {
    const isAr = locale === 'ar';
    const headers = isAr 
      ? ['رقم التذكرة', 'النوع', 'الموضوع', 'اسم الطالب', 'كود الطالب', 'الأولوية', 'الحالة', 'المسؤول', 'تاريخ الإنشاء', 'آخر تحديث']
      : ['Ticket Number', 'Type', 'Subject', 'Student Name', 'Student Code', 'Priority', 'Status', 'Assignee', 'Created At', 'Last Update'];
    const data = complaints.map((ticket) => ({
      ticketNumber: ticket.ticketNumber,
      type: isAr ? typeLabels[ticket.type] : ticket.type.replace('_', ' '),
      title: ticket.title,
      studentName: ticket.studentName,
      studentCode: ticket.studentCode,
      priority: isAr ? priorityLabels[ticket.priority] : priorityLabelsEn[ticket.priority],
      status: isAr ? statusLabels[ticket.status] : statusLabelsEn[ticket.status],
      assignee: ticket.assignedStaffName || (ticket.assignedGroup ? (isAr ? ticket.assignedGroup : (groupTranslations[ticket.assignedGroup] || ticket.assignedGroup)) : '') || (isAr ? '' : 'Unassigned'),
      createdAt: formatDate(ticket.createdAt, locale),
      updatedAt: formatDate(ticket.updatedAt, locale),
    }));
    downloadExcel(data, headers, isAr ? `تقرير_الشكاوى_${new Date().toISOString().slice(0,10)}` : `complaints_report_${new Date().toISOString().slice(0,10)}`);
  };

  const exportCsv = () => {
    const rows = [
      ['ticket', 'type', 'title', 'student', 'studentCode', 'priority', 'status', 'assignedStaff', 'createdAt', 'updatedAt'],
      ...complaints.map((ticket) => [
        ticket.ticketNumber,
        typeLabels[ticket.type],
        ticket.title,
        ticket.studentName,
        ticket.studentCode,
        priorityLabels[ticket.priority],
        statusLabels[ticket.status],
        ticket.assignedStaffName || ticket.assignedGroup || '',
        ticket.createdAt,
        ticket.updatedAt,
      ]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `complaints-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('تم تجهيز ملف التصدير');
  };

  const isAr = locale === 'ar';
  
  return (
    <div className="space-y-6 p-2 md:p-6 animate-fade-in" dir={isAr ? "rtl" : "ltr"}>
      <section className="overflow-hidden rounded-xl border border-border/70 bg-card/90 p-5 shadow-[var(--shadow-glow)] backdrop-blur md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              {isAr ? 'مركز إدارة البلاغات' : 'Complaints Center'}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground md:text-3xl">
                {isAr ? 'الشكاوى والأعطال' : 'Complaints & Maintenance'}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {isAr ? 'إدارة بلاغات الطلاب ومتابعة حالات الشكاوى والأعطال الفنية.' : 'Manage student tickets, complaints, and technical issues.'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
            <Button
              variant="outline"
              onClick={exportExcelReport}
              className="gap-2 cursor-pointer rounded-squircle border border-border bg-card text-foreground/70 hover:border-primary/30 hover:bg-accent/10 hover:text-foreground transition-all duration-300 h-10 px-4"
            >
              {isAr ? 'تصدير Excel' : 'Export Excel'}
              <FileSpreadsheet className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              onClick={exportCsv}
              className="gap-2 cursor-pointer rounded-squircle border border-border bg-card text-foreground/70 hover:border-primary/30 hover:bg-accent/10 hover:text-foreground transition-all duration-300 h-10 px-4"
            >
              {isAr ? 'تصدير CSV' : 'Export CSV'}
              <FileSpreadsheet className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              onClick={() => printElement('printable-complaints-list', isAr ? 'تقرير الشكاوى والأعطال' : 'Complaints Report')}
              className="gap-2 cursor-pointer rounded-squircle border border-border bg-card text-foreground/70 hover:border-primary/30 hover:bg-accent/10 hover:text-foreground transition-all duration-300 h-10 px-4"
            >
              {isAr ? 'طباعة التقرير' : 'Print Report'}
              <Printer className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              onClick={() => complaintsQuery.refetch()}
              className="gap-2 cursor-pointer rounded-squircle border border-border bg-card text-foreground/70 hover:border-primary/30 hover:bg-accent/10 hover:text-foreground transition-all duration-300 h-10 px-4"
            >
              {isAr ? 'تحديث' : 'Refresh'}
              <RefreshCw className={`h-4 w-4 ${complaintsQuery.isFetching ? 'animate-spin' : ''}`} />
            </Button>
            {canManageSettings && (
              <Button
                variant="destructive"
                onClick={() => {
                  setClearAllConfirmText('');
                  setClearAllDialogOpen(true);
                }}
                className="gap-2 cursor-pointer rounded-squircle bg-rose-600/90 hover:bg-rose-600 text-white transition-all duration-300 h-10 px-4 text-xs font-semibold"
              >
                <Trash2 className="h-4 w-4" />
                {isAr ? 'مسح كافة الشكاوى' : 'Clear All Complaints'}
              </Button>
            )}
          </div>
        </div>
      </section>

      {canManageSettings && (
        <ComplaintSettingsPanel
          settings={settings}
          windowOpenAt={windowOpenAt}
          setWindowOpenAt={setWindowOpenAt}
          windowCloseAt={windowCloseAt}
          setWindowCloseAt={setWindowCloseAt}
          handleUpdateSettings={handleUpdateSettings}
          targetStudentCode={targetStudentCode}
          setTargetStudentCode={setTargetStudentCode}
          handleStudentCodeStatus={handleStudentCodeStatus}
          isAr={isAr}
          locale={locale}
          formatDate={formatDate}
        />
      )}

      <ComplaintKpiCards stats={stats} total={total} isAr={isAr} />

      <Card className="border-border/70 bg-card/90 p-4 shadow-[var(--shadow-glow)]">
        <div className="grid gap-3 lg:grid-cols-[1.4fr_repeat(6,minmax(0,1fr))_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => setAdminFilter('search', event.target.value)} placeholder={isAr ? 'بحث برقم التذكرة أو الطالب أو الموضوع' : 'Search by ticket, student, or subject'} className="ps-10" />
          </div>
          <Select value={type} onValueChange={(value) => setAdminFilter('type', value)}>
            <SelectTrigger><SelectValue placeholder={isAr ? 'النوع' : 'Type'} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isAr ? 'كل الأنواع' : 'All Types'}</SelectItem>
              <SelectItem value="complaint">{isAr ? 'شكوى' : 'Complaint'}</SelectItem>
              <SelectItem value="technical_issue">{isAr ? 'عطل فني' : 'Technical Issue'}</SelectItem>
              <SelectItem value="academic">{isAr ? 'أكاديمية' : 'Academic'}</SelectItem>
              <SelectItem value="financial">{isAr ? 'مالية' : 'Financial'}</SelectItem>
              <SelectItem value="facility">{isAr ? 'مرافق' : 'Facility'}</SelectItem>
              <SelectItem value="other">{isAr ? 'أخرى' : 'Other'}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(value) => setAdminFilter('status', value)}>
            <SelectTrigger><SelectValue placeholder={isAr ? 'الحالة' : 'Status'} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isAr ? 'كل الحالات' : 'All Statuses'}</SelectItem>
              {statusWorkflow.map((item) => (
                <SelectItem key={item} value={item}>
                  {isAr ? statusLabels[item] : item.replace('_', ' ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={priority} onValueChange={(value) => setAdminFilter('priority', value)}>
            <SelectTrigger><SelectValue placeholder={isAr ? 'الأولوية' : 'Priority'} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isAr ? 'كل الأولويات' : 'All Priorities'}</SelectItem>
              {(['low', 'medium', 'high', 'urgent'] as ComplaintPriority[]).map((item) => (
                <SelectItem key={item} value={item}>
                  {isAr ? priorityLabels[item] : item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DatePicker value={dateFrom} onChange={(val) => setAdminFilter('dateFrom', val)} placeholder={isAr ? 'من تاريخ' : 'Date From'} locale={locale} />
          <DatePicker value={dateTo} onChange={(val) => setAdminFilter('dateTo', val)} placeholder={isAr ? 'إلى تاريخ' : 'Date To'} locale={locale} />
          <Select value={assignedGroup} onValueChange={(value) => setAdminFilter('assignedGroup', value)}>
            <SelectTrigger><SelectValue placeholder={isAr ? 'القسم' : 'Department'} /></SelectTrigger>
            <SelectContent>
               <SelectItem value="all">{isAr ? 'كل الأقسام' : 'All Departments'}</SelectItem>
              {assignmentGroups.map((group) => <SelectItem key={group} value={group} className="cursor-pointer">{isAr ? group : (groupTranslations[group] || group)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={resetFilters} className="gap-2 cursor-pointer border-border bg-surface/50 rounded-squircle hover:bg-surface/70 focus:ring-1 focus:ring-primary h-10 px-3.5">
            {isAr ? 'مسح' : 'Clear'}
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      </Card>

      <Card className="overflow-hidden border-border/70 bg-card/90 shadow-[var(--shadow-glow)]">
        {canManageSettings && selectedTicketIds.length > 0 && (
          <div className="flex flex-col gap-2 border-b border-border/80 bg-primary/10 px-6 py-3 transition-all animate-in fade-in slide-in-from-top-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-xs font-semibold text-foreground">
              {isAr ? `تم تحديد ${selectedTicketIds.length} من البلاغات` : `Selected ${selectedTicketIds.length} tickets`}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {selectedTicketIds.length === 1 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const t = complaints.find((x) => x._id === selectedTicketIds[0]);
                    if (t) setSelectedTicket(t);
                  }}
                  className="gap-1.5 cursor-pointer text-xs"
                >
                  <Eye className="h-3.5 w-3.5" />
                  {isAr ? 'عرض التفاصيل / الرد' : 'View Details / Reply'}
                </Button>
              )}
              <ConfirmDialog
                trigger={
                  <Button
                    size="sm"
                    variant="destructive"
                    className="gap-1.5 cursor-pointer text-xs disabled:cursor-not-allowed"
                  >
                    <Lock className="h-3.5 w-3.5" />
                    {isAr ? 'إغلاق المحدد' : 'Close Selected'}
                  </Button>
                }
                title={isAr ? 'إغلاق البلاغات المحددة' : 'Close Selected Tickets'}
                description={isAr ? 'هل أنت متأكد من إغلاق البلاغات المحددة؟' : 'Are you sure you want to close the selected tickets?'}
                confirmLabel={isAr ? 'إغلاق' : 'Close'}
                cancelLabel={isAr ? 'إلغاء' : 'Cancel'}
                onConfirm={async () => {
                  const toastId = toast.loading(isAr ? 'جاري إغلاق البلاغات...' : 'Closing tickets...');
                  try {
                    await Promise.all(
                      selectedTicketIds.map((id) =>
                        updateComplaint(id, { status: 'closed' }),
                      ),
                    );
                    toast.success(isAr ? 'تم إغلاق البلاغات المحددة بنجاح' : 'Selected tickets closed successfully', { id: toastId });
                    setSelectedTicketIds([]);
                    void queryClient.invalidateQueries({ queryKey: complaintKeys.adminLists() });
                    void queryClient.invalidateQueries({ queryKey: complaintKeys.stats() });
                  } catch {
                    toast.error(isAr ? 'فشل إغلاق بعض البلاغات' : 'Failed to close some tickets', { id: toastId });
                  }
                }}
              />
              {canManageSettings && (
                <ConfirmDialog
                  trigger={
                    <Button
                      size="sm"
                      variant="destructive"
                      className="gap-1.5 cursor-pointer text-xs bg-rose-600 hover:bg-rose-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {isAr ? `حذف المحدد (${selectedTicketIds.length})` : `Delete Selected (${selectedTicketIds.length})`}
                    </Button>
                  }
                  title={isAr ? 'حذف البلاغات المحددة' : 'Delete Selected Complaints'}
                  description={
                    isAr
                      ? `هل أنت متأكد من حذف ${selectedTicketIds.length} شكوى محددة نهائياً من قاعدة البيانات؟ لا يمكن التراجع عن هذا الإجراء.`
                      : `Are you sure you want to permanently delete ${selectedTicketIds.length} selected complaints? This action cannot be undone.`
                  }
                  confirmLabel={isAr ? 'تأكيد الحذف' : 'Confirm Delete'}
                  cancelLabel={isAr ? 'إلغاء' : 'Cancel'}
                  onConfirm={handleBulkDelete}
                />
              )}
            </div>
          </div>
        )}

        <div id="printable-complaints-list" className="hidden overflow-x-auto lg:block">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="border-b border-border bg-surface/70 text-xs text-muted-foreground">
              <tr>
                {canManageSettings && (
                  <th className="w-12 px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={complaints.length > 0 && selectedTicketIds.length === complaints.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedTicketIds(complaints.map((c) => c._id));
                        } else {
                          setSelectedTicketIds([]);
                        }
                      }}
                      className="appearance-none h-4 w-4 rounded-full border border-border bg-surface checked:bg-primary checked:border-primary cursor-pointer transition-all relative checked:after:content-[''] checked:after:absolute checked:after:w-2 checked:after:h-2 checked:after:bg-white checked:after:rounded-full checked:after:top-1/2 checked:after:left-1/2 checked:after:-translate-x-1/2 checked:after:-translate-y-1/2 focus:outline-none"
                    />
                  </th>
                )}
                {(isAr
                  ? ['رقم التذكرة', 'النوع', 'الطالب', 'كود الطالب', 'الأولوية', 'الحالة', 'الموظف المسؤول', 'تاريخ الإنشاء', 'آخر تحديث', 'الإجراءات']
                  : ['Ticket Number', 'Type', 'Student', 'Student Code', 'Priority', 'Status', 'Assigned Staff', 'Created At', 'Last Update', 'Actions']
                ).map((header) => (
                  <th key={header} className="px-4 py-3 text-start font-semibold">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {complaintsQuery.isLoading ? (
                <tr><td colSpan={canManageSettings ? 11 : 10} className="px-4 py-12 text-center text-muted-foreground"><Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /></td></tr>
              ) : complaints.length === 0 ? (
                <tr><td colSpan={canManageSettings ? 11 : 10} className="px-4 py-12 text-center text-muted-foreground">{isAr ? 'لا توجد بلاغات مطابقة.' : 'No matching complaints found.'}</td></tr>
              ) : (
                complaints.map((ticket) => (
                  <tr
                    key={ticket._id}
                    className={cn(
                      "border-b border-border/60 transition-colors hover:bg-surface/40",
                      selectedTicketIds.includes(ticket._id) && "bg-primary/5 hover:bg-primary/10"
                    )}
                  >
                    {canManageSettings && (
                      <td className="w-12 px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={selectedTicketIds.includes(ticket._id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedTicketIds([...selectedTicketIds, ticket._id]);
                            } else {
                              setSelectedTicketIds(selectedTicketIds.filter((id) => id !== ticket._id));
                            }
                          }}
                          className="appearance-none h-4 w-4 rounded-full border border-border bg-surface checked:bg-primary checked:border-primary cursor-pointer transition-all relative checked:after:content-[''] checked:after:absolute checked:after:w-2 checked:after:h-2 checked:after:bg-white checked:after:rounded-full checked:after:top-1/2 checked:after:left-1/2 checked:after:-translate-x-1/2 checked:after:-translate-y-1/2 focus:outline-none"
                        />
                      </td>
                    )}
                    <td
                      className="px-4 py-4 font-mono font-bold text-primary hover:underline cursor-pointer"
                      onClick={() => setSelectedTicket(ticket)}
                    >
                      {ticket.ticketNumber}
                    </td>
                    <td className="px-4 py-4"><Badge variant="outline" className="rounded-squircle">{isAr ? typeLabels[ticket.type] : ticket.type.replace('_', ' ')}</Badge></td>
                    <td className="px-4 py-4 text-foreground">{ticket.studentName ? ticket.studentName.trim().split(/\s+/).slice(0, 2).join(' ') : ''}</td>
                    <td className="px-4 py-4 font-mono text-muted-foreground">{ticket.studentCode}</td>
                    <td className="px-4 py-4"><PriorityPill priority={ticket.priority} locale={locale} /></td>
                    <td className="px-4 py-4"><StatusPill status={ticket.status} locale={locale} /></td>
                    <td className="px-4 py-4 text-muted-foreground">{ticket.assignedStaffName || (ticket.assignedGroup ? (isAr ? ticket.assignedGroup : (groupTranslations[ticket.assignedGroup] || ticket.assignedGroup)) : '') || (isAr ? 'غير معين' : 'Unassigned')}</td>
                    <td className="px-4 py-4 text-xs text-muted-foreground">{formatDate(ticket.createdAt, locale)}</td>
                    <td className="px-4 py-4 text-xs text-muted-foreground">{formatDate(ticket.updatedAt, locale)}</td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1.5">
                        <CustomDropdown
                          value={ticket.status}
                          ariaLabel={isAr ? 'تغيير حالة التذكرة' : 'Change ticket status'}
                          className="h-8 w-28 text-xs"
                          options={statusWorkflow.map((item) => ({
                            value: item,
                            label: isAr ? statusLabels[item] : statusLabelsEn[item],
                          }))}
                          onValueChange={(val) => patchTicket(ticket._id, { status: val as ComplaintStatus })}
                        />
                        {canManageSettings && (
                          <ConfirmDialog
                            trigger={
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-muted-foreground hover:text-rose-500 cursor-pointer"
                                title={isAr ? 'حذف الشكوى' : 'Delete Complaint'}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            }
                            title={isAr ? 'حذف الشكوى' : 'Delete Complaint'}
                            description={
                              isAr
                                ? `هل أنت متأكد من حذف الشكوى #${ticket.ticketNumber} نهائياً؟`
                                : `Are you sure you want to delete complaint #${ticket.ticketNumber} permanently?`
                            }
                            confirmLabel={isAr ? 'حذف نهائي' : 'Delete'}
                            cancelLabel={isAr ? 'إلغاء' : 'Cancel'}
                            onConfirm={() => handleDeleteTicket(ticket._id)}
                          />
                        )}
                      </div>
                      <div className="hidden">
                      <Select
                        value={ticket.status}
                        onValueChange={(val) => patchTicket(ticket._id, { status: val as ComplaintStatus })}
                      >
                        <SelectTrigger className="h-8 w-28 border-border bg-surface/50 text-xs rounded-squircle cursor-pointer">
                          <SelectValue placeholder={isAr ? 'الحالة' : 'Status'} />
                        </SelectTrigger>
                        <SelectContent className="border-border bg-card">
                          <SelectItem value="open" className="text-xs cursor-pointer">{isAr ? 'قيد الانتظار' : 'Pending'}</SelectItem>
                          <SelectItem value="in_review" className="text-xs cursor-pointer">{isAr ? 'قيد المراجعة' : 'In Review'}</SelectItem>
                          <SelectItem value="in_progress" className="text-xs cursor-pointer">{isAr ? 'جاري العمل' : 'Working'}</SelectItem>
                          <SelectItem value="resolved" className="text-xs cursor-pointer">{isAr ? 'تم الحل' : 'Resolved'}</SelectItem>
                          <SelectItem value="closed" className="text-xs cursor-pointer">{isAr ? 'مغلق' : 'Closed'}</SelectItem>
                        </SelectContent>
                      </Select>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 p-3 lg:hidden">
          {complaints.map((ticket) => (
            <div
              key={ticket._id}
              className="w-full rounded-squircle border border-border bg-surface/40 p-4 text-start"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p
                    className="font-mono text-xs font-bold text-primary hover:underline cursor-pointer"
                    onClick={() => setSelectedTicket(ticket)}
                  >
                    {ticket.ticketNumber}
                  </p>
                  <h3 className="mt-1 font-semibold text-foreground">{ticket.title}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{ticket.studentName} • {ticket.studentCode}</p>
                </div>
                <StatusPill status={ticket.status} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant="outline">{isAr ? typeLabels[ticket.type] : ticket.type.replace('_', ' ')}</Badge>
                <PriorityPill priority={ticket.priority} />
                <span className="text-xs text-muted-foreground">{ticket.assignedStaffName || (ticket.assignedGroup ? (isAr ? ticket.assignedGroup : (groupTranslations[ticket.assignedGroup] || ticket.assignedGroup)) : '') || (isAr ? 'غير معين' : 'Unassigned')}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Sheet open={Boolean(selectedTicket)} onOpenChange={(open) => !open && setSelectedTicket(null)}>
        <SheetContent side={isAr ? "left" : "right"} className="w-full overflow-y-auto border-border bg-[#0d1821] p-0 text-foreground sm:max-w-2xl">
          {selectedTicket && (
            <div id="printable-ticket-detail" className="space-y-5 p-5">
              <SheetHeader className="text-start">
                <SheetTitle className="flex flex-wrap items-center gap-2 text-xl">
                  <span>{selectedTicket.ticketNumber}</span>
                  <StatusPill status={selectedTicket.status} locale={locale} />
                </SheetTitle>
                <SheetDescription>{selectedTicket.title}</SheetDescription>
              </SheetHeader>

              <div className="grid gap-3 sm:grid-cols-2">
                <Card className="border-border bg-card/70 p-4">
                  <p className="text-xs text-muted-foreground">{isAr ? 'بيانات الطالب' : 'Student Info'}</p>
                  <h3 className="mt-2 font-bold text-foreground">{selectedTicket.studentName}</h3>
                  <p className="font-mono text-sm text-primary">{selectedTicket.studentCode}</p>
                </Card>
                <Card className="border-border bg-card/70 p-4">
                  <p className="text-xs text-muted-foreground">{isAr ? 'الموظف المسؤول' : 'Assigned Staff'}</p>
                  <h3 className="mt-2 font-bold text-foreground">{selectedTicket.assignedStaffName || (isAr ? 'غير معين' : 'Unassigned')}</h3>
                  <p className="text-sm text-muted-foreground">{(selectedTicket.assignedGroup ? (isAr ? selectedTicket.assignedGroup : (groupTranslations[selectedTicket.assignedGroup] || selectedTicket.assignedGroup)) : '') || (isAr ? 'لا يوجد قسم محدد' : 'No target department')}</p>
                </Card>
              </div>

              <Card className="border-border bg-card/70 p-4">
                <p className="mb-2 text-xs font-semibold text-muted-foreground">{isAr ? 'تفاصيل البلاغ' : 'Ticket Details'}</p>
                <p className="whitespace-pre-wrap text-sm leading-7 text-foreground">{selectedTicket.description}</p>
              </Card>

              {selectedTicket.screenshotUrl && (
                <Card className="border-border bg-card/70 p-4">
                  <p className="mb-2 text-xs font-semibold text-muted-foreground">
                    {isAr ? 'الصورة المرفقة' : 'Attached Screenshot'}
                  </p>
                  <div className="relative overflow-hidden rounded-xl border border-border/60 bg-black/20 p-2">
                    <img
                      src={selectedTicket.screenshotUrl}
                      alt="Complaint Screenshot"
                      className="max-h-80 w-full object-contain rounded-lg"
                    />
                  </div>
                </Card>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{isAr ? 'الحالة' : 'Status'}</Label>
                  <Select value={selectedTicket.status} onValueChange={(value) => patchTicket(selectedTicket._id, { status: value })}>
                    <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {statusWorkflow.map((item) => (
                        <SelectItem key={item} value={item} className="cursor-pointer">
                          {isAr ? statusLabels[item] : item.replace('_', ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{isAr ? 'الأولوية' : 'Priority'}</Label>
                  <Select value={selectedTicket.priority} onValueChange={(value) => patchTicket(selectedTicket._id, { priority: value })}>
                    <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(['low', 'medium', 'high', 'urgent'] as ComplaintPriority[]).map((item) => (
                        <SelectItem key={item} value={item} className="cursor-pointer">
                          {isAr ? priorityLabels[item] : item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{isAr ? 'القسم المسؤول' : 'Responsible Department'}</Label>
                  <Select value={selectedTicket.assignedGroup || 'none'} onValueChange={(value) => patchTicket(selectedTicket._id, { assignedGroup: value === 'none' ? '' : value })}>
                    <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
                    <SelectContent>
                       <SelectItem value="none" className="cursor-pointer">{isAr ? 'غير معين' : 'Unassigned'}</SelectItem>
                      {assignmentGroups.map((group) => <SelectItem key={group} value={group} className="cursor-pointer">{isAr ? group : (groupTranslations[group] || group)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{isAr ? 'مسؤول محدد' : 'Assigned Staff'}</Label>
                  <Select value={selectedTicket.assignedStaffId || 'none'} onValueChange={(value) => value !== 'none' && patchTicket(selectedTicket._id, { assignedStaffId: value })}>
                    <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" className="cursor-pointer">{isAr ? 'اختر موظف' : 'Select staff'}</SelectItem>
                      {assignees.map((staff) => <SelectItem key={staff._id} value={staff._id} className="cursor-pointer">{staff.name} • {staff.role}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Card className="border-border bg-card/70 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <MessageSquareReply className="h-4 w-4 text-primary" />
                  <h3 className="font-bold text-foreground">{isAr ? 'المحادثة والردود' : 'Chat & Replies'}</h3>
                </div>
                <div className="max-h-64 space-y-3 overflow-y-auto rounded-squircle border border-border/70 bg-background/40 p-3">
                  {selectedTicket.replies.length === 0 ? (
                    <p className="py-8 text-center text-xs text-muted-foreground">
                      {isAr ? 'لا توجد ردود بعد.' : 'No replies yet.'}
                    </p>
                  ) : (
                    selectedTicket.replies.map((reply, index) => {
                      const isStaffReply = reply.senderRole !== 'student';
                      return (
                        <div key={`${reply.createdAt}-${index}`} className={cn('max-w-[86%] rounded-2xl border p-3', isStaffReply ? 'me-auto border-primary/30 bg-primary/10' : 'ms-auto border-border bg-surface')}>
                          <p className="text-sm leading-6">{reply.message}</p>
                          <p className="mt-2 text-[11px] text-muted-foreground">
                            {reply.senderName} • {reply.senderRole === 'student' ? (isAr ? 'طالب' : 'Student') : (isAr ? 'فريق الإدارة' : 'Admin Staff')} • {formatDate(reply.createdAt)}
                          </p>
                        </div>
                      );
                    })
                  )}
                </div>
                <form onSubmit={handleReply} className="mt-3 flex gap-2">
                  <Input value={replyMessage} onChange={(event) => setReplyMessage(event.target.value)} placeholder={isAr ? 'اكتب رداً للطالب...' : 'Write reply for student...'} />
                  <Button type="submit" disabled={drawerLoading || !replyMessage.trim()} className="gap-2 cursor-pointer disabled:cursor-not-allowed">
                    {isAr ? 'إرسال' : 'Send'}
                    {drawerLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </form>
              </Card>

              <Card className="border-border bg-card/70 p-4">
                <h3 className="font-bold text-foreground">{isAr ? 'ملاحظات داخلية' : 'Internal Notes'}</h3>
                <div className="mt-3 space-y-2">
                  {(selectedTicket.internalNotes ?? []).length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {isAr ? 'لا توجد ملاحظات داخلية.' : 'No internal notes yet.'}
                    </p>
                  ) : (
                    selectedTicket.internalNotes?.map((note, index) => (
                      <div key={`${note.createdAt}-${index}`} className="rounded-squircle border border-border bg-surface/60 p-3">
                        <p className="text-sm">{note.message}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">{note.authorName} • {formatDate(note.createdAt)}</p>
                      </div>
                    ))
                  )}
                  <Textarea value={internalNote} onChange={(event) => setInternalNote(event.target.value)} placeholder={isAr ? 'أضف ملاحظة لا تظهر للطالب...' : 'Add internal note (hidden from student)...'} rows={3} />
                  <Button type="button" variant="outline" disabled={!internalNote.trim() || drawerLoading} onClick={handleInternalNote} className="cursor-pointer disabled:cursor-not-allowed">
                    {isAr ? 'إضافة ملاحظة داخلية' : 'Add Internal Note'}
                  </Button>
                </div>
              </Card>

              <Card className="border-border bg-card/70 p-4">
                <h3 className="font-bold text-foreground">{isAr ? 'سجل الحالة' : 'Status History'}</h3>
                <div className="mt-3 space-y-2">
                  {(selectedTicket.statusHistory ?? []).map((item, index) => (
                    <div key={`${item.changedAt}-${index}`} className="flex items-center justify-between rounded-squircle border border-border bg-surface/60 p-3 text-xs">
                      <span>{item.fromStatus} → {item.toStatus}</span>
                      <span className="text-muted-foreground">{item.changedByName || 'system'} • {formatDate(item.changedAt)}</span>
                    </div>
                  ))}
                </div>
              </Card>

              <div className="flex flex-col gap-2 sm:flex-row no-print">
                <Button variant="outline" onClick={() => printElement('printable-ticket-detail', isAr ? `تفاصيل التذكرة - ${selectedTicket.ticketNumber}` : `Ticket Details - ${selectedTicket.ticketNumber}`)} className="gap-2 cursor-pointer">
                  {isAr ? 'طباعة التذكرة' : 'Print Ticket'}
                  <Printer className="h-4 w-4" />
                </Button>
                <Button variant="destructive" onClick={() => patchTicket(selectedTicket._id, { status: 'closed' })} className="gap-2 cursor-pointer">
                  {isAr ? 'إغلاق التذكرة' : 'Close Ticket'}
                  <Lock className="h-4 w-4" />
                </Button>
                {canManageSettings && (
                  <ConfirmDialog
                    trigger={
                      <Button variant="destructive" className="gap-2 cursor-pointer bg-rose-600 hover:bg-rose-500">
                        {isAr ? 'حذف التذكرة' : 'Delete Ticket'}
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    }
                    title={isAr ? 'حذف التذكرة نهائياً' : 'Permanently Delete Ticket'}
                    description={
                      isAr
                        ? `هل أنت متأكد من حذف التذكرة #${selectedTicket.ticketNumber} نهائياً؟`
                        : `Are you sure you want to delete ticket #${selectedTicket.ticketNumber} permanently?`
                    }
                    confirmLabel={isAr ? 'حذف نهائي' : 'Delete'}
                    cancelLabel={isAr ? 'إلغاء' : 'Cancel'}
                    onConfirm={() => handleDeleteTicket(selectedTicket._id)}
                  />
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Clear All Complaints Danger Modal */}
      <Dialog open={clearAllDialogOpen} onOpenChange={setClearAllDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl border border-border/70 bg-card">
          <DialogHeader className="text-start">
            <div className="flex items-center gap-2 text-rose-600">
              <Trash2 className="w-5 h-5" />
              <DialogTitle className="text-base font-bold">
                {isAr ? 'تأكيد مسح كافة الشكاوى والتذاكر' : 'Confirm Clear All Complaints'}
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground mt-1">
              {isAr
                ? 'سيتم حذف كافة الشكاوى وسجلات الردود الخاصة بجميع الطلاب نهائياً من قاعدة البيانات. هذا الإجراء لا يمكن التراجع عنه.'
                : 'All student complaints, attachments, and replies will be permanently deleted from the database. This action cannot be undone.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300 space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <span>⚠️ {isAr ? 'تحذير أمني خطير' : 'Irreversible Action'}</span>
              </p>
              <p>
                {isAr
                  ? 'لتأكيد المسح الشامل لكافة الشكاوى، يرجى كتابة كلمة: "مسح"'
                  : 'To confirm purging all complaints, type "DELETE":'}
              </p>
            </div>

            <Input
              type="text"
              value={clearAllConfirmText}
              onChange={(e) => setClearAllConfirmText(e.target.value)}
              placeholder={isAr ? 'اكتب "مسح" للتأكيد' : 'Type "DELETE" to confirm'}
              className="text-xs h-9 text-center font-bold"
            />
          </div>

          <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-start gap-2 pt-2 border-t border-border/70">
            <Button
              type="button"
              variant="outline"
              onClick={() => setClearAllDialogOpen(false)}
              className="text-xs h-9 cursor-pointer"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button
              type="button"
              disabled={
                isDeleting ||
                (isAr
                  ? clearAllConfirmText.trim() !== 'مسح'
                  : clearAllConfirmText.trim().toUpperCase() !== 'DELETE')
              }
              onClick={handleClearAll}
              className="text-xs h-9 bg-rose-600 hover:bg-rose-500 text-white font-semibold cursor-pointer shadow-xs"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{isAr ? 'جاري المسح...' : 'Clearing...'}</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isAr ? 'تأكيد المسح الشامل' : 'Confirm Purge'}</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ComplaintsPage() {
  return (
    <Suspense fallback={<PageSkeletonLoader />}>
      <PermissionGuard permission="complaints.read">
        <AdminComplaintsContent />
      </PermissionGuard>
    </Suspense>
  );
}
