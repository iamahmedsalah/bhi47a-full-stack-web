import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createStudentFormSchema } from '../src/features/students/schema.ts';
for (const locale of ['ar','en']) test(`student form validation uses ${locale} messages`, () => {
  const messages = JSON.parse(fs.readFileSync(new URL(`../src/messages/${locale}.json`,import.meta.url),'utf8')).students.formValidation;
  const result = createStudentFormSchema(key => messages[key]).safeParse({ fullNameAr:'', fullNameEn:'', studentCode:'abc', nationalId:'12', phone:'x', academicEmail:'bad', level:'', academicYear:'', semester:'', enrollmentStatus:'' });
  assert.equal(result.success,false);
  for(const issue of result.error.issues) assert.ok(Object.values(messages).includes(issue.message),issue.message);
  assert.ok(result.error.issues.some(issue=>issue.message===messages.studentCodeFormat));
});
