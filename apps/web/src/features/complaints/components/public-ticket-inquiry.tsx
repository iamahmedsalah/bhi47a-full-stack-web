'use client';
import NextImage from "next/image";

import React, { useState, useEffect } from 'react';
import {
  Search,
  Loader2,
  Clock,
  MessageSquare,
  Send,
  Copy,
  AlertCircle,
  FileText,
  User,
  Building2,
  ZoomIn,
  RefreshCw,
  ArrowRight,
  ShieldCheck,
  Layers,
} from 'lucide-react';
import { toast } from 'sonner';
import api, { getApiErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ImageLightbox } from '@/components/ui/image-lightbox';
import { cn } from '@/lib/cn';

interface TicketReply {
  senderName: string;
  senderRole: 'student' | 'admin' | 'staff';
  message: string;
  createdAt: string;
}

export interface PublicTicketSummary {
  _id: string;
  ticketNumber: string;
  title: string;
  status: string;
  priority: string;
  department: string;
  createdAt: string;
}

export interface PublicTicketDetails {
  _id: string;
  ticketNumber: string;
  title: string;
  description: string;
  type: string;
  department: string;
  status: string;
  priority: string;
  studentCode: string;
  studentName?: string;
  assignedGroup?: string;
  assignedStaffName?: string;
  screenshotUrl?: string;
  createdAt: string;
  updatedAt: string;
  replies: TicketReply[];
}

interface PublicTicketQueryResponse {
  selectedTicket: PublicTicketDetails;
  allTickets: PublicTicketSummary[];
}

interface PublicTicketInquiryProps {
  locale: string;
  isAr: boolean;
  initialTicketNumber?: string;
  initialStudentCode?: string;
  initialNationalId?: string;
  onSwitchToNew?: () => void;
}

const statusLabelsAr: Record<string, string> = {
  new: 'جديد',
  open: 'قيد الانتظار',
  in_review: 'قيد المراجعة',
  in_progress: 'جاري العمل',
  resolved: 'تم الحل',
  closed: 'مغلق',
};

const statusLabelsEn: Record<string, string> = {
  new: 'New',
  open: 'Pending',
  in_review: 'In Review',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

const departmentLabelsAr: Record<string, string> = {
  student_affairs: 'شؤون الطلاب',
  technical_support: 'الدعم الفني',
  finance: 'المالية',
  control: 'الكنترول والامتحانات',
  academic_advising: 'الإرشاد الأكاديمي',
};

const departmentLabelsEn: Record<string, string> = {
  student_affairs: 'Student Affairs',
  technical_support: 'Technical Support',
  finance: 'Financial Department',
  control: 'Control & Exams',
  academic_advising: 'Academic Advising',
};

const priorityLabelsAr: Record<string, string> = {
  low: 'منخفضة',
  medium: 'متوسطة',
  high: 'مرتفعة',
  urgent: 'عاجلة',
};

const priorityLabelsEn: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

function getStatusBadgeStyle(status: string) {
  switch (status) {
    case 'resolved':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
    case 'in_progress':
    case 'in_review':
      return 'border-sky-500/30 bg-sky-500/10 text-sky-300';
    case 'open':
    case 'new':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
    case 'closed':
      return 'border-gray-500/30 bg-gray-500/10 text-gray-300';
    default:
      return 'border-primary/30 bg-primary/10 text-primary';
  }
}

export function PublicTicketInquiry({ isAr, initialTicketNumber = '', initialStudentCode = '', initialNationalId = '', onSwitchToNew }: PublicTicketInquiryProps) {
  const [studentCode, setStudentCode] = useState(initialStudentCode);
  const [nationalId, setNationalId] = useState(initialNationalId);
  const [ticketNumber, setTicketNumber] = useState(initialTicketNumber);

  const [isSearching, setIsSearching] = useState(false);
  const [ticket, setTicket] = useState<PublicTicketDetails | null>(null);
  const [allTickets, setAllTickets] = useState<PublicTicketSummary[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Reply states
  const [replyMessage, setReplyMessage] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);

  // Lightbox
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleString(isAr ? 'ar-EG' : 'en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  };

  const executeSearch = async (targetTicketNumber?: string) => {
    const cleanCode = studentCode.trim();
    const cleanNationalId = nationalId.trim();
    const cleanTicket = (targetTicketNumber ?? ticketNumber).trim().toUpperCase();

    if (!cleanCode) {
      toast.error(isAr ? 'يرجى إدخال كود الطالب' : 'Please enter student code');
      return;
    }

    if (!cleanNationalId || cleanNationalId.length !== 14) {
      toast.error(
        isAr
          ? 'يرجى إدخال الرقم القومي المكون من 14 رقماً'
          : 'Please enter a valid 14-digit national ID',
      );
      return;
    }

    setIsSearching(true);
    setSearchError(null);

    try {
      const payload: { studentCode: string; nationalId: string; ticketNumber?: string } = {
        studentCode: cleanCode,
        nationalId: cleanNationalId,
      };
      if (cleanTicket) {
        payload.ticketNumber = cleanTicket;
      }

      const res = await api.post<PublicTicketQueryResponse>(
        '/public/complaints/query',
        payload,
      );

      setTicket(res.data.selectedTicket);
      setAllTickets(res.data.allTickets || []);
      if (res.data.selectedTicket?.ticketNumber) {
        setTicketNumber(res.data.selectedTicket.ticketNumber);
      }
      toast.success(isAr ? 'تم استرجاع بيانات التذكرة' : 'Ticket details retrieved');
    } catch (err) {
      const msg = getApiErrorMessage(
        err,
        isAr
          ? 'تعذر العثور على التذكرة، يرجى التأكد من كود الطالب والرقم القومي'
          : 'Could not find ticket. Please check student code and national ID',
      );
      setSearchError(msg);
      setTicket(null);
      setAllTickets([]);
      toast.error(msg);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    void executeSearch();
  };

  const handleSelectAnotherTicket = (selectedNumber: string) => {
    setTicketNumber(selectedNumber);
    void executeSearch(selectedNumber);
  };

  const [previousPrefill, setPreviousPrefill] = useState<unknown[] | null>(null);
  if (!previousPrefill || previousPrefill.some((value, i) => value !== [initialStudentCode, initialNationalId, initialTicketNumber][i])) {
    setPreviousPrefill([initialStudentCode, initialNationalId, initialTicketNumber]);
    if (initialStudentCode && initialNationalId) {
      setStudentCode(initialStudentCode); setNationalId(initialNationalId);
      if (initialTicketNumber) setTicketNumber(initialTicketNumber);
      setIsSearching(true);
    }
  }

  // Auto search if initial parameters provided
  useEffect(() => {
    if (initialStudentCode && initialNationalId) {
      void (async () => {
        try {
          const res = await api.post<PublicTicketQueryResponse>(
            '/public/complaints/query',
            {
              studentCode: initialStudentCode.trim(),
              nationalId: initialNationalId.trim(),
              ticketNumber: initialTicketNumber ? initialTicketNumber.trim().toUpperCase() : undefined,
            },
          );
          setTicket(res.data.selectedTicket);
          setAllTickets(res.data.allTickets || []);
        } catch {
          // ignore auto-query errors
        } finally {
          setIsSearching(false);
        }
      })();
    }
  }, [initialTicketNumber, initialStudentCode, initialNationalId]);

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticket) return;

    const trimmed = replyMessage.trim();
    if (trimmed.length < 2) {
      toast.error(isAr ? 'نص الرد قصير جداً' : 'Reply is too short');
      return;
    }

    if (trimmed.length > 500) {
      toast.error(
        isAr
          ? 'الحد الأقصى للرد هو 500 حرف'
          : 'Reply exceeds 500 characters',
      );
      return;
    }

    // Safe text verification: no script or HTML tags
    if (/<[^>]*>|javascript:|data:/i.test(trimmed)) {
      toast.error(
        isAr
          ? 'نص الرد يحتوي على وسوم أو روابط غير مسموح بها'
          : 'Reply contains disallowed tags or links',
      );
      return;
    }

    setIsSendingReply(true);
    try {
      const res = await api.post<{ success: boolean; replies: TicketReply[] }>(
        '/public/complaints/reply',
        {
          ticketNumber: ticket.ticketNumber,
          studentCode: ticket.studentCode,
          nationalId: nationalId.trim(),
          message: trimmed,
        },
      );
      setTicket({
        ...ticket,
        replies: res.data.replies,
      });
      setReplyMessage('');
      toast.success(isAr ? 'تم إرسال ردك بنجاح' : 'Reply sent successfully');
    } catch (err) {
      toast.error(
        getApiErrorMessage(
          err,
          isAr ? 'تعذر إرسال الرد' : 'Could not send reply',
        ),
      );
    } finally {
      setIsSendingReply(false);
    }
  };

  const copyTicket = async () => {
    if (!ticket) return;
    try {
      await navigator.clipboard.writeText(ticket.ticketNumber);
      toast.success(isAr ? 'تم نسخ رقم التذكرة' : 'Ticket number copied');
    } catch {
      toast.error(isAr ? 'تعذر نسخ الرقم' : 'Failed to copy');
    }
  };

  return (
    <div className="space-y-6">
      {/* Search Lookup Form */}
      <Card className="rounded-xl border border-border/70 bg-card/80 p-5 shadow-sm">
        <form onSubmit={handleSearch} className="space-y-4">
          <div className="flex items-center gap-2 border-b border-white/5 pb-3">
            <Search className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold text-foreground">
              {isAr ? 'الاستعلام ومتابعة حالة الشكوى أو التذكرة' : 'Ticket Status Lookup'}
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {/* Student Code (Required) */}
            <div className="space-y-1.5 text-start">
              <Label className="text-xs font-semibold">
                {isAr ? 'كود الطالب *' : 'Student Code *'}
              </Label>
              <Input
                value={studentCode}
                onChange={(e) => setStudentCode(e.target.value.replace(/\D/g, '').slice(0, 12))}
                placeholder="261354"
                dir="ltr"
                className="font-mono text-xs rounded-xl"
                required
              />
              <span className="text-[10px] text-muted-foreground block">
                {isAr ? 'كود الطالب الأكاديمي' : 'Academic student code'}
              </span>
            </div>

            {/* National ID (Required) */}
            <div className="space-y-1.5 text-start">
              <Label className="text-xs font-semibold">
                {isAr ? 'الرقم القومي (14 رقم) *' : 'National ID (14 digits) *'}
              </Label>
              <Input
                value={nationalId}
                onChange={(e) => setNationalId(e.target.value.replace(/\D/g, '').slice(0, 14))}
                placeholder="29100000000000"
                dir="ltr"
                className="font-mono text-xs rounded-xl"
                required
              />
              <span className="text-[10px] text-muted-foreground block">
                {isAr ? 'الرقم القومي للتحقق من الهوية' : 'Identity verification'}
              </span>
            </div>

            {/* Ticket Number (Optional) */}
            <div className="space-y-1.5 text-start">
              <Label className="text-xs font-semibold">
                {isAr ? 'رقم التذكرة (اختياري)' : 'Ticket Number (Optional)'}
              </Label>
              <Input
                value={ticketNumber}
                onChange={(e) => setTicketNumber(e.target.value.toUpperCase())}
                placeholder="TKT-20261022-XXXX"
                dir="ltr"
                className="font-mono text-xs uppercase rounded-xl"
              />
              <span className="text-[10px] text-muted-foreground block">
                {isAr ? 'اتركه فارغاً لعرض كل تذاكرك' : 'Leave empty to view all tickets'}
              </span>
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2 pt-2">
            {onSwitchToNew && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onSwitchToNew}
                className="text-xs text-muted-foreground hover:text-foreground cursor-pointer self-start sm:self-auto rounded-xl"
              >
                <ArrowRight className="h-3.5 w-3.5 rtl:rotate-0 rotate-180" />
                <span>{isAr ? 'تقديم شكوى جديدة بدلاً من ذلك' : 'Submit a new complaint instead'}</span>
              </Button>
            )}

            <Button
              type="submit"
              disabled={isSearching || !studentCode.trim() || nationalId.trim().length !== 14}
              size="sm"
              className="gap-2 rounded-xl text-xs cursor-pointer ms-auto"
            >
              {isSearching ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Search className="h-3.5 w-3.5" />
              )}
              <span>{isAr ? 'استعلام عن التذاكر' : 'Search Tickets'}</span>
            </Button>
          </div>
        </form>
      </Card>

      {/* Error state */}
      {searchError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-200 flex items-start gap-3">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
          <div>
            <p className="font-bold">{isAr ? 'لم تنجح عملية الاستعلام' : 'Inquiry Failed'}</p>
            <p className="mt-1 leading-relaxed">{searchError}</p>
          </div>
        </div>
      )}

      {/* Multiple Tickets Selector (if student has more than 1 ticket) */}
      {allTickets.length > 1 && (
        <div className="rounded-xl border border-border/70 bg-card/70 p-3.5 space-y-2 text-start">
          <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
            <Layers className="h-4 w-4 text-primary" />
            <span>
              {isAr
                ? `تذاكرك المسجلة (${allTickets.length} تذاكر): اضغط على أي تذكرة للمعاينة`
                : `Your recorded tickets (${allTickets.length}): click any ticket to view`}
            </span>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {allTickets.map((t) => {
              const isSelected = ticket?.ticketNumber === t.ticketNumber;
              return (
                <button
                  key={t._id}
                  type="button"
                  onClick={() => handleSelectAnotherTicket(t.ticketNumber)}
                  className={cn(
                    'flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer',
                    isSelected
                      ? 'border-primary bg-primary/20 text-foreground ring-1 ring-primary'
                      : 'border-border/60 bg-surface/50 text-muted-foreground hover:bg-surface hover:text-foreground',
                  )}
                >
                  <span className="font-mono text-[11px] font-bold">{t.ticketNumber}</span>
                  <span
                    className={cn(
                      'h-1.5 w-1.5 rounded-full',
                      t.status === 'resolved'
                        ? 'bg-emerald-400'
                        : t.status === 'in_progress' || t.status === 'in_review'
                          ? 'bg-sky-400'
                          : 'bg-amber-400',
                    )}
                  />
                  <span className="truncate max-w-[140px] text-[11px]">{t.title}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Ticket Details View */}
      {ticket && (
        <div className="space-y-4 animate-in fade-in duration-200 text-start">
          {/* Header Card */}
          <Card className="rounded-xl border border-border/70 bg-card/90 p-5 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 pb-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xl font-bold text-foreground" dir="ltr">
                    {ticket.ticketNumber}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={copyTicket}
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground cursor-pointer rounded-xl"
                    title={isAr ? 'نسخ رقم التذكرة' : 'Copy ticket number'}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <h3 className="text-sm font-bold text-foreground">{ticket.title}</h3>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-squircle border px-3 py-1 text-xs font-bold',
                    getStatusBadgeStyle(ticket.status),
                  )}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  <span>
                    {isAr
                      ? statusLabelsAr[ticket.status] || ticket.status
                      : statusLabelsEn[ticket.status] || ticket.status}
                  </span>
                </span>

                <Badge variant="outline" className="rounded-squircle text-xs">
                  {isAr
                    ? priorityLabelsAr[ticket.priority] || ticket.priority
                    : priorityLabelsEn[ticket.priority] || ticket.priority}
                </Badge>
              </div>
            </div>

            {/* Meta Chips Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl border border-white/5 bg-secondary/30 p-2.5">
                <span className="text-[10px] text-muted-foreground block">
                  {isAr ? 'القسم المختص' : 'Department'}
                </span>
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5 mt-0.5">
                  <Building2 className="h-3.5 w-3.5 text-teal-400 shrink-0" />
                  <span className="truncate">
                    {isAr
                      ? departmentLabelsAr[ticket.department] || ticket.department
                      : departmentLabelsEn[ticket.department] || ticket.department}
                  </span>
                </span>
              </div>

              <div className="rounded-xl border border-white/5 bg-secondary/30 p-2.5">
                <span className="text-[10px] text-muted-foreground block">
                  {isAr ? 'المسؤول بالمعهد' : 'Assigned Staff'}
                </span>
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5 mt-0.5">
                  <User className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="truncate">
                    {ticket.assignedStaffName ||
                      (ticket.assignedGroup ? ticket.assignedGroup : '') ||
                      (isAr ? 'فريق الدعم المختص' : 'Support Team')}
                  </span>
                </span>
              </div>

              <div className="rounded-xl border border-white/5 bg-secondary/30 p-2.5">
                <span className="text-[10px] text-muted-foreground block">
                  {isAr ? 'تاريخ التقديم' : 'Submitted Date'}
                </span>
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5 mt-0.5">
                  <Clock className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  <span className="truncate">{formatDate(ticket.createdAt)}</span>
                </span>
              </div>

              <div className="rounded-xl border border-white/5 bg-secondary/30 p-2.5">
                <span className="text-[10px] text-muted-foreground block">
                  {isAr ? 'آخر تحديث' : 'Last Updated'}
                </span>
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5 mt-0.5">
                  <RefreshCw className="h-3.5 w-3.5 text-sky-400 shrink-0" />
                  <span className="truncate">{formatDate(ticket.updatedAt)}</span>
                </span>
              </div>
            </div>
          </Card>

          {/* Description Card */}
          <Card className="rounded-xl border border-border/70 bg-card/90 p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
              <FileText className="h-4 w-4 text-primary" />
              <span>{isAr ? 'تفاصيل ونص البلاغ المقدم' : 'Issue Description'}</span>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground bg-surface/40 p-3.5 rounded-xl border border-white/5">
              {ticket.description}
            </p>

            {ticket.screenshotUrl && (
              <div className="pt-2">
                <span className="text-xs font-semibold text-muted-foreground block mb-2">
                  {isAr ? 'الصورة المرفقة:' : 'Attached Screenshot:'}
                </span>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setPreviewImageUrl(ticket.screenshotUrl ?? null)}
                  className="group relative cursor-pointer overflow-hidden rounded-xl border border-border/60 bg-black/20 p-2 transition-all hover:border-primary/50 max-w-xs"
                >
                  <NextImage unoptimized width={1200} height={800}
                    src={ticket.screenshotUrl}
                    alt="Complaint Screenshot"
                    className="max-h-48 w-full rounded-lg object-contain"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100 backdrop-blur-[2px] rounded-xl">
                    <span className="flex items-center gap-1.5 rounded-squircle bg-black/80 px-3 py-1 text-xs font-bold text-white shadow-lg border border-white/10">
                      <ZoomIn className="h-3.5 w-3.5 text-teal-400" />
                      <span>{isAr ? 'تكبير' : 'Zoom'}</span>
                    </span>
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* Discussion & Replies Timeline */}
          <Card className="rounded-xl border border-border/70 bg-card/90 p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2 border-b border-border/50 pb-3">
              <MessageSquare className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">
                {isAr ? 'المحادثة والردود مع إدارة المعهد' : 'Replies & Discussion'}
              </h3>
              <Badge variant="outline" className="rounded-full text-[10px] ms-auto">
                {ticket.replies.length} {isAr ? 'ردود' : 'replies'}
              </Badge>
            </div>

            <div className="max-h-80 space-y-3 overflow-y-auto rounded-xl border border-border/60 bg-background/40 p-3">
              {ticket.replies.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground space-y-1">
                  <p>{isAr ? 'لا توجد ردود مسجلة بعد.' : 'No replies yet.'}</p>
                  <p className="text-[11px] text-muted-foreground/80">
                    {isAr
                      ? 'سيقوم فريق المعهد المختص بمراجعة بلاغك والرد عليك هنا قريباً.'
                      : 'The support team will review your ticket and reply here shortly.'}
                  </p>
                </div>
              ) : (
                ticket.replies.map((reply, idx) => {
                  const isStaff = reply.senderRole !== 'student';
                  return (
                    <div
                      key={`${reply.createdAt}-${idx}`}
                      className={cn(
                        'max-w-[88%] rounded-xl border p-3.5 space-y-1',
                        isStaff
                          ? 'me-auto border-teal-500/30 bg-teal-500/10'
                          : 'ms-auto border-border bg-surface/70',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2 border-b border-white/5 pb-1">
                        <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                          {isStaff && <ShieldCheck className="h-3.5 w-3.5 text-teal-400" />}
                          <span>{reply.senderName}</span>
                          {isStaff && (
                            <span className="text-[10px] text-teal-400 font-normal">
                              ({isAr ? 'إدارة المعهد' : 'Administration'})
                            </span>
                          )}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {formatDate(reply.createdAt)}
                        </span>
                      </div>
                      <p className="text-xs leading-relaxed text-foreground whitespace-pre-wrap pt-1">
                        {reply.message}
                      </p>
                    </div>
                  );
                })
              )}
            </div>

            {/* Reply Input Form (if ticket not closed) */}
            {ticket.status !== 'closed' ? (
              <form onSubmit={handleSendReply} className="space-y-2 pt-2 border-t border-border/50">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold">
                    {isAr ? 'إضافة رد أو استفسار توضيحي:' : 'Add a reply or follow-up message:'}
                  </Label>
                  <span
                    className={cn(
                      'text-[10px] font-mono',
                      replyMessage.length > 480
                        ? 'text-amber-400 font-bold'
                        : 'text-muted-foreground',
                    )}
                  >
                    {replyMessage.length}/500
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Textarea
                    value={replyMessage}
                    onChange={(e) => setReplyMessage(e.target.value.slice(0, 500))}
                    maxLength={500}
                    placeholder={
                      isAr
                        ? 'اكتب رسالتك أو استفسارك لإدارة المعهد (باللغة العربية أو الإنجليزية وبحد أقصى 500 حرف)...'
                        : 'Write your follow-up message (up to 500 characters)...'
                    }
                    rows={3}
                    className="text-xs rounded-xl border border-border/70 bg-background/60 p-3 leading-relaxed resize-y"
                    disabled={isSendingReply}
                  />
                  <Button
                    type="submit"
                    disabled={isSendingReply || !replyMessage.trim() || replyMessage.trim().length > 500}
                    className="self-end sm:self-stretch gap-1.5 rounded-xl text-xs px-5 cursor-pointer h-10 sm:h-auto"
                  >
                    {isSendingReply ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    <span>{isAr ? 'إرسال' : 'Send'}</span>
                  </Button>
                </div>
                <span className="text-[10px] text-muted-foreground block">
                  {isAr
                    ? 'النصوص الآمنة فقط مسموحة (حروف وأرقام وعلامات الترقيم). يمنع استخدام الأكواد والروابط الخارجية.'
                    : 'Safe text only. External links and code tags are strictly disallowed.'}
                </span>
              </form>
            ) : (
              <div className="rounded-xl border border-white/10 bg-secondary/30 p-3 text-center text-xs text-muted-foreground">
                {isAr
                  ? 'تم إغلاق هذه التذكرة. إذا كان لديك استفسار آخر يرجى تقديم شكوى جديدة.'
                  : 'This ticket is closed. For new inquiries, please submit a new complaint.'}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Lightbox for preview */}
      <ImageLightbox
        src={previewImageUrl}
        isOpen={Boolean(previewImageUrl)}
        onClose={() => setPreviewImageUrl(null)}
        title={ticket ? `#${ticket.ticketNumber} - ${ticket.title}` : undefined}
      />
    </div>
  );
}
