import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createStudentFormSchema } from '../src/features/students/schema.ts';
import {
  studentCodeSchema,
  studentPasswordSchema,
  permanentStudentPasswordSchema,
  baseAdminLoginSchema,
  baseChangePasswordSchema,
} from '@student-portal/shared';
for (const locale of ['ar','en']) test(`student form validation uses ${locale} messages`, () => {
  const messages = JSON.parse(fs.readFileSync(new URL(`../src/messages/${locale}.json`,import.meta.url),'utf8')).students.formValidation;
  const result = createStudentFormSchema(key => messages[key]).safeParse({ fullNameAr:'', fullNameEn:'', studentCode:'abc', nationalId:'12', phone:'x', academicEmail:'bad', level:'', academicYear:'', semester:'', enrollmentStatus:'' });
  assert.equal(result.success,false);
  for(const issue of result.error.issues) assert.ok(Object.values(messages).includes(issue.message),issue.message);
  assert.ok(result.error.issues.some(issue=>issue.message===messages.studentCodeFormat));
});

test('shared Zod schemas preserve student identity and password boundaries', () => {
  assert.equal(studentCodeSchema.parse(' 260001 '), '260001');
  for (const code of ['123', '1234567890123', '26student', '']) {
    assert.equal(studentCodeSchema.safeParse(code).success, false);
  }
  assert.equal(studentPasswordSchema.safeParse('123456').success, true);
  assert.equal(studentPasswordSchema.safeParse('12345').success, false);
  assert.equal(permanentStudentPasswordSchema.safeParse('Student123').success, true);
  for (const password of ['12345678', 'abcdefgh', 'Student 123', 'Ab1'.repeat(34)]) {
    assert.equal(permanentStudentPasswordSchema.safeParse(password).success, false);
  }
});

test('shared validation retains admin email and password-change field errors', () => {
  assert.equal(baseAdminLoginSchema.safeParse({ email: 'reviewer@example.com', password: 'password' }).success, true);
  const admin = baseAdminLoginSchema.safeParse({ email: 'invalid', password: '' });
  assert.equal(admin.success, false);
  assert.deepEqual(new Set(admin.error.issues.map(issue => issue.path[0])), new Set(['email', 'password']));
  const change = baseChangePasswordSchema.safeParse({ currentPassword: '', newPassword: 'weak', confirmPassword: '' });
  assert.equal(change.success, false);
  assert.deepEqual(new Set(change.error.issues.map(issue => issue.path[0])), new Set(['currentPassword', 'newPassword', 'confirmPassword']));
});
