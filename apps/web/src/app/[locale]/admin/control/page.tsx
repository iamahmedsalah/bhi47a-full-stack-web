'use client';

import React, { Suspense, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import {
  ExternalLink,
  Loader2,
  MoreVertical,
  SlidersHorizontal,
  TableProperties,
} from 'lucide-react';
import { toast } from 'sonner';
import { PERMISSIONS, type Semester } from '@student-portal/shared';
import { getApiErrorMessage } from '@/lib/api';
import { useTableState } from '@/hooks/use-table-state';
import {
  CustomDropdown,
  type CustomDropdownOption,
} from '@/components/ui/custom-dropdown';
import {
  DataTableShell,
  type ColumnDef,
} from '@/components/ui/data-table-shell';
import { FilterBar } from '@/components/ui/filter-bar';
import { Input } from '@/components/ui/input';
import { PageSkeletonLoader } from '@/components/ui/page-suspense-fallback';
import { PageTitleBanner } from '@/components/ui/page-title-banner';
import { PermissionGuard } from '@/components/ui/permission-guard';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/status-badge';
import { TableCell } from '@/components/ui/table';
import {
  controlKeys,
  getControlCapabilities,
  listControlCourses,
  openControlSheet,
} from '@/features/control/api';
import { GradingSchemeDialog } from '@/features/control/components/grading-scheme-dialog';
import type { ControlCourseSummary } from '@/features/control/types';

function ControlHomeContent() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const locale = (params?.locale as string) || 'ar';
  const isAr = locale === 'ar';

  const {
    search,
    setSearch,
    filters,
    setFilter,
    selectedKeys,
    setSelectedKeys,
  } = useTableState({
    defaultFilters: {
      academicYear: '2026-2027',
      semester: 'first',
      status: 'all',
    },
  });

  const academicYear = filters.academicYear || '2026-2027';
  const semester = (filters.semester || 'first') as Semester;

  const { data: caps } = useQuery({
    queryKey: controlKeys.me(),
    queryFn: getControlCapabilities,
  });

  const {
    data: coursesData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: controlKeys.courses(academicYear, semester),
    queryFn: () => listControlCourses({ academicYear, semester }),
    enabled: Boolean(academicYear && /^\d{4}-\d{4}$/.test(academicYear)),
  });

  const [schemeTarget, setSchemeTarget] =
    useState<ControlCourseSummary | null>(null);

  const openSheetMutation = useMutation({
    mutationFn: (courseId: string) =>
      openControlSheet({
        academicYear,
        semester,
        courseId,
        component: 'midterm',
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({
        queryKey: controlKeys.courses(academicYear, semester),
      });
      router.push(`/${locale}/admin/control/${res.sheet.id}`);
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err));
    },
  });

  const filteredItems = useMemo(() => {
    const items = coursesData?.items ?? [];
    const needle = search.trim().toLowerCase();
    return items.filter((course) => {
      if (needle) {
        const hay = `${course.code} ${course.name} ${course.nameAr ?? ''} ${course.nameEn ?? ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      const mid = course.components.find((c) => c.key === 'midterm');
      if (filters.status === 'locked' && !mid?.locked) return false;
      if (filters.status === 'open' && mid?.locked) return false;
      return true;
    });
  }, [coursesData?.items, search, filters.status]);

  const columns = useMemo<ColumnDef<ControlCourseSummary>[]>(
    () => [
      {
        key: 'code',
        header: isAr ? 'كود المقرر' : 'Course Code',
        className: 'w-28',
        render: (item) => (
          <TableCell className="w-28 font-mono font-bold text-foreground">
            <bdi dir="ltr">{item.code}</bdi>
          </TableCell>
        ),
      },
      {
        key: 'name',
        header: isAr ? 'اسم المقرر' : 'Course Name',
        className: 'min-w-[220px]',
        render: (item) => {
          const title = isAr
            ? item.nameAr || item.name
            : item.nameEn || item.name;
          return (
            <TableCell className="min-w-[220px]">
              <div className="font-semibold text-foreground">{title}</div>
              {item.nameAr && item.nameEn && (
                <div className="text-[11px] text-muted-foreground">
                  {isAr ? item.nameEn : item.nameAr}
                </div>
              )}
            </TableCell>
          );
        },
      },
      {
        key: 'component',
        header: isAr ? 'المكوّن' : 'Component',
        className: 'w-32 text-center',
        render: () => (
          <TableCell className="w-32 text-center">
            <StatusBadge
              label={isAr ? 'ميدتيرم' : 'Midterm'}
              variant="primary"
            />
          </TableCell>
        ),
      },
      {
        key: 'progress',
        header: isAr ? 'تقدم الرصد (المرصود / المسجلين)' : 'Entry Progress',
        className: 'min-w-[200px]',
        render: (item) => {
          const mid = item.components.find((c) => c.key === 'midterm');
          const entered = mid?.entered ?? 0;
          const total = Math.max(item.rosterCount, entered);
          const pct = total > 0 ? Math.min(100, Math.round((entered / total) * 100)) : 0;

          return (
            <TableCell className="min-w-[200px]">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-mono" dir="ltr">
                  <span className="font-bold text-foreground">
                    {entered} / {item.rosterCount}
                  </span>
                  <span className="text-muted-foreground">{pct}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-squircle bg-surface/80 border border-border/60">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            </TableCell>
          );
        },
      },
      {
        key: 'status',
        header: isAr ? 'حالة الكشف' : 'Sheet Status',
        className: 'w-32 text-center',
        render: (item) => {
          const mid = item.components.find((c) => c.key === 'midterm');
          return (
            <TableCell className="w-32 text-center">
              <StatusBadge
                label={mid?.locked ? 'locked' : 'unlocked'}
                variant={mid?.locked ? 'warning' : 'success'}
              />
            </TableCell>
          );
        },
      },
      {
        key: 'visibility',
        header: isAr ? 'الظهور للطالب (موديول الدرجات)' : 'Published Count',
        className: 'w-40 text-center',
        render: (item) => {
          const mid = item.components.find((c) => c.key === 'midterm');
          const pub = mid?.published ?? 0;
          return (
            <TableCell className="w-40 text-center">
              <StatusBadge
                label={
                  pub > 0
                    ? isAr
                      ? `منشور (${pub})`
                      : `Published (${pub})`
                    : 'hidden'
                }
                variant={pub > 0 ? 'info' : 'neutral'}
              />
            </TableCell>
          );
        },
      },
      {
        key: 'actions',
        header: isAr ? 'إجراءات' : 'Actions',
        className: 'w-14 text-center',
        render: (item) => {
          const mid = item.components.find((c) => c.key === 'midterm');
          const canOpen = Boolean(
            mid?.sheetId || caps?.canCreateSheets || caps?.scopeAll,
          );
          const options: CustomDropdownOption[] = [
            ...(canOpen
              ? [
                  {
                    value: 'open',
                    label: (
                      <div className="flex items-center gap-2 text-xs py-0.5">
                        <ExternalLink className="h-3.5 w-3.5 text-primary" />
                        <span>
                          {mid?.sheetId
                            ? isAr
                              ? 'فتح شبكة رصد الدرجات'
                              : 'Open Grade Sheet Grid'
                            : isAr
                              ? 'إنشاء وفتح كشف الميدتيرم'
                              : 'Create & Open Midterm Sheet'}
                        </span>
                      </div>
                    ),
                  },
                ]
              : []),
            ...(caps?.canManageSchemes
              ? [
                  {
                    value: 'scheme',
                    label: (
                      <div className="flex items-center gap-2 text-xs py-0.5">
                        <SlidersHorizontal className="h-3.5 w-3.5 text-primary" />
                        <span>
                          {isAr
                            ? 'ضبط الدرجات العظمى وخطوة الرصد'
                            : 'Configure Max Marks & Step'}
                        </span>
                      </div>
                    ),
                  },
                ]
              : []),
          ];

          return (
            <TableCell className="w-14 text-center">
              {options.length > 0 && (
                <div className="inline-flex justify-center">
                  <CustomDropdown
                    value=""
                    ariaLabel={isAr ? 'إجراءات المقرر' : 'Course actions'}
                    placeholder={
                      <MoreVertical className="h-4 w-4 text-muted-foreground hover:text-primary" />
                    }
                    options={options}
                    onValueChange={(val) => {
                      if (val === 'open') {
                        if (mid?.sheetId) {
                          router.push(`/${locale}/admin/control/${mid.sheetId}`);
                        } else {
                          openSheetMutation.mutate(item.courseId);
                        }
                      } else if (val === 'scheme') {
                        setSchemeTarget(item);
                      }
                    }}
                    className="h-8 w-8 min-w-8 p-0 justify-center rounded-squircle border border-border/60 hover:bg-primary/10 [&>svg]:hidden"
                    menuClassName="w-60"
                  />
                </div>
              )}
            </TableCell>
          );
        },
      },
    ],
    [isAr, caps, locale, router, openSheetMutation],
  );

  return (
    <PermissionGuard
      permissions={[
        PERMISSIONS.CONTROL_ACCESS,
        PERMISSIONS.CONTROL_SHEETS_VIEW,
      ]}
    >
      <div className="space-y-6" dir={isAr ? 'rtl' : 'ltr'}>
        <PageTitleBanner
          title={
            isAr
              ? 'الكنترول — رصد ومراجعة الدرجات'
              : 'Control — Grade Entry & Sheets'
          }
          subtitle={
            isAr
              ? 'إدخال ومراجعة درجات الميدتيرم عبر شبكة تفاعلية سريعة مع سجل تدقيق كامل وقفل الكشوف. نشر النتائج للطلاب يظل حصرياً في موديول الدرجات.'
              : 'Interactive spreadsheet-style midterm grade entry with full audit logging and sheet locking. Publishing to students remains in the Grades module.'
          }
          eyebrow={isAr ? 'أعمال الكنترول' : 'Academic Control Office'}
          icon={<TableProperties className="h-4 w-4" />}
        />

        <FilterBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder={
            isAr
              ? 'ابحث بكود المقرر أو اسمه...'
              : 'Search by course code or name...'
          }
          wrapFilters
        >
          <div className="w-36">
            <Input
              dir="ltr"
              value={academicYear}
              onChange={(e) => setFilter('academicYear', e.target.value)}
              placeholder="2026-2027"
              className="h-10 rounded-squircle text-left font-mono text-xs"
            />
          </div>
          <div className="w-44">
            <Select
              value={semester}
              onValueChange={(v) => setFilter('semester', v)}
            >
              <SelectTrigger className="h-10 rounded-squircle text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="first">
                  {isAr ? 'الفصل الدراسي الأول' : 'First Semester'}
                </SelectItem>
                <SelectItem value="second">
                  {isAr ? 'الفصل الدراسي الثاني' : 'Second Semester'}
                </SelectItem>
                <SelectItem value="summer">
                  {isAr ? 'الفصل الصيفي' : 'Summer Semester'}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-40">
            <Select
              value={filters.status}
              onValueChange={(v) => setFilter('status', v)}
            >
              <SelectTrigger className="h-10 rounded-squircle text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {isAr ? 'كل الكشوف' : 'All Sheets'}
                </SelectItem>
                <SelectItem value="open">
                  {isAr ? 'مفتوحة للرصد' : 'Open for Entry'}
                </SelectItem>
                <SelectItem value="locked">
                  {isAr ? 'مقفولة' : 'Locked'}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </FilterBar>

        {openSheetMutation.isPending && (
          <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-xs font-semibold text-primary">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>
              {isAr ? 'جاري فتح كشف الرصد...' : 'Opening grade sheet...'}
            </span>
          </div>
        )}

        <DataTableShell
          columns={columns}
          data={filteredItems}
          keyExtractor={(item) => item.courseId}
          isLoading={isLoading}
          isError={isError}
          error={error}
          onRetry={() => void refetch()}
          enableSelection
          selectedKeys={selectedKeys}
          onSelectedKeysChange={setSelectedKeys}
          emptyMessage={
            isAr
              ? 'لا توجد مقررات متاحة ضمن نطاق صلاحياتك لهذا الفصل الدراسي.'
              : 'No courses available within your scope for this semester.'
          }
        />

        {schemeTarget && (
          <GradingSchemeDialog
            open={Boolean(schemeTarget)}
            onOpenChange={(o) => {
              if (!o) setSchemeTarget(null);
            }}
            courseId={schemeTarget.courseId}
            courseCode={schemeTarget.code}
            courseTitle={
              isAr
                ? schemeTarget.nameAr || schemeTarget.name
                : schemeTarget.nameEn || schemeTarget.name
            }
            academicYear={academicYear}
            semester={semester}
            locale={locale}
          />
        )}
      </div>
    </PermissionGuard>
  );
}

export default function ControlAdminPage() {
  return (
    <Suspense fallback={<PageSkeletonLoader />}>
      <ControlHomeContent />
    </Suspense>
  );
}
