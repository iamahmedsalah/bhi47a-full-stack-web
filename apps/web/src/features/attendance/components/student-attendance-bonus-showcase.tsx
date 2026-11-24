"use client";

import React, { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Award,
  BookOpen,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Flame,
  FlaskConical,
  MessageSquareQuote,
  Sparkles,
  Trophy,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { AttendanceRecordDto } from "../api/attendance-api";

type BonusFilter = "all" | "lecture" | "section_lab";

interface StudentAttendanceBonusShowcaseProps {
  records: AttendanceRecordDto[];
  totalBonusPoints: number;
  bonusAwardsCount?: number;
  lectureBonusPoints?: number;
  sectionBonusPoints?: number;
  locale: string;
  onSelectCourse?: (courseCode: string) => void;
}

const formatBonusMarks = (value: number) =>
  Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");

function getMotivationalTier(totalBonus: number, isAr: boolean) {
  if (totalBonus >= 6) {
    return {
      label: isAr ? "نجم التميز والمشاركة" : "Top Achiever",
      hint: isAr
        ? "أداء استثنائي وتفاعل رائع في المحاضرات والسكاشن — استمر في الصدارة!"
        : "Outstanding participation across lectures & sections — keep leading!",
      badgeClass:
        "border-amber-400/45 bg-amber-500/15 text-amber-300",
    };
  }
  if (totalBonus >= 3) {
    return {
      label: isAr ? "مشاركة فعّالة" : "Active Contributor",
      hint: isAr
        ? "رصيدك من البونص في نمو مستمر ويدعم درجات أعمال السنة بقوة."
        : "Your bonus points are growing steadily and boosting coursework marks.",
      badgeClass:
        "border-primary/40 bg-primary/15 text-primary",
    };
  }
  if (totalBonus > 0) {
    return {
      label: isAr ? "بداية مميزة" : "Rising Star",
      hint: isAr
        ? "انطلاقة موفقة! كل مشاركة في المحاضرة أو السكشن تقرّبك من التميز."
        : "Great start! Every participation in lectures or labs earns extra rewards.",
      badgeClass:
        "border-emerald-500/35 bg-emerald-500/12 text-emerald-300",
    };
  }
  return {
    label: isAr ? "جاهز لحصد البونص" : "Ready to Earn Bonus",
    hint: isAr
      ? "عند حضورك وتفاعلك في المحاضرة أو السكشن، سيظهر هنا كل بونص يمنحه الدكتور أو المعيد فورًا."
      : "When you participate in lectures or sections, instructor bonus rewards will appear here.",
    badgeClass:
      "border-border/70 bg-card/85 text-muted-foreground",
  };
}

export function StudentAttendanceBonusShowcase({
  records,
  totalBonusPoints,
  bonusAwardsCount,
  lectureBonusPoints,
  sectionBonusPoints,
  locale,
  onSelectCourse,
}: StudentAttendanceBonusShowcaseProps) {
  const isAr = locale.startsWith("ar");
  const prefersReducedMotion = useReducedMotion();
  const [filter, setFilter] = useState<BonusFilter>("all");
  const [showAll, setShowAll] = useState(false);

  const bonusRecords = useMemo(() => {
    return records
      .filter((r) => typeof r.bonusPoints === "number" && r.bonusPoints > 0)
      .sort((a, b) => {
        const aTime = new Date(a.bonusAwardedAt || a.checkedInAt).getTime();
        const bTime = new Date(b.bonusAwardedAt || b.checkedInAt).getTime();
        return bTime - aTime;
      });
  }, [records]);

  const computedSummary = useMemo(() => {
    const count = bonusAwardsCount ?? bonusRecords.length;
    const lectureTotal =
      lectureBonusPoints ??
      Math.round(
        bonusRecords
          .filter((r) => r.sessionType === "lecture")
          .reduce((sum, r) => sum + (r.bonusPoints ?? 0), 0) * 100,
      ) / 100;
    const sectionTotal =
      sectionBonusPoints ??
      Math.round(
        bonusRecords
          .filter((r) => r.sessionType !== "lecture")
          .reduce((sum, r) => sum + (r.bonusPoints ?? 0), 0) * 100,
      ) / 100;
    return { count, lectureTotal, sectionTotal };
  }, [bonusAwardsCount, bonusRecords, lectureBonusPoints, sectionBonusPoints]);

  const filteredBonus = useMemo(() => {
    if (filter === "lecture") {
      return bonusRecords.filter((r) => r.sessionType === "lecture");
    }
    if (filter === "section_lab") {
      return bonusRecords.filter((r) => r.sessionType !== "lecture");
    }
    return bonusRecords;
  }, [bonusRecords, filter]);

  const visibleAwards = showAll ? filteredBonus : filteredBonus.slice(0, 4);
  const tier = getMotivationalTier(totalBonusPoints, isAr);

  const formatAwardDate = (rawDate: string) =>
    new Date(rawDate).toLocaleString(isAr ? "ar-EG" : "en-GB", {
      timeZone: "Africa/Cairo",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <motion.section
      id="bonus-showcase"
      dir={isAr ? "rtl" : "ltr"}
      aria-label={isAr ? "لوحة مكافآت وبونص المشاركة" : "Attendance bonus rewards"}
      initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className={cn(
        "relative overflow-hidden rounded-2xl border p-4 sm:p-5 space-y-4 shadow-sm",
        totalBonusPoints > 0
          ? "border-amber-500/30 bg-card/55"
          : "border-border/75 bg-card/40",
      )}
    >
      {/* Subtle decorative glow when student has earned bonus */}
      {totalBonusPoints > 0 && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-20 -end-20 size-52 rounded-full bg-amber-500/10 blur-3xl"
        />
      )}

      {/* Hero Motivational Header (Mobile-First) */}
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3.5 min-w-0">
          {/* Animated Trophy / Award Icon Badge */}
          <motion.div
            animate={
              prefersReducedMotion || totalBonusPoints <= 0
                ? undefined
                : {
                    y: [0, -3, 0],
                    rotate: [0, -4, 4, 0],
                  }
            }
            transition={{
              duration: 3.4,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className={cn(
              "relative flex size-12 shrink-0 items-center justify-center rounded-squircle border shadow-sm",
              totalBonusPoints > 0
                ? "border-amber-500/40 bg-amber-500/15 text-amber-300"
                : "border-primary/25 bg-primary/10 text-primary",
            )}
          >
            {totalBonusPoints > 0 ? (
              <Trophy className="size-6" aria-hidden="true" />
            ) : (
              <Award className="size-6" aria-hidden="true" />
            )}

            {totalBonusPoints > 0 && !prefersReducedMotion && (
              <motion.span
                aria-hidden="true"
                animate={{ scale: [0.85, 1.2, 0.85], opacity: [0.65, 1, 0.65] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                className="absolute -top-1.5 -end-1.5 flex size-5 items-center justify-center rounded-squircle border border-amber-400/50 bg-background text-amber-300 shadow-xs"
              >
                <Sparkles className="size-3" />
              </motion.span>
            )}
          </motion.div>

          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base sm:text-lg font-extrabold tracking-tight text-foreground">
                {isAr
                  ? "رصيد بونص المحاضرات والسكاشن"
                  : "Lecture & Section Bonus Rewards"}
              </h2>
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-squircle border px-2.5 py-0.5 text-[11px] font-bold",
                  tier.badgeClass,
                )}
              >
                <Flame className="size-3 shrink-0" aria-hidden="true" />
                <span>{tier.label}</span>
              </span>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              {tier.hint}
            </p>
          </div>
        </div>

        {/* Highlight Total Bonus Metric */}
        <motion.div
          whileHover={prefersReducedMotion ? undefined : { scale: 1.02 }}
          transition={{ type: "spring", stiffness: 320, damping: 24 }}
          className={cn(
            "flex items-center justify-between sm:justify-end gap-4 rounded-xl border px-4 py-3 shrink-0",
            totalBonusPoints > 0
              ? "border-amber-500/35 bg-amber-500/[0.08]"
              : "border-border/70 bg-secondary/25",
          )}
        >
          <div className="space-y-0.5 text-start">
            <span className="block text-[11px] font-medium text-muted-foreground">
              {isAr ? "إجمالي درجات البونص" : "Total Bonus Earned"}
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] text-amber-300/90 font-semibold">
              <Sparkles className="size-3 shrink-0" aria-hidden="true" />
              {computedSummary.count > 0
                ? isAr
                  ? `في ${computedSummary.count} جلسات مميزة`
                  : `Across ${computedSummary.count} sessions`
                : isAr
                  ? "بانتظار أول مكافأة"
                  : "Awaiting first reward"}
            </span>
          </div>

          <div className="text-end">
            <bdi
              dir="ltr"
              className={cn(
                "block font-mono text-2xl sm:text-3xl font-black tracking-tight tabular-nums",
                totalBonusPoints > 0 ? "text-amber-300" : "text-muted-foreground",
              )}
            >
              +{formatBonusMarks(totalBonusPoints)}
            </bdi>
            <span className="block text-[10px] font-semibold text-muted-foreground">
              {isAr ? "درجة إضافية" : "Bonus pts"}
            </span>
          </div>
        </motion.div>
      </div>

      {/* Breakdown & Scrollable Mobile Filter Strip */}
      {bonusRecords.length > 0 && (
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between border-t border-border/50 pt-3.5">
          {/* Quick Breakdown Chips */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-squircle border border-primary/25 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
              <BookOpen className="size-3.5 shrink-0" aria-hidden="true" />
              <span>{isAr ? "محاضرات:" : "Lectures:"}</span>
              <bdi dir="ltr" className="font-mono font-bold tabular-nums">
                +{formatBonusMarks(computedSummary.lectureTotal)}
              </bdi>
            </span>

            <span className="inline-flex items-center gap-1.5 rounded-squircle border border-violet-500/30 bg-violet-500/12 px-2.5 py-1 text-[11px] font-semibold text-violet-300">
              <FlaskConical className="size-3.5 shrink-0" aria-hidden="true" />
              <span>{isAr ? "سكاشن ومعامل:" : "Sections & Labs:"}</span>
              <bdi dir="ltr" className="font-mono font-bold tabular-nums">
                +{formatBonusMarks(computedSummary.sectionTotal)}
              </bdi>
            </span>
          </div>

          {/* Horizontally Scrollable Filter Chips */}
          <div
            role="group"
            aria-label={isAr ? "تصفية درجات البونص" : "Filter bonus rewards"}
            className="flex items-center gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {(
              [
                {
                  key: "all",
                  label: isAr
                    ? `الكل (${bonusRecords.length})`
                    : `All (${bonusRecords.length})`,
                },
                {
                  key: "lecture",
                  label: isAr ? "المحاضرات" : "Lectures",
                },
                {
                  key: "section_lab",
                  label: isAr ? "السكاشن والمعامل" : "Sections & Labs",
                },
              ] as const
            ).map((chip) => {
              const active = filter === chip.key;
              return (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => setFilter(chip.key)}
                  className={cn(
                    "min-h-9 shrink-0 rounded-squircle border px-3 py-1 text-xs font-semibold transition-colors cursor-pointer",
                    active
                      ? "border-amber-500/45 bg-amber-500/15 text-amber-300"
                      : "border-border/70 bg-secondary/40 text-muted-foreground hover:border-primary/40 hover:text-foreground",
                  )}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Individual Bonus Award Cards Grid or Encouraging Empty State */}
      {bonusRecords.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/70 bg-secondary/20 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3.5 text-start">
          <motion.div
            animate={
              prefersReducedMotion
                ? undefined
                : { scale: [1, 1.07, 1], opacity: [0.85, 1, 0.85] }
            }
            transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
            className="flex size-10 shrink-0 items-center justify-center rounded-squircle border border-primary/30 bg-primary/12 text-primary"
          >
            <Sparkles className="size-5" aria-hidden="true" />
          </motion.div>
          <div className="space-y-1">
            <p className="text-xs sm:text-sm font-bold text-foreground">
              {isAr
                ? "لا توجد درجات بونص مرصودة حتى الآن"
                : "No bonus marks awarded yet"}
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {isAr
                ? "سجّل حضورك في المحاضرة أو السكشن وشارك مع الدكتور أو المعيد؛ وسيظهر هنا مباشرة كل بونص تحصل عليه مع اسم المقرر وسبب المكافأة."
                : "Check in to lectures or sections and engage actively — any bonus points granted by your instructor or TA will show up here with the course and reason."}
            </p>
          </div>
        </div>
      ) : filteredBonus.length === 0 ? (
        <div className="rounded-xl border border-border/60 bg-secondary/20 p-4 text-center text-xs text-muted-foreground">
          {isAr
            ? "لا توجد درجات بونص مطابقة لهذا التصنيف حاليًا."
            : "No bonus rewards match this session type yet."}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <AnimatePresence mode="popLayout">
              {visibleAwards.map((award, idx) => {
                const localizedCourseName = isAr
                  ? award.courseNameAr || award.courseName
                  : award.courseName || award.courseNameAr;
                const awardedBy = isAr
                  ? award.bonusAwardedByNameAr || award.bonusAwardedByName
                  : award.bonusAwardedByNameEn || award.bonusAwardedByName;
                const sessionTypeLabel =
                  award.sessionType === "lecture"
                    ? isAr
                      ? "محاضرة"
                      : "Lecture"
                    : award.sessionType === "section"
                      ? isAr
                        ? "سكشن"
                        : "Section"
                      : isAr
                        ? "معمل"
                        : "Lab";

                return (
                  <motion.article
                    key={award._id}
                    layout={!prefersReducedMotion}
                    initial={
                      prefersReducedMotion
                        ? false
                        : { opacity: 0, y: 10, scale: 0.98 }
                    }
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={
                      prefersReducedMotion
                        ? undefined
                        : { opacity: 0, scale: 0.97 }
                    }
                    transition={{
                      type: "spring",
                      stiffness: 260,
                      damping: 22,
                      delay: prefersReducedMotion ? 0 : Math.min(idx * 0.05, 0.25),
                    }}
                    className="rounded-xl border border-border/75 bg-background/55 p-3.5 sm:p-4 space-y-2.5 transition-colors hover:border-amber-500/40"
                  >
                    {/* Card Top Row: Course + Points Badge */}
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onSelectCourse?.(award.courseCode)}
                            className="inline-flex items-center rounded-squircle border border-border/70 bg-secondary/50 px-2 py-0.5 font-mono text-xs font-bold text-foreground hover:border-primary/40 hover:text-primary transition-colors cursor-pointer"
                          >
                            <bdi dir="ltr">{award.courseCode}</bdi>
                          </button>

                          <span
                            className={cn(
                              "inline-flex items-center rounded-squircle border px-2 py-0.5 text-[11px] font-semibold",
                              award.sessionType === "lecture"
                                ? "border-primary/30 bg-primary/10 text-primary"
                                : award.sessionType === "section"
                                  ? "border-violet-500/30 bg-violet-500/12 text-violet-300"
                                  : "border-cyan-500/30 bg-cyan-500/12 text-cyan-300",
                            )}
                          >
                            {sessionTypeLabel}
                          </span>
                        </div>

                        {localizedCourseName && (
                          <p className="text-xs font-semibold text-foreground/90 truncate">
                            {localizedCourseName}
                          </p>
                        )}
                      </div>

                      <motion.span
                        whileHover={
                          prefersReducedMotion ? undefined : { scale: 1.06 }
                        }
                        className="inline-flex shrink-0 items-center gap-1 rounded-squircle border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 text-xs font-extrabold text-amber-300 shadow-xs"
                      >
                        <Sparkles className="size-3.5 shrink-0" aria-hidden="true" />
                        <bdi dir="ltr" className="font-mono tabular-nums">
                          +{formatBonusMarks(award.bonusPoints ?? 0)}
                        </bdi>
                      </motion.span>
                    </div>

                    {/* Optional Instructor Reason Pill */}
                    {award.bonusReason && (
                      <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-100/95">
                        <MessageSquareQuote
                          className="size-3.5 shrink-0 mt-0.5 text-amber-300"
                          aria-hidden="true"
                        />
                        <p className="leading-relaxed break-words">
                          {award.bonusReason}
                        </p>
                      </div>
                    )}

                    {/* Card Footer: Awarded By + Cairo Date */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-border/40 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1 min-w-0 truncate">
                        <UserCheck
                          className="size-3.5 shrink-0 text-primary"
                          aria-hidden="true"
                        />
                        <span className="truncate">
                          {awardedBy
                            ? isAr
                              ? `منحها: ${awardedBy}`
                              : `Awarded by ${awardedBy}`
                            : isAr
                              ? "بموافقة هيئة التدريس"
                              : "Faculty awarded"}
                        </span>
                      </span>

                      <span className="inline-flex items-center gap-1 shrink-0 font-mono">
                        <CalendarClock className="size-3 shrink-0" aria-hidden="true" />
                        <bdi>
                          {formatAwardDate(
                            award.bonusAwardedAt || award.checkedInAt,
                          )}
                        </bdi>
                      </span>
                    </div>
                  </motion.article>
                );
              })}
            </AnimatePresence>
          </div>

          {filteredBonus.length > 4 && (
            <div className="flex justify-center pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowAll((prev) => !prev)}
                className="min-h-10 rounded-squircle gap-1.5 text-xs font-semibold cursor-pointer"
              >
                {showAll ? (
                  <>
                    <ChevronUp className="size-4" aria-hidden="true" />
                    <span>{isAr ? "عرض أقل" : "Show less"}</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="size-4" aria-hidden="true" />
                    <span>
                      {isAr
                        ? `عرض كل مكافآت البونص (${filteredBonus.length})`
                        : `Show all ${filteredBonus.length} bonus awards`}
                    </span>
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      )}
    </motion.section>
  );
}
