/** Actual admin/student schedule pages with local fixtures; no live API or database. */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const web = path.join(root, "apps/web");
const requireWeb = createRequire(path.join(web, "package.json"));
const requireApi = createRequire(path.join(root, "apps/api/package.json"));
const { webpack } = requireWeb("next/dist/compiled/webpack/webpack");
const { chromium } = requireApi("playwright");
const output = path.join(root, "outputs/timetable-review");
const courses = [
  {
    _id: "100000000000000000000001",
    code: "312",
    name: "Database Systems",
    nameAr: "قواعد البيانات",
  },
  {
    _id: "100000000000000000000002",
    code: "313",
    name: "Computer Programming",
    nameAr: "تصميم برامج الحاسب",
  },
  {
    _id: "100000000000000000000003",
    code: "314",
    name: "Investment Principles",
    nameAr: "مبادئ الاستثمار",
  },
];
const staff = courses.map((_, index) => ({
  _id: `20000000000000000000000${index + 1}`,
  name: `Instructor ${index + 1}`,
  nameAr: `د. أستاذ ${index + 1}`,
  staffType: "doctor",
  role: "staff",
}));
const times = [
  ["09:30 AM", "11:00 AM"],
  ["11:00 AM", "12:30 PM"],
  ["12:30 PM", "02:00 PM"],
];
let entries = [];
for (const [groupIndex, group] of ["A", "B", "C", "D", "E", "F"].entries()) {
  for (let slot = 0; slot < 3; slot++) {
    const course = courses[(groupIndex + slot) % 3];
    entries.push({
      _id: `lecture-${group}-${slot}`,
      courseId: course._id,
      courseCode: course.code,
      courseName: course.name,
      courseNameAr: course.nameAr,
      staffId: staff[(groupIndex + slot) % 3]._id,
      staffName: staff[(groupIndex + slot) % 3].nameAr,
      staffType: "doctor",
      type: "lecture",
      dayOfWeek: groupIndex % 2 ? "sunday" : "saturday",
      startTime: times[slot][0],
      endTime: times[slot][1],
      location: `Hall ${groupIndex + 1}`,
      locationAr: `مدرج ${groupIndex + 1}`,
      level: "3",
      department: "BIS",
      semester: "first",
      group: `Group ${group} (Lecture)`,
      isActive: true,
    });
  }
}
entries.push(
  {
    ...entries[0],
    _id: "section-1",
    type: "section",
    dayOfWeek: "monday",
    group: "A",
    section: "1",
    location: "Lab 1",
    locationAr: "معمل 1",
  },
  {
    ...entries[1],
    _id: "section-2",
    type: "lab",
    dayOfWeek: "monday",
    startTime: "09:30 AM",
    endTime: "11:00 AM",
    group: "A",
    section: "2",
    location: "Lab 2",
    locationAr: "معمل 2",
  },
  { ...entries[2], _id: "level4", level: "4", group: "F" },
);
const mutations = [];
let scenario = "normal";
await fs.mkdir(output, { recursive: true });
await fs.writeFile(
  path.join(output, "loader.cjs"),
  `const ts = require(${JSON.stringify(requireWeb.resolve("typescript"))}); module.exports = function(source) { return ts.transpileModule(source, { compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,esModuleInterop:true} }).outputText; };`,
);
await fs.writeFile(
  path.join(output, "auth.ts"),
  `export const useAuth = () => ({user:{_id:'fixture-user',name:'Reviewer',role:new URLSearchParams(location.search).get('role') || (location.pathname.includes('/admin/') ? 'admin':'student'),permissions:[],mustChangePassword:false}});`,
);
await fs.writeFile(
  path.join(output, "navigation.ts"),
  `
  import {useMemo,useSyncExternalStore} from 'react';
  const listeners=new Set(); const emit=()=>listeners.forEach(fn=>fn());
  window.addEventListener('popstate',emit);
  const subscribe=fn=>{listeners.add(fn); return ()=>listeners.delete(fn);};
  export const useParams=()=>({locale:location.pathname.split('/')[1]});
  export const usePathname=()=>location.pathname;
  export const useSearchParams=()=>{ const search=useSyncExternalStore(subscribe,()=>location.search,()=> ''); return useMemo(()=>new URLSearchParams(search),[search]); };
  export const useRouter=()=>useMemo(()=>({replace:url=>{history.replaceState(null,'',url);emit();}}),[]);`,
);
await fs.writeFile(
  path.join(output, "api.ts"),
  `
  const call=async(method,url,body)=>{const res=await fetch(url,{method,headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}); const data=await res.json(); if(!res.ok) throw data; return {data};};
  export const getApiErrorMessage=(error,fallback)=>error.message||fallback;
  export const getApiErrorDetails=error=>error;
  export const EXCEL_MIME_TYPE='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  export const apiBaseUrl='';
  export default {get:url=>call('GET',url),patch:(url,body)=>call('PATCH',url,body),post:(url,body)=>call('POST',url,body),delete:url=>call('DELETE',url)};`,
);
await fs.writeFile(
  path.join(output, "entry.tsx"),
  `
  import React from 'react'; import {createRoot} from 'react-dom/client';
  import {NextIntlClientProvider} from 'next-intl'; import {QueryClient,QueryClientProvider} from '@tanstack/react-query'; import {Toaster} from 'sonner';
  import ar from '${path.join(web, "src/messages/ar.json").replaceAll("\\", "/")}'; import en from '${path.join(web, "src/messages/en.json").replaceAll("\\", "/")}';
  import Admin from '${path.join(web, "src/app/[locale]/admin/schedules/page.tsx").replaceAll("\\", "/")}';
  import Student from '${path.join(web, "src/app/[locale]/dashboard/schedules/page.tsx").replaceAll("\\", "/")}';
  const locale=location.pathname.split('/')[1]; document.documentElement.dir=locale==='ar'?'rtl':'ltr';
  createRoot(document.getElementById('root')).render(<NextIntlClientProvider locale={locale} messages={locale==='ar'?ar:en} timeZone="Africa/Cairo"><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}>{location.pathname.includes('/admin/')?<Admin/>:<Student/>}<Toaster/></QueryClientProvider></NextIntlClientProvider>);`,
);
await new Promise((resolve, reject) =>
  webpack(
    {
      mode: "development",
      devtool: false,
      target: "web",
      entry: path.join(output, "entry.tsx"),
      output: { path: output, filename: "bundle.js", publicPath: "/" },
      resolve: {
        extensions: [".tsx", ".ts", ".jsx", ".js"],
        modules: [path.join(web, "node_modules"), "node_modules"],
        alias: {
          "next/navigation": path.join(output, "navigation.ts"),
          "@/lib/api": path.join(output, "api.ts"),
          "@/providers/auth-provider": path.join(output, "auth.ts"),
          "@": path.join(web, "src"),
        },
      },
      module: {
        rules: [
          {
            test: /\.tsx?$/,
            exclude: /node_modules/,
            use: path.join(output, "loader.cjs"),
          },
        ],
      },
    },
    (error, stats) =>
      error || stats.hasErrors()
        ? reject(
            error || new Error(stats.toString({ all: false, errors: true })),
          )
        : resolve(),
  ),
);
const css = await requireWeb("postcss")([
  requireWeb("@tailwindcss/postcss")({ base: web }),
]).process(await fs.readFile(path.join(web, "src/app/globals.css"), "utf8"), {
  from: path.join(web, "src/app/globals.css"),
});
await fs.writeFile(path.join(output, "styles.css"), css.css);
const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, "http://localhost").pathname;
    if (pathname.startsWith("/admin/") || pathname === "/course-schedules") {
      res.setHeader("Content-Type", "application/json");
      if (scenario === "error" && pathname.endsWith("course-schedules")) {
        res.statusCode = 503;
        res.end(JSON.stringify({ message: "Fixture failure" }));
        return;
      }
      if (req.method === "PATCH") {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const body = JSON.parse(Buffer.concat(chunks).toString());
        mutations.push({ method: req.method, pathname, body });
        entries = entries.map((entry) =>
          entry._id === pathname.split("/").at(-1)
            ? { ...entry, ...body }
            : entry,
        );
      }
      const data =
        pathname === "/admin/courses"
          ? { items: courses }
          : pathname === "/admin/staff"
            ? { items: staff }
            : pathname.endsWith("course-schedules")
              ? scenario === "empty"
                ? []
                : entries
              : { ok: true };
      res.end(JSON.stringify(data));
      return;
    }
    const asset = /^\/[\w.-]+\.js$/.test(pathname)
      ? path.join(output, pathname.slice(1))
      : pathname === "/styles.css"
        ? path.join(output, "styles.css")
        : pathname.startsWith("/fonts/")
          ? path.join(web, "public", pathname)
          : pathname === "/logo.webp"
            ? path.join(web, "public", "logo.webp")
            : null;
    if (asset) {
      res.setHeader(
        "Content-Type",
        pathname.endsWith(".js")
          ? "text/javascript"
          : pathname.endsWith(".css")
            ? "text/css"
            : pathname.endsWith(".webp")
              ? "image/webp"
              : "font/ttf",
      );
      res.end(await fs.readFile(asset));
    } else {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(
        '<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body style="font-family:Cairo,sans-serif"><main class="mx-auto max-w-[1600px] p-2"><div id="root"></div></main><script src="/bundle.js"></script></body></html>',
      );
    }
  } catch {
    res.statusCode = 500;
    res.end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1536, height: 1100 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) =>
    new URL(route.request().url()).hostname === "127.0.0.1"
      ? route.continue()
      : route.abort(),
  );
  const base = `http://127.0.0.1:${server.address().port}`;
  const downloadPng = async (name, expectedIds) => {
    await page.evaluate(() => {
      window.exportSnapshot = null;
      const observer = new MutationObserver(() => {
        const root = document.querySelector("[data-schedule-export]");
        if (root) {
          window.exportSnapshot = {
            text: root.innerText,
            ids: [...root.querySelectorAll("[data-export-entry]")].map(
              (node) => node.dataset.exportEntry,
            ),
            tables: root.querySelectorAll("table").length,
            opacity: getComputedStyle(root).opacity,
            injectedImages: root.querySelectorAll(
              "img:not([data-schedule-logo]),script",
            ).length,
            logos: root.querySelectorAll("img[data-schedule-logo]").length,
          };
          observer.disconnect();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 60000 }),
      page
        .getByRole("button", { name: /Download as Image|تحميل كصورة/ })
        .click(),
    ]);
    assert.match(download.suggestedFilename(), /\.png$/);
    const filename = path.join(output, name + ".png");
    await download.saveAs(filename);
    const png = await fs.readFile(filename);
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.ok(
      png.readUInt32BE(16) >= 1000,
      "Full table width is retained on a phone",
    );
    assert.ok(png.readUInt32BE(16) * png.readUInt32BE(20) <= 12_000_000);
    const ink = await page.evaluate(
      async (data) => {
        const image = new Image();
        image.src = data;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 256;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(image, 0, 0, 256, 256);
        const pixels = ctx.getImageData(0, 0, 256, 256).data;
        let blue = 0;
        let total = 0,
          bottom = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          if (
            pixels[i + 2] > pixels[i] + 20 &&
            pixels[i + 2] > pixels[i + 1] + 10
          )
            blue++;
          if (pixels[i] < 240 || pixels[i + 1] < 240 || pixels[i + 2] < 240) {
            total++;
            if (i > pixels.length / 2) bottom++;
          }
        }
        return { total, bottom, blue };
      },
      "data:image/png;base64," + png.toString("base64"),
    );
    assert.ok(
      ink.total > 1000 && ink.bottom > 250,
      `Downloaded PNG contains the table, not a blank image: ${JSON.stringify(ink)}`,
    );
    const snapshot = await page.evaluate(() => window.exportSnapshot);
    assert.equal(snapshot.logos, 1);
    assert.ok(
      ink.blue > 5,
      "Institute logo is present in the actual PNG pixels",
    );
    assert.equal(snapshot.opacity, "1");
    assert.equal(
      snapshot.injectedImages,
      0,
      "Schedule text cannot inject markup into the export",
    );
    assert.deepEqual(
      snapshot.ids.sort(),
      [...expectedIds].sort(),
      "PNG source contains exactly the active filtered entries",
    );
    await page.waitForFunction(
      () => !document.querySelector("[data-schedule-export]"),
    );
    return snapshot;
  };
  const downloadPdf = async (name, expectedIds, expectedPages) => {
    await page.evaluate(() => {
      window.pdfSnapshots = [];
      const observer = new MutationObserver(() => {
        const root = document.querySelector("[data-schedule-export-page]");
        if (!root) {
          if (window.pdfSnapshots.length) observer.disconnect();
          return;
        }
        const number = Number(root.dataset.scheduleExportPage);
        if (window.pdfSnapshots.some((snapshot) => snapshot.number === number))
          return;
        window.pdfSnapshots.push({
          number,
          logos: root.querySelectorAll("img[data-schedule-logo]").length,
          ids: [...root.querySelectorAll("[data-export-entry]")].map(
            (node) => node.dataset.exportEntry,
          ),
          columns: root.querySelector("thead tr")?.children.length,
        });
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 90000 }),
      page
        .getByRole("button", {
          name: /Download landscape PDF|تحميل PDF بالعرض/,
        })
        .click(),
    ]);
    assert.match(download.suggestedFilename(), /\.pdf$/);
    const filename = path.join(output, name + ".pdf");
    await download.saveAs(filename);
    const pdf = await fs.readFile(filename);
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
    const boxes = [
      ...pdf
        .toString("latin1")
        .matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g),
    ];
    // Editing a class time can introduce an extra time boundary and PDF page.
    assert.ok(boxes.length >= expectedPages);
    expectedPages = boxes.length;
    for (const box of boxes)
      assert.ok(
        Number(box[1]) > 840 &&
          Number(box[1]) < 843 &&
          Number(box[2]) > 594 &&
          Number(box[2]) < 597,
        "Every PDF page is A4 landscape",
      );
    const snapshots = await page.evaluate(() => window.pdfSnapshots);
    assert.equal(snapshots.length, expectedPages);
    assert.ok(snapshots.every((snapshot) => snapshot.logos === 1));
    assert.deepEqual(
      [...new Set(snapshots.flatMap((snapshot) => snapshot.ids))].sort(),
      [...expectedIds].sort(),
      "PDF contains exactly the filtered classes",
    );
    // Inspect the image streams embedded in the downloaded PDF, not just its HTML.
    let position = 0,
      images = 0;
    while (true) {
      const start = pdf.indexOf(Buffer.from([255, 216, 255]), position);
      if (start < 0) break;
      const end = pdf.indexOf(Buffer.from([255, 217]), start);
      assert.ok(end > start);
      const image = pdf.subarray(start, end + 2);
      images++;
      position = end + 2;
      await fs.writeFile(
        path.join(output, `${name}-page-${images}.jpg`),
        image,
      );
      const colored = await page.evaluate(
        async (data) => {
          const image = new Image();
          image.src = data;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = 256;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(image, 0, 0, 256, 256);
          const pixels = ctx.getImageData(0, 0, 256, 256).data;
          let blue = 0,
            dark = 0;
          for (let i = 0; i < pixels.length; i += 4) {
            if (
              pixels[i + 2] > pixels[i] + 20 &&
              pixels[i + 2] > pixels[i + 1] + 10
            )
              blue++;
            if (pixels[i] < 240) dark++;
          }
          return { blue, dark };
        },
        "data:image/jpeg;base64," + image.toString("base64"),
      );
      assert.ok(
        colored.blue > 10 && colored.dark > 1000,
        "Actual PDF page includes the colored logo and readable table",
      );
    }
    assert.equal(images, expectedPages);
    await page.waitForFunction(
      () => !document.querySelector("[data-schedule-export]"),
    );
    return snapshots;
  };
  for (const locale of ["ar", "en"]) {
    const ar = locale === "ar";
    for (const role of ["admin", "student"]) {
      const route = role === "admin" ? "admin" : "dashboard";
      await page.goto(`${base}/${locale}/${route}/schedules?level=3`);
      await page.getByTestId("weekly-timetable").waitFor();
      assert.equal(
        await page.getByRole("table").count(),
        2,
        "Lectures and sections have separate matrices",
      );
      const lectures = page.getByRole("region", {
        name: ar
          ? "جدول المحاضرات، مرّر لعرض جميع المجموعات"
          : "Lecture timetable, scroll to view all groups",
        exact: true,
      });
      assert.equal(
        await lectures
          .getByRole("columnheader", {
            name: ar ? "مجموعة F" : "Group F",
            exact: true,
          })
          .count(),
        1,
      );
      assert.equal(
        await page.locator("[data-schedule-id]").count(),
        20,
        "Each class appears exactly once",
      );
      assert.equal(
        await page
          .getByRole("button", { name: /Actions for|إجراءات مقرر/ })
          .count(),
        role === "admin" ? 20 : 0,
      );
      await page.screenshot({
        path: path.join(output, `${locale}-${role}-desktop.png`),
        fullPage: true,
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({
        path: path.join(output, `${locale}-${role}-all-groups-mobile.png`),
        fullPage: true,
      });
      const allExport = await downloadPng(
        `${locale}-${role}-all-groups-download`,
        entries
          .filter((entry) => entry.level === "3")
          .map((entry) => entry._id),
      );
      assert.equal(
        allExport.tables,
        2,
        "PNG keeps lectures and sections in separate tables",
      );
      const pdfPages = await downloadPdf(
        `${locale}-${role}-landscape`,
        entries
          .filter((entry) => entry.level === "3")
          .map((entry) => entry._id),
        3,
      );
      assert.ok(
        pdfPages.slice(0, 2).every((page) => page.columns === 8),
        "Group A–F columns repeat on both lecture pages",
      );
      if (
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        )
      )
        console.log(
          await page.evaluate(() => ({
            width: innerWidth,
            scroll: document.documentElement.scrollWidth,
            blocks: Array.from(
              document.querySelector("#root > div").children,
            ).map((element) => ({
              class: element.className,
              width: element.getBoundingClientRect().width,
              scroll: element.scrollWidth,
            })),
          })),
        );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
        "All-group matrices scroll inside the table on mobile",
      );
      assert.equal(
        await lectures.evaluate(
          (element) => element.scrollWidth > element.clientWidth,
        ),
        true,
        "All six groups remain available in the mobile scroller",
      );
      await page.screenshot({
        path: path.join(output, `${locale}-${role}-all-groups-mobile.png`),
        fullPage: true,
      });
      await page.emulateMedia({ media: "print" });
      assert.equal(
        await lectures
          .getByRole("table")
          .evaluate((element) => getComputedStyle(element).minWidth),
        "0px",
        "Print layout does not clip the group columns to the screen minimum width",
      );
      await page.emulateMedia({ media: "screen" });
      await page.setViewportSize({ width: 1536, height: 1100 });
      await page
        .getByRole("combobox", {
          name: ar ? "تصفية حسب المجموعة" : "Filter by group",
        })
        .click();
      await page
        .getByRole("option", { name: ar ? "مجموعة F" : "Group F", exact: true })
        .click();
      await page.waitForURL(/group=F/);
      await page.locator('[data-schedule-id="lecture-F-0"]').waitFor();
      assert.equal(await page.locator("[data-schedule-id]").count(), 3);
      await downloadPng(
        `${locale}-${role}-group-F-download`,
        entries
          .filter(
            (entry) =>
              entry.level === "3" && entry.group === "Group F (Lecture)",
          )
          .map((entry) => entry._id),
      );
      await page.reload();
      await page.locator('[data-schedule-id="lecture-F-0"]').waitFor();
      assert.equal(
        await page.locator("[data-schedule-id]").count(),
        3,
        "Level and group survive reload",
      );
      const searchInput = page.getByRole("textbox", {
        name: ar
          ? "بحث باسم المقرر أو القائم بالتدريس أو القاعة أو المجموعة…"
          : "Search course, instructor, room or group…",
      });
      await searchInput.fill("Database ");
      await page.waitForURL(
        (url) => url.searchParams.get("search") === "Database",
      );
      assert.equal(
        await searchInput.inputValue(),
        "Database ",
        "A paused word boundary is preserved while the URL search is committed",
      );
      await searchInput.fill("Database Systems");
      await page.waitForURL(/search=Database\+Systems/);
      assert.equal(
        new URL(page.url()).searchParams.get("group"),
        "F",
        "Search retains the selected group",
      );
      assert.equal(
        await page.locator("[data-schedule-id]").count(),
        1,
        "Multiword course search filters the selected group",
      );
      await downloadPng(`${locale}-${role}-search-download`, ["lecture-F-1"]);
      await searchInput.fill("");
      await page.waitForURL((url) => !url.searchParams.has("search"));
      await page.locator('[data-schedule-id="lecture-F-0"]').waitFor();
      if (role === "admin") {
        await page
          .locator('[data-schedule-id="lecture-F-0"]')
          .getByRole("button")
          .click();
        await page
          .getByRole("menuitem", {
            name: ar ? "تعديل الموعد" : "Edit class",
            exact: true,
          })
          .click();
        const dialog = page.getByRole("dialog");
        await dialog.waitFor();
        await dialog
          .getByRole("button", { name: ar ? "اختر الوقت" : "Select time" })
          .filter({ hasText: /09:(30|45) AM/ })
          .click();
        await page
          .getByRole("button", { name: ar ? "45" : "30", exact: true })
          .click();
        await page.keyboard.press("Escape");
        await dialog
          .getByPlaceholder(
            ar
              ? "مثال: مدرج 1، قاعة 204، معمل حاسب 2"
              : "e.g. Auditorium 1, Hall 204, Computer Lab 2",
          )
          .fill(`Updated Hall ${locale}`);
        await dialog
          .getByRole("button", {
            name: ar ? "تحديث الموعد" : "Update Slot",
            exact: true,
          })
          .click();
        await dialog.waitFor({ state: "hidden" });
        await page
          .locator('[data-schedule-id="lecture-F-0"]')
          .getByText(`Updated Hall ${locale}`, { exact: true })
          .waitFor();
        assert.equal(
          mutations.at(-1).pathname,
          "/admin/course-schedules/lecture-F-0",
        );
        assert.equal(
          mutations.at(-1).body.startTime,
          ar ? "09:45 AM" : "09:30 AM",
          "The selected time is saved and the timetable is rebuilt",
        );
        assert.equal(
          mutations.at(-1).body.locationAr,
          `Updated Hall ${locale}`,
          "Editing a room updates its displayed Arabic label too",
        );
      }
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
        "No page-wide overflow on mobile",
      );
      await page.screenshot({
        path: path.join(output, `${locale}-${role}-mobile.png`),
        fullPage: true,
      });
      await page.setViewportSize({ width: 1536, height: 1100 });
    }
  }
  await page.goto(`${base}/en/admin/schedules?level=3&role=staff`);
  await page.getByTestId("weekly-timetable").waitFor();
  assert.equal(
    await page.getByRole("button", { name: /Actions for/ }).count(),
    0,
    "Read-only staff do not get admin edit actions",
  );
  await downloadPng(
    "en-staff-download",
    entries.filter((entry) => entry.level === "3").map((entry) => entry._id),
  );
  await downloadPdf(
    "en-staff-landscape",
    entries.filter((entry) => entry.level === "3").map((entry) => entry._id),
    3,
  );
  entries.push({
    ...entries.find((entry) => entry._id === "section-1"),
    _id: "other-department",
    department: "ACC",
  });
  await page.goto(
    `${base}/ar/dashboard/schedules?category=section&day=monday&group=A&department=BIS`,
  );
  await page.getByTestId("weekly-timetable").waitFor();
  await downloadPng("ar-filtered-sections-download", [
    "section-1",
    "section-2",
  ]);
  entries.pop();
  await page.goto(`${base}/en/dashboard/schedules`);
  await page.getByTestId("weekly-timetable").waitFor();
  const allLevelsExport = await downloadPng(
    "en-all-levels-download",
    entries.map((entry) => entry._id),
  );
  assert.equal(
    allLevelsExport.tables,
    3,
    "All levels remain separate cohorts in one PNG",
  );
  await downloadPdf(
    "en-all-levels-landscape",
    entries.map((entry) => entry._id),
    4,
  );
  const unsafeText =
    '<img src=x onerror="window.exportInjected=true"> & course';
  entries.push({
    ...entries[0],
    _id: "unplaced-unsafe",
    courseName: unsafeText,
    courseNameAr: unsafeText,
    startTime: "unannounced",
  });
  await page.goto(`${base}/en/dashboard/schedules?level=3`);
  await page.getByTestId("weekly-timetable").waitFor();
  const fallback = await downloadPng(
    "en-unplaced-and-escaped-download",
    entries.filter((entry) => entry.level === "3").map((entry) => entry._id),
  );
  assert.ok(
    fallback.text.includes(unsafeText),
    "Unparseable entries are retained as literal text",
  );
  assert.equal(await page.evaluate(() => window.exportInjected), undefined);
  await downloadPdf(
    "en-unplaced-landscape",
    entries.filter((entry) => entry.level === "3").map((entry) => entry._id),
    4,
  );
  // A failed renderer must show an error and clean up, never download a white PNG.
  let blankDownloads = 0;
  const onBlankDownload = () => blankDownloads++;
  page.on("download", onBlankDownload);
  await page.evaluate(() => {
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (source, ...args) {
      if (
        source instanceof HTMLImageElement &&
        source.src.startsWith("data:image/svg+xml")
      )
        return;
      return draw.call(this, source, ...args);
    };
  });
  await page
    .getByRole("button", { name: "Download as Image", exact: true })
    .click();
  await page
    .getByText("Failed to download schedule image, please try again.", {
      exact: true,
    })
    .waitFor();
  assert.equal(blankDownloads, 0);
  assert.equal(await page.locator("[data-schedule-export]").count(), 0);
  assert.equal(
    await page
      .getByRole("button", { name: "Download as Image", exact: true })
      .isEnabled(),
    true,
  );
  await page
    .getByRole("button", { name: "Download landscape PDF", exact: true })
    .click();
  await page
    .getByText("Failed to download PDF, please try again.", { exact: true })
    .waitFor();
  assert.equal(
    blankDownloads,
    0,
    "A blank PDF page never produces a partial PDF download",
  );
  assert.equal(await page.locator("[data-schedule-export]").count(), 0);
  assert.equal(
    await page
      .getByRole("button", { name: "Download landscape PDF", exact: true })
      .isEnabled(),
    true,
  );
  page.off("download", onBlankDownload);
  await page.goto(`${base}/en/dashboard/schedules?level=3`);
  await page.getByTestId("weekly-timetable").waitFor();
  await page.route("**/logo.webp", (route) => route.abort());
  await page
    .getByRole("button", { name: "Download landscape PDF", exact: true })
    .click();
  await page
    .getByText("Failed to download PDF, please try again.", { exact: true })
    .waitFor();
  assert.equal(
    await page.locator("[data-schedule-export]").count(),
    0,
    "Failed logo load cleans up the export",
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Download landscape PDF", exact: true })
      .isEnabled(),
    true,
  );
  await page.unroute("**/logo.webp");
  scenario = "error";
  await page.goto(`${base}/en/dashboard/schedules`);
  await page
    .getByText("Could not load the timetable. Please try again.")
    .waitFor();
  scenario = "normal";
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await page.getByTestId("weekly-timetable").waitFor();
  assert.equal(
    await page.getByTestId("timetable-cohort").count(),
    2,
    "All-level view separates cohorts",
  );
  scenario = "empty";
  await page.reload();
  await page.getByText("No schedules found", { exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Download as Image", exact: true })
      .isDisabled(),
    true,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Download landscape PDF", exact: true })
      .isDisabled(),
    true,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: Branded PNGs and landscape A4 PDFs for admin/student/staff; actual logo pixels on every PDF page, filtered entries, pagination, Arabic/English, mobile, blank-render and logo-failure recovery.",
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
