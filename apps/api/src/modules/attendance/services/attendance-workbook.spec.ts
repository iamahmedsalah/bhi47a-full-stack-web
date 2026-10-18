import ExcelJS from 'exceljs';
import { Types } from 'mongoose';
import {
  createAttendanceWorkbook,
  type AttendanceExportEntry,
} from './attendance-workbook';

describe('Attendance Excel export', () => {
  const session = {
    _id: new Types.ObjectId(),
    courseCode: '001',
    courseName: 'Test course',
    level: '4',
    sessionType: 'lecture' as const,
    academicYear: '2026-2027',
    semester: 'first',
    createdBy: new Types.ObjectId(),
    createdByName: 'Lecturer',
    academicPosition: 'doctor' as const,
    status: 'CLOSED' as const,
    startsAt: new Date('2026-10-02T18:00:00Z'),
    expiresAt: new Date('2026-10-02T20:00:00Z'),
    sessionSecret: 'NEVER_EXPORT_THIS',
    lateThresholdMinutes: 10,
    sessionDurationMinutes: 15,
    qrRotationSeconds: 20,
    location: {
      latitude: 0,
      longitude: 0,
      radiusMeters: 150,
      venueName: 'Home test',
    },
  };
  async function* entries(): AsyncGenerator<AttendanceExportEntry> {
    await Promise.resolve();
    async function* records() {
      await Promise.resolve();
      for (let i = 0; i < 205; i++)
        yield {
          sessionId: session._id,
          studentId: new Types.ObjectId(),
          studentCode: `00${i}`,
          studentName: '=HYPERLINK("bad","example")',
          courseCode: '001',
          sessionType: 'lecture' as const,
          status: i === 0 ? ('late' as const) : ('present' as const),
          method: 'qr' as const,
          checkedInAt: new Date('2026-10-02T19:01:00Z'),
          location: { latitude: 0, longitude: 0, accuracy: 12 },
          deviceInfo: '📱 Android • Chrome',
          note: 'Retain this note',
          markedByName: 'Staff member',
          auditTrail:
            i === 0
              ? [
                  {
                    action: 'MANUAL_STATUS_OVERRIDE',
                    modifiedBy: new Types.ObjectId(),
                    modifiedByName: 'Admin',
                    previousStatus: 'present' as const,
                    newStatus: 'late' as const,
                    reason: 'Late arrival correction',
                    timestamp: new Date('2026-10-02T19:02:00Z'),
                  },
                ]
              : [],
        };
    }
    yield { session, records: records() };
    yield {
      session: { ...session, _id: new Types.ObjectId(), courseCode: 'EMPTY' },
      records: (async function* () {})(),
    };
  }
  it('exports every record, text codes, GPS, Cairo times, session totals, corrections and empty sessions', async () => {
    const buffer = await createAttendanceWorkbook(entries(), 'en');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const attendance = workbook.getWorksheet('Attendance')!;
    expect(attendance.rowCount).toBe(206);
    const headers = attendance.getRow(1).values as string[];
    const cell = (header: string) =>
      attendance.getRow(2).getCell(headers.indexOf(header)).value;
    expect(cell('Student code')).toBe('000');
    expect(cell('Course code')).toBe('001');
    expect(cell('Student name')).toBe('=HYPERLINK("bad","example")');
    expect(cell('Device / browser')).toBe('Android • Chrome');
    expect(cell('GPS accuracy (m)')).toBe(12);
    expect(cell('Distance from hall (m)')).toBe(0);
    expect(cell('Check-in (Cairo)')).toContain('22:01:00');
    expect(cell('Note')).toBe('Retain this note');
    expect(cell('Latest correction reason')).toBe('Late arrival correction');
    expect(workbook.getWorksheet('Sessions')!.rowCount).toBe(3);
    expect(workbook.getWorksheet('Corrections')!.rowCount).toBe(2);
    expect(attendance.views[0].state).toBe('frozen');
    expect(attendance.autoFilter).toBeTruthy();
    for (const sheet of workbook.worksheets)
      sheet.eachRow((row) =>
        expect(JSON.stringify(row.values)).not.toContain(session.sessionSecret),
      );
  });
  it('creates Arabic headers and right-to-left worksheets', async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      (await createAttendanceWorkbook(entries(), 'ar')) as any,
    );
    const sheet = workbook.getWorksheet('الحضور')!;
    expect(sheet.views[0].rightToLeft).toBe(true);
    expect(sheet.getRow(1).values).toContain('كود الطالب');
  });
});
