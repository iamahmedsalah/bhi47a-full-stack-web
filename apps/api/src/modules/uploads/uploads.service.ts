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

const MAX_UPLOAD_ROWS = 5000;
const ALLOWED_UPLOAD_TYPES = new Set([
  'students',
  'courses',
  'grades',
  'quizzes',
  'attendance',
  'academic-emails',
]);

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
      else if (cleanKey === 'coursecode' || cleanKey === 'كود المادة') {
        normalized.courseCode = String(val).trim().toUpperCase();
      }
      // Course Name
      else if (
        cleanKey === 'coursename' ||
        cleanKey === 'اسم المادة' ||
        cleanKey === 'المادة'
      ) {
        normalized.courseName = String(val).trim();
      }
      // Credit Hours
      else if (
        cleanKey === 'credithours' ||
        cleanKey === 'الساعات' ||
        cleanKey === 'الساعات المعتمدة'
      ) {
        normalized.creditHours = Number(val);
      }
      // Grade Value
      else if (cleanKey === 'grade' || cleanKey === 'الدرجة') {
        normalized.grade = Number(val);
      }
      // Max Grade
      else if (cleanKey === 'maxgrade' || cleanKey === 'الدرجة العظمى') {
        normalized.maxGrade = Number(val);
      }
      // Exam Type
      else if (cleanKey === 'examtype' || cleanKey === 'نوع الامتحان') {
        normalized.examType = String(val).trim().toLowerCase();
      }
      // Quiz Number
      else if (cleanKey === 'quiznumber' || cleanKey === 'رقم الكويز') {
        normalized.quizNumber = Number(val);
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
    let successCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // Row number in Excel sheet

      try {
        switch (type) {
          case 'students':
            await this.importStudentRow(row);
            break;
          case 'courses':
            await this.importCourseRow(row);
            break;
          case 'grades':
            await this.importGradeRow(row);
            break;
          case 'quizzes':
            await this.importQuizRow(row);
            break;
          case 'attendance':
            await this.importAttendanceRow(row);
            break;
          case 'academic-emails':
            await this.importAcademicEmailRow(row, adminId);
            break;
          default:
            throw new BadRequestException('نوع الملف غير معروف');
        }
        successCount++;
      } catch (err: any) {
        errors.push(`السطر ${rowNum}: ${err.message || 'خطأ غير معروف'}`);
      }
    }

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

  // ─── Import Helper Rows ──────────────────────────────────────────

  private async importStudentRow(row: any) {
    if (!row.studentCode || !row.fullName || !row.nationalId) {
      throw new BadRequestException(
        'البيانات الأساسية ناقصة (كود الطالب، الاسم، الرقم القومي)',
      );
    }

    // Check if user already exists
    let user = await this.userModel.findOne({ studentCode: row.studentCode });
    const passwordHash = await bcrypt.hash(row.nationalId, 12);
    const maskedId =
      row.nationalId.length === 14
        ? row.nationalId.substring(0, 3) + '****' + row.nationalId.substring(11)
        : '111****111';

    if (!user) {
      user = new this.userModel({
        role: 'student',
        studentCode: row.studentCode,
        name: row.fullName,
        passwordHash,
        nationalIdHash: passwordHash,
        nationalIdMasked: maskedId,
        nationalId: row.nationalId,
        mustChangePassword: true,
        isActive: true,
        permissions: [],
      });
      await user.save();
    } else {
      user.name = row.fullName;
      user.nationalId = row.nationalId;
      user.nationalIdMasked = maskedId;
      user.nationalIdHash = passwordHash;
      await user.save();
    }

    // Upsert student profile
    const profileData = {
      fullName: row.fullName,
      studentCode: row.studentCode,
      nationalIdMasked: maskedId,
      nationalId: row.nationalId,
      level: row.level || '1',
      department: row.department,
      group: row.group,
      section: row.section,
      academicEmail: row.academicEmail,
      academicYear: row.academicYear || '2024-2025',
      semester: row.semester || 'first',
      seatNumber: row.seatNumber,
      examRoom: row.examRoom,
      examFloor: row.examFloor,
      examBuilding: row.examBuilding,
      enrollmentStatus: 'active',
    };

    await this.studentModel.findOneAndUpdate(
      { studentCode: row.studentCode },
      { $set: { ...profileData, userId: user._id } },
      { upsert: true, new: true },
    );
  }

  private async importCourseRow(row: any) {
    if (!row.courseCode || !row.courseName || !row.level || !row.semester) {
      throw new BadRequestException(
        'البيانات الأساسية ناقصة (الكود، الاسم، المستوى، الفصل الدراسي)',
      );
    }

    const courseData = {
      code: row.courseCode.toUpperCase(),
      name: row.courseName,
      level: row.level,
      semester: row.semester,
      department: row.department,
      creditHours: row.creditHours || 3,
      isActive: true,
    };

    await this.courseModel.findOneAndUpdate(
      { code: row.courseCode.toUpperCase() },
      { $set: courseData },
      { upsert: true, new: true },
    );
  }

  private async importGradeRow(row: any) {
    if (
      !row.studentCode ||
      !row.courseCode ||
      !row.examType ||
      row.grade === undefined ||
      row.maxGrade === undefined
    ) {
      throw new BadRequestException(
        'بيانات الدرجات ناقصة (كود الطالب، كود المادة، نوع الامتحان، الدرجة)',
      );
    }

    const student = await this.userModel.findOne({
      studentCode: row.studentCode,
      role: 'student',
    });
    if (!student) throw new NotFoundException('كود الطالب غير مسجل بالمنظومة');

    const course = await this.courseModel.findOne({
      code: row.courseCode.toUpperCase(),
    });
    if (!course) throw new NotFoundException('كود المادة غير مسجل بالمنظومة');

    const gradeData = {
      studentId: student._id,
      studentCode: row.studentCode,
      courseId: course._id,
      courseName: course.name,
      courseCode: course.code,
      examType: row.examType,
      grade: row.grade,
      maxGrade: row.maxGrade,
      status: row.status || 'present',
      academicYear: row.academicYear || '2024-2025',
      semester: row.semester || 'first',
      isPublished: true,
    };

    await this.gradeModel.findOneAndUpdate(
      {
        studentCode: row.studentCode,
        courseCode: course.code,
        examType: row.examType,
      },
      { $set: gradeData },
      { upsert: true, new: true },
    );
  }

  private async importQuizRow(row: any) {
    if (
      !row.studentCode ||
      !row.courseCode ||
      row.quizNumber === undefined ||
      row.grade === undefined ||
      row.maxGrade === undefined
    ) {
      throw new BadRequestException(
        'بيانات الكويز ناقصة (كود الطالب، كود المادة، رقم الكويز، الدرجة)',
      );
    }

    const student = await this.userModel.findOne({
      studentCode: row.studentCode,
      role: 'student',
    });
    if (!student) throw new NotFoundException('كود الطالب غير مسجل بالمنظومة');

    const course = await this.courseModel.findOne({
      code: row.courseCode.toUpperCase(),
    });
    if (!course) throw new NotFoundException('كود المادة غير مسجل بالمنظومة');

    // Find or create course quiz record
    let quizRecord = await this.courseQuizModel.findOne({
      studentCode: row.studentCode,
      courseCode: course.code,
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
        studentCode: row.studentCode,
        courseId: course._id,
        courseName: course.name,
        courseCode: course.code,
        academicYear: row.academicYear || '2024-2025',
        semester: row.semester || 'first',
        quizzes: [quizEntry],
        totalGrade: row.grade,
        maxTotalGrade: row.maxGrade,
        percentage: Math.round((row.grade / row.maxGrade) * 100),
        isPublished: true,
      });
      await quizRecord.save();
    } else {
      // Check if quiz exists in array
      const existingIdx = quizRecord.quizzes.findIndex(
        (q) => q.quizNumber === row.quizNumber,
      );
      if (existingIdx !== -1) {
        quizRecord.quizzes[existingIdx] = quizEntry;
      } else {
        quizRecord.quizzes.push(quizEntry);
      }

      // Recalculate totals
      let totalG = 0;
      let maxTotalG = 0;
      for (const q of quizRecord.quizzes) {
        if (q.status === 'present') {
          totalG += q.grade;
        }
        maxTotalG += q.maxGrade;
      }

      quizRecord.totalGrade = totalG;
      quizRecord.maxTotalGrade = maxTotalG;
      quizRecord.percentage =
        maxTotalG > 0 ? Math.round((totalG / maxTotalG) * 100) : 0;
      await quizRecord.save();
    }
  }

  private async importAttendanceRow(row: any) {
    if (
      !row.studentCode ||
      row.totalLectures === undefined ||
      row.attendedLectures === undefined
    ) {
      throw new BadRequestException(
        'بيانات الحضور ناقصة (كود الطالب، إجمالي المحاضرات، حضور)',
      );
    }

    const student = await this.userModel.findOne({
      studentCode: row.studentCode,
      role: 'student',
    });
    if (!student) throw new NotFoundException('كود الطالب غير مسجل بالمنظومة');

    const total = row.totalLectures;
    const attended = row.attendedLectures;
    const absence =
      row.absenceLectures !== undefined
        ? row.absenceLectures
        : Math.max(0, total - attended);
    const percentage = total > 0 ? Math.round((attended / total) * 100) : 100;

    const attendanceData = {
      studentId: student._id,
      studentCode: row.studentCode,
      academicYear: row.academicYear || '2024-2025',
      semester: row.semester || 'first',
      totalLectures: total,
      attendedLectures: attended,
      absenceLectures: absence,
      attendancePercentage: percentage,
      isPublished: true,
    };

    await this.attendanceModel.findOneAndUpdate(
      {
        studentCode: row.studentCode,
        academicYear: attendanceData.academicYear,
        semester: attendanceData.semester,
      },
      { $set: attendanceData },
      { upsert: true, new: true },
    );
  }

  private async importAcademicEmailRow(row: any, adminId: string) {
    if (!row.studentCode || !row.academicEmail) {
      throw new BadRequestException(
        'بيانات البريد الأكاديمي ناقصة (كود الطالب، البريد الأكاديمي)',
      );
    }

    const student = await this.userModel.findOne({
      studentCode: row.studentCode,
      role: 'student',
    });
    if (!student) throw new NotFoundException('كود الطالب غير مسجل بالمنظومة');

    const emailData = {
      studentId: student._id,
      studentCode: row.studentCode,
      studentName: student.name,
      academicEmail: row.academicEmail,
      status: row.status || 'active',
      lastUpdatedBy: new Types.ObjectId(adminId),
    };

    await this.emailModel.findOneAndUpdate(
      { studentCode: row.studentCode },
      { $set: emailData },
      { upsert: true, new: true },
    );
  }
}
