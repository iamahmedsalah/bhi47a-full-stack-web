"use client";

import { memo, useCallback, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Circle,
  GitBranch,
  LockKeyhole,
  Minus,
  Plus,
  Search,
  Sparkles,
  X,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CustomDropdown } from "@/components/ui/custom-dropdown";

export type CourseProgressStatus =
  | "passed"
  | "failed"
  | "low_grade"
  | "planned"
  | "recommended"
  | "not_taken";

export interface CourseGradeSummary {
  totalGrade: number;
  totalMaxGrade: number;
  percentage: number;
  hasFinal: boolean;
  gradePoints?: number;
  exams: Array<{
    examType: string;
    grade: number;
    maxGrade: number;
    status: string;
  }>;
}

export interface CourseMapCourse {
  _id?: string;
  code: string;
  name: string;
  nameAr?: string;
  nameEn?: string;
  academicLevel?: string;
  level?: string;
  semester?: string;
  department?: string;
  creditHours?: number;
  prerequisites?: string[];
  offeredTerms?: string[];
  type?: string;
  progressStatus?: CourseProgressStatus;
  gradeSummary?: CourseGradeSummary;
}

interface CourseMapFlowProps {
  courses: CourseMapCourse[];
  locale: string;
  selectedCodes?: string[];
  suggestedCodes?: string[];
  completedCodes?: string[];
  failedCodes?: string[];
  selectableCodes?: string[];
  onToggleCourse?: (code: string) => void;
  readonly?: boolean;
  studentName?: string;
  studentCode?: string;
  gpa?: number;
  currentSemester?: string;
}

type CanvasFilter = "all" | "available" | "planned" | "attention";

interface CourseNodeData extends Record<string, unknown> {
  course: CourseMapCourse;
  title: string;
  status: CourseProgressStatus;
  statusLabel: string;
  selectedForPlan: boolean;
  selectable: boolean;
  readonly: boolean;
  isEnglish: boolean;
  onToggle?: (code: string) => void;
}

interface TermNodeData extends Record<string, unknown> {
  label: string;
  courseCount: number;
  current: boolean;
  isEnglish: boolean;
}

interface LevelNodeData extends Record<string, unknown> {
  label: string;
}

type CourseFlowNode = Node<CourseNodeData, "course">;
type TermFlowNode = Node<TermNodeData, "term">;
type LevelFlowNode = Node<LevelNodeData, "level">;
type AdvisingFlowNode = CourseFlowNode | TermFlowNode | LevelFlowNode;

const NODE_WIDTH = 276;
const NODE_HEIGHT = 126;
const ROW_GAP = 26;
const SEMESTER_BRANCH_GAP = 190;
const LEVEL_COLUMN_GAP = 180;
const SEMESTERS = ["first", "second", "summer"];

const STATUS_STYLES: Record<
  CourseProgressStatus,
  { border: string; bg: string; text: string; dot: string }
> = {
  passed: {
    border: "border-emerald-400/55",
    bg: "bg-emerald-500/10",
    text: "text-emerald-200",
    dot: "#34d399",
  },
  failed: {
    border: "border-red-400/60",
    bg: "bg-red-500/10",
    text: "text-red-200",
    dot: "#f87171",
  },
  low_grade: {
    border: "border-amber-400/60",
    bg: "bg-amber-500/10",
    text: "text-amber-200",
    dot: "#fbbf24",
  },
  planned: {
    border: "border-sky-400/70",
    bg: "bg-sky-500/15",
    text: "text-sky-100",
    dot: "#38bdf8",
  },
  recommended: {
    border: "border-violet-400/60",
    bg: "bg-violet-500/10",
    text: "text-violet-200",
    dot: "#a78bfa",
  },
  not_taken: {
    border: "border-white/15",
    bg: "bg-card/95",
    text: "text-muted-foreground",
    dot: "#64748b",
  },
};

function normalizeCode(code: string) {
  return code.trim().toUpperCase();
}

function getCourseTitle(course: CourseMapCourse, isEnglish: boolean) {
  return isEnglish
    ? (course.nameEn ?? course.name)
    : (course.nameAr ?? course.name);
}

function getStatusLabel(status: CourseProgressStatus, isEnglish: boolean) {
  const labels: Record<CourseProgressStatus, { en: string; ar: string }> = {
    passed: { en: "Passed", ar: "ناجح" },
    failed: { en: "Failed", ar: "راسب" },
    low_grade: { en: "Low grade", ar: "تقدير منخفض" },
    planned: { en: "In plan", ar: "ضمن الخطة" },
    recommended: { en: "Recommended", ar: "موصى به" },
    not_taken: { en: "Not taken", ar: "لم يدرس" },
  };
  return isEnglish ? labels[status].en : labels[status].ar;
}

function getSemesterLabel(semester: string, isEnglish: boolean) {
  const labels: Record<string, { en: string; ar: string }> = {
    first: { en: "First semester", ar: "الفصل الأول" },
    second: { en: "Second semester", ar: "الفصل الثاني" },
    summer: { en: "Summer", ar: "الفصل الصيفي" },
  };
  return isEnglish
    ? (labels[semester]?.en ?? semester)
    : (labels[semester]?.ar ?? semester);
}

function getEffectiveStatus(
  course: CourseMapCourse,
  selected: Set<string>,
  suggested: Set<string>,
  completed: Set<string>,
  failed: Set<string>,
): CourseProgressStatus {
  const code = normalizeCode(course.code);
  if (completed.has(code)) return "passed";
  if (failed.has(code)) return "failed";
  if (selected.has(code)) return "planned";
  if (course.progressStatus === "low_grade") return "low_grade";
  if (suggested.has(code)) return "recommended";
  return course.progressStatus ?? "not_taken";
}

function renderStatusIcon(status: CourseProgressStatus) {
  const className = "h-3 w-3";
  if (status === "passed") return <CheckCircle2 className={className} />;
  if (status === "failed") return <XCircle className={className} />;
  if (status === "low_grade") return <AlertTriangle className={className} />;
  if (status === "planned") return <Check className={className} />;
  if (status === "recommended") return <Sparkles className={className} />;
  return <Circle className={className} />;
}

const CourseNode = memo(function CourseNode({
  data,
  selected,
}: NodeProps<CourseFlowNode>) {
  const {
    course,
    title,
    status,
    statusLabel,
    selectedForPlan,
    selectable,
    readonly,
    isEnglish,
    onToggle,
  } = data;
  const style = STATUS_STYLES[status];
  const canToggle = selectable && !readonly && Boolean(onToggle);

  return (
    <div
      dir={isEnglish ? "ltr" : "rtl"}
      className={cn(
        "relative h-[126px] w-[276px] overflow-hidden rounded-squircle border text-start shadow-xl shadow-black/15 transition-all",
        style.border,
        style.bg,
        selected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2.5 !w-2.5 !border-2 !border-background !bg-muted-foreground"
      />
      <div className="flex h-full flex-col p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-xs font-black tracking-wide text-primary-light">
                {course.code}
              </span>
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border border-current/15 bg-black/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide",
                  style.text,
                )}
              >
                {renderStatusIcon(status)}
                {statusLabel}
              </span>
            </div>
            <p className="mt-2 line-clamp-2 text-xs font-bold leading-5 text-foreground">
              {title}
            </p>
          </div>
          {canToggle ? (
            <button
              type="button"
              className={cn(
                "nodrag nopan grid h-8 w-8 shrink-0 place-items-center rounded-squircle border transition",
                selectedForPlan
                  ? "border-sky-400/50 bg-sky-400/20 text-sky-100 hover:bg-sky-400/30"
                  : "border-white/15 bg-white/5 text-muted-foreground hover:border-primary/60 hover:text-primary-light",
              )}
              onClick={(event) => {
                event.stopPropagation();
                onToggle?.(course.code);
              }}
              aria-label={
                selectedForPlan
                  ? isEnglish
                    ? `Remove ${course.code} from plan`
                    : `إزالة ${course.code} من الخطة`
                  : isEnglish
                    ? `Add ${course.code} to plan`
                    : `إضافة ${course.code} إلى الخطة`
              }
            >
              {selectedForPlan ? (
                <Minus className="h-4 w-4" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
            </button>
          ) : status !== "passed" ? (
            <div
              className="grid h-8 w-8 shrink-0 place-items-center rounded-squircle border border-white/10 bg-black/10 text-muted-foreground"
              title={
                readonly
                  ? isEnglish
                    ? "Plan is read only"
                    : "الخطة للقراءة فقط"
                  : isEnglish
                    ? "Prerequisites or offering term not satisfied"
                    : "المتطلبات أو فصل الطرح غير مستوفى"
              }
            >
              <LockKeyhole className="h-3.5 w-3.5" />
            </div>
          ) : null}
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-white/10 pt-2 text-[10px] text-muted-foreground">
          <span>{course.creditHours ?? 0} {isEnglish ? "credits" : "ساعات"}</span>
          {course.gradeSummary?.percentage != null ? (
            <strong className={style.text}>{course.gradeSummary.percentage}%</strong>
          ) : course.prerequisites?.length ? (
            <span className="inline-flex max-w-[165px] items-center gap-1 truncate">
              <GitBranch className="h-3 w-3 shrink-0" />
              {course.prerequisites.join(", ")}
            </span>
          ) : (
            <span>{isEnglish ? "No prerequisites" : "بلا متطلبات"}</span>
          )}
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2.5 !w-2.5 !border-2 !border-background !bg-primary"
      />
    </div>
  );
});

const TermNode = memo(function TermNode({ data }: NodeProps<TermFlowNode>) {
  return (
    <div
      dir={data.isEnglish ? "ltr" : "rtl"}
      className={cn(
        "relative flex h-12 w-[276px] items-center justify-between rounded-squircle border border-white/10 bg-secondary/50 px-4 text-start shadow-lg backdrop-blur",
        data.current && "border-primary/50 bg-primary/15",
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-2 !w-2 !border-2 !border-background !bg-primary"
      />
      <span className="text-xs font-black uppercase tracking-wide text-foreground">
        {data.label}
      </span>
      <span className="rounded-full bg-black/20 px-2 py-1 font-mono text-[10px] text-muted-foreground">
        {data.courseCount}
      </span>
    </div>
  );
});

const LevelNode = memo(function LevelNode({ data }: NodeProps<LevelFlowNode>) {
  return (
    <div className="relative grid h-11 w-40 place-items-center rounded-squircle border border-primary/50 bg-primary px-5 text-xs font-black text-primary-foreground shadow-[0_10px_35px_rgba(14,165,233,0.25)]">
      {data.label}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-2.5 !w-2.5 !border-2 !border-background !bg-primary-light"
      />
    </div>
  );
});

const nodeTypes = { course: CourseNode, term: TermNode, level: LevelNode };

export function CourseMapFlow({
  courses,
  locale,
  selectedCodes = [],
  suggestedCodes = [],
  completedCodes = [],
  failedCodes = [],
  selectableCodes = [],
  onToggleCourse,
  readonly = false,
  studentName,
  studentCode,
  gpa,
  currentSemester,
}: CourseMapFlowProps) {
  const isEnglish = locale === "en";
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CanvasFilter>("all");
  const [levelView, setLevelView] = useState("all");
  const [semesterView, setSemesterView] = useState("all");
  const [focusedCourseCode, setFocusedCourseCode] = useState<string>();

  const selected = useMemo(
    () => new Set(selectedCodes.map(normalizeCode)),
    [selectedCodes],
  );
  const suggested = useMemo(
    () => new Set(suggestedCodes.map(normalizeCode)),
    [suggestedCodes],
  );
  const completed = useMemo(
    () => new Set(completedCodes.map(normalizeCode)),
    [completedCodes],
  );
  const failed = useMemo(
    () => new Set(failedCodes.map(normalizeCode)),
    [failedCodes],
  );
  const selectable = useMemo(
    () => new Set(selectableCodes.map(normalizeCode)),
    [selectableCodes],
  );

  const normalizedCourses = useMemo(
    () =>
      courses
        .filter((course) => course.code)
        .map((course) => ({ ...course, code: normalizeCode(course.code) })),
    [courses],
  );

  const statusByCode = useMemo(
    () =>
      new Map(
        normalizedCourses.map((course) => [
          course.code,
          getEffectiveStatus(course, selected, suggested, completed, failed),
        ]),
      ),
    [completed, failed, normalizedCourses, selected, suggested],
  );

  const terms = useMemo(() => {
    const keys = new Set(
      normalizedCourses.map((course) => {
        const level = course.academicLevel ?? course.level ?? "1";
        return `${level}:${course.semester ?? "first"}`;
      }),
    );
    return [...keys]
      .map((key) => {
        const [level, semester] = key.split(":");
        return { key, level, semester };
      })
      .sort((a, b) => {
        const levelDifference = Number(a.level) - Number(b.level);
        if (levelDifference) return levelDifference;
        return SEMESTERS.indexOf(a.semester) - SEMESTERS.indexOf(b.semester);
      });
  }, [normalizedCourses]);

  const visibleCourseCodes = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase(locale);
    return new Set(
      normalizedCourses
        .filter((course) => {
          const status = statusByCode.get(course.code) ?? "not_taken";
          const matchesQuery =
            !normalizedQuery ||
            course.code.toLocaleLowerCase(locale).includes(normalizedQuery) ||
            getCourseTitle(course, isEnglish)
              .toLocaleLowerCase(locale)
              .includes(normalizedQuery);
          const matchesFilter =
            filter === "all" ||
            (filter === "available" && selectable.has(course.code)) ||
            (filter === "planned" && selected.has(course.code)) ||
            (filter === "attention" &&
              (status === "failed" || status === "low_grade"));
          const courseLevel = course.academicLevel ?? course.level ?? "1";
          const matchesLevel = levelView === "all" || courseLevel === levelView;
          const matchesSemester =
            semesterView === "all" || (course.semester ?? "first") === semesterView;
          return matchesQuery && matchesFilter && matchesLevel && matchesSemester;
        })
        .map((course) => course.code),
    );
  }, [filter, isEnglish, levelView, locale, normalizedCourses, query, selectable, selected, semesterView, statusByCode]);

  const graph = useMemo(() => {
    const nodes: AdvisingFlowNode[] = [];
    const nodeIdByCode = new Map<string, string>();
    const edges: Edge[] = [];
    const levels = [...new Set(terms.map((term) => term.level))].sort(
      (a, b) => Number(a) - Number(b),
    );
    const branchWidth = NODE_WIDTH * 2 + SEMESTER_BRANCH_GAP;
    const leftColumnX = 0;
    const rightColumnX = NODE_WIDTH + SEMESTER_BRANCH_GAP;
    levels.forEach((level, levelIndex) => {
      const levelX = levelIndex * (branchWidth + LEVEL_COLUMN_GAP);
      const termGroups = SEMESTERS.map((semester) => ({
        semester,
        courses: normalizedCourses
          .filter((course) => {
            const courseLevel = course.academicLevel ?? course.level ?? "1";
            return courseLevel === level && (course.semester ?? "first") === semester;
          })
          .filter((course) => visibleCourseCodes.has(course.code))
          .sort((a, b) => a.code.localeCompare(b.code)),
      })).filter((group) => group.courses.length > 0);

      if (!termGroups.length) return;

      const levelId = `level-${level}`;
      nodes.push({
        id: levelId,
        type: "level",
        position: { x: levelX + (branchWidth - 160) / 2, y: 0 },
        data: { label: `${isEnglish ? "Level" : "المستوى"} ${level}` },
        draggable: false,
        selectable: false,
      });

      termGroups.forEach((group) => {
        const branchX =
          group.semester === "summer"
            ? (branchWidth - NODE_WIDTH) / 2
            : group.semester === "first"
              ? isEnglish
                ? leftColumnX
                : rightColumnX
              : isEnglish
                ? rightColumnX
                : leftColumnX;
        const x = levelX + branchX;
        const termId = `term-${level}:${group.semester}`;

        nodes.push({
          id: termId,
          type: "term",
          position: { x, y: 76 },
          data: {
            label: getSemesterLabel(group.semester, isEnglish),
            courseCount: group.courses.length,
            current: group.semester === currentSemester,
            isEnglish,
          },
          draggable: false,
          selectable: false,
        });
        edges.push({
          id: `${levelId}-${termId}`,
          source: levelId,
          target: termId,
          type: "smoothstep",
          style: {
            stroke: "#38bdf8",
            strokeDasharray: "5 5",
            strokeWidth: 1.5,
            opacity: 0.65,
          },
        });

        group.courses.forEach((course, rowIndex) => {
          const status = statusByCode.get(course.code) ?? "not_taken";
          const id = `course-${course.code}`;
          nodeIdByCode.set(course.code, id);
          nodes.push({
            id,
            type: "course",
            position: {
              x,
              y: 148 + rowIndex * (NODE_HEIGHT + ROW_GAP),
            },
            data: {
              course,
              title: getCourseTitle(course, isEnglish),
              status,
              statusLabel: getStatusLabel(status, isEnglish),
              selectedForPlan: selected.has(course.code),
              selectable: selectable.has(course.code),
              readonly,
              isEnglish,
              onToggle: onToggleCourse,
            },
            draggable: false,
          });
        });
      });

    });

    normalizedCourses.forEach((course) => {
      const target = nodeIdByCode.get(course.code);
      if (!target) return;
      (course.prerequisites ?? []).forEach((prerequisite) => {
        const prerequisiteCode = normalizeCode(prerequisite);
        const source = nodeIdByCode.get(prerequisiteCode);
        if (!source) return;
        const connectedToFocus =
          focusedCourseCode === course.code ||
          focusedCourseCode === prerequisiteCode;
        const prerequisitePassed = completed.has(prerequisiteCode);
        edges.push({
          id: `${source}-${target}`,
          source,
          target,
          type: "smoothstep",
          animated: connectedToFocus && !prerequisitePassed,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: connectedToFocus
              ? "#38bdf8"
              : prerequisitePassed
                ? "#34d399"
                : "#64748b",
          },
          style: {
            stroke: connectedToFocus
              ? "#38bdf8"
              : prerequisitePassed
                ? "#34d399"
                : "#64748b",
            strokeWidth: connectedToFocus ? 2.5 : 1.5,
            opacity: focusedCourseCode && !connectedToFocus ? 0.18 : 0.75,
          },
        });
      });
    });

    return { nodes, edges };
  }, [
    completed,
    currentSemester,
    focusedCourseCode,
    isEnglish,
    normalizedCourses,
    onToggleCourse,
    readonly,
    selectable,
    selected,
    statusByCode,
    terms,
    visibleCourseCodes,
  ]);

  const stats = useMemo(
    () =>
      normalizedCourses.reduce(
        (accumulator, course) => {
          const status = statusByCode.get(course.code) ?? "not_taken";
          accumulator.total += 1;
          if (status === "passed") accumulator.passed += 1;
          if (status === "failed") accumulator.failed += 1;
          if (selected.has(course.code)) accumulator.planned += 1;
          return accumulator;
        },
        { total: 0, passed: 0, failed: 0, planned: 0 },
      ),
    [normalizedCourses, selected, statusByCode],
  );

  const focusedCourse = focusedCourseCode
    ? normalizedCourses.find((course) => course.code === focusedCourseCode)
    : undefined;

  const handleNodeClick = useCallback((_: React.MouseEvent, node: AdvisingFlowNode) => {
    if (node.type === "course") setFocusedCourseCode(node.data.course.code);
  }, []);

  if (!courses.length) {
    return (
      <div className="flex min-h-80 items-center justify-center rounded-squircle border border-dashed border-border bg-secondary/20 text-sm text-muted-foreground">
        {isEnglish
          ? "No courses are available for this academic map yet."
          : "لا توجد مقررات متاحة للخريطة الدراسية حتى الآن."}
      </div>
    );
  }

  const filters: Array<{ value: CanvasFilter; en: string; ar: string }> = [
    { value: "all", en: "All courses", ar: "كل المقررات" },
    { value: "available", en: "Available now", ar: "المتاح الآن" },
    { value: "planned", en: "In plan", ar: "ضمن الخطة" },
    { value: "attention", en: "Needs attention", ar: "يحتاج متابعة" },
  ];

  return (
    <section
      dir={isEnglish ? "ltr" : "rtl"}
      className="overflow-hidden rounded-3xl border border-white/10 bg-background text-start shadow-2xl shadow-black/10"
    >
      <header className="border-b border-white/10 bg-card/80 p-4 backdrop-blur">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary-light">
              {isEnglish ? "Interactive degree map" : "الخريطة الدراسية التفاعلية"}
            </p>
            <h3 className="mt-1 truncate text-base font-black text-foreground">
              {studentName ?? (isEnglish ? "Selected student" : "الطالب المحدد")}
              {studentCode ? (
                <span className="ms-2 font-mono text-xs font-medium text-muted-foreground">
                  {studentCode}
                </span>
              ) : null}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {isEnglish
                ? "Follow prerequisite arrows, inspect a course, then add eligible courses to the plan."
                : "تتبّع أسهم المتطلبات، وافحص المقرر، ثم أضف المقررات المؤهلة إلى الخطة."}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
            <Metric label={isEnglish ? "GPA" : "المعدل"} value={gpa?.toFixed(2) ?? "—"} />
            <Metric label={isEnglish ? "Passed" : "ناجح"} value={stats.passed} tone="emerald" />
            <Metric label={isEnglish ? "Failed" : "راسب"} value={stats.failed} tone="red" />
            <Metric label={isEnglish ? "Plan" : "الخطة"} value={stats.planned} tone="sky" />
            <Metric label={isEnglish ? "Total" : "الإجمالي"} value={stats.total} />
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-xs">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={isEnglish ? "Find a course or code" : "ابحث باسم المقرر أو الكود"}
              className="h-10 w-full rounded-squircle border border-white/10 bg-background/60 ps-9 pe-9 text-start text-xs text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute end-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-squircle text-muted-foreground hover:text-foreground"
                aria-label={isEnglish ? "Clear search" : "مسح البحث"}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={isEnglish ? "Filter courses" : "تصفية المقررات"}>
            <div className="w-36">
              <CustomDropdown
                value={levelView}
                onValueChange={setLevelView}
                ariaLabel={isEnglish ? "Filter by level" : "تصفية حسب المستوى"}
                className="h-8 border-white/10 bg-background/70 text-[10px] font-bold"
                options={[
                  { value: "all", label: isEnglish ? "All levels" : "كل المستويات" },
                  ...[...new Set(normalizedCourses.map((course) => course.academicLevel ?? course.level ?? "1"))]
                    .sort((a, b) => Number(a) - Number(b))
                    .map((level) => ({ value: level, label: isEnglish ? `Level ${level}` : `المستوى ${level}` })),
                ]}
              />
            </div>
            <div className="w-40">
              <CustomDropdown
                value={semesterView}
                onValueChange={setSemesterView}
                ariaLabel={isEnglish ? "Filter by semester" : "تصفية حسب الفصل"}
                className="h-8 border-white/10 bg-background/70 text-[10px] font-bold"
                options={[
                  { value: "all", label: isEnglish ? "All semesters" : "كل الفصول" },
                  ...SEMESTERS.map((semester) => ({ value: semester, label: getSemesterLabel(semester, isEnglish) })),
                ]}
              />
            </div>
            {filters.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setFilter(item.value)}
                aria-pressed={filter === item.value}
                className={cn(
                  "rounded-squircle border px-3 py-2 text-[10px] font-bold transition",
                  filter === item.value
                    ? "border-primary/60 bg-primary/20 text-primary-light"
                    : "border-white/10 bg-white/5 text-muted-foreground hover:border-white/20 hover:text-foreground",
                )}
              >
                {isEnglish ? item.en : item.ar}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="relative h-[68vh] min-h-[540px] bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.08),_transparent_35%)]">
        {graph.nodes.some((node) => node.type === "course") ? (
          <ReactFlow<AdvisingFlowNode, Edge>
            nodes={graph.nodes}
            edges={graph.edges}
            nodeTypes={nodeTypes}
            onNodeClick={handleNodeClick}
            onPaneClick={() => setFocusedCourseCode(undefined)}
            fitView
            fitViewOptions={{ padding: 0.16, maxZoom: 0.92 }}
            minZoom={0.25}
            maxZoom={1.6}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
            colorMode="dark"
            aria-label={isEnglish ? "Interactive student course prerequisite map" : "خريطة متطلبات مقررات الطالب التفاعلية"}
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} color="rgba(148, 163, 184, 0.16)" />
            <Controls position={isEnglish ? "bottom-left" : "bottom-right"} showInteractive={false} />
            <MiniMap
              position={isEnglish ? "bottom-right" : "bottom-left"}
              pannable
              zoomable
              maskColor="rgba(8, 28, 36, 0.76)"
              nodeColor={(node) => {
                if (node.type === "term") return "#365766";
                const status = (node.data as CourseNodeData).status;
                return STATUS_STYLES[status].dot;
              }}
            />
            <Panel position="top-right" className="!m-3">
              <div className="hidden rounded-squircle border border-white/10 bg-background/90 p-2 text-[9px] text-muted-foreground shadow-xl backdrop-blur md:flex md:flex-wrap md:gap-2">
                {(["passed", "planned", "recommended", "failed", "not_taken"] as CourseProgressStatus[]).map((status) => (
                  <span key={status} className="inline-flex items-center gap-1.5">
                    <i className="h-2 w-2 rounded-full" style={{ background: STATUS_STYLES[status].dot }} />
                    {getStatusLabel(status, isEnglish)}
                  </span>
                ))}
              </div>
            </Panel>
          </ReactFlow>
        ) : (
          <div className="grid h-full place-items-center p-8 text-center text-sm text-muted-foreground">
            <div>
              <Search className="mx-auto mb-3 h-8 w-8 opacity-40" />
              <p>{isEnglish ? "No courses match this view." : "لا توجد مقررات مطابقة لهذا العرض."}</p>
              <button type="button" onClick={() => { setQuery(""); setFilter("all"); }} className="mt-3 text-xs font-bold text-primary-light hover:underline">
                {isEnglish ? "Clear filters" : "مسح عوامل التصفية"}
              </button>
            </div>
          </div>
        )}

        {focusedCourse ? (
          <aside className="absolute inset-x-3 bottom-3 z-10 rounded-squircle border border-primary/25 bg-card/95 p-3 text-start shadow-2xl backdrop-blur sm:inset-x-auto sm:end-3 sm:w-[330px]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-xs font-black text-primary-light">{focusedCourse.code}</p>
                <p className="mt-1 text-xs font-bold leading-5 text-foreground">{getCourseTitle(focusedCourse, isEnglish)}</p>
              </div>
              <button type="button" onClick={() => setFocusedCourseCode(undefined)} className="grid h-7 w-7 shrink-0 place-items-center rounded-squircle text-muted-foreground hover:bg-white/10 hover:text-foreground" aria-label={isEnglish ? "Close course details" : "إغلاق تفاصيل المقرر"}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
              <span className="rounded-squircle bg-black/15 px-2 py-1">{focusedCourse.creditHours ?? 0} {isEnglish ? "credits" : "ساعات"}</span>
              <span className="rounded-squircle bg-black/15 px-2 py-1">{getStatusLabel(statusByCode.get(focusedCourse.code) ?? "not_taken", isEnglish)}</span>
              {focusedCourse.prerequisites?.length ? (
                <span className="rounded-squircle bg-black/15 px-2 py-1">{isEnglish ? "Requires" : "يتطلب"}: {focusedCourse.prerequisites.join(", ")}</span>
              ) : null}
            </div>
            {focusedCourse.gradeSummary ? (
              <div className="mt-3 rounded-squircle border border-white/10 bg-black/15 p-3">
                <div className="mb-2 flex items-center justify-between text-[10px]">
                  <span className="font-bold text-muted-foreground">
                    {isEnglish ? "Published grade details" : "تفاصيل الدرجات المنشورة"}
                  </span>
                  <strong className="text-primary-light">
                    {focusedCourse.gradeSummary.percentage}% · GPA {focusedCourse.gradeSummary.gradePoints?.toFixed(2) ?? "0.00"}
                  </strong>
                </div>
                <div className="space-y-1.5">
                  {focusedCourse.gradeSummary.exams.map((exam) => (
                    <div key={exam.examType} className="flex items-center justify-between rounded-lg bg-white/5 px-2 py-1.5 text-[10px]">
                      <span className="capitalize">{exam.examType} · {exam.status}</span>
                      <strong className="font-mono">{exam.grade} / {exam.maxGrade}</strong>
                    </div>
                  ))}
                  <div className="flex items-center justify-between border-t border-white/10 pt-2 text-[10px]">
                    <span>{isEnglish ? "Total" : "الإجمالي"}</span>
                    <strong className="font-mono">{focusedCourse.gradeSummary.totalGrade} / {focusedCourse.gradeSummary.totalMaxGrade}</strong>
                  </div>
                </div>
              </div>
            ) : null}
          </aside>
        ) : null}
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "emerald" | "red" | "sky";
}) {
  return (
    <div
      className={cn(
        "min-w-[72px] rounded-squircle border border-white/10 bg-background/45 px-3 py-2 text-start",
        tone === "emerald" && "border-emerald-400/25 bg-emerald-500/10",
        tone === "red" && "border-red-400/25 bg-red-500/10",
        tone === "sky" && "border-sky-400/25 bg-sky-500/10",
      )}
    >
      <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-mono text-sm font-black text-foreground">{value}</p>
    </div>
  );
}
