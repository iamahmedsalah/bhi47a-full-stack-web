"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Eye,
  EyeOff,
  Info,
  Trash2,
  CalendarClock,
  GraduationCap,
  Layers,
  SlidersHorizontal,
  ShieldCheck,
  Save,
  RotateCcw,
  Globe,
  BookOpen,
} from "lucide-react";
import { toast } from "sonner";
import {
  CONTROL_RESULT_EXAM_TYPES,
  type ExamType,
  type GradeVisibilityRule,
} from "@student-portal/shared";
import { useAuth } from "@/providers/auth-provider";
import { getApiErrorMessage } from "@/lib/api";
import { cairoDateTimeToIso, toCairoDateTimeLocal } from "@/lib/cairo-time";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  getGradesSettings,
  updateGradesSettings,
  type GradesSettingsData,
} from "../api";
import { ControlReleasePanel } from "./control-release-panel";

export function GradesPublishingModal({
  open,
  onOpenChange,
  isAr = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAr?: boolean;
}) {
  const { user } = useAuth();
  const canManage =
    user?.role === "admin" ||
    Boolean(user?.permissions?.includes("grades.visibility.manage"));
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["grades-settings"],
    queryFn: getGradesSettings,
    enabled: open && canManage,
  });
  const [openAt, setOpenAt] = useState("");
  const [closeAt, setCloseAt] = useState("");
  const [previous, setPrevious] = useState<GradesSettingsData>();
  const [courseCode, setCourseCode] = useState("");
  const [studentCode, setStudentCode] = useState("");
  const [examType, setExamType] = useState("midterm");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [open]);
  if (query.data && previous !== query.data) {
    setPrevious(query.data);
    setOpenAt(toCairoDateTimeLocal(query.data.gradesOpenAt ?? undefined));
    setCloseAt(toCairoDateTimeLocal(query.data.gradesCloseAt ?? undefined));
  }
  const tr = (ar: string, en: string) => (isAr ? ar : en);
  const labels: Record<string, string> = {
    all: tr("كل المكوّنات", "All components"),
    coursework: tr("أعمال السنة", "Coursework"),
    midterm: tr("الميدترم", "Midterm"),
    final: tr("النهائي", "Final"),
    quiz: tr("الاختبارات القصيرة", "Quizzes"),
    practical: tr("العملي", "Practical"),
    oral: tr("الشفوي", "Oral"),
  };
  const mutation = useMutation({
    mutationFn: (patch: Partial<GradesSettingsData>) =>
      updateGradesSettings(patch),
    onSuccess: (data) => {
      client.setQueryData(["grades-settings"], data);
      void client.invalidateQueries({ queryKey: ["student-results"] });
      void client.invalidateQueries({ queryKey: ["student-results-status"] });
      toast.success(tr("تم حفظ إتاحة النتائج", "Results visibility saved"));
    },
    onError: (error) =>
      toast.error(
        getApiErrorMessage(
          error,
          tr("تعذر حفظ الإعدادات", "Unable to save settings"),
        ),
      ),
  });
  if (!canManage) return null;
  const settings = query.data;
  const busy = mutation.isPending;
  const levels = settings?.gradesPublishedLevels ?? ["1", "2", "3", "4"];
  const types = (settings?.gradesPublishedExamTypes ?? CONTROL_RESULT_EXAM_TYPES)
    .filter((type) => CONTROL_RESULT_EXAM_TYPES.includes(type));
  const rules = (settings?.gradesVisibilityRules ?? [])
    .filter((rule) => !rule.examType || CONTROL_RESULT_EXAM_TYPES.includes(rule.examType));
  const section =
    "min-w-0 space-y-4 rounded-2xl border border-border/70 bg-card/70 p-4 sm:p-5";
  const saveWindow = () => {
    const start = openAt ? cairoDateTimeToIso(openAt) : null;
    const end = closeAt ? cairoDateTimeToIso(closeAt) : null;
    if (
      (openAt && !start) ||
      (closeAt && !end) ||
      (start && end && end <= start)
    ) {
      toast.error(
        tr(
          "أدخل مواعيد صحيحة بتوقيت القاهرة، والإغلاق بعد الفتح",
          "Enter valid Cairo times; closing must follow opening",
        ),
      );
      return;
    }
    mutation.mutate({ gradesOpenAt: start, gradesCloseAt: end });
  };
  const setRule = (isVisible: boolean) => {
    if (!courseCode.trim() && !studentCode.trim()) {
      toast.error(
        tr("أدخل كود المقرر أو الطالب", "Enter a course or student code"),
      );
      return;
    }
    const rule: GradeVisibilityRule = {
      courseCode: courseCode.trim().toUpperCase() || undefined,
      studentCode: studentCode.trim() || undefined,
      examType: examType === "all" ? undefined : (examType as ExamType),
      isVisible,
    };
    const rest = rules.filter(
      (r) =>
        r.courseCode !== rule.courseCode ||
        r.studentCode !== rule.studentCode ||
        r.examType !== rule.examType,
    );
    mutation.mutate({ gradesVisibilityRules: [...rest, rule] });
  };
  const blocked = !settings?.gradesSystemOpen
    ? tr(
        "المفتاح العام مغلق: جميع النتائج محجوبة",
        "Master switch is off: all results are hidden",
      )
    : settings.gradesOpenAt && now < Date.parse(settings.gradesOpenAt)
      ? tr("موعد الفتح لم يأتِ بعد", "The opening time has not arrived")
      : settings.gradesCloseAt && now >= Date.parse(settings.gradesCloseAt)
        ? tr("انتهت نافذة عرض النتائج", "The viewing window has ended")
        : tr(
            "نافذة العرض مفتوحة؛ تطبّق المستويات والمكوّنات والاستثناءات أدناه",
            "Viewing window is open; levels, components and overrides below apply",
          );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir={isAr ? "rtl" : "ltr"}
        className="w-[calc(100%-2rem)] max-w-3xl max-h-[90vh] overflow-y-auto bg-background p-4 sm:p-6"
      >
        <DialogHeader className="text-start">
          <DialogTitle className="flex items-center gap-3 text-xl">
            <span className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-2.5 text-cyan-400">
              <SlidersHorizontal className="h-6 w-6" />
            </span>
            {tr("إتاحة النتائج ونشرها", "Results visibility and publication")}
          </DialogTitle>
          <DialogDescription>
            {tr(
              "إتاحة الطلاب منفصلة عن اعتماد ونشر درجات الكنترول",
              "Student visibility is separate from Control approval and publication",
            )}
          </DialogDescription>
        </DialogHeader>
        {query.isPending ? (
          <p role="status">{tr("جارٍ التحميل…", "Loading…")}</p>
        ) : query.isError ? (
          <div role="alert">
            <p>{tr("تعذر تحميل الإعدادات", "Unable to load settings")}</p>
            <Button onClick={() => void query.refetch()}>
              {tr("إعادة المحاولة", "Retry")}
            </Button>
          </div>
        ) : (
          settings && (
            <div className="min-w-0 space-y-4">
              <p
                role="status"
                className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm leading-6"
              >
                <Info className="h-5 w-5 shrink-0" />
                {blocked}
              </p>
              <p
                role="note"
                className="flex items-start gap-2 rounded-xl border border-violet-400/20 bg-violet-400/5 p-3 text-sm leading-6 text-muted-foreground"
              >
                <ShieldCheck className="h-5 w-5 shrink-0 text-violet-400" />
                {tr(
                  "تظهر النتائج المعتمدة والمنشورة فقط. الإتاحة لا تعتمد المسودات. إغلاق المفتاح العام أو انتهاء الموعد يحجب الجميع، حتى الاستثناءات.",
                  "Only approved, published results can appear. Visibility does not approve drafts. The master switch and closing deadline override every exception.",
                )}
              </p>
              <section className="flex min-w-0 flex-wrap items-center justify-between gap-4 rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-4">
                <div className="min-w-0 flex-1 space-y-1">
                  <h3 className="flex items-center gap-2 font-bold">
                    <Globe className="h-5 w-5 text-cyan-400" />
                    {tr("الإتاحة العامة للطلاب", "Master student visibility")}
                  </h3>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {tr(
                      "مفتاح واحد لفتح عرض النتائج المنشورة أو حجبها عن الجميع. تظل درجات الكنترول محفوظة في الحالتين.",
                      "One switch opens or hides released results for everyone. Stored Control marks remain intact.",
                    )}
                  </p>
                </div>
                <Button
                  disabled={busy}
                  onClick={() =>
                    mutation.mutate({
                      gradesSystemOpen: !settings.gradesSystemOpen,
                    })
                  }
                >
                  {settings.gradesSystemOpen ? <EyeOff /> : <Eye />}
                  {settings.gradesSystemOpen
                    ? tr("حجب كل النتائج", "Hide all results")
                    : tr("فتح عرض النتائج", "Open results viewing")}
                </Button>
              </section>
              <section className={section}>
                <h3 className="flex items-center gap-2 font-bold">
                  <CalendarClock className="h-5 w-5 text-cyan-400" />
                  {tr(
                    "الفتح والإغلاق التلقائي — توقيت القاهرة",
                    "Automatic opening and closing — Cairo time",
                  )}
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label>
                    {tr("موعد الفتح", "Opening time")}
                    <DateTimePicker
                      locale={isAr ? "ar" : "en"}
                      timeZone="Africa/Cairo"
                      disabled={busy}
                      className="w-full min-w-0"
                      placeholder={tr("اختر موعد الفتح", "Choose opening time")}
                      value={openAt}
                      onChange={setOpenAt}
                    />
                  </label>
                  <label>
                    {tr("موعد الإغلاق", "Closing time")}
                    <DateTimePicker
                      locale={isAr ? "ar" : "en"}
                      timeZone="Africa/Cairo"
                      disabled={busy}
                      className="w-full min-w-0"
                      placeholder={tr(
                        "اختر موعد الإغلاق",
                        "Choose closing time",
                      )}
                      value={closeAt}
                      onChange={setCloseAt}
                    />
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button disabled={busy} onClick={saveWindow}>
                    <Save className="h-4 w-4" />
                    {tr("حفظ المواعيد", "Save schedule")}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      mutation.mutate({
                        gradesOpenAt: null,
                        gradesCloseAt: null,
                      })
                    }
                  >
                    {tr("إلغاء المواعيد", "Clear schedule")}
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                </div>
              </section>
              <section className={section}>
                <h3 className="flex items-center gap-2 font-bold">
                  <GraduationCap className="h-5 w-5 text-cyan-400" />
                  {tr(
                    "المستويات المتاح عرض مقرراتها",
                    "Levels with visible course results",
                  )}
                </h3>
                <Select
                  value={settings.gradesLevelBasis ?? "course"}
                  disabled={busy}
                  onValueChange={(value) =>
                    mutation.mutate({
                      gradesLevelBasis: value as "student" | "course",
                    })
                  }
                >
                  <SelectTrigger
                    aria-label={tr(
                      "أساس إتاحة المستوى",
                      "Level visibility basis",
                    )}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent dir={isAr ? "rtl" : "ltr"}>
                    <SelectItem value="student">
                      {tr(
                        "حسب مستوى الطالب الحالي",
                        "By current student level",
                      )}
                    </SelectItem>
                    <SelectItem value="course">
                      {tr("حسب مستوى المقرر", "By course level")}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p
                  role="note"
                  className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs leading-6 text-muted-foreground"
                >
                  {settings.gradesLevelBasis !== "student"
                    ? tr(
                        "مثال: المقرر 111 من المستوى الأول يظهر لأي طالب مسجّل به عند إتاحة المستوى الأول، حتى لو مستواه الحالي الثالث.",
                        "Example: Level 1 course 111 can appear for an enrolled Level 3 student when Level 1 is allowed.",
                      )
                    : tr(
                        "الإتاحة هنا تتبع مستوى الطالب الحالي. طالب المستوى الثالث لن يرى المقرر 111 إذا كان المتاح الأول والثاني فقط. اختر «حسب مستوى المقرر» إن أردت إتاحة المقرر لكل المسجّلين به.",
                        "These settings follow the current student level. A Level 3 student cannot see course 111 when only Levels 1 and 2 are allowed. Choose course level to allow enrolled students by the course level instead.",
                      )}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      mutation.mutate({
                        gradesPublishedLevels: ["1", "2", "3", "4"],
                      })
                    }
                  >
                    <Eye className="h-4 w-4" />
                    {tr("إتاحة كل المستويات", "Allow all levels")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      mutation.mutate({ gradesPublishedLevels: [] })
                    }
                  >
                    <EyeOff className="h-4 w-4" />
                    {tr("حجب كل المستويات", "Hide all levels")}
                  </Button>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                  {["1", "2", "3", "4"].map((level) => (
                    <Button
                      key={level}
                      className="h-auto min-h-14 whitespace-normal justify-start px-3 py-3 text-start text-xs sm:text-sm"
                      disabled={busy}
                      variant={levels.includes(level) ? "default" : "outline"}
                      aria-pressed={levels.includes(level)}
                      onClick={() =>
                        mutation.mutate({
                          gradesPublishedLevels: levels.includes(level)
                            ? levels.filter((l) => l !== level)
                            : [...levels, level],
                        })
                      }
                    >
                      {levels.includes(level) ? (
                        <Eye className="h-4 w-4 shrink-0" />
                      ) : (
                        <EyeOff className="h-4 w-4 shrink-0" />
                      )}
                      {tr("المستوى", "Level")} {level} —{" "}
                      {levels.includes(level)
                        ? tr("متاح", "Allowed")
                        : tr("محجوب", "Hidden")}
                    </Button>
                  ))}
                </div>
              </section>
              <section className={section}>
                <h3 className="flex items-center gap-2 font-bold">
                  <Layers className="h-5 w-5 text-cyan-400" />
                  {tr(
                    "إتاحة المكوّنات لجميع الطلاب المسموح لهم",
                    "Component visibility for allowed students",
                  )}
                </h3>
                <p className="text-xs leading-6 text-muted-foreground">
                  {tr(
                    "هذه الإعدادات لأعمال السنة والميدترم والنهائي فقط. إظهار الكويزات وإخفاؤها من اختصاص دكتور المقرر، ولا تتأثر بإغلاق النتائج أو مواعيدها.",
                    "These settings apply only to coursework, midterm and final results. Course instructors control quiz visibility independently of the results switch and schedule.",
                  )}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {CONTROL_RESULT_EXAM_TYPES.map((type) => (
                    <Button
                      key={type}
                      className="h-auto min-h-12 whitespace-normal justify-start text-xs sm:text-sm"
                      disabled={busy}
                      aria-pressed={types.includes(type)}
                      variant={types.includes(type) ? "default" : "outline"}
                      onClick={() =>
                        mutation.mutate({
                          gradesPublishedExamTypes: types.includes(type)
                            ? types.filter((t) => t !== type)
                            : [...types, type],
                        })
                      }
                    >
                      {types.includes(type) ? (
                        <Eye className="h-4 w-4 shrink-0" />
                      ) : (
                        <EyeOff className="h-4 w-4 shrink-0" />
                      )}
                      {labels[type]} —{" "}
                      {types.includes(type)
                        ? tr("متاح", "Visible")
                        : tr("محجوب", "Hidden")}
                    </Button>
                  ))}
                </div>
              </section>
              <section className={section}>
                <h3 className="flex items-center gap-2 font-bold">
                  <SlidersHorizontal className="h-5 w-5 text-cyan-400" />
                  {tr("استثناء لمقرر أو طالب", "Course or student override")}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {tr(
                    "الكودان معًا يحددان طالبًا في مقرر بعينه. آخر استثناء مطابق هو المعتمد، ولا يتجاوز الإغلاق أو المستوى أو المواعيد.",
                    "Both codes target a student in one course. The last matching rule wins; master, level and time restrictions still apply.",
                  )}
                </p>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Input
                    aria-label={tr("كود المقرر", "Course code")}
                    placeholder={tr("كود المقرر", "Course code")}
                    dir="ltr"
                    value={courseCode}
                    onChange={(e) => setCourseCode(e.target.value)}
                    maxLength={80}
                  />
                  <Input
                    aria-label={tr("كود الطالب", "Student code")}
                    placeholder={tr("كود الطالب", "Student code")}
                    dir="ltr"
                    value={studentCode}
                    onChange={(e) => setStudentCode(e.target.value)}
                    maxLength={32}
                  />
                  <Select value={examType} onValueChange={setExamType}>
                    <SelectTrigger
                      aria-label={tr("مكوّن الاستثناء", "Override component")}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent dir={isAr ? "rtl" : "ltr"}>
                      {["all", ...CONTROL_RESULT_EXAM_TYPES].map((type) => (
                        <SelectItem key={type} value={type}>
                          {labels[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button disabled={busy} onClick={() => setRule(true)}>
                    <Eye className="h-4 w-4" />
                    {tr("إظهار المطابق", "Show matching results")}
                  </Button>
                  <Button
                    disabled={busy}
                    variant="outline"
                    onClick={() => setRule(false)}
                  >
                    <EyeOff className="h-4 w-4" />
                    {tr("حجب المطابق", "Hide matching results")}
                  </Button>
                </div>
                {rules.map((rule, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between gap-2 rounded-lg border p-2 text-sm"
                  >
                    <span className="min-w-0 break-all">
                      <bdi>{rule.courseCode || "—"}</bdi> /{" "}
                      <bdi>{rule.studentCode || "—"}</bdi> ·{" "}
                      {labels[rule.examType ?? "all"]} ·{" "}
                      {rule.isVisible
                        ? tr("إظهار", "Visible")
                        : tr("حجب", "Hidden")}
                    </span>
                    <Button
                      variant="ghost"
                      disabled={busy}
                      aria-label={`${tr("حذف الاستثناء", "Remove override")} ${index + 1}`}
                      onClick={() =>
                        mutation.mutate({
                          gradesVisibilityRules: rules.filter(
                            (_, i) => i !== index,
                          ),
                        })
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </section>
              <div className="space-y-3">
                <p
                  role="note"
                  className="flex gap-2 rounded-xl border border-sky-400/20 bg-sky-400/5 p-3 text-sm text-muted-foreground"
                >
                  <BookOpen className="h-5 w-5 shrink-0 text-sky-400" />
                  {tr(
                    "معتمد في الكنترول يعني أن المراجعة اكتملت. لإظهاره للطالب: عاين الإصدار وفعّله، ثم تأكد أن المستوى والمكوّن متاحان أعلاه.",
                    "Approved in Control means review is complete. To show it: preview and activate the release, then allow its level and component above.",
                  )}
                </p>
                <ControlReleasePanel locale={isAr ? "ar" : "en"} />
              </div>
            </div>
          )
        )}
        <Button
          className="justify-self-start px-8"
          variant="outline"
          onClick={() => onOpenChange(false)}
        >
          {tr("إغلاق", "Close")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
