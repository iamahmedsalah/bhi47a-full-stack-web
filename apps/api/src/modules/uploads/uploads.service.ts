import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as XLSX from 'xlsx';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from '../users/schemas/user.schema';
import {
  StudentProfile,
  StudentProfileDocument,
} from '../students/schemas/student-profile.schema';
import { Course, CourseDocument } from '../courses/schemas/course.schema';
import { Grade, GradeDocument } from '../grades/schemas/grade.schema';
import {
  CourseQuiz,
  CourseQuizDocument,
} from '../grades/schemas/course-quiz.schema';
import {
  Attendance,
  AttendanceDocument,
} from '../attendance/schemas/attendance.schema';
import {
  AcademicEmail,
  AcademicEmailDocument,
} from '../academic-emails/schemas/academic-email.schema';
import { AppLoggerService } from '../../core/logger/logger.service';
import {
  StudentAcademicProfile,
  StudentAcademicProfileDocument,
} from '../registrations/schemas/student-academic-profile.schema';
import type { CourseLevel, Semester } from '@student-portal/shared';
import { GradesService } from '../grades/grades.service';

const MAX_UPLOAD_ROWS = 5000;
const ALLOWED_UPLOAD_TYPES = new Set([
  'students',
  'courses',
  'grades',
  'quizzes',
  'attendance',
  'academic-emails',
]);

function parseSafeNumber(val: any): number | undefined {
  if (val === null || val === undefined) return undefined;
  if (typeof val === 'number') return Number.isNaN(val) ? undefined : val;
  const str = String(val).trim();
  if (
    !str ||
    str === 'محل' ||
    str === '-' ||
    str === 'N/A' ||
    str === 'null' ||
    str === 'undefined'
  ) {
    return undefined;
  }
  const parsed = Number(str);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function normalizeStudentLevel(value: unknown): CourseLevel {
  const level = String(value ?? '1').trim().toLowerCase();
  const aliases: Record<string, CourseLevel> = {
    '1': '1',
    first: '1',
    one: '1',
    '2': '2',
    second: '2',
    two: '2',
    '3': '3',
    third: '3',
    three: '3',
    '4': '4',
    fourth: '4',
    four: '4',
  };
  return aliases[level] ?? '1';
}

function normalizeStudentSemester(value: unknown): Semester {
  const semester = String(value ?? 'first').trim().toLowerCase();
  if (semester === '2' || semester === 'second') return 'second';
  if (semester === '3' || semester === 'summer') return 'summer';
  return 'first';
}

@Injectable()
export class UploadsService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(StudentProfile.name)
    private studentModel: Model<StudentProfileDocument>,
    @InjectModel(Course.name) private courseModel: Model<CourseDocument>,
    @InjectModel(Grade.name) private gradeModel: Model<GradeDocument>,
    @InjectModel(CourseQuiz.name)
    private courseQuizModel: Model<CourseQuizDocument>,
    @InjectModel(Attendance.name)
    private attendanceModel: Model<AttendanceDocument>,
    @InjectModel(AcademicEmail.name)
    private emailModel: Model<AcademicEmailDocument>,
    @InjectModel(StudentAcademicProfile.name)
    private academicProfileModel: Model<StudentAcademicProfileDocument>,
    private gradesService: GradesService,
    private logger: AppLoggerService,
  ) {}

  // Normalizes header keys (matches Arabic/English variations)
  private normalizeRowKeys(row: any): any {
    const normalized: any = {};
    for (const key of Object.keys(row)) {
      const cleanKey = key.trim().toLowerCase();
      const val = row[key];

      // Student Code
      if (
        cleanKey === 'studentcode' ||
        cleanKey === 'كود الطالب' ||
        cleanKey === 'الكود الأكاديمي' ||
        cleanKey === 'الكود'
      ) {
        normalized.studentCode = String(val).trim();
      }
      // Full Name
      else if (
        cleanKey === 'fullname' ||
        cleanKey === 'الاسم' ||
        cleanKey === 'الاسم بالكامل' ||
        cleanKey === 'اسم الطالب'
      ) {
        normalized.fullName = String(val).trim();
      }
      // National ID
      else if (cleanKey === 'nationalid' || cleanKey === 'الرقم القومي') {
        normalized.nationalId = String(val).trim();
      }
      // Force password change after the next login
      else if (
        cleanKey === 'mustchangepassword' ||
        cleanKey === 'forcepasswordchange' ||
        cleanKey === 'تغيير كلمة المرور عند الدخول'
      ) {
        normalized.mustChangePassword = ['true', '1', 'yes', 'on'].includes(
          String(val).trim().toLowerCase(),
        );
      }
      // Level
      else if (cleanKey === 'level' || cleanKey === 'المستوى') {
        normalized.level = String(val).trim();
      }
      // Department
      else if (
        cleanKey === 'department' ||
        cleanKey === 'القسم' ||
        cleanKey === 'القسم العلمي'
      ) {
        normalized.department = String(val).trim();
      }
      // Group
      else if (cleanKey === 'group' || cleanKey === 'المجموعة') {
        normalized.group = String(val).trim();
      }
      // Section
      else if (
        cleanKey === 'section' ||
        cleanKey === 'السكشن' ||
        cleanKey === 'الشعبة'
      ) {
        normalized.section = String(val).trim();
      }
      // Academic Year
      else if (cleanKey === 'academicyear' || cleanKey === 'السنة الدراسية') {
        normalized.academicYear = String(val).trim();
      }
      // Semester
      else if (cleanKey === 'semester' || cleanKey === 'الفصل الدراسي') {
        normalized.semester = String(val).trim().toLowerCase();
      }
      // Seat Number
      else if (cleanKey === 'seatnumber' || cleanKey === 'رقم الجلوس') {
        normalized.seatNumber = String(val).trim();
      }
      // Exam Room
      else if (
        cleanKey === 'examroom' ||
        cleanKey === 'رقم اللجنة' ||
        cleanKey === 'اللجنة'
      ) {
        normalized.examRoom = String(val).trim();
      }
      // Exam Floor
      else if (cleanKey === 'examfloor' || cleanKey === 'الدور') {
        normalized.examFloor = String(val).trim();
      }
      // Exam Building
      else if (cleanKey === 'exambuilding' || cleanKey === 'المبنى') {
        normalized.examBuilding = String(val).trim();
      }
      // Course Code
      // Course Code
      else if (
        cleanKey === 'coursecode' ||
        cleanKey === 'كود المادة' ||
        cleanKey === 'كود المقرر' ||
        cleanKey === 'رمز المادة' ||
        cleanKey === 'رمز المقرر' ||
        cleanKey === 'code'
      ) {
        normalized.courseCode = String(val).trim().toUpperCase();
      }
      // Course Name
      else if (
        cleanKey === 'coursename' ||
        cleanKey === 'اسم المادة' ||
        cleanKey === 'المادة' ||
        cleanKey === 'اسم المقرر' ||
        cleanKey === 'المقرر' ||
        cleanKey === 'name'
      ) {
        normalized.courseName = String(val).trim();
      } else if (
        cleanKey === 'coursenamear' ||
        cleanKey === 'arabicname' ||
        cleanKey === 'اسم المادة بالعربية' ||
        cleanKey === 'اسم المقرر بالعربية' ||
        cleanKey === 'namear'
      ) {
        normalized.courseNameAr = String(val).trim();
      } else if (
        cleanKey === 'coursenameen' ||
        cleanKey === 'englishname' ||
        cleanKey === 'اسم المادة بالإنجليزية' ||
        cleanKey === 'اسم المقرر بالإنجليزية' ||
        cleanKey === 'nameen'
      ) {
        normalized.courseNameEn = String(val).trim();
      } else if (
        cleanKey === 'description' ||
        cleanKey === 'الوصف' ||
        cleanKey === 'وصف المقرر'
      ) {
        normalized.description = String(val).trim();
      } else if (
        cleanKey === 'registrationpriority' ||
        cleanKey === 'أولوية التسجيل' ||
        cleanKey === 'الأولوية'
      ) {
        normalized.registrationPriority = parseSafeNumber(val);
      } else if (
        cleanKey === 'prerequisites' ||
        cleanKey === 'prerequisitecodes' ||
        cleanKey === 'المتطلبات السابقة' ||
        cleanKey === 'المتطلب السابق'
      ) {
        normalized.prerequisites = String(val)
          .split(/[,;،]/)
          .map((code) => code.trim().toUpperCase())
          .filter(Boolean);
      } else if (
        cleanKey === 'corequisites' ||
        cleanKey === 'corequisitecodes' ||
        cleanKey === 'المتطلبات المتزامنة' ||
        cleanKey === 'المتطلب المتزامن'
      ) {
        normalized.coRequisites = String(val)
          .split(/[,;،]/)
          .map((code) => code.trim().toUpperCase())
          .filter(Boolean);
      } else if (
        cleanKey === 'equivalentcourses' ||
        cleanKey === 'equivalentcoursecodes' ||
        cleanKey === 'المقررات المعادلة' ||
        cleanKey === 'المقرر المعادل'
      ) {
        normalized.equivalentCourses = String(val)
          .split(/[,;،]/)
          .map((code) => code.trim().toUpperCase())
          .filter(Boolean);
      } else if (
        cleanKey === 'offeredterms' ||
        cleanKey === 'availableterms' ||
        cleanKey === 'فصول الطرح'
      ) {
        const termMap: Record<string, string> = {
          first: 'first', '1': 'first', أول: 'first', الاول: 'first', الأول: 'first',
          second: 'second', '2': 'second', ثاني: 'second', الثاني: 'second',
          summer: 'summer', '3': 'summer', صيفي: 'summer', الصيفي: 'summer',
        };
        normalized.offeredTerms = String(val)
          .split(/[,;،]/)
          .map((term) => {
            const clean = term.trim().toLowerCase();
            return termMap[clean] || clean;
          })
          .filter(Boolean);
      } else if (
        cleanKey === 'type' ||
        cleanKey === 'coursetype' ||
        cleanKey === 'نوع المقرر' ||
        cleanKey === 'نوع المادة'
      ) {
        normalized.courseType = String(val).trim().toLowerCase();
      } else if (
        cleanKey === 'recommendedsemester' ||
        cleanKey === 'الفصل الموصى به'
      ) {
        normalized.recommendedSemester = parseSafeNumber(val);
      } else if (
        cleanKey === 'minimumgpa' ||
        cleanKey === 'الحد الأدنى للمعدل'
      ) {
        normalized.minimumGpa = parseSafeNumber(val);
      }
      // Credit Hours
      else if (
        cleanKey === 'credithours' ||
        cleanKey === 'الساعات' ||
        cleanKey === 'الساعات المعتمدة'
      ) {
        normalized.creditHours = parseSafeNumber(val);
      }
      // Grade Value
      else if (cleanKey === 'grade' || cleanKey === 'الدرجة') {
        normalized.grade = parseSafeNumber(val);
      }
      // Max Grade
      else if (cleanKey === 'maxgrade' || cleanKey === 'الدرجة العظمى') {
        normalized.maxGrade = parseSafeNumber(val);
      }
      // Exam Type
      else if (cleanKey === 'examtype' || cleanKey === 'نوع الامتحان') {
        normalized.examType = String(val).trim().toLowerCase();
      }
      // Quiz Number
      else if (cleanKey === 'quiznumber' || cleanKey === 'رقم الكويز') {
        normalized.quizNumber = parseSafeNumber(val);
      }
      // Quiz Title
      else if (
        cleanKey === 'title' ||
        cleanKey === 'عنوان الكويز' ||
        cleanKey === 'اسم الكويز'
      ) {
        normalized.title = String(val).trim();
      }
      // Attendance Stats
      else if (
        cleanKey === 'totallectures' ||
        cleanKey === 'المحاضرات الكلية' ||
        cleanKey === 'عدد المحاضرات'
      ) {
        normalized.totalLectures = Number(val);
      } else if (
        cleanKey === 'attendedlectures' ||
        cleanKey === 'المحاضرات الحاضرة' ||
        cleanKey === 'حضور'
      ) {
        normalized.attendedLectures = Number(val);
      } else if (
        cleanKey === 'absencelectures' ||
        cleanKey === 'المحاضرات الغائبة' ||
        cleanKey === 'غياب'
      ) {
        normalized.absenceLectures = Number(val);
      }
      // Academic Email
      else if (
        cleanKey === 'academicemail' ||
        cleanKey === 'البريد الأكاديمي' ||
        cleanKey === 'البريد'
      ) {
        normalized.academicEmail = String(val).trim();
      }
      // Status
      else if (
        cleanKey === 'status' ||
        cleanKey === 'حالة الحضور' ||
        cleanKey === 'الحالة'
      ) {
        normalized.status = String(val).trim().toLowerCase();
      }
    }
    return normalized;
  }

  async processUpload(fileBuffer: Buffer, type: string, adminId: string) {
    if (!ALLOWED_UPLOAD_TYPES.has(type)) {
      throw new BadRequestException('Unknown upload type');
    }

    this.logger.log(
      `Processing upload file of type: ${type}`,
      'UploadsService',
    );
    const workbook = XLSX.read(fileBuffer, {
      type: 'buffer',
      cellFormula: false,
      cellHTML: false,
    });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new BadRequestException(
        'Uploaded workbook does not contain sheets',
      );
    }
    const sheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(sheet);
    if (rawData.length > MAX_UPLOAD_ROWS) {
      throw new BadRequestException(
        `Uploaded file exceeds the ${MAX_UPLOAD_ROWS} row limit`,
      );
    }

    if (rawData.length === 0) {
      throw new BadRequestException('الملف المرفوع فارغ'); // Uploaded file is empty
    }

    const rows = rawData.map((r) => this.normalizeRowKeys(r));

    let result: { successCount: number; errors: string[] };

    switch (type) {
      case 'students':
        result = await this.importStudentsBulk(rows);
        break;
      case 'courses':
        result = await this.importCoursesBulk(rows);
        break;
      case 'grades':
        result = await this.importGradesBulk(rows);
        break;
      case 'quizzes':
        result = await this.importQuizzesBulk(rows);
        break;
      case 'attendance':
        result = await this.importAttendanceBulk(rows);
        break;
      case 'academic-emails':
        result = await this.importAcademicEmailsBulk(rows, adminId);
        break;
      default:
        throw new BadRequestException('نوع الملف غير معروف');
    }

    const { successCount, errors } = result;

    this.logger.log(
      `Upload process finished: ${successCount} succeeded, ${errors.length} failed`,
      'UploadsService',
    );
    return {
      success: true,
      successCount,
      failedCount: errors.length,
      errors,
    };
  }

  // ─── Bulk Import Implementations ─────────────────────────────────

  private async importStudentsBulk(rows: any[]) {
    const errors: string[] = [];
    let successCount = 0;
    const currentYear = new Date().getFullYear();
    const defaultAcademicYear = `${currentYear}-${currentYear + 1}`;

    const validRows: { row: any; rowNum: number }[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      if (!row.studentCode || !row.fullName || !row.nationalId) {
        errors.push(
          `السطر ${rowNum}: البيانات الأساسية ناقصة (كود الطالب، الاسم، الرقم القومي)`,
        );
        continue;
      }
      validRows.push({ row, rowNum });
    }

    if (validRows.length === 0) return { successCount: 0, errors };

    const studentCodes = Array.from(
      new Set(validRows.map((v) => String(v.row.studentCode).trim())),
    );
    const existingUsers = await this.userModel
      .find({ studentCode: { $in: studentCodes } })
      .lean();
    const userMap = new Map(existingUsers.map((u) => [u.studentCode, u]));

    const userOps: any[] = [];
    const profileOps: any[] = [];
    const passwordHashCache = new Map<string, string>();

    for (const { row, rowNum } of validRows) {
      try {
        const studentCode = String(row.studentCode).trim();
        const nationalId = String(row.nationalId).trim();
        const existingUser = userMap.get(studentCode);

        const maskedId =
          nationalId.length === 14
            ? nationalId.substring(0, 3) + '****' + nationalId.substring(11)
            : '111****111';

        let passwordHash: string;
        if (
          existingUser &&
          existingUser.nationalId === nationalId &&
          existingUser.passwordHash
        ) {
          passwordHash = existingUser.passwordHash;
        } else if (passwordHashCache.has(nationalId)) {
          passwordHash = passwordHashCache.get(nationalId)!;
        } else {
          passwordHash = await bcrypt.hash(nationalId, 10);
          passwordHashCache.set(nationalId, passwordHash);
        }

        userOps.push({
          updateOne: {
            filter: { studentCode },
            update: {
              $set: {
                role: 'student',
                studentCode,
                name: row.fullName,
                passwordHash,
                nationalIdHash: passwordHash,
                nationalIdMasked: maskedId,
                nationalId,
                mustChangePassword: row.mustChangePassword ?? false,
                isActive: true,
              },
              $setOnInsert: { permissions: [] },
            },
            upsert: true,
          },
        });

        profileOps.push({
          updateOne: {
            filter: { studentCode },
            update: {
              $set: {
                fullName: row.fullName,
                studentCode,
                nationalIdMasked: maskedId,
                nationalId,
                level: normalizeStudentLevel(row.level),
                department: row.department,
                group: row.group,
                section: row.section,
                academicEmail: row.academicEmail,
                academicYear: row.academicYear || defaultAcademicYear,
                semester: normalizeStudentSemester(row.semester),
                seatNumber: row.seatNumber,
                examRoom: row.examRoom,
                examFloor: row.examFloor,
                examBuilding: row.examBuilding,
                enrollmentStatus: 'active',
              },
            },
            upsert: true,
          },
        });

        successCount++;
      } catch (err: any) {
        errors.push(`السطر ${rowNum}: ${err.message || 'خطأ غير معروف'}`);
      }
    }

    if (userOps.length > 0) {
      await this.userModel.bulkWrite(userOps, { ordered: false });
    }

    if (profileOps.length > 0) {
      const updatedUsers = await this.userModel
        .find(
          { studentCode: { $in: studentCodes } },
          { _id: 1, studentCode: 1 },
        )
        .lean();
      const updatedUserMap = new Map(
        updatedUsers.map((u) => [u.studentCode, u._id]),
      );

      for (const op of profileOps) {
        const sc = op.updateOne.filter.studentCode;
        const uId = updatedUserMap.get(sc);
        if (uId) {
          op.updateOne.update.$set.userId = uId;
        }
      }

      await this.studentModel.bulkWrite(profileOps, { ordered: false });

      const academicProfileOps = profileOps.flatMap((op) => {
        const studentCode = op.updateOne.filter.studentCode;
        const studentId = updatedUserMap.get(studentCode);
        if (!studentId) return [];

        return [
          {
            updateOne: {
              filter: { studentId },
              update: {
                $set: {
                  academicLevel: op.updateOne.update.$set.level,
                  semester: op.updateOne.update.$set.semester,
                },
                $setOnInsert: {
                  gpa: 0,
                  completedCourses: [],
                  failedCourses: [],
                  lowGradeCourses: [],
                  academicWarnings: 0,
                  isGraduatingThisYear: false,
                  approvedICCourseCompletions: [],
                },
              },
              upsert: true,
            },
          },
        ];
      });

      if (academicProfileOps.length > 0) {
        await this.academicProfileModel.bulkWrite(academicProfileOps, {
          ordered: false,
        });
      }
    }

    return { successCount, errors };
  }

  private async importCoursesBulk(rows: any[]) {
    const errors: string[] = [];
    let successCount = 0;
    const courseOps: any[] = [];

    const levelMap: Record<string, string> = {
      '1': '1', 'أول': '1', 'الاول': '1', 'أولى': '1', 'الاولى': '1', 'الأولى': '1', 'first': '1', 'one': '1',
      '2': '2', 'ثاني': '2', 'ثانية': '2', 'الثاني': '2', 'الثانية': '2', 'second': '2', 'two': '2',
      '3': '3', 'ثالث': '3', 'ثالثة': '3', 'الثالث': '3', 'الثالثة': '3', 'third': '3', 'three': '3',
      '4': '4', 'رابع': '4', 'رابعة': '4', 'الرابع': '4', 'الرابعة': '4', 'fourth': '4', 'four': '4',
    };
    const semesterMap: Record<string, string> = {
      'first': 'first', '1': 'first', 'أول': 'first', 'الاول': 'first', 'الأول': 'first', 'الفصل الأول': 'first',
      'second': 'second', '2': 'second', 'ثاني': 'second', 'الثاني': 'second', 'الفصل الثاني': 'second',
      'summer': 'summer', '3': 'summer', 'صيفي': 'summer', 'الصيفي': 'summer', 'الفصل الصيفي': 'summer',
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      const courseCode = (row.courseCode || row.code || '').toString().trim();
      const bilingualName =
        row.courseNameAr || row.courseNameEn || row.courseName;

      const cleanLevel = row.level
        ? levelMap[String(row.level).trim().toLowerCase()] ||
          String(row.level).trim()
        : '';
      const cleanSemester = row.semester
        ? semesterMap[String(row.semester).trim().toLowerCase()] ||
          String(row.semester).trim().toLowerCase()
        : '';

      const missingFields: string[] = [];
      if (!courseCode) missingFields.push('الكود');
      if (!bilingualName) missingFields.push('الاسم');
      if (!cleanLevel) missingFields.push('المستوى');
      if (!cleanSemester) missingFields.push('الفصل الدراسي');

      if (missingFields.length > 0) {
        errors.push(
          `السطر ${rowNum}: البيانات الأساسية ناقصة (${missingFields.join('، ')})`,
        );
        continue;
      }

      const courseData = {
        code: courseCode.toUpperCase(),
        name: bilingualName,
        nameAr: row.courseNameAr || row.courseName || row.courseNameEn,
        nameEn: row.courseNameEn || row.courseName || row.courseNameAr,
        level: cleanLevel,
        academicLevel: cleanLevel,
        semester: cleanSemester,
        department: row.department === 'محل' ? undefined : row.department,
        creditHours: parseSafeNumber(row.creditHours) ?? 3,
        prerequisites: row.prerequisites || [],
        coRequisites: row.coRequisites || [],
        equivalentCourses: row.equivalentCourses || [],
        offeredTerms: row.offeredTerms?.length
          ? row.offeredTerms
          : [cleanSemester],
        type: row.courseType || 'required',
        recommendedSemester: parseSafeNumber(row.recommendedSemester),
        minimumGpa: parseSafeNumber(row.minimumGpa),
        registrationPriority: parseSafeNumber(row.registrationPriority) ?? 0,
        description: row.description === 'محل' ? undefined : row.description,
        isActive: true,
      };

      courseOps.push({
        updateOne: {
          filter: { code: courseCode.toUpperCase() },
          update: { $set: courseData },
          upsert: true,
        },
      });

      successCount++;
    }

    if (courseOps.length > 0) {
      await this.courseModel.bulkWrite(courseOps, { ordered: false });
    }

    return { successCount, errors };
  }

  private async importGradesBulk(rows: any[]) {
    const errors: string[] = [];
    let successCount = 0;

    const validRows: { row: any; rowNum: number }[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      if (
        !row.studentCode ||
        !row.courseCode ||
        !row.examType ||
        !row.academicYear ||
        !row.semester ||
        row.grade === undefined ||
        row.maxGrade === undefined
      ) {
        errors.push(
          `السطر ${rowNum}: بيانات الدرجات ناقصة (كود الطالب، كود المادة، نوع الامتحان، الدرجة)`,
        );
        continue;
      }
      validRows.push({ row, rowNum });
    }

    if (validRows.length === 0) return { successCount: 0, errors };

    const studentCodes = Array.from(
      new Set(validRows.map((v) => String(v.row.studentCode).trim())),
    );
    const courseCodes = Array.from(
      new Set(
        validRows.map((v) => String(v.row.courseCode).trim().toUpperCase()),
      ),
    );

    const [students, courses] = await Promise.all([
      this.userModel
        .find({ studentCode: { $in: studentCodes }, role: 'student' })
        .lean(),
      this.courseModel.find({ code: { $in: courseCodes } }).lean(),
    ]);

    const studentMap = new Map(students.map((s) => [s.studentCode, s]));
    const courseMap = new Map(courses.map((c) => [c.code, c]));

    const gradeOps: any[] = [];

    for (const { row, rowNum } of validRows) {
      const studentCode = String(row.studentCode).trim();
      const code = String(row.courseCode).trim().toUpperCase();

      const student = studentMap.get(studentCode);
      if (!student) {
        errors.push(
          `السطر ${rowNum}: كود الطالب (${studentCode}) غير مسجل بالمنظومة`,
        );
        continue;
      }

      const course = courseMap.get(code);
      if (!course) {
        errors.push(`السطر ${rowNum}: كود المادة (${code}) غير مسجل بالمنظومة`);
        continue;
      }

      const gradeData = {
        studentId: student._id,
        studentCode,
        courseId: course._id,
        courseName: course.name,
        courseCode: course.code,
        examType: row.examType,
        grade: row.grade,
        maxGrade: row.maxGrade,
        status: row.status || 'present',
        academicYear: String(row.academicYear).trim(),
        semester: normalizeStudentSemester(row.semester),
        isPublished: true,
      };

      gradeOps.push({
        updateOne: {
          filter: {
            studentCode,
            courseCode: course.code,
            examType: row.examType,
          },
          update: { $set: gradeData },
          upsert: true,
        },
      });

      successCount++;
    }

    if (gradeOps.length > 0) {
      await this.gradeModel.bulkWrite(gradeOps, { ordered: false });
      await this.gradesService.syncPublishedAcademicProgress(
        students.map((student) => student._id),
      );
    }

    return { successCount, errors };
  }

  private async importQuizzesBulk(rows: any[]) {
    const errors: string[] = [];
    let successCount = 0;

    const validRows: { row: any; rowNum: number }[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      if (
        !row.studentCode ||
        !row.courseCode ||
        !row.academicYear ||
        !row.semester ||
        row.quizNumber === undefined ||
        row.grade === undefined ||
        row.maxGrade === undefined
      ) {
        errors.push(
          `السطر ${rowNum}: بيانات الكويز ناقصة (كود الطالب، كود المادة، رقم الكويز، الدرجة)`,
        );
        continue;
      }
      validRows.push({ row, rowNum });
    }

    if (validRows.length === 0) return { successCount: 0, errors };

    const studentCodes = Array.from(
      new Set(validRows.map((v) => String(v.row.studentCode).trim())),
    );
    const courseCodes = Array.from(
      new Set(
        validRows.map((v) => String(v.row.courseCode).trim().toUpperCase()),
      ),
    );

    const [students, courses] = await Promise.all([
      this.userModel
        .find({ studentCode: { $in: studentCodes }, role: 'student' })
        .lean(),
      this.courseModel.find({ code: { $in: courseCodes } }).lean(),
    ]);

    const studentMap = new Map(students.map((s) => [s.studentCode, s]));
    const courseMap = new Map(courses.map((c) => [c.code, c]));

    for (const { row, rowNum } of validRows) {
      try {
        const studentCode = String(row.studentCode).trim();
        const code = String(row.courseCode).trim().toUpperCase();

        const student = studentMap.get(studentCode);
        if (!student) {
          errors.push(
            `السطر ${rowNum}: كود الطالب (${studentCode}) غير مسجل بالمنظومة`,
          );
          continue;
        }

        const course = courseMap.get(code);
        if (!course) {
          errors.push(
            `السطر ${rowNum}: كود المادة (${code}) غير مسجل بالمنظومة`,
          );
          continue;
        }

        const academicYear = String(row.academicYear).trim();
        const semester = normalizeStudentSemester(row.semester);
        let quizRecord = await this.courseQuizModel.findOne({
          studentCode,
          courseCode: course.code,
          academicYear,
          semester,
        });

        const quizEntry = {
          quizNumber: row.quizNumber,
          title: row.title || `Quiz ${row.quizNumber}`,
          grade: row.grade,
          maxGrade: row.maxGrade,
          status: row.status || 'present',
          date: new Date(),
        };

        if (!quizRecord) {
          quizRecord = new this.courseQuizModel({
            studentId: student._id,
            studentCode,
            courseId: course._id,
            courseName: course.name,
            courseCode: course.code,
            academicYear,
            semester,
            quizzes: [quizEntry],
            totalGrade: row.grade,
            maxTotalGrade: row.maxGrade,
            percentage: Math.round((row.grade / row.maxGrade) * 100),
            isPublished: true,
          });
          await quizRecord.save();
        } else {
          const existingIdx = quizRecord.quizzes.findIndex(
            (q) => q.quizNumber === row.quizNumber,
          );
          if (existingIdx !== -1) {
            quizRecord.quizzes[existingIdx] = quizEntry;
          } else {
            quizRecord.quizzes.push(quizEntry);
          }

          let totalG = 0;
          let maxTotalG = 0;
          for (const q of quizRecord.quizzes) {
            if (q.status === 'present') totalG += q.grade;
            maxTotalG += q.maxGrade;
          }

          quizRecord.totalGrade = totalG;
          quizRecord.maxTotalGrade = maxTotalG;
          quizRecord.percentage =
            maxTotalG > 0 ? Math.round((totalG / maxTotalG) * 100) : 0;
          await quizRecord.save();
        }
        successCount++;
      } catch (err: any) {
        errors.push(`السطر ${rowNum}: ${err.message || 'خطأ غير معروف'}`);
      }
    }

    return { successCount, errors };
  }

  private async importAttendanceBulk(rows: any[]) {
    const errors: string[] = [];
    let successCount = 0;

    const validRows: { row: any; rowNum: number }[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      if (
        !row.studentCode ||
        row.totalLectures === undefined ||
        row.attendedLectures === undefined
      ) {
        errors.push(
          `السطر ${rowNum}: بيانات الحضور ناقصة (كود الطالب، إجمالي المحاضرات، حضور)`,
        );
        continue;
      }
      validRows.push({ row, rowNum });
    }

    if (validRows.length === 0) return { successCount: 0, errors };

    const studentCodes = Array.from(
      new Set(validRows.map((v) => String(v.row.studentCode).trim())),
    );
    const students = await this.userModel
      .find({ studentCode: { $in: studentCodes }, role: 'student' })
      .lean();
    const studentMap = new Map(students.map((s) => [s.studentCode, s]));

    const ops: any[] = [];
    for (const { row, rowNum } of validRows) {
      const studentCode = String(row.studentCode).trim();
      const student = studentMap.get(studentCode);
      if (!student) {
        errors.push(
          `السطر ${rowNum}: كود الطالب (${studentCode}) غير مسجل بالمنظومة`,
        );
        continue;
      }

      const total = row.totalLectures;
      const attended = row.attendedLectures;
      const absence =
        row.absenceLectures !== undefined
          ? row.absenceLectures
          : Math.max(0, total - attended);
      const percentage =
        total > 0 ? Math.round((attended / total) * 100) : 100;

      const attendanceData = {
        studentId: student._id,
        studentCode,
        academicYear: row.academicYear || '2024-2025',
        semester: row.semester || 'first',
        totalLectures: total,
        attendedLectures: attended,
        absenceLectures: absence,
        attendancePercentage: percentage,
        isPublished: true,
      };

      ops.push({
        updateOne: {
          filter: {
            studentCode,
            academicYear: attendanceData.academicYear,
            semester: attendanceData.semester,
          },
          update: { $set: attendanceData },
          upsert: true,
        },
      });

      successCount++;
    }

    if (ops.length > 0) {
      await this.attendanceModel.bulkWrite(ops, { ordered: false });
    }

    return { successCount, errors };
  }

  private async importAcademicEmailsBulk(rows: any[], adminId: string) {
    const errors: string[] = [];
    let successCount = 0;

    const validRows: { row: any; rowNum: number }[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      if (!row.studentCode || !row.academicEmail) {
        errors.push(
          `السطر ${rowNum}: بيانات البريد الأكاديمي ناقصة (كود الطالب، البريد الأكاديمي)`,
        );
        continue;
      }
      validRows.push({ row, rowNum });
    }

    if (validRows.length === 0) return { successCount: 0, errors };

    const studentCodes = Array.from(
      new Set(validRows.map((v) => String(v.row.studentCode).trim())),
    );
    const students = await this.userModel
      .find({ studentCode: { $in: studentCodes }, role: 'student' })
      .lean();
    const studentMap = new Map(students.map((s) => [s.studentCode, s]));

    const ops: any[] = [];
    const adminObjId = new Types.ObjectId(adminId);

    for (const { row, rowNum } of validRows) {
      const studentCode = String(row.studentCode).trim();
      const student = studentMap.get(studentCode);
      if (!student) {
        errors.push(
          `السطر ${rowNum}: كود الطالب (${studentCode}) غير مسجل بالمنظومة`,
        );
        continue;
      }

      const emailData = {
        studentId: student._id,
        studentCode,
        studentName: student.name,
        academicEmail: row.academicEmail,
        status: row.status || 'active',
        lastUpdatedBy: adminObjId,
      };

      ops.push({
        updateOne: {
          filter: { studentCode },
          update: { $set: emailData },
          upsert: true,
        },
      });

      successCount++;
    }

    if (ops.length > 0) {
      await this.emailModel.bulkWrite(ops, { ordered: false });
    }

    return { successCount, errors };
  }
}
