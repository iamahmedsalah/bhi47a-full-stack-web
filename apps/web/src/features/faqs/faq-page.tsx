'use client';

import React, { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PERMISSIONS } from '@student-portal/shared';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { toast } from 'sonner';
import {
  BookOpen,
  CheckCircle2,
  Eye,
  EyeOff,
  FileText,
  Globe,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api-client';
import { getApiErrorMessage, type PaginatedResponse } from '@/lib/api';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { PageTitleBanner } from '@/components/ui/page-title-banner';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { StatusBadge } from '@/components/ui/status-badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/cn';
import { StudentFaqSection } from './components/student-faq-section';
import {
  FAQ_TOPIC_PRESETS,
  formatTopicDisplay,
  isArabicFaqText,
  type FaqEntry,
  type SeedDefaultsResult,
} from './types';

interface FaqFormState {
  _id: string;
  question: string;
  answer: string;
  topics: string[];
  customTopicsText: string;
  keywordsText: string;
  sortOrder: number;
  isActive: boolean;
}

const EMPTY_FORM: FaqFormState = {
  _id: '',
  question: '',
  answer: '',
  topics: [],
  customTopicsText: '',
  keywordsText: '',
  sortOrder: 0,
  isActive: true,
};

function splitCsv(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[,،]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ].slice(0, 30);
}

export function FaqPage({ ar, admin = false }: { ar: boolean; admin?: boolean }) {
  if (!admin) {
    return (
      <section className="mx-auto max-w-4xl space-y-5" dir={ar ? 'rtl' : 'ltr'}>
        <PageTitleBanner
          title={ar ? 'الأسئلة الشائعة' : 'Frequently Asked Questions'}
          subtitle={
            ar
              ? 'إجابات رسمية ومعتمدة لأكثر استفسارات الطلاب تكراراً'
              : 'Approved answers to the most common student inquiries'
          }
          icon={<BookOpen className="size-5" />}
        />
        <StudentFaqSection ar={ar} />
      </section>
    );
  }

  return <AdminFaqManagementPage ar={ar} />;
}

function AdminFaqManagementPage({ ar }: { ar: boolean }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const dir: 'rtl' | 'ltr' = ar ? 'rtl' : 'ltr';

  const canRead =
    user?.role === 'admin' || user?.permissions?.includes(PERMISSIONS.FAQS_READ);
  const canEdit =
    user?.role === 'admin' || user?.permissions?.includes(PERMISSIONS.FAQS_WRITE);

  // Filters & pagination
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft'>('all');
  const [localeFilter, setLocaleFilter] = useState<'all' | 'ar' | 'en'>('all');
  const [topicFilter, setTopicFilter] = useState<string>('all');
  const [page, setPage] = useState(1);

  // Selection & modals
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formState, setFormState] = useState<FaqFormState>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<FaqEntry | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const queryParams = useMemo(() => {
    const params: Record<string, string | number | boolean> = {
      page,
      limit: 20,
    };
    if (search) params.search = search;
    if (statusFilter === 'published') params.isActive = true;
    if (statusFilter === 'draft') params.isActive = false;
    if (localeFilter !== 'all') params.locale = localeFilter;
    if (topicFilter !== 'all') params.topic = topicFilter;
    return params;
  }, [page, search, statusFilter, localeFilter, topicFilter]);

  const entriesQuery = useQuery({
    queryKey: ['admin-faqs', queryParams],
    queryFn: ({ signal }) =>
      apiGet<PaginatedResponse<FaqEntry>>('/admin/faqs', {
        params: queryParams,
        signal,
      }),
    enabled: Boolean(canRead),
  });

  // Lightweight totals query for KPI counters
  const statsQuery = useQuery({
    queryKey: ['admin-faqs-stats'],
    queryFn: ({ signal }) =>
      apiGet<PaginatedResponse<FaqEntry>>('/admin/faqs', {
        params: { page: 1, limit: 200 },
        signal,
      }),
    enabled: Boolean(canRead),
    staleTime: 30 * 1000,
  });

  const stats = useMemo(() => {
    const all = statsQuery.data?.items ?? [];
    const total = statsQuery.data?.total ?? all.length;
    const published = all.filter((item) => item.isActive).length;
    const drafts = all.filter((item) => !item.isActive).length;
    return { total, published, drafts };
  }, [statsQuery.data]);

  const rows = useMemo(
    () => entriesQuery.data?.items ?? [],
    [entriesQuery.data?.items],
  );

  const visibleIdSet = useMemo(() => new Set(rows.map((r) => r._id)), [rows]);
  const validSelectedIds = useMemo(
    () => selectedIds.filter((id) => visibleIdSet.has(id)),
    [selectedIds, visibleIdSet],
  );
  const allVisibleSelected =
    rows.length > 0 && validSelectedIds.length === rows.length;

  const invalidateFaqQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin-faqs'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-faqs-stats'] }),
      queryClient.invalidateQueries({ queryKey: ['student-faqs'] }),
    ]);
  };

  const saveMutation = useMutation({
    mutationFn: (payload: {
      _id?: string;
      question: string;
      answer: string;
      topics: string[];
      keywords: string[];
      sortOrder: number;
      isActive: boolean;
    }) => {
      const { _id, ...body } = payload;
      return _id
        ? apiPatch<FaqEntry>(`/admin/faqs/${_id}`, body)
        : apiPost<FaqEntry>('/admin/faqs', body);
    },
    onSuccess: async (_, variables) => {
      await invalidateFaqQueries();
      setDialogOpen(false);
      toast.success(
        variables._id
          ? ar
            ? 'تم تحديث السؤال بنجاح'
            : 'FAQ updated successfully'
          : ar
            ? 'تم إضافة السؤال بنجاح'
            : 'FAQ created successfully',
      );
    },
    onError: (err) => {
      toast.error(
        getApiErrorMessage(
          err,
          ar ? 'تعذر حفظ السؤال' : 'Could not save FAQ',
        ),
      );
    },
  });

  const togglePublishMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiPatch<FaqEntry>(`/admin/faqs/${id}`, { isActive }),
    onSuccess: async (_, variables) => {
      await invalidateFaqQueries();
      toast.success(
        variables.isActive
          ? ar
            ? 'تم نشر السؤال للطلاب والمساعد الذكي'
            : 'FAQ published to students and assistant'
          : ar
            ? 'تم تحويل السؤال إلى مسودة'
            : 'FAQ moved to draft',
      );
    },
    onError: (err) => {
      toast.error(
        getApiErrorMessage(
          err,
          ar ? 'تعذر تحديث حالة النشر' : 'Could not update publish status',
        ),
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete<{ message: string }>(`/admin/faqs/${id}`),
    onSuccess: async () => {
      await invalidateFaqQueries();
      setDeleteTarget(null);
      setSelectedIds([]);
      toast.success(ar ? 'تم حذف السؤال بنجاح' : 'FAQ deleted successfully');
    },
    onError: (err) => {
      toast.error(
        getApiErrorMessage(
          err,
          ar ? 'تعذر حذف السؤال' : 'Could not delete FAQ',
        ),
      );
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) =>
      apiPost<{ deletedCount: number }>('/admin/faqs/bulk-delete', { ids }),
    onSuccess: async (res) => {
      await invalidateFaqQueries();
      setBulkDeleteOpen(false);
      setSelectedIds([]);
      toast.success(
        ar
          ? `تم حذف ${res.deletedCount} سؤال بنجاح`
          : `Deleted ${res.deletedCount} FAQ(s)`,
      );
    },
    onError: (err) => {
      toast.error(
        getApiErrorMessage(
          err,
          ar ? 'تعذر حذف العناصر المحددة' : 'Could not delete selected FAQs',
        ),
      );
    },
  });

  const seedDefaultsMutation = useMutation({
    mutationFn: () =>
      apiPost<SeedDefaultsResult>('/admin/faqs/seed-defaults', {}),
    onSuccess: async (res) => {
      await invalidateFaqQueries();
      if (res.inserted > 0) {
        toast.success(
          ar
            ? `تمت إضافة ${res.inserted} مسودة (وتخطي ${res.skipped} سؤال موجود)`
            : `Added ${res.inserted} starter drafts (${res.skipped} already existed)`,
        );
      } else {
        toast.info(
          ar
            ? 'جميع الأسئلة الافتراضية موجودة بالفعل'
            : 'All starter FAQs are already loaded',
        );
      }
    },
    onError: (err) => {
      toast.error(
        getApiErrorMessage(
          err,
          ar ? 'تعذر تحميل الأسئلة الافتراضية' : 'Could not load starter FAQs',
        ),
      );
    },
  });

  const openCreateDialog = () => {
    setFormState({
      ...EMPTY_FORM,
      sortOrder: stats.total + 1,
      isActive: true,
    });
    setDialogOpen(true);
  };

  const openEditDialog = (entry: FaqEntry) => {
    const presetValues = new Set(
      FAQ_TOPIC_PRESETS.flatMap((p) => [p.ar.toLowerCase(), p.en.toLowerCase()]),
    );
    const matchedPresets: string[] = [];
    const customTopics: string[] = [];

    for (const topic of entry.topics ?? []) {
      const norm = topic.trim().toLowerCase();
      if (presetValues.has(norm)) {
        matchedPresets.push(norm);
      } else if (topic.trim()) {
        customTopics.push(topic.trim());
      }
    }

    setFormState({
      _id: entry._id,
      question: entry.question,
      answer: entry.answer,
      topics: matchedPresets,
      customTopicsText: customTopics.join(', '),
      keywordsText: (entry.keywords ?? []).join(', '),
      sortOrder: entry.sortOrder ?? 0,
      isActive: entry.isActive,
    });
    setDialogOpen(true);
  };

  const toggleFormPresetTopic = (topicValue: string) => {
    const norm = topicValue.toLowerCase();
    setFormState((prev) => ({
      ...prev,
      topics: prev.topics.includes(norm)
        ? prev.topics.filter((t) => t !== norm)
        : [...prev.topics, norm],
    }));
  };

  const handleFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEdit) return;
    const question = formState.question.trim();
    const answer = formState.answer.trim();
    if (!question || !answer) return;

    const mergedTopics = [
      ...new Set([
        ...formState.topics,
        ...splitCsv(formState.customTopicsText).map((t) => t.toLowerCase()),
      ]),
    ].slice(0, 30);

    saveMutation.mutate({
      _id: formState._id || undefined,
      question,
      answer,
      topics: mergedTopics,
      keywords: splitCsv(formState.keywordsText),
      sortOrder: Number.isFinite(formState.sortOrder) ? formState.sortOrder : 0,
      isActive: formState.isActive,
    });
  };

  const toggleSelectRow = (id: string, checked: boolean) => {
    setSelectedIds((prev) =>
      checked ? [...new Set([...prev, id])] : prev.filter((item) => item !== id),
    );
  };

  const columns = useMemo<DataTableColumn<FaqEntry>[]>(() => {
    const cols: DataTableColumn<FaqEntry>[] = [];

    if (canEdit) {
      cols.push({
        key: 'select',
        className: 'w-8 text-center',
        header: (
          <div className="flex items-center justify-center">
            <Checkbox
              checked={allVisibleSelected}
              onCheckedChange={(checked) =>
                setSelectedIds(checked === true ? rows.map((row) => row._id) : [])
              }
              aria-label={ar ? 'تحديد الكل' : 'Select all'}
            />
          </div>
        ),
        cell: (row) => (
          <div className="flex items-center justify-center">
            <Checkbox
              checked={validSelectedIds.includes(row._id)}
              onCheckedChange={(checked) =>
                toggleSelectRow(row._id, checked === true)
              }
              aria-label={ar ? 'تحديد السؤال' : 'Select FAQ'}
            />
          </div>
        ),
      });
    }

    cols.push(
      {
        key: 'question',
        header: ar ? 'السؤال والإجابة' : 'Question & Answer',
        cell: (row) => (
          <div className="max-w-xl space-y-1">
            <p className="font-bold text-foreground leading-snug" dir="auto">
              {row.question}
            </p>
            <p
              className="line-clamp-2 text-xs text-muted-foreground leading-relaxed"
              dir="auto"
            >
              {row.answer}
            </p>
          </div>
        ),
      },
      {
        key: 'topics',
        header: ar ? 'التصنيف' : 'Category',
        className: 'whitespace-nowrap',
        cell: (row) => (
          <div className="flex flex-wrap gap-1.5 max-w-44">
            {(row.topics ?? []).length > 0 ? (
              row.topics.slice(0, 3).map((topic) => (
                <span
                  key={topic}
                  className="inline-flex items-center rounded-squircle border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary"
                >
                  {formatTopicDisplay(topic, ar)}
                </span>
              ))
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )}
          </div>
        ),
      },
      {
        key: 'locale',
        header: ar ? 'اللغة' : 'Language',
        className: 'whitespace-nowrap',
        cell: (row) => {
          const isArEntry = isArabicFaqText(row.question);
          return (
            <span className="inline-flex items-center gap-1 rounded-squircle border border-border/70 bg-secondary/60 px-2.5 py-0.5 text-[11px] font-semibold text-foreground">
              <Globe className="h-3 w-3 text-primary" />
              {isArEntry ? (ar ? 'العربية' : 'Arabic') : ar ? 'الإنجليزية' : 'English'}
            </span>
          );
        },
      },
      {
        key: 'status',
        header: ar ? 'الحالة' : 'Status',
        className: 'whitespace-nowrap',
        cell: (row) => (
          <StatusBadge
            label={row.isActive ? (ar ? 'منشور' : 'Published') : ar ? 'مسودة' : 'Draft'}
            variant={row.isActive ? 'success' : 'warning'}
          />
        ),
      },
    );

    if (canEdit) {
      cols.push({
        key: 'actions',
        header: ar ? 'إجراءات' : 'Actions',
        className: 'w-14 text-center',
        cell: (row) => (
          <div className="flex items-center justify-center">
            <DropdownMenu.Root dir={dir}>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  aria-label={ar ? 'إجراءات السؤال' : 'FAQ actions'}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-squircle border border-transparent text-muted-foreground hover:border-border hover:bg-secondary/70 hover:text-foreground transition-colors cursor-pointer"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  asChild
                  align="end"
                  sideOffset={6}
                >
                  <div
                    dir={dir}
                    className="z-50 min-w-44 rounded-xl border border-border bg-card p-1.5 shadow-xl"
                  >
                    <DropdownMenu.Item
                      onSelect={() => openEditDialog(row)}
                      className="flex items-center gap-2 rounded-squircle px-2.5 py-2 text-xs font-medium text-foreground outline-none hover:bg-secondary cursor-pointer"
                    >
                      <Pencil className="h-3.5 w-3.5 text-primary" />
                      <span>{ar ? 'تعديل السؤال والإجابة' : 'Edit Question'}</span>
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      onSelect={() =>
                        togglePublishMutation.mutate({
                          id: row._id,
                          isActive: !row.isActive,
                        })
                      }
                      className="flex items-center gap-2 rounded-squircle px-2.5 py-2 text-xs font-medium text-foreground outline-none hover:bg-secondary cursor-pointer"
                    >
                      {row.isActive ? (
                        <>
                          <EyeOff className="h-3.5 w-3.5 text-amber-400" />
                          <span>{ar ? 'تحويل إلى مسودة' : 'Move to Draft'}</span>
                        </>
                      ) : (
                        <>
                          <Eye className="h-3.5 w-3.5 text-emerald-400" />
                          <span>{ar ? 'نشر للطلاب والمساعد' : 'Publish'}</span>
                        </>
                      )}
                    </DropdownMenu.Item>
                    <DropdownMenu.Separator className="my-1 h-px bg-border/70" />
                    <DropdownMenu.Item
                      onSelect={() => setDeleteTarget(row)}
                      className="flex items-center gap-2 rounded-squircle px-2.5 py-2 text-xs font-medium text-danger outline-none hover:bg-danger/10 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>{ar ? 'حذف السؤال' : 'Delete FAQ'}</span>
                    </DropdownMenu.Item>
                  </div>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        ),
      });
    }

    return cols;
  }, [
    allVisibleSelected,
    ar,
    canEdit,
    dir,
    rows,
    togglePublishMutation,
    validSelectedIds,
  ]);

  if (!canRead) {
    return (
      <Card role="alert" className="mx-auto max-w-2xl rounded-2xl p-6 text-center">
        <p className="text-sm font-medium text-muted-foreground">
          {ar
            ? 'ليس لديك صلاحية عرض إدارة الأسئلة الشائعة.'
            : 'You do not have permission to view administrative FAQs.'}
        </p>
      </Card>
    );
  }

  return (
    <section className="mx-auto max-w-6xl space-y-5" dir={dir}>
      <PageTitleBanner
        title={ar ? 'إدارة الأسئلة الشائعة' : 'FAQ Knowledge Base Management'}
        subtitle={
          ar
            ? 'أضف وعدّل وانشر الإجابات المعتمدة التي تظهر للطلاب في مركز المساعدة وتغذي المساعد الذكي مباشرة.'
            : 'Create, edit, and publish approved answers shown in the student Help Center and used by the AI assistant.'
        }
        icon={<BookOpen className="size-5" />}
      >
        {canEdit && (
          <>
            <Button
              type="button"
              variant="outline"
              disabled={seedDefaultsMutation.isPending}
              onClick={() => seedDefaultsMutation.mutate()}
              className="rounded-squircle gap-2"
            >
              {seedDefaultsMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 text-primary" />
              )}
              {ar ? 'تحميل الأسئلة الافتراضية' : 'Load Starter FAQs'}
            </Button>
            <Button
              type="button"
              onClick={openCreateDialog}
              className="rounded-squircle gap-2 shadow-sm"
            >
              <Plus className="h-4 w-4" />
              {ar ? 'إضافة سؤال جديد' : 'Add New FAQ'}
            </Button>
          </>
        )}
      </PageTitleBanner>

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="flex items-center gap-3.5 rounded-xl border-border/70 bg-card/60 p-4">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-squircle border border-primary/25 bg-primary/10 text-primary">
            <BookOpen className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs text-muted-foreground">
              {ar ? 'إجمالي الأسئلة' : 'Total FAQs'}
            </p>
            <p className="text-xl font-bold text-foreground">{stats.total}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3.5 rounded-xl border-border/70 bg-card/60 p-4">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-squircle border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
            <CheckCircle2 className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs text-muted-foreground">
              {ar ? 'منشور للطلاب والمساعد' : 'Published'}
            </p>
            <p className="text-xl font-bold text-foreground">{stats.published}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3.5 rounded-xl border-border/70 bg-card/60 p-4">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-squircle border border-amber-500/30 bg-amber-500/10 text-amber-400">
            <FileText className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs text-muted-foreground">
              {ar ? 'مسودات قيد المراجعة' : 'Drafts'}
            </p>
            <p className="text-xl font-bold text-foreground">{stats.drafts}</p>
          </div>
        </Card>
      </div>

      {/* Filters Toolbar */}
      <Card className="rounded-2xl border-border/70 bg-card/55 p-4 space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute inset-s-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              maxLength={120}
              placeholder={
                ar
                  ? 'ابحث في السؤال أو الإجابة أو كلمات البحث...'
                  : 'Search questions, answers, or keywords...'
              }
              className="rounded-squircle ps-9 pe-9"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput('');
                  setSearch('');
                }}
                aria-label={ar ? 'مسح البحث' : 'Clear search'}
                className="absolute inset-e-2.5 top-1/2 -translate-y-1/2 rounded-squircle p-1 text-muted-foreground hover:bg-secondary cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={statusFilter}
              onValueChange={(value) => {
                setStatusFilter(value as 'all' | 'published' | 'draft');
                setPage(1);
              }}
            >
              <SelectTrigger className="w-36 rounded-squircle">
                <SelectValue />
              </SelectTrigger>
              <SelectContent dir={dir}>
                <SelectItem value="all">{ar ? 'كل الحالات' : 'All Statuses'}</SelectItem>
                <SelectItem value="published">{ar ? 'منشور فقط' : 'Published'}</SelectItem>
                <SelectItem value="draft">{ar ? 'مسودات فقط' : 'Drafts'}</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={localeFilter}
              onValueChange={(value) => {
                setLocaleFilter(value as 'all' | 'ar' | 'en');
                setPage(1);
              }}
            >
              <SelectTrigger className="w-36 rounded-squircle">
                <SelectValue />
              </SelectTrigger>
              <SelectContent dir={dir}>
                <SelectItem value="all">{ar ? 'كل اللغات' : 'All Languages'}</SelectItem>
                <SelectItem value="ar">{ar ? 'العربية' : 'Arabic'}</SelectItem>
                <SelectItem value="en">{ar ? 'الإنجليزية' : 'English'}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Topic Quick Filter Chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setTopicFilter('all');
              setPage(1);
            }}
            className={cn(
              'rounded-squircle border px-3 py-1 text-xs font-semibold transition-all cursor-pointer',
              topicFilter === 'all'
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border/70 bg-secondary/45 text-muted-foreground hover:text-foreground',
            )}
          >
            {ar ? 'كل التصنيفات' : 'All Categories'}
          </button>
          {FAQ_TOPIC_PRESETS.map((preset) => {
            const value = ar ? preset.ar : preset.en;
            const active = topicFilter === value;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  setTopicFilter(active ? 'all' : value);
                  setPage(1);
                }}
                className={cn(
                  'rounded-squircle border px-3 py-1 text-xs font-semibold transition-all cursor-pointer',
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border/70 bg-secondary/45 text-muted-foreground hover:text-foreground',
                )}
              >
                {ar ? preset.ar : formatTopicDisplay(preset.en, false)}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Bulk Action Bar */}
      {canEdit && validSelectedIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5">
          <span className="text-xs font-bold text-foreground">
            {ar
              ? `تم تحديد ${validSelectedIds.length} سؤال`
              : `${validSelectedIds.length} FAQ(s) selected`}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSelectedIds([])}
              className="rounded-squircle text-xs"
            >
              {ar ? 'إلغاء التحديد' : 'Clear'}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => setBulkDeleteOpen(true)}
              className="rounded-squircle gap-1.5 text-xs"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {ar ? 'حذف المحدد' : 'Delete Selected'}
            </Button>
          </div>
        </div>
      )}

      {/* Table Container */}
      <Card className="overflow-hidden rounded-2xl border-border/70 bg-card/55">
        {entriesQuery.isLoading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : entriesQuery.isError ? (
          <div role="alert" className="p-8 text-center space-y-3">
            <p className="text-sm text-danger">
              {getApiErrorMessage(
                entriesQuery.error,
                ar ? 'تعذر تحميل الأسئلة الشائعة' : 'Could not load FAQs',
              )}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void entriesQuery.refetch()}
              className="rounded-squircle"
            >
              {ar ? 'إعادة المحاولة' : 'Retry'}
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-squircle border border-primary/25 bg-primary/10 text-primary">
              <BookOpen className="h-6 w-6" />
            </div>
            <p className="text-sm font-semibold text-foreground">
              {ar ? 'لا توجد أسئلة مطابقة حالياً' : 'No matching FAQs found'}
            </p>
            {canEdit && stats.total === 0 && (
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={seedDefaultsMutation.isPending}
                  onClick={() => seedDefaultsMutation.mutate()}
                  className="rounded-squircle gap-1.5"
                >
                  <Sparkles className="h-4 w-4 text-primary" />
                  {ar ? 'تحميل الأسئلة الافتراضية الجاهزة' : 'Load Starter FAQs'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={openCreateDialog}
                  className="rounded-squircle gap-1.5"
                >
                  <Plus className="h-4 w-4" />
                  {ar ? 'إضافة سؤال يدوياً' : 'Create FAQ Manually'}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <DataTable rows={rows} columns={columns} />
        )}

        {/* Pagination */}
        {entriesQuery.data && entriesQuery.data.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border/60 px-4 py-3 text-xs text-muted-foreground">
            <span>
              {ar
                ? `صفحة ${entriesQuery.data.page} من ${entriesQuery.data.totalPages} (${entriesQuery.data.total} سؤال)`
                : `Page ${entriesQuery.data.page} of ${entriesQuery.data.totalPages} (${entriesQuery.data.total} FAQs)`}
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-squircle text-xs"
              >
                {ar ? 'السابق' : 'Previous'}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= entriesQuery.data.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-squircle text-xs"
              >
                {ar ? 'التالي' : 'Next'}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Create / Edit FAQ Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          dir={dir}
          className="max-w-2xl rounded-2xl border-border bg-card p-6 shadow-2xl"
        >
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-foreground">
              {formState._id
                ? ar
                  ? 'تعديل السؤال والإجابة'
                  : 'Edit FAQ Entry'
                : ar
                  ? 'إضافة سؤال جديد للأسئلة الشائعة'
                  : 'Add New FAQ Entry'}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {ar
                ? 'أدخل السؤال وإجابته المعتمدة. عند تفعيل النشر يظهر فوراً في مركز المساعدة للطالب وفي بحث المساعد الذكي.'
                : 'Enter the question and approved answer. Published items immediately appear in the student Help Center and AI assistant retrieval.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleFormSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-foreground">
                {ar ? 'السؤال *' : 'Question *'}
              </label>
              <Input
                required
                maxLength={300}
                dir="auto"
                value={formState.question}
                onChange={(e) =>
                  setFormState((prev) => ({ ...prev, question: e.target.value }))
                }
                placeholder={
                  ar
                    ? 'مثال: كيف أعرف مكان ورقم لجنة الامتحان؟'
                    : 'e.g. How do I find my exam seat number and room?'
                }
                className="rounded-squircle"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-foreground">
                {ar ? 'الإجابة المعتمدة *' : 'Approved Answer *'}
              </label>
              <Textarea
                required
                rows={4}
                maxLength={3000}
                dir="auto"
                value={formState.answer}
                onChange={(e) =>
                  setFormState((prev) => ({ ...prev, answer: e.target.value }))
                }
                placeholder={
                  ar
                    ? 'اكتب الإجابة الرسمية الواضحة للطالب...'
                    : 'Write the official, concise answer for students...'
                }
                className="rounded-xl"
              />
            </div>

            {/* Quick Category Chips */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-foreground">
                {ar ? 'التصنيفات السريعة' : 'Quick Categories'}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {FAQ_TOPIC_PRESETS.map((preset) => {
                  const val = (ar ? preset.ar : preset.en).toLowerCase();
                  const selected = formState.topics.includes(val);
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => toggleFormPresetTopic(val)}
                      className={cn(
                        'rounded-squircle border px-3 py-1 text-xs font-semibold transition-all cursor-pointer',
                        selected
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-secondary/50 text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {ar ? preset.ar : formatTopicDisplay(preset.en, false)}
                    </button>
                  );
                })}
              </div>
              <Input
                maxLength={400}
                dir="auto"
                value={formState.customTopicsText}
                onChange={(e) =>
                  setFormState((prev) => ({
                    ...prev,
                    customTopicsText: e.target.value,
                  }))
                }
                placeholder={
                  ar
                    ? 'تصنيفات إضافية (اختياري، مفصولة بفاصلة)'
                    : 'Additional custom topics (optional, comma-separated)'
                }
                className="rounded-squircle text-xs"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div className="sm:col-span-3 space-y-1.5">
                <label className="block text-xs font-semibold text-foreground">
                  {ar
                    ? 'كلمات البحث البديلة (لتحسين نتائج البحث والمساعد الذكي)'
                    : 'Search Keywords (comma-separated)'}
                </label>
                <Input
                  maxLength={800}
                  dir="auto"
                  value={formState.keywordsText}
                  onChange={(e) =>
                    setFormState((prev) => ({
                      ...prev,
                      keywordsText: e.target.value,
                    }))
                  }
                  placeholder={
                    ar
                      ? 'مثال: فين نتيجتي، الدرجات، كشف درجات، ميدترم'
                      : 'e.g. grades, results, midterm, transcript'
                  }
                  className="rounded-squircle text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-foreground">
                  {ar ? 'الترتيب' : 'Sort Order'}
                </label>
                <Input
                  type="number"
                  dir="ltr"
                  className="rounded-squircle text-left text-xs"
                  value={formState.sortOrder}
                  onChange={(e) =>
                    setFormState((prev) => ({
                      ...prev,
                      sortOrder: Number(e.target.value) || 0,
                    }))
                  }
                />
              </div>
            </div>

            <label className="flex items-center gap-2.5 rounded-xl border border-border/70 bg-secondary/35 px-3.5 py-2.5 cursor-pointer">
              <Checkbox
                checked={formState.isActive}
                onCheckedChange={(checked) =>
                  setFormState((prev) => ({
                    ...prev,
                    isActive: checked === true,
                  }))
                }
              />
              <span className="text-xs font-semibold text-foreground">
                {ar
                  ? 'نشر السؤال فوراً للطلاب في مركز المساعدة وتفعيله في المساعد الذكي'
                  : 'Publish immediately to the Student Help Center and AI assistant'}
              </span>
            </label>

            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                disabled={saveMutation.isPending}
                onClick={() => setDialogOpen(false)}
                className="rounded-squircle"
              >
                {ar ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button
                type="submit"
                disabled={saveMutation.isPending}
                className="rounded-squircle gap-1.5"
              >
                {saveMutation.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                {formState._id
                  ? ar
                    ? 'حفظ التعديلات'
                    : 'Save Changes'
                  : ar
                    ? 'حفظ السؤال'
                    : 'Create FAQ'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Single Delete Confirm */}
      <ConfirmDialog
        dir={dir}
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={ar ? 'حذف السؤال من الأسئلة الشائعة؟' : 'Delete this FAQ?'}
        description={
          deleteTarget ? (
            <span>
              {ar
                ? `سيتم حذف السؤال «${deleteTarget.question}» نهائياً ولن يظهر للطلاب أو للمساعد الذكي.`
                : `This will permanently delete "${deleteTarget.question}" from students and the AI assistant.`}
            </span>
          ) : null
        }
        confirmLabel={ar ? 'نعم، احذف السؤال' : 'Delete FAQ'}
        cancelLabel={ar ? 'إلغاء' : 'Cancel'}
        disabled={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget._id);
        }}
      />

      {/* Bulk Delete Confirm */}
      <ConfirmDialog
        dir={dir}
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title={
          ar
            ? `حذف ${validSelectedIds.length} سؤال محدد؟`
            : `Delete ${validSelectedIds.length} selected FAQ(s)?`
        }
        description={
          ar
            ? 'سيتم حذف جميع الأسئلة المحددة نهائياً ولا يمكن التراجع عن هذا الإجراء.'
            : 'All selected FAQ entries will be permanently deleted. This action cannot be undone.'
        }
        confirmLabel={ar ? 'تأكيد الحذف الجماعي' : 'Delete Selected'}
        cancelLabel={ar ? 'إلغاء' : 'Cancel'}
        disabled={bulkDeleteMutation.isPending}
        onConfirm={() => bulkDeleteMutation.mutate(validSelectedIds)}
      />
    </section>
  );
}
