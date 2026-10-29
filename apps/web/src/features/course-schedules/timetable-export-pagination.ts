import type { TimetableDay } from "./timetable-model";

/** Repeat cells that cross page boundaries and clip their spans to each page. */
export function paginateTimetableDay<T>(
  day: TimetableDay<T>,
  maxRows = 3,
): TimetableDay<T>[] {
  if (!Number.isInteger(maxRows) || maxRows < 1)
    throw new RangeError("Invalid page row limit");
  const pages: TimetableDay<T>[] = [];
  for (let start = 0; start < day.rows.length; start += maxRows) {
    const end = Math.min(start + maxRows, day.rows.length);
    pages.push({
      day: day.day,
      rows: day.rows.slice(start, end).map((row, index) => ({
        ...row,
        cells: row.cells.map((cell, column) => {
          if (cell)
            return {
              ...cell,
              rowSpan: Math.min(cell.rowSpan, end - start - index),
            };
          if (index > 0) return null;
          for (let origin = start - 1; origin >= 0; origin--) {
            const previous = day.rows[origin].cells[column];
            if (previous && origin + previous.rowSpan > start) {
              return {
                ...previous,
                rowSpan: Math.min(origin + previous.rowSpan, end) - start,
              };
            }
          }
          throw new Error("Timetable cell has no spanning origin");
        }),
      })),
    });
  }
  return pages;
}
