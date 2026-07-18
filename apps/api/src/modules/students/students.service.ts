import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  StudentProfile,
  StudentProfileDocument,
} from './schemas/student-profile.schema';
import { UsersService } from '../users/users.service';
import { EmailsService } from '../emails/emails.service';
import {
  CreateStudentDto,
  UpdateStudentDto,
  SearchStudentQuery,
  ResetPasswordDto,
  UpdateMyContactDto,
} from './dto/student.dto';
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
  RegistrationTerm,
  RegistrationTermDocument,
} from '../registrations/schemas/registration-term.schema';
import { isRegistrationTermCurrentlyOpen } from '../registrations/utils/registration-term.util';
import {
  AdvisingCase,
  AdvisingCaseDocument,
} from '../academic-advising/schemas/advising-case.schema';

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
    private usersService: UsersService,
    private emailsService: EmailsService,
  ) {}

  async create(dto: CreateStudentDto) {
    // Check if student code already exists
    const existing = await this.usersService.findByStudentCode(dto.studentCode);
    if (existing) {
      throw new ConflictException('كود الطالب موجود بالفعل'); // Student code already exists
    }

    // Create user account (nationalId is the initial password)
    const user = await this.usersService.createUser({
      role: 'student',
      name: dto.fullName,
      studentCode: dto.studentCode,
      password: dto.nationalId,
      nationalId: dto.nationalId,
      email: dto.academicEmail,
      phone: dto.phone,
      mustChangePassword: dto.mustChangePassword ?? false,
    });

    // Create student profile
    const profile = new this.studentProfileModel({
      userId: user._id,
      studentCode: dto.studentCode,
      fullName: dto.fullName,
      nationalIdMasked: user.nationalIdMasked,
      nationalId: dto.nationalId,
      department: dto.department,
      level: dto.level,
      group: dto.group,
      section: dto.section,
      academicYear: dto.academicYear,
      semester: dto.semester,
      seatNumber: dto.seatNumber,
      academicEmail: dto.academicEmail,
      examRoom: dto.examRoom,
      examFloor: dto.examFloor,
      examBuilding: dto.examBuilding,
    });

    await profile.save();

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

  async findAll(query: SearchStudentQuery) {
    const { page, limit, skip } = buildPaginationOptions(query);

    const filter: any = {};

    if (query.search) {
      const search = normalizeSearchTerm(query.search);
      filter.$or = [
        { studentCode: { $regex: search, $options: 'i' } },
        { fullName: { $regex: search, $options: 'i' } },
      ];
    }

    if (query.level) {
      filter.level = query.level;
    }

    if (query.enrollmentStatus) {
      filter.enrollmentStatus = query.enrollmentStatus;
    }

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

    const [items, total] = await Promise.all([
      this.studentProfileModel
        .find(filter)
        .populate(
          'userId',
          'isActive nationalIdMasked nationalId lastLoginAt mustChangePassword',
        )
        .sort({ [sortField]: sortDir })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.studentProfileModel.countDocuments(filter),
    ]);

    const enrichedItems = await this.attachRegistrationSummaries(items);
    return createPaginatedResult(enrichedItems, total, page, limit);
  }

  async findById(id: string) {
    const profile = await this.studentProfileModel
      .findById(id)
      .populate(
        'userId',
        'isActive nationalIdMasked nationalId phone lastLoginAt mustChangePassword',
      )
      .lean();
    if (!profile) {
      throw new NotFoundException('الطالب غير موجود'); // Student not found
    }
    const [enriched] = await this.attachRegistrationSummaries([profile]);
    return enriched;
  }

  private async attachRegistrationSummaries<T extends Record<string, any>>(
    profiles: T[],
  ): Promise<Array<T & { registrationSummary: Record<string, unknown> }>> {
    if (profiles.length === 0) return [];

    const currentTerms = await this.registrationTermModel
      .find({ isCurrent: true })
      .sort({ updatedAt: -1, academicYear: -1 })
      .lean();
    const activeTerm =
      currentTerms.find((term) => isRegistrationTermCurrentlyOpen(term)) ??
      currentTerms[0];

    const userIds = profiles
      .map((profile) => this.getProfileUserId(profile))
      .filter((id): id is Types.ObjectId => Boolean(id));

    const termFilter = activeTerm
      ? {
          academicYear: activeTerm.academicYear,
          semester: activeTerm.semester,
        }
      : null;
    const [registrations, advisingCases] = termFilter
      ? await Promise.all([
          this.registrationModel
            .find({ studentId: { $in: userIds }, ...termFilter })
            .sort({ createdAt: -1 })
            .lean(),
          this.advisingCaseModel
            .find({ studentId: { $in: userIds }, ...termFilter })
            .sort({ updatedAt: -1 })
            .lean(),
        ])
      : [[], []];

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

    return profiles.map((profile) => {
      const key = this.getProfileUserId(profile)?.toHexString() ?? '';
      const registration = registrationByStudent.get(key);
      const advisingCase = advisingByStudent.get(key);

      return {
        ...profile,
        registrationSummary: {
          academicYear: activeTerm?.academicYear,
          semester: activeTerm?.semester,
          isTermOpen: isRegistrationTermCurrentlyOpen(activeTerm),
          status: registration?.status ?? 'not_registered',
          registrationId: registration?._id?.toString(),
          courseCount: registration?.courses?.length ?? 0,
          totalCreditHours: registration?.totalCreditHours ?? 0,
          advisingCaseId: advisingCase?._id?.toString(),
          advisingStatus: advisingCase?.status ?? 'NOT_STARTED',
        },
      };
    });
  }

  private getProfileUserId(
    profile: Record<string, unknown>,
  ): Types.ObjectId | undefined {
    const user = profile.userId;
    if (user instanceof Types.ObjectId) return user;
    if (typeof user === 'string' && Types.ObjectId.isValid(user)) {
      return new Types.ObjectId(user);
    }
    if (user && typeof user === 'object' && '_id' in user) {
      const id = (user as { _id?: unknown })._id;
      if (id instanceof Types.ObjectId) return id;
      if (typeof id === 'string' && Types.ObjectId.isValid(id)) {
        return new Types.ObjectId(id);
      }
    }
    return undefined;
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
    const profile = await this.studentProfileModel.findByIdAndUpdate(
      id,
      { $set: profileUpdates },
      { new: true },
    );
    if (!profile) {
      throw new NotFoundException('الطالب غير موجود');
    }

    // Also update the user name if fullName changed
    if (dto.fullName) {
      await this.usersService
        .findById(profile.userId.toString())
        .then((user) => {
          user.name = dto.fullName!;
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

    return { message: 'تم تعطيل حساب الطالب' }; // Student deactivated
  }

  async resetPassword(id: string, dto: ResetPasswordDto) {
    const profile = await this.studentProfileModel.findById(id);
    if (!profile) {
      throw new NotFoundException('الطالب غير موجود');
    }

    await this.usersService.updatePassword(
      profile.userId.toString(),
      dto.newPassword,
    );

    const user = await this.usersService.findById(profile.userId.toString());
    user.mustChangePassword = dto.mustChangePassword ?? false;
    await user.save();

    const emailTo = profile.academicEmail || user.email;
    if (emailTo) {
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
          <div style="text-align: center; border-bottom: 2px solid #0f766e; padding-bottom: 20px; margin-bottom: 20px;">
            <h2 style="color: #0f766e; margin: 0;">بوابة الطالب | Student Portal</h2>
          </div>
          <div style="direction: rtl; text-align: right; margin-bottom: 25px;">
            <p style="font-size: 16px; color: #1e293b; line-height: 1.6;">عزيزي الطالب <strong>${profile.fullName}</strong>،</p>
            <p style="font-size: 14px; color: #475569; line-height: 1.6;">تمت إعادة تعيين كلمة المرور الخاصة بحسابك على البوابة الإلكترونية بنجاح.</p>
            <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; border-right: 4px solid #0f766e; margin: 20px 0;">
              <p style="margin: 5px 0; font-size: 14px;"><strong>الكود الأكاديمي:</strong> <span style="font-family: monospace; font-size: 16px; color: #0f766e;">${profile.studentCode}</span></p>
              <p style="margin: 5px 0; font-size: 14px;"><strong>كلمة المرور الجديدة:</strong> <span style="font-family: monospace; font-size: 16px; color: #0f766e;">${dto.newPassword}</span></p>
            </div>
            <p style="font-size: 12px; color: #ef4444;">* يرجى تسجيل الدخول وتغيير كلمة المرور فوراً لحماية حسابك.</p>
          </div>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
          <div style="direction: ltr; text-align: left;">
            <p style="font-size: 16px; color: #1e293b; line-height: 1.6;">Dear Student <strong>${profile.fullName}</strong>,</p>
            <p style="font-size: 14px; color: #475569; line-height: 1.6;">Your student portal account password has been successfully reset.</p>
            <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; border-left: 4px solid #0f766e; margin: 20px 0;">
              <p style="margin: 5px 0; font-size: 14px;"><strong>Student Code:</strong> <span style="font-family: monospace; font-size: 16px; color: #0f766e;">${profile.studentCode}</span></p>
              <p style="margin: 5px 0; font-size: 14px;"><strong>New Password:</strong> <span style="font-family: monospace; font-size: 16px; color: #0f766e;">${dto.newPassword}</span></p>
            </div>
            <p style="font-size: 12px; color: #ef4444;">* Please log in and change your password immediately to secure your account.</p>
          </div>
          <div style="text-align: center; font-size: 11px; color: #94a3b8; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 15px;">
            High Institute for Advanced Management Sciences and Computer &copy; 2026
          </div>
        </div>
      `;

      try {
        await this.emailsService.send({
          to: [emailTo],
          subject: 'إعادة تعيين كلمة المرور | Password Reset',
          html: emailHtml,
          event: 'password_reset',
        });
      } catch (emailErr) {
        console.warn(
          `[Email Dispatch Failed] Student password reset succeeded but email notification could not be delivered:`,
          emailErr instanceof Error ? emailErr.message : emailErr,
        );
      }
    }

    return { message: 'تم إعادة تعيين كلمة المرور بنجاح' };
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
}
