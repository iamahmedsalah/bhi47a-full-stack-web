import { Types } from 'mongoose';
import type { AttendanceSession } from '../schemas/attendance-session.schema';

export function attendanceEnrollmentFilter(
  studentId: Types.ObjectId,
  session: Pick<AttendanceSession, 'courseCode' | 'academicYear' | 'semester'>,
) {
  return {
    studentId,
    courses: session.courseCode,
    academicYear: session.academicYear,
    semester: session.semester,
    status: 'approved',
  };
}

export const ATTENDANCE_NOT_ENROLLED = {
  code: 'ATTENDANCE_NOT_ENROLLED',
  message:
    'الطالب غير مسجل بالمقرر في هذا الفصل الدراسي، ولا يمكن تسجيل حضوره.',
};
