/** Real security components in Chromium with synthetic auth and local HTTP fixtures. */
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
const output = path.join(root, "outputs/security-review");
const sessions = [
  {
    _id: "a".repeat(64),
    current: true,
    os: "Windows",
    browser: "Microsoft Edge",
    device: "computer",
    ip: "192.0.2.1",
    networkType: "wifi",
    location: "Alexandria",
    country: "EG",
    latitude: 31.2,
    longitude: 29.9,
    isp: "Example ISP",
    locationSource: "ipwhois",
  },
  {
    _id: "b".repeat(64),
    current: false,
    os: "iOS",
    browser: "Safari",
    device: "mobile",
    ip: "192.0.2.2",
    networkType: "cellular",
    location: "London",
    country: "GB",
    latitude: 51.5,
    longitude: -0.12,
    locationSource: "vercel",
  },
  {
    _id: "c".repeat(64),
    current: false,
    os: "Android",
    browser: "Google Chrome",
    device: "tablet",
  },
].map((session) => ({
  ...session,
  createdAt: "2026-10-29T12:00:00Z",
  expiresAt: "2026-11-05T12:00:00Z",
}));

await fs.mkdir(output, { recursive: true });
await fs.writeFile(
  path.join(output, "loader.cjs"),
  `const ts = require(${JSON.stringify(requireWeb.resolve("typescript"))}); module.exports = function(source) { return ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, esModuleInterop: true } }).outputText; };`,
);
await fs.writeFile(
  path.join(output, "auth.ts"),
  `export const useAuth = () => ({ user: { _id:'synthetic-user', role:new URLSearchParams(location.search).get('role') || 'admin', permissions:(new URLSearchParams(location.search).get('permissions') || '').split(','), mustChangePassword:false }, logout:async () => { window.didLogout = true; } });`,
);
await fs.writeFile(
  path.join(output, "navigation.ts"),
  `
 export const useParams=()=>({locale:new URLSearchParams(location.search).get('locale') || 'en'});
 export const useSearchParams=()=>new URLSearchParams(location.search);
 export const usePathname=()=>location.pathname;
 export const useRouter=()=>({replace:url=>history.replaceState(null,'',url),push:url=>location.assign(url),back:()=>history.back()});
`,
);
await fs.writeFile(
  path.join(output, "api-client.ts"),
  `import api from './api'; export const apiGet = async url => (await api.get(url)).data; export const apiPatch = async (url,body) => (await api.patch(url,body)).data; export const apiPost = async (url,body) => (await api.post(url,body)).data; export const apiDelete = async url => (await api.delete(url)).data;`,
);
await fs.writeFile(
  path.join(output, "api.ts"),
  `
  async function call(method, url, body) {
    const res = await fetch(url, { method, headers:{'content-type':'application/json'}, ...(body ? {body:JSON.stringify(body)} : {}) });
    const data = await res.json(); if (!res.ok) throw data; return {data};
  }
  export const getApiErrorMessage = (e, fallback) => e.message || fallback;
  export const getApiErrorDetails = e => e;
  export default { get:url=>call('GET',url), post:(url,body)=>call('POST',url,body), patch:(url,body)=>call('PATCH',url,body), delete:url=>call('DELETE',url) };`,
);
await fs.writeFile(
  path.join(output, "entry.tsx"),
  `
  import React from 'react'; import {createRoot} from 'react-dom/client';
  import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
  import {NextIntlClientProvider} from 'next-intl';
  import ar from '${path.join(web, "src/messages/ar.json").replaceAll("\\", "/")}';
  import en from '${path.join(web, "src/messages/en.json").replaceAll("\\", "/")}';
  import {SessionManager} from '${path.join(web, "src/components/auth/session-manager.tsx").replaceAll("\\", "/")}';
  import {PasskeyManager} from '${path.join(web, "src/components/auth/passkey-manager.tsx").replaceAll("\\", "/")}';
  import {PasskeySettings} from '${path.join(web, "src/components/auth/passkey-settings.tsx").replaceAll("\\", "/")}';
  import SettingsPage from '${path.join(web, "src/app/[locale]/admin/settings/page.tsx").replaceAll("\\", "/")}';
  const locale = new URLSearchParams(location.search).get('locale') || 'en';
  document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
  createRoot(document.getElementById('root')).render(<NextIntlClientProvider locale={locale} messages={locale === 'ar' ? ar : en} timeZone="Africa/Cairo"><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><main className="mx-auto max-w-375 p-4 sm:p-6">{new URLSearchParams(location.search).get('view') === 'settings' ? <SettingsPage/> : <div className="space-y-5"><PasskeySettings/><div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]"><SessionManager/><PasskeyManager/></div></div>}</main></QueryClientProvider></NextIntlClientProvider>);`,
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
          "@/lib/api-client": path.join(output, "api-client.ts"),
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

let scenario = "normal";
const mutations = [];
let keys = [];
let visibility = { registrationVisible: false, syllabiVisible: false };
const keyFixtures = () =>
  ["unspecified", "touchId", "faceId", "windowsHello"].map(
    (unlockMethod, i) => ({
      _id: `synthetic-key-${i}`,
      name: [
        "Work passkey",
        "Personal phone",
        "Face verification",
        "Windows laptop",
      ][i],
      ...(i ? { unlockMethod } : {}),
      deviceType: "multiDevice",
      backedUp: true,
      createdAt: "2026-10-27T12:00:00Z",
      lastUsedAt: "2026-10-29T12:00:00Z",
    }),
  );
const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, "http://localhost").pathname;
    if (pathname.startsWith("/auth/") || pathname.startsWith("/admin/")) {
      res.setHeader("Content-Type", "application/json");
      let body = {};
      if (req.method !== "GET") {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
        mutations.push({ method: req.method, pathname, body });
      }
      if (pathname === "/admin/portal-settings") {
        if (scenario === "settings-error") {
          res.statusCode = 503;
          res.end(JSON.stringify({ message: "Synthetic failure" }));
          return;
        }
        visibility = { ...visibility, ...body };
        res.end(JSON.stringify(visibility));
        return;
      }
      if (
        pathname === "/admin/complaints/assignees"
      ) {
        res.end("[]");
        return;
      }
      if (pathname === '/admin/academic-years') { res.end(JSON.stringify([{academicYear:'2026-2027',isCurrent:true,registrationCount:12,advisingCaseCount:3,terms:[{_id:'fixture-term',academicYear:'2026-2027',semester:'first',isOpen:false}]}])); return; }
      if (pathname === '/admin/gpa-rules') { res.end(JSON.stringify([{_id:'fixture-rule',minGpa:0,maxGpa:4,minCreditHours:9,maxCreditHours:18,minCourses:3,maxCourses:6,isActive:true,requiresAdvisor:false}])); return; }
      if (pathname === "/admin/advising/rules") {
        res.end(
          JSON.stringify({
            maxCoursesLimit: 6,
            regularMaxCredits: 18,
            graduatingMaxCredits: 21,
            summerMaxCredits: 9,
            summerProbationMaxCredits: 6,
            probationMaxCredits: 12,
          }),
        );
        return;
      }
      if (pathname === "/admin/complaints/settings") {
        res.end(
          JSON.stringify({
            departmentStaffAssignments: {},
            autoAssignEnabled: true,
            complaintCooldownHours: 24,
          }),
        );
        return;
      }
      if (pathname === "/admin/ai/settings") {
        res.end(
          JSON.stringify({
            studentAdvisorEnabled: true,
            provider: "Test provider",
            model: "Test model",
            apiKeyConfigured: true,
            usage: {
              allTimeTokens: 100,
              allTimeRequests: 2,
              allTimeErrors: 0,
              currentMonthTokens: 100,
              currentMonthRequests: 2,
              monthlyTokenBudget: 1000,
              remainingTokens: 900,
              usagePercent: 10,
              periodStart: "2026-10-01T00:00:00Z",
            },
          }),
        );
        return;
      }
      if (
        req.method === "PATCH" &&
        pathname.startsWith("/auth/passkeys/synthetic-key-")
      ) {
        keys = keys.map((key) =>
          pathname.endsWith(key._id) ? { ...key, ...body } : key,
        );
      }
      if (pathname === "/auth/sessions" && scenario === "error") {
        res.statusCode = 503;
        res.end(JSON.stringify({ message: "Synthetic failure" }));
        return;
      }
      const data =
        pathname === "/auth/sessions"
          ? scenario === "empty"
            ? []
            : sessions
          : pathname === "/auth/passkeys/capabilities"
            ? { enabled: true, studentLoginEnabled: true }
            : pathname === "/auth/passkeys/settings"
              ? { studentLoginEnabled: true }
              : pathname === "/auth/passkeys"
                ? keys
                : { ok: true };
      res.end(JSON.stringify(data));
      return;
    }
    const asset =
      pathname === "/bundle.js"
        ? path.join(output, "bundle.js")
        : pathname === "/styles.css"
          ? path.join(output, "styles.css")
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
        '<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body style="font-family:Cairo,sans-serif"><div id="root"></div><script src="/bundle.js"></script></body></html>',
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
  page.on("pageerror", (error) => {
    errors.push(error.message);
    console.error(error.stack);
  });
  await page.route("**/*", (route) =>
    new URL(route.request().url()).hostname === "127.0.0.1"
      ? route.continue()
      : route.abort(),
  );
  const base = `http://127.0.0.1:${server.address().port}`;
  const assertReadable = async (label) => {
    const issues = await page.evaluate(() => {
      const issues = [];
      if (document.documentElement.scrollWidth > innerWidth)
        issues.push("page overflow");
      for (const button of document.querySelectorAll("button")) {
        const rect = button.getBoundingClientRect();
        if (!rect.width || !rect.height || !button.innerText.trim()) continue;
        if (
          button.querySelector(".sr-only")?.textContent?.trim() ===
          button.innerText.trim()
        )
          continue;
        if (button.scrollWidth > button.clientWidth + 1)
          issues.push(`clipped button: ${button.innerText}`);
        const range = document.createRange();
        range.selectNodeContents(button);
        for (const box of range.getClientRects()) {
          if (
            box.width &&
            (box.left < rect.left - 1 ||
              box.right > rect.right + 1 ||
              box.top < rect.top - 1 ||
              box.bottom > rect.bottom + 1)
          )
            issues.push(`button content outside bounds: ${button.innerText}`);
        }
      }
      return issues;
    });
    assert.deepEqual(issues, [], label);
  };
  for (const locale of ["en", "ar"]) {
    const ar = locale === "ar";
    keys = keyFixtures();
    mutations.length = 0;
    await page.goto(`${base}/?locale=${locale}`);
    await page
      .getByRole("heading", { name: ar ? "الجلسات النشطة" : "Active sessions" })
      .waitFor();
    await page
      .locator("article")
      .filter({ hasText: "Microsoft Edge" })
      .waitFor();
    assert.equal(
      await page
        .locator("article")
        .filter({
          has: page.getByRole("button", {
            name: ar ? "تفاصيل الجلسة" : "Session details",
          }),
        })
        .count(),
      3,
    );
    const examples = page.getByRole("group", {
      name: ar
        ? "أمثلة لطرق التحقق على الجهاز"
        : "Examples of device verification",
    });
    assert.equal(
      await examples.getByText("Face ID", { exact: true }).count(),
      1,
    );
    assert.equal(
      await examples.getByText("Touch ID", { exact: true }).count(),
      1,
    );
    assert.equal(
      await page
        .getByRole("article", { name: "Work passkey", exact: true })
        .locator("svg.lucide-check-circle-2")
        .count(),
      2,
      "Unlabelled credentials use check circles, including backup status",
    );
    assert.equal(
      await page
        .getByRole("article", { name: "Personal phone", exact: true })
        .locator("svg.lucide-fingerprint")
        .count(),
      1,
    );
    assert.equal(
      await page
        .getByRole("article", { name: "Face verification", exact: true })
        .locator("svg.lucide-scan-face")
        .count(),
      1,
    );
    assert.equal(
      await page
        .getByRole("article", { name: "Windows laptop", exact: true })
        .locator('svg[fill="currentColor"]')
        .count(),
      1,
    );
    assert.equal(
      await examples.getByText("Windows Hello", { exact: true }).count(),
      1,
    );
    const windows = page
      .locator("article")
      .filter({ hasText: "Microsoft Edge" });
    const iphone = page.locator("article").filter({ hasText: "Safari" });
    const tablet = page.locator("article").filter({ hasText: "Android" });
    assert.match(await windows.innerText(), /Alexandria/);
    assert.match(
      await iphone.innerText(),
      ar ? /بيانات الهاتف/ : /Mobile data/,
    );
    await iphone
      .getByRole("button", { name: ar ? "تفاصيل الجلسة" : "Session details" })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    assert.equal(await dialog.getAttribute("dir"), ar ? "rtl" : "ltr");
    assert.match(await dialog.innerText(), /192\.0\.2\.2/);
    assert.equal(
      await dialog.getByRole("link").getAttribute("href"),
      "https://www.google.com/maps/search/?api=1&query=51.5,-0.12",
    );
    assert.equal(await dialog.getByText(/GPS/).count(), 0);
    await page.screenshot({
      path: path.join(output, `${locale}-session-dialog.png`),
    });
    await dialog.press("Escape");
    await tablet
      .getByRole("button", { name: ar ? "تفاصيل الجلسة" : "Session details" })
      .click();
    await dialog.waitFor();
    assert.equal(
      await dialog.getByRole("link").count(),
      0,
      "No invented map for an unknown session",
    );
    assert.doesNotMatch(
      await dialog.innerText(),
      /Cairo|القاهرة|156\.204\.18\.92/,
    );
    await dialog.press("Escape");
    await iphone
      .getByRole("button", {
        name: ar ? "تسجيل الخروج" : "Sign out",
        exact: true,
      })
      .click();
    await page.getByRole("alertdialog").waitFor();
    assert.equal(mutations.length, 0, "Sign-out waits for confirmation");
    await page
      .getByRole("button", { name: ar ? "إلغاء" : "Cancel", exact: true })
      .click();
    await page.screenshot({
      path: path.join(output, `${locale}-desktop.png`),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    const messages = JSON.parse(
      await fs.readFile(
        path.join(web, "src/messages", `${locale}.json`),
        "utf8",
      ),
    );
    const descriptionBox = await page
      .getByText(messages.authSecurity.sessionsDescription, { exact: true })
      .boundingBox();
    assert.ok(
      descriptionBox.width >= 220,
      "Mobile session header retains readable text width",
    );
    await page.screenshot({
      path: path.join(output, `${locale}-mobile.png`),
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      "No mobile horizontal overflow",
    );
    for (const width of [290, 320, 390, 768]) {
      await page.setViewportSize({ width, height: 900 });
      await assertReadable(`${locale} security at ${width}px`);
    }
    const workKey = page.getByRole("article", {
      name: "Work passkey",
      exact: true,
    });
    assert.equal(await workKey.locator("svg.lucide-cloud-check").count(), 0);
    await workKey
      .getByRole("button", { name: messages.passkeys.editAction })
      .click();
    const keyDialog = page.getByRole("dialog");
    await keyDialog.waitFor();
    await keyDialog.getByRole("combobox").click();
    await page
      .getByRole("option", { name: "Windows Hello", exact: true })
      .click();
    await keyDialog.locator("#passkey-password").fill("synthetic-password");
    await keyDialog
      .getByRole("button", { name: messages.passkeys.confirm, exact: true })
      .click();
    await keyDialog.waitFor({ state: "hidden" });
    await workKey.getByText("Windows Hello", { exact: true }).waitFor();
    assert.deepEqual(
      mutations.map(({ pathname }) => pathname),
      ["/auth/passkeys/reauthenticate", "/auth/passkeys/synthetic-key-0"],
    );
    assert.equal(mutations[0].body.operation, "rename");
    assert.equal(mutations[0].body.credentialId, "synthetic-key-0");
    assert.equal(mutations[1].body.unlockMethod, "windowsHello");
    await page.reload();
    await workKey.getByText("Windows Hello", { exact: true }).waitFor();
    await page.setViewportSize({ width: 290, height: 900 });
    await assertReadable(`${locale} passkey selector at narrow width`);
    await workKey
      .getByRole("button", { name: messages.passkeys.editAction })
      .click();
    await keyDialog.waitFor();
    await assertReadable(`${locale} passkey dialog at 290px`);
    await keyDialog.getByRole("combobox").click();
    assert.equal(
      await page.getByRole("listbox").getAttribute("dir"),
      ar ? "rtl" : "ltr",
    );
    await page.getByRole("listbox").press("Escape");
    await keyDialog
      .getByRole("button", { name: messages.passkeys.cancel, exact: true })
      .click();
    await page.screenshot({
      path: path.join(output, `${locale}-narrow-security.png`),
      fullPage: true,
    });
    await page.setViewportSize({ width: 1536, height: 1100 });
  }
  scenario = "error";
  await page.goto(`${base}/?locale=en`);
  await page
    .getByText("Could not load your sessions. Please try again.")
    .waitFor();
  scenario = "normal";
  await page.getByRole("button", { name: "Try again" }).click();
  await page.locator("article").filter({ hasText: "Microsoft Edge" }).waitFor();
  scenario = "empty";
  await page.reload();
  await page.getByText("No active sessions to display.").waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Sign out all devices" }).count(),
    0,
  );
  scenario = "normal";
  for (const locale of ["en", "ar"]) {
    const ar = locale === "ar";
    mutations.length = 0;
    visibility = { registrationVisible: false, syllabiVisible: false };
    await page.goto(`${base}/?view=settings&locale=${locale}`);
    await page
      .getByRole("heading", {
        name: /خدمات بوابة الطلاب|Student portal services/,
      })
      .waitFor();
    const show = page.getByRole("button", {
      name: ar ? "إتاحة الصفحة للطلاب" : "Make page available",
      exact: true,
    });
    await show.first().waitFor();
    for (const width of [290, 320, 390, 768, 1536]) {
      await page.setViewportSize({ width, height: 1000 });
      await assertReadable(`${locale} settings at ${width}px`);
      if (width === 290 || width === 1536)
        await page.screenshot({
          path: path.join(output, `${locale}-settings-${width}.png`),
          fullPage: true,
        });
    }
    await show.first().click();
    await page
      .getByRole('button', { name: ar ? 'إخفاء الصفحة للطلاب' : 'Hide page from students', exact: true })
      .waitFor();
    assert.deepEqual(mutations[0], {
      method: "PATCH",
      pathname: "/admin/portal-settings",
      body: { registrationVisible: true },
    });
    await page.setViewportSize({ width: 290, height: 900 });
    for (const name of ar
      ? [
          "تصفير جميع الإنذارات",
          "تصفير جميع المعدلات",
          "تصفير المعدل والإنذارات",
        ]
      : ["Reset all warnings", "Reset all GPAs", "Reset GPA and warnings"]) {
      await page.getByRole("button", { name, exact: true }).click();
      const confirm = page.getByRole("alertdialog");
      await confirm.waitFor();
      assert.equal(await confirm.getAttribute("dir"), ar ? "rtl" : "ltr");
      await assertReadable(`${locale} reset confirmation`);
      await confirm
        .getByRole("button", { name: ar ? "إلغاء" : "Cancel", exact: true })
        .click();
    }
    assert.equal(
      mutations.filter(({ pathname }) =>
        pathname.includes("reset-academic-records"),
      ).length,
      0,
      "Cancelled resets never call the API",
    );
    // Render the other actual settings panels, retaining their permission gates.
    for (const tabIndex of [1, 2, 3, 4]) {
      await page
        .getByRole("navigation")
        .getByRole("button")
        .nth(tabIndex)
        .click();
      await page.waitForLoadState("networkidle");
      await page
        .locator("#settings-panel h2, #settings-panel h3")
        .first()
        .waitFor();
      await assertReadable(`${locale} settings tab ${tabIndex}`);
      if (tabIndex === 1) {
        await page.getByRole('button', {name:ar?'شرائح الساعات والمعدل (GPA)':'GPA & Course Rules',exact:true}).click();
        await page.waitForLoadState('networkidle');
        await page.getByRole('heading', {name:ar?'قواعد التسجيل الحالية':'Active Registration Rules',exact:true}).waitFor();
        await assertReadable(`${locale} GPA settings`);
      }
      await page.screenshot({
        path: path.join(output, `${locale}-settings-tab-${tabIndex}-290.png`),
        fullPage: true,
      });
    }
  }
  scenario = "settings-error";
  await page.goto(`${base}/?view=settings&locale=en`);
  await page
    .getByText("Could not load settings. Try again before making changes.")
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: /Make page available|Show syllabi card/ })
      .count(),
    0,
  );
  scenario = "normal";
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await page
    .getByRole("button", { name: /Make page available|Show syllabi card/ })
    .first()
    .waitFor();
  await page.goto(
    `${base}/?view=settings&locale=en&role=staff&permissions=registration.write&tab=portal`,
  );
  await page.getByRole("navigation").waitFor();
  assert.equal(
    await page.getByRole("navigation").getByRole("button").count(),
    1,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Reset GPA and warnings", exact: true })
      .count(),
    0,
  );
  assert.equal(
    await page
      .getByRole("button", { name: /Make page available|Show syllabi card/ })
      .count(),
    0,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: Arabic/English security and settings at 290–1536px, per-key labels and reauthentication, settings toggles, cancelled resets, permissions, maps, retry and empty states. Screenshots: outputs/security-review",
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
