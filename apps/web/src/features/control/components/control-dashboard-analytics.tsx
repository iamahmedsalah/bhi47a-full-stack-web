"use client";

import { useId, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import {
  BarChart3,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  EyeOff,
  PieChart as PieChartIcon,
  Search,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  COURSE_LEVEL_VALUES,
  SEMESTER_VALUES,
  type CourseLevel,
  type Semester,
} from "@student-portal/shared";
import {
  AcademicYearSelect,
  useAcademicYearOptions,
} from "@/components/ui/academic-year-select";
import { Button } from "@/components/ui/button";
import { HelpNote } from "@/components/ui/help-note";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatCard, StatCardRow } from "@/components/ui/stat-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/providers/auth-provider";
import api from "@/lib/api";
import type { ControlCourseSummary, ControlPassRateSummary } from "../types";

const exams = ["midterm", "final"] as const;
type Exam = (typeof exams)[number];

type Course = Omit<ControlCourseSummary, "components"> & {
  recorded: number;
  results: number;
  exams?: Partial<
    Record<
      Exam,
      { passRate: ControlPassRateSummary | null; published: boolean }
    >
  >;
};

const bands = ["all", "under50", "50to75", "atLeast75", "unpublished"] as const;
type Band = (typeof bands)[number];
const pageSize = 12;

function localizedCourseName(course: Course, locale: string) {
  return (locale === "ar" ? course.nameAr : course.nameEn) || course.name;
}

function courseRate(course: Course, exam: Exam) {
  const rate = course.exams?.[exam]?.passRate;
  return rate?.total ? (rate.passed * 100) / rate.total : null;
}

function matchesRate(course: Course, band: Band, exam: Exam) {
  if (band === "all") return true;
  if (band === "unpublished") return course.exams?.[exam]?.published === false;
  const rate = courseRate(course, exam);
  if (rate === null) return false;
  if (band === "under50") return rate < 50;
  if (band === "50to75") return rate >= 50 && rate < 75;
  return rate >= 75;
}

export function ControlDashboardAnalytics() {
  const t = useTranslations("controlDashboard");
  const locale = useLocale();
  const { user } = useAuth();
  const id = useId();
  const years = useAcademicYearOptions();
  const [year, setYear] = useState("");
  const [selectedSemester, setSemester] = useState<Semester>();
  const [exam, setExam] = useState<Exam>("midterm");
  const [band, setBand] = useState<Band>("all");
  const academicYear = year || years.data?.currentYear || "";
  const semester = selectedSemester ?? years.data?.currentSemester ?? "first";
  const rtl = locale === "ar";
  const query = useQuery({
    queryKey: ["control", "dashboard", user?._id, academicYear, semester],
    enabled: Boolean(user?._id && academicYear),
    staleTime: 30_000,
    queryFn: async () =>
      (
        await api.get<{ items: Course[] }>("/admin/control/dashboard", {
          params: { academicYear, semester },
        })
      ).data.items,
  });
  const courses =
    query.data?.filter((course) => matchesRate(course, band, exam)) ?? [];

  return (
    <section
      id="control-analytics"
      aria-labelledby={id}
      className="scroll-mt-24 space-y-4"
      dir={rtl ? "rtl" : "ltr"}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border/80 pb-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="size-5 text-primary" aria-hidden="true" />
          <h2 id={id} className="text-lg font-bold text-foreground">
            {t("title")}
          </h2>
        </div>
      </header>
      <div className="grid gap-3 rounded-2xl border border-border/70 bg-card/80 p-3 sm:grid-cols-3">
        <AcademicYearSelect value={academicYear} onChange={setYear} />
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor={`${id}-semester`}>{t("semester")}</Label>
          <Select
            value={semester}
            onValueChange={(value) => setSemester(value as Semester)}
          >
            <SelectTrigger
              id={`${id}-semester`}
              aria-label={t("semester")}
              className="w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEMESTER_VALUES.map((value) => (
                <SelectItem value={value} key={value}>
                  {t(`semesters.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor={`${id}-pass`}>{t("passRateFilter")}</Label>
          <Select
            value={band}
            onValueChange={(value) => setBand(value as Band)}
          >
            <SelectTrigger
              id={`${id}-pass`}
              aria-label={t("passRateFilter")}
              className="w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {bands.map((value) => (
                <SelectItem value={value} key={value}>
                  {t(`bands.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <HelpNote title={t("guideTitle")}>
        <p>{t("guide")}</p>
      </HelpNote>
      {academicYear && query.isPending && (
        <p
          role="status"
          className="rounded-xl border p-4 text-sm text-muted-foreground"
        >
          {t("loading")}
        </p>
      )}
      {query.isError && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-danger/30 p-4 text-sm"
        >
          <p>{t("error")}</p>
          <Button variant="outline" size="sm" onClick={() => query.refetch()}>
            {t("retry")}
          </Button>
        </div>
      )}
      {query.isSuccess && (
        <ControlDashboardResults
          key={`${academicYear}/${semester}/${band}`}
          courses={courses}
          exam={exam}
          onExamChange={setExam}
          filtered={band !== "all"}
        />
      )}
    </section>
  );
}

function ControlDashboardResults({
  courses,
  exam,
  onExamChange,
  filtered,
}: {
  courses: Course[];
  exam: Exam;
  onExamChange: (exam: Exam) => void;
  filtered: boolean;
}) {
  const t = useTranslations("controlDashboard");
  const locale = useLocale();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState<CourseLevel | "all">("all");
  const levelCourses =
    level === "all"
      ? courses
      : courses.filter((course) => course.level === level);
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const percent = new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 1,
  });
  const rate = (value: number | null) =>
    value === null ? "—" : percent.format(value / 100);
  const examLabel = t(`exams.${exam}`);
  const counts = levelCourses.reduce(
    (total, row) => {
      const sample = row.exams?.[exam]?.passRate;
      return {
        courses: total.courses + (row.recorded > 0 ? 1 : 0),
        recorded: total.recorded + row.recorded,
        results: total.results + row.results,
        passed: total.passed + (sample?.passed ?? 0),
        eligible: total.eligible + (sample?.total ?? 0),
        banned: total.banned + (sample?.bannedCount ?? 0),
      };
    },
    { courses: 0, recorded: 0, results: 0, passed: 0, eligible: 0, banned: 0 },
  );
  const chartRecords = levelCourses
    .filter((row) => row.recorded > 0)
    .sort((a, b) => b.recorded - a.recorded)
    .slice(0, 8);
  const chartResults = levelCourses
    .flatMap((row) => {
      const sample = row.exams?.[exam]?.passRate;
      const value = courseRate(row, exam);
      return sample && value !== null
        ? [{ ...row, eligible: sample.total, rate: value }]
        : [];
    })
    .sort((a, b) => b.eligible - a.eligible)
    .slice(0, 8);
  const term = search.trim().toLocaleLowerCase(locale);
  const visibleCourses = term
    ? levelCourses.filter((course) =>
        [course.code, course.name, course.nameAr, course.nameEn].some((value) =>
          value?.toLocaleLowerCase(locale).includes(term),
        ),
      )
    : levelCourses;
  const pages = Math.max(1, Math.ceil(visibleCourses.length / pageSize));
  const currentPage = Math.min(page, pages);
  const emptyMessage = courses.length
    ? t(levelCourses.length ? "noSearchMatches" : "noLevelCourses")
    : t(filtered ? "noMatches" : "noCourses");

  return (
    <>
      <StatCardRow>
        <StatCard
          title={t("recordedCourses")}
          value={number.format(counts.courses)}
          icon={<BookOpen />}
          color="#22b8cf"
        />
        <StatCard
          title={t("gradeRecords")}
          value={number.format(counts.recorded)}
          icon={<ClipboardCheck />}
          color="#a78bfa"
        />
        <StatCard
          title={t("officialResults")}
          value={number.format(counts.results)}
          icon={<CheckCircle2 />}
          color="#34d399"
        />
        <StatCard
          title={t("componentPassRate", { exam: examLabel })}
          value={rate(
            counts.eligible ? (counts.passed * 100) / counts.eligible : null,
          )}
          icon={<TrendingUp />}
          color="#f59e0b"
        />
      </StatCardRow>
      <div className="grid gap-4 xl:grid-cols-2">
        <CourseChart
          exam={exam}
          icon={<ClipboardCheck className="size-4" />}
          title={t("recordsChart")}
          description={t("recordsChartHint")}
          empty={t("noRecords")}
          rows={chartRecords}
          dataKey="recorded"
          format={number.format}
          color="#22b8cf"
        />
        <CourseChart
          exam={exam}
          icon={<TrendingUp className="size-4" />}
          title={t("ratesChart", { exam: examLabel })}
          description={t("ratesChartHint")}
          empty={t("noResults")}
          rows={chartResults}
          dataKey="rate"
          format={rate}
          color="#34d399"
          percentage
          controls={
            <Select
              value={exam}
              onValueChange={(value) => onExamChange(value as Exam)}
            >
              <SelectTrigger
                aria-label={t("component")}
                className="w-auto min-w-28"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent dir={locale === "ar" ? "rtl" : "ltr"}>
                {exams.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`exams.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
      </div>
      <ExamOutcomesChart examLabel={examLabel} counts={counts} />
      <div className="rounded-2xl border border-border/70 bg-card/80 pb-2">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <BookOpen className="size-4 text-primary" aria-hidden="true" />
            {t("courseDetails")}
          </h3>
          <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-[10rem_14rem]">
            <Select
              value={level}
              onValueChange={(value) => {
                setLevel(value as CourseLevel | "all");
                setPage(1);
              }}
            >
              <SelectTrigger aria-label={t("levelFilter")} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent dir={locale === "ar" ? "rtl" : "ltr"}>
                <SelectItem value="all">{t("allLevels")}</SelectItem>
                {COURSE_LEVEL_VALUES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t("courseLevel", { level: value })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative">
              <Search
                className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                aria-label={t("searchCourses")}
                placeholder={t("searchCourses")}
                className="ps-9"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-start">{t("course")}</TableHead>
              <TableHead className="text-start">
                <span className="flex items-center gap-1.5 whitespace-nowrap">
                  <UsersRound className="size-3.5" aria-hidden="true" />
                  {t("registered")}
                </span>
              </TableHead>
              <TableHead className="text-start">
                <span className="flex items-center gap-1.5 whitespace-nowrap">
                  <ClipboardCheck className="size-3.5" aria-hidden="true" />
                  {t("gradeRecords")}
                </span>
              </TableHead>
              <TableHead className="whitespace-nowrap text-start">
                {t("publicationStatus")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!visibleCourses.length && (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="py-6 text-center text-muted-foreground"
                >
                  <span role="status">{emptyMessage}</span>
                </TableCell>
              </TableRow>
            )}
            {visibleCourses
              .slice((currentPage - 1) * pageSize, currentPage * pageSize)
              .map((row) => {
                const published = row.exams?.[exam]?.published;
                return (
                  <TableRow key={row.courseId}>
                    <TableCell>
                      <div className="flex items-start gap-2">
                        <bdi
                          dir="ltr"
                          className="rounded-md bg-primary/10 px-1.5 py-0.5 font-mono text-xs text-primary"
                        >
                          {row.code}
                        </bdi>
                        <div className="min-w-24">
                          <p className="font-medium">
                            {localizedCourseName(row, locale)}
                          </p>
                          {row.level && (
                            <p className="text-xs text-muted-foreground">
                              {t("courseLevel", { level: row.level })}
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {number.format(row.rosterCount)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {number.format(row.recorded)}
                    </TableCell>
                    <TableCell>
                      {published === undefined ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span
                          className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-xs ${published ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}
                        >
                          {published ? (
                            <CheckCircle2
                              className="size-3.5"
                              aria-hidden="true"
                            />
                          ) : (
                            <EyeOff className="size-3.5" aria-hidden="true" />
                          )}
                          {t(published ? "published" : "notPublished")}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
        {pages > 1 && (
          <div className="flex flex-wrap items-center justify-end gap-2 px-4 pt-2">
            <Button
              size="sm"
              variant="outline"
              disabled={currentPage <= 1}
              onClick={() => setPage(currentPage - 1)}
            >
              {t("previous")}
            </Button>
            <span className="text-xs text-muted-foreground">
              {t("page", { current: currentPage, total: pages })}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={currentPage >= pages}
              onClick={() => setPage(currentPage + 1)}
            >
              {t("next")}
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

function ExamOutcomesChart({
  examLabel,
  counts: { passed, eligible, banned },
}: {
  examLabel: string;
  counts: { passed: number; eligible: number; banned: number };
}) {
  const t = useTranslations("controlDashboard");
  const locale = useLocale();
  const number = new Intl.NumberFormat(locale);
  const percent = new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 1,
  });
  const outcomes = [
    { name: t("outcomes.passed"), value: passed, fill: "#34d399" },
    {
      name: t("outcomes.belowThreshold"),
      value: eligible - passed - banned,
      fill: "#f59e0b",
    },
    { name: t("outcomes.banned"), value: banned, fill: "#a78bfa" },
  ];

  return (
    <figure className="min-w-0 rounded-2xl border border-border/70 bg-card/80 p-4">
      <figcaption className="flex items-center gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <PieChartIcon className="size-4" aria-hidden="true" />
        </span>
        <div>
          <h3 className="text-sm font-semibold">
            {t("outcomesChart", { exam: examLabel })}
          </h3>
          <p className="text-xs text-muted-foreground">{t("outcomesHint")}</p>
        </div>
      </figcaption>
      {eligible > 0 ? (
        <div className="mt-3 grid items-center gap-3 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-6">
          <div className="relative mx-auto size-44">
            <div aria-hidden="true" dir="ltr">
              <PieChart width={176} height={176} accessibilityLayer={false}>
                <Pie
                  data={outcomes}
                  dataKey="value"
                  innerRadius={56}
                  outerRadius={82}
                  startAngle={90}
                  endAngle={-270}
                  stroke="var(--card)"
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              </PieChart>
            </div>
            <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
              <p className="text-xl font-bold tabular-nums">
                {number.format(eligible)}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("eligibleOutcomes")}
              </p>
            </div>
          </div>
          <dl className="grid gap-2 lg:grid-cols-3">
            {outcomes.map(({ name, value, fill }) => (
              <div
                key={name}
                className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5 lg:flex-col lg:items-start lg:justify-center"
              >
                <dt className="flex items-center gap-2 text-sm">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: fill }}
                    aria-hidden="true"
                  />
                  {name}
                </dt>
                <dd className="flex flex-wrap items-center justify-end gap-x-3 text-sm tabular-nums">
                  <bdi className="font-semibold">{number.format(value)}</bdi>
                  <bdi className="min-w-12 text-end text-muted-foreground">
                    {percent.format(value / eligible)}
                  </bdi>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : (
        <p className="grid min-h-28 place-items-center text-center text-sm text-muted-foreground">
          {t("noResults")}
        </p>
      )}
    </figure>
  );
}

function CourseChart({
  exam,
  icon,
  title,
  description,
  empty,
  rows,
  dataKey,
  format,
  color,
  percentage,
  controls,
}: {
  exam: Exam;
  icon: ReactNode;
  title: string;
  description: string;
  empty: string;
  rows: Array<Course & { rate?: number }>;
  dataKey: "recorded" | "rate";
  format: (value: number) => string;
  color: string;
  percentage?: boolean;
  controls?: ReactNode;
}) {
  const t = useTranslations("controlDashboard");
  const locale = useLocale();
  const number = new Intl.NumberFormat(locale);
  const percent = new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 1,
  });
  const labels = new Map(
    rows.map((row) => {
      const name = localizedCourseName(row, locale);
      const shortened = name.length > 15 ? `${name.slice(0, 14)}…` : name;
      return [row.code, `${row.code} · ${shortened}`];
    }),
  );
  return (
    <figure className="min-w-0 rounded-2xl border border-border/70 bg-card/80 p-4">
      <figcaption className="mb-3 flex min-h-9 flex-wrap items-center justify-between gap-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"
            aria-hidden="true"
          >
            {icon}
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">{title}</h3>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        {controls && <div className="shrink-0">{controls}</div>}
      </figcaption>
      {!rows.length ? (
        <p className="grid h-48 place-items-center text-center text-sm text-muted-foreground">
          {empty}
        </p>
      ) : (
        <div
          className="min-w-0"
          style={{ height: Math.max(208, rows.length * 34 + 36) }}
          dir="ltr"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={rows}
              layout="vertical"
              accessibilityLayer
              margin={{ top: 2, right: 12, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                horizontal={false}
                strokeDasharray="4 4"
                stroke="var(--border)"
              />
              <XAxis
                type="number"
                domain={percentage ? [0, 100] : [0, "auto"]}
                tickCount={5}
                allowDecimals={false}
                tickFormatter={format}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              />
              <YAxis
                type="category"
                dataKey="code"
                interval={0}
                width={126}
                tickLine={false}
                tickFormatter={(code) =>
                  labels.get(String(code)) ?? String(code)
                }
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              />
              <Tooltip
                cursor={{ fill: "var(--muted)", fillOpacity: 0.5 }}
                content={({ active, payload }) => {
                  const course = payload?.[0]?.payload as Course | undefined;
                  if (!active || !course) return null;
                  const rate = courseRate(course, exam);
                  const sample = course.exams?.[exam]?.passRate;
                  return (
                    <div
                      dir={locale === "ar" ? "rtl" : "ltr"}
                      className="max-w-56 rounded-xl border bg-popover p-3 text-xs shadow-lg"
                    >
                      <p className="mb-2 flex flex-wrap items-baseline gap-1.5 font-semibold">
                        <bdi dir="ltr" className="text-primary">
                          {course.code}
                        </bdi>
                        {localizedCourseName(course, locale)}
                      </p>
                      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 tabular-nums">
                        <dt className="text-muted-foreground">
                          {t("registered")}
                        </dt>
                        <dd>{number.format(course.rosterCount)}</dd>
                        <dt className="text-muted-foreground">
                          {t("gradeRecords")}
                        </dt>
                        <dd>{number.format(course.recorded)}</dd>
                        <dt className="text-muted-foreground">
                          {t("passRate")}
                        </dt>
                        <dd>
                          {rate === null ? "—" : percent.format(rate / 100)}
                        </dd>
                      </dl>
                      {rate !== null && sample && (
                        <p className="mt-2 border-t pt-2 text-muted-foreground">
                          {t("passingOutcomes", {
                            passed: sample.passed,
                            total: sample.total,
                          })}
                          <br />
                          {t("passThreshold", { threshold: sample.threshold })}
                        </p>
                      )}
                    </div>
                  );
                }}
              />
              <Bar
                dataKey={dataKey}
                maxBarSize={20}
                radius={[0, 5, 5, 0]}
                fill={color}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </figure>
  );
}
