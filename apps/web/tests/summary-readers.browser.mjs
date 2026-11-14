// Local, intercepted fixtures only. Compare the existing dashboard/profile UI
// using full versus summary payloads, including a collection larger than a page.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
const require = createRequire(new URL('../../api/package.json', import.meta.url));
const { chromium } = require('playwright');
const base = process.env.PERF_UI_BASE_URL ?? 'http://127.0.0.1:3012';
assert(['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname), 'Local web only');
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
const logo = await readFile(new URL('../public/logo.webp', import.meta.url));
const student = { _id: '507f1f77bcf86cd799439011', studentCode: 'SYNTHETIC', fullName: 'Synthetic student', fullNameAr: 'طالب تجريبي', level: '1', department: 'BIS', academicYear: '2026-2027', semester: 'first', enrollmentStatus: 'active', userId: { _id: '507f1f77bcf86cd799439012', name: 'Synthetic student', isActive: true } };
const statuses = ['open', 'in_review', 'in_progress', 'resolved', 'closed'];
const complaints = Array.from({ length: 137 }, (_, index) => ({
  _id: (index + 1).toString(16).padStart(24, '0'), ticketNumber: `TKT-${String(index + 1).padStart(4, '0')}`,
  studentCode: student.studentCode, studentName: student.fullName, title: `Ticket ${index + 1}`,
  status: statuses[index % statuses.length], priority: index % 2 ? 'medium' : 'high', type: 'academic',
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  description: 'large-body-'.repeat(400), screenshotUrl: `data:image/png;base64,${'A'.repeat(32000)}`,
  replies: [{ senderName: 'Synthetic support', message: 'Existing reply', senderRole: 'staff' }], internalNotes: [], statusHistory: [],
}));
const omittedFields = new Set(['description', 'screenshotUrl', 'replies', 'internalNotes', 'statusHistory']);
const summary = (item) => Object.fromEntries(Object.entries(item).filter(([key]) => !omittedFields.has(key)));
const pageData = (items, total, limit) => ({ items, total, page: 1, limit, totalPages: Math.ceil(total / limit) });

async function run(locale, mode, empty = false, denied = false) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route((url) => url.pathname === '/_next/image' || url.hostname === 'res.cloudinary.com', (route) => route.fulfill({ contentType: 'image/webp', body: logo }));
  const page = await context.newPage();
  const errors = [];
  const reads = [];
  let bytes = 0;
  page.on('pageerror', (error) => errors.push(error.message));
  await context.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let data = {};
    if (path.endsWith('/auth/me')) data = { _id: '507f1f77bcf86cd799439099', role: denied ? 'staff' : 'admin', staffType: 'administrative', name: 'Synthetic reader', permissions: denied ? ['courses.read'] : [], mustChangePassword: false };
    else if (path.endsWith('/admin/complaints')) {
      const limit = Number(url.searchParams.get('limit'));
      reads.push({ limit, search: url.searchParams.get('search'), view: url.searchParams.get('view') });
      const items = (empty ? [] : complaints).slice(0, limit);
      data = pageData(mode === 'summary' ? items.map(summary) : items, empty ? 0 : complaints.length, limit);
      bytes += Buffer.byteLength(JSON.stringify(data));
    } else if (/\/admin\/complaints\/[a-f\d]{24}$/.test(path)) data = { ...complaints[0], description: 'Complete ticket details', screenshotUrl: undefined };
    else if (path.endsWith('/admin/complaints/stats')) data = { total: 137, open: 28, review: 28, working: 27, resolved: 27, technical: 0, complaints: 137, high: 69, avgResolutionMs: null };
    else if (path.endsWith('/admin/complaints/assignees')) data = [];
    else if (path.endsWith('/admin/complaints/settings')) data = { complaintsSystemOpen: true, blacklistedStudentCodes: [] };
    else if (path.endsWith('/admin/students-stats')) data = { total: 22, active: 22, suspended: 0, graduated: 0, withdrawn: 0, liveOnline: 0, liveOnlineStaff: 0, byLevel: [], departments: [], cohortRetention: [], gpaDistribution: [] };
    else if (path.endsWith('/admin/students')) data = pageData([student], 1, Number(url.searchParams.get('limit')) || 20);
    else if (path.endsWith(`/admin/students/${student._id}`)) data = student;
    else if (path.endsWith('/admin/notifications') || path.endsWith('/notifications')) data = pageData([], 0, 20);
    else if (path.endsWith('/admin/exam-schedules') || path.startsWith('/api/staff/me/')) data = [];
    else if (path.endsWith('/courses') || path.endsWith('/admin/grades') || path.endsWith('/admin/academic-emails')) data = pageData([], 0, 100);
    const body = JSON.stringify({ success: true, data });
    await route.fulfill({ status: 200, contentType: 'application/json', body });
  });
  try {
    await page.goto(`${base}/${locale}/admin`, { waitUntil: 'networkidle' });
    await page.locator('#analytics-dashboard-export').waitFor();
    assert.equal(reads.length, denied ? 0 : 2, 'Keep both existing dashboard queries and their permission gate');
    if (denied) {
      assert.deepEqual(errors, []);
      return;
    }
    assert.deepEqual(reads.map(({ limit, view }) => ({ limit, view })).sort((a, b) => a.limit - b.limit), [{ limit: 1, view: 'summary' }, { limit: 100, view: 'summary' }]);
    assert(reads.every((read) => read.search === null));
    const dashboardText = await page.locator('#analytics-dashboard-export').innerText();
    if (!empty) assert(dashboardText.includes('137'), 'Total must remain collection-wide, not the 100-row sample size');
    await page.goto(`${base}/${locale}/admin/students?profile=${student.studentCode}`, { waitUntil: 'networkidle' });
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    await dialog.getByRole('tab', { name: locale === 'ar' ? /الشكاوى والتذاكر/ : /Complaints/ }).click();
    const profileText = await dialog.getByRole('tabpanel').innerText();
    assert(reads.some((read) => read.search === student.studentCode && read.limit === 50 && read.view === 'summary'));
    if (empty) {
      assert(profileText.includes(locale === 'ar' ? 'لا توجد شكاوى' : 'No complaints recorded'));
    } else {
      await dialog.getByText('TKT-0001', { exact: true }).click();
      await page.getByRole('dialog').getByText('Complete ticket details', { exact: true }).waitFor();
      assert.equal(new URL(page.url()).searchParams.get('ticket'), 'TKT-0001');
    }
    assert.deepEqual(errors, []);
    return { dashboardText, profileText, bytes };
  } finally { await context.close(); }
}

try {
  for (const locale of ['en', 'ar']) {
    const full = await run(locale, 'full');
    const lean = await run(locale, 'summary');
    assert.equal(lean.dashboardText, full.dashboardText, 'Dashboard figures and chart text must be unchanged');
    assert.equal(lean.profileText, full.profileText, 'Student complaint fields must be unchanged');
    assert(lean.bytes < full.bytes / 5, 'Summary fixtures must materially reduce response payload');
    await run(locale, 'summary', true);
    await run(locale, 'summary', false, true);
    console.log(`${locale}: dashboard/profile summary requests, full-payload UI equivalence, >100 totals, empty states, permissions and full detail links passed`);
  }
} finally { await browser.close(); }
