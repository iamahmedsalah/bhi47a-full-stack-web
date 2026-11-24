import assert from 'node:assert/strict';
import test from 'node:test';
import { getAttendanceErrorMessage } from '../src/features/attendance/schemas/attendance-schemas.ts';

test('QR and staff manual attendance show the enrollment validation in both languages', () => {
  const error = { message: 'الطالب غير مسجل بالمقرر في هذا الفصل الدراسي، ولا يمكن تسجيل حضوره.' };
  for (const payload of [error, { response: { data: error } }]) {
    assert.equal(getAttendanceErrorMessage(payload, 'ar'), error.message);
    assert.match(getAttendanceErrorMessage(payload, 'en'), /student is not enrolled.*semester/);
  }
});

test('a browser used by another student never displays a previous check-in confirmation', () => {
  const errors = [
    { code: 'ATTENDANCE_DEVICE_ALREADY_USED' },
    { message: 'تم استخدام هذا الجهاز مسبقاً لتسجيل حضور طالب آخر في هذه المحاضرة.' },
  ];
  for (const error of errors) {
    const response = { response: { data: error } };
    assert.equal(
      getAttendanceErrorMessage(response, 'ar'),
      'تم استخدام هذا المتصفح لتسجيل حضور طالب آخر في الجلسة.',
    );
    assert.match(getAttendanceErrorMessage(response, 'en'), /another student/);
  }
});
