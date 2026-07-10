import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
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

@Injectable()
export class StudentsService {
  constructor(
    @InjectModel(StudentProfile.name)
    private studentProfileModel: Model<StudentProfileDocument>,
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
      phone: dto.phone,
      mustChangePassword: true,
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

    const [items, total] = await Promise.all([
      this.studentProfileModel
        .find(filter)
        .populate('userId', 'isActive nationalIdMasked nationalId lastLoginAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.studentProfileModel.countDocuments(filter),
    ]);

    return createPaginatedResult(items, total, page, limit);
  }

  async findById(id: string) {
    const profile = await this.studentProfileModel
      .findById(id)
      .populate(
        'userId',
        'isActive nationalIdMasked nationalId phone lastLoginAt',
      );
    if (!profile) {
      throw new NotFoundException('الطالب غير موجود'); // Student not found
    }
    return profile;
  }

  async findByUserId(userId: string) {
    const profile = await this.studentProfileModel.findOne({ userId });
    if (!profile) {
      throw new NotFoundException('الملف الشخصي غير موجود'); // Profile not found
    }
    const user = await this.usersService.findById(userId);
    return {
      ...profile.toObject(),
      email: user.email ?? '',
      phone: user.phone ?? '',
      googleEmail: user.googleEmail ?? '',
      googleLinkedAt: user.googleLinkedAt,
      googleLinkPending: user.googleLinkPending ?? false,
    };
  }

  async updateMyContact(userId: string, dto: UpdateMyContactDto) {
    await this.usersService.updateStudentContact(userId, dto);
    return this.findByUserId(userId);
  }

  async update(id: string, dto: UpdateStudentDto) {
    const { nationalId, ...profileUpdates } = dto;
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

    const user = await this.usersService.findById(profile.userId.toString());

    await this.usersService.updatePassword(
      profile.userId.toString(),
      dto.newPassword,
    );

    user.mustChangePassword = true;
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
