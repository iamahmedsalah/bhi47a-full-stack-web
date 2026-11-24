"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Award,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Lock,
  QrCode,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { StudentLiveSessionItem } from "../api/attendance-api";

type SessionTypeFilter = "all" | "lecture" | "section" | "lab";

interface DashboardLiveAttendanceHubProps {
  sessions: StudentLiveSessionItem[];
  isBlocked?: boolean;
  blockReason?: string | null;
  totalBonusPoints?: number;
  locale: string;
  onScanSession: (session?: StudentLiveSessionItem) => void;
  showHistoryLink?: boolean;
}

function formatCountdown(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function DashboardLiveAttendanceHub({
  sessions,
  isBlocked = false,
  blockReason,
  totalBonusPoints = 0,
  locale,
  onScanSession,
  showHistoryLink = true,
}: DashboardLiveAttendanceHubProps) {
  const isAr = locale.startsWith("ar");
  const [filterType, setFilterType] = useState<SessionTypeFilter>("all");
  const [expandedAll, setExpandedAll] = useState(false);
  const [nowMs, setNowMs] = useState<number>(0);

  useEffect(() => {
    const update = () => setNowMs(Date.now());
    const initial = setTimeout(update, 0);
    const interval = setInterval(update, 1000);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, []);

  const liveSessions = useMemo(() => {
    return sessions
      .map((item) => {
        const computedRemaining =
          nowMs > 0 && item.expiresAt
            ? Math.max(
                0,
                Math.floor((new Date(item.expiresAt).getTime() - nowMs) / 1000),
              )
            : item.remainingSeconds;
        return {
          ...item,
          liveRemainingSeconds: computedRemaining,
        };
      })
      .filter((item) => item.alreadyCheckedIn || item.liveRemainingSeconds > 0);
  }, [sessions, nowMs]);

  const countsByType = useMemo(() => {
    const counts = { lecture: 0, section: 0, lab: 0 };
    for (const s of liveSessions) {
      if (s.sessionType === "lecture") counts.lecture += 1;
      else if (s.sessionType === "section") counts.section += 1;
      else if (s.sessionType === "lab") counts.lab += 1;
    }
    return counts;
  }, [liveSessions]);

  const activeTypeCount =
    Number(countsByType.lecture > 0) +
    Number(countsByType.section > 0) +
    Number(countsByType.lab > 0);

  const filteredSessions = useMemo(() => {
    if (filterType === "all") return liveSessions;
    return liveSessions.filter((s) => s.sessionType === filterType);
  }, [liveSessions, filterType]);

  if (liveSessions.length === 0) return null;

  const pendingCount = liveSessions.filter((s) => !s.alreadyCheckedIn).length;
  const visibleSessions =
    expandedAll || filteredSessions.length <= 3
      ? filteredSessions
      : filteredSessions.slice(0, 3);
  const hiddenCount = Math.max(0, filteredSessions.length - visibleSessions.length);
  const isSingleSession = liveSessions.length === 1;

  const sessionTypeMeta = (type: StudentLiveSessionItem["sessionType"]) => {
    if (type === "lecture") {
      return {
        label: isAr ? "محاضرة" : "Lecture",
        className: "border-primary/30 bg-primary/12 text-primary",
      };
    }
    if (type === "section") {
      return {
        label: isAr ? "سكشن" : "Section",
        className: "border-violet-500/35 bg-violet-500/12 text-violet-300",
      };
    }
    return {
      label: isAr ? "معمل" : "Lab",
      className: "border-cyan-500/35 bg-cyan-500/12 text-cyan-300",
    };
  };

  return (
    <section
      dir={isAr ? "rtl" : "ltr"}
      aria-label={
        isAr ? "جلسات الحضور المباشرة الآن" : "Live attendance sessions"
      }
      className="rounded-2xl border border-border/75 bg-secondary/20 p-3.5 sm:p-5 space-y-3.5 shadow-sm"
    >
      {/* Mobile-First Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="relative flex size-2.5 shrink-0">
              {!isBlocked && pendingCount > 0 && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              )}
              <span
                className={cn(
                  "relative inline-flex size-2.5 rounded-full",
                  isBlocked
                    ? "bg-rose-400"
                    : pendingCount > 0
                      ? "bg-primary"
                      : "bg-emerald-400",
                )}
              />
            </span>

            <h2 className="text-sm sm:text-base font-bold text-foreground">
              {isSingleSession
                ? isAr
                  ? "جلسة حضور مباشرة مفتوحة الآن"
                  : "Live Attendance Session Open"
                : isAr
                  ? "جلسات الحضور المباشرة الآن"
                  : "Live Attendance Sessions Open"}
            </h2>

            <span
              className={cn(
                "rounded-squircle border px-2 py-0.5 text-[11px] font-bold",
                isBlocked
                  ? "border-rose-500/35 bg-rose-500/12 text-rose-300"
                  : pendingCount > 0
                    ? "border-primary/30 bg-primary/12 text-primary"
                    : "border-emerald-500/35 bg-emerald-500/12 text-emerald-400",
              )}
            >
              {isBlocked
                ? isAr
                  ? "الحضور موقوف (محجوب)"
                  : "Attendance Withheld"
                : pendingCount > 0
                  ? isAr
                    ? `${pendingCount} بانتظار التسجيل`
                    : `${pendingCount} awaiting check-in`
                  : isAr
                    ? "تم التسجيل بالكامل ✓"
                    : "All checked in ✓"}
            </span>

            {totalBonusPoints > 0 && (
              <span className="inline-flex items-center gap-1 rounded-squircle border border-amber-500/35 bg-amber-500/12 px-2 py-0.5 text-[11px] font-bold text-amber-300">
                <Award className="size-3 shrink-0" />
                <bdi dir="ltr">+{totalBonusPoints}</bdi>
                <span>{isAr ? "بونص" : "Bonus"}</span>
              </span>
            )}
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            {isBlocked
              ? isAr
                ? "حسابك محجوب مؤقتًا لعدم سداد المصروفات الدراسية؛ لا يمكن تسجيل الحضور بالـ QR أو يدويًا لحين تسوية الرسوم."
                : "Your account is withheld due to unpaid tuition fees; QR and manual check-ins are paused until settled."
              : isSingleSession
                ? isAr
                  ? "امسح رمز QR المعروض أمامك أو أدخل الكود اليدوي لتوثيق حضورك فورًا."
                  : "Scan the displayed QR code or enter the manual code to record your attendance."
                : isAr
                  ? "جميع المحاضرات والسكاشن المفتوحة لفرقتك معروضة أدناه — اختر جلستك وسجّل حضورك مباشرة."
                  : "All open lectures, sections, and labs for your level are shown below — tap your session to check in."}
          </p>
          {isBlocked && blockReason && (
            <p className="text-[11px] font-semibold text-rose-300">
              {isAr ? `سبب الحجب: ${blockReason}` : `Hold notice: ${blockReason}`}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {!isSingleSession && !isBlocked && pendingCount > 0 && (
            <Button
              type="button"
              size="sm"
              onClick={() => onScanSession(undefined)}
              className="w-full sm:w-auto min-h-10 rounded-squircle gap-1.5 font-bold text-xs cursor-pointer"
            >
              <QrCode className="size-4 shrink-0" />
              <span>{isAr ? "مسح QR سريع" : "Quick Scan QR"}</span>
            </Button>
          )}

          {showHistoryLink && (
            <Link
              href={`/${locale}/dashboard/attendance`}
              className="w-full sm:w-auto inline-flex min-h-10 items-center justify-center gap-1 rounded-squircle border border-border/75 bg-card px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:border-primary/40"
            >
              <span>{isAr ? "سجل الحضور الكامل" : "Attendance Log"}</span>
              <ChevronRight className="size-3.5 shrink-0 rtl:rotate-180" />
            </Link>
          )}
        </div>
      </div>

      {/* Horizontally Scrollable Mobile Filter Strip (when multiple session types are open) */}
      {activeTypeCount > 1 && (
        <div
          role="group"
          aria-label={isAr ? "تصفية نوع الجلسة" : "Filter session type"}
          className="flex items-center gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {(
            [
              {
                key: "all" as const,
                show: true,
                label: isAr
                  ? `الكل (${liveSessions.length})`
                  : `All (${liveSessions.length})`,
              },
              {
                key: "lecture" as const,
                show: countsByType.lecture > 0,
                label: isAr
                  ? `محاضرات (${countsByType.lecture})`
                  : `Lectures (${countsByType.lecture})`,
              },
              {
                key: "section" as const,
                show: countsByType.section > 0,
                label: isAr
                  ? `سكاشن (${countsByType.section})`
                  : `Sections (${countsByType.section})`,
              },
              {
                key: "lab" as const,
                show: countsByType.lab > 0,
                label: isAr
                  ? `معامل (${countsByType.lab})`
                  : `Labs (${countsByType.lab})`,
              },
            ] as const
          )
            .filter((item) => item.show)
            .map((item) => {
              const active = filterType === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setFilterType(item.key)}
                  className={cn(
                    "shrink-0 min-h-9 rounded-squircle border px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer",
                    active
                      ? "border-primary/45 bg-primary/15 text-primary"
                      : "border-border/70 bg-card/80 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {item.label}
                </button>
              );
            })}
        </div>
      )}

      {/* Mobile-First Session Cards Grid (1 col on phone, 2-3 cols on desktop) */}
      <div
        className={cn(
          "grid grid-cols-1 gap-3",
          !isSingleSession &&
            (visibleSessions.length === 2
              ? "md:grid-cols-2"
              : "md:grid-cols-2 xl:grid-cols-3"),
        )}
      >
        {visibleSessions.map((session) => {
          const typeInfo = sessionTypeMeta(session.sessionType);
          const totalSec = Math.max(60, (session.durationMinutes || 15) * 60);
          const progressPct = Math.max(
            4,
            Math.min(
              100,
              Math.round((session.liveRemainingSeconds / totalSec) * 100),
            ),
          );
          const isUrgent =
            !session.alreadyCheckedIn && session.liveRemainingSeconds <= 300;
          const instructorName = isAr
            ? session.createdByNameAr || session.createdByName
            : session.createdByNameEn || session.createdByName;

          const groupSectionParts: string[] = [];
          if (session.group) {
            groupSectionParts.push(
              isAr ? `مجموعة ${session.group}` : `Group ${session.group}`,
            );
          }
          if (session.section) {
            groupSectionParts.push(
              isAr ? `سكشن ${session.section}` : `Sec ${session.section}`,
            );
          }

          return (
            <div
              key={session._id}
              className={cn(
                "rounded-xl border border-border/65 bg-card/90 p-3.5 sm:p-4 flex flex-col justify-between gap-3 transition-colors",
                isSingleSession &&
                  "sm:flex-row sm:items-center sm:justify-between sm:gap-4",
              )}
            >
              <div className="min-w-0 flex-1 space-y-2">
                {/* Top Badges Row */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                    <span
                      className={cn(
                        "rounded-squircle border px-2 py-0.5 text-[11px] font-bold",
                        typeInfo.className,
                      )}
                    >
                      {typeInfo.label}
                    </span>

                    <span className="rounded-squircle border border-border/75 bg-background/70 px-2 py-0.5 font-mono text-xs font-bold text-foreground">
                      <bdi dir="ltr">{session.courseCode}</bdi>
                    </span>

                    {groupSectionParts.length > 0 && (
                      <span className="rounded-squircle border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        {groupSectionParts.join(" · ")}
                      </span>
                    )}
                  </div>

                  {/* Status / Timer Pill */}
                  {session.alreadyCheckedIn ? (
                    <span className="inline-flex items-center gap-1 rounded-squircle border border-emerald-500/35 bg-emerald-500/12 px-2.5 py-0.5 text-[11px] font-bold text-emerald-400">
                      <CheckCircle2 className="size-3.5 shrink-0" />
                      <span>
                        {session.checkedInStatus === "late"
                          ? isAr
                            ? "حاضر (متأخر)"
                            : "Checked In (Late)"
                          : isAr
                            ? "تم التسجيل ✓"
                            : "Checked In ✓"}
                      </span>
                    </span>
                  ) : isBlocked ? (
                    <span className="inline-flex items-center gap-1 rounded-squircle border border-rose-500/35 bg-rose-500/12 px-2 py-0.5 text-[11px] font-bold text-rose-300">
                      <ShieldAlert className="size-3 shrink-0" />
                      <span>{isAr ? "محجوب" : "Held"}</span>
                    </span>
                  ) : (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-squircle border px-2 py-0.5 font-mono text-xs font-bold tabular-nums",
                        isUrgent
                          ? "border-amber-500/40 bg-amber-500/15 text-amber-300"
                          : "border-primary/30 bg-primary/10 text-primary",
                      )}
                    >
                      <Clock className="size-3 shrink-0" />
                      <bdi dir="ltr">
                        {formatCountdown(session.liveRemainingSeconds)}
                      </bdi>
                    </span>
                  )}
                </div>

                {/* Course Title & Instructor */}
                <div className="space-y-0.5">
                  <h3 className="text-sm font-bold text-foreground leading-snug break-words">
                    {session.courseName || session.courseCode}
                  </h3>
                  {instructorName && (
                    <p className="text-xs text-muted-foreground truncate">
                      {isAr ? "بواسطة: " : "By: "}
                      <span className="font-medium text-foreground/85">
                        {instructorName}
                      </span>
                    </p>
                  )}
                </div>

                {/* Progress Bar OR Checked-In + Bonus Strip */}
                {!session.alreadyCheckedIn ? (
                  <div className="space-y-1 max-w-md">
                    <div className="h-1.5 w-full overflow-hidden rounded-full border border-border/60 bg-background/70">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-700",
                          isBlocked
                            ? "bg-muted-foreground/35"
                            : isUrgent
                              ? "bg-amber-400"
                              : "bg-primary",
                        )}
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  (session.bonusPoints ?? 0) > 0 && (
                    <div className="inline-flex items-center gap-1.5 rounded-squircle border border-amber-500/35 bg-amber-500/12 px-2.5 py-1 text-xs font-bold text-amber-300">
                      <Award className="size-3.5 shrink-0" />
                      <span>
                        {isAr
                          ? `حصلت على +${session.bonusPoints} درجات بونص في هذه الجلسة`
                          : `Awarded +${session.bonusPoints} bonus marks in this session`}
                      </span>
                    </div>
                  )
                )}
              </div>

              {/* Action CTA (Mobile Full-Width >= 44px Touch Target) */}
              {!session.alreadyCheckedIn && (
                <div
                  className={cn(
                    "pt-2 border-t border-border/50",
                    isSingleSession && "sm:pt-0 sm:border-t-0 sm:shrink-0",
                  )}
                >
                  {isBlocked ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled
                      className="w-full sm:w-auto min-h-11 rounded-squircle gap-1.5 border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs font-bold opacity-90 cursor-not-allowed"
                    >
                      <Lock className="size-3.5 shrink-0" />
                      <span>
                        {isAr
                          ? "الحضور موقوف (حساب محجوب)"
                          : "Check-in Blocked (Tuition Hold)"}
                      </span>
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      onClick={() => onScanSession(session)}
                      className={cn(
                        "w-full min-h-11 rounded-squircle gap-2 font-bold text-xs shadow-sm cursor-pointer",
                        isSingleSession && "sm:w-auto sm:px-5",
                      )}
                    >
                      <QrCode className="size-4 shrink-0" />
                      <span>
                        {isAr
                          ? "مسح QR / كود الحضور"
                          : "Scan QR / Enter Code"}
                      </span>
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Show More / Less Toggle when > 3 sessions */}
      {(hiddenCount > 0 || expandedAll) && filteredSessions.length > 3 && (
        <div className="pt-1 flex justify-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setExpandedAll((prev) => !prev)}
            className="w-full sm:w-auto min-h-10 rounded-squircle gap-1.5 text-xs font-semibold cursor-pointer"
          >
            {expandedAll ? (
              <>
                <ChevronUp className="size-4" />
                <span>{isAr ? "عرض عدد أقل" : "Show fewer sessions"}</span>
              </>
            ) : (
              <>
                <ChevronDown className="size-4" />
                <span>
                  {isAr
                    ? `عرض كل الجلسات (+${hiddenCount} أخرى)`
                    : `Show all sessions (+${hiddenCount} more)`}
                </span>
              </>
            )}
          </Button>
        </div>
      )}
    </section>
  );
}
