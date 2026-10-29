"use client";

import {
  buildTimetable,
  timetableCohorts,
  UNGROUPED,
  type TimetableEntry,
  type TimetableDay,
} from "./timetable-model";
import { paginateTimetableDay } from "./timetable-export-pagination";
import { downloadFileBlob } from "@/lib/export-utils";

export interface ScheduleExportItem extends TimetableEntry {
  courseNameAr?: string;
  locationAr?: string;
}

export interface ExportScheduleOptions {
  items: readonly ScheduleExportItem[];
  level?: string;
  department?: string;
  group?: string;
  categoryTab?: "all" | "lecture" | "section";
  locale?: string;
}

const LEVEL_NAMES_AR: Record<string, string> = {
  "1": "الفرقة الأولى",
  "2": "الفرقة الثانية",
  "3": "الفرقة الثالثة",
  "4": "الفرقة الرابعة",
};

const LEVEL_NAMES_EN: Record<string, string> = {
  "1": "Level 1",
  "2": "Level 2",
  "3": "Level 3",
  "4": "Level 4",
};

const DAY_LABELS_AR: Record<string, string> = {
  saturday: "السبت",
  sunday: "الأحد",
  monday: "الإثنين",
  tuesday: "الثلاثاء",
  wednesday: "الأربعاء",
  thursday: "الخميس",
  friday: "الجمعة",
};

const DAY_LABELS_EN: Record<string, string> = {
  saturday: "Saturday",
  sunday: "Sunday",
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
};

const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );

function formatMinutes(minutes: number, locale = "ar"): string {
  const hour24 = Math.floor(minutes / 60);
  const min = minutes % 60;
  const period =
    hour24 >= 12
      ? locale === "ar"
        ? "م"
        : "PM"
      : locale === "ar"
        ? "ص"
        : "AM";
  const hour12 = hour24 % 12 || 12;
  const formattedHour = String(hour12).padStart(2, "0");
  const formattedMin = String(min).padStart(2, "0");
  return `${formattedHour}:${formattedMin} ${period}`;
}

/**
 * Builds and captures an official landscape black-and-white matrix timetable image.
 */
function buildScheduleMarkup(
  options: ExportScheduleOptions,
  page?: TimetableDay<ScheduleExportItem>,
) {
  const {
    items,
    level,
    department,
    group,
    categoryTab = "all",
    locale = "ar",
  } = options;
  const isAr = locale === "ar";

  const levelName =
    !level || level === "all"
      ? isAr
        ? "جميع الفرق"
        : "All levels"
      : isAr
        ? LEVEL_NAMES_AR[level] || `الفرقة ${level}`
        : LEVEL_NAMES_EN[level] || `Level ${level}`;

  // Filter items by categoryTab if needed
  const filteredItems = items.filter((item) => {
    if (categoryTab === "lecture") return item.type === "lecture";
    if (categoryTab === "section")
      return item.type === "section" || item.type === "lab";
    return true;
  });

  const isSectionOnly = categoryTab === "section";
  const timetable = buildTimetable(filteredItems, isSectionOnly);

  // Fallback to grouped list if no valid matrix days
  const hasMatrixData =
    timetable.days.length > 0 && timetable.columns.length > 0;

  const categoryTitle =
    categoryTab === "lecture"
      ? isAr
        ? "جدول محاضرات أعضاء هيئة التدريس"
        : "Faculty Doctor Lectures Timetable"
      : categoryTab === "section"
        ? isAr
          ? "جدول سكاشن وتطبيقات الهيئة المعاونة"
          : "Teaching Assistants Sections Timetable"
        : isAr
          ? "الجدول الدراسي الأسبوعي المعتمد"
          : "Official Weekly Academic Timetable";

  const exportDate = new Date().toLocaleDateString(isAr ? "ar-EG" : "en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Africa/Cairo",
  });

  const departmentLabel =
    department && department !== "all"
      ? `${isAr ? "قسم: " : "Dept: "}${department}`
      : "";

  const groupLabel =
    group && group !== "all"
      ? isAr
        ? `مجموعة ${group}`
        : `Group ${group}`
      : "";

  // Header template: Crisp, official black and white
  const headerHtml = `
    <div style="border-bottom: 2px solid #000000; padding-bottom: 18px; margin-bottom: 22px;">
      <div style="display: flex; align-items: center; justify-content: space-between; gap:24px;">
        <div style="display:flex;align-items:center;gap:18px;flex:1;min-width:0;">
        <img data-schedule-logo src="/logo.webp" alt="${isAr ? "شعار المعهد" : "Institute logo"}" width="100" height="100" style="width:100px;height:100px;object-fit:contain;flex-shrink:0;" />
        <div style="text-align: ${isAr ? "right" : "left"};">
          <div style="font-size: 13px; font-weight: 700; color: #111111; letter-spacing: 0.5px;">
            ${isAr ? "وزارة التعليم العالي والبحث العلمي" : "Ministry of Higher Education and Scientific Research"}
          </div>
          <div style="font-size: 18px; font-weight: 800; color: #000000; margin-top: 2px;">
            ${isAr ? "المعهد العالي للعلوم الإدارية والتجارة الخارجية" : "Higher Institute of Management Sciences and Foreign Trade"}
          </div>
          <div style="font-size: 15px; font-weight: 800; color: #000000; margin-top: 6px;">
            ${categoryTitle} - ${escapeHtml(levelName)}
          </div>
        </div>
        </div>

        <div style="text-align: ${isAr ? "left" : "right"};">
          <div style="display: inline-block; border: 2px solid #000000; padding: 6px 16px; font-size: 14px; font-weight: 800; background: #F8FAFC;">
            ${escapeHtml(levelName)} ${departmentLabel ? `· ${escapeHtml(departmentLabel)}` : ""} ${groupLabel ? `· ${escapeHtml(groupLabel)}` : ""}
          </div>
          <div style="font-size: 12px; color: #333333; margin-top: 8px; font-weight: 600;">
            ${isAr ? "تاريخ الاستخراج:" : "Generated:"} ${exportDate}
          </div>
        </div>
      </div>
    </div>
  `;

  let tableHtml = "";

  if (hasMatrixData) {
    // Build Matrix Table
    const columnsHeaderHtml = timetable.columns
      .map((col) => {
        let colTitle = "";
        if (col.group === UNGROUPED) {
          colTitle = isAr ? "عام" : "General";
        } else {
          colTitle = isAr ? `مجموعة ${col.group}` : `Group ${col.group}`;
        }
        if (col.section) {
          colTitle += isAr ? ` (سكشن ${col.section})` : ` (Sec ${col.section})`;
        }
        return `
          <th style="border: 1px solid #000000; background-color: #F1F5F9; color: #000000; padding: 10px 8px; font-size: 13px; font-weight: 800; text-align: center; min-width: 150px;">
            ${escapeHtml(colTitle)}
          </th>
        `;
      })
      .join("");

    const daysHtml = (page ? [page] : timetable.days)
      .map((dayObj) => {
        const dayLabel = isAr
          ? DAY_LABELS_AR[dayObj.day] || dayObj.day
          : DAY_LABELS_EN[dayObj.day] || dayObj.day;

        const totalRows = dayObj.rows.length;

        return dayObj.rows
          .map((row, rowIndex) => {
            const timeLabel = `${formatMinutes(row.start, locale)}<br/><span style="font-size: 10px; color: #555555;">${isAr ? "إلى" : "to"}</span><br/>${formatMinutes(row.end, locale)}`;

            let dayCell = "";
            if (rowIndex === 0) {
              dayCell = `
                <td rowspan="${totalRows}" style="border: 1px solid #000000; background-color: #F8FAFC; color: #000000; font-size: 15px; font-weight: 800; text-align: center; vertical-align: middle; padding: 12px 10px; width: 100px;">
                  ${escapeHtml(dayLabel)}
                </td>
              `;
            }

            const timeCell = `
              <td style="border: 1px solid #000000; background-color: #FFFFFF; color: #000000; font-size: 11px; font-weight: 700; text-align: center; vertical-align: middle; padding: 8px 6px; width: 110px; line-height: 1.3;">
                ${timeLabel}
              </td>
            `;

            const dataCells = row.cells
              .map((cell) => {
                if (cell === null) return ""; // Spanned over by a previous row

                const spanAttr =
                  cell.rowSpan > 1 ? ` rowspan="${cell.rowSpan}"` : "";

                if (cell.entries.length === 0) {
                  return `<td${spanAttr} style="border: 1px solid #000000; background-color: #FFFFFF; text-align: center; vertical-align: middle; color: #CCCCCC; font-size: 12px;">—</td>`;
                }

                const entryCards = cell.entries
                  .map((entry) => {
                    const cName = isAr
                      ? entry.courseNameAr || entry.courseName
                      : entry.courseName;

                    const loc = isAr
                      ? entry.locationAr || entry.location
                      : entry.location;

                    const typeBadge =
                      entry.type === "lecture"
                        ? isAr
                          ? "محاضرة"
                          : "Lecture"
                        : isAr
                          ? "سكشن"
                          : "Section";

                    return `
                      <div data-export-entry="${escapeHtml(entry._id)}" style="margin-bottom: ${cell.entries.length > 1 ? "6px" : "0"}; padding: 4px; border-bottom: ${cell.entries.length > 1 ? "1px dashed #999999" : "none"};">
                        <div style="font-size: 13px; font-weight: 800; color: #000000; line-height: 1.25; margin-bottom: 2px;">
                          ${escapeHtml(cName)}
                        </div>
                        <div style="font-size: 11px; font-weight: 700; color: #222222; font-family: monospace;">
                          [ ${escapeHtml(entry.courseCode)} ] · ${typeBadge}
                        </div>
                        <div style="font-size: 11px; font-weight: 600; color: #111111; margin-top: 3px;">
                          ${escapeHtml(entry.staffName)}
                        </div>
                        <div style="font-size: 11px; font-weight: 700; color: #000000; margin-top: 2px;">
                          ${escapeHtml(loc)}
                        </div>
                      </div>
                    `;
                  })
                  .join("");

                return `
                  <td${spanAttr} style="border: 1px solid #000000; background-color: #FFFFFF; padding: 8px 6px; text-align: center; vertical-align: middle;">
                    ${entryCards}
                  </td>
                `;
              })
              .join("");

            return `
              <tr>
                ${dayCell}
                ${timeCell}
                ${dataCells}
              </tr>
            `;
          })
          .join("");
      })
      .join("");

    tableHtml = `
      <table style="width: 100%; border-collapse: collapse; border: 2px solid #000000; table-layout: fixed;">
        <thead>
          <tr>
            <th style="border: 1px solid #000000; background-color: #F1F5F9; color: #000000; padding: 10px 8px; font-size: 13px; font-weight: 800; text-align: center; width: 100px;">
              ${isAr ? "اليوم" : "Day"}
            </th>
            <th style="border: 1px solid #000000; background-color: #F1F5F9; color: #000000; padding: 10px 8px; font-size: 13px; font-weight: 800; text-align: center; width: 110px;">
              ${isAr ? "التوقيت" : "Time"}
            </th>
            ${columnsHeaderHtml}
          </tr>
        </thead>
        <tbody>
          ${daysHtml}
        </tbody>
      </table>
    `;
  } else {
    // Linear list table fallback
    const rowsHtml = filteredItems
      .map((item, idx) => {
        const dayName = isAr
          ? DAY_LABELS_AR[item.dayOfWeek.toLowerCase()] || item.dayOfWeek
          : DAY_LABELS_EN[item.dayOfWeek.toLowerCase()] || item.dayOfWeek;

        const cName = isAr
          ? item.courseNameAr || item.courseName
          : item.courseName;
        const loc = isAr ? item.locationAr || item.location : item.location;
        const typeBadge =
          item.type === "lecture"
            ? isAr
              ? "محاضرة"
              : "Lecture"
            : isAr
              ? "سكشن"
              : "Section";
        const grp = item.group
          ? isAr
            ? `مجموعة ${item.group}`
            : `Group ${item.group}`
          : isAr
            ? "عام"
            : "General";

        return `
          <tr data-export-entry="${escapeHtml(item._id)}" style="background-color: ${idx % 2 === 0 ? "#FFFFFF" : "#F9FAFB"};">
            <td style="border: 1px solid #000000; padding: 8px; font-weight: 700; text-align: center;">${escapeHtml(dayName)}</td>
            <td style="border: 1px solid #000000; padding: 8px; font-family: monospace; text-align: center;">${escapeHtml(item.startTime)} - ${escapeHtml(item.endTime)}</td>
            <td style="border: 1px solid #000000; padding: 8px; font-weight: 800;">${escapeHtml(cName)} (${escapeHtml(item.courseCode)})</td>
            <td style="border: 1px solid #000000; padding: 8px;">${escapeHtml(item.staffName)}</td>
            <td style="border: 1px solid #000000; padding: 8px; text-align: center;">${escapeHtml(loc)}</td>
            <td style="border: 1px solid #000000; padding: 8px; text-align: center;">${escapeHtml(grp)}</td>
            <td style="border: 1px solid #000000; padding: 8px; text-align: center; font-weight: 700;">${typeBadge}</td>
          </tr>
        `;
      })
      .join("");

    tableHtml = `
      <table style="width: 100%; border-collapse: collapse; border: 2px solid #000000;">
        <thead>
          <tr style="background-color: #F1F5F9;">
            <th style="border: 1px solid #000000; padding: 10px; font-size: 13px; font-weight: 800;">${isAr ? "اليوم" : "Day"}</th>
            <th style="border: 1px solid #000000; padding: 10px; font-size: 13px; font-weight: 800;">${isAr ? "الميعاد" : "Time"}</th>
            <th style="border: 1px solid #000000; padding: 10px; font-size: 13px; font-weight: 800;">${isAr ? "المقرر الدراسي" : "Course"}</th>
            <th style="border: 1px solid #000000; padding: 10px; font-size: 13px; font-weight: 800;">${isAr ? "المحاضر" : "Instructor"}</th>
            <th style="border: 1px solid #000000; padding: 10px; font-size: 13px; font-weight: 800;">${isAr ? "القاعة / المدرج" : "Hall"}</th>
            <th style="border: 1px solid #000000; padding: 10px; font-size: 13px; font-weight: 800;">${isAr ? "المجموعة" : "Group"}</th>
            <th style="border: 1px solid #000000; padding: 10px; font-size: 13px; font-weight: 800;">${isAr ? "النوع" : "Type"}</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    `;
  }

  // Footer Template: Black & White official stamp note
  const footerHtml = `
    <div style="border-top: 2px solid #000000; padding-top: 14px; margin-top: 22px; display: flex; align-items: center; justify-content: space-between; font-size: 12px; font-weight: 600; color: #222222;">
      <div>
        <span>${isAr ? "بوابة المعهد الأكاديمية الذكية · جدول دراسي رسمي ومعتمد" : "Smart Institute Portal · Official Academic Timetable"}</span>
      </div>
      <div>
        <span>${isAr ? "يعتمد عميد المعهد / وكيل شؤون التعليم والطلاب" : "Approved by the Dean of the Institute / Vice Dean"}</span>
      </div>
    </div>
  `;

  if (hasMatrixData && timetable.unplaced.length && !page) {
    tableHtml += `<h4>${isAr ? "مواعيد تحتاج مراجعة" : "Times requiring review"}</h4>`;
    tableHtml += buildScheduleMarkup({
      ...options,
      items: timetable.unplaced,
    }).tableHtml;
  }
  return {
    headerHtml,
    tableHtml,
    footerHtml,
    levelName,
    columns: timetable.columns.length,
  };
}

/** Export the filtered data, including all cohorts and all offscreen columns. */
export type ScheduleExportFormat = "png" | "pdf";

export const exportScheduleAsLandscapeImage = (
  options: ExportScheduleOptions,
) => exportSchedule(options, "png");
export const exportScheduleAsLandscapePdf = (options: ExportScheduleOptions) =>
  exportSchedule(options, "pdf");

async function exportSchedule(
  options: ExportScheduleOptions,
  format: ScheduleExportFormat,
): Promise<void> {
  if (typeof document === "undefined")
    throw new Error("PNG export requires a browser");
  const { locale = "ar", categoryTab = "all" } = options;
  const isAr = locale === "ar";
  const items = options.items.filter(
    (item) =>
      categoryTab === "all" ||
      (categoryTab === "lecture"
        ? item.type === "lecture"
        : item.type !== "lecture"),
  );
  if (!items.length) throw new Error("No timetable entries to export");
  const summary = buildScheduleMarkup({ ...options, items });
  let maxColumns = 1;
  const pdfPages: { html: string; columns: number }[] = [];
  const semesterNames: Record<string, string> = isAr
    ? {
        first: "الفصل الدراسي الأول",
        second: "الفصل الدراسي الثاني",
        summer: "الفصل الصيفي",
      }
    : {
        first: "First semester",
        second: "Second semester",
        summer: "Summer semester",
      };
  const tables = timetableCohorts(items)
    .map((cohort) => {
      const label = [
        isAr
          ? LEVEL_NAMES_AR[cohort.level] || cohort.level
          : `Level ${cohort.level}`,
        cohort.department,
        semesterNames[cohort.semester || ""] || cohort.semester,
      ]
        .filter(Boolean)
        .join(" · ");
      const categories = (["lecture", "section"] as const)
        .map((category) => {
          const subset = cohort.entries.filter((item) =>
            category === "lecture"
              ? item.type === "lecture"
              : item.type !== "lecture",
          );
          if (!subset.length) return "";
          const report = buildScheduleMarkup({
            ...options,
            items: subset,
            level: cohort.level,
            categoryTab: category,
          });
          maxColumns = Math.max(maxColumns, report.columns);
          const title =
            category === "lecture"
              ? isAr
                ? "المحاضرات"
                : "Lectures"
              : isAr
                ? "السكاشن والتطبيقات العملية"
                : "Sections and labs";
          if (format === "pdf") {
            const model = buildTimetable(subset, category === "section");
            const reportOptions = {
              ...options,
              items: subset,
              level: cohort.level,
              categoryTab: category,
            };
            const heading = `<h2 style="font-size:20px;margin:12px 0;color:#111">${escapeHtml(label)} · ${title}</h2>`;
            for (const day of model.days) {
              for (const page of paginateTimetableDay(day)) {
                const fragment = buildScheduleMarkup(reportOptions, page);
                pdfPages.push({
                  html:
                    fragment.headerHtml +
                    heading +
                    fragment.tableHtml +
                    fragment.footerHtml,
                  columns: model.columns.length,
                });
              }
            }
            // Invalid times stay visible in their own review pages.
            for (let index = 0; index < model.unplaced.length; index += 3) {
              const fragment = buildScheduleMarkup({
                ...reportOptions,
                items: model.unplaced.slice(index, index + 3),
              });
              pdfPages.push({
                html:
                  fragment.headerHtml +
                  heading +
                  fragment.tableHtml +
                  fragment.footerHtml,
                columns: model.columns.length,
              });
            }
          }
          return `<section><h3 style="font-size:18px;margin:16px 0 10px;color:#111">${title}</h3>${report.tableHtml}</section>`;
        })
        .join("");
      return `<section><h2 style="font-size:22px;margin:24px 0 12px;padding:10px;background:#edf4f5;color:#111;border:1px solid #899">${escapeHtml(label)}</h2>${categories}</section>`;
    })
    .join("");
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.inert = true;
  // Hide only the parent: html-to-image captures the child with opacity 1.
  host.style.cssText =
    "position:fixed;top:0;left:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;z-index:-1";
  const container = document.createElement("div");
  container.dataset.scheduleExport = "";
  container.dir = isAr ? "rtl" : "ltr";
  container.style.cssText =
    "background:#fff;color:#111;box-sizing:border-box;padding:32px 40px;font:14px/1.6 Cairo,Arial,sans-serif;opacity:1;visibility:visible;max-width:none;";
  container.style.width = `${Math.max(1440, 360 + maxColumns * 180)}px`;
  container.innerHTML = summary.headerHtml + tables + summary.footerHtml;
  container.querySelectorAll("td, th").forEach((cell) => {
    (cell as HTMLElement).style.overflowWrap = "anywhere";
  });
  host.appendChild(container);
  document.body.appendChild(host);

  try {
    await document.fonts.ready;
    await document.fonts.load("700 15px Cairo");
    const filename =
      `${isAr ? "جدول" : "Schedule"}_${summary.levelName}_${options.group && options.group !== "all" ? options.group : ""}_${categoryTab}`
        .replace(/[\\/:*?"<>|\r\n]/g, "-")
        .replace(/\s+/g, "_")
        .slice(0, 160);
    if (format === "pdf") {
      if (!pdfPages.length) throw new Error("No timetable pages to export");
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
        compress: true,
      });
      pdf.setProperties({
        title: isAr
          ? "جدول المحاضرات والسكاشن"
          : "Lecture and section timetable",
      });
      for (const [index, page] of pdfPages.entries()) {
        if (index) pdf.addPage("a4", "landscape");
        container.dataset.scheduleExportPage = String(index + 1);
        container.style.width = `${Math.max(1440, 360 + page.columns * 180)}px`;
        const number = new Intl.NumberFormat(isAr ? "ar-EG" : "en-GB");
        container.innerHTML =
          page.html +
          `<div style="text-align:center;font-size:12px;color:#333;margin-top:8px;">${isAr ? "صفحة" : "Page"} ${number.format(index + 1)} / ${number.format(pdfPages.length)}</div>`;
        const canvas = await captureTimetable(container);
        const margin = 10;
        const width = pdf.internal.pageSize.getWidth() - margin * 2;
        const height = pdf.internal.pageSize.getHeight() - margin * 2;
        const scale = Math.min(width / canvas.width, height / canvas.height);
        const imageWidth = canvas.width * scale;
        const imageHeight = canvas.height * scale;
        pdf.addImage(
          canvas.toDataURL("image/jpeg", 0.96),
          "JPEG",
          margin + (width - imageWidth) / 2,
          margin,
          imageWidth,
          imageHeight,
        );
      }
      await downloadFileBlob(
        pdf.output("blob"),
        filename + ".pdf",
        "application/pdf",
      );
      return;
    }
    const canvas = await captureTimetable(container);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (result) =>
          result ? resolve(result) : reject(new Error("Could not encode PNG")),
        "image/png",
      ),
    );
    await downloadFileBlob(blob, filename + ".png", "image/png");
  } finally {
    host.remove();
  }
}

async function captureTimetable(
  container: HTMLElement,
): Promise<HTMLCanvasElement> {
  await Promise.all(
    Array.from(container.querySelectorAll("img")).map((image) =>
      image.decode(),
    ),
  );
  container.querySelectorAll("td, th").forEach((cell) => {
    (cell as HTMLElement).style.overflowWrap = "anywhere";
  });
  const width = Math.ceil(container.getBoundingClientRect().width);
  const height = Math.ceil(container.scrollHeight);
  if (!width || !height) throw new Error("Timetable has no renderable size");
  // Keep long all-level exports within mobile canvas limits without cropping.
  const pixelRatio = Math.min(
    2,
    Math.sqrt(12_000_000 / (width * height)),
    8192 / width,
    8192 / height,
  );
  const { toCanvas } = await import("html-to-image");
  const canvas = await toCanvas(container, {
    width,
    height,
    pixelRatio,
    backgroundColor: "#FFFFFF",
    style: {
      opacity: "1",
      visibility: "visible",
      position: "static",
      transform: "none",
      margin: "0",
    },
  });
  const sample = document.createElement("canvas");
  sample.width = sample.height = 128;
  const context = sample.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable");
  context.drawImage(canvas, 0, 0, 128, 128);
  const pixels = context.getImageData(0, 0, 128, 128).data;
  if (!pixels.some((channel, index) => index % 4 !== 3 && channel < 245))
    throw new Error("Timetable image is blank");
  return canvas;
}
