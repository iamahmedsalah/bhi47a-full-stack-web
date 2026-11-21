import assert from 'node:assert/strict';
import test from 'node:test';
import { getUserDisplayName } from '../src/lib/user-name.ts';

test('account names follow the active language', () => {
  const user = { role: 'student', name: 'Legacy', nameAr: 'أحمد علي', nameEn: 'Ahmed Ali' };
  assert.equal(getUserDisplayName(user, 'ar'), 'أحمد علي');
  assert.equal(getUserDisplayName(user, 'en'), 'Ahmed Ali');
});

test('staff names retain localized academic titles', () => {
  const user = { role: 'staff', staffType: 'assistant_lecturer', name: 'Mr. Ahmed Soliman', nameAr: 'أحمد سليمان' };
  assert.equal(getUserDisplayName(user, 'ar'), 'م. م أحمد سليمان');
  assert.equal(getUserDisplayName(user, 'en'), 'A.L. Ahmed Soliman');
});

test('missing translations fall back to the available name', () => {
  assert.equal(getUserDisplayName({ name: 'Ahmed' }, 'ar'), 'Ahmed');
  assert.equal(getUserDisplayName({ nameAr: 'أحمد' }, 'en'), 'أحمد');
  assert.equal(getUserDisplayName(null, 'ar'), '');
});
