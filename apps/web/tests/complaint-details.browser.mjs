import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {mkdir, readFile} from 'node:fs/promises';
const require = createRequire(new URL('../../api/package.json', import.meta.url));
const { chromium } = require('playwright');
const base = process.env.PERF_UI_BASE_URL ?? 'http://127.0.0.1:3012';
assert(['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname), 'Local web only');
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
try {
  for (const locale of ['en', 'ar']) {
    const context = await browser.newContext({viewport: {width: 1440, height: 1000}});
    const logo = await readFile(new URL('../public/logo.webp', import.meta.url));
    await context.route((url) => url.pathname === '/_next/image' || url.hostname === 'res.cloudinary.com', (route) => route.fulfill({contentType:'image/webp',body:logo}));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const items = [1,2].map((index) => ({_id:`507f1f77bcf86cd79943901${index}`, ticketNumber:`TKT-PERF-${index}`, studentCode:'SYNTHETIC', studentName:'Synthetic student', title:`Ticket ${index}`, type:'academic', status:'open', priority:'medium', createdAt:'2026-10-28T12:00:00.000Z',updatedAt:'2026-10-28T12:00:00.000Z'}));
    let failNextDetail = true;
    let releaseFirst;
    const delayed = new Promise((resolve) => { releaseFirst = resolve; });
    let detailRequests = 0;
    let summaries = 0;
    await context.route('**/api/**', async (route) => {
      const url = new URL(route.request().url());
      let data = {};
      let status = 200;
      if (url.pathname.endsWith('/auth/me')) data = {_id:'507f1f77bcf86cd799439099',role:'staff',name:'Synthetic reader',permissions:['complaints.read'],mustChangePassword:false};
      else if (/\/admin\/complaints\/507/.test(url.pathname)) {
        detailRequests++;
        if (failNextDetail) {failNextDetail = false; status = 503; data = {message:'Synthetic temporary failure'};}
        else {
          const ticket = items.find((item) => url.pathname.endsWith(item._id));
          if (ticket === items[0]) await delayed;
          data = {...ticket, description:`Complete body ${ticket.ticketNumber}`, replies:[{senderId:'synthetic', senderName:'Staff',senderRole:'staff',message:`Reply for ${ticket.ticketNumber}`,createdAt:ticket.createdAt}]};
        }
      } else if (url.pathname.endsWith('/admin/complaints')) {
        assert.equal(url.searchParams.get('view'), 'summary');
        summaries++;
        data = {items, total:2, page:1, limit:20, totalPages:1};
      } else if (url.pathname.endsWith('/admin/complaints/stats')) data = {total:2,open:2,review:0,working:0,resolved:0,technical:0,complaints:0,high:0,avgResolutionMs:0};
      else if (url.pathname.endsWith('/admin/complaints/assignees')) data = [];
      else if (url.pathname.endsWith('/notifications/unread-count')) data = {count:0};
      else data = {items:[]};
      await route.fulfill({status,contentType:'application/json',body:JSON.stringify(status === 200 ? {success:true,data} : data)});
    });
    await page.goto(`${base}/${locale}/admin/complaints`, {waitUntil:'domcontentloaded'});
    const first = page.locator('td').getByText('TKT-PERF-1', {exact:true});
    await first.waitFor({state:'visible'});
    assert.equal(detailRequests,0, 'List must not download full details eagerly');
    await first.click();
    const detailError = page.getByRole('alert').filter({hasText: locale === 'ar' ? 'تعذر تحميل تفاصيل البلاغ.' : 'Could not load ticket details.'});
    await detailError.waitFor().catch(async (error) => {
      console.log({locale, detailRequests, summaries, alerts: await page.getByRole('alert').allTextContents(), errors});
      await mkdir(new URL('../../../outputs/performance/', import.meta.url), {recursive:true});
      await page.screenshot({path:new URL('../../../outputs/performance/complaint-details-failure.png', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')});
      throw error;
    });
    await detailError.getByRole('button',{name:locale === 'ar' ? 'إعادة المحاولة' : 'Retry',exact:true}).click();
    await page.getByRole('status').getByText(locale === 'ar' ? 'جاري تحميل تفاصيل البلاغ…' : 'Loading ticket details…',{exact:true}).waitFor();
    await page.locator('td').getByText('TKT-PERF-2',{exact:true}).click();
    await page.getByRole('dialog').getByText('Complete body TKT-PERF-2',{exact:true}).waitFor();
    releaseFirst();
    await page.getByRole('dialog').getByText('Reply for TKT-PERF-2',{exact:true}).waitFor();
    assert.equal(await page.getByRole('dialog').getByText('Complete body TKT-PERF-1',{exact:true}).count(),0,'Older response cannot replace the selected ticket');
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({state:'hidden'});
    await page.evaluate((url) => window.history.pushState({}, '', url), `/${locale}/admin/complaints?ticket=TKT-PERF-1`);
    await page.getByRole('dialog').getByText('Complete body TKT-PERF-1',{exact:true}).waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({state:'hidden'});
    await page.evaluate((url) => window.history.pushState({}, '', url), `/${locale}/admin/complaints?ticket=TKT-PERF-2`);
    await page.getByRole('dialog').getByText('Complete body TKT-PERF-2',{exact:true}).waitFor();
    assert(summaries > 0);
    assert.deepEqual(errors,[]);
    await context.close();
    console.log(`${locale}: summary list, detail retry, overlapping requests, replies, close and ticket links passed`);
  }
} finally { await browser.close(); }
