/** Actual dialogs, Axios uploads and notification drawer in Chromium; synthetic HTTP only. */
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
const output = path.join(root, "outputs/material-upload");
const courseId = "000000000000000000000326";
const source = (name) => path.join(web, "src", name).replaceAll("\\", "/");

async function main() {
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(
    path.join(output, "loader.cjs"),
    `const ts = require(${JSON.stringify(requireWeb.resolve("typescript"))}); module.exports = source => ts.transpileModule(source, { compilerOptions:{ jsx:ts.JsxEmit.ReactJSX, target:ts.ScriptTarget.ES2022, module:ts.ModuleKind.ESNext, esModuleInterop:true } }).outputText;`,
  );
  await fs.writeFile(
    path.join(output, "auth.ts"),
    `export const useAuth = () => { const params = new URLSearchParams(location.search); return { user:{ _id:'000000000000000000000001', role:params.get('role') || 'admin', staffType:params.get('staffType'), permissions:params.get('readonly') ? [] : ['course_materials.write', 'course_materials.delete'], name:'Upload Tester' } }; };`,
  );
  await fs.writeFile(
    path.join(output, "navigation.ts"),
    `export const useParams = () => ({ locale:new URLSearchParams(location.search).get('locale') || 'en' }); export const usePathname = () => '/en/admin/courses'; export const useSearchParams = () => new URLSearchParams(); export const useRouter = () => ({ push(){}, replace(){} });`,
  );
  await fs.writeFile(
    path.join(output, "decoration.tsx"),
    `import React from 'react'; export default () => null; export const Themes = () => null; export const SessionTimerWidget = () => null; export const Link = ({children,href,...props}) => <a href={href} {...props}>{children}</a>;`,
  );
  await fs.writeFile(
    path.join(output, "link.tsx"),
    `export { Link as default } from './decoration';`,
  );
  await fs.writeFile(
    path.join(output, "entry.tsx"),
    `
    import React, { useState } from 'react'; import { createRoot } from 'react-dom/client';
    import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
    import { NextIntlClientProvider } from 'next-intl';
    import en from '${source("messages/en.json")}';
    import ar from '${source("messages/ar.json")}';
    import AdminHeader from '${source("components/admin/header")}';
    import { MaterialUploadProvider, useStartBookUpload } from '${source("features/courses/material-upload-provider")}';
    import { CourseMaterialsDialog } from '${source("features/courses/components/course-materials-dialog")}';
    const locale = new URLSearchParams(location.search).get('locale') || 'en';
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
    function Content() {
      const [open,setOpen] = useState(false); const [view,setView] = useState(true); const book = useStartBookUpload();
      const params = new URLSearchParams(location.search);
      return <><AdminHeader/><main className="p-6 space-y-4"><button onClick={() => setOpen(true)}>Open materials</button><button onClick={() => setView(value => !value)}>Navigate</button><label>Queue book<input data-testid="book" type="file" accept="application/pdf" onChange={event => { const file = event.target.files?.[0]; if(file) book('${courseId}','Course book · 326',file); event.target.value = ''; }}/></label>{view ? <CourseMaterialsDialog open={open} onOpenChange={setOpen} courseId="${courseId}" courseCode="326" courseName="Test Course" locale={locale} isStudent={params.get('role') === 'student'} isStudentBlocked={params.has('blocked')}/> : <p>Another page</p>}</main></>;
    }
    createRoot(document.getElementById('root')).render(<React.StrictMode><QueryClientProvider client={new QueryClient({ defaultOptions:{queries:{retry:false}} })}><NextIntlClientProvider locale={locale} messages={locale === 'ar' ? ar : en}><MaterialUploadProvider locale={locale}><Content/></MaterialUploadProvider></NextIntlClientProvider></QueryClientProvider></React.StrictMode>);`,
  );
  await new Promise((resolve, reject) =>
    webpack(
      {
        mode: "development",
        devtool: false,
        target: "web",
        entry: path.join(output, "entry.tsx"),
        output: { path: output, filename: "bundle.js" },
        plugins: [
          new webpack.DefinePlugin({
            "process.env.NEXT_PUBLIC_API_URL": JSON.stringify("/api"),
          }),
        ],
        resolve: {
          extensions: [".tsx", ".ts", ".jsx", ".js"],
          modules: [path.join(web, "node_modules"), "node_modules"],
          alias: {
            "@/providers/auth-provider": path.join(output, "auth.ts"),
            "next/navigation": path.join(output, "navigation.ts"),
            "next/image": path.join(output, "decoration.tsx"),
            "next/link": path.join(output, "link.tsx"),
            "@/components/ui/LangToggle": path.join(output, "decoration.tsx"),
            "@/components/ui/Themes": path.join(output, "decoration.tsx"),
            "@/components/common/session-timer-widget": path.join(
              output,
              "decoration.tsx",
            ),
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
  let active = 0,
    maxActive = 0,
    aborted = 0,
    posts = 0;
  let materials = [];
  const server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const json = (data, status = 200) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          success: status < 400,
          data,
          ...(status >= 400
            ? { message: "Synthetic upload failure", statusCode: status }
            : {}),
        }),
      );
    };
    if (pathname.startsWith("/api/")) {
      if (req.method === "POST") {
        posts++;
        active++;
        maxActive = Math.max(maxActive, active);
        const chunks = [];
        let released = false;
        const release = () => {
          if (!released) {
            active--;
            released = true;
          }
        };
        req.on("data", (chunk) => chunks.push(chunk));
        req.on("aborted", () => {
          aborted++;
          release();
        });
        req.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          const recording = req.headers["content-type"]?.includes(
            "application/json",
          )
            ? JSON.parse(body)
            : null;
          const title =
            recording?.title ||
            /name="title"\r\n\r\n([^\r]+)/.exec(body)?.[1] ||
            "Course book";
          const fail =
            body.includes("retry.pdf") &&
            !materials.some((item) => item.title === "__failed");
          setTimeout(() => {
            if (res.destroyed) {
              release();
              return;
            }
            if (fail) {
              materials.push({ title: "__failed" });
              json(null, 503);
            } else {
              if (pathname.endsWith("/materials"))
                materials.push({
                  _id: "000000000000000000000100",
                  courseId,
                  title,
                  videoUrl:
                    recording?.videoUrl ||
                    /name="videoUrl"\r\n\r\n([^\r]+)/.exec(body)?.[1],
                  hasFile: !recording,
                  attachments: Array.from(
                    body.matchAll(/name="file"; filename="([^"]+)"/g),
                    ([, name]) => ({ name, size: 1 }),
                  ),
                  type: "lecture",
                  fileName: "lecture.pdf",
                  fileSize: 1024,
                  mimeType: "application/pdf",
                  fileUrl: "/api/test.pdf",
                  isPublished: true,
                  uploadedByName: "Tester",
                  createdAt: new Date().toISOString(),
                });
              json({});
            }
            release();
          }, 1200);
        });
      } else if (pathname.endsWith("/materials"))
        json({
          courseId,
          courseCode: "326",
          courseName: "Test Course",
          materials: materials.filter((item) => item.title !== "__failed"),
          totalCount: materials.filter((item) => item.title !== "__failed")
            .length,
        });
      else json({ items: [], total: 0, page: 1, totalPages: 1 });
      return;
    }
    const asset =
      pathname === "/bundle.js" || pathname === "/styles.css"
        ? path.join(output, pathname.slice(1))
        : pathname.startsWith("/fonts/")
          ? path.join(web, "public", pathname)
          : null;
    if (asset) {
      res.setHeader(
        "Content-Type",
        pathname.endsWith(".js")
          ? "text/javascript"
          : pathname.endsWith(".css")
            ? "text/css"
            : "font/ttf",
      );
      res.end(await fs.readFile(asset));
    } else {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(
        '<!doctype html><html class="dark"><head><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>',
      );
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    for (const locale of ["en", "ar"]) {
      const context = await browser.newContext({
        viewport: { width: locale === "ar" ? 390 : 1280, height: 900 },
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(
        `http://127.0.0.1:${server.address().port}/?locale=${locale}`,
      );
      const cdp = await context.newCDPSession(page);
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: 20,
        downloadThroughput: 10 * 1024 * 1024,
        uploadThroughput: 128 * 1024,
      });
      const isAr = locale === "ar";
      const bell = page.getByRole("button", {
        name: isAr ? "الإشعارات" : "Notifications",
        exact: true,
        includeHidden: true,
      });
      const file = (name) => ({
        name,
        mimeType: "application/pdf",
        buffer: Buffer.concat([
          Buffer.from("%PDF-1.7\n"),
          Buffer.alloc(768 * 1024, 32),
        ]),
      });
      await page
        .getByRole("button", { name: "Open materials", exact: true })
        .click();
      await page
        .getByRole("button", {
          name: isAr ? "إضافة محتوى تعليمي" : "Add Material",
          exact: true,
        })
        .click();
      await page.locator("input[type=text]").first().fill("Recorded lecture");
      const videoInput = page.getByLabel(
        isAr
          ? "رابط فيديو المحاضرة أو السكشن (اختياري)"
          : "Lecture or section video URL (optional)",
        { exact: true },
      );
      const saveRecording = page.getByRole("button", {
        name: isAr ? "حفظ رابط التسجيل" : "Save recording link",
        exact: true,
      });
      await videoInput.fill("javascript:alert(1)");
      assert.equal(await saveRecording.isDisabled(), true);
      await videoInput.fill("https://drive.google.com/file/d/recording/view");
      await page.screenshot({
        path: path.join(output, `${locale}-recording-form.png`),
        fullPage: true,
      });
      await saveRecording.click();
      const watch = page
        .getByRole("link", {
          name: isAr ? "مشاهدة التسجيل" : "Watch recording",
          exact: true,
        })
        .last();
      await watch.waitFor();
      assert.equal(
        await watch.getAttribute("href"),
        "https://drive.google.com/file/d/recording/view",
      );
      assert.equal(await watch.getAttribute("target"), "_blank");
      assert.match(await watch.getAttribute("rel"), /noopener/);
      await page.screenshot({
        path: path.join(output, `${locale}-recording-list.png`),
        fullPage: true,
      });
      await page
        .getByRole("button", {
          name: isAr ? "إضافة محتوى تعليمي" : "Add Material",
          exact: true,
        })
        .click();
      await page
        .locator("input[type=file]")
        .last()
        .setInputFiles([
          file("lecture.pdf"),
          {
            name: "grades.csv",
            mimeType: "text/csv",
            buffer: Buffer.from("Name,Grade\nJohn,90"),
          },
        ]);
      await page
        .getByRole("button", {
          name: isAr ? "إزالة grades.csv" : "Remove grades.csv",
        })
        .waitFor();
      await page
        .locator("#material-video-url")
        .fill("https://example.com/lecture-video");
      await page
        .getByRole("button", {
          name: isAr ? "رفع وحفظ" : "Upload & Save",
          exact: true,
        })
        .click();
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Navigate", exact: true }).click();
      await page.getByText("Another page", { exact: true }).waitFor();
      await page.getByTestId("book").setInputFiles(file("book.pdf"));
      await bell.click();
      const drawer = page.getByRole("dialog");
      await drawer.getByRole("progressbar").first().waitFor();
      await page.waitForFunction(() =>
        [...document.querySelectorAll("[role=dialog] [role=progressbar]")].some(
          (el) =>
            Number(el.getAttribute("aria-valuenow")) > 0 &&
            Number(el.getAttribute("aria-valuenow")) < 100,
        ),
      );
      assert.match(
        await drawer.innerText(),
        isAr ? /في انتظار الرفع/ : /Queued/,
      );
      assert.equal(
        await drawer
          .getByText(
            isAr ? "لا توجد إشعارات غير مقروءة" : "No unread notifications",
            { exact: true },
          )
          .count(),
        0,
        "Active uploads replace the empty state",
      );
      assert.ok(
        (await bell.textContent()) === "2",
        "Both active and queued uploads appear on the bell",
      );
      await page.screenshot({
        path: path.join(output, `${locale}-notifications.png`),
        fullPage: true,
      });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "Progress fits the viewport",
      );
      await drawer
        .getByText(
          isAr
            ? "تم الإرسال — جاري التحقق والحفظ"
            : "Sent — verifying and saving",
          { exact: true },
        )
        .first()
        .waitFor({ timeout: 20000 });
      assert.equal(
        await drawer
          .getByText(isAr ? "تم الحفظ بنجاح" : "Saved successfully", {
            exact: true,
          })
          .count(),
        0,
        "100% sent is not reported as saved",
      );
      await drawer
        .getByText(isAr ? "تم الحفظ بنجاح" : "Saved successfully", {
          exact: true,
        })
        .nth(1)
        .waitFor({ timeout: 25000 });
      await page.keyboard.press("Escape");
      assert.equal(
        await page
          .getByRole("complementary", {
            name: isAr ? "الملفات قيد الرفع" : "Uploads in progress",
          })
          .count(),
        0,
      );
      await page.getByRole("button", { name: "Navigate", exact: true }).click();
      await page
        .getByRole("button", { name: "Open materials", exact: true })
        .click();
      const combinedRow = page
        .getByText("lecture", { exact: true })
        .locator("xpath=../../../..");
      await combinedRow
        .getByRole("link", {
          name: isAr ? "مشاهدة التسجيل" : "Watch recording",
          exact: true,
        })
        .waitFor();
      assert.equal(
        await combinedRow
          .getByRole("button", {
            name: isAr ? "تحميل الملفات (ZIP)" : "Download files (ZIP)",
            exact: true,
          })
          .count(),
        1,
      );
      await page.screenshot({
        path: path.join(output, `${locale}-combined-material.png`),
        fullPage: true,
      });
      await page.getByText("lecture", { exact: true }).last().waitFor();
      await page.keyboard.press("Escape");
      // A rejected POST is retried only after the user's explicit action.
      await page.getByTestId("book").setInputFiles(file("retry.pdf"));
      await bell.click();
      await drawer
        .getByText("Synthetic upload failure", { exact: true })
        .waitFor({ timeout: 20000 });
      assert.equal(
        await bell.textContent(),
        "1",
        "Failed uploads keep an attention badge until retry or dismissal",
      );
      const beforeRetry = posts;
      await page.waitForTimeout(500);
      assert.equal(posts, beforeRetry);
      await drawer
        .getByRole("button", {
          name: isAr ? "إعادة المحاولة" : "Retry",
          exact: true,
        })
        .click();
      await drawer
        .getByText(isAr ? "تم الحفظ بنجاح" : "Saved successfully", {
          exact: true,
        })
        .nth(2)
        .waitFor({ timeout: 20000 });
      assert.equal(posts, beforeRetry + 1);
      await page.keyboard.press("Escape");
      await page.getByTestId("book").setInputFiles(file("cancel.pdf"));
      const tray = page.getByRole("complementary", {
        name: isAr ? "الملفات قيد الرفع" : "Uploads in progress",
      });
      await tray
        .getByRole("button", {
          name: isAr ? "إلغاء الرفع" : "Cancel upload",
          exact: true,
        })
        .click();
      await bell.click();
      await drawer
        .getByText(isAr ? "تم إلغاء الرفع" : "Upload cancelled", {
          exact: true,
        })
        .waitFor();
      assert.deepEqual(errors, []);
      await context.close();
      materials = [];
    }
    for (const staffType of [
      "doctor",
      "assistant_lecturer",
      "teaching_assistant",
    ]) {
      for (const readonly of [false, true]) {
        const page = await browser.newPage();
        await page.goto(
          `http://127.0.0.1:${server.address().port}/?locale=en&role=staff&staffType=${staffType}${readonly ? "&readonly=1" : ""}`,
        );
        await page
          .getByRole("button", { name: "Open materials", exact: true })
          .click();
        const add = page.getByRole("button", {
          name: staffType === "doctor" ? "Add New Lecture" : "Add New Section",
          exact: true,
        });
        assert.equal(await add.count(), readonly ? 0 : 1);
        if (!readonly) {
          await add.click();
          await page
            .getByLabel("Lecture or section video URL (optional)", {
              exact: true,
            })
            .waitFor();
        }
        await page.close();
      }
    }
    materials = [
      {
        _id: "combined",
        courseId,
        title: "Lecture 1",
        type: "lecture",
        hasFile: true,
        fileName: "lecture.pdf",
        fileUrl: "/api/test.pdf",
        videoUrl: "https://example.com/video",
      },
    ];
    for (const blocked of [false, true]) {
      const page = await browser.newPage({
        viewport: { width: 390, height: 900 },
      });
      await page.goto(
        `http://127.0.0.1:${server.address().port}/?locale=ar&role=student${blocked ? "&blocked=1" : ""}`,
      );
      await page
        .getByRole("button", { name: "Open materials", exact: true })
        .click();
      await page.getByText("Lecture 1", { exact: true }).waitFor();
      assert.equal(
        await page.getByRole("button", { name: "تحميل", exact: true }).count(),
        blocked ? 0 : 1,
      );
      assert.equal(
        await page
          .getByRole("link", { name: "مشاهدة التسجيل", exact: true })
          .count(),
        blocked ? 0 : 1,
      );
      assert.equal(
        await page
          .getByRole("button", { name: "إضافة محتوى تعليمي", exact: true })
          .count(),
        0,
      );
      await page.screenshot({
        path: path.join(
          output,
          `ar-student-${blocked ? "blocked" : "combined"}.png`,
        ),
        fullPage: true,
      });
      await page.close();
    }
    assert.equal(
      maxActive,
      1,
      "Large uploads never compete for upload bandwidth",
    );
    assert.ok(
      aborted <= 2,
      "Closing dialogs and navigating never aborts uploads",
    );
    console.log(
      "English/Arabic desktop/mobile: dialog close, navigation, actual upload percentages, notification bell/drawer, queued books, saving acknowledgement, explicit retry and cancellation passed.",
    );
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
