import ExcelJS from 'exceljs';
import type { AttendanceSession } from '../schemas/attendance-session.schema';
import type { AttendanceRecord } from '../schemas/attendance-record.schema';

export interface AttendanceExportEntry {
  session: AttendanceSession & { _id: { toString(): string } };
  records: AsyncIterable<AttendanceRecord>;
}

export async function createAttendanceWorkbook(
  entries: AsyncIterable<AttendanceExportEntry>,
  lang: 'ar' | 'en' = 'en',
) {
  const ar = lang === 'ar';
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Student Portal';
  workbook.created = new Date();
  const sheet = (
    name: string,
    columns: [string, string, string, number?][],
  ) => {
    const result = workbook.addWorksheet(name, {
      views: [{ rightToLeft: ar, state: 'frozen', ySplit: 1 }],
    });
    result.columns = columns.map(([key, en, arabic, width]) => ({
      key,
      header: ar ? arabic : en,
      width: width || 22,
    }));
    result.getRow(1).height = 30;
    result.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF164E63' },
      };
      cell.alignment = { vertical: 'middle', wrapText: true };
    });
    return result;
  };
  const context: [string, string, string, number?][] = [
    ['sessionId', 'Session ID', 'معرّف الجلسة', 28],
    ['courseCode', 'Course code', 'كود المقرر', 14],
    ['courseName', 'Course name', 'اسم المقرر', 32],
    ['level', 'Level', 'المستوى', 10],
    ['sessionType', 'Session type', 'نوع الجلسة', 14],
    ['group', 'Group', 'المجموعة', 12],
    ['section', 'Section', 'السكشن', 12],
    ['instructor', 'Instructor', 'القائم بالتدريس', 28],
    ['academicYear', 'Academic year', 'العام الدراسي', 16],
    ['semester', 'Semester', 'الفصل الدراسي', 14],
  ];
  const sessions = sheet(ar ? 'الجلسات' : 'Sessions', [
    ...context,
    ['status', 'Session status', 'حالة الجلسة'],
    ['startsAt', 'Start (Cairo)', 'بداية الجلسة (القاهرة)'],
    ['expiresAt', 'Expiry (Cairo)', 'انتهاء الصلاحية (القاهرة)'],
    ['closedAt', 'Closed (Cairo)', 'وقت الإغلاق (القاهرة)'],
    ['venue', 'Venue', 'المكان', 28],
    ['hallLatitude', 'Hall latitude', 'خط عرض القاعة'],
    ['hallLongitude', 'Hall longitude', 'خط طول القاعة'],
    ['radius', 'Allowed radius (m)', 'النطاق المسموح (متر)'],
    ['present', 'Present', 'حاضر', 12],
    ['late', 'Late', 'متأخر', 12],
    ['excused', 'Excused', 'بعذر', 12],
    ['absent', 'Marked absent', 'مسجل غائب', 14],
    ['total', 'Total records', 'إجمالي السجلات', 14],
  ]);
  const attendance = sheet(ar ? 'الحضور' : 'Attendance', [
    ...context,
    ['studentCode', 'Student code', 'كود الطالب', 16],
    ['studentName', 'Student name', 'اسم الطالب', 32],
    ['status', 'Attendance status', 'حالة الحضور'],
    ['method', 'Check-in method', 'وسيلة التسجيل'],
    ['checkedInAt', 'Check-in (Cairo)', 'وقت التسجيل (القاهرة)', 24],
    ['checkedInAtUtc', 'Check-in (UTC ISO)', 'وقت التسجيل (UTC)', 26],
    ['device', 'Device / browser', 'الجهاز والمتصفح', 28],
    ['ip', 'Network address', 'عنوان الشبكة', 28],
    ['latitude', 'Student latitude', 'خط عرض الطالب'],
    ['longitude', 'Student longitude', 'خط طول الطالب'],
    ['accuracy', 'GPS accuracy (m)', 'دقة GPS (متر)'],
    ['distance', 'Distance from hall (m)', 'المسافة عن القاعة (متر)'],
    ['venue', 'Venue', 'المكان', 28],
    ['radius', 'Allowed radius (m)', 'النطاق المسموح (متر)'],
    ['markedBy', 'Recorded / corrected by', 'سجله أو صححه', 28],
    ['note', 'Note', 'ملاحظة', 36],
    ['corrections', 'Audit entries', 'عدد التعديلات', 14],
    ['lastReason', 'Latest correction reason', 'سبب آخر تصحيح', 36],
  ]);
  const audit = sheet(ar ? 'سجل التعديلات' : 'Corrections', [
    ['sessionId', 'Session ID', 'معرّف الجلسة', 28],
    ['courseCode', 'Course code', 'كود المقرر'],
    ['studentCode', 'Student code', 'كود الطالب'],
    ['studentName', 'Student name', 'اسم الطالب', 32],
    ['action', 'Action', 'الإجراء', 28],
    ['previous', 'Previous status', 'الحالة السابقة'],
    ['next', 'New status', 'الحالة الجديدة'],
    ['by', 'Modified by', 'عدله', 28],
    ['reason', 'Reason', 'السبب', 36],
    ['time', 'Modified (Cairo)', 'وقت التعديل (القاهرة)', 24],
  ]);
  const labels: Record<string, string> = ar
    ? {
        present: 'حاضر',
        late: 'متأخر',
        excused: 'بعذر',
        absent: 'غائب',
        qr: 'رمز الحضور',
        manual: 'يدوي',
        lecture: 'محاضرة',
        section: 'سكشن',
        lab: 'معمل',
        OPEN: 'مفتوحة',
        CLOSED: 'مغلقة',
        EXPIRED: 'منتهية',
        first: 'الأول',
        second: 'الثاني',
        summer: 'الصيفي',
      }
    : {
        present: 'Present',
        late: 'Late',
        excused: 'Excused',
        absent: 'Absent',
        qr: 'QR',
        manual: 'Manual',
        lecture: 'Lecture',
        section: 'Section',
        lab: 'Lab',
        OPEN: 'Open',
        CLOSED: 'Closed',
        EXPIRED: 'Expired',
        first: 'First',
        second: 'Second',
        summer: 'Summer',
      };
  const label = (value: string) => labels[value] || value;
  const cairo = (value?: Date) =>
    value
      ? new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Africa/Cairo',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hourCycle: 'h23',
        }).format(value)
      : '';
  for await (const { session, records } of entries) {
    const details = {
      sessionId: session._id.toString(),
      courseCode: session.courseCode,
      courseName: session.courseName || '',
      level: session.level,
      sessionType: label(session.sessionType),
      group: session.group || '',
      section: session.section || '',
      instructor: session.createdByName,
      academicYear: session.academicYear,
      semester: label(session.semester),
      venue: session.location?.venueName || '',
      radius: session.location?.radiusMeters,
    };
    const counts = { present: 0, late: 0, excused: 0, absent: 0, total: 0 };
    for await (const record of records) {
      counts[record.status] += 1;
      counts.total += 1;
      const trail = record.auditTrail || [];
      let distance: number | undefined;
      if (record.location && session.location) {
        const r = (v: number) => (v * Math.PI) / 180;
        const a =
          Math.sin(
            r(record.location.latitude - session.location.latitude) / 2,
          ) **
            2 +
          Math.cos(r(record.location.latitude)) *
            Math.cos(r(session.location.latitude)) *
            Math.sin(
              r(record.location.longitude - session.location.longitude) / 2,
            ) **
              2;
        distance = Math.round(
          6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a))),
        );
      }
      attendance.addRow({
        ...details,
        studentCode: String(record.studentCode),
        studentName: record.studentName,
        status: label(record.status),
        method: label(record.method),
        checkedInAt: cairo(record.checkedInAt),
        checkedInAtUtc: record.checkedInAt.toISOString(),
        device: record.deviceInfo?.replace(/[📱💻]/gu, '').trim() || '',
        ip: record.ipAddress || '',
        latitude: record.location?.latitude,
        longitude: record.location?.longitude,
        accuracy: record.location?.accuracy,
        distance,
        markedBy: record.markedByName || '',
        note: record.note || '',
        corrections: trail.length,
        lastReason: trail.at(-1)?.reason || '',
      });
      for (const change of trail)
        audit.addRow({
          sessionId: details.sessionId,
          courseCode: session.courseCode,
          studentCode: String(record.studentCode),
          studentName: record.studentName,
          action: change.action,
          previous: change.previousStatus ? label(change.previousStatus) : '',
          next: label(change.newStatus),
          by: change.modifiedByName || '',
          reason: change.reason || '',
          time: cairo(change.timestamp),
        });
    }
    sessions.addRow({
      ...details,
      ...counts,
      status: label(
        session.status === 'OPEN' && session.expiresAt < new Date()
          ? 'EXPIRED'
          : session.status,
      ),
      startsAt: cairo(session.startsAt),
      expiresAt: cairo(session.expiresAt),
      closedAt: cairo(session.closedAt),
      hallLatitude: session.location?.latitude,
      hallLongitude: session.location?.longitude,
    });
  }
  for (const worksheet of [sessions, attendance, audit]) {
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: {
        row: Math.max(1, worksheet.rowCount),
        column: worksheet.columnCount,
      },
    };
    for (const key of ['studentCode', 'courseCode', 'group', 'section']) {
      const column = worksheet.columns.find((item) => item.key === key);
      if (column) column.numFmt = '@';
    }
    worksheet.eachRow((row, index) => {
      if (index > 1) row.alignment = { vertical: 'top', wrapText: true };
    });
  }
  const info = sheet(ar ? 'معلومات التقرير' : 'Report info', [
    ['key', 'Field', 'الحقل', 24],
    ['value', 'Value', 'القيمة', 95],
  ]);
  info.addRows([
    ['Timezone', 'Africa/Cairo'],
    ['Exported (UTC)', new Date().toISOString()],
    [
      ar ? 'نطاق البيانات' : 'Data coverage',
      ar
        ? 'يشمل كل الجلسات المطابقة للتصفية وكل سجلاتها، وليس الصفحة الحالية فقط.'
        : 'All matching sessions and their recorded attendance are included, regardless of pagination.',
    ],
    [
      ar ? 'الغياب' : 'Absence',
      ar
        ? 'الطلاب بدون سجل لا يتم افتراض غيابهم. عمود الغياب يشمل فقط السجلات المحددة كغائب.'
        : 'Students without records are not inferred absent. Marked absent counts explicit absent records only.',
    ],
  ]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
