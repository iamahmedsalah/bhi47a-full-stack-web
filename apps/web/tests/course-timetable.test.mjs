import assert from "node:assert/strict";
import { test } from "node:test";
import { paginateTimetableDay } from "../src/features/course-schedules/timetable-export-pagination.ts";
import {
  buildTimetable,
  filterScheduleEntries,
  parseScheduleTime,
  scheduleGroup,
  scheduleGroups,
  timetableCohorts,
  UNGROUPED,
} from "../src/features/course-schedules/timetable-model.ts";

const entry = (id, overrides = {}) => ({
  _id: id,
  courseCode: id,
  courseName: `Course ${id}`,
  staffName: "Instructor",
  type: "lecture",
  dayOfWeek: "saturday",
  startTime: "09:30 AM",
  endTime: "11:00 AM",
  location: "Hall 1",
  group: "A",
  level: "3",
  department: "BIS",
  semester: "first",
  ...overrides,
});
const placed = (model) =>
  model.days.flatMap((day) =>
    day.rows.flatMap((row) => row.cells.flatMap((cell) => cell?.entries ?? [])),
  );

test("PDF pagination keeps time rows and restores cells spanning page boundaries", () => {
  const classes = [entry("long", { startTime: "07:00", endTime: "15:00" })];
  for (let hour = 7; hour < 15; hour++)
    classes.push(
      entry(`hour-${hour}`, {
        group: "B",
        startTime: `${hour}:00`,
        endTime: `${hour + 1}:00`,
      }),
    );
  const day = buildTimetable(classes).days[0];
  const original = JSON.stringify(day);
  const pages = paginateTimetableDay(day);
  assert.equal(pages.length, 3);
  assert.deepEqual(
    pages.map((page) => page.rows[0].cells[0].rowSpan),
    [3, 3, 2],
  );
  assert.ok(
    pages.every((page) => page.rows[0].cells.every((cell) => cell !== null)),
  );
  assert.deepEqual(
    pages.flatMap((page) => page.rows.map((row) => [row.start, row.end])),
    day.rows.map((row) => [row.start, row.end]),
  );
  assert.deepEqual(
    pages
      .flatMap((page) =>
        page.rows.flatMap((row) =>
          row.cells.flatMap(
            (cell) =>
              cell?.entries
                .filter((item) => item._id !== "long")
                .map((item) => item._id) ?? [],
          ),
        ),
      )
      .sort(),
    classes
      .slice(1)
      .map((item) => item._id)
      .sort(),
  );
  assert.equal(
    JSON.stringify(day),
    original,
    "Export pagination does not mutate the screen model",
  );
  assert.throws(() => paginateTimetableDay(day, 0), RangeError);
});

test("time parsing orders noon and afternoon correctly, including Arabic digits and periods", () => {
  for (const [value, expected] of [
    ["09:30 AM", 570],
    ["11:00", 660],
    ["12:30 PM", 750],
    ["02:00 PM", 840],
    ["12:00 AM", 0],
    ["٠٩:٣٠ ص", 570],
    ["۰۲:۰۰ م", 840],
  ]) {
    assert.equal(parseScheduleTime(value), expected, value);
  }
  for (const value of [
    "13:00 PM",
    "00:30 AM",
    "12:60",
    "24:00",
    "bad time",
    "",
  ])
    assert.equal(parseScheduleTime(value), null, value);
});

test("matrix matches a group-column timetable and retains groups E and F", () => {
  const entries = ["A", "B", "C", "D", "E", "F"].map((group) =>
    entry(group, { group }),
  );
  const model = buildTimetable(entries);
  assert.deepEqual(
    model.columns.map((column) => column.group),
    ["A", "B", "C", "D", "E", "F"],
  );
  assert.deepEqual(
    model.days[0].rows.map((row) => [row.start, row.end]),
    [[570, 660]],
  );
  assert.equal(placed(model).length, 6);
});

test("group filtering matches sheet labels and preserves shared classes without an assigned group", () => {
  assert.equal(scheduleGroup("Group F (Lecture)"), "F");
  assert.equal(scheduleGroup("مجموعة A"), "A");
  assert.equal(scheduleGroup("المجموعة ب"), "ب");
  assert.equal(scheduleGroup(UNGROUPED), UNGROUPED);
  const entries = [
    entry("f", { group: "Group F (Lecture)" }),
    entry("blank", { group: "" }),
  ];
  assert.deepEqual(
    filterScheduleEntries(entries, { group: "F" }).map((item) => item._id),
    ["f", "blank"],
  );
  assert.deepEqual(
    filterScheduleEntries(entries, { group: UNGROUPED }).map(
      (item) => item._id,
    ),
    ["blank"],
  );
  assert.ok(scheduleGroups(entries).includes("F"));
});

test("different class durations use row spans, with each class represented exactly once", () => {
  const model = buildTimetable([
    entry("long", { group: "A", startTime: "09:00", endTime: "12:00" }),
    entry("short1", { group: "B", startTime: "09:00", endTime: "10:30" }),
    entry("short2", { group: "B", startTime: "10:30", endTime: "12:00" }),
  ]);
  assert.equal(model.days[0].rows[0].cells[0].rowSpan, 2);
  assert.equal(model.days[0].rows[1].cells[0], null);
  assert.deepEqual(
    placed(model)
      .map((item) => item._id)
      .sort(),
    ["long", "short1", "short2"],
  );
});

test("overlapping classes are retained and flagged, while adjacent classes are separate", () => {
  const overlapping = buildTimetable([
    entry("one", { startTime: "09:00", endTime: "11:00" }),
    entry("two", { startTime: "10:00", endTime: "12:00" }),
    entry("next", { startTime: "12:00", endTime: "13:00" }),
  ]);
  const first = overlapping.days[0].rows[0].cells[0];
  assert.equal(first.conflict, true);
  assert.equal(first.rowSpan, 3);
  assert.equal(first.entries.length, 2);
  assert.equal(placed(overlapping).length, 3);
  assert.equal(overlapping.days[0].rows.at(-1).cells[0].conflict, false);
});

test("separate section columns prevent two subgroups from being shown as a conflict", () => {
  const model = buildTimetable(
    [
      entry("one", { type: "section", section: "1" }),
      entry("two", { type: "lab", section: "2" }),
    ],
    true,
  );
  assert.equal(model.columns.length, 2);
  assert.ok(model.days[0].rows[0].cells.every((cell) => !cell.conflict));
});

test("cohorts separate the same group name across levels, departments and semesters", () => {
  assert.equal(
    timetableCohorts([
      entry("one"),
      entry("two", { level: "4" }),
      entry("three", { department: "ACCOUNTING" }),
      entry("four", { semester: "second" }),
    ]).length,
    4,
  );
});

test("invalid or reversed times remain available for review rather than disappearing", () => {
  const model = buildTimetable([
    entry("valid"),
    entry("bad", { startTime: "unknown" }),
    entry("reversed", { startTime: "12:00", endTime: "10:00" }),
    entry("day", { dayOfWeek: "unknown" }),
  ]);
  assert.deepEqual(
    placed(model).map((item) => item._id),
    ["valid"],
  );
  assert.deepEqual(
    model.unplaced.map((item) => item._id),
    ["bad", "reversed", "day"],
  );
});

test("filtering combines level, group, category, department, staff and search", () => {
  const entries = [
    entry("target", { type: "lab", staffId: "staff1", group: "F" }),
    entry("wrong-level", { level: "4", group: "F" }),
    entry("wrong-group", { group: "A" }),
  ];
  assert.deepEqual(
    filterScheduleEntries(entries, {
      level: "3",
      group: "F",
      category: "section",
      department: "BIS",
      staff: "staff1",
      search: "target",
    }).map((item) => item._id),
    ["target"],
  );
  assert.deepEqual(
    filterScheduleEntries(entries, { level: "3", type: "section" }),
    [],
  );
  assert.equal(
    filterScheduleEntries(entries, { search: "  instructor  " }).length,
    3,
  );
});

test("empty timetables and long gaps never create phantom classes", () => {
  assert.deepEqual(buildTimetable([]), { columns: [], days: [], unplaced: [] });
  const model = buildTimetable([
    entry("early", { startTime: "08:00", endTime: "09:00" }),
    entry("late", { startTime: "14:00", endTime: "15:00" }),
  ]);
  assert.deepEqual(
    model.days[0].rows.map((row) => [row.start, row.end]),
    [
      [480, 540],
      [840, 900],
    ],
  );
});
