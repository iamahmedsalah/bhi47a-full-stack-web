// Synthetic local browser regressions; no live API/database or account credentials.
// Start a production web build on 127.0.0.1:3012, then run this script.
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const path = require('node:path');
const fs = require('node:fs/promises');
const apiRequire = createRequire(path.resolve(__dirname, '../apps/api/package.json'));
const { chromium } = apiRequire('playwright');
const baseURL = process.env.PERF_UI_BASE_URL || 'http://127.0.0.1:3012';
assert(['localhost', '127.0.0.1', '[::1]'].includes(new URL(baseURL).hostname), 'Local UI only');

function summary(window) {
  return {
    timestamp: new Date().toISOString(), uptimeSeconds: 1000,
    system: { nodeVersion: 'test', cpuCores: 4, loadAverage: [0, 0, 0], memoryHeapUsedMb: 50, memoryHeapTotalMb: 100, memoryRssMb: 100, cpuUsage: { user: 1, system: 1 }, eventLoop: { meanMs: 1, p99Ms: 2, maxMs: 3 } },
    http: { totalRequests: 99999, requestsPerSecond: 999, avgLatencyMs: 999, status2xx: 999, status4xx: 999, status5xx: 0, routes: [], topSlowestRoutes: [] },
    database: { status: 'connected', pingLatencyMs: 2, readyState: 1, totalQueries: 10, slowQueriesCount: 0, recentSlowQueries: [], slowQueriesByCollection: [], availableCollections: [], availableOperations: [],
      driverDiagnostics: { scope: 'process', checkedOut: 2, waiters: 1, poolClears: 3, checkout: { count: 10, failures: 2, avgMs: 143, maxMs: 1100 },
        commands: [{ command: 'find', count: 20, failures: 2, avgMs: 4500, maxMs: 45000 }],
        recentFailures: [{ timestamp: '2026-11-14T18:00:00Z', kind: 'command', command: 'find', durationMs: 45000, category: 'socket_timeout', errorName: 'MongoNetworkTimeoutError', code: 'ETIMEDOUT', stage: 'complaints.page', requestId: 'synthetic-correlation-id' }],
      } },
    security: { successfulLogins: 1, failedLogins: 0, rateLimitBlocks: 0, antiCheatViolations: 0 },
    academic: { activeQuizAttempts: 0, quizzesSubmitted: 0, excelRowsImported: 0 },
    traffic: { source: 'prometheus', window, prometheusAvailable: true, observedSeconds: 300, resolutionSeconds: 0,
      totalRequests: window === '15m' ? 300 : 100, requestsPerSecond: 0.33,
      avgLatencyMs: 100, p50LatencyMs: 50, p95LatencyMs: 450, p99LatencyMs: null, successfulP95LatencyMs: 460,
      overTenSeconds: 4, latencyOverflowRequests: 2, latencyUpperBoundMs: 120000,
      status2xx: 80, status3xx: 0, status4xx: 20, status5xx: 0, rawErrorRatePercent: 20, actionableErrorRatePercent: 0,
      statusCounts: { 200: 80, 401: 20 }, outcomes: { anonymous_probe: 20 }, avgDbQueries: 2, p95DbQueries: 3,
      routes: [{ route: 'GET /api/admin/complaints', totalRequests: 80, p95LatencyMs: 450, errorCount: 0 }, { route: 'GET /api/auth/me', totalRequests: 20, p95LatencyMs: 10, errorCount: 20 }],
    }, recentSlowRequests: [],
  };
}

async function main() {
  const output = path.resolve(__dirname, '../outputs/performance');
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
  try {
    for (const locale of ['ar', 'en']) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
      const logo = await fs.readFile(path.resolve(__dirname, '../apps/web/public/logo.webp'));
      await context.route((url) => url.hostname === 'res.cloudinary.com' || url.pathname === '/_next/image', (route) => route.fulfill({ contentType: 'image/webp', body: logo }));
      await context.addInitScript(() => localStorage.setItem('theme', 'dark'));
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const requests = [];
      let releaseAuth;
      const authGate = new Promise((resolve) => { releaseAuth = resolve; });
      let authCompleted = false;
      const premature = [];
      await context.route('**/api/**', async (route) => {
        const url = new URL(route.request().url());
        requests.push(url.pathname);
        let data = { items: [], total: 0, page: 1, limit: 20, totalPages: 0 };
        if (url.pathname.endsWith('/auth/me')) {
          await authGate;
          authCompleted = true;
          data = { _id: '507f1f77bcf86cd799439011', role: 'admin', name: 'Synthetic admin', permissions: [], mustChangePassword: false, theme: 'dark' };
        } else {
          if (!authCompleted) premature.push(url.pathname);
          if (url.pathname.endsWith('/metrics/summary')) data = summary(url.searchParams.get('window'));
          if (url.pathname.endsWith('/notifications/unread-count')) data = { count: 0 };
        }
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
      });
      await page.goto(`${baseURL}/${locale}/admin/metrics`, { waitUntil: 'domcontentloaded' });
      await page.getByText(locale === 'ar' ? 'جارٍ التحقق من الجلسة...' : 'Checking session...', { exact: true }).waitFor();
      assert.deepEqual(premature, [], 'Protected queries must not race /me');
      releaseAuth();
      await page.getByRole('heading', { name: locale === 'ar' ? 'تشخيص حركة الطلبات وتصنيف الاستجابات خلال الفترة المحددة' : 'HTTP Traffic & Response Diagnostics in Selected Window', exact: true }).waitFor();
      await page.getByText('0.33 RPS', { exact: true }).waitFor();
      await page.getByRole('heading', { name: locale === 'ar' ? 'تشخيص اتصال وأوامر MongoDB' : 'MongoDB connection and command diagnostics', exact: true }).waitFor();
      await page.getByText(locale === 'ar' ? 'انتهاء مهلة اتصال قاعدة البيانات' : 'Socket timeout', { exact: true }).waitFor();
      await page.getByText('synthetic-correlation-id', { exact: true }).waitFor();
      assert((await page.getByRole('status').allTextContents()).some((text) => text.includes('120')));
      assert.equal(await page.getByText('999 RPS', { exact: true }).count(), 0, 'Card must not display lifetime RPS');
      assert.deepEqual(premature, []);
      assert.equal(requests.filter((url) => url.endsWith('/auth/me')).length, 1);
      const selector = page.getByRole('combobox', { name: locale === 'ar' ? 'الفترة الزمنية' : 'Traffic window' });
      await selector.click();
      const changed = page.waitForResponse((response) => response.url().includes('/metrics/summary?window=15m'));
      await page.getByRole('option', { name: '15m', exact: true }).click();
      await changed;
      await page.getByRole('combobox', { name: locale === 'ar' ? 'الفترة الزمنية' : 'Traffic window' }).waitFor();
      await page.waitForFunction(() => {
        let element = document.querySelector('button[role="combobox"][aria-label="Traffic window"], button[role="combobox"][aria-label="الفترة الزمنية"]');
        if (!element) return false;
        while (element) {
          if (Number(getComputedStyle(element).opacity) < 0.99) return false;
          element = element.parentElement;
        }
        return true;
      });
      await page.screenshot({ path: path.join(output, `metrics-${locale}-desktop.png`), fullPage: false, animations: 'disabled' });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForFunction(() => {
        const main = document.querySelector('main')?.getBoundingClientRect();
        return main && main.x >= -1 && main.x < 50 && main.width > window.innerWidth - 50;
      });
      await page.screenshot({ path: path.join(output, `metrics-${locale}-mobile.png`), fullPage: false, animations: 'disabled' });
      await page.getByTestId('driver-diagnostics').screenshot({ path: path.join(output, `driver-${locale}-mobile.png`), animations: 'disabled' });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'No horizontal overflow');
      assert.deepEqual(errors, [], 'No browser runtime errors');
      await context.close();
      console.log(`${locale}: session gate, one auth probe, window selection, desktop/mobile rendering passed`);
    }
    for (const area of ['admin', 'dashboard']) {
      const context = await browser.newContext();
      const logo = await fs.readFile(path.resolve(__dirname, '../apps/web/public/logo.webp'));
      await context.route((url) => url.hostname === 'res.cloudinary.com' || url.pathname === '/_next/image', (route) => route.fulfill({ contentType: 'image/webp', body: logo }));
      const page = await context.newPage();
      let releaseAuth;
      const gate = new Promise((resolve) => { releaseAuth = resolve; });
      let probes = 0;
      const protectedRequests = [];
      await context.route('**/api/**', async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname.endsWith('/auth/me')) {
          probes++;
          await gate;
          await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ statusCode: 401, message: 'Unauthorized' }) });
          return;
        }
        if (url.pathname.startsWith('/api/admin/') || url.pathname.startsWith('/api/students/')) protectedRequests.push(url.pathname);
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { enabled: false, studentLoginEnabled: false, items: [] } }) });
      });
      await page.goto(`${baseURL}/en/${area}/${area === 'admin' ? 'metrics' : 'notifications'}`, { waitUntil: 'domcontentloaded' });
      await page.getByText('Checking session...', { exact: true }).waitFor();
      releaseAuth();
      await page.waitForURL(`**/en/login/${area === 'admin' ? 'admin' : 'student'}`);
      await page.getByRole('button', { name: /Sign in|Login|Log in/i }).first().waitFor();
      assert.equal(probes, 1, 'Anonymous redirect must not reload and probe /me again');
      assert.deepEqual(protectedRequests, [], 'Anonymous pages must not fetch protected features');
      await context.close();
      console.log(`${area}: anonymous redirect keeps one real 401 and no protected feature requests`);
    }
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
