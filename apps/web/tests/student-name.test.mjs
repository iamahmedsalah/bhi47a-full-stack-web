import assert from 'node:assert/strict';
import test from 'node:test';
import { getStudentFullName, getStudentDisplayNames } from '../src/features/students/student-name.ts';
import { studentFormSchema } from '../src/features/students/schema.ts';

test('editing the Arabic name replaces a stale canonical name', () => {
  const values = { fullName: 'Old Name', fullNameAr: '  أحمد علي  ', fullNameEn: 'Ahmed Ali' };
  assert.equal(getStudentFullName(values), 'أحمد علي');
});

test('English-only edits replace the previous canonical name', () => {
  const values = { fullName: 'Old Name', fullNameAr: ' ', fullNameEn: '  New Name  ' };
  assert.equal(getStudentFullName(values), 'New Name');
});

test('dashboard names follow the selected language and prefer the current profile', () => {
  const profile = { fullName: 'Legacy', fullNameAr: 'أحمد علي', fullNameEn: 'Ahmed Ali' };
  const user = { name: 'Old Name', nameAr: 'Old Arabic', nameEn: 'Old English' };
  assert.deepEqual(getStudentDisplayNames('ar', profile, user), { primary: 'أحمد علي', secondary: 'Ahmed Ali' });
  assert.deepEqual(getStudentDisplayNames('en', profile, user), { primary: 'Ahmed Ali', secondary: 'أحمد علي' });
});

test('dashboard falls back while the profile is loading and avoids duplicate names', () => {
  assert.deepEqual(getStudentDisplayNames('en', null, { name: 'Legacy', nameEn: 'Ahmed Ali' }), {
    primary: 'Ahmed Ali', secondary: undefined,
  });
  assert.deepEqual(getStudentDisplayNames('ar', { fullName: 'Ahmed Ali', fullNameEn: 'Ahmed Ali' }), {
    primary: 'Ahmed Ali', secondary: undefined,
  });
});

test('clearing visible name fields cannot pass validation through a hidden old name', () => {
  const result = studentFormSchema.safeParse({
    fullName: 'Old Name', fullNameAr: '', fullNameEn: '',
    studentCode: '123456', academicEmail: '', level: '1',
    academicYear: '2026-2027', semester: 'first', enrollmentStatus: 'active',
  });
  assert.equal(result.success, false);
  assert.ok(result.error.issues.some((issue) => issue.path.includes('fullNameAr')));
});
