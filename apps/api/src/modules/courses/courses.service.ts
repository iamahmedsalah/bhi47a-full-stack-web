import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import {
  MaterialStorageService,
  type MaterialUpload,
} from '../material-storage/material-storage.service';
import { CacheService } from '../../core/cache/cache.service';
import { measureDatabaseStage } from '../../core/metrics/request-query-context';
import { MetricsService } from '../../core/metrics/metrics.service';
import {
  courseStaffFilter,
  isAssignedToCourse,
} from './utils/course-staff.util';
import { courseCurriculumFilter } from './utils/course-filter.util';
import { writeEnrollmentBatches } from './utils/enrollment-bulk.util';
import {
  courseForDepartment,
  coursesForDepartment,
} from './utils/course-curriculum.util';
import {
  getCourseCurricula,
  MAX_COURSE_DOCTORS,
  PERMISSIONS,
  type CourseMaterialType,
  normalizeDepartment,
  type Semester,
  type CourseLevel,
  type CourseEnrollmentResult,
  type CourseEnrollmentIssue,
  type CourseEnrollmentLimitDetails,
  type MaterialFileReference,
} from '@student-portal/shared';
import { RegistrationsService } from '../registrations/registrations.service';
import { isCourseOfferedForTerm } from '../registrations/utils/term-availability.util';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { Readable } from 'stream';
import { Course, CourseDocument } from './schemas/course.schema';
import {
  CreateCourseDto,
  UpdateCourseDto,
  QueryCourseDto,
  EnrollmentOptionsDto,
  WithdrawStudentsOptionsDto,
} from './dto/course.dto';
import {
  buildPaginationOptions,
  createPaginatedResult,
} from '../../common/utils/pagination.util';
import { normalizeSearchTerm } from '../../common/utils/search.util';
import {
  CourseRegistration,
  CourseRegistrationDocument,
} from '../registrations/schemas/course-registration.schema';
import {
  StudentProfile,
  StudentProfileDocument,
} from '../students/schemas/student-profile.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import * as ExcelJS from 'exceljs';
import {
  CourseMaterial,
  CourseMaterialDocument,
} from './schemas/course-material.schema';
import {
  CreateCourseMaterialDto,
  QueryCourseMaterialsDto,
} from './dto/course-material.dto';

export interface CourseEnrollmentOptions extends EnrollmentOptionsDto {
  actor?: { _id: string; role: string };
  requireApprovedRegistration?: boolean;
}

export interface CourseSyllabusFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface StudentSyllabiResponse {
  studentLevel: string;
  academicYear: string;
  semester: string;
  registeredCount: number;
  registeredCourses: Array<Record<string, unknown> & { isRegistered: boolean }>;
  availableLevelCourses: Array<
    Record<string, unknown> & { isRegistered: boolean }
  >;
}

@Injectable()
export class CoursesService {
  constructor(
    @InjectModel(Course.name) private courseModel: Model<CourseDocument>,
    @InjectModel(CourseMaterial.name)
    private courseMaterialModel: Model<CourseMaterialDocument>,
    @InjectModel(CourseRegistration.name)
    private courseRegistrationModel: Model<CourseRegistrationDocument>,
    @InjectModel(StudentProfile.name)
    private studentProfileModel: Model<StudentProfileDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
    private configService: ConfigService,
    @Optional() private cacheService?: CacheService,
    @Optional() private registrationsService?: RegistrationsService,
    @Optional() private metricsService?: MetricsService,
    @Optional() private materialStorage?: MaterialStorageService,
  ) {}

  async create(dto: CreateCourseDto): Promise<CourseDocument> {
    if (dto.curricula?.length) {
      dto.offeredTerms = [
        ...new Set(dto.curricula.map((item) => item.semester)),
      ];
    }
    const existing = await this.courseModel.findOne({
      code: dto.code.toUpperCase(),
    });
    if (existing) {
      throw new ConflictException('كود المادة موجود بالفعل'); // Course code already exists
    }

    const doctors: Array<{
      _id: Types.ObjectId;
      name: string;
      nameAr?: string;
      staffType?: string;
      titlePrefix?: string;
    }> = [];
    const validDoctorObjectIds: Types.ObjectId[] = [];

    const incomingDoctorIds: string[] =
      Array.isArray(dto.doctorIds) && dto.doctorIds.length > 0
        ? dto.doctorIds.slice(0, MAX_COURSE_DOCTORS)
        : dto.doctorId
          ? [dto.doctorId]
          : [];

    for (const dId of incomingDoctorIds) {
      if (Types.ObjectId.isValid(dId)) {
        validDoctorObjectIds.push(new Types.ObjectId(dId));
      }
    }

    if (validDoctorObjectIds.length > 0) {
      const docUsers = await this.userModel
        .find({ _id: { $in: validDoctorObjectIds } })
        .select('_id name nameAr staffType titlePrefix')
        .lean();
      for (const dId of validDoctorObjectIds) {
        const u = docUsers.find((doc) => doc._id.toString() === dId.toString());
        if (u) {
          doctors.push({
            _id: u._id,
            name: u.name,
            nameAr: (u as any).nameAr || u.name,
            staffType: (u as any).staffType || 'doctor',
            titlePrefix: (u as any).titlePrefix,
          });
        }
      }
    }

    const doctorObjectId = validDoctorObjectIds[0] ?? undefined;
    const doctorName = doctors.map((d) => d.name).join(' / ') || undefined;
    const doctorNameAr =
      doctors.map((d) => d.nameAr || d.name).join(' / ') || undefined;

    const teachingAssistants: Array<{
      _id: Types.ObjectId;
      name: string;
      nameAr?: string;
      staffType?: string;
      titlePrefix?: string;
    }> = [];
    const validTaObjectIds: Types.ObjectId[] = [];
    if (dto.teachingAssistantIds && Array.isArray(dto.teachingAssistantIds)) {
      for (const taId of dto.teachingAssistantIds) {
        if (Types.ObjectId.isValid(taId)) {
          validTaObjectIds.push(new Types.ObjectId(taId));
        }
      }
      if (validTaObjectIds.length > 0) {
        const taUsers = await this.userModel
          .find({ _id: { $in: validTaObjectIds } })
          .select('_id name nameAr staffType titlePrefix')
          .lean();
        for (const user of taUsers) {
          teachingAssistants.push({
            _id: user._id,
            name: user.name,
            nameAr: (user as any).nameAr || user.name,
            staffType: (user as any).staffType || 'teaching_assistant',
            titlePrefix: (user as any).titlePrefix,
          });
        }
      }
    }

    const course = new this.courseModel({
      ...dto,
      code: dto.code.toUpperCase(),
      academicLevel: dto.academicLevel ?? dto.level,
      level: dto.level ?? dto.academicLevel,
      prerequisites: dto.prerequisites?.map((code) => code.toUpperCase()) ?? [],
      type: dto.type ?? 'required',
      doctorId: doctorObjectId,
      doctorName,
      doctorNameAr,
      doctorIds: validDoctorObjectIds,
      doctors,
      teachingAssistantIds: validTaObjectIds,
      teachingAssistants,
    });
    const saved = await course.save();
    await this.cacheService?.delPattern('courses:*');
    return saved;
  }

  async findAll(query: QueryCourseDto, caller?: any) {
    const { page, limit, skip } = buildPaginationOptions(query);
    const filter: any = {};

    const andConditions: any[] = [];

    if (caller?.role === 'staff' && caller?._id) {
      const callerIdStr = String(caller._id);
      andConditions.push(courseStaffFilter(callerIdStr));
    } else {
      if (query.staffId) {
        andConditions.push({
          ...courseStaffFilter(String(query.staffId)),
        });
      } else if (query.teachingAssistantId) {
        andConditions.push({
          ...courseStaffFilter(String(query.teachingAssistantId), 'ta'),
        });
      } else if (query.doctorId) {
        // Also support doctorId matching TA if staff was passed as doctorId
        andConditions.push({
          ...courseStaffFilter(String(query.doctorId)),
        });
      }
    }

    if (query.search) {
      const search = normalizeSearchTerm(query.search);
      andConditions.push({
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { nameAr: { $regex: search, $options: 'i' } },
          { nameEn: { $regex: search, $options: 'i' } },
          { code: { $regex: search, $options: 'i' } },
        ],
      });
    }

    if (andConditions.length > 0) {
      filter.$and = andConditions;
    }

    andConditions.push(courseCurriculumFilter(query));
    filter.$and = andConditions;

    if (query.isActive !== undefined) {
      filter.isActive = query.isActive;
    }

    const isSpecificStaffQuery = Boolean(
      query.staffId || query.doctorId || query.teachingAssistantId,
    );
    const cacheKey =
      !query.search && !isSpecificStaffQuery
        ? `courses:list:v2:${caller?.role || 'public'}:${caller?._id || 'all'}:${query.department || 'all'}:${query.level || 'all'}:${query.academicLevel || 'all'}:${query.semester || 'all'}:${query.isActive ?? 'all'}:${page}:${limit}`
        : null;

    if (cacheKey && this.cacheService) {
      const cached = await this.cacheService.wrap(
        cacheKey,
        async () => {
          const [items, total] = await Promise.all([
            this.courseModel
              .find(filter)
              .sort({ code: 1 })
              .skip(skip)
              .limit(limit)
              .lean(),
            this.courseModel.countDocuments(filter),
          ]);
          return createPaginatedResult(
            await this.hydrateCoursesStaff(items),
            total,
            page,
            limit,
          );
        },
        120,
      );
      return cached;
    }

    const [items, total] = await Promise.all([
      this.courseModel
        .find(filter)
        .sort({ code: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.courseModel.countDocuments(filter),
    ]);

    const hydratedItems = await this.hydrateCoursesStaff(items as any[]);
    return createPaginatedResult(hydratedItems, total, page, limit);
  }

  private async hydrateCoursesStaff<T extends Record<string, any>>(
    items: T[],
  ): Promise<T[]> {
    if (!items || items.length === 0 || !this.userModel?.find) return items;
    try {
      const staffIdSet = new Set<string>();
      for (const c of items) {
        if (c.doctorId && Types.ObjectId.isValid(String(c.doctorId))) {
          staffIdSet.add(String(c.doctorId));
        }
        if (Array.isArray(c.doctorIds)) {
          for (const id of c.doctorIds) {
            if (id && Types.ObjectId.isValid(String(id))) {
              staffIdSet.add(String(id));
            }
          }
        }
        if (Array.isArray(c.doctors)) {
          for (const d of c.doctors) {
            if (d?._id && Types.ObjectId.isValid(String(d._id))) {
              staffIdSet.add(String(d._id));
            }
          }
        }
        if (Array.isArray(c.teachingAssistantIds)) {
          for (const id of c.teachingAssistantIds) {
            if (id && Types.ObjectId.isValid(String(id))) {
              staffIdSet.add(String(id));
            }
          }
        }
        if (Array.isArray(c.teachingAssistants)) {
          for (const ta of c.teachingAssistants) {
            if (ta?._id && Types.ObjectId.isValid(String(ta._id))) {
              staffIdSet.add(String(ta._id));
            }
          }
        }
      }

      if (staffIdSet.size === 0) return items;

      const objIds = Array.from(staffIdSet).map((id) => new Types.ObjectId(id));
      const users = await this.userModel
        .find({ _id: { $in: objIds } })
        .select('_id name nameAr staffType titlePrefix')
        .lean();
      if (!Array.isArray(users) || users.length === 0) return items;

      const userMap = new Map<
        string,
        {
          name: string;
          nameAr?: string;
          staffType?: string;
          titlePrefix?: string;
        }
      >();
      for (const u of users) {
        userMap.set(String(u._id), {
          name: u.name,
          nameAr: (u as any).nameAr,
          staffType: (u as any).staffType,
          titlePrefix: (u as any).titlePrefix,
        });
      }

      return items.map((c) => {
        const next: Record<string, any> = { ...c };
        if (Array.isArray(c.doctors) && c.doctors.length > 0) {
          next.doctors = c.doctors.map((d: any) => {
            const u = d?._id ? userMap.get(String(d._id)) : undefined;
            if (!u) return d;
            return {
              ...d,
              name: u.name || d.name,
              nameAr: u.nameAr || d.nameAr || u.name || d.name,
              staffType: u.staffType || d.staffType || 'doctor',
              titlePrefix: u.titlePrefix || d.titlePrefix,
            };
          });
          next.doctorName = next.doctors.map((d: any) => d.name).join(' / ');
          next.doctorNameAr = next.doctors
            .map((d: any) => d.nameAr || d.name)
            .join(' / ');
        } else if (c.doctorId && userMap.has(String(c.doctorId))) {
          const u = userMap.get(String(c.doctorId))!;
          next.doctorName = u.name || c.doctorName;
          next.doctorNameAr = u.nameAr || c.doctorNameAr || u.name;
        }

        if (
          Array.isArray(c.teachingAssistants) &&
          c.teachingAssistants.length > 0
        ) {
          next.teachingAssistants = c.teachingAssistants.map((ta: any) => {
            const u = ta?._id ? userMap.get(String(ta._id)) : undefined;
            if (!u) return ta;
            return {
              ...ta,
              name: u.name || ta.name,
              nameAr: u.nameAr || ta.nameAr || u.name || ta.name,
              staffType: u.staffType || ta.staffType || 'teaching_assistant',
              titlePrefix: u.titlePrefix || ta.titlePrefix,
            };
          });
        } else if (
          Array.isArray(c.teachingAssistantIds) &&
          c.teachingAssistantIds.length > 0
        ) {
          next.teachingAssistants = c.teachingAssistantIds
            .map((id: any) => {
              const u = userMap.get(String(id));
              if (!u) return null;
              return {
                _id: id,
                name: u.name,
                nameAr: u.nameAr || u.name,
                staffType: u.staffType || 'teaching_assistant',
              };
            })
            .filter(Boolean);
        }

        return next as T;
      });
    } catch {
      return items;
    }
  }

  async findStudentCourses(query: QueryCourseDto, studentId: string) {
    const profile = await this.studentProfileModel
      .findOne({ userId: new Types.ObjectId(studentId) })
      .lean();
    const department = normalizeDepartment(profile?.department);
    if (!department)
      throw new BadRequestException(
        'Student department is missing or unknown / يرجى مراجعة شؤون الطلاب لتحديد القسم',
      );
    const result = await this.findAll(
      { ...query, department, isActive: true },
      { _id: studentId, role: 'student' },
    );
    return { ...result, items: coursesForDepartment(result.items, department) };
  }

  async exportCourses(
    query: QueryCourseDto,
    caller: { _id: string; role: string },
  ) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Courses');
    const headers = [
      'courseCode',
      'courseName',
      'courseNameAr',
      'courseNameEn',
      'level',
      'semester',
      'department',
      'creditHours',
      'type',
      'prerequisites',
      'coRequisites',
      'equivalentCourses',
      'offeredTerms',
      'recommendedSemester',
      'minimumGpa',
      'registrationPriority',
      'description',
      'programCurricula',
      'status',
    ];
    sheet.columns = headers.map((key) => ({ header: key, key, width: 18 }));
    let page = 1;
    let totalPages = 1;
    do {
      const result = await this.findAll({ ...query, page, limit: 100 }, caller);
      for (const course of result.items) {
        sheet.addRow({
          courseCode: course.code,
          courseName: course.name,
          courseNameAr: course.nameAr,
          courseNameEn: course.nameEn,
          level: course.level,
          semester: course.semester,
          department: course.department,
          creditHours: course.creditHours,
          type: course.type,
          prerequisites: course.prerequisites?.join(', '),
          coRequisites: course.coRequisites?.join(', '),
          equivalentCourses: course.equivalentCourses?.join(', '),
          offeredTerms: course.offeredTerms?.join(', '),
          recommendedSemester: course.recommendedSemester,
          minimumGpa: course.minimumGpa,
          registrationPriority: course.registrationPriority,
          description: course.description,
          programCurricula: getCourseCurricula(course)
            .map(
              (item) =>
                `${item.department}:${item.academicLevel}:${item.semester}:${item.type}`,
            )
            .join('|'),
          status: course.isActive ? 'Active' : 'Inactive',
        });
      }
      totalPages = result.totalPages;
      page++;
    } while (page <= totalPages);
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0D9488' },
    };
    sheet.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.columns.forEach((column) => {
      let width = 12;
      column.eachCell?.({ includeEmpty: false }, (cell) => {
        width = Math.max(width, cell.text.length + 2);
      });
      column.width = Math.min(width, 80);
    });
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async findOne(id: string): Promise<CourseDocument> {
    const course = await this.courseModel.findById(id);
    if (!course) {
      throw new NotFoundException('المادة غير موجودة'); // Course not found
    }
    return course;
  }

  async update(id: string, dto: UpdateCourseDto): Promise<CourseDocument> {
    if (dto.curricula?.length) {
      dto.offeredTerms = [
        ...new Set(dto.curricula.map((item) => item.semester)),
      ];
    }
    const course = await this.findOne(id);

    if (dto.code && dto.code.toUpperCase() !== course.code) {
      const existing = await this.courseModel.findOne({
        code: dto.code.toUpperCase(),
      });
      if (existing) {
        throw new ConflictException('كود المادة موجود بالفعل');
      }
      dto.code = dto.code.toUpperCase();
    }

    if (dto.level && !dto.academicLevel) {
      dto.academicLevel = dto.level;
    }

    if (dto.academicLevel && !dto.level) {
      dto.level = dto.academicLevel;
    }

    if (dto.prerequisites) {
      dto.prerequisites = dto.prerequisites.map((code) => code.toUpperCase());
    }

    const updatePayload: Record<string, any> = { ...dto };
    if (dto.syllabusPdfUrl === null || dto.syllabusPdfUrl === '') {
      updatePayload.syllabusPdfUrl = null;
      updatePayload.syllabusPdfName = null;
      updatePayload.syllabusPdfData = null;
      updatePayload.syllabusFile = null;
      updatePayload.syllabusUpdatedAt = null;
    }
    if (dto.coverImageUrl === null || dto.coverImageUrl === '') {
      updatePayload.coverImageUrl = null;
    }

    if (dto.doctorIds !== undefined || dto.doctorId !== undefined) {
      const incomingDoctorIds: string[] = Array.isArray(dto.doctorIds)
        ? dto.doctorIds.filter(Boolean).slice(0, MAX_COURSE_DOCTORS)
        : dto.doctorId
          ? [dto.doctorId]
          : [];

      if (incomingDoctorIds.length > 0) {
        const validDoctorObjectIds: Types.ObjectId[] = [];
        for (const dId of incomingDoctorIds) {
          if (Types.ObjectId.isValid(dId)) {
            validDoctorObjectIds.push(new Types.ObjectId(dId));
          }
        }

        const docUsers = await this.userModel
          .find({ _id: { $in: validDoctorObjectIds } })
          .select('_id name nameAr staffType titlePrefix')
          .lean();

        const doctors: Array<{
          _id: Types.ObjectId;
          name: string;
          nameAr?: string;
          staffType?: string;
          titlePrefix?: string;
        }> = [];
        for (const dId of validDoctorObjectIds) {
          const u = docUsers.find(
            (doc) => doc._id.toString() === dId.toString(),
          );
          if (u) {
            doctors.push({
              _id: u._id,
              name: u.name,
              nameAr: (u as any).nameAr || u.name,
              staffType: (u as any).staffType || 'doctor',
              titlePrefix: (u as any).titlePrefix,
            });
          }
        }

        updatePayload.doctorId = validDoctorObjectIds[0] || null;
        updatePayload.doctorName =
          doctors.map((d) => d.name).join(' / ') || null;
        updatePayload.doctorNameAr =
          doctors.map((d) => d.nameAr || d.name).join(' / ') || null;
        updatePayload.doctorIds = validDoctorObjectIds;
        updatePayload.doctors = doctors;
      } else {
        updatePayload.doctorId = null;
        updatePayload.doctorName = null;
        updatePayload.doctorNameAr = null;
        updatePayload.doctorIds = [];
        updatePayload.doctors = [];
      }
    }

    if (dto.teachingAssistantIds !== undefined) {
      if (
        Array.isArray(dto.teachingAssistantIds) &&
        dto.teachingAssistantIds.length > 0
      ) {
        const validTaObjectIds: Types.ObjectId[] = [];
        for (const taId of dto.teachingAssistantIds) {
          if (Types.ObjectId.isValid(taId)) {
            validTaObjectIds.push(new Types.ObjectId(taId));
          }
        }
        const taUsers = await this.userModel
          .find({ _id: { $in: validTaObjectIds } })
          .select('_id name nameAr staffType titlePrefix')
          .lean();
        updatePayload.teachingAssistantIds = validTaObjectIds;
        updatePayload.teachingAssistants = taUsers.map((u) => ({
          _id: u._id,
          name: u.name,
          nameAr: (u as any).nameAr || u.name,
          staffType: (u as any).staffType || 'teaching_assistant',
          titlePrefix: (u as any).titlePrefix,
        }));
      } else {
        updatePayload.teachingAssistantIds = [];
        updatePayload.teachingAssistants = [];
      }
    }

    const updated = await this.courseModel.findByIdAndUpdate(
      id,
      {
        $set: updatePayload,
        ...(dto.teachingAssistantIds !== undefined
          ? { $unset: { teachingAssistantId: 1, teachingAssistant: 1 } }
          : {}),
      },
      { new: true },
    );
    if (!updated) {
      throw new NotFoundException('المادة غير موجودة');
    }
    await this.cacheService?.delPattern('courses:*');
    return updated;
  }

  async findDoctorCourses(
    staffId: string,
  ): Promise<
    Array<Record<string, unknown> & { enrolledStudentsCount: number }>
  > {
    if (!Types.ObjectId.isValid(staffId)) return [];
    const courses = (await this.courseModel
      .find({
        ...courseStaffFilter(staffId),
        isActive: true,
      })
      .lean()) as unknown as Array<
      Record<string, unknown> & { _id: Types.ObjectId; code: string }
    >;

    if (!courses || courses.length === 0) return [];

    const courseCodes = courses.map((c) => String(c.code).toUpperCase());
    const courseIdStrs = courses.map((c) => c._id.toString());
    const allMatches = [...courseCodes, ...courseIdStrs];

    const approvedRegistrations = await this.courseRegistrationModel
      .find({
        status: 'approved',
        courses: { $in: allMatches },
      })
      .select('courses')
      .lean();

    const countMap: Record<string, number> = {};
    for (const reg of approvedRegistrations) {
      const regCourses = (reg.courses || []).map((c: string) =>
        c.toUpperCase(),
      );
      for (const course of courses) {
        const cCode = String(course.code).toUpperCase();
        const cId = course._id.toString();
        if (
          regCourses.includes(cCode) ||
          regCourses.includes(cId.toUpperCase())
        ) {
          countMap[cId] = (countMap[cId] || 0) + 1;
        }
      }
    }

    const hydratedCourses = await this.hydrateCoursesStaff(courses as any[]);
    return hydratedCourses.map((c) => ({
      ...c,
      enrolledStudentsCount: countMap[c._id.toString()] || 0,
    }));
  }

  async remove(id: string): Promise<{ message: string }> {
    await this.findOne(id);
    await this.courseModel.findByIdAndDelete(id);
    await this.cacheService?.delPattern('courses:*');
    return { message: 'تم حذف المادة بنجاح' }; // Course deleted successfully
  }

  private getCloudinaryConfig() {
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');

    if (!cloudName || !apiKey || !apiSecret) {
      return null;
    }

    return { cloudName, apiKey, apiSecret };
  }

  private createCloudinarySignature(
    params: Record<string, string>,
    apiSecret: string,
  ) {
    const normalizedParams = Object.entries(params)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${value}`)
      .join('&');

    return createHash('sha1')
      .update(`${normalizedParams}${apiSecret}`)
      .digest('hex');
  }

  validateCourseDoctorOrAdmin(course: CourseDocument, caller?: any) {
    if (!caller || caller.role === 'admin') return;
    const normalizedStaffType = String(caller.staffType || '')
      .trim()
      .toLowerCase();
    if (caller.role !== 'staff' || normalizedStaffType !== 'doctor') {
      throw new ForbiddenException(
        'Only an assigned doctor or administrator can manage the course book',
      );
    }
    const callerId = caller._id?.toString();
    const isAssigned = isAssignedToCourse(course, callerId, 'doctor');
    if (!isAssigned) {
      throw new ForbiddenException(
        'غير مسموح لك برفع أو تعديل كتاب هذا المقرر لعدم إسناد المادة إليك كأستاذ مقرر',
      );
    }
  }

  async authorizeMaterialUpload(
    courseId: string,
    caller: { role: string; staffType?: string; _id: { toString(): string } },
    book: boolean,
  ) {
    if (!caller) throw new ForbiddenException('Authentication required');
    const course = await this.findOne(courseId);
    if (book) return this.validateCourseDoctorOrAdmin(course, caller);
    if (!this.materialUploadPolicy(course, caller)) {
      throw new ForbiddenException(
        'You are not assigned to upload materials for this course',
      );
    }
  }

  private materialUploadPolicy(
    course: CourseDocument,
    caller?: { role: string; staffType?: string; _id: { toString(): string } },
  ): {
    role: CourseMaterial['uploadedByRole'];
    types: CourseMaterialType[];
  } | null {
    if (caller?.role === 'admin')
      return { role: 'admin', types: ['lecture', 'section'] };
    if (caller?.role !== 'staff') return null;
    const type = caller.staffType?.trim().toLowerCase();
    const id = caller._id.toString();
    if (type === 'doctor' && isAssignedToCourse(course, id, 'doctor')) {
      return { role: type, types: ['lecture'] };
    }
    if (
      type === 'assistant_lecturer' &&
      isAssignedToCourse(course, id, 'all')
    ) {
      return { role: type, types: ['lecture', 'section'] };
    }
    if (
      type === 'teaching_assistant' &&
      isAssignedToCourse(course, id, 'all')
    ) {
      return { role: type, types: ['section'] };
    }
    return null;
  }

  async uploadSyllabus(courseId: string, file: MaterialUpload, caller?: any) {
    const course = await this.findOne(courseId);
    this.validateCourseDoctorOrAdmin(course, caller);
    const stored = await this.materialStorage!.save(file, true);
    course.syllabusFile = stored;
    course.syllabusPdfUrl = `/api/courses/${courseId}/syllabus/download`;
    course.syllabusPdfName = stored.originalName;
    course.syllabusPdfData = undefined;
    course.syllabusUpdatedAt = new Date();
    try {
      await course.save();
    } catch (error) {
      await this.cleanupFailedMaterialCommit(stored, course._id, true, error);
      throw error;
    }
    await this.cacheService?.delPattern('courses:*');
    return {
      message: 'Course book uploaded successfully',
      courseId,
      syllabusPdfUrl: course.syllabusPdfUrl,
      syllabusPdfName: course.syllabusPdfName,
      syllabusUpdatedAt: course.syllabusUpdatedAt,
      coverImageUrl: course.coverImageUrl,
    };
  }

  async downloadSyllabus(courseId: string, res: any, caller?: any) {
    if (caller && caller.role === 'student') {
      const studentProfile = await this.studentProfileModel
        .findOne({ userId: caller._id })
        .lean();
      if (studentProfile?.isBlocked) {
        throw new ForbiddenException(
          'عفواً، لا يمكنك تحميل منهج المقرر الدراسي نظراً لحجب الحساب لعدم سداد المصروفات الدراسية. يرجى مراجعة إدارة المعهد.',
        );
      }
    }

    const course = await this.courseModel
      .findById(courseId)
      .select('+syllabusPdfData')
      .exec();

    if (
      !course ||
      (!course.syllabusPdfUrl &&
        !course.syllabusPdfData &&
        !course.syllabusFile)
    ) {
      throw new NotFoundException('لم يتم رفع ملف المنهج لهذا المقرر بعد');
    }

    if (course.syllabusFile)
      return this.materialStorage!.deliver(course.syllabusFile, res, true);

    const fallbackFilename = `syllabus_${course.code || 'course'}.pdf`;
    const safeFilename = encodeURIComponent(
      course.syllabusPdfName || fallbackFilename,
    );

    // Downloads are permission checked and must never enter a shared cache.
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Accept-Ranges', 'bytes');

    // 1. If stored locally in DB (dev/offline fallback), serve buffer
    if (course.syllabusPdfData) {
      const buffer = Buffer.from(course.syllabusPdfData, 'base64');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`,
      );
      return res.send(buffer);
    }

    if (course.syllabusPdfUrl?.startsWith('data:application/pdf;base64,')) {
      const base64Data = course.syllabusPdfUrl.replace(
        'data:application/pdf;base64,',
        '',
      );
      const buffer = Buffer.from(base64Data, 'base64');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`,
      );
      return res.send(buffer);
    }

    // 2. High-performance streaming proxy for Cloudinary/external URLs with zero buffer duplication
    if (course.syllabusPdfUrl) {
      try {
        const headers: Record<string, string> = {};
        const config = this.getCloudinaryConfig();
        if (
          config &&
          new URL(course.syllabusPdfUrl).origin === 'https://res.cloudinary.com'
        ) {
          headers['Authorization'] =
            `Basic ${Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString('base64')}`;
        }
        this.assertLegacyOrigin(course.syllabusPdfUrl);
        const upstream = await fetch(course.syllabusPdfUrl, {
          headers,
          redirect: 'error',
          signal: AbortSignal.timeout(60000),
        });
        if (upstream.ok && upstream.body) {
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader(
            'Content-Disposition',
            `inline; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`,
          );

          // Stream upstream body directly into Express response (O(1) constant RAM usage)
          // Node 18+ Web ReadableStream to Node Readable
          const nodeStream = Readable.fromWeb(upstream.body as any);
          return nodeStream.pipe(res);
        }
      } catch {
        console.warn('Legacy syllabus streaming failed');
      }

      throw new NotFoundException(
        'Legacy book is unavailable; please retry later',
      );
    }

    throw new NotFoundException('ملف المنهج غير متوفر حالياً');
  }

  async uploadCoverImage(
    courseId: string,
    file: CourseSyllabusFile,
    caller?: any,
  ): Promise<{
    message: string;
    courseId: string;
    courseCode: string;
    coverImageUrl: string;
  }> {
    const course = await this.findOne(courseId);
    this.validateCourseDoctorOrAdmin(course, caller);

    const isImage =
      file.mimetype.startsWith('image/') ||
      /\.(jpg|jpeg|png|webp|avif)$/i.test(file.originalname);

    if (!isImage) {
      throw new BadRequestException(
        'يجب أن يكون ملف الغلاف صورة بصيغة (JPG, PNG, WEBP) فقط',
      );
    }

    const config = this.getCloudinaryConfig();
    let fileUrl: string;

    if (config) {
      const { cloudName, apiKey, apiSecret } = config;
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const folder = 'course-covers';
      const signature = this.createCloudinarySignature(
        { folder, timestamp },
        apiSecret,
      );

      const ext = file.originalname.split('.').pop() || 'jpg';
      const safeFilename = `cover_${course.code || 'course'}_${Date.now()}.${ext}`;
      const formData = new FormData();
      formData.append(
        'file',
        new Blob([new Uint8Array(file.buffer)], {
          type: file.mimetype || 'image/jpeg',
        }),
        safeFilename,
      );
      formData.append('api_key', apiKey);
      formData.append('folder', folder);
      formData.append('timestamp', timestamp);
      formData.append('signature', signature);

      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        {
          method: 'POST',
          body: formData,
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new BadRequestException(
          `فشل رفع صورة الغلاف إلى السحابة: ${errorText || response.statusText}`,
        );
      }

      const result = (await response.json()) as { secure_url?: string };
      if (!result.secure_url) {
        throw new BadRequestException('لم يتم استلام رابط الصورة من السحابة');
      }
      fileUrl = result.secure_url;
    } else {
      const base64 = Buffer.from(file.buffer).toString('base64');
      fileUrl = `data:${file.mimetype};base64,${base64}`;
    }

    course.coverImageUrl = fileUrl;
    await course.save();

    return {
      message: 'تم رفع وتحديث صورة غلاف المقرر بنجاح',
      courseId: course._id.toString(),
      courseCode: course.code,
      coverImageUrl: course.coverImageUrl,
    };
  }

  async getStudentSyllabi(
    studentUserId: string,
  ): Promise<StudentSyllabiResponse> {
    const studentUserObjId = new Types.ObjectId(studentUserId);
    const profile = await this.studentProfileModel
      .findOne({ userId: studentUserObjId })
      .select('level department semester academicYear')
      .lean();

    if (!profile) throw new NotFoundException('Student profile not found');
    if (!normalizeDepartment(profile.department)) {
      throw new BadRequestException(
        'يرجى مراجعة شؤون الطلاب لتحديد القسم الدراسي / Student department is missing or unknown',
      );
    }
    const period = this.registrationsService
      ? await this.registrationsService.resolveRegistrationPeriod(
          studentUserId,
          profile.semester,
        )
      : { academicYear: profile.academicYear, semester: profile.semester };

    const latestRegistration = await this.courseRegistrationModel
      .findOne({
        studentId: studentUserObjId,
        status: 'approved',
        academicYear: period.academicYear,
        semester: period.semester,
      })
      .sort({ createdAt: -1 })
      .select('courses')
      .lean();

    const registeredCodes = (latestRegistration?.courses ?? []).map((c) =>
      c.toUpperCase(),
    );

    const studentLevel = profile?.level ?? '1';

    const [rawRegisteredCourses, rawLevelCourses] = await Promise.all([
      registeredCodes.length > 0
        ? this.courseModel
            .find({
              code: { $in: registeredCodes },
              isActive: true,
            })
            .sort({ code: 1 })
            .lean()
        : [],
      this.courseModel
        .find({
          ...courseCurriculumFilter({
            level: studentLevel as CourseLevel,
            department: normalizeDepartment(profile.department),
            semester: period.semester as Semester,
          }),
          isActive: true,
        })
        .sort({ code: 1 })
        .lean(),
    ]);

    const [registeredCourses, levelCourses] = await Promise.all([
      this.hydrateCoursesStaff(rawRegisteredCourses as any[]),
      this.hydrateCoursesStaff(rawLevelCourses as any[]),
    ]);

    return {
      studentLevel,
      academicYear: period.academicYear,
      semester: period.semester,
      registeredCount: registeredCourses.length,
      registeredCourses: registeredCourses.map((c) => ({
        ...(courseForDepartment(c, profile.department) ?? c),
        isRegistered: true,
      })),
      availableLevelCourses: coursesForDepartment(
        levelCourses,
        profile.department,
      )
        .filter((c) => isCourseOfferedForTerm(c, period.semester as Semester))
        .map((c) => ({
          ...c,
          isRegistered: registeredCodes.includes(c.code.toUpperCase()),
        })),
    };
  }

  async removeSyllabus(
    courseId: string,
    caller?: any,
  ): Promise<{ message: string }> {
    const course = await this.findOne(courseId);
    this.validateCourseDoctorOrAdmin(course, caller);
    course.syllabusFile = undefined;
    course.syllabusPdfUrl = undefined;
    course.syllabusPdfName = undefined;
    course.syllabusPdfData = undefined;
    course.syllabusUpdatedAt = undefined;
    await course.save();
    await this.cacheService?.delPattern('courses:*');
    return { message: 'تم إزالة ملف المنهج بنجاح' };
  }

  async removeCoverImage(
    courseId: string,
    caller?: any,
  ): Promise<{ message: string }> {
    const course = await this.findOne(courseId);
    this.validateCourseDoctorOrAdmin(course, caller);
    course.coverImageUrl = undefined;
    await course.save();
    return { message: 'تم إزالة صورة غلاف المقرر بنجاح' };
  }

  /**
   * Upload lectures by doctors or sections by TAs/assistant lecturers for assigned courses.
   */
  async uploadCourseMaterial(
    courseId: string,
    upload: MaterialUpload | MaterialUpload[] | undefined,
    dto: CreateCourseMaterialDto,
    caller: any,
  ) {
    const course = await this.findOne(courseId);

    const policy = this.materialUploadPolicy(course, caller);
    if (!policy) {
      throw new ForbiddenException(
        'You are not assigned to upload materials for this course',
      );
    }
    if (!policy.types.includes(dto.type)) {
      throw new BadRequestException(
        'This material type is not available for your teaching role',
      );
    }
    const uploadedByRole = policy.role;

    const files = Array.isArray(upload) ? upload : upload ? [upload] : [];
    const videoUrl = dto.videoUrl?.trim();
    if (!files.length && !videoUrl) {
      throw new BadRequestException('Provide a file or a recording URL');
    }
    if (videoUrl) {
      let parsed: URL;
      try {
        parsed = new URL(videoUrl);
      } catch {
        throw new BadRequestException('Invalid recording URL');
      }
      if (
        parsed.protocol !== 'https:' ||
        parsed.username ||
        parsed.password ||
        videoUrl.length > 2048
      ) {
        throw new BadRequestException(
          'Recording URL must use HTTPS without credentials',
        );
      }
    }
    const bundle =
      files.length > 1
        ? await this.materialStorage!.saveBundle(files, dto.title.trim())
        : undefined;
    const stored =
      bundle?.stored ??
      (files[0]
        ? await this.materialStorage!.save(files[0], false)
        : undefined);
    const material = new this.courseMaterialModel({
      courseId: course._id,
      type: dto.type,
      title: dto.title.trim(),
      titleAr: dto.titleAr?.trim(),
      fileUrl: `/api/courses/materials/pending/download`,
      storedFile: stored,
      attachments: bundle?.attachments,
      fileName: stored?.originalName || dto.title.trim(),
      fileSize: stored?.size,
      mimeType: stored?.mimeType,
      videoUrl,
      weekNumber: dto.weekNumber,
      description: dto.description?.trim(),
      isPublished: true,
      uploadedBy: new Types.ObjectId(caller._id),
      uploadedByName: caller.name || caller.fullName || 'عضو هيئة تدريس',
      uploadedByRole,
    });

    material.fileUrl = `/api/courses/materials/${material._id.toString()}/download`;
    let saved: CourseMaterialDocument;
    try {
      saved = await material.save();
    } catch (error) {
      if (stored)
        await this.cleanupFailedMaterialCommit(
          stored,
          material._id,
          false,
          error,
        );
      throw error;
    }
    void this.cacheService?.delPattern(`courses:${courseId}:materials*`);

    return {
      message:
        dto.type === 'lecture'
          ? 'تم رفع المحاضرة بنجاح'
          : 'تم رفع السكشن بنجاح',
      material: saved,
    };
  }

  /**
   * Retrieve course materials with student withholding check.
   */
  async getCourseMaterials(
    courseId: string,
    query: QueryCourseMaterialsDto,
    caller?: any,
  ) {
    const course = await this.findOne(courseId);

    // If caller is student: enforce withholding gate for unpaid fees
    if (caller && caller.role === 'student') {
      const studentProfile = await this.studentProfileModel
        .findOne({ userId: caller._id })
        .lean();

      if (studentProfile?.isBlocked) {
        throw new ForbiddenException(
          'عفواً، تم حجب المحاضرات والسكاشن الدراسية نظراً لحجب الحساب لعدم سداد المصروفات الدراسية. يرجى مراجعة إدارة المعهد.',
        );
      }
    }

    const filter: Record<string, any> = { courseId: course._id };
    if (query.type) {
      filter.type = query.type;
    }
    if (caller && caller.role === 'student') {
      filter.isPublished = true;
    }

    const materials = await this.courseMaterialModel
      .find(filter)
      .sort({ weekNumber: 1, createdAt: 1 })
      .lean();

    return {
      courseId: course._id,
      courseCode: course.code,
      courseName: course.name,
      courseNameAr: course.nameAr,
      totalCount: materials.length,
      allowedUploadTypes:
        caller?.role === 'admin' ||
        (caller?.role === 'staff' &&
          Array.isArray(caller.permissions) &&
          caller.permissions.includes(PERMISSIONS.COURSE_MATERIALS_WRITE))
          ? (this.materialUploadPolicy(course, caller)?.types ?? [])
          : [],
      materials,
    };
  }

  /**
   * Stream / download course material with student withholding check.
   */
  async downloadCourseMaterial(materialId: string, res: any, caller?: any) {
    const material = await this.courseMaterialModel.findById(materialId);
    if (!material) {
      throw new NotFoundException('لم يتم العثور على الملف المطلوب');
    }

    if (caller && caller.role === 'student') {
      const studentProfile = await this.studentProfileModel
        .findOne({ userId: caller._id })
        .lean();

      if (studentProfile?.isBlocked) {
        throw new ForbiddenException(
          'عفواً، لا يمكنك تحميل المحاضرات أو السكاشن الدراسية نظراً لحجب الحساب لعدم سداد المصروفات الدراسية. يرجى مراجعة إدارة المعهد.',
        );
      }
    }

    if (caller?.role === 'student' && !material.isPublished)
      throw new NotFoundException('Material is unavailable');
    if (
      material.videoUrl &&
      !material.storedFile &&
      !material.mimeType &&
      !material.fileSize
    ) {
      throw new BadRequestException(
        'Open the recording link instead of downloading a file',
      );
    }
    if (material.storedFile)
      return this.materialStorage!.deliver(material.storedFile, res);

    res.setHeader('Cache-Control', 'private, no-store');
    if (material.fileUrl.startsWith('data:')) {
      const parts = material.fileUrl.split(';base64,');
      const contentType = parts[0].replace('data:', '');
      const buffer = Buffer.from(parts[1], 'base64');
      res.setHeader('Content-Type', contentType);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(material.fileName)}"`,
      );
      return res.send(buffer);
    }

    return this.streamLegacyMaterial(
      material.fileUrl,
      res,
      material.fileName,
      material.mimeType,
    );
  }

  /**
   * Delete course material (admin or original uploader).
   */
  private async cleanupFailedMaterialCommit(
    reference: MaterialFileReference,
    id: unknown,
    book: boolean,
    error: unknown,
  ) {
    const failure = error as { name?: string; code?: number };
    if (
      !['ValidationError', 'CastError'].includes(failure?.name || '') &&
      failure?.code !== 11000
    ) {
      console.warn(
        'Material commit outcome is uncertain; retaining file for reconciliation',
      );
      return;
    }
    try {
      const referenced = book
        ? await this.courseModel.exists({
            _id: id,
            'syllabusFile.storageKey': reference.storageKey,
          })
        : await this.courseMaterialModel.exists({
            _id: id,
            'storedFile.storageKey': reference.storageKey,
          });
      if (!referenced) await this.materialStorage!.removeUncommitted(reference);
    } catch {
      // A lost database acknowledgement can follow a successful commit. Never delete
      // its file while database availability prevents confirming the outcome.
      console.warn(
        'Material commit outcome is uncertain; retaining file for reconciliation',
      );
    }
  }

  private assertLegacyOrigin(value: string) {
    const url = new URL(value);
    const configured = this.configService.get<string>(
      'MATERIALS_LEGACY_ORIGINS',
      'https://res.cloudinary.com',
    );
    const origins = configured.split(',').map((item) => item.trim());
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      !origins.includes(url.origin)
    ) {
      throw new BadRequestException('Legacy storage origin is not allowed');
    }
  }

  private async streamLegacyMaterial(
    url: string,
    res: any,
    filename: string,
    mimeType?: string,
  ) {
    this.assertLegacyOrigin(url);
    const upstream = await fetch(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(60000),
    });
    if (!upstream.ok || !upstream.body)
      throw new NotFoundException('Legacy material is unavailable');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', mimeType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="material"; filename*=UTF-8''${encodeURIComponent(filename).replace(/'/g, '%27')}`,
    );
    return Readable.fromWeb(upstream.body as any).pipe(res);
  }

  async deleteCourseMaterial(materialId: string, caller: any) {
    const material = await this.courseMaterialModel.findById(materialId);
    if (!material) {
      throw new NotFoundException('لم يتم العثور على الملف المطلوب');
    }

    if (caller.role !== 'admin') {
      const callerIdStr = caller._id?.toString();
      if (material.uploadedBy.toString() !== callerIdStr) {
        throw new ForbiddenException(
          'لا يمكنك حذف ملف قام برفعه عضو تدريس آخر',
        );
      }
    }

    await this.courseMaterialModel.findByIdAndDelete(materialId);
    void this.cacheService?.delPattern(
      `courses:${material.courseId.toString()}:materials*`,
    );

    return {
      message:
        material.type === 'lecture'
          ? 'تم حذف المحاضرة بنجاح'
          : 'تم حذف السكشن بنجاح',
      materialId,
    };
  }

  /**
   * Generate downloadable Excel template for course student enrollment matching institute format.
   */
  async generateEnrollmentTemplate(
    format: 'xlsx' | 'csv' = 'xlsx',
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    if (format === 'csv') {
      const csvHeaders = [
        'كود الطالب',
        'المستوى',
        'الحجب',
        'اسم الطالب (اختياري)',
      ];
      const sampleRows = [
        '260402,المستوى الثاني,مفعل,عبدالرحمن صابر علي محمود وحيده',
        '260104,المستوى الثاني,مفعل,فارس ابراهيم نصر ابراهيم عبدالوهاب المالح',
        '260464,المستوى الثاني,محجوب,مصطفى ايهاب العوضي عريب محمد',
        '260791,المستوى الثاني,مفعل,ملك محمد رضا عبدالسلام عثمان',
        '261556,المستوى الثاني,محجوب,خلود نشأت رمضان عبدالعزيز علي',
        '260646,المستوى الثاني,مفعل,مصطفى عصمت حسن صديق احمد',
      ];
      const csvContent =
        '\uFEFF' + [csvHeaders.join(','), ...sampleRows].join('\n');
      return {
        buffer: Buffer.from(csvContent, 'utf-8'),
        contentType: 'text/csv; charset=utf-8',
        filename: 'course-students-enrollment-template.csv',
      };
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'BH47A Student Portal';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('تسجيل الطلاب بالمقرر', {
      views: [{ rightToLeft: true }],
    });

    sheet.columns = [
      { header: 'كود الطالب', key: 'student_code', width: 20 },
      { header: 'المستوى', key: 'level', width: 22 },
      { header: 'الحجب', key: 'status', width: 18 },
      { header: 'اسم الطالب (اختياري)', key: 'student_name', width: 38 },
    ];

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.height = 30;
    headerRow.font = {
      bold: true,
      color: { argb: 'FFFFFFFF' },
      size: 11,
      name: 'Segoe UI',
    };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0D9488' }, // Dark Teal
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    // Sample data rows matching institute format
    const sampleRows = [
      {
        student_code: '260402',
        level: 'المستوى الثاني',
        status: 'مفعل',
        student_name: 'عبدالرحمن صابر علي محمود وحيده',
      },
      {
        student_code: '260104',
        level: 'المستوى الثاني',
        status: 'مفعل',
        student_name: 'فارس ابراهيم نصر ابراهيم عبدالوهاب المالح',
      },
      {
        student_code: '260464',
        level: 'المستوى الثاني',
        status: 'محجوب',
        student_name: 'مصطفى ايهاب العوضي عريب محمد',
      },
      {
        student_code: '260791',
        level: 'المستوى الثاني',
        status: 'مفعل',
        student_name: 'ملك محمد رضا عبدالسلام عثمان',
      },
      {
        student_code: '261556',
        level: 'المستوى الثاني',
        status: 'محجوب',
        student_name: 'خلود نشأت رمضان عبدالعزيز علي',
      },
      {
        student_code: '260646',
        level: 'المستوى الثاني',
        status: 'مفعل',
        student_name: 'مصطفى عصمت حسن صديق احمد',
      },
    ];

    sampleRows.forEach((row) => {
      const addedRow = sheet.addRow(row);
      addedRow.height = 24;
      addedRow.alignment = { vertical: 'middle', horizontal: 'center' };
      addedRow.font = { name: 'Segoe UI', size: 10 };
    });

    const uint8Array = await workbook.xlsx.writeBuffer();
    return {
      buffer: Buffer.from(uint8Array),
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: 'course-students-enrollment-template.xlsx',
    };
  }

  async withdrawStudentsFromExcel(
    courseId: string,
    buffer: Buffer,
    originalname: string,
    options: WithdrawStudentsOptionsDto,
    actorId: string,
  ) {
    if (
      !/^\d{4}-\d{4}$/.test(options.academicYear ?? '') ||
      !['first', 'second', 'summer'].includes(options.semester)
    ) {
      throw new BadRequestException(
        'حدد العام والفصل الدراسي / A specific academic year and semester are required',
      );
    }
    if (!/\.(xlsx|csv)$/i.test(originalname)) {
      throw new BadRequestException(
        'استخدم ملف XLSX أو CSV / Use an XLSX or CSV file',
      );
    }
    const course = await this.findOne(courseId);
    const rows = await this.parseEnrollmentWorkbookRows(buffer, originalname);
    if (!rows.length || rows.length > 10000) {
      throw new BadRequestException(
        'الملف يجب أن يحتوي من 1 إلى 10000 صف / File must contain 1–10000 rows',
      );
    }
    // Exact header matching is deliberate: a name or a course code must never
    // accidentally be treated as a student code in a destructive import.
    const headers = new Set(['كودالطالب', 'كود', 'studentcode', 'code']);
    const errors: string[] = [];
    let errorCount = 0;
    let duplicateCount = 0;
    let notEnrolledCount = 0;
    let withdrawnCount = 0;
    const codes = new Map<string, number>();
    const fail = (row: number, message: string) => {
      errorCount++;
      if (errors.length < 220) errors.push(`السطر ${row}: ${message}`);
    };
    rows.forEach((row, index) => {
      const entry = Object.entries(row).find(([key]) =>
        headers.has(
          key
            .replace(/^\uFEFF/, '')
            .toLowerCase()
            .replace(/[\s_\-()]/g, ''),
        ),
      );
      const code = entry ? this.cleanFieldValue(entry[1]).trim() : '';
      if (!code) fail(index + 2, 'كود الطالب مطلوب / Student code is required');
      else if (codes.has(code.toLowerCase())) duplicateCount++;
      else codes.set(code.toLowerCase(), index + 2);
    });
    const entries = [...codes];
    const courseCode = course.code.trim().toUpperCase();
    const processedStudents = new Set<string>();
    try {
      for (let offset = 0; offset < entries.length; offset += 100) {
        const batch = entries.slice(offset, offset + 100);
        const candidates = batch.flatMap(([code]) => [
          code,
          code.toUpperCase(),
        ]);
        const [profiles, users] = await Promise.all([
          this.studentProfileModel
            .find({ studentCode: { $in: candidates } })
            .select('studentCode userId')
            .lean(),
          this.userModel
            .find({
              role: 'student',
              $or: [
                { code: { $in: candidates } },
                { username: { $in: candidates } },
              ],
            })
            .select('_id code username')
            .lean<
              Array<{ _id: Types.ObjectId; code?: string; username?: string }>
            >(),
        ]);
        const idsByCode = new Map<string, Set<string>>();
        const add = (code: string | undefined, id: Types.ObjectId) => {
          if (!code || !id) return;
          const key = code.trim().toLowerCase();
          const ids = idsByCode.get(key) ?? new Set<string>();
          ids.add(String(id));
          idsByCode.set(key, ids);
        };
        for (const profile of profiles)
          add(profile.studentCode, profile.userId);
        for (const user of users) {
          add(user.code, user._id);
          add(user.username, user._id);
        }
        const operations: Parameters<
          typeof this.courseRegistrationModel.bulkWrite
        >[0] = [];
        for (const [code, row] of batch) {
          const ids = idsByCode.get(code);
          if (!ids?.size) {
            fail(row, 'الطالب غير موجود / Student not found');
            continue;
          }
          if (ids.size !== 1) {
            fail(row, 'كود الطالب غير فريد / Ambiguous student code');
            continue;
          }
          const id = [...ids][0];
          if (processedStudents.has(id)) {
            duplicateCount++;
            continue;
          }
          processedStudents.add(id);
          const studentId = new Types.ObjectId(id);
          const matchesCourse = {
            $eq: [
              { $toUpper: { $trim: { input: '$$code' } } },
              { $literal: courseCode },
            ],
          };
          const removedCourses = {
            $filter: { input: '$courses', as: 'code', cond: matchesCourse },
          };
          // An atomic pipeline derives both values from the current document,
          // preserving concurrent additions and making retries idempotent.
          operations.push({
            updateOne: {
              filter: {
                studentId,
                academicYear: options.academicYear,
                semester: options.semester,
                $expr: { $gt: [{ $size: removedCourses }, 0] },
              },
              update: [
                {
                  $set: {
                    administrativeChanges: {
                      $concatArrays: [
                        { $ifNull: ['$administrativeChanges', []] },
                        {
                          $literal: [
                            {
                              action: 'withdraw',
                              courseCode,
                              actorId: new Types.ObjectId(actorId),
                              at: new Date(),
                            },
                          ],
                        },
                      ],
                    },
                    courses: {
                      $filter: {
                        input: '$courses',
                        as: 'code',
                        cond: { $not: [matchesCourse] },
                      },
                    },
                    totalCreditHours: {
                      $max: [
                        0,
                        {
                          $subtract: [
                            { $ifNull: ['$totalCreditHours', 0] },
                            {
                              $multiply: [
                                course.creditHours ?? 3,
                                { $size: removedCourses },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  },
                },
              ],
            },
          });
        }
        if (operations.length) {
          const result = await this.courseRegistrationModel.bulkWrite(
            operations,
            { ordered: true },
          );
          withdrawnCount += result.modifiedCount;
          notEnrolledCount += operations.length - result.modifiedCount;
        }
      }
    } finally {
      await this.cacheService?.delPattern('courses:*');
      await this.cacheService?.delPattern('registrations:*');
      await this.cacheService?.delPattern('control:*');
    }
    return {
      courseId: String(course._id),
      courseCode: course.code,
      courseName: course.name,
      totalRows: rows.length,
      withdrawnCount,
      notEnrolledCount,
      duplicateCount,
      errorCount,
      errors,
    };
  }

  /**
   * Bulk enroll students into a single course from uploaded Excel sheet.
   */
  async enrollStudentsFromExcel(
    courseId: string,
    buffer: Buffer,
    originalname: string,
    options: CourseEnrollmentOptions = {},
  ): Promise<{
    courseId: string;
    courseCode: string;
    courseName: string;
    totalRows: number;
    enrolledCount: number;
    alreadyEnrolledCount: number;
    skippedBlockedCount: number;
    errorCount: number;
    errors: string[];
  }> {
    const course = await this.findOne(courseId);
    const rawRows = await this.parseEnrollmentWorkbookRows(
      buffer,
      originalname,
    );
    if (rawRows.length === 0) {
      throw new BadRequestException(
        'الملف فارغ أو لا يحتوي على صفوف بيانات صالحة',
      );
    }
    return this.processEnrollmentRows(course, rawRows, options);
  }

  /**
   * Bulk enroll students into a course from pre-parsed JSON row batches.
   */
  async enrollStudentsBatch(
    courseId: string,
    rawRows: Record<string, any>[],
    options: CourseEnrollmentOptions = {},
  ): Promise<{
    courseId: string;
    courseCode: string;
    courseName: string;
    totalRows: number;
    enrolledCount: number;
    alreadyEnrolledCount: number;
    skippedBlockedCount: number;
    errorCount: number;
    errors: string[];
  }> {
    const course = await this.findOne(courseId);
    if (!rawRows || rawRows.length === 0) {
      throw new BadRequestException('الدفعة فارغة أو لا تحتوي على صفوف صالحة');
    }
    return this.processEnrollmentRows(course, rawRows, options);
  }

  /**
   * High-performance batch enrollment engine using indexed lookups and bulkWrite.
   */
  async processEnrollmentRows(
    course: CourseDocument,
    rawRows: Record<string, any>[],
    options: CourseEnrollmentOptions = {},
  ): Promise<CourseEnrollmentResult> {
    const allowLimitOverride = options.overrideRegistrationLimits === true;
    const overrideReason = options.overrideReason?.trim();
    if (allowLimitOverride) {
      if (
        options.actor?.role !== 'admin' ||
        !Types.ObjectId.isValid(String(options.actor._id))
      )
        throw new ForbiddenException(
          'Only administrators can approve registration limit exceptions',
        );
      if (
        !overrideReason ||
        overrideReason.length < 10 ||
        overrideReason.length > 500
      )
        throw new BadRequestException(
          'A 10–500 character reason is required for a registration limit exception',
        );
      if (!this.registrationsService)
        throw new BadRequestException(
          'Registration validation service is unavailable',
        );
    }
    const academicYear = options.academicYear || '2026-2027';
    const semester =
      (options.semester as 'first' | 'second' | 'summer') || 'first';
    const skipBlocked = options.skipBlocked === true;

    // 1. Collect all candidate student codes from rows
    const codeCandidates = new Set<string>();
    for (const row of rawRows) {
      const code = this.extractFieldValue(row, [
        'كود الطالب',
        'كود_الطالب',
        'كود',
        'student_code',
        'studentcode',
        'code',
      ]);
      if (code && code.trim()) {
        const clean = code.trim();
        codeCandidates.add(clean);
        codeCandidates.add(clean.toLowerCase());
        codeCandidates.add(clean.toUpperCase());
      }
    }

    const candidateArray = Array.from(codeCandidates);

    // 2. Preload ONLY the matching student profiles and users
    const matchingProfiles: Array<
      Pick<
        StudentProfile,
        'studentCode' | 'userId' | 'isBlocked' | 'department' | 'level'
      > & { _id: Types.ObjectId }
    > = [];
    const matchingStudentUsers: Array<
      Pick<User, 'username'> & { _id: Types.ObjectId; code?: string }
    > = [];
    for (let offset = 0; offset < candidateArray.length; offset += 500) {
      const candidates = candidateArray.slice(offset, offset + 500);
      const [profiles, users] = await measureDatabaseStage(
        'enrollment.prefetch',
        () =>
          Promise.all([
            this.studentProfileModel
              .find({ studentCode: { $in: candidates } })
              .select('_id studentCode userId isBlocked department level')
              .lean()
              .exec(),
            this.userModel
              .find({
                role: 'student',
                $or: [
                  { code: { $in: candidates } },
                  { username: { $in: candidates } },
                ],
              })
              .select('_id code username')
              .lean()
              .exec(),
          ]),
      );
      matchingProfiles.push(...profiles);
      matchingStudentUsers.push(...users);
    }

    const profileByCode = new Map<string, any>();
    matchingProfiles.forEach((p: any) => {
      if (p.studentCode) {
        profileByCode.set(String(p.studentCode).trim().toLowerCase(), p);
      }
    });

    const userByCode = new Map<string, any>();
    matchingStudentUsers.forEach((u: any) => {
      if (u.code) {
        userByCode.set(String(u.code).trim().toLowerCase(), u);
      }
      if (u.username) {
        userByCode.set(String(u.username).trim().toLowerCase(), u);
      }
    });

    // 3. Collect target student user IDs for batch registration query
    const targetStudentUserIds: Types.ObjectId[] = [];
    for (const row of rawRows) {
      const rawCode = this.extractFieldValue(row, [
        'كود الطالب',
        'كود_الطالب',
        'كود',
        'student_code',
        'studentcode',
        'code',
      ]);
      if (!rawCode) continue;
      const cleanCode = rawCode.trim().toLowerCase();
      const profile = profileByCode.get(cleanCode);
      const studentUser = userByCode.get(cleanCode);
      const studentUserId = profile?.userId || studentUser?._id;
      if (studentUserId) {
        targetStudentUserIds.push(new Types.ObjectId(studentUserId));
      }
    }

    // 4. Deduplicate IDs and bound each registration lookup.
    const uniqueStudentIds = [
      ...new Map(targetStudentUserIds.map((id) => [String(id), id])).values(),
    ];
    const existingRegistrations: Array<
      Pick<CourseRegistration, 'studentId' | 'courses' | 'status'> & {
        _id: Types.ObjectId;
      }
    > = [];
    for (let offset = 0; offset < uniqueStudentIds.length; offset += 100) {
      const registrations = await measureDatabaseStage(
        'enrollment.prefetch',
        () =>
          this.courseRegistrationModel
            .find({
              studentId: { $in: uniqueStudentIds.slice(offset, offset + 100) },
              academicYear,
              semester,
            })
            .select('_id studentId courses status')
            .lean(),
      );
      existingRegistrations.push(...registrations);
    }

    const regByStudentId = new Map<string, any>();
    existingRegistrations.forEach((reg) => {
      regByStudentId.set(reg.studentId.toString(), reg);
    });

    const validationIds = [...new Set(targetStudentUserIds.map(String))].filter(
      (id) =>
        !(regByStudentId.get(id)?.courses ?? []).some(
          (code: string) => code.toUpperCase() === course.code.toUpperCase(),
        ),
    );
    const enrollmentContext =
      this.registrationsService && validationIds.length
        ? await measureDatabaseStage('enrollment.prefetch', () =>
            this.registrationsService!.prepareAdministrativeEnrollment(
              validationIds,
              [
                course.code,
                ...existingRegistrations.flatMap((reg) => reg.courses),
              ],
            ),
          )
        : undefined;

    let enrolledCount = 0;
    let overriddenCount = 0;
    const limitIssues = new Map<number, CourseEnrollmentIssue>();
    let alreadyEnrolledCount = 0;
    let skippedBlockedCount = 0;
    const errors: string[] = [];

    const courseCodeUpper = course.code.toUpperCase();
    const courseCreditHours = course.creditHours || 3;

    const profileBulkOps: any[] = [];
    const registrationBulkOps: any[] = [];
    const processedStudentIds = new Set<string>();

    for (let index = 0; index < rawRows.length; index++) {
      const row = rawRows[index];
      const rowNum = index + 2;

      const rawCode = this.extractFieldValue(row, [
        'كود الطالب',
        'كود_الطالب',
        'كود',
        'student_code',
        'studentcode',
        'code',
      ]);

      const rawLevel = this.extractFieldValue(row, [
        'المستوى',
        'الفرقة',
        'فرقة',
        'level',
        'السنة',
        'الصف',
      ]);

      const rawBlock = this.extractFieldValue(row, [
        'الحجب',
        'حجب',
        'الحالة',
        'status',
        'block',
        'حالة المصروفات',
        'المصروفات',
      ]);

      const rawName = this.extractFieldValue(row, [
        'اسم الطالب',
        'اسم_الطالب',
        'الاسم',
        'student_name',
        'name',
      ]);

      if (!rawCode) {
        errors.push(`السطر ${rowNum}: لم يتم العثور على كود الطالب في الصف`);
        continue;
      }

      const cleanCode = rawCode.trim().toLowerCase();
      const profile = profileByCode.get(cleanCode);
      const studentUser = userByCode.get(cleanCode);

      const studentUserId = profile?.userId || studentUser?._id;

      if (!studentUserId) {
        errors.push(
          `السطر ${rowNum}: لم يتم العثور على طالب مسجل بالكود "${rawCode}" (${rawName || ''})`,
        );
        continue;
      }

      const scopedCourse = courseForDepartment(
        course.toObject ? (course.toObject() as CourseDocument) : course,
        profile?.department,
      );
      if (!scopedCourse || !isCourseOfferedForTerm(scopedCourse, semester)) {
        errors.push(
          `السطر ${rowNum}: المقرر ${course.code} غير متاح لقسم الطالب في هذا الفصل / Course is not offered for this student's department and term`,
        );
        continue;
      }

      const studentUserIdStr = studentUserId.toString();
      if (processedStudentIds.has(studentUserIdStr)) {
        continue;
      }
      processedStudentIds.add(studentUserIdStr);

      let limitException: CourseEnrollmentLimitDetails | undefined;
      const existingCodes: string[] =
        regByStudentId.get(studentUserIdStr)?.courses ?? [];
      if (
        !existingCodes.some((code) => code.toUpperCase() === courseCodeUpper)
      ) {
        try {
          limitException = await measureDatabaseStage(
            'enrollment.rules',
            async () =>
              this.registrationsService?.assertAdministrativeCourseAddition(
                studentUserIdStr,
                scopedCourse,
                existingCodes,
                semester,
                allowLimitOverride,
                enrollmentContext,
              ),
          );
        } catch (error) {
          if (error instanceof BadRequestException) {
            const response = error.getResponse();
            if (
              typeof response === 'object' &&
              'code' in response &&
              response.code === 'REGISTRATION_LIMIT_EXCEEDED' &&
              'limits' in response
            ) {
              limitIssues.set(rowNum, {
                row: rowNum,
                code: 'REGISTRATION_LIMIT_EXCEEDED',
                message: error.message,
                limits: response.limits as CourseEnrollmentLimitDetails,
              });
            }
          }
          errors.push(
            `السطر ${rowNum}: ${error instanceof Error ? error.message : 'تعذر التحقق من أهلية التسجيل'}`,
          );
          continue;
        }
      }

      // Sync level & block/tuition status if profile exists
      let isStudentBlocked = profile?.isBlocked || false;
      const profileUpdates: Record<string, any> = {};

      if (rawBlock) {
        const isMarkedBlocked =
          rawBlock.includes('محجوب') ||
          rawBlock.toLowerCase() === 'blocked' ||
          rawBlock.toLowerCase() === 'unpaid';
        const isMarkedActive =
          rawBlock.includes('مفعل') ||
          rawBlock.toLowerCase() === 'active' ||
          rawBlock.toLowerCase() === 'paid';

        if (isMarkedBlocked) {
          isStudentBlocked = true;
          profileUpdates.isBlocked = true;
          profileUpdates.tuitionFeesStatus = 'unpaid';
          profileUpdates.blockReason = 'عدم سداد المصروفات الدراسية';
          profileUpdates.blockedAt = new Date();
        } else if (isMarkedActive) {
          isStudentBlocked = false;
          profileUpdates.isBlocked = false;
          profileUpdates.tuitionFeesStatus = 'paid';
          profileUpdates.unblockedAt = new Date();
        }
      }

      if (rawLevel) {
        let normalizedLevel: string | undefined;
        if (
          rawLevel.includes('أولى') ||
          rawLevel.includes('اولى') ||
          rawLevel === '1'
        ) {
          normalizedLevel = '1';
        } else if (
          rawLevel.includes('ثاني') ||
          rawLevel.includes('ثانيه') ||
          rawLevel === '2'
        ) {
          normalizedLevel = '2';
        } else if (
          rawLevel.includes('ثالث') ||
          rawLevel.includes('ثالثه') ||
          rawLevel === '3'
        ) {
          normalizedLevel = '3';
        } else if (
          rawLevel.includes('رابع') ||
          rawLevel.includes('رابعه') ||
          rawLevel === '4'
        ) {
          normalizedLevel = '4';
        } else if (['1', '2', '3', '4'].includes(rawLevel.trim())) {
          normalizedLevel = rawLevel.trim();
        }

        if (normalizedLevel && profile?.level !== normalizedLevel) {
          profileUpdates.level = normalizedLevel;
        }
      }

      if (profile?._id && Object.keys(profileUpdates).length > 0) {
        profileBulkOps.push({
          updateOne: {
            filter: { _id: profile._id },
            update: { $set: profileUpdates },
          },
        });
      }

      // Check blocked status if skipBlocked enabled
      if (skipBlocked && isStudentBlocked) {
        skippedBlockedCount++;
        continue;
      }

      const studentUserObjId = new Types.ObjectId(studentUserId);
      const existingReg = regByStudentId.get(studentUserIdStr);
      if (
        options.requireApprovedRegistration &&
        existingReg &&
        existingReg.status !== 'approved'
      ) {
        errors.push(
          `Row ${rowNum}: Pending registration must be resolved first / يجب إنهاء مراجعة التسجيل المعلق أولًا`,
        );
        continue;
      }
      const administrativeChange = options.actor
        ? {
            action: 'add',
            courseCode: courseCodeUpper,
            actorId: new Types.ObjectId(options.actor._id),
            at: new Date(),
          }
        : undefined;
      const audit =
        limitException && options.actor
          ? {
              ...limitException,
              actorId: new Types.ObjectId(options.actor._id),
              reason: overrideReason!,
              courseCode: courseCodeUpper,
              createdAt: new Date(),
            }
          : undefined;

      if (existingReg) {
        const existingCourses = (existingReg.courses || []).map((c: string) =>
          c.toUpperCase(),
        );

        if (existingCourses.includes(courseCodeUpper)) {
          alreadyEnrolledCount++;
        } else {
          registrationBulkOps.push({
            updateOne: {
              filter: {
                _id: existingReg._id,
                // Compare the validated snapshot so a concurrent course addition
                // cannot bypass the credit/course limits checked above.
                courses: existingReg.courses ?? { $exists: false },
                status: existingReg.status,
              },
              update: {
                $addToSet: { courses: courseCodeUpper },
                $set: { status: 'approved', approvedAt: new Date() },
                $inc: { totalCreditHours: courseCreditHours },
                ...(audit || administrativeChange
                  ? {
                      $push: {
                        ...(audit
                          ? { administrativeLimitOverrides: audit }
                          : {}),
                        ...(administrativeChange
                          ? { administrativeChanges: administrativeChange }
                          : {}),
                      },
                    }
                  : {}),
              },
            },
          });
          enrolledCount++;
          if (audit) overriddenCount++;
        }
      } else {
        registrationBulkOps.push({
          insertOne: {
            document: {
              studentId: studentUserObjId,
              courses: [courseCodeUpper],
              academicYear,
              semester,
              totalCreditHours: courseCreditHours,
              ...(audit ? { administrativeLimitOverrides: [audit] } : {}),
              ...(administrativeChange
                ? { administrativeChanges: [administrativeChange] }
                : {}),
              source: 'system',
              status: 'approved',
              approvedAt: new Date(),
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          },
        });
        enrolledCount++;
        if (audit) overriddenCount++;
      }
    }

    // Profile synchronization is intentionally separate, as in the existing import
    // contract. Finish it before starting registrations so no writes outlive an error.
    await measureDatabaseStage('enrollment.bulkWrite', async () => {
      await writeEnrollmentBatches(
        profileBulkOps,
        (batch) =>
          this.measureEnrollmentWrite('student_profiles', () =>
            this.studentProfileModel.bulkWrite(batch, {
              ordered: false,
              throwOnValidationError: true,
            }),
          ),
        'profiles',
      );
      await writeEnrollmentBatches(
        registrationBulkOps,
        (batch) =>
          this.measureEnrollmentWrite('course_registrations', () =>
            this.courseRegistrationModel.bulkWrite(batch, {
              ordered: false,
              throwOnValidationError: true,
            }),
          ),
        'registrations',
      );
    });

    return {
      courseId: course._id.toString(),
      courseCode: course.code,
      courseName: course.name,
      totalRows: rawRows.length,
      enrolledCount,
      alreadyEnrolledCount,
      skippedBlockedCount,
      errorCount: errors.length,
      overriddenCount,
      issues: errors.slice(0, 20).map((message) => {
        const row = Number(message.match(/^(?:السطر|Row) (\d+)/)?.[1] ?? 0);
        return (
          limitIssues.get(row) ?? {
            row,
            code: 'VALIDATION_ERROR' as const,
            message,
          }
        );
      }),
      errors: errors.slice(0, 20),
    };
  }

  private async measureEnrollmentWrite<T>(
    collection: string,
    write: () => Promise<T>,
  ): Promise<T> {
    const start = process.hrtime.bigint();
    try {
      return await write();
    } finally {
      // bulkWrite bypasses Mongoose query/save middleware; record it once here.
      this.metricsService?.recordDbQuery(
        collection,
        'bulkWrite',
        Number(process.hrtime.bigint() - start) / 1e9,
      );
    }
  }

  private cleanFieldValue(val: any): string {
    if (val === null || val === undefined) return '';
    return String(val).trim();
  }

  private extractFieldValue(
    row: Record<string, any>,
    possibleKeys: string[],
  ): string {
    for (const key of possibleKeys) {
      const cleanKey = key.toLowerCase().replace(/[\s_\-()]/g, '');
      for (const [rowKey, rowValue] of Object.entries(row)) {
        const cleanRowKey = rowKey.toLowerCase().replace(/[\s_\-()]/g, '');
        if (cleanRowKey === cleanKey || cleanRowKey.includes(cleanKey)) {
          if (rowValue !== undefined && rowValue !== null) {
            return this.cleanFieldValue(rowValue);
          }
        }
      }
    }
    return '';
  }

  private async parseEnrollmentWorkbookRows(
    buffer: Buffer,
    originalname: string,
  ): Promise<Record<string, any>[]> {
    const isCsv = originalname.toLowerCase().endsWith('.csv');

    if (isCsv) {
      const text = buffer.toString('utf-8');
      const lines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      if (lines.length <= 1) return [];

      const headers = lines[0].split(/[,;\t]/).map((h) =>
        this.cleanFieldValue(h)
          .replace(/^["']|["']$/g, '')
          .toLowerCase(),
      );

      const rows: Record<string, any>[] = [];
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i]
          .split(/[,;\t]/)
          .map((p) => this.cleanFieldValue(p).replace(/^["']|["']$/g, ''));
        if (parts.some((p) => p.length > 0)) {
          const rowData: Record<string, any> = {};
          headers.forEach((h, idx) => {
            if (h) rowData[h] = parts[idx] ?? '';
          });
          rows.push(rowData);
        }
      }
      return rows;
    }

    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(buffer as any);
    } catch {
      throw new BadRequestException(
        'تعذر قراءة ملف Excel. احفظه بصيغة XLSX أو CSV ثم أعد الرفع / Could not read the workbook. Save it as XLSX or CSV and upload again',
      );
    }
    const sheet = workbook.worksheets[0];
    if (!sheet || sheet.rowCount <= 1) return [];

    const rows: Record<string, any>[] = [];
    let headers: string[] = [];

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        const values = row.values as any[];
        headers = (Array.isArray(values) ? values.slice(1) : []).map((v) =>
          this.cleanFieldValue(v).toLowerCase(),
        );
        return;
      }

      const values = row.values as any[];
      if (!Array.isArray(values)) return;

      const rowData: Record<string, any> = {};
      let hasData = false;
      headers.forEach((h, idx) => {
        if (!h) return;
        const cell = values[idx + 1];
        if (cell !== undefined && cell !== null && String(cell).trim() !== '') {
          hasData = true;
          rowData[h] = typeof cell === 'object' && cell.text ? cell.text : cell;
        }
      });

      if (hasData) {
        rows.push(rowData);
      }
    });

    return rows;
  }

  /**
   * Get enrolled students count for a course, optionally filtered by academic year & semester.
   */
  async getCourseEnrollmentsCount(
    courseId: string,
    options: { academicYear?: string; semester?: string } = {},
  ): Promise<{
    courseId: string;
    courseCode: string;
    courseName: string;
    enrolledCount: number;
    academicYear?: string;
    semester?: string;
  }> {
    const course = await this.findOne(courseId);
    const codeUpper = course.code.toUpperCase();
    const codeLower = course.code.toLowerCase();

    const query: Record<string, any> = {
      courses: { $in: [codeUpper, course.code, codeLower] },
    };
    if (options.academicYear && options.academicYear !== 'all') {
      query.academicYear = options.academicYear;
    }
    if (options.semester && options.semester !== 'all') {
      query.semester = options.semester;
    }

    const enrolledCount =
      await this.courseRegistrationModel.countDocuments(query);

    return {
      courseId: course._id.toString(),
      courseCode: course.code,
      courseName: course.name,
      enrolledCount,
      academicYear: options.academicYear,
      semester: options.semester,
    };
  }

  /**
   * Reset and remove all student registrations/enrollments for a specific course.
   * Useful when an administrator uploads wrong enrollment data.
   */
  async resetCourseEnrollments(
    courseId: string,
    options: { academicYear?: string; semester?: string } = {},
  ): Promise<{
    success: boolean;
    courseId: string;
    courseCode: string;
    courseName: string;
    resetCount: number;
    message: string;
  }> {
    const course = await this.findOne(courseId);
    const codeUpper = course.code.toUpperCase();
    const codeLower = course.code.toLowerCase();
    const courseCreditHours = course.creditHours || 3;

    const query: Record<string, any> = {
      courses: { $in: [codeUpper, course.code, codeLower] },
    };
    if (options.academicYear && options.academicYear !== 'all') {
      query.academicYear = options.academicYear;
    }
    if (options.semester && options.semester !== 'all') {
      query.semester = options.semester;
    }

    // Find all registrations containing this course
    const matchingRegistrations = await this.courseRegistrationModel
      .find(query)
      .select('_id studentId courses totalCreditHours source')
      .lean();

    if (matchingRegistrations.length === 0) {
      return {
        success: true,
        courseId: course._id.toString(),
        courseCode: course.code,
        courseName: course.name,
        resetCount: 0,
        message: 'لا توجد تسجيلات طلاب لهذا المقرر في الفترة المحددة',
      };
    }

    const bulkOps: any[] = [];
    for (const reg of matchingRegistrations) {
      const remainingCourses = (reg.courses || []).filter(
        (c: string) =>
          c.toUpperCase() !== codeUpper && c.toLowerCase() !== codeLower,
      );

      // If registration was auto-created by system and now has 0 courses, delete it
      if (remainingCourses.length === 0 && reg.source === 'system') {
        bulkOps.push({
          deleteOne: {
            filter: { _id: reg._id },
          },
        });
      } else {
        const newCreditHours = Math.max(
          0,
          (reg.totalCreditHours || 0) - courseCreditHours,
        );
        bulkOps.push({
          updateOne: {
            filter: { _id: reg._id },
            update: {
              $pull: {
                courses: { $in: [codeUpper, course.code, codeLower] },
              },
              $set: { totalCreditHours: newCreditHours },
            },
          },
        });
      }
    }

    if (bulkOps.length > 0) {
      await this.courseRegistrationModel.bulkWrite(bulkOps, { ordered: false });
    }

    // Clear caches
    await this.cacheService?.delPattern('courses:*');
    void this.cacheService?.delPattern('registrations:*');

    return {
      success: true,
      courseId: course._id.toString(),
      courseCode: course.code,
      courseName: course.name,
      resetCount: matchingRegistrations.length,
      message: `تم إلغاء وتصفير تسجيل ${matchingRegistrations.length} طالب من مقرر ${course.code} بنجاح`,
    };
  }

  /**
   * Get all students enrolled in a specific course with profile details.
   */
  async getCourseEnrolledStudents(
    courseId: string,
    options: { academicYear?: string; semester?: string; search?: string } = {},
  ) {
    const course = await this.findOne(courseId);
    const codeUpper = course.code.toUpperCase();
    const codeLower = course.code.toLowerCase();

    const query: Record<string, any> = {
      courses: { $in: [codeUpper, course.code, codeLower] },
    };
    if (options.academicYear && options.academicYear !== 'all') {
      query.academicYear = options.academicYear;
    }
    if (options.semester && options.semester !== 'all') {
      query.semester = options.semester;
    }

    const registrations = await this.courseRegistrationModel
      .find(query)
      .sort({ createdAt: -1 })
      .lean();

    const studentUserIds = [...new Set(registrations.map((r) => r.studentId))];

    const profiles = await this.studentProfileModel
      .find({ userId: { $in: studentUserIds } })
      .lean();
    const profileMap = new Map(profiles.map((p) => [p.userId.toString(), p]));

    const users = await this.userModel
      .find({ _id: { $in: studentUserIds } })
      .select('name email studentCode nationalIdMasked phone')
      .lean();
    const userMap = new Map(users.map((u) => [u._id.toString(), u]));

    let students = registrations.map((reg) => {
      const sId = reg.studentId.toString();
      const profile = profileMap.get(sId);
      const user = userMap.get(sId);

      return {
        registrationId: reg._id.toString(),
        studentId: sId,
        studentCode: profile?.studentCode || user?.studentCode || '',
        name: profile?.fullName || user?.name || '',
        nameAr: profile?.fullNameAr || profile?.fullName || user?.name || '',
        level: profile?.level || '',
        department: profile?.department || '',
        group: profile?.group || '',
        section: profile?.section || '',
        academicEmail: profile?.academicEmail || user?.email || '',
        nationalIdMasked:
          profile?.nationalIdMasked || user?.nationalIdMasked || '',
        status: reg.status,
        enrolledAt: (reg as any).createdAt,
      };
    });

    if (options.search?.trim()) {
      const q = options.search.trim().toLowerCase();
      students = students.filter(
        (s) =>
          s.studentCode.toLowerCase().includes(q) ||
          s.name.toLowerCase().includes(q) ||
          s.nameAr.toLowerCase().includes(q) ||
          s.department.toLowerCase().includes(q) ||
          s.group.toLowerCase().includes(q) ||
          s.section.toLowerCase().includes(q) ||
          s.academicEmail.toLowerCase().includes(q),
      );
    }

    return {
      course: {
        id: course._id.toString(),
        code: course.code,
        name: course.name,
        nameAr: course.nameAr,
        nameEn: course.nameEn,
        creditHours: course.creditHours,
        department: course.department,
        level: course.level,
      },
      totalEnrolled: registrations.length,
      filteredCount: students.length,
      academicYear: options.academicYear,
      semester: options.semester,
      students,
    };
  }

  /**
   * Export all students enrolled in a course as a beautifully styled Excel (.xlsx) file.
   */
  async exportCourseEnrolledStudents(
    courseId: string,
    options: { academicYear?: string; semester?: string } = {},
  ): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    const data = await this.getCourseEnrolledStudents(courseId, options);
    const { course, students } = data;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Student Portal';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Enrolled Students', {
      views: [{ rightToLeft: true }],
    });

    // Title Row
    const titleRow = sheet.addRow([
      `كشف الطلاب المسجلين لمقرر: ${course.code} - ${course.nameAr || course.name}`,
    ]);
    titleRow.font = {
      name: 'Segoe UI',
      size: 14,
      bold: true,
      color: { argb: 'FFFFFFFF' },
    };
    titleRow.alignment = { horizontal: 'center', vertical: 'middle' };
    titleRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0D9488' },
    };
    sheet.mergeCells(1, 1, 1, 10);
    titleRow.height = 36;

    // Meta Row
    const metaRow = sheet.addRow([
      `عدد الطلاب: ${students.length} | الساعات المعتمدة: ${course.creditHours} | المستوى: ${course.level || 'عام'} | تاريخ الاستخراج: ${new Date().toLocaleDateString('ar-EG')}`,
    ]);
    metaRow.font = {
      name: 'Segoe UI',
      size: 10,
      italic: true,
      color: { argb: 'FF334155' },
    };
    metaRow.alignment = { horizontal: 'center', vertical: 'middle' };
    metaRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF1F5F9' },
    };
    sheet.mergeCells(2, 1, 2, 10);
    metaRow.height = 24;

    // Blank row
    sheet.addRow([]);

    // Table Headers
    const headers = [
      'م',
      'كود الطالب',
      'اسم الطالب',
      'المستوى الدراسي',
      'القسم / التخصص',
      'المجموعة',
      'السكشن',
      'البريد الأكاديمي',
      'الرقم القومي',
      'تاريخ التسجيل',
    ];

    const headerRow = sheet.addRow(headers);
    headerRow.font = {
      name: 'Segoe UI',
      size: 11,
      bold: true,
      color: { argb: 'FFFFFFFF' },
    };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F766E' },
    };
    headerRow.height = 28;

    // Add Data Rows
    students.forEach((s, index) => {
      const regDate = s.enrolledAt
        ? new Date(s.enrolledAt).toLocaleDateString('ar-EG')
        : '—';

      const row = sheet.addRow([
        index + 1,
        s.studentCode,
        s.nameAr || s.name,
        s.level ? `المستوى ${s.level}` : '—',
        s.department || 'عام',
        s.group || '—',
        s.section || '—',
        s.academicEmail || '—',
        s.nationalIdMasked || '—',
        regDate,
      ]);

      row.font = { name: 'Segoe UI', size: 10 };
      row.alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(3).alignment = { horizontal: 'right', vertical: 'middle' };
      row.getCell(8).alignment = { horizontal: 'left', vertical: 'middle' };

      if (index % 2 === 1) {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8FAFC' },
        };
      }
      row.height = 22;
    });

    // Auto-fit column widths
    const colWidths = [6, 16, 32, 16, 20, 14, 12, 30, 18, 16];
    colWidths.forEach((w, i) => {
      sheet.getColumn(i + 1).width = w;
    });

    for (let r = 4; r <= 4 + students.length; r++) {
      const row = sheet.getRow(r);
      for (let c = 1; c <= 10; c++) {
        row.getCell(c).border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };
      }
    }

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const sanitizedCode = course.code.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `enrolled_students_${sanitizedCode}.xlsx`;

    return {
      buffer,
      filename,
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }
}
