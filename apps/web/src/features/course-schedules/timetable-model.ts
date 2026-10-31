export interface TimetableEntry {
  _id: string;
  courseCode: string;
  courseName: string;
  courseNameAr?: string;
  staffName: string;
  staffNameAr?: string;
  staffType?: string;
  type: "lecture" | "section" | "lab";
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  location: string;
  locationAr?: string;
  level: string;
  department?: string;
  semester?: string;
  group?: string;
  section?: string;
  isActive?: boolean;
}

export const TIMETABLE_DAYS = [
  "saturday",
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
] as const;
export const UNGROUPED = "__ungrouped__";
const collator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});

export function parseScheduleTime(value: string): number | null {
  const normalized = value
    .trim()
    .replace(/[٠-٩۰-۹]/g, (digit) =>
      String(
        "٠١٢٣٤٥٦٧٨٩".includes(digit)
          ? "٠١٢٣٤٥٦٧٨٩".indexOf(digit)
          : "۰۱۲۳۴۵۶۷۸۹".indexOf(digit),
      ),
    );
  const match = normalized.match(/^(\d{1,2}):(\d{2})\s*(am|pm|ص|م)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const period = match[3]?.toLowerCase();
  if (minute > 59 || hour > 23 || (period && (hour < 1 || hour > 12)))
    return null;
  if (period) hour = (hour % 12) + (period === "pm" || period === "م" ? 12 : 0);
  return hour * 60 + minute;
}

// Imported sheets use both "A" and "Group A (Lecture)" for the same group.
export function scheduleGroup(value?: string): string {
  if (value === UNGROUPED) return UNGROUPED;
  return (
    value
      ?.normalize("NFKC")
      .trim()
      .replace(/^(?:group|المجموعة|مجموعة)\s+/i, "")
      .replace(/\s*\((?:lecture|section|lab|محاضرة|سكشن|معمل)\)\s*$/i, "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase() || UNGROUPED
  );
}

export function scheduleGroups(entries: readonly TimetableEntry[]): string[] {
  return [...new Set(entries.map((entry) => scheduleGroup(entry.group)))].sort(
    collator.compare,
  );
}

export function filterScheduleEntries<T extends TimetableEntry>(
  entries: readonly T[],
  filters: {
    level?: string;
    group?: string;
    day?: string;
    department?: string;
    category?: string;
    type?: string;
    staff?: string;
    search?: string;
  },
): T[] {
  const search = filters.search?.trim().toLocaleLowerCase();
  return entries.filter((entry) => {
    if (
      filters.level &&
      filters.level !== "all" &&
      entry.level !== filters.level
    )
      return false;
    if (
      filters.group &&
      filters.group !== "all" &&
      scheduleGroup(entry.group) !== UNGROUPED &&
      scheduleGroup(entry.group) !== scheduleGroup(filters.group)
    )
      return false;
    if (filters.day && filters.day !== "all" && entry.dayOfWeek !== filters.day)
      return false;
    if (
      filters.department &&
      filters.department !== "all" &&
      entry.department !== filters.department
    )
      return false;
    if (filters.category === "lecture" && entry.type !== "lecture")
      return false;
    if (filters.category === "section" && entry.type === "lecture")
      return false;
    if (filters.type && filters.type !== "all" && entry.type !== filters.type)
      return false;
    if (
      filters.staff &&
      filters.staff !== "all" &&
      (!("staffId" in entry) || entry.staffId !== filters.staff)
    )
      return false;
    return (
      !search ||
      [
        entry.courseCode,
        entry.courseName,
        entry.courseNameAr,
        entry.staffName,
        entry.staffNameAr,
        entry.location,
        entry.locationAr,
        entry.group,
        entry.section,
      ].some((value) => value?.toLocaleLowerCase().includes(search))
    );
  });
}

export interface TimetableCell<T> {
  entries: T[];
  rowSpan: number;
  conflict: boolean;
}
export interface TimetableDay<T> {
  day: string;
  rows: { start: number; end: number; cells: (TimetableCell<T> | null)[] }[];
}
export interface TimetableModel<T> {
  columns: { key: string; group: string; section?: string }[];
  days: TimetableDay<T>[];
  unplaced: T[];
}

export function buildTimetable<T extends TimetableEntry>(
  entries: readonly T[],
  sections = false,
): TimetableModel<T> {
  const columnKey = (entry: T) =>
    JSON.stringify([
      scheduleGroup(entry.group),
      sections ? entry.section?.trim() || "" : "",
    ]);
  const columns = [
    ...new Map(
      entries.map((entry) => [
        columnKey(entry),
        {
          key: columnKey(entry),
          group: scheduleGroup(entry.group),
          section: sections ? entry.section?.trim() : undefined,
        },
      ]),
    ).values(),
  ].sort(
    (a, b) =>
      collator.compare(a.group, b.group) ||
      collator.compare(a.section || "", b.section || ""),
  );
  const unplaced: T[] = [];
  const valid: { entry: T; start: number; end: number }[] = [];
  for (const entry of entries) {
    const start = parseScheduleTime(entry.startTime);
    const end = parseScheduleTime(entry.endTime);
    if (
      start === null ||
      end === null ||
      end <= start ||
      !TIMETABLE_DAYS.some((day) => day === entry.dayOfWeek)
    )
      unplaced.push(entry);
    else valid.push({ entry, start, end });
  }
  const days: TimetableDay<T>[] = [];
  for (const day of TIMETABLE_DAYS) {
    const items = valid.filter((item) => item.entry.dayOfWeek === day);
    if (!items.length) continue;
    const boundaries = [
      ...new Set(items.flatMap((item) => [item.start, item.end])),
    ].sort((a, b) => a - b);
    const rows: TimetableDay<T>["rows"] = boundaries
      .slice(0, -1)
      .map((start, index) => ({
        start,
        end: boundaries[index + 1],
        cells: columns.map((): TimetableCell<T> | null => ({
          entries: [],
          rowSpan: 1,
          conflict: false,
        })),
      }))
      .filter((row) =>
        items.some((item) => item.start < row.end && item.end > row.start),
      );
    columns.forEach((column, columnIndex) => {
      const columnItems = items
        .filter((item) => columnKey(item.entry) === column.key)
        .sort((a, b) => a.start - b.start || a.end - b.end);
      const clusters: { start: number; end: number; entries: T[] }[] = [];
      for (const item of columnItems) {
        const previous = clusters.at(-1);
        // Overlaps stay together so no entry gets overwritten or repeated across
        // fragmented cells. Adjacent classes remain separate timetable cells.
        if (previous && item.start < previous.end) {
          previous.end = Math.max(previous.end, item.end);
          previous.entries.push(item.entry);
        } else
          clusters.push({
            start: item.start,
            end: item.end,
            entries: [item.entry],
          });
      }
      for (const cluster of clusters) {
        const first = rows.findIndex((row) => row.start === cluster.start);
        const span = rows.filter(
          (row) => row.start >= cluster.start && row.end <= cluster.end,
        ).length;
        rows[first].cells[columnIndex] = {
          entries: cluster.entries,
          rowSpan: span,
          conflict: cluster.entries.length > 1,
        };
        for (let offset = 1; offset < span; offset++)
          rows[first + offset].cells[columnIndex] = null;
      }
    });
    days.push({ day, rows });
  }
  return { columns, days, unplaced };
}

export function timetableCohorts<T extends TimetableEntry>(
  entries: readonly T[],
) {
  const cohorts = new Map<
    string,
    {
      key: string;
      level: string;
      department?: string;
      semester?: string;
      entries: T[];
    }
  >();
  for (const entry of entries) {
    const key = JSON.stringify([
      entry.level,
      entry.department || "",
      entry.semester || "",
    ]);
    if (!cohorts.has(key))
      cohorts.set(key, {
        key,
        level: entry.level,
        department: entry.department,
        semester: entry.semester,
        entries: [],
      });
    cohorts.get(key)!.entries.push(entry);
  }
  return [...cohorts.values()].sort(
    (a, b) =>
      collator.compare(a.level, b.level) ||
      collator.compare(a.department || "", b.department || "") ||
      collator.compare(a.semester || "", b.semester || ""),
  );
}
