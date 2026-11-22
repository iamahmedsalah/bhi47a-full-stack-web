'use client';
import NextImage from "next/image";

import React, { useState } from 'react';
import {
  ArrowRight,
  Lock,
  Loader2,
  MessageSquareReply,
  Send,
  ZoomIn,
  Phone,
  Mail,
  CreditCard,
  Building,
  User,
  Copy,
} from 'lucide-react';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ImageLightbox } from '@/components/ui/image-lightbox';
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

const defaultStatusLabels: Record<string, string> = {
  new: 'جديد',
  open: 'قيد الانتظار',
  in_review: 'قيد المراجعة',
  in_progress: 'جاري العمل',
  resolved: 'تم الحل',
  closed: 'مغلق',
};

const defaultStatusLabelsEn: Record<string, string> = {
  new: 'New',
  open: 'Pending',
  in_review: 'In Review',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

function formatStatus(rawStatus?: string, locale?: string, customAr?: Record<string, string>, customEn?: Record<string, string>): string {
  if (!rawStatus) return '';
  const isAr = locale === 'ar';
  if (isAr) {
    return (customAr && customAr[rawStatus]) || defaultStatusLabels[rawStatus] || rawStatus;
  }
  return (customEn && customEn[rawStatus]) || defaultStatusLabelsEn[rawStatus] || rawStatus.replace('_', ' ');
}
const departmentLabelsAr: Record<string, string> = {
  student_affairs: 'شؤون الطلاب',
  technical_support: 'الدعم الفني',
  finance: 'المالية',
  control: 'الكنترول',
  academic_advising: 'الإرشاد الأكاديمي',
  'شؤون الطلاب': 'شؤون الطلاب',
  'الدعم الفني': 'الدعم الفني',
  'المالية': 'المالية',
  'الكنترول': 'الكنترول',
  'الإرشاد الأكاديمي': 'الإرشاد الأكاديمي',
};

const departmentLabelsEn: Record<string, string> = {
  student_affairs: 'Student Affairs',
  technical_support: 'Technical Support',
  finance: 'Financial Department',
  control: 'Control Room',
  academic_advising: 'Academic Advising',
  'شؤون الطلاب': 'Student Affairs',
  'الدعم الفني': 'Technical Support',
  'المالية': 'Financial Department',
  'الكنترول': 'Control Room',
  'الإرشاد الأكاديمي': 'Academic Advising',
};

function formatDepartment(dept?: string, locale?: string): string {
  if (!dept) return '';
  const isAr = locale === 'ar';
  if (isAr) {
    return departmentLabelsAr[dept] || dept;
  }
  return departmentLabelsEn[dept] || dept.replace(/_/g, ' ');
}

function formatStudentDisplayName(
  ticket?: { requesterName?: string; studentName?: string; studentNameAr?: string },
  locale?: string,
): string {
  if (!ticket) return '';
  const isAr = locale === 'ar';
  const hasArabic = (str?: string) => Boolean(str && /[\u0600-\u06FF]/.test(str));
  const names = [ticket.studentNameAr, ticket.requesterName, ticket.studentName].filter(Boolean) as string[];

  if (isAr) {
    const arabicName = names.find((n) => hasArabic(n));
    return arabicName || ticket.studentName || ticket.requesterName || '';
  }
  const englishName = names.find((n) => !hasArabic(n));
  return englishName || ticket.studentName || ticket.requesterName || '';
}

export function ComplaintDetailsDrawer({ ticket, onClose, locale, statusWorkflow, statusLabels, statusLabelsEn, priorityLabels, onPatchTicket, onReply, onAddNote, drawerLoading }: ComplaintDetailsDrawerProps) {
  const isAr = locale === 'ar';
  const [replyMessage, setReplyMessage] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

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
            <Card className="border-border bg-card/70 p-4 space-y-3 sm:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 pb-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-squircle bg-primary/10 border border-primary/20 text-primary">
                    <User className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      {isAr ? 'بيانات الطالب ومقدم البلاغ' : 'Student & Applicant Details'}
                    </p>
                    <h3 className="mt-0.5 text-base font-bold text-foreground">
                      {formatStudentDisplayName(ticket, locale)}
                    </h3>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 rounded-squircle border border-primary/30 bg-primary/10 px-3 py-1 text-primary shadow-xs">
                    <span className="text-[10px] font-medium text-primary/80">{isAr ? 'كود الطالب' : 'Code'}:</span>
                    <span className="font-mono text-xs font-bold" dir="ltr">{ticket.studentCode}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
                {/* Box 1: National ID (Full 14 Digits) */}
                <div className="flex flex-col justify-between rounded-xl border border-white/5 bg-secondary/30 p-3 hover:border-amber-500/30 transition-colors">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
                      <CreditCard className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                      {isAr ? 'الرقم القومي' : 'National ID'}
                    </span>
                    {(ticket.nationalId || ticket.nationalIdMasked) && (
                      <button
                        type="button"
                        onClick={() => {
                          const idVal = ticket.nationalId || ticket.nationalIdMasked || '';
                          navigator.clipboard.writeText(idVal);
                          toast.success(isAr ? 'تم نسخ الرقم القومي' : 'National ID copied');
                        }}
                        title={isAr ? 'نسخ الرقم القومي' : 'Copy National ID'}
                        className="text-muted-foreground hover:text-amber-400 p-0.5 rounded transition-colors cursor-pointer"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  <span dir="ltr" className="font-mono text-sm font-bold text-foreground tracking-wider select-all">
                    {ticket.nationalId || ticket.nationalIdMasked || (isAr ? 'غير متاح' : 'N/A')}
                  </span>
                </div>

                {/* Box 2: Contact Phone */}
                <div className="flex flex-col justify-between rounded-xl border border-white/5 bg-secondary/30 p-3 hover:border-teal-500/30 transition-colors">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-teal-400 shrink-0" />
                      {isAr ? 'رقم الهاتف' : 'Contact Phone'}
                    </span>
                    {ticket.contactPhone && (
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(ticket.contactPhone || '');
                          toast.success(isAr ? 'تم نسخ رقم الهاتف' : 'Phone copied');
                        }}
                        title={isAr ? 'نسخ رقم الهاتف' : 'Copy phone'}
                        className="text-muted-foreground hover:text-teal-400 p-0.5 rounded transition-colors cursor-pointer"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  {ticket.contactPhone ? (
                    <a
                      href={`tel:${ticket.contactPhone}`}
                      dir="ltr"
                      className="font-mono text-sm font-bold text-teal-300 hover:underline truncate"
                    >
                      {ticket.contactPhone}
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground font-mono">{isAr ? 'غير متاح' : 'N/A'}</span>
                  )}
                </div>

                {/* Box 3: Target Department (Translated) */}
                <div className="flex flex-col justify-between rounded-xl border border-white/5 bg-secondary/30 p-3 hover:border-purple-500/30 transition-colors">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Building className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                    <span className="text-[11px] font-medium text-muted-foreground">
                      {isAr ? 'القسم المطلوب' : 'Target Dept'}
                    </span>
                  </div>
                  <span className="text-sm font-bold text-purple-300 truncate">
                    {formatDepartment(ticket.department || ticket.assignedGroup, locale) || (isAr ? 'عام' : 'General')}
                  </span>
                </div>

                {/* Box 4: Assigned Staff */}
                <div className="flex flex-col justify-between rounded-xl border border-white/5 bg-secondary/30 p-3 hover:border-indigo-500/30 transition-colors">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <User className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                    <span className="text-[11px] font-medium text-muted-foreground">
                      {isAr ? 'الموظف المسؤول' : 'Assigned Staff'}
                    </span>
                  </div>
                  <span className="text-sm font-bold text-foreground truncate flex items-center gap-1.5">
                    <span className={cn('h-2 w-2 rounded-full shrink-0', ticket.assignedStaffName ? 'bg-emerald-400' : 'bg-muted-foreground/40')} />
                    <span className="truncate">{ticket.assignedStaffName || (isAr ? 'غير معين' : 'Unassigned')}</span>
                  </span>
                </div>
              </div>

              {/* Optional Row: Contact Email */}
              {ticket.contactEmail && (
                <div className="flex items-center justify-between rounded-lg border border-white/5 bg-secondary/20 px-3 py-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <Mail className="h-3.5 w-3.5 text-sky-400 shrink-0" />
                    <span className="text-[11px] text-muted-foreground">{isAr ? 'البريد الإلكتروني' : 'Email'}:</span>
                    <a
                      href={`mailto:${ticket.contactEmail}`}
                      dir="ltr"
                      className="font-mono text-sky-300 hover:underline truncate"
                    >
                      {ticket.contactEmail}
                    </a>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(ticket.contactEmail || '');
                      toast.success(isAr ? 'تم نسخ البريد الإلكتروني' : 'Email copied');
                    }}
                    className="text-muted-foreground hover:text-sky-300 text-[10px] flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Copy className="h-3 w-3" />
                    <span>{isAr ? 'نسخ' : 'Copy'}</span>
                  </button>
                </div>
              )}
            </Card>
          </div>

          <Card className="border-border bg-card/70 p-4">
            <p className="mb-2 text-xs font-semibold text-muted-foreground">{isAr ? 'تفاصيل البلاغ' : 'Ticket Details'}</p>
            <p className="whitespace-pre-wrap text-sm leading-7 text-foreground">{ticket.description}</p>
          </Card>

          {ticket.screenshotUrl && (
            <Card className="border-border bg-card/70 p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-muted-foreground">{isAr ? 'الصورة المرفقة' : 'Attached Screenshot'}</p>
                <span className="text-[11px] text-primary flex items-center gap-1 font-medium">
                  <ZoomIn className="h-3.5 w-3.5" />
                  {isAr ? 'انقر للتكبير والتصغير' : 'Click to zoom'}
                </span>
              </div>
              <div
                role="button"
                tabIndex={0}
                onClick={() => setPreviewImageUrl(ticket.screenshotUrl ?? null)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setPreviewImageUrl(ticket.screenshotUrl ?? null);
                  }
                }}
                className="group relative cursor-pointer overflow-hidden rounded-xl border border-border/60 bg-black/20 p-2 transition-all hover:border-primary/50 hover:bg-black/30 focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <NextImage unoptimized width={1200} height={800}
                  src={ticket.screenshotUrl}
                  alt="Complaint Screenshot"
                  className="max-h-80 w-full rounded-lg object-contain transition-transform duration-200 group-hover:scale-[1.01]"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity duration-200 group-hover:opacity-100 backdrop-blur-[2px] rounded-xl">
                  <div className="flex items-center gap-2 rounded-squircle bg-black/80 px-3.5 py-1.5 text-xs font-bold text-white shadow-xl border border-white/15">
                    <ZoomIn className="h-4 w-4 text-teal-400" />
                    <span>{isAr ? 'عرض وتكبير الصورة' : 'Open & Zoom'}</span>
                  </div>
                </div>
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

          {ticket.statusHistory && ticket.statusHistory.length > 0 && (
            <Card className="border-border bg-card/70 p-4">
              <h3 className="font-bold text-foreground">{isAr ? 'سجل الحالة' : 'Status History'}</h3>
              <div className="mt-3 space-y-2">
                {ticket.statusHistory.map((item, index) => (
                  <div key={`${item.changedAt}-${index}`} className="flex items-center justify-between rounded-squircle border border-border bg-surface/60 p-3 text-xs">
                    <div className="flex items-center gap-1.5 font-semibold">
                      <span className="text-muted-foreground">{formatStatus(item.fromStatus, locale, statusLabels, statusLabelsEn)}</span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-primary rtl:rotate-180" aria-hidden="true" />
                      <span className="text-foreground font-bold">{formatStatus(item.toStatus, locale, statusLabels, statusLabelsEn)}</span>
                    </div>
                    <span className="text-muted-foreground">
                      {(item.changedByName === 'system' || !item.changedByName) ? (isAr ? 'النظام' : 'System') : item.changedByName} • {formatDate(item.changedAt, locale)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <div className="flex gap-2">
            <Button variant="destructive" onClick={() => onPatchTicket(ticket._id, { status: 'closed' })} className="gap-2">
              <Lock className="h-4 w-4" />
              {isAr ? 'إغلاق التذكرة' : 'Close Ticket'}
            </Button>
          </div>
        </div>
      </SheetContent>

      {/* Lightbox for full-size screenshot preview with zoom and pan */}
      <ImageLightbox
        src={previewImageUrl}
        isOpen={Boolean(previewImageUrl)}
        onClose={() => setPreviewImageUrl(null)}
        title={ticket ? `#${ticket.ticketNumber} - ${ticket.title}` : undefined}
      />
    </Sheet>
  );
}
