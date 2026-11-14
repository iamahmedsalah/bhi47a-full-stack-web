// Local synthetic metrics only; exercises the shared table UI in both directions.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
const require = createRequire(new URL('../../api/package.json', import.meta.url));
const { chromium } = require('playwright');
const base = process.env.PERF_UI_BASE_URL ?? 'http://127.0.0.1:3012';
assert(['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname), 'Local web only');
const output = new URL('../../../outputs/performance/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
const logo = await readFile(new URL('../public/logo.webp', import.meta.url));

function fixture() {
  return {
    timestamp: '2026-11-14T18:00:00Z', uptimeSeconds: 1000,
    system: { nodeVersion: 'test', cpuCores: 4, loadAverage: [0, 0, 0], memoryHeapUsedMb: 50, memoryHeapTotalMb: 100, memoryRssMb: 100, cpuUsage: { user: 1, system: 1 }, eventLoop: { meanMs: 1, p99Ms: 2, maxMs: 3 } },
    http: { totalRequests: 10, requestsPerSecond: 0.1, avgLatencyMs: 100, status2xx: 10, status4xx: 0, status5xx: 0, routes: [], topSlowestRoutes: [] },
    database: { status: 'connected', pingLatencyMs: 2, readyState: 1, totalQueries: 10, slowQueriesCount: 0, recentSlowQueries: [], driverDiagnostics: {
      scope: 'process', checkedOut: 1, waiters: 0, poolClears: 2, checkout: { count: 250, failures: 1, avgMs: 125.7, maxMs: 1393 },
      commands: [{ command: 'find', count: 101, failures: 8, avgMs: 1100, maxMs: 45000 }, { command: 'ping', count: 200, failures: 1, avgMs: 20, maxMs: 3000 }, { command: 'other', count: 8, failures: 8, avgMs: 1000, maxMs: 1000 }],
      recentFailures: Array.from({ length: 32 }, (_, index) => ({
        timestamp: `2026-11-14T18:00:${String(index).padStart(2, '0')}Z`,
        kind: ['command', 'operation', 'heartbeat', 'checkout'][index % 4],
        command: ['find', 'find', 'ping', 'other'][index % 4],
        category: ['socket_timeout', 'server_selection', 'network', 'checkout_timeout'][index % 4],
        durationMs: [45000, 9800, 3000, 1000][index % 4], errorName: 'MongoNetworkTimeoutError',
        requestId: index % 4 < 2 ? `request-${index}` : undefined,
        stage: index % 4 < 2 ? 'complaints.page' : undefined,
        code: 'ETIMEDOUT', checkoutReason: index % 4 === 3 ? 'timeout' : undefined,
      })),
    } },
    security: { successfulLogins: 1, failedLogins: 0, rateLimitBlocks: 0, antiCheatViolations: 0 },
    academic: { activeQuizAttempts: 0, quizzesSubmitted: 0, excelRowsImported: 0 },
  };
}

try {
  for (const locale of ['en', 'ar']) {
    const messages = JSON.parse(await readFile(new URL(`../src/messages/${locale}.json`, import.meta.url), 'utf8')).mongoDiagnostics;
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    await context.addInitScript(() => localStorage.setItem('theme', 'dark'));
    await context.route((url) => url.pathname === '/_next/image' || url.hostname === 'res.cloudinary.com', (route) => route.fulfill({ contentType: 'image/webp', body: logo }));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    let unavailable = false;
    let empty = false;
    await context.route('**/api/**', async (route) => {
      const url = new URL(route.request().url());
      let data = { items: [], total: 0 };
      if (url.pathname.endsWith('/auth/me')) data = { _id: '507f1f77bcf86cd799439011', role: 'admin', name: 'Synthetic admin', permissions: [], mustChangePassword: false };
      if (url.pathname.endsWith('/metrics/summary')) {
        assert([...url.searchParams.keys()].every((key) => key === 'window'), 'Diagnostics filters must remain client-side');
        data = fixture();
        if (unavailable) delete data.database.driverDiagnostics;
        else if (empty) data.database.driverDiagnostics.recentFailures = [];
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
    });
    await page.goto(`${base}/${locale}/admin/metrics?routeSearch=health&dbOperation=find`, { waitUntil: 'domcontentloaded' });
    const panel = page.getByTestId('driver-diagnostics');
    const rows = panel.locator('tbody tr');
    const expectRows = async (count) => {
      await page.waitForFunction((expected) => (document.querySelector('[data-testid="driver-diagnostics"] tbody')?.querySelectorAll('tr').length ?? 0) === expected, count);
      assert.equal(await rows.count(), count);
    };
    await rows.first().waitFor();
    await expectRows(25);
    await panel.getByRole('button', { name: locale === 'ar' ? 'التالي' : 'Next', exact: true }).click();
    await page.waitForFunction(() => new URL(location.href).searchParams.get('driverPage') === '2');
    await expectRows(7);
    const search = panel.getByRole('textbox', { name: messages.search });
    await search.fill('request-4');
    await page.waitForFunction(() => new URL(location.href).searchParams.get('driverSearch') === 'request-4');
    await expectRows(1);
    assert.equal(new URL(page.url()).searchParams.get('driverPage'), null);
    const select = async (label, option) => {
      await panel.getByRole('combobox', { name: label, exact: true }).click();
      assert.equal(await page.getByRole('option', { name: option, exact: true }).locator('..').evaluate((node) => node.closest('[dir]')?.getAttribute('dir')), locale === 'ar' ? 'rtl' : 'ltr');
      await page.getByRole('option', { name: option, exact: true }).click();
    };
    await select(messages.category, messages.categories.socket_timeout);
    await expectRows(1);
    await rows.first().getByRole('checkbox').click();
    const exportName = locale === 'ar' ? /تصدير CSV/ : /Export CSV/;
    const [download] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: exportName }).click()]);
    const csvPath = new URL(`driver-selected-${locale}.csv`, output).pathname.replace(/^\/([A-Za-z]:)/, '$1');
    await download.saveAs(csvPath);
    const csv = await readFile(csvPath);
    assert.deepEqual([...csv.subarray(0, 3)], [239, 187, 191]);
    assert(csv.toString().includes('request-4'));
    assert(csv.toString().includes('"Checkout Reason"'));
    assert(csv.toString().includes('"Operation"'));
    assert(!csv.toString().includes('request-0'));
    await rows.first().getByRole('button').click();
    assert.equal(await page.getByRole('menu').evaluate((node) => getComputedStyle(node).direction), locale === 'ar' ? 'rtl' : 'ltr');
    await page.getByRole('menuitem', { name: locale === 'ar' ? 'عرض التفاصيل والعينات' : 'View details and samples', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('heading', { name: messages.failureDetails }).waitFor();
    assert.equal(await dialog.getAttribute('dir'), locale === 'ar' ? 'rtl' : 'ltr');
    await dialog.getByText('request-4', { exact: true }).waitFor();
    await page.keyboard.press('Escape');
    await panel.getByRole('button', { name: messages.clearFilters }).click();
    assert.equal(new URL(page.url()).searchParams.get('routeSearch'), 'health');
    assert.equal(new URL(page.url()).searchParams.get('dbOperation'), 'find');
    await select(messages.command, 'ping');
    await select(messages.kind, messages.kinds.heartbeat);
    await expectRows(8);
    await select(messages.durationFilter, messages.atLeast.replace('{ms}', '10,000'));
    await panel.getByText(locale === 'ar' ? 'لا توجد نتائج مطابقة. جرّب تغيير المرشحات.' : 'No matching results. Try changing the filters.', { exact: true }).waitFor();
    assert(await panel.getByRole('button', { name: exportName }).isDisabled());
    await panel.getByRole('button', { name: messages.clearFilters }).click();
    await select(messages.view, messages.commandSummary);
    await expectRows(3);
    await select(messages.sort, messages.mostFailures);
    await rows.first().getByText('101', { exact: true }).waitFor();
    await select(messages.durationFilter, messages.atLeast.replace('{ms}', '10,000'));
    await expectRows(1);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await rows.first().waitFor();
    await expectRows(1);
    assert.equal(new URL(page.url()).searchParams.get('driverView'), 'commands');
    await panel.screenshot({ path: new URL(`driver-commands-${locale}-desktop.png`, output).pathname.replace(/^\/([A-Za-z]:)/, '$1') });
    await panel.getByRole('button', { name: messages.clearFilters }).click();
    await panel.screenshot({ path: new URL(`driver-table-${locale}-desktop.png`, output).pathname.replace(/^\/([A-Za-z]:)/, '$1') });
    await page.setViewportSize({ width: 390, height: 844 });
    await panel.screenshot({ path: new URL(`driver-table-${locale}-mobile.png`, output).pathname.replace(/^\/([A-Za-z]:)/, '$1') });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No page-level horizontal overflow');
    empty = true;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await panel.getByText(messages.noFailures, { exact: true }).waitFor();
    unavailable = true;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await panel.getByText(messages.unavailable, { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`${locale}: filters, URL isolation, pagination, selected CSV, details, command view, empty states and mobile layout passed`);
  }
} finally { await browser.close(); }
