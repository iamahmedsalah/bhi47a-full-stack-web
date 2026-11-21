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
