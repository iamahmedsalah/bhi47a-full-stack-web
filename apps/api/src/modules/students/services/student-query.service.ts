import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, FilterQuery } from 'mongoose';
import {
  StudentProfile,
  StudentProfileDocument,
} from '../schemas/student-profile.schema';
import {
  CourseRegistration,
  CourseRegistrationDocument,
} from '../../registrations/schemas/course-registration.schema';
import {
  RegistrationTerm,
  RegistrationTermDocument,
} from '../../registrations/schemas/registration-term.schema';
import {
  AdvisingCase,
  AdvisingCaseDocument,
} from '../../academic-advising/schemas/advising-case.schema';
import {
  StudentAcademicProfile,
  StudentAcademicProfileDocument,
} from '../../registrations/schemas/student-academic-profile.schema';
import {
  Course,
  type CourseDocument,
} from '../../courses/schemas/course.schema';
import { isRegistrationTermCurrentlyOpen } from '../../registrations/utils/registration-term.util';
import { SearchStudentQuery } from '../dto/student.dto';
import {
  buildPaginationOptions,
  createPaginatedResult,
} from '../../../common/utils/pagination.util';
import { normalizeSearchTerm } from '../../../common/utils/search.util';

import { PERMISSIONS } from '@student-portal/shared';
import type { AuthenticatedUser } from '../../auth/types/authenticated-request';

@Injectable()
export class StudentQueryService {
  constructor(
    @InjectModel(StudentProfile.name)
    private readonly studentProfileModel: Model<StudentProfileDocument>,
    @InjectModel(CourseRegistration.name)
    private readonly registrationModel: Model<CourseRegistrationDocument>,
    @InjectModel(RegistrationTerm.name)
    private readonly registrationTermModel: Model<RegistrationTermDocument>,
    @InjectModel(AdvisingCase.name)
    private readonly advisingCaseModel: Model<AdvisingCaseDocument>,
    @InjectModel(StudentAcademicProfile.name)
    private readonly academicProfileModel: Model<StudentAcademicProfileDocument>,
    @InjectModel(Course.name)
    private readonly courseModel: Model<CourseDocument>,
  ) {}

  private async getDoctorStudentUserIds(
    doctorIdStr: string,
  ): Promise<Types.ObjectId[]> {
    if (!Types.ObjectId.isValid(doctorIdStr)) return [];
    const doctorObjId = new Types.ObjectId(doctorIdStr);
    const courses = (await this.courseModel
      .find({
        $or: [
          { doctorId: doctorObjId },
          { doctorIds: doctorObjId },
          { teachingAssistantIds: doctorObjId },
        ],
        isActive: true,
      })
      .select('code _id')
      .lean()) as unknown as Array<{ _id: Types.ObjectId; code: string }>;

    if (!courses || courses.length === 0) return [];

    const courseCodes = courses.map((c) => String(c.code).toUpperCase());
    const courseIdStrs = courses.map((c) => c._id.toString());
    const allMatches = [...courseCodes, ...courseIdStrs];

    const registrations = await this.registrationModel
      .find({
        status: { $in: ['approved', 'pending'] },
        courses: { $in: allMatches },
      })
      .select('studentId')
      .lean();

    const userIds = registrations
      .map((r) => r.studentId)
      .filter((id): id is Types.ObjectId => Boolean(id));

    return Array.from(new Set(userIds.map((id) => id.toString()))).map(
      (idStr) => new Types.ObjectId(idStr),
    );
  }

  buildFilter(
    query: SearchStudentQuery,
    doctorStudentUserIds?: Types.ObjectId[],
  ): FilterQuery<StudentProfileDocument> {
    const filter: FilterQuery<StudentProfileDocument> = {};

    if (doctorStudentUserIds !== undefined) {
      filter.userId = { $in: doctorStudentUserIds };
    }

    if (query.search) {
      const search = normalizeSearchTerm(query.search);
      // Generate Arabic-variant tolerant regex:
      // Unify alef forms (ا, أ, إ, آ), taa marbuta/haa (ة, ه), and yaa/alef maksura (ي, ى)
      const arabicTolerant = search
        .replace(/[اأإآ]/g, '[اأإآ]')
        .replace(/[ةه]/g, '[ةه]')
        .replace(/[يى]/g, '[يى]');

      filter.$or = [
        { studentCode: { $regex: search, $options: 'i' } },
        { fullName: { $regex: arabicTolerant, $options: 'i' } },
        { fullNameAr: { $regex: arabicTolerant, $options: 'i' } },
        { fullNameEn: { $regex: search, $options: 'i' } },
        { seatNumber: { $regex: search, $options: 'i' } },
        { academicEmail: { $regex: search, $options: 'i' } },
        ...(search.replace(/\D/g, '').length >= 3
          ? [{ nationalId: { $regex: search, $options: 'i' } }]
          : []),
      ];
    }

    if (query.level && query.level !== 'all') {
      filter.level = query.level;
    }

    if (query.department && query.department !== 'all') {
      const dept = query.department.trim();
      if (dept === 'GENERAL' || dept === 'عام' || dept === 'الشعبة العامة') {
        filter.department = {
          $in: ['GENERAL', 'عام', 'الشعبة العامة', '', null],
        };
      } else if (
        dept === 'BIS' ||
        dept.includes('BIS') ||
        dept.includes('نظم')
      ) {
        filter.department = { $regex: /BIS|نظم معلومات/i } as any;
      } else if (
        dept === 'ACCOUNTING' ||
        dept.includes('ACCOUNTING') ||
        dept.includes('محاسب')
      ) {
        filter.department = { $regex: /ACCOUNTING|محاسب/i } as any;
      } else {
        filter.department = dept;
      }
    }

    const effectiveStatus =
      query.enrollmentStatus && query.enrollmentStatus !== 'all'
        ? query.enrollmentStatus
        : query.status && query.status !== 'all'
          ? query.status
          : undefined;

    if (effectiveStatus) {
      filter.enrollmentStatus = effectiveStatus;
    }

    if (
      query.isBlocked !== undefined &&
      query.isBlocked !== 'all' &&
      query.isBlocked !== ''
    ) {
      filter.isBlocked = query.isBlocked === true || query.isBlocked === 'true';
    }

    if (
      query.tuitionFeesStatus &&
      query.tuitionFeesStatus !== 'all' &&
      query.tuitionFeesStatus !== ''
    ) {
      filter.tuitionFeesStatus = query.tuitionFeesStatus;
    }

    return filter;
  }

  async getExportCursor(query: SearchStudentQuery, caller?: AuthenticatedUser) {
    let doctorStudentUserIds: Types.ObjectId[] | undefined = undefined;
    if (
      caller?.role === 'staff' &&
      ((caller as any)?.staffType === 'doctor' ||
        (caller as any)?.staffType === 'teaching_assistant')
    ) {
      doctorStudentUserIds = await this.getDoctorStudentUserIds(caller._id);
    }
    const filter = this.buildFilter(query, doctorStudentUserIds);
    const sortField =
      query.sortBy === 'createdAt' ? 'createdAt' : 'studentCode';
    const sortDir: 1 | -1 = query.sortOrder === 'desc' ? -1 : 1;

    return this.studentProfileModel
      .find(filter)
      .read('secondaryPreferred')
      .select(
        'studentCode fullName fullNameAr fullNameEn level department academicEmail enrollmentStatus group section seatNumber examRoom',
      )
      .sort({ [sortField]: sortDir })
      .lean()
      .cursor({ batchSize: 1000 });
  }

  async findAll(query: SearchStudentQuery, caller?: AuthenticatedUser) {
    const { page, limit, skip } = buildPaginationOptions(query);

    const canViewNationalId = Boolean(
      caller?.role === 'admin' ||
      caller?.permissions?.includes(PERMISSIONS.STUDENTS_VIEW_NATIONAL_ID),
    );

    let doctorStudentUserIds: Types.ObjectId[] | undefined = undefined;
    if (
      caller?.role === 'staff' &&
      ((caller as any)?.staffType === 'doctor' ||
        (caller as any)?.staffType === 'teaching_assistant')
    ) {
      doctorStudentUserIds = await this.getDoctorStudentUserIds(caller._id);
    }

    const filter = this.buildFilter(query, doctorStudentUserIds);

    const sortField =
      query.sortBy === 'studentCode' ? 'studentCode' : 'createdAt';
    const sortDir: 1 | -1 =
      query.sortOrder === 'asc'
        ? 1
        : query.sortOrder === 'desc'
          ? -1
          : query.sortBy === 'studentCode'
            ? 1
            : -1;

    // Strict projection: Only include nationalId if caller is authorized.
    // If unauthorized, nationalId is completely excluded from database projection.
    const projection = canViewNationalId ? '+nationalId' : '-nationalId';
    const userPopulateSelect = canViewNationalId
      ? 'isActive +nationalId lastLoginAt mustChangePassword phone'
      : 'isActive lastLoginAt mustChangePassword phone';

    const [items, total] = await Promise.all([
      this.studentProfileModel
        .find(filter)
        .read('secondaryPreferred')
        .select(projection)
        .populate('userId', userPopulateSelect)
        .sort({ [sortField]: sortDir })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.studentProfileModel.countDocuments(filter),
    ]);

    const enrichedItems = await this.attachRegistrationSummaries(
      items,
      canViewNationalId,
    );
    return createPaginatedResult(enrichedItems, total, page, limit);
  }

  async findById(id: string, caller?: AuthenticatedUser) {
    const canViewNationalId = Boolean(
      caller?.role === 'admin' ||
      caller?.permissions?.includes(PERMISSIONS.STUDENTS_VIEW_NATIONAL_ID),
    );

    const projection = canViewNationalId ? '+nationalId' : '-nationalId';
    const userPopulateSelect = canViewNationalId
      ? 'isActive +nationalId lastLoginAt mustChangePassword phone'
      : 'isActive lastLoginAt mustChangePassword phone';

    const profile = await this.studentProfileModel
      .findById(id)
      .select(projection)
      .populate('userId', userPopulateSelect)
      .lean();

    if (!profile) {
      throw new NotFoundException('الطالب غير موجود');
    }

    const [enriched] = await this.attachRegistrationSummaries(
      [profile],
      canViewNationalId,
    );
    return enriched;
  }

  private getProfileUserId(
    profile: Record<string, any>,
  ): Types.ObjectId | null {
    const rawUserId = profile?.userId?._id ?? profile?.userId;
    if (!rawUserId) return null;
    if (rawUserId instanceof Types.ObjectId) return rawUserId;
    if (typeof rawUserId === 'string' && Types.ObjectId.isValid(rawUserId)) {
      return new Types.ObjectId(rawUserId);
    }
    return null;
  }

  private async attachRegistrationSummaries<T extends Record<string, any>>(
    profiles: T[],
    canViewNationalId: boolean = false,
  ): Promise<Array<T & { registrationSummary: Record<string, unknown> }>> {
    if (profiles.length === 0) return [];

    const userIds = profiles
      .map((profile) => this.getProfileUserId(profile))
      .filter((id): id is Types.ObjectId => Boolean(id));

    if (userIds.length === 0) {
      return profiles.map((p) => {
        const rest = { ...(p as any) };
        delete rest.nationalIdMasked;
        if (rest.userId && typeof rest.userId === 'object') {
          delete rest.userId.nationalIdMasked;
        }

        let nationalIdValue: string | undefined = undefined;
        if (canViewNationalId) {
          nationalIdValue = p.nationalId || p.userId?.nationalId;
        } else {
          delete rest.nationalId;
          if (rest.userId && typeof rest.userId === 'object') {
            delete rest.userId.nationalId;
          }
        }

        return {
          ...rest,
          ...(canViewNationalId && nationalIdValue
            ? { nationalId: nationalIdValue }
            : {}),
          registrationSummary: {
            isTermOpen: false,
            status: 'none',
            courseCount: 0,
            totalCreditHours: 0,
            advisingStatus: 'none',
          },
        };
      });
    }

    const currentTerms = await this.registrationTermModel
      .find({ isCurrent: true })
      .sort({ updatedAt: -1, academicYear: -1 })
      .limit(3)
      .lean();

    const activeTerm =
      currentTerms.find((term) => isRegistrationTermCurrentlyOpen(term)) ??
      currentTerms[0];

    const termFilter = activeTerm
      ? {
          academicYear: activeTerm.academicYear,
          semester: activeTerm.semester,
        }
      : null;

    const [registrations, advisingCases, academicProfiles] = await Promise.all([
      termFilter
        ? this.registrationModel
            .find({ studentId: { $in: userIds }, ...termFilter })
            .select(
              'studentId academicYear semester status courses totalCreditHours',
            )
            .lean()
        : Promise.resolve([]),
      termFilter
        ? this.advisingCaseModel
            .find({ studentId: { $in: userIds }, ...termFilter })
            .select('studentId status')
            .lean()
        : Promise.resolve([]),
      this.academicProfileModel
        .find({ studentId: { $in: userIds } })
        .select(
          'studentId gpa academicWarnings completedCourses failedCourses completedCreditHours',
        )
        .lean(),
    ]);

    const registrationByStudent = new Map(
      registrations.map((registration) => [
        registration.studentId.toString(),
        registration,
      ]),
    );
    const advisingByStudent = new Map(
      advisingCases.map((advisingCase) => [
        advisingCase.studentId.toString(),
        advisingCase,
      ]),
    );
    const academicByStudent = new Map(
      academicProfiles.map((ap) => [ap.studentId.toString(), ap]),
    );

    return profiles.map((profile) => {
      const key = this.getProfileUserId(profile)?.toHexString() ?? '';
      const registration = registrationByStudent.get(key);
      const advisingCase = advisingByStudent.get(key);
      const academicProfile = academicByStudent.get(key);

      const registrationSummary = {
        academicYear: registration?.academicYear ?? activeTerm?.academicYear,
        semester: registration?.semester ?? activeTerm?.semester,
        isTermOpen: activeTerm
          ? isRegistrationTermCurrentlyOpen(activeTerm)
          : false,
        status: registration?.status ?? 'none',
        registrationId: registration?._id?.toString(),
        courseCount: registration?.courses?.length ?? 0,
        totalCreditHours: registration?.totalCreditHours ?? 0,
        advisingCaseId: advisingCase?._id?.toString(),
        advisingStatus: advisingCase?.status ?? 'none',
      };

      const restProfile = { ...(profile as any) };
      delete restProfile.nationalIdMasked;
      if (restProfile.userId && typeof restProfile.userId === 'object') {
        delete restProfile.userId.nationalIdMasked;
      }

      let nationalIdValue: string | undefined = undefined;
      if (canViewNationalId) {
        nationalIdValue = profile.nationalId || profile.userId?.nationalId;
      } else {
        delete restProfile.nationalId;
        if (restProfile.userId && typeof restProfile.userId === 'object') {
          delete restProfile.userId.nationalId;
        }
      }

      const completedCreditHours =
        academicProfile?.completedCreditHours ??
        (academicProfile?.completedCourses?.length
          ? academicProfile.completedCourses.length * 3
          : 0);

      return {
        ...restProfile,
        ...(canViewNationalId && nationalIdValue
          ? { nationalId: nationalIdValue }
          : {}),
        registrationSummary,
        academicProfile: academicProfile
          ? {
              gpa: academicProfile.gpa,
              academicWarnings: academicProfile.academicWarnings,
              completedCourses: academicProfile.completedCourses,
              failedCourses: academicProfile.failedCourses,
              completedCreditHours,
            }
          : undefined,
        completedCreditHours,
        gpa: academicProfile?.gpa ?? profile.gpa,
        academicWarnings:
          academicProfile?.academicWarnings ?? profile.academicWarnings,
      };
    });
  }
}
