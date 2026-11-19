import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import ExcelJS from 'exceljs';
import { PERMISSIONS } from '@student-portal/shared';
import type { AuthenticatedUser } from '../../auth/types/authenticated-request';
import {
  Course,
  type CourseDocument,
} from '../../courses/schemas/course.schema';
import {
  StudentProfile,
  type StudentProfileDocument,
} from '../../students/schemas/student-profile.schema';
import { Grade, type GradeDocument } from '../../grades/schemas/grade.schema';
import {
  CourseRegistration,
  type CourseRegistrationDocument,
} from '../../registrations/schemas/course-registration.schema';
import { ControlAccessService } from './control-access.service';
import { ControlSheetsService } from './control-sheets.service';
import { ControlWorkbookService } from './control-workbook.service';
import type { ControlReportQueryDto } from '../dto/control.dto';

const states: Record<string, string> = {
  present: 'حاضر',
  absent: 'غائب',
  banned: 'محروم',
  excused: 'بعذر',
  incomplete: 'غير مكتمل',
  withheld: 'محجوب',
};
const fees = (value?: string) =>
  value === 'paid'
    ? 'مسدد'
    : value === 'unpaid'
      ? 'غير مسدد'
      : value === 'exempt'
        ? 'معفى'
        : 'غير معروف';
function style(page: ExcelJS.Worksheet) {
  page.views = [{ rightToLeft: true, state: 'frozen', xSplit: 2, ySplit: 1 }];
  page.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: page.columnCount },
  };
  page.getRow(1).height = 36;
  page.getRow(1).eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0D9488' },
    };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  });
  page.columns.forEach((column, index) => {
    column.width = index === 1 ? 40 : 23;
  });
  page.eachRow((row, index) =>
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.alignment = {
        horizontal: 'center',
        vertical: 'middle',
        wrapText: true,
      };
      if (index > 1) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: index % 2 ? 'FFF1F5F9' : 'FFFFFFFF' },
        };
      }
    }),
  );
  page.getColumn(1).numFmt = '@';
  page.pageSetup = {
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  };
}

@Injectable()
export class ControlReportsService {
  constructor(
    private readonly access: ControlAccessService,
    private readonly sheets: ControlSheetsService,
    private readonly workbook: ControlWorkbookService,
    @InjectModel(Course.name) private readonly courses: Model<CourseDocument>,
    @InjectModel(StudentProfile.name)
    private readonly profiles: Model<StudentProfileDocument>,
    @InjectModel(Grade.name) private readonly grades: Model<GradeDocument>,
    @InjectModel(CourseRegistration.name)
    private readonly registrations: Model<CourseRegistrationDocument>,
  ) {}

  async export(
    user: AuthenticatedUser,
    sheetId: string,
    query: ControlReportQueryDto,
  ) {
    this.access.assertPermission(user, PERMISSIONS.CONTROL_EXPORT);
    const detail = await this.sheets.getSheet(user, sheetId);
    if (
      query.academicYear !== detail.sheet.academicYear ||
      query.semester !== detail.sheet.semester
    )
      throw new BadRequestException('Report term must match the open workbook');
    const book = new ExcelJS.Workbook();
    if (query.type === 'course') {
      const { rows } = await this.workbook.workbook(user, sheetId);
      if (rows.length > 10000)
        throw new BadRequestException('Maximum 10000 students per report');
      const profiles = await this.profiles
        .find({ userId: { $in: rows.map((row) => row.studentId) } })
        .select('userId tuitionFeesStatus isBlocked')
        .lean();
      const byId = new Map(profiles.map((row) => [String(row.userId), row]));
      const page = book.addWorksheet('تقرير المادة');
      page.addRow([
        'كود الطالب',
        'اسم الطالب',
        'كود المقرر',
        'اسم المقرر',
        'أعمال السنة',
        'حالة أعمال السنة',
        'الميدتيرم',
        'حالة الميدتيرم',
        'النهائي',
        'حالة النهائي',
        'المجموع',
        'التسجيل',
        'المصروفات',
        'الحجب',
      ]);
      const value = (entry?: {
        score: number | null;
        status: string | null;
      }) =>
        ['absent', 'banned'].includes(entry?.status ?? '')
          ? 0
          : (entry?.score ?? '');
      for (const row of rows) {
        const profile = byId.get(row.studentId);
        page.addRow([
          row.studentCode,
          row.nameAr || row.name,
          detail.course.code,
          detail.course.nameAr || detail.course.name,
          value(row.components.coursework),
          states[row.components.coursework?.status ?? ''] ?? 'لم يرصد',
          value(row.components.midterm),
          states[row.components.midterm?.status ?? ''] ?? 'لم يرصد',
          value(row.components.final),
          states[row.components.final?.status ?? ''] ?? 'لم يرصد',
          row.result.total ?? '',
          row.notRegistered ? 'غير مسجل' : 'مسجل',
          fees(profile?.tuitionFeesStatus),
          profile?.isBlocked ? 'محجوب' : 'غير محجوب',
        ]);
      }
      style(page);
      const analysis = book.addWorksheet('التحليل');
      analysis.addRow(['المؤشر', 'القيمة']);
      analysis.addRows([
        ['المقرر', detail.course.code],
        ['السنة الدراسية', query.academicYear],
        [
          'الترم',
          query.semester === 'first'
            ? 'الأول'
            : query.semester === 'second'
              ? 'الثاني'
              : 'الصيفي',
        ],
        ['عدد الطلاب', rows.length],
        ['مسجل', rows.filter((row) => !row.notRegistered).length],
        [
          'غير مسدد',
          profiles.filter((row) => row.tuitionFeesStatus === 'unpaid').length,
        ],
      ]);
      for (const key of ['coursework', 'midterm', 'final'] as const) {
        const entered = rows.filter((row) => row.components[key]?.status);
        const numeric = entered.flatMap((row) =>
          row.components[key]?.score == null ? [] : [row.components[key].score],
        );
        const label =
          key === 'coursework'
            ? 'أعمال السنة'
            : key === 'midterm'
              ? 'الميدتيرم'
              : 'النهائي';
        analysis.addRows([
          [`${label} - مرصود`, entered.length],
          [`${label} - ناقص`, rows.length - entered.length],
          [
            `${label} - متوسط الدرجات الرقمية`,
            numeric.length
              ? numeric.reduce((sum, mark) => sum + mark, 0) / numeric.length
              : '',
          ],
        ]);
        if (key === 'midterm' || key === 'final') {
          const threshold = key === 'midterm' ? 18 : 30;
          const passed = rows.filter((row) => {
            const mark = row.components[key];
            return (
              mark?.status === 'present' &&
              mark.score != null &&
              mark.score > threshold
            );
          }).length;
          analysis.addRow([
            `${label} - عدد الطلاب بدرجة أكبر من ${threshold}`,
            passed,
          ]);
          const percentage = analysis.addRow([
            `${label} - نسبة النجاح (أكبر من ${threshold} ÷ إجمالي طلاب المادة)`,
            rows.length ? passed / rows.length : 0,
          ]);
          percentage.getCell(2).numFmt = '0.00%';
        }
        for (const [state, name] of Object.entries(states))
          analysis.addRow([
            `${label} - ${name}`,
            entered.filter((row) => row.components[key]?.status === state)
              .length,
          ]);
      }
      style(analysis);
      analysis.getColumn(1).width = 42;
      analysis.getColumn(2).eachCell((cell, rowNumber) => {
        if (rowNumber > 1 && typeof cell.value === 'number')
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE0F2F1' },
          };
      });
    } else {
      if (!query.level)
        throw new BadRequestException(
          'Select a level for the consolidated report',
        );
      // A full-level report must never silently omit courses outside a staff scope.
      if (!this.access.getCapabilities(user).scopeAll)
        throw new ForbiddenException(
          'Consolidated reports require all-course scope',
        );
      const courses = await this.courses
        .find({
          isActive: true,
          $or: [
            { level: query.level, semester: query.semester },
            {
              curricula: {
                $elemMatch: {
                  academicLevel: query.level,
                  semester: query.semester,
                },
              },
            },
          ],
        })
        .select('_id code name nameAr')
        .sort({ code: 1 })
        .limit(101)
        .lean();
      if (!courses.length || courses.length > 100)
        throw new BadRequestException(
          'Report requires between 1 and 100 level courses',
        );
      const profiles = await this.profiles
        .find({ level: query.level })
        .select(
          'userId studentCode fullName fullNameAr tuitionFeesStatus isBlocked',
        )
        .sort({ studentCode: 1 })
        .limit(10001)
        .lean();
      if (profiles.length > 10000)
        throw new BadRequestException('Maximum 10000 students per report');
      if (profiles.length * courses.length > 100000)
        throw new BadRequestException('Consolidated report is too large');
      const ids = profiles.map((row) => row.userId);
      const [marks, registrations] = await Promise.all([
        this.grades
          .find({
            studentId: { $in: ids },
            courseId: { $in: courses.map((course) => course._id) },
            academicYear: query.academicYear,
            semester: query.semester,
            examType: { $in: ['coursework', 'midterm', 'final'] },
            cleared: { $ne: true },
          })
          .select('studentId courseId examType grade status')
          .batchSize(500)
          .lean(),
        this.registrations
          .find({
            studentId: { $in: ids },
            academicYear: query.academicYear,
            semester: query.semester,
            status: 'approved',
          })
          .select('studentId courses')
          .batchSize(500)
          .lean(),
      ]);
      const markMap = new Map(
        marks.map((mark) => [
          `${String(mark.studentId)}:${String(mark.courseId)}:${mark.examType}`,
          mark,
        ]),
      );
      const registered = new Set(
        registrations.flatMap((row) =>
          row.courses.map((code) => `${String(row.studentId)}:${code}`),
        ),
      );
      const page = book.addWorksheet(`مجمع المستوى ${query.level}`);
      page.addRow([
        'كود الطالب',
        'اسم الطالب',
        'المصروفات',
        'الحجب',
        ...courses.flatMap((course) =>
          [
            'التسجيل',
            'أعمال السنة',
            'حالة أعمال السنة',
            'الميدتيرم',
            'حالة الميدتيرم',
            'النهائي',
            'حالة النهائي',
          ].map(
            (label) =>
              `${course.code} - ${course.nameAr || course.name} - ${label}`,
          ),
        ),
      ]);
      for (const profile of profiles)
        page.addRow([
          profile.studentCode,
          profile.fullNameAr || profile.fullName,
          fees(profile.tuitionFeesStatus),
          profile.isBlocked ? 'محجوب' : 'غير محجوب',
          ...courses.flatMap((course) => [
            registered.has(`${String(profile.userId)}:${course.code}`)
              ? 'مسجل'
              : 'غير مسجل',
            ...['coursework', 'midterm', 'final'].flatMap((key) => {
              const mark = markMap.get(
                `${String(profile.userId)}:${String(course._id)}:${key}`,
              );
              return [
                mark
                  ? ['absent', 'banned'].includes(mark.status)
                    ? 0
                    : ['excused', 'incomplete'].includes(mark.status)
                      ? ''
                      : mark.grade
                  : '',
                mark ? (states[mark.status] ?? mark.status) : 'لم يرصد',
              ];
            }),
          ]),
        ]);
      style(page);
      page.getRow(1).height = 70;
    }
    return book.xlsx.writeBuffer();
  }
}
