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
  AlertTriangle,
  Search,
  Upload,
  Sparkles,
  Inbox,
  UserCheck,
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { motion, AnimatePresence } from 'framer-motion';

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
        ticket.status,
        ticket.type,
      ].some((val) => val?.toLowerCase().includes(query))
    );
  }, [tickets, searchQuery]);

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
    if (!canSubmitComplaint) return;
    setFormLoading(true);
    setFormError('');

    try {
      await api.post('/students/complaints', {
        type,
        department,
        title: title.trim(),
        description: description.trim(),
        screenshotUrl: screenshotBase64,
      });
      toast.success(isEnglish ? 'Complaint submitted successfully' : 'تم تقديم الشكوى بنجاح');
      setIsAddOpen(false);
      void ticketsQuery.refetch();
    } catch (err: unknown) {
      setFormError(getApiErrorMessage(err, isEnglish ? 'Could not submit complaint' : 'تعذر تقديم الشكوى'));
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
    <div className="max-w-4xl mx-auto space-y-6" dir={isEnglish ? 'ltr' : 'rtl'}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <MessageCircle className="h-6 w-6 text-primary" />
            <span>{t('title')}</span>
          </h2>
          <p className="text-muted-foreground text-sm">
            {isEnglish
              ? 'Submit issues, reports, or suggestions'
              : 'قم بتقديم الاقتراحات، الشكاوى والأعطال ومتابعة تذاكرك الحالية'}
          </p>
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center justify-center gap-2 px-5 py-3 rounded-squircle bg-primary hover:bg-primary/85 text-primary-foreground font-semibold transition-all duration-300 shadow-md cursor-pointer shrink-0 text-sm"
        >
          <Plus className="w-5 h-5" />
          {isEnglish ? 'New Complaint' : 'تقديم شكوى جديدة'}
        </button>
      </div>

      {/* Search Widget */}
      <Card className="p-4 bg-card/45 backdrop-blur-sm border-border/70 shadow-[var(--shadow-glow)] hover:border-primary/30 transition-all duration-300">
        <label className="mb-2 block text-xs font-bold text-foreground">
          {isEnglish ? 'Search your tickets' : 'الاستعلام عن تذكرة'}
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={
              isEnglish
                ? 'Search by ticket number, subject, status, or type'
                : 'ابحث برقم التذكرة أو الموضوع أو الحالة أو النوع'
            }
            className="w-full rounded-squircle border border-border bg-secondary/50 px-10 py-3 text-sm text-foreground outline-none transition-all focus:border-primary/50"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute end-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </Card>

      {/* Tickets List */}
      {ticketsQuery.isLoading ? (
        <div className="flex flex-col items-center justify-center p-16 space-y-4">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
          <p className="text-muted-foreground text-sm">{tCommon('loading')}</p>
        </div>
      ) : tickets.length === 0 ? (
        <Card className="text-center p-16 bg-card/45 backdrop-blur-sm border-border/70 shadow-[var(--shadow-glow)] hover:border-primary/30 transition-all duration-300">
          <Inbox className="w-12 h-12 text-muted mx-auto mb-3" />
          <span className="text-muted-foreground text-sm">
            {isEnglish ? 'No complaints registered yet.' : 'لم تقم بتقديم أي شكاوى بعد.'}
          </span>
        </Card>
      ) : filteredTickets.length === 0 ? (
        <Card className="text-center p-16 bg-card/45 backdrop-blur-sm border-border/70 shadow-[var(--shadow-glow)] hover:border-primary/30 transition-all duration-300">
          <Search className="w-12 h-12 text-muted mx-auto mb-3" />
          <span className="text-muted-foreground text-sm">
            {isEnglish ? 'No tickets match your search.' : 'لا توجد تذاكر مطابقة لبحثك.'}
          </span>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredTickets.map((tkt, idx) => (
            <motion.div
              key={tkt._id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: idx * 0.04 }}
            >
              <Card className="p-5 bg-card/45 backdrop-blur-sm border-border/70 shadow-[var(--shadow-glow)] hover:border-primary/30 transition-all duration-300 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-primary font-mono">{tkt.ticketNumber}</span>
                    <span className="text-muted-foreground text-xs">•</span>
                    <span className="text-muted-foreground text-xs">{t(`type_${tkt.type}`)}</span>
                    <span className="text-muted-foreground text-xs">•</span>
                    <span className="text-muted-foreground text-xs font-mono">
                      {new Date(tkt.createdAt).toLocaleDateString(isEnglish ? 'en-US' : 'ar-EG')}
                    </span>
                  </div>
                  <h3 className="font-bold text-foreground text-base leading-snug">{tkt.title}</h3>
                  <p className="text-muted-foreground text-sm line-clamp-2 leading-relaxed">{tkt.description}</p>
                </div>

                <div className="flex flex-wrap items-center justify-between md:justify-end gap-3.5 pt-3 md:pt-0 border-t border-border/60 md:border-none">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border capitalize ${tkt.status === 'open'
                        ? 'bg-red-500/10 text-red-500 border-red-500/20'
                        : tkt.status === 'in_review'
                          ? 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                          : tkt.status === 'in_progress'
                            ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                            : tkt.status === 'resolved'
                              ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                              : 'bg-secondary text-muted-foreground border-border/80'
                      }`}
                  >
                    {t(`status_${tkt.status}`)}
                  </span>
                  {(tkt.assignedStaffName || tkt.assignedGroup) && (
                    <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                      <UserCheck className="w-3.5 h-3.5" />
                      {tkt.assignedStaffName || tkt.assignedGroup}
                    </span>
                  )}

                  <button
                    onClick={() => openReplyModal(tkt)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-squircle bg-secondary hover:bg-primary/10 text-foreground hover:text-primary transition-all text-xs font-bold cursor-pointer"
                  >
                    <MessageCircle className="w-4 h-4" />
                    {isEnglish ? 'Open Chat' : 'فتح المحادثة'}
                    {tkt.replies.length > 0 && (
                      <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-mono shrink-0">
                        {tkt.replies.length}
                      </span>
                    )}
                  </button>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Add Complaint Modal */}
      <AnimatePresence>
        {isAddOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsAddOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-card border border-border p-6 rounded-2xl shadow-2xl z-10 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-border pb-3">
                <h3 className="text-lg font-bold text-foreground flex items-center gap-1.5">
                  <Sparkles className="w-4.5 h-4.5 text-primary" />
                  {isEnglish ? 'Submit Complaint' : 'تقديم شكوى أو عطل'}
                </h3>
                <button onClick={() => setIsAddOpen(false)} className="text-muted-foreground hover:text-foreground cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {formError && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-500 rounded-squircle p-3 flex gap-2 text-xs items-start">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{formError}</span>
                </div>
              )}

              <form onSubmit={handleAddSubmit} className="space-y-4">
                <div className="space-y-1.5 text-start">
                  <label className="text-xs font-bold text-foreground">
                    {isEnglish ? 'Type of Issue *' : 'نوع البلاغ أو الشكوى *'}
                  </label>
                  <Select value={type} onValueChange={(val) => setType(val as Complaint['type'])}>
                    <SelectTrigger className="w-full border-border bg-secondary/50 text-sm rounded-squircle cursor-pointer">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-border bg-card">
                      <SelectItem value="complaint" className="cursor-pointer">
                        {isEnglish ? 'General Complaint' : 'شكوى عامة'}
                      </SelectItem>
                      <SelectItem value="technical_issue" className="cursor-pointer">
                        {isEnglish ? 'Technical Issue' : 'عطل فني'}
                      </SelectItem>
                      <SelectItem value="academic" className="cursor-pointer">
                        {isEnglish ? 'Academic Issue' : 'استفسار أو مشكلة أكاديمية'}
                      </SelectItem>
                      <SelectItem value="financial" className="cursor-pointer">
                        {isEnglish ? 'Financial Matter' : 'معاملة مالية'}
                      </SelectItem>
                      <SelectItem value="facility" className="cursor-pointer">
                        {isEnglish ? 'Facilities & Services' : 'خدمات ومرافق'}
                      </SelectItem>
                      <SelectItem value="other" className="cursor-pointer">
                        {isEnglish ? 'Other' : 'أخرى'}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5 text-start">
                  <label className="text-xs font-bold text-foreground">
                    {isEnglish ? 'Target Department *' : 'القسم الموجه إليه *'}
                  </label>
                  <Select value={department} onValueChange={(val) => setDepartment(val as ComplaintDepartment)}>
                    <SelectTrigger className="w-full border-border bg-secondary/50 text-sm rounded-squircle cursor-pointer">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-border bg-card">
                      <SelectItem value="student_affairs" className="cursor-pointer">
                        {isEnglish ? 'Student Affairs' : 'شؤون الطلاب'}
                      </SelectItem>
                      <SelectItem value="technical_support" className="cursor-pointer">
                        {isEnglish ? 'Technical Support & IT' : 'الدعم الفني وتكنولوجيا المعلومات'}
                      </SelectItem>
                      <SelectItem value="finance" className="cursor-pointer">
                        {isEnglish ? 'Finance & Tuition' : 'المالية والخزينة'}
                      </SelectItem>
                      <SelectItem value="control" className="cursor-pointer">
                        {isEnglish ? 'Exams Control' : 'الكنترول والامتحانات'}
                      </SelectItem>
                      <SelectItem value="academic_advising" className="cursor-pointer">
                        {isEnglish ? 'Academic Advising' : 'الإرشاد الأكاديمي'}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5 text-start">
                  <label className="text-xs font-bold text-foreground">
                    {isEnglish ? 'Subject *' : 'الموضوع *'}
                  </label>
                  <input
                    type="text"
                    required
                    minLength={TITLE_MIN_LENGTH}
                    maxLength={TITLE_MAX_LENGTH}
                    value={title}
                    onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX_LENGTH))}
                    placeholder={isEnglish ? 'Brief summary of the issue...' : 'عنوان مختصر للشكوى أو العطل...'}
                    className="w-full px-3.5 py-2.5 rounded-squircle bg-secondary/50 border border-border text-foreground outline-none focus:border-primary/50 text-sm"
                  />
                </div>

                <div className="space-y-1.5 text-start">
                  <label className="text-xs font-bold text-foreground">
                    {isEnglish ? 'Attach Screenshot (Optional)' : 'إرفاق صورة أو لقطة شاشة (اختياري)'}
                  </label>
                  <label
                    htmlFor="screenshot-dash"
                    className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-squircle border border-dashed border-border bg-secondary/30 px-3 text-sm text-muted-foreground transition-all hover:border-primary hover:text-foreground"
                  >
                    <Upload className="h-4 w-4" />
                    <span className="truncate">
                      {screenshotName || (isEnglish ? 'Choose image (PNG, JPG, WebP)' : 'اختر صورة (PNG, JPG, WebP)')}
                    </span>
                  </label>
                  <input
                    id="screenshot-dash"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
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
                    <div className="relative mt-2 overflow-hidden rounded-squircle border border-border/80 bg-secondary p-2">
                      <img
                        src={screenshotBase64}
                        alt="Screenshot preview"
                        className="max-h-40 w-full object-contain rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setScreenshotName('');
                          setScreenshotBase64(undefined);
                        }}
                        className="absolute top-3 end-3 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-red-500 transition-colors cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-1.5 text-start">
                  <label className="text-xs font-bold text-foreground">
                    {isEnglish ? 'Details & Explanation *' : 'التفاصيل والشرح *'}
                  </label>
                  <textarea
                    required
                    minLength={DESCRIPTION_MIN_LENGTH}
                    maxLength={DESCRIPTION_MAX_LENGTH}
                    rows={4}
                    value={description}
                    onChange={(e) => setDescription(e.target.value.slice(0, DESCRIPTION_MAX_LENGTH))}
                    placeholder={
                      isEnglish
                        ? 'Write a detailed explanation of the problem here...'
                        : 'اكتب شرحاً تفصيلياً للمشكلة هنا...'
                    }
                    className="w-full px-3.5 py-2.5 rounded-squircle bg-secondary/50 border border-border text-foreground outline-none focus:border-primary/50 text-sm leading-relaxed"
                  />
                  <p className="text-end text-[10px] text-muted-foreground font-mono">
                    {description.length}/{DESCRIPTION_MAX_LENGTH}
                  </p>
                </div>

                <div className="flex justify-end gap-2.5 pt-4 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setIsAddOpen(false)}
                    className="px-4 py-2.5 rounded-squircle border border-border text-muted-foreground hover:text-foreground hover:bg-secondary text-sm font-semibold transition-all cursor-pointer"
                  >
                    {isEnglish ? 'Cancel' : 'إلغاء'}
                  </button>
                  <button
                    type="submit"
                    disabled={!canSubmitComplaint}
                    className="px-5 py-2.5 rounded-squircle bg-primary hover:bg-primary/80 text-primary-foreground text-sm font-semibold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {formLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                    {isEnglish ? 'Submit Complaint' : 'تقديم الشكوى'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Reply Chat Modal */}
      <AnimatePresence>
        {isReplyOpen && selectedTicket && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsReplyOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              dir={isEnglish ? 'ltr' : 'rtl'}
              className="relative w-full max-w-xl bg-card border border-border/80 p-6 rounded-2xl shadow-2xl z-10 flex flex-col max-h-[85vh] space-y-4"
            >
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div>
                  <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                    <span>{isEnglish ? 'Chat & Replies' : 'المحادثة والردود'}</span>
                    <span className="text-xs text-primary font-mono">({selectedTicket.ticketNumber})</span>
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">{selectedTicket.title}</p>
                </div>
                <button onClick={() => setIsReplyOpen(false)} className="text-muted-foreground hover:text-foreground cursor-pointer p-1 rounded-lg hover:bg-secondary transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Chat list */}
              <div className="flex-1 overflow-y-auto space-y-4 p-3.5 bg-secondary/30 rounded-xl border border-border/70 min-h-[220px]">
                {/* Main Ticket Desc */}
                <div className="p-4 border border-border/70 bg-card rounded-xl space-y-1.5 shadow-xs">
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground font-bold">
                    <span>{isEnglish ? 'Submission Date' : 'تاريخ التقديم'}</span>
                    <span>{new Date(selectedTicket.createdAt).toLocaleString(isEnglish ? 'en-US' : 'ar-EG')}</span>
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
                          className={`flex flex-col max-w-[85%] space-y-1 ${isMyReply ? 'ms-auto items-end' : 'me-auto items-start'
                            }`}
                        >
                          <div
                            className={`p-3.5 rounded-2xl text-sm leading-relaxed ${isMyReply
                                ? 'bg-primary text-primary-foreground rounded-te-none'
                                : 'bg-card border border-border text-foreground rounded-ts-none shadow-xs'
                              }`}
                          >
                            <p className="whitespace-pre-wrap">{reply.message}</p>
                          </div>
                          <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground px-1 font-bold">
                            <span>
                              {isMyReply ? (isEnglish ? 'You' : 'أنت') : `${reply.senderName} - ${isEnglish ? 'Support Team' : 'فريق الإدارة'}`}
                            </span>
                            <span>•</span>
                            <span>{new Date(reply.createdAt).toLocaleTimeString(isEnglish ? 'en-US' : 'ar-EG', { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {formError && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl px-4 py-2 text-xs">
                  {formError}
                </div>
              )}

              {/* Send Message Form */}
              {selectedTicket.status === 'closed' ? (
                <div className="bg-secondary/60 border border-border text-muted-foreground rounded-xl p-3.5 text-center text-xs font-bold">
                  {isEnglish
                    ? 'This ticket is closed and cannot receive additional replies.'
                    : 'تم إغلاق هذه الشكوى ولا يمكن إضافة ردود إضافية.'}
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
                    placeholder={isEnglish ? 'Type your message or inquiry here...' : 'اكتب رسالتك أو استفسارك هنا...'}
                    className="flex-1 px-4 py-2.5 rounded-squircle bg-secondary/50 border border-border text-foreground outline-none focus:border-primary/50 transition-all text-sm"
                  />
                  <button
                    type="submit"
                    disabled={!canSendReply}
                    className="px-5 py-2.5 rounded-squircle bg-primary hover:bg-primary/80 text-primary-foreground transition-all shadow-md disabled:opacity-50 flex items-center justify-center gap-1.5 shrink-0 text-sm font-bold cursor-pointer"
                  >
                    {formLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        {t('sendReply')}
                      </>
                    )}
                  </button>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
