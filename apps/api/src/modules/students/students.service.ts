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
import {
  CreateStudentDto,
  UpdateStudentDto,
  SearchStudentQuery,
  ResetPasswordDto,
  UpdateMyContactDto,
} from './dto/student.dto';
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
    private usersService: UsersService,
    private emailsService: EmailsService,
    private readonly studentQueryService: StudentQueryService,
  ) {}

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

    // Create student profile
    const profile = new this.studentProfileModel({
      userId: user._id,
      studentCode: dto.studentCode,
      fullName: resolvedFullName,
      fullNameAr,
      fullNameEn,
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
    const [total, active, suspended, graduated, withdrawn, byLevel] =
      await Promise.all([
        this.studentProfileModel.countDocuments(),
        this.studentProfileModel.countDocuments({ enrollmentStatus: 'active' }),
        this.studentProfileModel.countDocuments({
          enrollmentStatus: 'suspended',
        }),
        this.studentProfileModel.countDocuments({
          enrollmentStatus: 'graduated',
        }),
        this.studentProfileModel.countDocuments({
          enrollmentStatus: 'withdrawn',
        }),
        this.studentProfileModel.aggregate([
          { $group: { _id: '$level', count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ]),
      ]);

    return {
      total,
      active,
      suspended,
      graduated,
      withdrawn,
      byLevel: byLevel.map((item) => ({
        level: item._id || 'unknown',
        count: item.count,
      })),
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
}
