import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isPublicMarketingRoute, isPublicRoute } from '../src/lib/public-routes.ts';

test('marketing bootstrap excludes auth and protected routes in both locales', () => {
  for (const locale of ['ar', 'en']) {
    for (const suffix of ['', '/about', '/admission', '/news/article?from=home']) {
      assert.equal(isPublicMarketingRoute(`/${locale}${suffix}`), true);
    }
    for (const suffix of ['/complaints', '/login', '/login/student', '/login/change-password', '/forgot-password', '/attendance/check-in', '/dashboard', '/admin', '/admin/control']) {
      assert.equal(isPublicMarketingRoute(`/${locale}${suffix}`), false);
    }
    assert.equal(isPublicRoute(`/${locale}/attendance/check-in`), true);
    assert.equal(isPublicRoute(`/${locale}/complaints`), true);
    assert.equal(isPublicRoute(`/${locale}/dashboard/results`), false);
  }
});
