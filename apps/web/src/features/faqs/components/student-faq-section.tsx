'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { useQuery } from '@tanstack/react-query';
import {
  Award,
  BookOpen,
  Calendar,
  ChevronDown,
  ClipboardList,
  GraduationCap,
  HelpCircle,
  LayoutGrid,
  LifeBuoy,
  Mail,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Tag,
  X,
} from 'lucide-react';
import { apiGet } from '@/lib/api-client';
import type { PaginatedResponse } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/cn';
import {
  FAQ_TOPIC_PRESETS,
  formatTopicDisplay,
  type FaqEntry,
} from '../types';

interface StudentFaqSectionProps {
  ar: boolean;
  onOpenNewComplaint?: () => void;
  onSwitchToTickets?: () => void;
  ticketsCount?: number;
}

function getTopicIcon(topic: string) {
  const normalized = topic.trim().toLowerCase();
  if (normalized === 'الامتحانات' || normalized === 'exams') {
    return Calendar;
  }
  if (normalized === 'النتائج' || normalized === 'results') {
    return Award;
  }
  if (normalized === 'البريد الأكاديمي' || normalized === 'academic email') {
    return Mail;
  }
  if (normalized === 'الحضور' || normalized === 'attendance') {
    return ClipboardList;
  }
  if (normalized === 'الشكاوى' || normalized === 'complaints') {
    return MessageCircle;
  }
  if (normalized === 'الحساب والمقررات' || normalized === 'account & courses') {
    return GraduationCap;
  }
  return Tag;
}

export function StudentFaqSection({
  ar,
  onOpenNewComplaint,
  onSwitchToTickets,
  ticketsCount,
}: StudentFaqSectionProps) {
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedTopic, setSelectedTopic] = useState<string>('all');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 220);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const locale = ar ? 'ar' : 'en';

  // Fetch all published FAQs for the active locale (capped at 100) so topic counts & instant category switching feel snappy.
  const faqsQuery = useQuery({
    queryKey: ['student-faqs', locale],
    queryFn: ({ signal }) =>
      apiGet<PaginatedResponse<FaqEntry>>('/faqs', {
        params: { locale, page: 1, limit: 100 },
        signal,
      }),
    staleTime: 60 * 1000,
  });

  const allItems = useMemo(
    () => faqsQuery.data?.items ?? [],
    [faqsQuery.data?.items],
  );

  // Build ordered category filter chips: presets first + any extra custom topics from DB
  const topicChips = useMemo(() => {
    const presetTopics = FAQ_TOPIC_PRESETS.map((preset) =>
      ar ? preset.ar : preset.en,
    );
    const presetSet = new Set(presetTopics.map((t) => t.toLowerCase()));
    const extraTopics: string[] = [];
    const seenExtra = new Set<string>();

    for (const item of allItems) {
      for (const topic of item.topics ?? []) {
        const norm = topic.trim().toLowerCase();
        if (!norm || presetSet.has(norm) || seenExtra.has(norm)) continue;
        seenExtra.add(norm);
        extraTopics.push(topic.trim());
      }
    }

    const ordered = [...presetTopics, ...extraTopics];
    return ordered.map((topic) => {
      const norm = topic.toLowerCase();
      const count = allItems.filter((item) =>
        (item.topics ?? []).some((t) => t.trim().toLowerCase() === norm),
      ).length;
      return {
        value: norm,
        label: formatTopicDisplay(topic, ar),
        count,
        Icon: getTopicIcon(topic),
      };
    });
  }, [allItems, ar]);

  const filteredItems = useMemo(() => {
    const query = debouncedSearch.toLowerCase();
    return allItems.filter((item) => {
      if (selectedTopic !== 'all') {
        const matchesTopic = (item.topics ?? []).some(
          (t) => t.trim().toLowerCase() === selectedTopic,
        );
        if (!matchesTopic) return false;
      }
      if (!query) return true;
      const haystack = [
        item.question,
        item.answer,
        ...(item.topics ?? []),
        ...(item.keywords ?? []),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [allItems, selectedTopic, debouncedSearch]);

  const hasActiveFilter = selectedTopic !== 'all' || Boolean(debouncedSearch);

  return (
    <div className="space-y-5" dir={ar ? 'rtl' : 'ltr'}>
      {/* Search + Category Filter Card */}
      <Card className="p-4 sm:p-5 bg-card/50 backdrop-blur-sm border-border/70 shadow-(--shadow-glow) rounded-2xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-squircle border border-primary/25 bg-primary/10 text-primary">
              <BookOpen className="h-4.5 w-4.5" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-foreground">
                {ar ? 'ابحث في الأسئلة الشائعة' : 'Search Frequently Asked Questions'}
              </h3>
              <p className="text-xs text-muted-foreground">
                {ar
                  ? 'إجابات رسمية ومعتمدة حول الامتحانات، النتائج، البريد الأكاديمي، الحضور، والشكاوى'
                  : 'Approved institute answers for exams, results, academic email, attendance, and complaints'}
              </p>
            </div>
          </div>

          {!faqsQuery.isLoading && !faqsQuery.isError && (
            <span className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-squircle border border-border/70 bg-secondary/50 px-3 py-1 text-xs font-semibold text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              {ar
                ? `${filteredItems.length} من ${allItems.length} سؤال`
                : `${filteredItems.length} of ${allItems.length} questions`}
            </span>
          )}
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="pointer-events-none absolute inset-s-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            maxLength={120}
            aria-label={ar ? 'ابحث في الأسئلة وإجاباتها' : 'Search questions and answers'}
            placeholder={
              ar
                ? 'اكتب سؤالك أو كلمة مفتاحية مثل: جدول الامتحانات، النتيجة، البريد الأكاديمي...'
                : 'Type a question or keyword such as exams, grades, academic email...'
            }
            className="w-full rounded-squircle border border-border/80 bg-secondary/45 py-2.5 ps-10 pe-10 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-all focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => {
                setSearchInput('');
                setDebouncedSearch('');
              }}
              aria-label={ar ? 'مسح البحث' : 'Clear search'}
              className="absolute inset-e-2.5 top-1/2 -translate-y-1/2 rounded-squircle p-1 text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Category Filter Pills */}
        <div
          className="flex flex-wrap items-center gap-2"
          role="group"
          aria-label={ar ? 'تصفية حسب التصنيف' : 'Filter by category'}
        >
          <button
            type="button"
            onClick={() => setSelectedTopic('all')}
            aria-pressed={selectedTopic === 'all'}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-squircle border px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer',
              selectedTopic === 'all'
                ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                : 'border-border/70 bg-secondary/45 text-muted-foreground hover:border-primary/40 hover:text-foreground',
            )}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            <span>{ar ? 'الكل' : 'All'}</span>
            <span
              className={cn(
                'rounded-squircle px-1.5 py-0.5 text-[10px] font-bold',
                selectedTopic === 'all'
                  ? 'bg-primary-foreground/20 text-primary-foreground'
                  : 'bg-background/60 text-muted-foreground',
              )}
            >
              {allItems.length}
            </span>
          </button>

          {topicChips.map((chip) => {
            const isSelected = selectedTopic === chip.value;
            const ChipIcon = chip.Icon;
            return (
              <button
                key={chip.value}
                type="button"
                onClick={() =>
                  setSelectedTopic(isSelected ? 'all' : chip.value)
                }
                aria-pressed={isSelected}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-squircle border px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer',
                  isSelected
                    ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                    : 'border-border/70 bg-secondary/45 text-muted-foreground hover:border-primary/40 hover:text-foreground',
                )}
              >
                <ChipIcon className="h-3.5 w-3.5" />
                <span>{chip.label}</span>
                {chip.count > 0 && (
                  <span
                    className={cn(
                      'rounded-squircle px-1.5 py-0.5 text-[10px] font-bold',
                      isSelected
                        ? 'bg-primary-foreground/20 text-primary-foreground'
                        : 'bg-background/60 text-muted-foreground',
                    )}
                  >
                    {chip.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Loading State */}
      {faqsQuery.isLoading && (
        <div className="space-y-3" aria-busy="true">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="rounded-xl border border-border/60 bg-card/45 p-4 space-y-2.5"
            >
              <div className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-squircle" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error State */}
      {faqsQuery.isError && (
        <Card
          role="alert"
          className="rounded-2xl border-danger/30 bg-danger/5 p-6 text-center space-y-3"
        >
          <p className="text-sm font-medium text-foreground">
            {ar
              ? 'تعذر تحميل الأسئلة الشائعة حالياً. يرجى المحاولة مرة أخرى.'
              : 'Could not load frequently asked questions right now. Please try again.'}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void faqsQuery.refetch()}
            className="rounded-squircle gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {ar ? 'إعادة المحاولة' : 'Retry'}
          </Button>
        </Card>
      )}

      {/* Empty State */}
      {faqsQuery.isSuccess && filteredItems.length === 0 && (
        <Card className="rounded-2xl border-dashed border-border/80 bg-card/40 p-10 text-center space-y-3">
          <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-squircle border border-primary/25 bg-primary/10 text-primary">
            <HelpCircle className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-foreground">
              {hasActiveFilter
                ? ar
                  ? 'لم نجد أسئلة مطابقة للبحث أو التصنيف المختار'
                  : 'No questions match your current search or category'
                : ar
                  ? 'لا توجد أسئلة شائعة منشورة حالياً'
                  : 'No published FAQs available yet'}
            </h4>
            <p className="mx-auto max-w-md text-xs text-muted-foreground leading-relaxed">
              {hasActiveFilter
                ? ar
                  ? 'جرّب كلمات بحث مختلفة أو امسح الفلاتر، أو أرسل استفسارك مباشرة لفريق شؤون الطلاب.'
                  : 'Try different keywords or clear filters, or submit your question directly to Student Affairs.'
                : ar
                  ? 'يمكنك إرسال استفسارك أو شكواك مباشرة إلى شؤون الطلاب وسيتابع فريق الإدارة الرد عليك.'
                  : 'You can send your inquiry directly to Student Affairs and our team will respond.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            {hasActiveFilter && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedTopic('all');
                  setSearchInput('');
                  setDebouncedSearch('');
                }}
                className="rounded-squircle"
              >
                {ar ? 'عرض جميع الأسئلة' : 'Show all questions'}
              </Button>
            )}
            {onOpenNewComplaint && (
              <Button
                type="button"
                size="sm"
                onClick={onOpenNewComplaint}
                className="rounded-squircle gap-1.5"
              >
                <Plus className="h-4 w-4" />
                {ar ? 'إرسال استفسار لشؤون الطلاب' : 'Submit an inquiry'}
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* Radix Accordion List */}
      {faqsQuery.isSuccess && filteredItems.length > 0 && (
        <AccordionPrimitive.Root
          type="single"
          collapsible
          className="space-y-3"
        >
          {filteredItems.map((entry, idx) => {
            const primaryTopic = entry.topics?.[0];
            const TopicIcon = primaryTopic
              ? getTopicIcon(primaryTopic)
              : HelpCircle;

            return (
              <AccordionPrimitive.Item
                key={entry._id}
                value={entry._id}
                className="group overflow-hidden rounded-xl border border-border/70 bg-card/50 backdrop-blur-sm transition-all duration-200 hover:border-primary/35 data-[state=open]:border-primary/45 data-[state=open]:bg-card/75 data-[state=open]:shadow-(--shadow-glow)"
              >
                <AccordionPrimitive.Header className="flex">
                  <AccordionPrimitive.Trigger className="flex w-full items-center justify-between gap-3 px-4 py-3.5 sm:px-5 sm:py-4 text-start transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-inset">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-squircle border border-primary/25 bg-primary/10 text-primary transition-colors group-data-[state=open]:bg-primary group-data-[state=open]:text-primary-foreground">
                        <TopicIcon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <span
                          className="block text-sm sm:text-[15px] font-bold leading-snug text-foreground"
                          dir="auto"
                        >
                          {entry.question}
                        </span>
                        {entry.topics && entry.topics.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            {entry.topics.slice(0, 3).map((topic) => (
                              <span
                                key={topic}
                                className="inline-flex items-center rounded-squircle border border-border/70 bg-secondary/55 px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                              >
                                {formatTopicDisplay(topic, ar)}
                              </span>
                            ))}
                            <span className="text-[10px] font-mono text-muted-foreground/70">
                              #{idx + 1}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-squircle border border-border/60 bg-secondary/50 text-muted-foreground transition-all duration-200 group-data-[state=open]:rotate-180 group-data-[state=open]:border-primary/30 group-data-[state=open]:bg-primary/10 group-data-[state=open]:text-primary">
                      <ChevronDown className="h-4 w-4" />
                    </span>
                  </AccordionPrimitive.Trigger>
                </AccordionPrimitive.Header>

                <AccordionPrimitive.Content className="overflow-hidden border-t border-border/50 bg-secondary/20">
                  <div className="px-4 py-4 sm:px-5 sm:ps-16 space-y-3">
                    <p
                      className="whitespace-pre-wrap text-sm leading-7 text-foreground/90"
                      dir="auto"
                    >
                      {entry.answer}
                    </p>
                  </div>
                </AccordionPrimitive.Content>
              </AccordionPrimitive.Item>
            );
          })}
        </AccordionPrimitive.Root>
      )}

      {/* Conversion Card to Complaints */}
      <Card className="relative overflow-hidden rounded-2xl border border-primary/25 bg-linear-to-br from-primary/12 via-card/85 to-card/65 p-5 sm:p-6 shadow-(--shadow-glow)">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3.5">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-squircle border border-primary/30 bg-primary/15 text-primary shadow-xs">
              <LifeBuoy className="h-5 w-5" />
            </span>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-foreground">
                {ar
                  ? 'لم تجد إجابة لسؤالك؟'
                  : 'Didn’t find the answer you need?'}
              </h3>
              <p className="max-w-xl text-xs sm:text-sm leading-relaxed text-muted-foreground">
                {ar
                  ? 'فريق شؤون الطلاب والدعم الفني جاهز لمساعدتك. أرسل استفساراً أو شكوى جديدة وسنوافيك بالرد مباشرة في تذاكرك.'
                  : 'Student Affairs and Technical Support are here to help. Submit a new complaint or inquiry and track replies directly in your tickets.'}
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
            {onOpenNewComplaint ? (
              <Button
                type="button"
                onClick={onOpenNewComplaint}
                className="rounded-squircle gap-2 px-4 py-2.5 font-semibold shadow-sm"
              >
                <Plus className="h-4 w-4" />
                {ar ? 'تقديم شكوى أو استفسار' : 'Submit Complaint'}
              </Button>
            ) : (
              <Button
                asChild
                className="rounded-squircle gap-2 px-4 py-2.5 font-semibold shadow-sm"
              >
                <Link href={ar ? '/ar/dashboard/complaints?tab=tickets' : '/en/dashboard/complaints?tab=tickets'}>
                  <Plus className="h-4 w-4" />
                  {ar ? 'تقديم شكوى أو استفسار' : 'Submit Complaint'}
                </Link>
              </Button>
            )}

            {onSwitchToTickets && (
              <Button
                type="button"
                variant="outline"
                onClick={onSwitchToTickets}
                className="rounded-squircle gap-2 border-border/80 bg-background/40 px-4 py-2.5 font-semibold hover:bg-secondary/70"
              >
                <MessageCircle className="h-4 w-4 text-primary" />
                <span>
                  {ar ? 'متابعة تذاكري' : 'My Tickets'}
                </span>
                {typeof ticketsCount === 'number' && ticketsCount > 0 && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-squircle bg-primary/15 px-1.5 text-[11px] font-bold text-primary">
                    {ticketsCount}
                  </span>
                )}
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
