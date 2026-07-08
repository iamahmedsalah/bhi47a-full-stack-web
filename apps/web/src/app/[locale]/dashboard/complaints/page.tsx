'use client';

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import api, { getApiErrorMessage } from '@/lib/api';
import {
  MessageCircle,
  Plus,
  X,
  Send,
  Loader2,
  MailWarning,
  Search,
  Upload,
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';


interface Reply {
  senderId: string;
  senderName: string;
  senderRole: 'admin' | 'staff' | 'student';
  message: string;
  createdAt: string;
}

interface Complaint {
  _id: string;
  ticketNumber: string;
  type: 'complaint' | 'technical_issue' | 'academic' | 'financial' | 'facility' | 'other';
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in_review' | 'in_progress' | 'resolved' | 'closed';
  assignedStaffName?: string;
  assignedGroup?: string;
  replies: Reply[];
  createdAt: string;
}

type ComplaintType = 'complaint' | 'technical_issue' | 'academic' | 'financial' | 'facility' | 'other';
type ComplaintDepartment = 'student_affairs' | 'technical_support' | 'finance' | 'control' | 'academic_advising';

const TITLE_MIN_LENGTH = 3;
const TITLE_MAX_LENGTH = 120;
const DESCRIPTION_MIN_LENGTH = 10;
const DESCRIPTION_MAX_LENGTH = 1500;
const REPLY_MIN_LENGTH = 2;
const REPLY_MAX_LENGTH = 1000;

export default function StudentComplaintsPage() {
  const t = useTranslations('complaints');
  const tCommon = useTranslations('common');

  // Modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isReplyOpen, setIsReplyOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Complaint | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Form states
  const [type, setType] = useState<Complaint['type']>('complaint');
  const [department, setDepartment] = useState<ComplaintDepartment>('student_affairs');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [replyMsg, setReplyMsg] = useState('');
  const [screenshotName, setScreenshotName] = useState('');
  const [screenshotBase64, setScreenshotBase64] = useState<string | undefined>(undefined);

  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const isEnglish = tCommon('search') === 'Search...';

  const canSubmitComplaint =
    title.trim().length >= TITLE_MIN_LENGTH &&
    description.trim().length >= DESCRIPTION_MIN_LENGTH &&
    !formLoading;
  const canSendReply =
    replyMsg.trim().length >= REPLY_MIN_LENGTH &&
    replyMsg.trim().length <= REPLY_MAX_LENGTH &&
    !formLoading;

  const ticketsQuery = useQuery({
    queryKey: ['student-complaints'],
    queryFn: async () => {
      const res = await api.get<Complaint[]>('/students/complaints');
      return res.data;
    },
  });

  const tickets = useMemo(() => ticketsQuery.data || [], [ticketsQuery.data]);
  const filteredTickets = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return tickets;

    return tickets.filter((ticket) =>
      [
        ticket.ticketNumber,
        ticket.title,
        ticket.description,
        ticket.status,
        ticket.type,
      ]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(query)),
    );
  }, [searchQuery, tickets]);

  const openAddModal = () => {
    setType('complaint');
    setDepartment('student_affairs');
    setTitle('');
    setDescription('');
    setScreenshotName('');
    setScreenshotBase64(undefined);
    setFormError('');
    setIsAddOpen(true);
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const cleanTitle = title.trim();
    const cleanDescription = description.trim();

    if (cleanTitle.length < TITLE_MIN_LENGTH || cleanDescription.length < DESCRIPTION_MIN_LENGTH) {
      setFormError(
        isEnglish
          ? 'Please enter a subject and at least 10 characters of details.'
          : 'يرجى إدخال موضوع وتفاصيل لا تقل عن 10 أحرف.',
      );
      return;
    }

    setFormLoading(true);

    try {
      await api.post('/students/complaints', {
        type,
        department,
        title: cleanTitle,
        description: cleanDescription,
        screenshotUrl: screenshotBase64,
      });
      setIsAddOpen(false);
      setScreenshotName('');
      setScreenshotBase64(undefined);
      toast.success(isEnglish ? 'Complaint submitted successfully' : 'تم إرسال الشكوى بنجاح');
      void ticketsQuery.refetch();
    } catch (err: unknown) {
      setFormError(getApiErrorMessage(err, 'فشلت إضافة الشكوى'));
    } finally {
      setFormLoading(false);
    }
  };

  const openReplyModal = (ticket: Complaint) => {
    setSelectedTicket(ticket);
    setReplyMsg('');
    setFormError('');
    setIsReplyOpen(true);
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanReply = replyMsg.trim();
    if (!selectedTicket || cleanReply.length < REPLY_MIN_LENGTH) return;
    setFormLoading(true);
    setFormError('');

    try {
      const res = await api.post<Complaint>(`/students/complaints/${selectedTicket._id}/reply`, {
        message: cleanReply,
      });
      setSelectedTicket(res.data);
      setReplyMsg('');
      toast.success(isEnglish ? 'Reply sent' : 'تم إرسال الرد');
      void ticketsQuery.refetch();
    } catch (err: unknown) {
      setFormError(getApiErrorMessage(err, 'Error occurred'));
    } finally {
      setFormLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">{t('title')}</h2>
          <p className="text-muted text-sm mt-1">
            {tCommon('search') === 'Search...'
              ? 'Submit issues, reports, or suggestions'
              : 'قم بتقديم الاقتراحات، الشكاوى والأعطال ومتابعة تذاكرك الحالية'}
          </p>
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white font-semibold transition-all duration-300 shadow-lg shadow-primary/20 active:scale-[0.98] shrink-0 text-sm"
        >
          <Plus className="w-5 h-5" />
          {tCommon('search') === 'Search...' ? 'New Complaint' : 'تقديم شكوى جديدة'}
        </button>
      </div>

      <div className="glass rounded-2xl border border-border p-4">
        <label className="mb-2 block text-xs font-semibold text-muted">
          {tCommon('search') === 'Search...' ? 'Search your tickets' : 'الاستعلام عن تذكرة'}
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={
              tCommon('search') === 'Search...'
                ? 'Search by ticket number, subject, status, or type'
                : 'ابحث برقم التذكرة أو الموضوع أو الحالة أو النوع'
            }
            className="w-full rounded-xl border border-input-border bg-input px-10 py-3 text-sm text-foreground outline-none transition-all focus:border-input-focus"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute end-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted hover:bg-surface hover:text-foreground"
              aria-label={tCommon('search') === 'Search...' ? 'Clear search' : 'مسح البحث'}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {tCommon('search') === 'Search...'
            ? 'Only tickets from your signed-in account are shown here.'
            : 'يتم عرض تذاكر حسابك المسجل فقط للحفاظ على خصوصية البيانات.'}
        </p>
      </div>

      {/* Tickets List */}
      {ticketsQuery.isLoading ? (
        <div className="flex flex-col items-center justify-center p-16 space-y-4">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
          <p className="text-muted text-sm">{tCommon('loading')}</p>
        </div>
      ) : tickets.length === 0 ? (
        <div className="glass rounded-2xl border border-border text-center p-16 text-muted-foreground">
          {tCommon('search') === 'Search...' ? 'No complaints registered yet.' : 'لم تقم بتقديم أي شكاوى بعد.'}
        </div>
      ) : filteredTickets.length === 0 ? (
        <div className="glass rounded-2xl border border-border text-center p-16 text-muted-foreground">
          {tCommon('search') === 'Search...' ? 'No tickets match your search.' : 'لا توجد تذاكر مطابقة لبحثك.'}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredTickets.map((tkt) => (
            <div
              key={tkt._id}
              className="glass rounded-2xl border border-border p-5 hover:border-primary/30 transition-all duration-300 flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-primary font-mono">{tkt.ticketNumber}</span>
                  <span className="text-muted text-xs">•</span>
                  <span className="text-muted-foreground text-xs">{t(`type_${tkt.type}`)}</span>
                  <span className="text-muted text-xs">•</span>
                  <span className="text-muted-foreground text-xs">
                    {new Date(tkt.createdAt).toLocaleDateString('ar-EG')}
                  </span>
                </div>
                <h3 className="font-bold text-foreground text-base leading-snug">{tkt.title}</h3>
                <p className="text-muted text-sm line-clamp-2">{tkt.description}</p>
              </div>

              <div className="flex items-center justify-between md:justify-end gap-3 pt-3 md:pt-0 border-t border-border/40 md:border-none">
                <span
                  className={`badge text-xs ${
                    tkt.status === 'open'
                      ? 'badge-danger'
                      : tkt.status === 'in_review'
                        ? 'badge-info'
                        : tkt.status === 'in_progress'
                          ? 'badge-warning'
                          : tkt.status === 'resolved'
                            ? 'badge-success'
                            : 'badge-muted'
                  }`}
                >
                  {t(`status_${tkt.status}`)}
                </span>
                {(tkt.assignedStaffName || tkt.assignedGroup) && (
                  <span className="text-xs text-muted-foreground">
                    {tkt.assignedStaffName || tkt.assignedGroup}
                  </span>
                )}

                <button
                  onClick={() => openReplyModal(tkt)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-surface hover:bg-primary/20 text-muted hover:text-primary transition-all text-xs font-bold"
                >
                  <MessageCircle className="w-4 h-4" />
                  {tCommon('search') === 'Search...' ? 'Open Chat' : 'فتح المحادثة'}
                  {tkt.replies.length > 0 && (
                    <span className="w-5 h-5 rounded-full bg-primary text-white flex items-center justify-center text-[10px] font-mono shrink-0">
                      {tkt.replies.length}
                    </span>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Complaint Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsAddOpen(false)} />
          <div className="relative w-full max-w-md glass rounded-2xl border border-border p-6 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between border-b border-border pb-4 mb-4">
              <h3 className="text-lg font-bold text-foreground">
                {tCommon('search') === 'Search...' ? 'Submit Complaint' : 'تقديم شكوى أو عطل'}
              </h3>
              <button onClick={() => setIsAddOpen(false)} className="text-muted hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="bg-danger/10 border border-danger/30 text-danger rounded-xl p-4 flex gap-2 text-xs mb-4 items-start">
                <MailWarning className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-5">{formError}</span>
              </div>
            )}

            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div className="space-y-1 text-start">
                <label className="text-xs font-semibold text-muted">{t('type')} *</label>
                <Select
                  value={type}
                  onValueChange={(val) => setType(val as Complaint['type'])}
                >
                  <SelectTrigger className="w-full border-border bg-surface/50 text-sm rounded-xl cursor-pointer">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-border bg-card">
                    <SelectItem value="complaint" className="cursor-pointer">{t('type_complaint') || 'شكوى'}</SelectItem>
                    <SelectItem value="technical_issue" className="cursor-pointer">{t('type_technical_issue') || 'عطل فني'}</SelectItem>
                    <SelectItem value="academic" className="cursor-pointer">أكاديمية</SelectItem>
                    <SelectItem value="financial" className="cursor-pointer">مالية</SelectItem>
                    <SelectItem value="facility" className="cursor-pointer">خدمات ومرافق</SelectItem>
                    <SelectItem value="other" className="cursor-pointer">{t('type_other') || 'أخرى'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1 text-start">
                <label className="text-xs font-semibold text-muted">القسم الموجه إليه *</label>
                <Select
                  value={department}
                  onValueChange={(val) => setDepartment(val as ComplaintDepartment)}
                >
                  <SelectTrigger className="w-full border-border bg-surface/50 text-sm rounded-xl cursor-pointer">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-border bg-card">
                    <SelectItem value="student_affairs" className="cursor-pointer">شؤون الطلاب</SelectItem>
                    <SelectItem value="technical_support" className="cursor-pointer">الدعم الفني</SelectItem>
                    <SelectItem value="finance" className="cursor-pointer">المالية</SelectItem>
                    <SelectItem value="control" className="cursor-pointer">الكنترول</SelectItem>
                    <SelectItem value="academic_advising" className="cursor-pointer">الإرشاد الأكاديمي</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted">الموضوع *</label>
                <input
                  type="text"
                  required
                  minLength={TITLE_MIN_LENGTH}
                  maxLength={TITLE_MAX_LENGTH}
                  value={title}
                  onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX_LENGTH))}
                  placeholder="عنوان مختصر للشكوى..."
                  className="w-full px-3 py-2.5 rounded-xl bg-input border border-input-border text-foreground outline-none focus:border-input-focus text-sm"
                />
              </div>

              <div className="space-y-1 text-start">
                <label className="text-xs font-semibold text-muted">{isEnglish ? 'Attach Screenshot' : 'إرفاق صورة'}</label>
                <label
                  htmlFor="screenshot-dash"
                  className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-squircle border border-dashed border-border bg-background px-3 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                >
                  <Upload className="h-4 w-4" />
                  <span className="truncate">
                    {screenshotName || (isEnglish ? 'Choose image' : 'اختر صورة')}
                  </span>
                </label>
                <input
                  id="screenshot-dash"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only cursor-pointer"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      if (file.size > 3 * 1024 * 1024) {
                        toast.error(isEnglish ? 'Image size must not exceed 3MB' : 'حجم الصورة يجب أن لا يتجاوز 3 ميجابايت');
                        event.target.value = '';
                        setScreenshotName('');
                        setScreenshotBase64(undefined);
                        return;
                      }
                      setScreenshotName(file.name);
                      const reader = new FileReader();
                      reader.onloadend = () => {
                        setScreenshotBase64(reader.result as string);
                      };
                      reader.readAsDataURL(file);
                    } else {
                      setScreenshotName('');
                      setScreenshotBase64(undefined);
                    }
                  }}
                />
                {screenshotBase64 && (
                  <div className="relative mt-2 overflow-hidden rounded-xl border border-border/60 bg-black/20 p-2">
                    <img
                      src={screenshotBase64}
                      alt={isEnglish ? 'Selected screenshot preview' : 'معاينة الصورة المرفقة'}
                      className="max-h-40 w-full object-contain rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setScreenshotName('');
                        setScreenshotBase64(undefined);
                      }}
                      className="absolute top-3 end-3 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-red-500 transition-colors cursor-pointer"
                      aria-label={isEnglish ? 'Remove image' : 'إزالة الصورة'}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                {screenshotName && !screenshotBase64 && (
                  <div className="mt-2 flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-black/10 p-3 text-xs text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    {isEnglish ? 'Processing image...' : 'جاري تجهيز الصورة...'}
                  </div>
                )}
              </div>

              <div className="space-y-1 text-start">
                <label className="text-xs font-semibold text-muted">التفاصيل والشرح *</label>
                <textarea
                  required
                  minLength={DESCRIPTION_MIN_LENGTH}
                  maxLength={DESCRIPTION_MAX_LENGTH}
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, DESCRIPTION_MAX_LENGTH))}
                  placeholder="اكتب شرحاً تفصيلياً للمشكلة هنا..."
                  className="w-full px-3 py-2.5 rounded-xl bg-input border border-input-border text-foreground outline-none focus:border-input-focus text-sm leading-relaxed"
                />
                <p className="text-end text-[11px] text-muted-foreground" dir="ltr">
                  {description.length}/{DESCRIPTION_MAX_LENGTH}
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border mt-6">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-border text-muted hover:text-foreground text-sm font-medium transition-colors"
                >
                  {tCommon('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={!canSubmitComplaint}
                  className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-sm font-semibold transition-colors flex items-center gap-2"
                >
                  {formLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {tCommon('confirm')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reply Chat Modal */}
      {isReplyOpen && selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsReplyOpen(false)} />
          <div className="relative w-full max-w-xl glass rounded-2xl border border-border p-6 shadow-2xl animate-fade-in flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between border-b border-border pb-4 mb-4">
              <div>
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <span>المحادثة والردود</span>
                  <span className="text-xs text-primary font-mono">({selectedTicket.ticketNumber})</span>
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">{selectedTicket.title}</p>
              </div>
              <button onClick={() => setIsReplyOpen(false)} className="text-muted hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Chat list */}
            <div className="flex-1 overflow-y-auto space-y-4 p-2 bg-black/10 rounded-xl border border-border/40 min-h-[200px] mb-4">
              {/* Main Ticket Desc */}
              <div className="p-4 border border-border/50 bg-surface/20 rounded-xl space-y-1">
                <div className="flex items-center justify-between text-xs text-muted">
                  <span className="font-semibold">تاريخ التقديم</span>
                  <span>{new Date(selectedTicket.createdAt).toLocaleString('ar-EG')}</span>
                </div>
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap mt-1">
                  {selectedTicket.description}
                </p>
              </div>

              {/* Replies */}
              {selectedTicket.replies.length === 0 ? (
                <div className="text-center p-8 text-muted-foreground text-xs">
                  {t('noReplies')}
                </div>
              ) : (
                <div className="space-y-4">
                  {selectedTicket.replies.map((reply, idx) => {
                    const isMyReply = reply.senderRole === 'student';
                    return (
                      <div
                        key={idx}
                        className={`flex flex-col max-w-[85%] space-y-1 ${
                          isMyReply ? 'ms-auto items-end' : 'me-auto items-start'
                        }`}
                      >
                        <div
                          className={`p-3 rounded-2xl text-sm leading-relaxed ${
                            isMyReply
                              ? 'bg-primary text-white rounded-te-none'
                              : 'bg-surface border border-border text-foreground rounded-ts-none'
                          }`}
                        >
                          <p className="whitespace-pre-wrap">{reply.message}</p>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground px-1">
                          <span className="font-semibold">
                            {isMyReply ? 'أنت' : `${reply.senderName} - فريق الإدارة`}
                          </span>
                          <span>•</span>
                          <span>{new Date(reply.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {formError && (
              <div className="bg-danger/10 border border-danger/30 text-danger rounded-xl px-4 py-2 text-xs mb-2">
                {formError}
              </div>
            )}

            {/* Send Message Form */}
            {selectedTicket.status === 'closed' ? (
              <div className="bg-muted/10 border border-border text-muted-foreground rounded-xl p-3.5 text-center text-xs">
                تم إغلاق هذه الشكوى ولا يمكن إضافة ردود إضافية.
              </div>
            ) : (
              <form onSubmit={handleSendReply} className="flex gap-2">
                <input
                  type="text"
                  required
                  minLength={REPLY_MIN_LENGTH}
                  maxLength={REPLY_MAX_LENGTH}
                  value={replyMsg}
                  onChange={(e) => setReplyMsg(e.target.value.slice(0, REPLY_MAX_LENGTH))}
                  placeholder="اكتب رسالتك أو استفسارك هنا..."
                  className="flex-1 px-4 py-3 rounded-xl bg-input border border-input-border text-foreground outline-none focus:border-input-focus transition-all text-sm"
                />
                <button
                  type="submit"
                  disabled={!canSendReply}
                  className="px-5 py-3 rounded-xl bg-primary hover:bg-primary-hover text-white transition-all shadow-lg shadow-primary/25 disabled:opacity-50 flex items-center justify-center gap-2 shrink-0 text-sm font-semibold"
                >
                  {formLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      {t('sendReply')}
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
