// Local fixtures only: verify request cancellation, retained results and timeout UX.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { COMPLAINT_READ_TIMEOUT_MS } from '../src/features/complaints/read-policy.ts';
const require = createRequire(new URL('../../api/package.json', import.meta.url));
const { chromium } = require('playwright');
const base = process.env.PERF_UI_BASE_URL ?? 'http://127.0.0.1:3012';
assert(['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname), 'Local web only');
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
try {
  for (const locale of ['en', 'ar']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const logo = await readFile(new URL('../public/logo.webp', import.meta.url));
    await context.route((url) => url.pathname === '/_next/image' || url.hostname === 'res.cloudinary.com', (route) => route.fulfill({ contentType: 'image/webp', body: logo }));
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    const ticket = { _id: '507f1f77bcf86cd799439011', ticketNumber: 'TKT-FETCH-1', studentCode: 'SYNTHETIC', studentName: 'Synthetic student', title: 'Initial result', type: 'academic', status: 'open', priority: 'medium', createdAt: '2026-11-14T18:00:00Z', updatedAt: '2026-11-14T18:00:00Z' };
    const held = new Map();
    let timeoutCalls = 0;
    let allowTimeoutResponse = false;
    const aborted = new Set();
    page.on('requestfailed', (request) => {
      const url = new URL(request.url());
      if (url.pathname.endsWith('/admin/complaints')) aborted.add(url.searchParams.get('search'));
    });
    await context.route('**/api/**', async (route) => {
      const url = new URL(route.request().url());
      let data = {};
      if (url.pathname.endsWith('/auth/me')) data = { _id: '507f1f77bcf86cd799439099', role: 'staff', name: 'Synthetic reader', permissions: ['complaints.read'], mustChangePassword: false };
      else if (url.pathname.endsWith('/admin/complaints')) {
        assert.equal(url.searchParams.get('view'), 'summary');
        const search = url.searchParams.get('search');
        if (search === 'timeout') timeoutCalls++;
        if (search === 'held' || (search === 'timeout' && !allowTimeoutResponse)) {
          await new Promise((resolve) => held.set(search, resolve));
        }
        data = { items: [{ ...ticket, studentCode: search || 'SYNTHETIC' }], total: 1, page: 1, limit: 20, totalPages: 1 };
      } else if (url.pathname.endsWith('/complaints/stats')) data = { total: 1, open: 1, review: 0, working: 0, resolved: 0, technical: 0, complaints: 1, high: 0, avgResolutionMs: null };
      else if (url.pathname.endsWith('/complaints/assignees')) data = [];
      else if (url.pathname.endsWith('/notifications')) data = { items: [] };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) }).catch(() => {});
    });
    await page.goto(`${base}/${locale}/admin/complaints`, { waitUntil: 'domcontentloaded' });
    await page.locator('td').getByText('TKT-FETCH-1', { exact: true }).waitFor();
    const search = page.getByRole('textbox', { name: locale === 'ar' ? 'بحث برقم التذكرة أو الطالب أو الموضوع' : 'Search by ticket, student, or subject', exact: true });
    await search.fill('held');
    const updating = page.getByRole('status').filter({ hasText: locale === 'ar' ? 'جارٍ تحديث الشكاوى' : 'Updating complaints' });
    await updating.waitFor();
    assert(await page.locator('#printable-complaints-list').getByText('SYNTHETIC', { exact: true }).isVisible());
    assert.equal(await page.locator('#printable-complaints-list').evaluate((node) => Boolean(node.closest('[inert]'))), true);
    await search.fill('latest');
    await page.locator('#printable-complaints-list').getByText('latest', { exact: true }).waitFor();
    await page.waitForFunction(() => !document.querySelector('#printable-complaints-list')?.closest('[inert]'));
    assert(aborted.has('held'), 'Changing the filter must cancel the obsolete request');
    held.get('held')?.();
    await search.fill('timeout');
    const timeout = page.getByRole('alert').filter({ hasText: locale === 'ar' ? 'استغرق التحميل وقتًا طويلًا' : 'Loading took too long' });
    await timeout.waitFor({ timeout: COMPLAINT_READ_TIMEOUT_MS + 5000 });
    assert.equal(timeoutCalls, 1, 'A timeout must not automatically repeat the entire request');
    assert(aborted.has('timeout'));
    const retry = timeout.getByRole('button', { name: locale === 'ar' ? 'إعادة المحاولة' : 'Retry', exact: true });
    held.get('timeout')?.();
    allowTimeoutResponse = true;
    await Promise.all([
      page.waitForResponse((response) => new URL(response.url()).searchParams.get('search') === 'timeout'),
      retry.click(),
    ]);
    await page.locator('#printable-complaints-list').getByText('timeout', { exact: true }).waitFor();
    assert.equal(timeoutCalls, 2);
    await context.close();
    assert.deepEqual(pageErrors, []);
    console.log(`${locale}: retained results, obsolete request cancellation, timeout and manual retry passed`);
  }
} finally { await browser.close(); }
