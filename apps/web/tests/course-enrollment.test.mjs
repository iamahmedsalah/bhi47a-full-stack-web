import assert from 'node:assert/strict';
import test from 'node:test';
import { enrollmentResultStatus, matchesEnrollmentCourse, mergeEnrollmentResults, localizeEnrollmentError } from '../src/features/courses/enrollment-utils.ts';

const batch = { courseId: 'course', courseCode: '326', courseName: 'Governmental Accounting', totalRows: 150, enrolledCount: 0, alreadyEnrolledCount: 0, skippedBlockedCount: 0, errorCount: 150, errors: ['السطر 2: Invalid'], issues: [{ row: 2, code: 'VALIDATION_ERROR', message: 'Invalid' }] };
test('aggregates all failed rows rather than counting the error sample', () => {
  const result = mergeEnrollmentResults(batch, { ...batch, totalRows: 50, errorCount: 50 }, 150);
  assert.equal(result.totalRows, 200);
  assert.equal(result.errorCount, 200);
  assert.equal(result.errors.length, 2);
  assert.equal(result.issues[1].row, 152);
  assert.match(result.errors[1], /152/);
  assert.equal(enrollmentResultStatus(result), 'failed');
  assert.equal(enrollmentResultStatus({ ...result, enrolledCount: 1 }), 'partial');
  assert.equal(enrollmentResultStatus({ ...result, errorCount: 0 }), 'unchanged');
});
test('matches level, department and term within the same placement', () => {
  const course = { code: '326', level: '3' };
  for (const [department, semester, expected] of [['ACCOUNTING', 'first', true], ['ACCOUNTING', 'second', false], ['BIS', 'first', false], ['BIS', 'second', true]]) {
    assert.equal(matchesEnrollmentCourse(course, { department, semester, level: '3' }), expected);
  }
  assert.equal(matchesEnrollmentCourse(course, { department: 'all', semester: 'first', level: '4' }), false);
  assert.equal(matchesEnrollmentCourse({ code: '317', level: '3' }, { department: 'ACCOUNTING', semester: 'first', level: '3' }), true);
});
test('presents one localized error instead of a bilingual duplicate', () => {
  const message = 'السطر 2: Registration limit exceeded / تجاوز حد التسجيل';
  assert.equal(localizeEnrollmentError(message, 'ar'), 'تجاوز حد التسجيل');
  assert.match(localizeEnrollmentError(message, 'en'), /Registration limit exceeded/);
});

test('keeps legacy offerings and prefers explicit programme placement over a general fallback', () => {
  const legacy = { code:'LEGACY', department:'GENERAL', level:'1', semester:'first', offeredTerms:['first','summer'] };
  assert.equal(matchesEnrollmentCourse(legacy,{ department:'BIS',semester:'summer',level:'1' }),true);
  assert.equal(matchesEnrollmentCourse({ code:'326',level:'3',offeredTerms:['summer'] },{ department:'BIS',semester:'summer',level:'3' }),false);
  const explicit = { code:'CUSTOM', curricula:[{ department:'GENERAL',academicLevel:'3',semester:'first',type:'required' },{ department:'BIS',academicLevel:'3',semester:'second',type:'required' }] };
  assert.equal(matchesEnrollmentCourse(explicit,{ department:'BIS',semester:'first',level:'3' }),false);
  assert.equal(matchesEnrollmentCourse(explicit,{ department:'BIS',semester:'second',level:'3' }),true);
  assert.equal(matchesEnrollmentCourse(explicit,{ department:'ACCOUNTING',semester:'first',level:'3' }),true);
});
