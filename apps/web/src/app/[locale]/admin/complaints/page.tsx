'use client';

import React, { Suspense, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { ClipboardList, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/providers/auth-provider';
import { PermissionGuard } from '@/components/ui/permission-guard';
import { PageSkeletonLoader } from '@/components/ui/page-suspense-fallback';
import { PageTitleBanner } from '@/components/ui/page-title-banner';
import { useComplaintStore } from '@/store/complaint-store';
import {
  complaintKeys,
  listAdminComplaints,
  listAssignableStaff,
  replyToComplaint,
  updateComplaint,
} from '@/features/complaints/api';
import type { Complaint, ComplaintPriority, ComplaintStatus } from '@/features/complaints/schema';
import { ComplaintDetailsDrawer } from '@/features/complaints/components/complaint-details-drawer';

const statusWorkflow: ComplaintStatus[] = ['open', 'in_review', 'in_progress', 'resolved', 'closed'];
const statusLabels: Record<ComplaintStatus, string> = { open: 'قيد الانتظار', in_review: 'قيد المراجعة', in_progress: 'جاري العمل', resolved: 'تم الحل', closed: 'مغلق' };
const statusLabelsEn: Record<ComplaintStatus, string> = { open: 'Pending', in_review: 'In Review', in_progress: 'Working', resolved: 'Resolved', closed: 'Closed' };
const priorityLabels: Record<ComplaintPriority, string> = { low: 'منخفضة', medium: 'عادية', high: 'عالية', urgent: 'عاجلة' };
const assignmentGroups = ['general_inquiry', 'academic_affairs', 'control_affairs', 'it_support', 'finance_affairs'];
const groupTranslations: Record<string, string> = { general_inquiry: 'استفسارات عامة', academic_affairs: 'الشئون الأكاديمية', control_affairs: 'شئون الكنترول', it_support: 'الدعم الفني', finance_affairs: 'الشئون المالية' };

function AdminComplaintsContent() {
  const params = useParams();
  const locale = params.locale as string;
  const isAr = locale === 'ar';
  const queryClient = useQueryClient();

  const { adminFilters } = useComplaintStore();
  const [selectedTicket, setSelectedTicket] = useState<Complaint | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);

  const complaintsQuery = useQuery({
    queryKey: complaintKeys.adminList(adminFilters),
    queryFn: async () => {
      const res = await listAdminComplaints({
        search: adminFilters.search || undefined,
        status: adminFilters.status !== 'all' ? adminFilters.status : undefined,
        priority: adminFilters.priority !== 'all' ? adminFilters.priority : undefined,
        type: adminFilters.type !== 'all' ? adminFilters.type : undefined,
      });
      return res;
    },
  });

  const staffQuery = useQuery({
    queryKey: ['assignable-staff'],
    queryFn: () => listAssignableStaff(),
  });

  const complaints = complaintsQuery.data?.items ?? [];
  const assignees = staffQuery.data ?? [];

  const patchTicket = async (id: string, updates: Record<string, unknown>) => {
    try {
      await updateComplaint(id, updates);
      toast.success(isAr ? 'تم تحديث التذكرة بنجاح' : 'Ticket updated');
      void queryClient.invalidateQueries({ queryKey: complaintKeys.adminLists() });
      if (selectedTicket && selectedTicket._id === id) {
        setSelectedTicket((prev) => (prev ? { ...prev, ...updates } as Complaint : null));
      }
    } catch {
      toast.error(isAr ? 'فشل تحديث التذكرة' : 'Failed to update ticket');
    }
  };

  const handleReply = async (ticketId: string, message: string) => {
    setDrawerLoading(true);
    try {
      await replyToComplaint(ticketId, message);
      toast.success(isAr ? 'تم إرسال الرد بنجاح' : 'Reply sent');
      void queryClient.invalidateQueries({ queryKey: complaintKeys.adminLists() });
    } catch {
      toast.error(isAr ? 'فشل إرسال الرد' : 'Failed to send reply');
    } finally {
      setDrawerLoading(false);
    }
  };

  const handleAddNote = async (ticketId: string, message: string) => {
    setDrawerLoading(true);
    try {
      await updateComplaint(ticketId, { internalNote: message });
      toast.success(isAr ? 'تمت إضافة الملاحظة' : 'Note added');
      void queryClient.invalidateQueries({ queryKey: complaintKeys.adminLists() });
    } catch {
      toast.error(isAr ? 'فشل إضافة الملاحظة' : 'Failed to add note');
    } finally {
      setDrawerLoading(false);
    }
  };

  return (
    <div className="animate-fade-in space-y-6 p-2 md:p-6">
      <PageTitleBanner title={isAr ? 'إدارة الشكاوى والمقترحات' : 'Complaints Management'} icon={<ClipboardList className="h-5 w-5" />} subtitle="Manage student support tickets, triage technical issues, and reply to complaints." />

      <div className="rounded-xl border border-border/70 bg-card/90 p-6 text-start shadow-(--shadow-glow)">
        <h2 className="text-lg font-bold text-foreground mb-4">{isAr ? 'قائمة الشكاوى الحالية' : 'Current Complaints List'}</h2>
        {complaintsQuery.isLoading ? (
          <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : complaints.length === 0 ? (
          <p className="text-sm text-muted-foreground">{isAr ? 'لا توجد شكاوى مطابقة.' : 'No complaints found.'}</p>
        ) : (
          <div className="space-y-3">
            {complaints.map((ticket) => (
              <div key={ticket._id} onClick={() => setSelectedTicket(ticket)} className="flex items-center justify-between p-4 rounded-xl border border-border/70 bg-surface/35 hover:border-primary/50 cursor-pointer transition-all">
                <div>
                  <p className="font-mono text-xs font-bold text-primary">{ticket.ticketNumber}</p>
                  <p className="font-semibold text-foreground mt-0.5">{ticket.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{ticket.studentName} · {ticket.studentCode}</p>
                </div>
                <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                  {isAr ? statusLabels[ticket.status] : statusLabelsEn[ticket.status]}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <ComplaintDetailsDrawer
        ticket={selectedTicket}
        onClose={() => setSelectedTicket(null)}
        locale={locale}
        statusWorkflow={statusWorkflow}
        statusLabels={statusLabels}
        statusLabelsEn={statusLabelsEn}
        priorityLabels={priorityLabels}
        assignmentGroups={assignmentGroups}
        groupTranslations={groupTranslations}
        assignees={assignees}
        onPatchTicket={patchTicket}
        onReply={handleReply}
        onAddNote={handleAddNote}
        drawerLoading={drawerLoading}
      />
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
