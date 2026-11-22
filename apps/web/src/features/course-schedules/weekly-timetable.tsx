"use client";

import { curriculumDepartmentLabel } from "@student-portal/shared";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  AlertTriangle,
  BookOpen,
  CalendarDays,
  Clock,
  GraduationCap,
  MapPin,
  MoreVertical,
  Pencil,
  Trash2,
  User,
} from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Button } from "@/components/ui/button";
import { formatStaffDisplayName } from "@student-portal/shared";
import {
  buildTimetable,
  timetableCohorts,
  UNGROUPED,
  type TimetableEntry,
} from "./timetable-model";

interface Props<T extends TimetableEntry> {
  entries: readonly T[];
  category?: "all" | "lecture" | "section";
  onEdit?: (entry: T) => void;
  onDelete?: (entry: T) => void;
}

function ScheduleEntry<T extends TimetableEntry>({
  entry,
  onEdit,
  onDelete,
}: { entry: T } & Pick<Props<T>, "onEdit" | "onDelete">) {
  const t = useTranslations("courseTimetable");
  const ar = useLocale() === "ar";
  return (
    <div
      className="space-y-2 px-3 py-3.5 text-start print:break-inside-avoid"
      data-schedule-id={entry._id}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="break-words text-xs font-bold leading-relaxed text-foreground print:text-black">
            <bdi>
              {ar ? entry.courseNameAr || entry.courseName : entry.courseName}
            </bdi>
          </p>
          <p className="mt-1 text-[10px] font-medium text-primary print:text-black">
            <bdi>{entry.courseCode}</bdi>
            {entry.type === "lab" && (
              <span className="ms-2 rounded-squircle border border-primary/20 px-1.5">
                {t("lab")}
              </span>
            )}
          </p>
        </div>
        {onEdit && (
          <DropdownMenu.Root dir={ar ? "rtl" : "ltr"}>
            <DropdownMenu.Trigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("entryActions", {
                  course: ar
                    ? entry.courseNameAr || entry.courseName
                    : entry.courseName,
                })}
                className="size-7 shrink-0 rounded-squircle text-muted-foreground print:hidden"
              >
                <MoreVertical className="size-4" aria-hidden="true" />
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content asChild align="end" sideOffset={4}>
                <div
                  dir={ar ? "rtl" : "ltr"}
                  className="z-50 min-w-40 rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-xl"
                >
                  <DropdownMenu.Item
                    onSelect={() => onEdit(entry)}
                    className="flex cursor-pointer items-center gap-2 rounded-squircle px-3 py-2 text-start text-xs outline-none focus:bg-secondary"
                  >
                    <Pencil className="size-3.5" aria-hidden="true" />
                    {t("edit")}
                  </DropdownMenu.Item>
                  {onDelete && (
                    <>
                      <DropdownMenu.Separator className="my-1 h-px bg-border" />
                      <DropdownMenu.Item
                        onSelect={() => onDelete(entry)}
                        className="flex cursor-pointer items-center gap-2 rounded-squircle px-3 py-2 text-start text-xs text-destructive outline-none focus:bg-destructive/10"
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                        {t("delete")}
                      </DropdownMenu.Item>
                    </>
                  )}
                </div>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        )}
      </div>
      <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground print:text-black">
        <User className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
        <bdi>
          {formatStaffDisplayName(
            {
              name: entry.staffName,
              nameAr: entry.staffNameAr,
              titlePrefix: entry.titlePrefix,
              staffType:
                entry.staffType ||
                (entry.type === "lecture" ? "doctor" : "teaching_assistant"),
            },
            ar ? "ar" : "en",
          )}
        </bdi>
      </p>
      <p className="flex items-start gap-1.5 text-[11px] font-medium leading-relaxed text-foreground print:text-black">
        <MapPin
          className="mt-0.5 size-3 shrink-0 text-primary print:text-black"
          aria-hidden="true"
        />
        <bdi>{ar ? entry.locationAr || entry.location : entry.location}</bdi>
      </p>
      <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground print:text-black">
        <Clock className="size-3 shrink-0" aria-hidden="true" />
        <bdi dir="ltr">
          {entry.startTime} – {entry.endTime}
        </bdi>
      </p>
      {entry.isActive === false && (
        <span className="inline-block rounded-squircle border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {t("inactive")}
        </span>
      )}
    </div>
  );
}

function Timetable<T extends TimetableEntry>({
  entries,
  sections,
  onEdit,
  onDelete,
}: Props<T> & { sections: boolean }) {
  const t = useTranslations("courseTimetable");
  const locale = useLocale();
  const model = useMemo(
    () => buildTimetable(entries, sections),
    [entries, sections],
  );
  const title = t(sections ? "sections" : "lectures");
  const Icon = sections ? GraduationCap : BookOpen;
  const number = new Intl.NumberFormat(locale);
  const time = (minutes: number) => {
    const hour = Math.floor(minutes / 60);
    const format = new Intl.NumberFormat(locale, { minimumIntegerDigits: 2 });
    return `${format.format(hour % 12 || 12)}:${format.format(minutes % 60)} ${t(hour >= 12 ? "pm" : "am")}`;
  };
  const groupLabel = (group: string) =>
    group === UNGROUPED ? t("ungrouped") : t("group", { group });

  return (
    <section
      className={`min-w-0 overflow-hidden rounded-xl border bg-card print:rounded-none print:border-gray-400 print:bg-white ${sections ? "border-violet-500/25" : "border-primary/25"}`}
      aria-label={title}
    >
      <div
        className={`flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 print:border-gray-400 ${sections ? "bg-violet-500/5" : "bg-primary/5"}`}
      >
        <h3 className="flex items-center gap-2 text-sm font-bold print:text-black">
          <Icon
            className={`size-4 ${sections ? "text-violet-500" : "text-primary"} print:text-black`}
            aria-hidden="true"
          />
          {title}
        </h3>
        <span className="rounded-squircle border border-border/60 bg-background/50 px-2.5 py-1 text-[11px] font-medium text-muted-foreground print:text-black">
          {t("entryCount", { count: number.format(entries.length) })}
        </span>
      </div>
      {model.days.length > 0 ? (
        <div
          tabIndex={0}
          role="region"
          aria-label={t("scrollTable", { title })}
          className="relative max-h-[76vh] overflow-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary print:max-h-none print:overflow-visible"
        >
          <table
            className="w-full table-fixed border-separate border-spacing-0 text-xs print:min-w-0!"
          style={{ minWidth: 190 + model.columns.length * 160 }}
          >
            <caption className="sr-only">{t("caption", { title })}</caption>
            <colgroup>
              <col style={{ width: 90 }} />
              <col style={{ width: 100 }} />
              {model.columns.map((column) => (
                <col key={column.key} />
              ))}
            </colgroup>
            <thead className="sticky top-0 z-30 bg-card print:static print:bg-white">
              <tr>
                <th
                  scope="col"
                  className="sticky start-0 z-40 border-b border-e border-border bg-secondary p-3 text-center font-bold text-foreground print:static print:border-gray-400 print:bg-gray-100 print:text-black"
                >
                  {t("day")}
                </th>
                <th
                  scope="col"
                  className="sticky start-[90px] z-40 border-b border-e border-border bg-secondary p-3 text-center font-bold text-foreground print:static print:border-gray-400 print:bg-gray-100 print:text-black"
                >
                  {t("time")}
                </th>
                {model.columns.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    className={`border-b border-e border-border px-3 py-3 text-center font-bold text-foreground print:border-gray-400 print:bg-gray-100 print:text-black ${sections ? "bg-violet-500/10" : "bg-primary/10"}`}
                  >
                    <bdi>{groupLabel(column.group)}</bdi>
                    {column.section && (
                      <span className="mt-1 block text-[10px] font-medium text-muted-foreground print:text-black">
                        <bdi>{t("section", { section: column.section })}</bdi>
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            {model.days.map((day) => (
              <tbody key={day.day} className="print:break-inside-avoid">
                {day.rows.map((row, rowIndex) => (
                  <tr key={row.start}>
                    {rowIndex === 0 && (
                      <th
                        scope="rowgroup"
                        rowSpan={day.rows.length}
                        className="sticky start-0 z-20 border-b-2 border-e border-border bg-secondary p-3 text-center align-middle font-bold text-foreground print:static print:border-gray-400 print:bg-gray-100 print:text-black"
                      >
                        {t(`days.${day.day}`)}
                      </th>
                    )}
                    <th
                      scope="row"
                      className={`sticky start-[90px] z-10 border-b border-e border-border bg-card px-2 py-4 text-center align-middle text-[11px] font-medium text-foreground print:static print:border-gray-400 print:bg-white print:text-black ${rowIndex === day.rows.length - 1 ? "border-b-2" : ""}`}
                    >
                      <bdi className="block whitespace-nowrap" dir="ltr">
                        {time(row.start)}
                      </bdi>
                      <span className="my-1 block text-[9px] font-normal text-muted-foreground">
                        {t("until")}
                      </span>
                      <bdi className="block whitespace-nowrap" dir="ltr">
                        {time(row.end)}
                      </bdi>
                    </th>
                    {row.cells.map(
                      (cell, index) =>
                        cell && (
                          <td
                            key={model.columns[index].key}
                            rowSpan={cell.rowSpan}
                            className={`border-b border-e border-border align-top print:border-gray-400 print:bg-white ${cell.entries.length ? (sections ? "bg-violet-500/[0.035]" : "bg-primary/[0.035]") : "bg-background/20"} ${rowIndex + cell.rowSpan === day.rows.length ? "border-b-2" : ""}`}
                          >
                            {cell.conflict && (
                              <p className="flex items-center gap-1.5 border-b border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[10px] font-medium text-amber-700 dark:text-amber-300 print:text-black">
                                <AlertTriangle
                                  className="size-3 shrink-0"
                                  aria-hidden="true"
                                />
                                {t("overlap")}
                              </p>
                            )}
                            {cell.entries.length ? (
                              <div className="divide-y divide-border/60">
                                {cell.entries.map((entry) => (
                                  <ScheduleEntry
                                    key={entry._id}
                                    entry={entry}
                                    onEdit={onEdit}
                                    onDelete={onDelete}
                                  />
                                ))}
                              </div>
                            ) : (
                              <div className="flex min-h-28 items-center justify-center text-muted-foreground/40">
                                <span aria-hidden="true">—</span>
                                <span className="sr-only">{t("free")}</span>
                              </div>
                            )}
                          </td>
                        ),
                    )}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      ) : (
        <p className="p-6 text-center text-sm text-muted-foreground">
          {t("empty")}
        </p>
      )}
      {model.unplaced.length > 0 && (
        <div className="border-t border-amber-500/25 bg-amber-500/5 p-4">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
            {t("unplaced")}
          </p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {model.unplaced.map((entry) => (
              <div
                key={entry._id}
                className="rounded-xl border border-border bg-card"
              >
                <ScheduleEntry
                  entry={entry}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export function WeeklyTimetable<T extends TimetableEntry>({
  entries,
  category = "all",
  onEdit,
  onDelete,
}: Props<T>) {
  const t = useTranslations("courseTimetable");
  const locale = useLocale();
  const cohorts = useMemo(() => timetableCohorts(entries), [entries]);
  return (
    <div
      className="min-w-0 space-y-7"
      dir={locale === "ar" ? "rtl" : "ltr"}
      data-testid="weekly-timetable"
    >
      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground print:hidden">
        <CalendarDays
          className="mt-0.5 size-4 shrink-0 text-primary"
          aria-hidden="true"
        />
        {t("hint")}
      </p>
      {cohorts.map((cohort) => (
        <div
          key={cohort.key}
          className="min-w-0 space-y-4"
          data-testid="timetable-cohort"
        >
          <h2 className="flex flex-wrap items-center gap-2 border-s-2 border-primary ps-3 text-sm font-bold print:text-black">
            <span>
              {t("level", {
                level: Number.isFinite(Number(cohort.level))
                  ? new Intl.NumberFormat(locale).format(Number(cohort.level))
                  : cohort.level,
              })}
            </span>
            {cohort.department && (
              <>
                <span className="text-border" aria-hidden="true">
                  /
                </span>
                <bdi>
                  {curriculumDepartmentLabel(cohort.department, locale)}
                </bdi>
              </>
            )}
            {cohort.semester && (
              <>
                <span className="text-border" aria-hidden="true">
                  /
                </span>
                <span className="font-medium text-muted-foreground print:text-black">
                  {t(
                    ["first", "second", "summer"].includes(cohort.semester)
                      ? `semesters.${cohort.semester}`
                      : "unknownSemester",
                  )}
                </span>
              </>
            )}
          </h2>
          {category !== "section" && (
            <Timetable
              entries={cohort.entries.filter(
                (entry) => entry.type === "lecture",
              )}
              sections={false}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          )}
          {category !== "lecture" && (
            <Timetable
              entries={cohort.entries.filter(
                (entry) => entry.type !== "lecture",
              )}
              sections
              onEdit={onEdit}
              onDelete={onDelete}
            />
          )}
        </div>
      ))}
    </div>
  );
}
