const { test } = require('node:test');
const assert = require('node:assert/strict');
const { analyze } = require('./control-data-audit.cjs');
test('reports identity, publication, breakdown, duplicate and legacy-total risks without exposing student data', () => {
  const common = { studentId: 'private-student-id', studentCode: 'old-code', courseId: 'course', courseCode: 'CS101', academicYear: '2026-2027', semester: 'first', status: 'present', rev: 1 };
  const report = analyze({ users: [{ _id: common.studentId, studentCode: 'new-code' }], grades: [{ ...common, examType: 'midterm', grade: 10, controlManaged: true, isPublished: true }, { ...common, examType: 'midterm', grade: 12 }, { ...common, examType: 'final', grade: 60 }, { ...common, examType: 'total', grade: 80 }, { ...common, examType: 'coursework', grade: 20, attendanceMark: 7, quizzesMark: 15 }] });
  assert.equal(report.counts.duplicateComponents, 1);
  assert.equal(report.counts.mixedTotalsAndComponents, 1);
  assert.equal(report.counts.legacyFinalsNeedingClassification, 1);
  assert.equal(report.counts.unapprovedPublishedControlMarks, 1);
  assert.equal(report.counts.invalidCourseworkBreakdown, 1);
  assert.equal(report.counts.codeIdentityMismatches, 5);
  assert.ok(!JSON.stringify(report).includes(common.studentId));
  assert.ok(!JSON.stringify(report).includes(common.studentCode));
});
