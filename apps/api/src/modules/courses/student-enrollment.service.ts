import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createHash } from 'node:crypto';
import { PERMISSIONS, normalizeDepartment } from '@student-portal/shared';
import type { AuthenticatedUser } from '../auth/types/authenticated-request';
import { Course, type CourseDocument } from './schemas/course.schema';
import {
  StudentProfile,
  type StudentProfileDocument,
} from '../students/schemas/student-profile.schema';
import {
  CourseRegistration,
  type CourseRegistrationDocument,
} from '../registrations/schemas/course-registration.schema';
import { CoursesService } from './courses.service';
import { CacheService } from '../../core/cache/cache.service';
import { normalizeSearchTerm } from '../../common/utils/search.util';
import { isConsecutiveAcademicYear } from '../registrations/utils/academic-year.util';
import { courseCurriculumFilter } from './utils/course-filter.util';
import type {
  StudentEnrollmentCourseQueryDto,
  StudentEnrollmentMutationDto,
  StudentEnrollmentTermDto,
} from './dto/student-enrollment.dto';

const studentFields =
  'userId studentCode fullName fullNameAr fullNameEn level department academicYear semester enrollmentStatus';
const courseFields = '_id code name nameAr nameEn level creditHours isActive';
const fault = (code: string) => ({ code, message: code });
const studentView = (
  student: Pick<
    StudentProfile,
    | 'userId'
    | 'studentCode'
    | 'fullName'
    | 'fullNameAr'
    | 'fullNameEn'
    | 'level'
    | 'department'
    | 'academicYear'
    | 'semester'
    | 'enrollmentStatus'
  >,
) => ({
  userId: student.userId.toHexString(),
  studentCode: student.studentCode,
  fullName: student.fullName,
  fullNameAr: student.fullNameAr,
  fullNameEn: student.fullNameEn,
  level: student.level,
  department: student.department,
  academicYear: student.academicYear,
  semester: student.semester,
  enrollmentStatus: student.enrollmentStatus,
});
const courseView = (
  course: Pick<
    Course,
    'code' | 'name' | 'nameAr' | 'nameEn' | 'level' | 'creditHours' | 'isActive'
  > & { _id: Types.ObjectId },
) => ({
  _id: course._id.toHexString(),
  code: course.code,
  name: course.name,
  nameAr: course.nameAr,
  nameEn: course.nameEn,
  level: course.level,
  creditHours: course.creditHours,
  isActive: course.isActive,
});
type RegistrationSnapshot = {
  _id?: Types.ObjectId;
  courses: string[];
  totalCreditHours: number;
  status: string;
  lastEditedAt?: Date;
};
const version = (registration: RegistrationSnapshot | null) =>
  createHash('sha256')
    .update(
      JSON.stringify(
        registration
          ? [
              registration._id?.toHexString(),
              registration.courses,
              registration.totalCreditHours,
              registration.status,
              registration.lastEditedAt,
            ]
          : null,
      ),
    )
    .digest('hex');

@Injectable()
export class StudentEnrollmentService {
  private readonly logger = new Logger(StudentEnrollmentService.name);
  constructor(
    @InjectModel(StudentProfile.name)
    private readonly profiles: Model<StudentProfileDocument>,
    @InjectModel(Course.name) private readonly courses: Model<CourseDocument>,
    @InjectModel(CourseRegistration.name)
    private readonly registrations: Model<CourseRegistrationDocument>,
    private readonly enrollment: CoursesService,
    private readonly cache: CacheService,
  ) {}

  private term(query: StudentEnrollmentTermDto) {
    if (!isConsecutiveAcademicYear(query.academicYear))
      throw new BadRequestException(fault('ADMIN_ENROLLMENT_YEAR'));
    return { academicYear: query.academicYear, semester: query.semester };
  }
  private async student(studentId: string) {
    const student = await this.profiles
      .findOne({ userId: new Types.ObjectId(studentId) })
      .select(studentFields)
      .lean();
    if (!student)
      throw new NotFoundException(fault('ADMIN_ENROLLMENT_STUDENT'));
    return studentView(student);
  }
  private registration(studentId: string, query: StudentEnrollmentTermDto) {
    return this.registrations
      .findOne({
        studentId: new Types.ObjectId(studentId),
        ...this.term(query),
      })
      .select('courses totalCreditHours status source lastEditedAt')
      .lean();
  }
  private authorize(actor: AuthenticatedUser) {
    if (
      actor.role !== 'admin' &&
      (actor.role !== 'staff' ||
        !actor.permissions?.includes(
          PERMISSIONS.COURSES_STUDENT_ENROLLMENT_MANAGE,
        ))
    )
      throw new ForbiddenException();
  }
  private checkVersion(
    registration: RegistrationSnapshot | null,
    expected: string,
  ) {
    if (version(registration) !== expected)
      throw new ConflictException(fault('ADMIN_ENROLLMENT_STALE'));
    if (registration && registration.status !== 'approved')
      throw new ConflictException(fault('ADMIN_ENROLLMENT_PENDING'));
  }
  private async invalidate() {
    const results = await Promise.allSettled(
      ['courses:*', 'registrations:*', 'control:*'].map((pattern) =>
        this.cache.delPattern(pattern),
      ),
    );
    if (results.some((result) => result.status === 'rejected'))
      this.logger.warn(
        'Registration saved; some cache invalidations could not be completed',
      );
  }
  async searchStudents(search: string) {
    const trimmed = search.trim();
    if (trimmed.length < 2) return { items: [], hasMore: false };
    const escaped = normalizeSearchTerm(trimmed);
    const docs = await this.profiles
      .find({
        $or: [
          { studentCode: new RegExp(`^${escaped}`, 'i') },
          { fullName: new RegExp(escaped, 'i') },
          { fullNameAr: new RegExp(escaped, 'i') },
          { fullNameEn: new RegExp(escaped, 'i') },
        ],
      })
      .select(studentFields)
      .sort({ studentCode: 1 })
      .limit(21)
      .lean();
    return {
      items: docs.slice(0, 20).map(studentView),
      hasMore: docs.length > 20,
    };
  }
  async detail(studentId: string, query: StudentEnrollmentTermDto) {
    const [student, registration] = await Promise.all([
      this.student(studentId),
      this.registration(studentId, query),
    ]);
    const codes = registration?.courses ?? [];
    if (codes.length > 200)
      throw new BadRequestException(fault('ADMIN_ENROLLMENT_TOO_LARGE'));
    const courses = codes.length
      ? await this.courses
          .find({
            code: {
              $in: codes.map(
                (code) => new RegExp(`^${normalizeSearchTerm(code)}$`, 'i'),
              ),
            },
          })
          .select(courseFields)
          .limit(200)
          .lean()
      : [];
    const byCode = new Map(
      courses.map((course) => [course.code.toUpperCase(), course]),
    );
    return {
      student,
      academicYear: query.academicYear,
      semester: query.semester,
      version: version(registration),
      status: registration?.status ?? null,
      totalCreditHours: registration?.totalCreditHours ?? 0,
      courses: codes.map((code) => {
        const course = byCode.get(code.toUpperCase());
        return course
          ? { ...courseView(course), code, missing: false }
          : { code, missing: true };
      }),
    };
  }
  async availableCourses(
    studentId: string,
    query: StudentEnrollmentCourseQueryDto,
  ) {
    const [student, registration] = await Promise.all([
      this.student(studentId),
      this.registration(studentId, query),
    ]);
    const search = normalizeSearchTerm(query.search ?? '');
    const items = await this.courses
      .find({
        $and: [
          { isActive: true },
          courseCurriculumFilter({
            department: normalizeDepartment(student.department) ?? undefined,
            semester: query.semester,
          }),
          ...(search
            ? [
                {
                  $or: ['code', 'name', 'nameAr', 'nameEn'].map((key) => ({
                    [key]: new RegExp(search, 'i'),
                  })),
                },
              ]
            : []),
          {
            code: {
              $nin: (registration?.courses ?? []).flatMap((code) => [
                code,
                code.toUpperCase(),
                code.toLowerCase(),
              ]),
            },
          },
        ],
      })
      .select(courseFields)
      .sort({ code: 1 })
      .limit(31)
      .lean();
    return {
      items: items.slice(0, 30).map(courseView),
      hasMore: items.length > 30,
    };
  }
  async add(
    actor: AuthenticatedUser,
    studentId: string,
    dto: StudentEnrollmentMutationDto,
  ) {
    this.authorize(actor);
    const [student, registration, course] = await Promise.all([
      this.student(studentId),
      this.registration(studentId, dto),
      this.courses.findById(dto.courseId).select('isActive').lean(),
    ]);
    this.checkVersion(registration, dto.expectedVersion);
    if (!course?.isActive)
      throw new NotFoundException(fault('ADMIN_ENROLLMENT_COURSE'));
    if (student.enrollmentStatus !== 'active')
      throw new BadRequestException(fault('ADMIN_ENROLLMENT_INACTIVE'));
    const result = await this.enrollment.enrollStudentsBatch(
      dto.courseId,
      [{ studentCode: student.studentCode }],
      {
        ...this.term(dto),
        requireApprovedRegistration: true,
        actor: { _id: actor._id, role: actor.role },
      },
    );
    if (result.errorCount)
      throw new BadRequestException({
        code: 'ADMIN_ENROLLMENT_RULE_FAILED',
        message: result.errors[0],
      });
    await this.invalidate();
    return {
      enrolled: result.enrolledCount,
      alreadyEnrolled: result.alreadyEnrolledCount,
    };
  }
  async withdraw(
    actor: AuthenticatedUser,
    studentId: string,
    dto: StudentEnrollmentMutationDto,
  ) {
    this.authorize(actor);
    await this.student(studentId);
    const registration = await this.registration(studentId, dto);
    this.checkVersion(registration, dto.expectedVersion);
    const course = await this.courses
      .findById(dto.courseId)
      .select('code creditHours')
      .lean();
    if (!course || !registration)
      throw new NotFoundException(fault('ADMIN_ENROLLMENT_COURSE'));
    const remaining = registration.courses.filter(
      (code) => code.toUpperCase() !== course.code.toUpperCase(),
    );
    if (remaining.length === registration.courses.length)
      throw new ConflictException(fault('ADMIN_ENROLLMENT_STALE'));
    const result = await this.registrations.updateOne(
      {
        _id: registration._id,
        courses: registration.courses,
        status: 'approved',
        totalCreditHours: registration.totalCreditHours,
      },
      {
        $set: {
          courses: remaining,
          totalCreditHours: Math.max(
            0,
            registration.totalCreditHours - (course.creditHours || 3),
          ),
          lastEditedBy: new Types.ObjectId(actor._id),
          lastEditedAt: new Date(),
        },
        $inc: { editCount: 1 },
        $push: {
          administrativeChanges: {
            action: 'withdraw',
            courseCode: course.code,
            actorId: new Types.ObjectId(actor._id),
            at: new Date(),
          },
        },
      },
    );
    if (result.matchedCount !== 1)
      throw new ConflictException(fault('ADMIN_ENROLLMENT_STALE'));
    await this.invalidate();
    return { withdrawn: true };
  }
}
