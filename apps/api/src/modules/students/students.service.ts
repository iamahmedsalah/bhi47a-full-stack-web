import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  StudentProfile,
  StudentProfileDocument,
} from './schemas/student-profile.schema';
import { UsersService } from '../users/users.service';
import { EmailsService } from '../emails/emails.service';
import { renderPasswordResetEmailTemplate } from '../emails/templates/email-template.builder';
import * as ExcelJS from 'exceljs';
import {
  CreateStudentDto,
  UpdateStudentDto,
  SearchStudentQuery,
  ResetPasswordDto,
  UpdateMyContactDto,
} from './dto/student.dto';
import {
  UpdateTuitionStatusDto,
  BulkToggleTuitionDto,
  QueryTuitionStatusDto,
} from './dto/tuition-status.dto';
import { normalizeSearchTerm } from '../../common/utils/search.util';
import {
  CourseRegistration,
  CourseRegistrationDocument,
} from '../registrations/schemas/course-registration.schema';
import {
  RegistrationTerm,
  RegistrationTermDocument,
} from '../registrations/schemas/registration-term.schema';
import {
  AdvisingCase,
  AdvisingCaseDocument,
} from '../academic-advising/schemas/advising-case.schema';
import {
  AcademicEmail,
  AcademicEmailDocument,
} from '../academic-emails/schemas/academic-email.schema';
import {
  StudentAcademicProfile,
  type StudentAcademicProfileDocument,
} from '../registrations/schemas/student-academic-profile.schema';
import { StudentQueryService } from './services/student-query.service';

@Injectable()
export class StudentsService {
  constructor(
    @InjectModel(StudentProfile.name)
    private studentProfileModel: Model<StudentProfileDocument>,
    @InjectModel(CourseRegistration.name)
    private registrationModel: Model<CourseRegistrationDocument>,
    @InjectModel(RegistrationTerm.name)
    private registrationTermModel: Model<RegistrationTermDocument>,
    @InjectModel(AdvisingCase.name)
    private advisingCaseModel: Model<AdvisingCaseDocument>,
    @InjectModel(AcademicEmail.name)
    private academicEmailModel: Model<AcademicEmailDocument>,
    @InjectModel(StudentAcademicProfile.name)
    private academicProfileModel: Model<StudentAcademicProfileDocument>,
    private usersService: UsersService,
    private emailsService: EmailsService,
    private readonly studentQueryService: StudentQueryService,
  ) {}

  private cachedStats: { data: any; expiresAt: number } | null = null;
  private static readonly STATS_CACHE_TTL_MS = 300_000; // 5 minutes cache

  invalidateStatsCache() {
    this.cachedStats = null;
  }

  async create(dto: CreateStudentDto) {
    // Check if student code already exists
    const existing = await this.usersService.findByStudentCode(dto.studentCode);
    if (existing) {
      throw new ConflictException('كود الطالب موجود بالفعل'); // Student code already exists
    }

    const resolvedFullName =
      dto.fullName || dto.fullNameAr || dto.fullNameEn || 'Student';
    const fullNameAr =
      dto.fullNameAr ||
      (/[\u0600-\u06FF]/.test(resolvedFullName) ? resolvedFullName : undefined);
    const fullNameEn =
      dto.fullNameEn ||
      (!/[\u0600-\u06FF]/.test(resolvedFullName)
        ? resolvedFullName
        : undefined);

    // Create user account (nationalId is the initial password)
    const user = await this.usersService.createUser({
      role: 'student',
      name: resolvedFullName,
      studentCode: dto.studentCode,
      password: dto.nationalId,
      nationalId: dto.nationalId,
      email: dto.academicEmail,
      phone: dto.phone,
      mustChangePassword: dto.mustChangePassword ?? false,
    });

    // Department auto-rule: Levels 1 & 2 -> GENERAL; Level 3+ default -> BIS
    let resolvedDepartment = dto.department;
    if (dto.level === '1' || dto.level === '2') {
      resolvedDepartment = 'GENERAL';
    } else if (dto.level === '3' || dto.level === '4') {
      if (
        !resolvedDepartment ||
        resolvedDepartment === 'GENERAL' ||
        resolvedDepartment === 'General'
      ) {
        resolvedDepartment = 'BIS';
      }
    }

    // Create student profile
    const profile = new this.studentProfileModel({
      userId: user._id,
      studentCode: dto.studentCode,
      fullName: resolvedFullName,
      fullNameAr,
      fullNameEn,
      nationalIdMasked: user.nationalIdMasked,
      nationalId: dto.nationalId,
      department: resolvedDepartment,
      level: dto.level,
      group: dto.group,
      section: dto.section,
      academicYear: dto.academicYear,
      semester: dto.semester,
      enrollmentStatus: dto.enrollmentStatus || 'active',
      seatNumber: dto.seatNumber,
      academicEmail: dto.academicEmail,
      examRoom: dto.examRoom,
      examFloor: dto.examFloor,
      examBuilding: dto.examBuilding,
    });

    await profile.save();

    const academicEmail =
      dto.academicEmail?.trim() || `${dto.studentCode}.bhi47@bhiasc.org`;
    await this.academicEmailModel.updateOne(
      { studentCode: dto.studentCode },
      {
        $set: {
          studentCode: dto.studentCode,
          studentName: dto.fullName,
          academicEmail,
          status: 'active',
          studentId: user._id,
        },
      },
      { upsert: true },
    );

    this.invalidateStatsCache();

    return {
      user: {
        _id: user._id,
        name: user.name,
        studentCode: user.studentCode,
        isActive: user.isActive,
      },
      profile,
    };
  }

  async findAll(query: SearchStudentQuery, caller?: any) {
    return this.studentQueryService.findAll(query, caller);
  }

  async findById(id: string, caller?: any) {
    return this.studentQueryService.findById(id, caller);
  }

  async findByUserId(userId: string): Promise<Record<string, any>> {
    const user = await this.usersService.findById(userId);
    let profile = await this.studentProfileModel.findOne({
      $or: [
        { userId: new Types.ObjectId(userId) },
        ...(user?.studentCode ? [{ studentCode: user.studentCode }] : []),
      ],
    });

    if (!profile) {
      profile = await this.studentProfileModel.create({
        userId: new Types.ObjectId(userId),
        studentCode: user.studentCode ?? user.userCode ?? userId,
        fullName: user.name ?? 'Student',
        nationalId: user.nationalId ?? '00000000000000',
        academicYear: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
        level: '1',
        semester: 'first',
        enrollmentStatus: 'active',
      });
    } else if (!profile.userId || profile.userId.toString() !== userId) {
      profile.userId = new Types.ObjectId(userId);
      await profile.save();
    }

    const profileObj =
      typeof (profile as any).toObject === 'function'
        ? (profile as any).toObject()
        : profile;

    return {
      ...profileObj,
      email: user.email ?? '',
      phone: user.phone ?? '',
      googleEmail: user.googleEmail ?? '',
      googleLinkedAt: user.googleLinkedAt,
      googleLinkPending: user.googleLinkPending ?? false,
    };
  }

  async findUserIdsBySearch(search: string) {
    const normalized = normalizeSearchTerm(search);
    const profiles = await this.studentProfileModel
      .find({
        $or: [
          { studentCode: { $regex: normalized, $options: 'i' } },
          { fullName: { $regex: normalized, $options: 'i' } },
          { nationalId: { $regex: normalized, $options: 'i' } },
        ],
      })
      .select('userId')
      .lean();
    return profiles.map((profile) => profile.userId);
  }

  async updateMyContact(
    userId: string,
    dto: UpdateMyContactDto,
  ): Promise<Record<string, any>> {
    await this.usersService.updateStudentContact(userId, dto);
    return this.findByUserId(userId);
  }

  async update(id: string, dto: UpdateStudentDto) {
    const { nationalId, mustChangePassword, ...profileUpdates } = dto;
    const effectiveFullName = dto.fullName || dto.fullNameAr || dto.fullNameEn;
    if (effectiveFullName) {
      profileUpdates.fullName = effectiveFullName;
    }
    if (dto.fullNameAr !== undefined) {
      profileUpdates.fullNameAr = dto.fullNameAr;
    }
    if (dto.fullNameEn !== undefined) {
      profileUpdates.fullNameEn = dto.fullNameEn;
    }

    const profile = await this.studentProfileModel.findByIdAndUpdate(
      id,
      { $set: profileUpdates },
      { new: true },
    );
    if (!profile) {
      throw new NotFoundException('الطالب غير موجود');
    }

    // Also update the user name if fullName or bilingual names changed
    if (effectiveFullName) {
      await this.usersService
        .findById(profile.userId.toString())
        .then((user) => {
          user.name = effectiveFullName;
          return user.save();
        });
    }

    if (nationalId) {
      const user = await this.usersService.updateNationalId(
        profile.userId.toString(),
        nationalId,
      );
      profile.nationalIdMasked = user.nationalIdMasked;
      profile.nationalId = nationalId;
      await profile.save();
    }

    if (mustChangePassword !== undefined) {
      const user = await this.usersService.findById(profile.userId.toString());
      user.mustChangePassword = mustChangePassword;
      await user.save();
    }

    if (dto.enrollmentStatus === 'active') {
      await this.usersService.activateUser(profile.userId.toString());
    } else if (
      dto.enrollmentStatus === 'inactive' ||
      dto.enrollmentStatus === 'suspended'
    ) {
      await this.usersService.deactivateUser(profile.userId.toString());
    }

    if (dto.academicEmail || dto.fullName) {
      const email =
        dto.academicEmail?.trim() ||
        profile.academicEmail ||
        `${profile.studentCode}.bhi47@bhiasc.org`;
      await this.academicEmailModel.updateOne(
        { studentCode: profile.studentCode },
        {
          $set: {
            studentCode: profile.studentCode,
            studentName: profile.fullName,
            academicEmail: email,
            status: 'active',
            studentId: profile.userId,
          },
        },
        { upsert: true },
      );
    }

    this.invalidateStatsCache();
    return profile;
  }

  async activate(id: string) {
    const profile = await this.studentProfileModel.findById(id);
    if (!profile) {
      throw new NotFoundException('Ø§Ù„Ø·Ø§Ù„Ø¨ ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯');
    }

    profile.enrollmentStatus = 'active';
    await profile.save();
    await this.usersService.activateUser(profile.userId.toString());
    this.invalidateStatsCache();

    return { message: 'ØªÙ… ØªÙØ¹ÙŠÙ„ Ø­Ø³Ø§Ø¨ Ø§Ù„Ø·Ø§Ù„Ø¨' };
  }

  async deactivate(id: string) {
    const profile = await this.studentProfileModel.findById(id);
    if (!profile) {
      throw new NotFoundException('الطالب غير موجود');
    }

    profile.enrollmentStatus = 'inactive';
    await profile.save();

    await this.usersService.deactivateUser(profile.userId.toString());
    this.invalidateStatsCache();

    return { message: 'تم تعطيل حساب الطالب' }; // Student deactivated
  }

  async resetPassword(id: string, dto: ResetPasswordDto, _actor?: any) {
    const profile = await this.studentProfileModel
      .findById(id)
      .select('+nationalId');
    if (!profile) {
      throw new NotFoundException('الطالب غير موجود');
    }

    const user = await this.usersService.findByIdWithNationalId(
      profile.userId.toString(),
    );
    if (!user) {
      throw new NotFoundException('المستخدم غير موجود');
    }

    // Determine temporary password: provided explicitly or defaulted to student's 14-digit National ID
    let temporaryPassword = dto.newPassword?.trim();
    if (!temporaryPassword) {
      temporaryPassword = profile.nationalId || user.nationalId;
    }

    if (!temporaryPassword) {
      throw new BadRequestException({
        code: 'NATIONAL_ID_NOT_AVAILABLE',
        message:
          'لا يوجد رقم قومي محفوظ لهذا الطالب. اختر كلمة مرور مؤقتة مخصصة.',
      });
    }

    const mustChange = dto.mustChangePassword ?? true;

    // Update password, set mustChangePassword and increment tokenVersion (revoking old sessions)
    await this.usersService.updatePassword(
      profile.userId.toString(),
      temporaryPassword,
      mustChange,
    );

    const emailTo = profile.academicEmail || user.email;
    if (emailTo) {
      const isNationalIdDefault = !dto.newPassword?.trim();
      const displayPasswordHint =
        isNationalIdDefault || !dto.newPassword
          ? 'الرقم القومي الخاص بك (14 رقم)'
          : dto.newPassword;

      const emailHtml = renderPasswordResetEmailTemplate({
        greetingName: profile.fullName,
        studentCode: profile.studentCode,
        temporaryPassword: displayPasswordHint,
        loginUrl: `${process.env.APP_URL || 'https://bhi47a-support.vercel.app'}/ar/login`,
        lang: 'ar',
      });

      try {
        await this.emailsService.send({
          to: [emailTo],
          subject: 'بيانات الدخول الأكاديمية وكلمة المرور | بوابة الطالب',
          html: emailHtml,
        });
      } catch (emailErr) {
        console.warn(
          'Failed to send password reset email:',
          emailErr instanceof Error ? emailErr.message : emailErr,
        );
      }
    }

    return {
      message:
        'تمت إعادة تعيين كلمة المرور بنجاح وإلزام الطالب بتعيين كلمة مرور جديدة عند تسجيل الدخول',
      mustChangePassword: mustChange,
    };
  }

  async getStats() {
    const now = Date.now();
    if (this.cachedStats && this.cachedStats.expiresAt > now) {
      const [liveOnline, liveOnlineStaff] = await Promise.all([
        this.usersService.countActiveOnlineStudents(60),
        this.usersService.countActiveOnlineStaff(60),
      ]);
      this.cachedStats.data.liveOnline = Math.max(liveOnline ?? 0, 0);
      this.cachedStats.data.liveOnlineStaff = Math.max(liveOnlineStaff ?? 0, 0);
      return this.cachedStats.data;
    }

    if (typeof this.academicProfileModel?.aggregate !== 'function') {
      const [
        total,
        active,
        suspended,
        graduated,
        byLevel,
        allProfiles,
        academicProfiles,
        liveOnline,
        liveOnlineStaff,
      ] = await Promise.all([
        this.studentProfileModel.countDocuments(),
        this.studentProfileModel.countDocuments({ enrollmentStatus: 'active' }),
        this.studentProfileModel.countDocuments({
          enrollmentStatus: 'suspended',
        }),
        this.studentProfileModel.countDocuments({
          enrollmentStatus: 'graduated',
        }),
        this.studentProfileModel.aggregate
          ? this.studentProfileModel.aggregate([
              { $group: { _id: '$level', count: { $sum: 1 } } },
              { $sort: { _id: 1 } },
            ])
          : [],
        this.studentProfileModel
          .find({}, 'userId level department enrollmentStatus academicWarnings')
          .lean(),
        this.academicProfileModel
          .find({}, 'studentId gpa academicWarnings')
          .lean(),
        this.usersService.countActiveOnlineStudents(60),
        this.usersService.countActiveOnlineStaff(60),
      ]);

      const gpaMap = new Map<string, number>(
        (academicProfiles as any[]).map((ap: any) => [
          ap.studentId?.toString() ?? '',
          ap.gpa,
        ]),
      );

      let generalEnrolled = 0;
      let bisEnrolled = 0;
      let accEnrolled = 0;

      const cohortMap: Record<
        string,
        { total: number; active: number; probation: number; attrition: number }
      > = {
        '1': { total: 0, active: 0, probation: 0, attrition: 0 },
        '2': { total: 0, active: 0, probation: 0, attrition: 0 },
        '3': { total: 0, active: 0, probation: 0, attrition: 0 },
        '4': { total: 0, active: 0, probation: 0, attrition: 0 },
      };

      let probationCount = 0;
      let satisfactoryCount = 0;
      let goodCount = 0;
      let veryGoodCount = 0;
      let excellentCount = 0;
      let inactiveCount = 0;

      for (const p of allProfiles as any[]) {
        const lvl = String(p.level || '1');
        const status = String(p.enrollmentStatus || 'active');
        const userIdStr = p.userId?.toString() ?? '';
        const gpa = gpaMap.get(userIdStr) ?? 0;
        const warnings = p.academicWarnings || 0;
        const isProbation = gpa > 0 ? gpa < 2.0 : warnings > 0;
        const isAttrition = status === 'suspended' || status === 'inactive';

        if (status === 'inactive') inactiveCount += 1;
        if (!cohortMap[lvl]) {
          cohortMap[lvl] = { total: 0, active: 0, probation: 0, attrition: 0 };
        }
        cohortMap[lvl].total += 1;
        if (status === 'active') cohortMap[lvl].active += 1;
        if (isProbation) cohortMap[lvl].probation += 1;
        if (isAttrition) cohortMap[lvl].attrition += 1;

        const rawDept = (p.department || '').toUpperCase();
        if (lvl === '1' || lvl === '2') {
          generalEnrolled += 1;
        } else {
          if (rawDept.includes('ACC') || rawDept.includes('محاسب')) {
            accEnrolled += 1;
          } else {
            bisEnrolled += 1;
          }
        }

        if (gpa > 0) {
          if (gpa < 2.0) probationCount += 1;
          else if (gpa < 2.5) satisfactoryCount += 1;
          else if (gpa < 3.0) goodCount += 1;
          else if (gpa < 3.5) veryGoodCount += 1;
          else excellentCount += 1;
        }
      }

      const departments = [
        {
          department: 'General',
          nameAr: 'الشعبة العامة',
          nameEn: 'General Track (Years 1 & 2)',
          levels: ['1', '2'],
          enrolled: generalEnrolled,
        },
        {
          department: 'BIS',
          nameAr: 'نظم معلومات الأعمال (BIS)',
          nameEn: 'Business Information Systems',
          levels: ['3', '4'],
          enrolled: bisEnrolled,
        },
        {
          department: 'ACCOUNTING',
          nameAr: 'المحاسبة والمراجعة',
          nameEn: 'Accounting & Auditing',
          levels: ['3', '4'],
          enrolled: accEnrolled,
        },
      ];

      const cohortRetention = Object.entries(cohortMap).map(([lvl, data]) => ({
        level: lvl,
        total: data.total,
        active: data.active,
        probation: data.probation,
        attrition: data.attrition,
        retentionRate:
          data.total > 0 ? Math.round((data.active / data.total) * 100) : 100,
      }));

      const gpaDistribution = [
        {
          label: 'Probation (< 2.0)',
          labelAr: 'إنذار أكاديمي (< 2.0)',
          range: '< 2.0',
          count: probationCount,
        },
        {
          label: 'Satisfactory (2.0 - 2.49)',
          labelAr: 'مقبول (2.0 - 2.49)',
          range: '2.0 - 2.49',
          count: satisfactoryCount,
        },
        {
          label: 'Good (2.5 - 2.99)',
          labelAr: 'جيد (2.5 - 2.99)',
          range: '2.5 - 2.99',
          count: goodCount,
        },
        {
          label: 'Very Good (3.0 - 3.49)',
          labelAr: 'جيد جداً (3.0 - 3.49)',
          range: '3.0 - 3.49',
          count: veryGoodCount,
        },
        {
          label: 'Excellent (3.5 - 4.0)',
          labelAr: 'ممتاز (3.5 - 4.0)',
          range: '3.5 - 4.0',
          count: excellentCount,
        },
      ];

      const result = {
        total,
        active,
        suspended,
        graduated,
        withdrawn: inactiveCount,
        liveOnline: Math.max(liveOnline ?? 0, 0),
        liveOnlineStaff: Math.max(liveOnlineStaff ?? 0, 0),
        byLevel: ((byLevel as any[]) || []).map((item) => ({
          level: item._id || 'unknown',
          count: item.count,
        })),
        departments,
        cohortRetention,
        gpaDistribution,
      };

      this.cachedStats = {
        data: result,
        expiresAt: Date.now() + StudentsService.STATS_CACHE_TTL_MS,
      };

      return result;
    }

    const [profileGroups, gpaBuckets, liveOnline, liveOnlineStaff] =
      await Promise.all([
        this.studentProfileModel.aggregate<any>([
          {
            $group: {
              _id: {
                level: { $ifNull: ['$level', '1'] },
                status: { $ifNull: ['$enrollmentStatus', 'active'] },
                department: '$department',
              },
              count: { $sum: 1 },
              warningsCount: {
                $sum: { $cond: [{ $gt: ['$academicWarnings', 0] }, 1, 0] },
              },
            },
          },
        ]),
        this.academicProfileModel.aggregate<any>([
          { $match: { gpa: { $gt: 0 } } },
          {
            $bucket: {
              groupBy: '$gpa',
              boundaries: [0.001, 2.0, 2.5, 3.0, 3.5, 4.01],
              default: 'other',
              output: { count: { $sum: 1 } },
            },
          },
        ]),
        this.usersService.countActiveOnlineStudents(60),
        this.usersService.countActiveOnlineStaff(60),
      ]);

    let total = 0;
    let active = 0;
    let suspended = 0;
    let graduated = 0;
    let inactiveCount = 0;
    let generalEnrolled = 0;
    let bisEnrolled = 0;
    let accEnrolled = 0;

    const cohortMap: Record<
      string,
      { total: number; active: number; probation: number; attrition: number }
    > = {
      '1': { total: 0, active: 0, probation: 0, attrition: 0 },
      '2': { total: 0, active: 0, probation: 0, attrition: 0 },
      '3': { total: 0, active: 0, probation: 0, attrition: 0 },
      '4': { total: 0, active: 0, probation: 0, attrition: 0 },
    };

    const levelMap = new Map<string, number>();

    for (const g of profileGroups) {
      const lvl = String(g._id?.level || '1');
      const status = String(g._id?.status || 'active');
      const dept = String(g._id?.department || '').toUpperCase();
      const cnt = Number(g.count || 0);
      const warnings = Number(g.warningsCount || 0);
      const isAttrition = status === 'suspended' || status === 'inactive';

      total += cnt;
      if (status === 'active') active += cnt;
      if (status === 'suspended') suspended += cnt;
      if (status === 'graduated') graduated += cnt;
      if (status === 'inactive') inactiveCount += cnt;

      levelMap.set(lvl, (levelMap.get(lvl) ?? 0) + cnt);

      if (!cohortMap[lvl]) {
        cohortMap[lvl] = { total: 0, active: 0, probation: 0, attrition: 0 };
      }
      cohortMap[lvl].total += cnt;
      if (status === 'active') {
        cohortMap[lvl].active += cnt;
      }
      cohortMap[lvl].probation += warnings;
      if (isAttrition) {
        cohortMap[lvl].attrition += cnt;
      }

      if (lvl === '1' || lvl === '2') {
        generalEnrolled += cnt;
      } else {
        if (dept.includes('ACC') || dept.includes('محاسب')) {
          accEnrolled += cnt;
        } else {
          bisEnrolled += cnt;
        }
      }
    }

    let probationCount = 0;
    let satisfactoryCount = 0;
    let goodCount = 0;
    let veryGoodCount = 0;
    let excellentCount = 0;

    for (const b of gpaBuckets) {
      const val = Number(b._id);
      if (val < 2.0) probationCount += b.count;
      else if (val < 2.5) satisfactoryCount += b.count;
      else if (val < 3.0) goodCount += b.count;
      else if (val < 3.5) veryGoodCount += b.count;
      else excellentCount += b.count;
    }

    const departments = [
      {
        department: 'General',
        nameAr: 'الشعبة العامة',
        nameEn: 'General Track (Years 1 & 2)',
        levels: ['1', '2'],
        enrolled: generalEnrolled,
      },
      {
        department: 'BIS',
        nameAr: 'نظم معلومات الأعمال (BIS)',
        nameEn: 'Business Information Systems',
        levels: ['3', '4'],
        enrolled: bisEnrolled,
      },
      {
        department: 'ACCOUNTING',
        nameAr: 'المحاسبة والمراجعة',
        nameEn: 'Accounting & Auditing',
        levels: ['3', '4'],
        enrolled: accEnrolled,
      },
    ];

    const cohortRetention = Object.entries(cohortMap).map(([lvl, data]) => ({
      level: lvl,
      total: data.total,
      active: data.active,
      probation: data.probation,
      attrition: data.attrition,
      retentionRate:
        data.total > 0 ? Math.round((data.active / data.total) * 100) : 100,
    }));

    const gpaDistribution = [
      {
        label: 'Probation (< 2.0)',
        labelAr: 'إنذار أكاديمي (< 2.0)',
        range: '< 2.0',
        count: probationCount,
      },
      {
        label: 'Satisfactory (2.0 - 2.49)',
        labelAr: 'مقبول (2.0 - 2.49)',
        range: '2.0 - 2.49',
        count: satisfactoryCount,
      },
      {
        label: 'Good (2.5 - 2.99)',
        labelAr: 'جيد (2.5 - 2.99)',
        range: '2.5 - 2.99',
        count: goodCount,
      },
      {
        label: 'Very Good (3.0 - 3.49)',
        labelAr: 'جيد جداً (3.0 - 3.49)',
        range: '3.0 - 3.49',
        count: veryGoodCount,
      },
      {
        label: 'Excellent (3.5 - 4.0)',
        labelAr: 'ممتاز (3.5 - 4.0)',
        range: '3.5 - 4.0',
        count: excellentCount,
      },
    ];

    const byLevel = Array.from(levelMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([level, count]) => ({
        level,
        count,
      }));

    const result = {
      total,
      active,
      suspended,
      graduated,
      withdrawn: inactiveCount,
      liveOnline: Math.max(liveOnline ?? 0, 0),
      liveOnlineStaff: Math.max(liveOnlineStaff ?? 0, 0),
      byLevel,
      departments,
      cohortRetention,
      gpaDistribution,
    };

    this.cachedStats = {
      data: result,
      expiresAt: Date.now() + StudentsService.STATS_CACHE_TTL_MS,
    };

    return result;
  }

  async getActiveSessions(windowMinutes = 60) {
    const threshold = new Date(Date.now() - windowMinutes * 60 * 1000);
    const onlineThreshold = new Date(Date.now() - 15 * 60 * 1000);

    const activeUsers = (await this.usersService.getActiveUsersForSessions(
      threshold,
    )) as unknown as Array<{
      _id: Types.ObjectId;
      name: string;
      role: string;
      staffType?: string;
      userCode?: string;
      studentCode?: string;
      email?: string;
      lastLoginAt?: Date;
      lastActiveAt?: Date;
      lastAction?: string;
      lastActionAr?: string;
      lastActionRoute?: string;
      sessionDevice?: string;
      avatarUrl?: string;
    }>;

    const studentCodes = activeUsers
      .map((u) => u.studentCode)
      .filter((code): code is string => Boolean(code));

    const profiles = (await this.studentProfileModel
      .find({ studentCode: { $in: studentCodes } })
      .select(
        'studentCode fullName fullNameAr fullNameEn level department academicEmail seatNumber',
      )
      .lean()) as unknown as Array<{
      studentCode: string;
      fullName: string;
      fullNameAr?: string;
      fullNameEn?: string;
      level?: string;
      department?: string;
      academicEmail?: string;
      seatNumber?: string;
    }>;

    const profileMap = new Map<string, (typeof profiles)[0]>();
    for (const p of profiles) {
      if (p.studentCode) {
        profileMap.set(p.studentCode, p);
      }
    }

    const items = activeUsers.map((u) => {
      const p = u.studentCode ? profileMap.get(u.studentCode) : null;
      const lastActive = u.lastActiveAt || u.lastLoginAt || new Date();
      const loginTime = u.lastLoginAt || u.lastActiveAt || new Date();
      const isOnline =
        new Date(lastActive).getTime() >= onlineThreshold.getTime();
      const sessionDurationMinutes = Math.max(
        1,
        Math.round((Date.now() - new Date(loginTime).getTime()) / (60 * 1000)),
      );

      const isStudent = u.role === 'student';
      let roleLabelAr = 'طالب';
      let roleLabelEn = 'Student';
      if (u.role === 'admin') {
        roleLabelAr = 'مدير النظام';
        roleLabelEn = 'System Admin';
      } else if (u.role === 'staff') {
        if (u.staffType === 'doctor') {
          roleLabelAr = 'عضو هيئة تدريس / دكتور';
          roleLabelEn = 'Doctor (Faculty)';
        } else if (u.staffType === 'teaching_assistant') {
          roleLabelAr = 'معيد';
          roleLabelEn = 'Teaching Assistant';
        } else {
          roleLabelAr = 'كادر إداري';
          roleLabelEn = 'Administrative Staff';
        }
      }

      return {
        _id: u._id.toString(),
        name: p?.fullName || u.name,
        nameAr: p?.fullNameAr || p?.fullName || u.name,
        role: u.role,
        staffType: u.staffType,
        studentCode: isStudent ? u.studentCode || '' : '',
        roleLabelAr,
        roleLabelEn,
        level: p?.level || '',
        department: p?.department || '',
        academicEmail: p?.academicEmail || u.email || '',
        seatNumber: p?.seatNumber || '',
        loginTime: loginTime.toISOString(),
        lastActiveTime: lastActive.toISOString(),
        sessionDurationMinutes,
        isOnline,
        lastAction: u.lastAction || 'Active in Portal',
        lastActionAr: u.lastActionAr || 'متواجد بالبوابة',
        lastActionRoute: u.lastActionRoute || '/dashboard',
        sessionDevice: u.sessionDevice || 'Web Browser',
      };
    });

    const students = items.filter((i) => i.role === 'student');
    const staffMembers = items.filter((i) => i.role !== 'student');

    return {
      windowMinutes,
      totalActive: items.length,
      onlineNow: items.filter((i) => i.isOnline).length,
      onlineStudents: students.filter((i) => i.isOnline).length,
      totalStudents: students.length,
      onlineStaff: staffMembers.filter((i) => i.isOnline).length,
      totalStaff: staffMembers.length,
      items,
    };
  }

  async getDashboard(userId: string) {
    const profile = await this.findByUserId(userId);

    // Basic dashboard data - will be expanded in later phases
    return {
      student: {
        name: profile.fullName,
        studentCode: profile.studentCode,
        level: profile.level,
        department: profile.department,
        academicYear: profile.academicYear,
        semester: profile.semester,
        enrollmentStatus: profile.enrollmentStatus,
      },
    };
  }

  async getMustChangePasswordSummary() {
    return this.usersService.getStudentsMustChangePasswordSummary();
  }

  async toggleAllMustChangePassword(enabled: boolean) {
    return this.usersService.toggleAllStudentsMustChangePassword(enabled);
  }

  async transferDepartment(
    studentIds: string[],
    targetDepartment: string,
    targetLevel?: string,
  ): Promise<{ updatedCount: number; message: string }> {
    if (!studentIds || !studentIds.length) {
      throw new BadRequestException('يجب تحديد طالب واحد على الأقل للتحويل');
    }

    const objectIds = studentIds
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    const stringCodes = studentIds.filter((id) => !Types.ObjectId.isValid(id));

    const orClauses: Record<string, any>[] = [];
    if (objectIds.length) {
      orClauses.push({ _id: { $in: objectIds } });
      orClauses.push({ userId: { $in: objectIds } });
    }
    if (stringCodes.length) {
      orClauses.push({ studentCode: { $in: stringCodes } });
    }

    if (!orClauses.length) {
      throw new BadRequestException('معرفات الطلاب المحددة غير صالحة');
    }

    const filter = { $or: orClauses };

    const updateDoc: Record<string, any> = {
      department: targetDepartment,
    };
    if (targetLevel) {
      updateDoc.level = targetLevel;
    }

    const result = await this.studentProfileModel.updateMany(filter, {
      $set: updateDoc,
    });

    if (targetLevel) {
      const updatedProfiles = await this.studentProfileModel
        .find(filter)
        .select('userId')
        .lean();
      const userIds = updatedProfiles.map((p) => p.userId).filter(Boolean);
      if (userIds.length) {
        await this.academicProfileModel.updateMany(
          { studentId: { $in: userIds } },
          { $set: { academicLevel: targetLevel } },
        );
      }
    }

    const deptLabel =
      targetDepartment === 'BIS'
        ? 'نظم معلومات الأعمال (BIS)'
        : targetDepartment === 'ACCOUNTING'
          ? 'المحاسبة والمراجعة'
          : targetDepartment;

    this.invalidateStatsCache();

    return {
      updatedCount: result.modifiedCount,
      message: `تم تحويل ${result.modifiedCount} طالب إلى ${deptLabel} بنجاح`,
    };
  }

  // ─── Tuition Fees & Block Status Management ──────────────────────

  async getTuitionStats() {
    const [stats] = await this.studentProfileModel.aggregate([
      {
        $facet: {
          total: [{ $count: 'count' }],
          blocked: [{ $match: { isBlocked: true } }, { $count: 'count' }],
          paid: [
            {
              $match: {
                $or: [
                  { tuitionFeesStatus: 'paid' },
                  { tuitionFeesStatus: null, isBlocked: false },
                ],
              },
            },
            { $count: 'count' },
          ],
          unpaid: [
            {
              $match: {
                $or: [{ tuitionFeesStatus: 'unpaid' }, { isBlocked: true }],
              },
            },
            { $count: 'count' },
          ],
          exempt: [
            { $match: { tuitionFeesStatus: 'exempt' } },
            { $count: 'count' },
          ],
        },
      },
    ]);

    return {
      total: stats?.total?.[0]?.count ?? 0,
      blocked: stats?.blocked?.[0]?.count ?? 0,
      paid: stats?.paid?.[0]?.count ?? 0,
      unpaid: stats?.unpaid?.[0]?.count ?? 0,
      exempt: stats?.exempt?.[0]?.count ?? 0,
    };
  }

  async getTuitionList(query: QueryTuitionStatusDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const filter: Record<string, any> = {};

    if (query.search && query.search.trim()) {
      const s = query.search.trim();
      filter.$or = [
        { studentCode: { $regex: s, $options: 'i' } },
        { fullName: { $regex: s, $options: 'i' } },
        { fullNameAr: { $regex: s, $options: 'i' } },
      ];
    }

    if (query.level && query.level !== 'all') {
      filter.level = query.level;
    }

    if (
      query.isBlocked !== undefined &&
      query.isBlocked !== 'all' &&
      query.isBlocked !== ''
    ) {
      filter.isBlocked = String(query.isBlocked) === 'true';
    }

    if (query.tuitionFeesStatus && query.tuitionFeesStatus !== 'all') {
      filter.tuitionFeesStatus = query.tuitionFeesStatus;
    }

    const [items, total] = await Promise.all([
      this.studentProfileModel
        .find(filter)
        .select(
          'studentCode fullName fullNameAr fullNameEn level department isBlocked tuitionFeesStatus blockReason blockedAt unblockedAt createdAt',
        )
        .sort({ isBlocked: -1, studentCode: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.studentProfileModel.countDocuments(filter),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async updateStudentTuitionStatus(
    studentId: string,
    dto: UpdateTuitionStatusDto,
  ) {
    let profile = await this.studentProfileModel.findById(studentId);
    if (!profile) {
      if (Types.ObjectId.isValid(studentId)) {
        profile = await this.studentProfileModel.findOne({
          userId: new Types.ObjectId(studentId),
        });
      }
      if (!profile) {
        profile = await this.studentProfileModel.findOne({
          studentCode: studentId,
        });
      }
    }

    if (!profile) {
      throw new NotFoundException('لم يتم العثور على ملف الطالب');
    }

    profile.isBlocked = dto.isBlocked;
    if (dto.tuitionFeesStatus) {
      profile.tuitionFeesStatus = dto.tuitionFeesStatus;
    } else {
      profile.tuitionFeesStatus = dto.isBlocked ? 'unpaid' : 'paid';
    }

    if (dto.blockReason !== undefined) {
      profile.blockReason = dto.blockReason;
    } else if (dto.isBlocked && !profile.blockReason) {
      profile.blockReason = 'عدم سداد المصروفات الدراسية';
    }

    if (dto.isBlocked) {
      profile.blockedAt = new Date();
    } else {
      profile.unblockedAt = new Date();
    }

    await profile.save();

    this.invalidateStatsCache();

    return {
      message: dto.isBlocked
        ? `تم حجب حساب الطالب ${profile.studentCode} بنجاح`
        : `تم إلغاء حجب حساب الطالب ${profile.studentCode} وتفعيله بنجاح`,
      student: {
        _id: profile._id,
        studentCode: profile.studentCode,
        fullName: profile.fullName,
        isBlocked: profile.isBlocked,
        tuitionFeesStatus: profile.tuitionFeesStatus,
        blockReason: profile.blockReason,
      },
    };
  }

  async bulkToggleTuitionStatus(dto: BulkToggleTuitionDto) {
    const objectIds: Types.ObjectId[] = [];
    const studentCodes: string[] = [];

    dto.studentIds.forEach((id) => {
      if (Types.ObjectId.isValid(id)) {
        objectIds.push(new Types.ObjectId(id));
      } else {
        studentCodes.push(id.trim());
      }
    });

    const filter: Record<string, any> = {
      $or: [
        { _id: { $in: objectIds } },
        { userId: { $in: objectIds } },
        { studentCode: { $in: studentCodes } },
      ],
    };

    const targetTuitionStatus =
      dto.tuitionFeesStatus || (dto.isBlocked ? 'unpaid' : 'paid');

    const updateDoc: Record<string, any> = {
      isBlocked: dto.isBlocked,
      tuitionFeesStatus: targetTuitionStatus,
    };

    if (dto.isBlocked) {
      updateDoc.blockedAt = new Date();
      updateDoc.blockReason = dto.blockReason || 'عدم سداد المصروفات الدراسية';
    } else {
      updateDoc.unblockedAt = new Date();
    }

    const result = await this.studentProfileModel.updateMany(filter, {
      $set: updateDoc,
    });

    this.invalidateStatsCache();

    return {
      updatedCount: result.modifiedCount,
      message: dto.isBlocked
        ? `تم حجب ${result.modifiedCount} طالب بنجاح`
        : `تم إلغاء حجب ${result.modifiedCount} طالب بنجاح`,
    };
  }

  async generateTuitionTemplate(format: 'xlsx' | 'csv' = 'xlsx') {
    const csvHeaders = [
      'كود الطالب',
      'الفرقة',
      'حالة المصروفات',
      'الحجب',
      'سبب الحجب',
      'اسم الطالب (اختياري)',
    ];

    if (format === 'csv') {
      const sampleRows = [
        '260402,الفرقة الثانية,مسدد,مفعل,,عبدالرحمن صابر علي',
        '260104,الفرقة الثانية,مسدد,مفعل,,فارس ابراهيم نصر',
        '260464,الفرقة الثانية,غير مسدد,محجوب,عدم سداد المصروفات,مصطفى ايهاب العوضي',
        '260791,الفرقة الثانية,مسدد,مفعل,,ملك محمد رضا',
        '261556,الفرقة الثانية,غير مسدد,محجوب,عدم سداد المصروفات,خلود نشأت رمضان',
      ];
      const csvContent =
        '\uFEFF' + [csvHeaders.join(','), ...sampleRows].join('\n');
      return {
        buffer: Buffer.from(csvContent, 'utf-8'),
        contentType: 'text/csv; charset=utf-8',
        filename: 'tuition-fees-and-block-template.csv',
      };
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'BH47A Student Portal';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('المصروفات والحجب', {
      views: [{ rightToLeft: true }],
    });

    sheet.columns = [
      { header: 'كود الطالب', key: 'student_code', width: 20 },
      { header: 'الفرقة', key: 'level', width: 20 },
      { header: 'حالة المصروفات', key: 'tuition_status', width: 22 },
      { header: 'الحجب', key: 'block_status', width: 18 },
      { header: 'سبب الحجب', key: 'block_reason', width: 28 },
      { header: 'اسم الطالب (اختياري)', key: 'student_name', width: 35 },
    ];

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
      fgColor: { argb: 'FF0D9488' },
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    const sampleRows = [
      {
        student_code: '260402',
        level: 'الفرقة الثانية',
        tuition_status: 'مسدد',
        block_status: 'مفعل',
        block_reason: '',
        student_name: 'عبدالرحمن صابر علي',
      },
      {
        student_code: '260104',
        level: 'الفرقة الثانية',
        tuition_status: 'مسدد',
        block_status: 'مفعل',
        block_reason: '',
        student_name: 'فارس ابراهيم نصر',
      },
      {
        student_code: '260464',
        level: 'الفرقة الثانية',
        tuition_status: 'غير مسدد',
        block_status: 'محجوب',
        block_reason: 'عدم سداد المصروفات الدراسية',
        student_name: 'مصطفى ايهاب العوضي',
      },
      {
        student_code: '260791',
        level: 'الفرقة الثانية',
        tuition_status: 'مسدد',
        block_status: 'مفعل',
        block_reason: '',
        student_name: 'ملك محمد رضا',
      },
      {
        student_code: '261556',
        level: 'الفرقة الثانية',
        tuition_status: 'غير مسدد',
        block_status: 'محجوب',
        block_reason: 'عدم سداد المصروفات الدراسية',
        student_name: 'خلود نشأت رمضان',
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
      filename: 'tuition-fees-and-block-template.xlsx',
    };
  }

  async processBatchTuitionRows(rows: Record<string, any>[]): Promise<{
    totalRows: number;
    updatedCount: number;
    errorCount: number;
    errors: string[];
  }> {
    if (!rows || rows.length === 0) {
      return { totalRows: 0, updatedCount: 0, errorCount: 0, errors: [] };
    }

    const errors: string[] = [];
    const extractedRows: Array<{
      rowNum: number;
      cleanCode: string;
      rawCode: string;
      rawLevel: string;
      rawTuition: string;
      rawBlock: string;
      rawReason: string;
    }> = [];

    const codesToLookup: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;

      const rawCode = this.extractFieldValue(row, [
        'كود الطالب',
        'كود_الطالب',
        'كود',
        'student_code',
        'studentcode',
        'code',
      ]);

      if (!rawCode) {
        errors.push(`السطر ${rowNum}: لم يتم العثور على كود الطالب`);
        continue;
      }

      const cleanCode = rawCode.trim();
      codesToLookup.push(cleanCode);

      extractedRows.push({
        rowNum,
        cleanCode,
        rawCode,
        rawLevel: this.extractFieldValue(row, [
          'الفرقة',
          'فرقة',
          'level',
          'السنة',
          'الصف',
        ]),
        rawTuition: this.extractFieldValue(row, [
          'حالة المصروفات',
          'المصروفات',
          'tuition',
          'tuition_status',
        ]),
        rawBlock: this.extractFieldValue(row, [
          'الحجب',
          'حجب',
          'الحالة',
          'status',
          'block',
          'block_status',
        ]),
        rawReason: this.extractFieldValue(row, [
          'سبب الحجب',
          'السبب',
          'reason',
          'block_reason',
        ]),
      });
    }

    // Single query bulk lookup
    const existingProfiles = await this.studentProfileModel
      .find({ studentCode: { $in: codesToLookup } })
      .select('_id studentCode')
      .lean();

    const profileMap = new Map(
      existingProfiles.map((p) => [p.studentCode, p._id]),
    );

    const bulkOps: any[] = [];

    for (const item of extractedRows) {
      const profileId = profileMap.get(item.cleanCode);
      if (!profileId) {
        errors.push(
          `السطر ${item.rowNum}: كود الطالب "${item.rawCode}" غير مسجل بالمنظومة`,
        );
        continue;
      }

      const updateFields: Record<string, any> = {};

      const isMarkedBlocked =
        item.rawBlock.includes('محجوب') ||
        item.rawBlock.toLowerCase() === 'blocked' ||
        item.rawTuition.includes('غير مسدد') ||
        item.rawTuition.toLowerCase() === 'unpaid';

      const isMarkedActive =
        item.rawBlock.includes('مفعل') ||
        item.rawBlock.toLowerCase() === 'active' ||
        item.rawTuition.includes('مسدد') ||
        item.rawTuition.toLowerCase() === 'paid';

      const isMarkedExempt =
        item.rawTuition.includes('معفي') ||
        item.rawTuition.toLowerCase() === 'exempt';

      if (isMarkedBlocked) {
        updateFields.isBlocked = true;
        updateFields.tuitionFeesStatus = 'unpaid';
        updateFields.blockReason =
          item.rawReason || 'عدم سداد المصروفات الدراسية';
        updateFields.blockedAt = new Date();
      } else if (isMarkedExempt) {
        updateFields.isBlocked = false;
        updateFields.tuitionFeesStatus = 'exempt';
        updateFields.unblockedAt = new Date();
      } else if (isMarkedActive) {
        updateFields.isBlocked = false;
        updateFields.tuitionFeesStatus = 'paid';
        updateFields.unblockedAt = new Date();
      }

      if (item.rawLevel) {
        const rawL = item.rawLevel;
        let normalizedLevel: string | undefined;
        if (rawL.includes('أولى') || rawL.includes('اولى') || rawL === '1') {
          normalizedLevel = '1';
        } else if (
          rawL.includes('ثاني') ||
          rawL.includes('ثانيه') ||
          rawL === '2'
        ) {
          normalizedLevel = '2';
        } else if (
          rawL.includes('ثالث') ||
          rawL.includes('ثالثه') ||
          rawL === '3'
        ) {
          normalizedLevel = '3';
        } else if (
          rawL.includes('رابع') ||
          rawL.includes('رابعه') ||
          rawL === '4'
        ) {
          normalizedLevel = '4';
        } else if (['1', '2', '3', '4'].includes(rawL.trim())) {
          normalizedLevel = rawL.trim();
        }

        if (normalizedLevel) {
          updateFields.level = normalizedLevel;
        }
      }

      if (Object.keys(updateFields).length > 0) {
        bulkOps.push({
          updateOne: {
            filter: { _id: profileId },
            update: { $set: updateFields },
          },
        });
      }
    }

    let updatedCount = 0;
    if (bulkOps.length > 0) {
      const bulkResult = await this.studentProfileModel.bulkWrite(bulkOps, {
        ordered: false,
      });
      updatedCount = bulkResult.modifiedCount ?? bulkOps.length;
      this.invalidateStatsCache();
    }

    return {
      totalRows: rows.length,
      updatedCount,
      errorCount: errors.length,
      errors: errors.slice(0, 30),
    };
  }

  async exportTuitionToExcel(query: QueryTuitionStatusDto) {
    const filter: Record<string, any> = {};
    if (query.search && query.search.trim()) {
      const s = query.search.trim();
      filter.$or = [
        { studentCode: { $regex: s, $options: 'i' } },
        { fullName: { $regex: s, $options: 'i' } },
        { fullNameAr: { $regex: s, $options: 'i' } },
      ];
    }
    if (query.level && query.level !== 'all') {
      filter.level = query.level;
    }
    if (
      query.isBlocked !== undefined &&
      query.isBlocked !== 'all' &&
      query.isBlocked !== ''
    ) {
      filter.isBlocked = String(query.isBlocked) === 'true';
    }
    if (query.tuitionFeesStatus && query.tuitionFeesStatus !== 'all') {
      filter.tuitionFeesStatus = query.tuitionFeesStatus;
    }

    const students = await this.studentProfileModel
      .find(filter)
      .select(
        'studentCode fullName fullNameAr fullNameEn level department isBlocked tuitionFeesStatus blockReason',
      )
      .sort({ level: 1, studentCode: 1 })
      .lean();

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'BH47A Student Portal';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('المصروفات والحجب', {
      views: [{ rightToLeft: true }],
    });

    sheet.columns = [
      { header: 'م', key: 'index', width: 8 },
      { header: 'كود الطالب', key: 'studentCode', width: 18 },
      { header: 'اسم الطالب', key: 'studentName', width: 35 },
      { header: 'الفرقة', key: 'level', width: 18 },
      { header: 'القسم', key: 'department', width: 16 },
      { header: 'حالة المصروفات', key: 'tuitionStatus', width: 18 },
      { header: 'حالة الحجب', key: 'blockStatus', width: 16 },
      { header: 'سبب الحجب', key: 'blockReason', width: 30 },
    ];

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
      fgColor: { argb: 'FF0D9488' },
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    const LEVEL_MAP: Record<string, string> = {
      '1': 'الفرقة الأولى',
      '2': 'الفرقة الثانية',
      '3': 'الفرقة الثالثة',
      '4': 'الفرقة الرابعة',
    };

    const TUITION_MAP: Record<string, string> = {
      paid: 'مسدد',
      unpaid: 'غير مسدد',
      exempt: 'معفي',
    };

    students.forEach((s, idx) => {
      const addedRow = sheet.addRow({
        index: idx + 1,
        studentCode: s.studentCode,
        studentName: s.fullNameAr || s.fullName,
        level: LEVEL_MAP[s.level] || `الفرقة ${s.level}`,
        department: s.department || 'GENERAL',
        tuitionStatus:
          TUITION_MAP[s.tuitionFeesStatus || ''] ||
          s.tuitionFeesStatus ||
          'غير محدد',
        blockStatus: s.isBlocked ? 'محجوب' : 'مفعل',
        blockReason: s.blockReason || '',
      });
      addedRow.height = 22;
      addedRow.alignment = { vertical: 'middle', horizontal: 'center' };
      addedRow.font = { name: 'Segoe UI', size: 10 };
      if (s.isBlocked) {
        addedRow.getCell('blockStatus').font = {
          bold: true,
          color: { argb: 'FFE11D48' },
        };
      } else {
        addedRow.getCell('blockStatus').font = {
          bold: true,
          color: { argb: 'FF10B981' },
        };
      }
    });

    const uint8Array = await workbook.xlsx.writeBuffer();
    return {
      buffer: Buffer.from(uint8Array),
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: `tuition-and-block-report-${new Date().toISOString().slice(0, 10)}.xlsx`,
    };
  }

  async bulkUpdateTuitionFromExcel(buffer: Buffer, originalname: string) {
    const rows = await this.parseTuitionWorkbookRows(buffer, originalname);
    if (rows.length === 0) {
      throw new BadRequestException(
        'الملف فارغ أو لا يحتوي على صفوف بيانات صالحة',
      );
    }
    return this.processBatchTuitionRows(rows);
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

  private async parseTuitionWorkbookRows(
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
    await workbook.xlsx.load(buffer as any);
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
}
