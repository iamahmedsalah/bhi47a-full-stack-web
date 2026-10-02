"use client";

import { useMemo, useState, type ReactNode } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Users,
  CheckCircle2,
  Clock,
  Search,
  QrCode,
  UserRound,
  UserPlus,
  Smartphone,
  Tablet,
  Monitor,
  Globe,
  MapPin,
  ExternalLink,
  ChevronDown,
  MoreVertical,
  Pencil,
  ShieldCheck,
  CircleHelp,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type {
  AttendanceRecordDto,
  AttendanceSessionDto,
} from "../api/attendance-api";
import {
  distanceFromHall,
  getDevicePresentation,
} from "../lib/record-presentation";

interface LiveAttendeeStreamProps {
  records: AttendanceRecordDto[];
  stats: { total: number; present: number; late: number };
  hall?: AttendanceSessionDto["location"];
  isArabic: boolean;
  isLive: boolean;
  onEdit: (record: AttendanceRecordDto) => void;
}

function Detail({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-1.5 rounded-xl bg-secondary/25 p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="break-words text-xs leading-relaxed text-foreground">
        {children}
      </div>
    </div>
  );
}

export function LiveAttendeeStream({
  records,
  stats,
  hall,
  isArabic,
  isLive,
  onEdit,
}: LiveAttendeeStreamProps) {
  const [filter, setFilter] = useState<"all" | "present" | "late">("all");
  const [search, setSearch] = useState("");
  const locale = isArabic ? "ar-EG" : "en-GB";
  const number = (value: number) => value.toLocaleString(locale);
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return records
      .filter(
        (record) =>
          (filter === "all" || record.status === filter) &&
          (!query ||
            record.studentName.toLowerCase().includes(query) ||
            record.studentCode.toLowerCase().includes(query)),
      )
      .toSorted(
        (a, b) =>
          new Date(b.checkedInAt).getTime() - new Date(a.checkedInAt).getTime(),
      );
  }, [records, filter, search]);
  const statuses = {
    present: {
      label: isArabic ? "حاضر" : "Present",
      Icon: CheckCircle2,
      className: "border-primary/20 bg-primary/10 text-primary",
    },
    late: {
      label: isArabic ? "متأخر" : "Late",
      Icon: Clock,
      className:
        "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-300",
    },
    excused: {
      label: isArabic ? "بعذر" : "Excused",
      Icon: ShieldCheck,
      className: "border-border bg-secondary text-muted-foreground",
    },
    absent: {
      label: isArabic ? "غائب" : "Absent",
      Icon: XCircle,
      className: "border-destructive/20 bg-destructive/10 text-destructive",
    },
  };

  return (
    <section
      className="flex min-w-0 flex-col gap-4 lg:col-span-7"
      dir={isArabic ? "rtl" : "ltr"}
      aria-label={isArabic ? "الحضور المباشر" : "Live attendance"}
    >
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {[
          {
            label: isArabic ? "إجمالي الحضور" : "Total attended",
            value: stats.total,
            Icon: Users,
            color: "text-foreground",
            bg: "bg-secondary/20",
          },
          {
            label: isArabic ? "في الموعد" : "On time",
            value: stats.present,
            Icon: CheckCircle2,
            color: "text-primary",
            bg: "bg-primary/5",
          },
          {
            label: isArabic ? "متأخر" : "Late",
            value: stats.late,
            Icon: Clock,
            color: "text-amber-600 dark:text-amber-300",
            bg: "bg-amber-500/5",
          },
        ].map(({ label, value, Icon, color, bg }) => (
          <Card key={label} className={`min-w-0 p-3 sm:p-4 ${bg}`}>
            <div className="flex items-center justify-between gap-1">
              <span className="text-xs text-muted-foreground">{label}</span>
              <Icon
                className={`h-4 w-4 shrink-0 ${color}`}
                aria-hidden="true"
              />
            </div>
            <p
              className={`mt-2 text-2xl font-bold tabular-nums sm:text-3xl ${color}`}
            >
              {number(value)}
            </p>
          </Card>
        ))}
      </div>

      <Card className="flex min-h-80 flex-1 flex-col overflow-hidden border-border/80 bg-card/70">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/5 text-primary">
              <Users className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">
                {isArabic ? "سجل الحضور المباشر" : "Live attendee stream"}
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {isArabic ? "آخر تسجيل يظهر أولاً" : "Latest check-ins first"}
              </p>
            </div>
          </div>
          <Badge
            variant="outline"
            className="gap-1.5 rounded-squircle border-border text-xs"
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${isLive ? "bg-primary" : "bg-muted-foreground"}`}
            />
            {isLive
              ? isArabic
                ? "جلسة مفتوحة"
                : "Session open"
              : isArabic
                ? "انتهت الجلسة"
                : "Session ended"}
          </Badge>
        </div>

        <div className="space-y-3 border-b border-border/60 p-4 sm:px-5">
          <div className="relative">
            <Search
              className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label={
                isArabic
                  ? "بحث باسم الطالب أو الكود"
                  : "Search by student name or code"
              }
              placeholder={
                isArabic
                  ? "ابحث باسم الطالب أو الكود…"
                  : "Search by name or student code…"
              }
              className="h-10 w-full bg-background/50 ps-9"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div
              className="flex flex-wrap gap-1.5"
              aria-label={
                isArabic ? "تصفية حالة الحضور" : "Filter attendance status"
              }
            >
              {(["all", "present", "late"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                  className={`inline-flex min-h-9 items-center gap-2 rounded-squircle border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${filter === value ? "border-primary/30 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:bg-secondary/50 hover:text-foreground"}`}
                >
                  {value === "all"
                    ? isArabic
                      ? "الكل"
                      : "All"
                    : value === "present"
                      ? isArabic
                        ? "حاضر"
                        : "Present"
                      : isArabic
                        ? "متأخر"
                        : "Late"}
                  <span className="tabular-nums opacity-80">
                    {number(
                      records.filter(
                        (record) => value === "all" || record.status === value,
                      ).length,
                    )}
                  </span>
                </button>
              ))}
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">
              {isArabic
                ? `${number(visible.length)} نتيجة`
                : `${number(visible.length)} shown`}
            </span>
          </div>
        </div>

        <div className="max-h-[36rem] flex-1 overflow-y-auto p-3 sm:p-4">
          {visible.length === 0 ? (
            <div className="flex min-h-52 flex-col items-center justify-center gap-3 px-4 text-center">
              {records.length === 0 ? (
                <QrCode
                  className="h-9 w-9 text-primary/50"
                  aria-hidden="true"
                />
              ) : (
                <Search
                  className="h-9 w-9 text-muted-foreground/50"
                  aria-hidden="true"
                />
              )}
              <p className="text-sm font-medium">
                {records.length === 0
                  ? isArabic
                    ? "لا توجد تسجيلات حتى الآن"
                    : "No check-ins yet"
                  : isArabic
                    ? "لا توجد نتائج مطابقة"
                    : "No matching students"}
              </p>
              <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
                {records.length === 0
                  ? isLive
                    ? isArabic
                      ? "ستظهر تسجيلات الطلاب هنا عند مسح رمز الحضور."
                      : "Students will appear here as they scan the attendance code."
                    : isArabic
                      ? "انتهت الجلسة بدون تسجيلات حضور."
                      : "This session ended without check-ins."
                  : isArabic
                    ? "جرّب اسماً أو كوداً آخر، أو امسح عوامل التصفية."
                    : "Try another name or code, or clear the filters."}
              </p>
              {records.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearch("");
                    setFilter("all");
                  }}
                >
                  {isArabic ? "مسح التصفية" : "Clear filters"}
                </Button>
              )}
            </div>
          ) : (
            <ul
              className="space-y-3"
              aria-label={isArabic ? "الطلاب المسجلون" : "Recorded students"}
            >
              {visible.map((record) => {
                const status = statuses[record.status];
                const device = getDevicePresentation(record.deviceInfo);
                const DeviceIcon =
                  device.kind === "phone"
                    ? Smartphone
                    : device.kind === "tablet"
                      ? Tablet
                      : device.kind === "computer"
                        ? Monitor
                        : CircleHelp;
                const distance = distanceFromHall(record.location, hall);
                const hasLocation =
                  record.location &&
                  Number.isFinite(record.location.latitude) &&
                  Number.isFinite(record.location.longitude);
                const date = new Date(record.checkedInAt);
                const dateLabel = date.toLocaleString(locale, {
                  timeZone: "Africa/Cairo",
                  dateStyle: "medium",
                  timeStyle: "short",
                });
                return (
                  <li
                    key={record._id}
                    className="min-w-0 overflow-hidden rounded-xl border border-border/70 bg-background/40 transition-colors hover:border-primary/25"
                  >
                    <div className="flex items-start gap-3 p-3 sm:p-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-secondary/40 text-muted-foreground">
                        <UserRound className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                          <div className="min-w-0 flex-1">
                            <p className="break-words text-sm font-semibold leading-relaxed text-foreground">
                              <bdi>{record.studentName}</bdi>
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {isArabic ? "كود الطالب" : "Student code"}{" "}
                              <bdi
                                dir="ltr"
                                className="ms-1 font-mono text-foreground/80"
                              >
                                {record.studentCode}
                              </bdi>
                            </p>
                          </div>
                          <Badge
                            variant="outline"
                            className={`shrink-0 gap-1 rounded-squircle ${status.className}`}
                          >
                            <status.Icon
                              className="h-3 w-3"
                              aria-hidden="true"
                            />
                            {status.label}
                          </Badge>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                          <time
                            dateTime={record.checkedInAt}
                            title={dateLabel}
                            className="inline-flex items-center gap-1.5 whitespace-nowrap tabular-nums"
                          >
                            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                            {date.toLocaleTimeString(locale, {
                              timeZone: "Africa/Cairo",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </time>
                          <span className="inline-flex items-center gap-1.5">
                            {record.method === "manual" ? (
                              <UserPlus
                                className="h-3.5 w-3.5"
                                aria-hidden="true"
                              />
                            ) : (
                              <QrCode
                                className="h-3.5 w-3.5"
                                aria-hidden="true"
                              />
                            )}
                            {record.method === "manual"
                              ? isArabic
                                ? "تسجيل يدوي"
                                : "Manual check-in"
                              : isArabic
                                ? "رمز الحضور"
                                : "QR check-in"}
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <MapPin
                              className="h-3.5 w-3.5"
                              aria-hidden="true"
                            />
                            {distance !== null
                              ? isArabic
                                ? `${number(distance)} متر من القاعة`
                                : `${number(distance)} m from hall`
                              : hasLocation
                                ? isArabic
                                  ? "الموقع مسجل"
                                  : "Location recorded"
                                : isArabic
                                  ? "بدون موقع"
                                  : "No location"}
                          </span>
                        </div>
                      </div>
                      <DropdownMenu.Root dir={isArabic ? "rtl" : "ltr"}>
                        <DropdownMenu.Trigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 shrink-0 text-muted-foreground"
                            aria-label={
                              isArabic
                                ? `إجراءات الطالب ${record.studentName}`
                                : `Actions for ${record.studentName}`
                            }
                          >
                            <MoreVertical
                              className="h-4 w-4"
                              aria-hidden="true"
                            />
                          </Button>
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Portal>
                          <DropdownMenu.Content
                            asChild
                            align="end"
                            sideOffset={4}
                          >
                            <div
                              dir={isArabic ? "rtl" : "ltr"}
                              className="z-50 min-w-44 rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-lg"
                            >
                              <DropdownMenu.Item
                                onSelect={() => onEdit(record)}
                                className="flex cursor-pointer items-center gap-2 rounded-squircle px-3 py-2 text-sm outline-none focus:bg-accent"
                              >
                                <Pencil
                                  className="h-4 w-4"
                                  aria-hidden="true"
                                />
                                {isArabic
                                  ? "تعديل حالة الحضور"
                                  : "Edit attendance status"}
                              </DropdownMenu.Item>
                            </div>
                          </DropdownMenu.Content>
                        </DropdownMenu.Portal>
                      </DropdownMenu.Root>
                    </div>
                    <details className="group border-t border-border/50">
                      <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 px-4 py-2 text-xs text-muted-foreground hover:bg-secondary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                        <span className="inline-flex items-center gap-2">
                          <ShieldCheck
                            className="h-3.5 w-3.5"
                            aria-hidden="true"
                          />
                          {isArabic
                            ? "تفاصيل التسجيل والجهاز"
                            : "Check-in & device details"}
                        </span>
                        <ChevronDown
                          className="h-3.5 w-3.5 transition-transform group-open:rotate-180"
                          aria-hidden="true"
                        />
                      </summary>
                      <div className="grid gap-2 border-t border-border/40 p-3 sm:grid-cols-2">
                        <Detail
                          icon={
                            <DeviceIcon
                              className="h-3.5 w-3.5"
                              aria-hidden="true"
                            />
                          }
                          label={
                            isArabic ? "الجهاز والمتصفح" : "Device & browser"
                          }
                        >
                          <bdi dir="ltr">
                            {device.label ||
                              (isArabic ? "غير متاح" : "Not available")}
                          </bdi>
                        </Detail>
                        <Detail
                          icon={
                            <Globe className="h-3.5 w-3.5" aria-hidden="true" />
                          }
                          label={isArabic ? "عنوان الشبكة" : "Network address"}
                        >
                          <bdi dir="ltr" className="font-mono">
                            {record.ipAddress ||
                              (isArabic ? "غير متاح" : "Not available")}
                          </bdi>
                        </Detail>
                        <Detail
                          icon={
                            <MapPin
                              className="h-3.5 w-3.5"
                              aria-hidden="true"
                            />
                          }
                          label={
                            isArabic ? "موقع التسجيل" : "Check-in location"
                          }
                        >
                          {hasLocation && record.location ? (
                            <div className="space-y-1.5">
                              <bdi dir="ltr" className="block font-mono">
                                {record.location.latitude.toFixed(6)},{" "}
                                {record.location.longitude.toFixed(6)}
                              </bdi>
                              {typeof record.location.accuracy === "number" && (
                                <p>
                                  {isArabic ? "دقة الموقع:" : "Accuracy:"}{" "}
                                  <bdi dir="ltr">
                                    ±{number(record.location.accuracy)}{" "}
                                    {isArabic ? "متر" : "m"}
                                  </bdi>
                                </p>
                              )}
                              <a
                                href={`https://www.google.com/maps?q=${record.location.latitude},${record.location.longitude}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex min-h-8 items-center gap-1.5 text-primary hover:underline"
                              >
                                {isArabic ? "عرض على الخريطة" : "View on map"}
                                <ExternalLink
                                  className="h-3 w-3"
                                  aria-hidden="true"
                                />
                              </a>
                            </div>
                          ) : isArabic ? (
                            "لم يتم إرسال موقع مع هذا التسجيل."
                          ) : (
                            "No location was supplied with this check-in."
                          )}
                        </Detail>
                        <Detail
                          icon={
                            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                          }
                          label={
                            isArabic
                              ? "وقت التسجيل (القاهرة)"
                              : "Check-in time (Cairo)"
                          }
                        >
                          <time dateTime={record.checkedInAt}>{dateLabel}</time>
                          {record.markedByName && (
                            <p className="mt-1">
                              {isArabic ? "سجله:" : "Recorded by:"}{" "}
                              <bdi>{record.markedByName}</bdi>
                            </p>
                          )}
                          {record.note && (
                            <p className="mt-1">
                              <bdi>{record.note}</bdi>
                            </p>
                          )}
                        </Detail>
                        {record.deviceFingerprint && (
                          <div className="min-w-0 px-1 text-xs text-muted-foreground sm:col-span-2">
                            {isArabic ? "معرّف الجهاز" : "Device fingerprint"}:{" "}
                            <bdi dir="ltr" className="break-all font-mono">
                              {record.deviceFingerprint}
                            </bdi>
                          </div>
                        )}
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {stats.total > records.length && (
          <p className="border-t border-border/60 px-5 py-3 text-xs text-muted-foreground">
            {isArabic
              ? `تم تحميل ${number(records.length)} من ${number(stats.total)} تسجيل. البحث والتصفية يشملان التسجيلات المحملة فقط.`
              : `${number(records.length)} of ${number(stats.total)} records loaded. Search and filters apply to loaded records.`}
          </p>
        )}
      </Card>
    </section>
  );
}
