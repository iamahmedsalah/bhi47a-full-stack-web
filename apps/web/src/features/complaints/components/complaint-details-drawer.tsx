'use client';

import React, { useState } from 'react';
import { Lock, Loader2, MessageSquareReply, Printer, Send } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { printElement } from '@/lib/utils';
import { cn } from '@/lib/cn';
import type { Complaint, ComplaintPriority, ComplaintStatus } from '../schema';

interface AssignableStaff {
  _id: string;
  name: string;
  email?: string;
  role: 'admin' | 'staff';
}

interface ComplaintDetailsDrawerProps {
  ticket: Complaint | null;
  onClose: () => void;
  locale: string;
  statusWorkflow: ComplaintStatus[];
  statusLabels: Record<ComplaintStatus, string>;
  statusLabelsEn: Record<ComplaintStatus, string>;
  priorityLabels: Record<ComplaintPriority, string>;
  assignmentGroups: string[];
  groupTranslations: Record<string, string>;
  assignees: AssignableStaff[];
  onPatchTicket: (id: string, updates: Record<string, unknown>) => Promise<void>;
  onReply: (ticketId: string, message: string) => Promise<void>;
  onAddNote: (ticketId: string, note: string) => Promise<void>;
  drawerLoading: boolean;
}

function formatDate(value?: string, locale?: string) {
  if (!value) return 'N/A';
  return new Date(value).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function ComplaintDetailsDrawer({
  ticket,
  onClose,
  locale,
  statusWorkflow,
  statusLabels,
  statusLabelsEn,
  priorityLabels,
  assignmentGroups,
  groupTranslations,
  assignees,
  onPatchTicket,
  onReply,
  onAddNote,
  drawerLoading,
}: ComplaintDetailsDrawerProps) {
  const isAr = locale === 'ar';
  const [replyMessage, setReplyMessage] = useState('');
  const [internalNote, setInternalNote] = useState('');

  if (!ticket) return null;

  const handleReplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyMessage.trim()) return;
    await onReply(ticket._id, replyMessage.trim());
    setReplyMessage('');
  };

  const handleNoteSubmit = async () => {
    if (!internalNote.trim()) return;
    await onAddNote(ticket._id, internalNote.trim());
    setInternalNote('');
  };

  return (
    <Sheet open={Boolean(ticket)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side={isAr ? 'left' : 'right'} className="w-full overflow-y-auto border-border bg-[#0d1821] p-0 text-foreground sm:max-w-2xl">
        <div id="printable-ticket-detail" className="space-y-5 p-5 text-start">
          <SheetHeader className="text-start">
            <SheetTitle className="flex flex-wrap items-center gap-2 text-xl">
              <span>{ticket.ticketNumber}</span>
              <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">
                {isAr ? statusLabels[ticket.status] : statusLabelsEn[ticket.status]}
              </span>
            </SheetTitle>
            <SheetDescription>{ticket.title}</SheetDescription>
          </SheetHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <Card className="border-border bg-card/70 p-4">
              <p className="text-xs text-muted-foreground">{isAr ? 'بيانات الطالب' : 'Student Info'}</p>
              <h3 className="mt-2 font-bold text-foreground">{ticket.studentName}</h3>
              <p className="font-mono text-sm text-primary">{ticket.studentCode}</p>
            </Card>
            <Card className="border-border bg-card/70 p-4">
              <p className="text-xs text-muted-foreground">{isAr ? 'الموظف المسؤول' : 'Assigned Staff'}</p>
              <h3 className="mt-2 font-bold text-foreground">{ticket.assignedStaffName || (isAr ? 'غير معين' : 'Unassigned')}</h3>
              <p className="text-sm text-muted-foreground">
                {(ticket.assignedGroup ? (isAr ? ticket.assignedGroup : groupTranslations[ticket.assignedGroup] || ticket.assignedGroup) : '') || (isAr ? 'لا يوجد قسم محدد' : 'No target department')}
              </p>
            </Card>
          </div>

          <Card className="border-border bg-card/70 p-4">
            <p className="mb-2 text-xs font-semibold text-muted-foreground">{isAr ? 'تفاصيل البلاغ' : 'Ticket Details'}</p>
            <p className="whitespace-pre-wrap text-sm leading-7 text-foreground">{ticket.description}</p>
          </Card>

          {ticket.screenshotUrl && (
            <Card className="border-border bg-card/70 p-4">
              <p className="mb-2 text-xs font-semibold text-muted-foreground">{isAr ? 'الصورة المرفقة' : 'Attached Screenshot'}</p>
              <div className="relative overflow-hidden rounded-xl border border-border/60 bg-black/20 p-2">
                <img src={ticket.screenshotUrl} alt="Complaint Screenshot" className="max-h-80 w-full rounded-lg object-contain" />
              </div>
            </Card>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{isAr ? 'الحالة' : 'Status'}</Label>
              <Select value={ticket.status} onValueChange={(val) => onPatchTicket(ticket._id, { status: val })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {statusWorkflow.map((item) => (
                    <SelectItem key={item} value={item}>{isAr ? statusLabels[item] : item.replace('_', ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{isAr ? 'الأولوية' : 'Priority'}</Label>
              <Select value={ticket.priority} onValueChange={(val) => onPatchTicket(ticket._id, { priority: val })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['low', 'medium', 'high', 'urgent'] as ComplaintPriority[]).map((item) => (
                    <SelectItem key={item} value={item}>{isAr ? priorityLabels[item] : item}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Card className="border-border bg-card/70 p-4">
            <div className="mb-3 flex items-center gap-2">
              <MessageSquareReply className="h-4 w-4 text-primary" />
              <h3 className="font-bold text-foreground">{isAr ? 'المحادثة والردود' : 'Chat & Replies'}</h3>
            </div>
            <div className="max-h-64 space-y-3 overflow-y-auto rounded-xl border border-border/70 bg-background/40 p-3">
              {ticket.replies.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">{isAr ? 'لا توجد ردود بعد.' : 'No replies yet.'}</p>
              ) : (
                ticket.replies.map((reply, idx) => (
                  <div key={`${reply.createdAt}-${idx}`} className={cn('max-w-[86%] rounded-2xl border p-3', reply.senderRole !== 'student' ? 'me-auto border-primary/30 bg-primary/10' : 'ms-auto border-border bg-surface')}>
                    <p className="text-sm leading-6">{reply.message}</p>
                    <p className="mt-2 text-[11px] text-muted-foreground">{reply.senderName} • {formatDate(reply.createdAt, locale)}</p>
                  </div>
                ))
              )}
            </div>
            <form onSubmit={handleReplySubmit} className="mt-3 flex gap-2">
              <Input value={replyMessage} onChange={(e) => setReplyMessage(e.target.value)} placeholder={isAr ? 'اكتب رداً للطالب...' : 'Write reply...'} />
              <Button type="submit" disabled={drawerLoading || !replyMessage.trim()} className="gap-2">
                {isAr ? 'إرسال' : 'Send'}
                {drawerLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </form>
          </Card>

          <Card className="border-border bg-card/70 p-4">
            <h3 className="font-bold text-foreground">{isAr ? 'ملاحظات داخلية' : 'Internal Notes'}</h3>
            <div className="mt-3 space-y-2">
              <Textarea value={internalNote} onChange={(e) => setInternalNote(e.target.value)} placeholder={isAr ? 'أضف ملاحظة داخلية...' : 'Add note...'} rows={2} />
              <Button type="button" variant="outline" disabled={!internalNote.trim() || drawerLoading} onClick={handleNoteSubmit}>
                {isAr ? 'إضافة ملاحظة' : 'Add Note'}
              </Button>
            </div>
          </Card>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => printElement('printable-ticket-detail', `Ticket-${ticket.ticketNumber}`)} className="gap-2">
              <Printer className="h-4 w-4" />
              {isAr ? 'طباعة التذكرة' : 'Print Ticket'}
            </Button>
            <Button variant="destructive" onClick={() => onPatchTicket(ticket._id, { status: 'closed' })} className="gap-2">
              <Lock className="h-4 w-4" />
              {isAr ? 'إغلاق التذكرة' : 'Close Ticket'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
