import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import * as bcrypt from 'bcrypt';
import type { Role } from '@student-portal/shared';

function maskNationalId(nationalId: string) {
  return nationalId.slice(0, 3) + '****' + nationalId.slice(-3);
}

function normalizeUsername(value?: string) {
  const normalized = value?.trim().toLowerCase();
  return normalized && normalized.length >= 3 ? normalized : undefined;
}

function readPositiveInt(envKey: string, fallback: number) {
  const value = Number.parseInt(process.env[envKey] || '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  async findById(id: string): Promise<UserDocument> {
    const user = await this.userModel
      .findById(id)
      .select(
        '+passwordHash +nationalIdHash +resetPasswordToken +googleLinkOtp',
      );
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findByIdWithNationalId(id: string): Promise<UserDocument> {
    const user = await this.userModel
      .findById(id)
      .select(
        '+passwordHash +nationalIdHash +nationalId +resetPasswordToken +googleLinkOtp',
      );
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return (await this.userModel
      .findOne({ email: email.toLowerCase() })
      .select('+passwordHash +nationalIdHash')
      .lean()) as unknown as UserDocument | null;
  }

  async findByStudentCode(studentCode: string): Promise<UserDocument | null> {
    return (await this.userModel
      .findOne({ studentCode })
      .select('+passwordHash +nationalIdHash +nationalId')
      .lean()) as unknown as UserDocument | null;
  }

  async countActiveOnlineStudents(windowMinutes = 30): Promise<number> {
    const threshold = new Date(Date.now() - windowMinutes * 60 * 1000);
    return this.userModel.countDocuments({
      role: 'student',
      isActive: true,
      lastLoginAt: { $gte: threshold },
    });
  }

  async findByIdentifier(identifier: string): Promise<UserDocument | null> {
    const trimmed = identifier.trim();
    return (await this.userModel
      .findOne({
        $or: [
          { email: trimmed.toLowerCase() },
          { studentCode: trimmed },
          { userCode: trimmed },
          { username: trimmed.toLowerCase() },
        ],
      })
      .select('+passwordHash +nationalIdHash +nationalId +resetPasswordToken')
      .lean()) as unknown as UserDocument | null;
  }

  private async generateUserCode(
    role: Role,
    studentCode?: string,
  ): Promise<string> {
    if (role === 'student') {
      return `STD-${studentCode}`;
    }

    const prefix = role === 'admin' ? 'ADM-' : 'STF-';
    const lastUser = await this.userModel
      .findOne({ role, userCode: new RegExp(`^${prefix}`) })
      .sort({ userCode: -1 })
      .exec();

    let nextNumber = 1;
    if (lastUser && lastUser.userCode) {
      const parts = lastUser.userCode.split('-');
      const num = Number.parseInt(parts[1], 10);
      if (Number.isFinite(num)) {
        nextNumber = num + 1;
      }
    }

    return `${prefix}${String(nextNumber).padStart(4, '0')}`;
  }

  async createUser(data: {
    role: Role;
    name: string;
    username?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    avatarUrl?: string;
    studentCode?: string;
    userCode?: string;
    password: string;
    nationalId?: string;
    mustChangePassword?: boolean;
    permissions?: string[];
  }): Promise<UserDocument> {
    const passwordHash = await bcrypt.hash(data.password, 12);
    let nationalIdHash: string | undefined;
    let nationalIdMasked: string | undefined;

    if (data.nationalId) {
      nationalIdHash = await bcrypt.hash(data.nationalId, 12);
      nationalIdMasked = maskNationalId(data.nationalId);
    }

    const finalUserCode =
      data.userCode ||
      (await this.generateUserCode(data.role, data.studentCode));

    const user = new this.userModel({
      role: data.role,
      userCode: finalUserCode,
      username: normalizeUsername(
        data.username || data.email?.split('@')[0] || data.studentCode,
      ),
      firstName: data.firstName?.trim(),
      lastName: data.lastName?.trim(),
      name: data.name,
      email: data.email?.toLowerCase(),
      phone: data.phone,
      avatarUrl: data.avatarUrl?.trim(),
      studentCode: data.studentCode,
      passwordHash,
      nationalIdHash,
      nationalIdMasked,
      nationalId: data.nationalId,
      mustChangePassword: data.mustChangePassword ?? false,
      permissions: data.permissions ?? [],
    });

    return user.save();
  }

  async validatePassword(
    user: UserDocument,
    password: string,
  ): Promise<boolean> {
    return bcrypt.compare(password, user.passwordHash);
  }

  async updatePassword(
    userId: string,
    newPassword: string,
    mustChangePassword: boolean = false,
  ): Promise<UserDocument> {
    const passwordHash = await bcrypt.hash(newPassword, 12);
    const user = await this.userModel.findByIdAndUpdate(
      userId,
      {
        passwordHash,
        mustChangePassword,
        passwordChangedAt: new Date(Date.now() - 1000),
        $inc: { tokenVersion: 1 },
      },
      { new: true },
    );
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateNationalId(
    userId: string,
    nationalId: string,
  ): Promise<UserDocument> {
    const nationalIdHash = await bcrypt.hash(nationalId, 12);
    const user = await this.userModel.findByIdAndUpdate(
      userId,
      {
        nationalIdHash,
        nationalIdMasked: maskNationalId(nationalId),
        nationalId,
      },
      { new: true },
    );
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async resetPasswordToNationalId(
    userId: string,
    nationalId: string,
    mustChangePassword = false,
  ): Promise<void> {
    const passwordHash = await bcrypt.hash(nationalId, 12);
    await this.userModel.findByIdAndUpdate(userId, {
      passwordHash,
      mustChangePassword,
      passwordChangedAt: new Date(Date.now() - 1000),
      $inc: { tokenVersion: 1 },
    });
  }

  async updatePasswordHashDirect(
    userId: string,
    passwordHash: string,
  ): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      $set: {
        passwordHash,
        nationalIdHash: passwordHash,
        failedLoginAttempts: 0,
        loginAttempts: 0,
      },
      $unset: { lockUntil: 1 },
    });
  }

  async getStudentsMustChangePasswordSummary() {
    const [totalStudents, mustChangeCount] = await Promise.all([
      this.userModel.countDocuments({ role: 'student' }),
      this.userModel.countDocuments({
        role: 'student',
        mustChangePassword: true,
      }),
    ]);
    return {
      totalStudents,
      mustChangeCount,
      allEnabled: totalStudents > 0 && mustChangeCount === totalStudents,
      anyEnabled: mustChangeCount > 0,
    };
  }

  async toggleAllStudentsMustChangePassword(enabled: boolean) {
    if (!enabled) {
      const result = await this.userModel.updateMany(
        { role: 'student' },
        { $set: { mustChangePassword: false } },
      );
      return {
        enabled: false,
        modifiedCount: result.modifiedCount,
      };
    }

    const result = await this.userModel.updateMany(
      { role: 'student' },
      {
        $set: {
          mustChangePassword: true,
          failedLoginAttempts: 0,
          loginAttempts: 0,
        },
        $unset: { lockUntil: 1 },
      },
    );

    return {
      enabled: true,
      modifiedCount: result.modifiedCount,
    };
  }

  async updateLastLogin(userId: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      lastLoginAt: new Date(),
    });
  }

  async updateStudentContact(
    userId: string,
    data: {
      email?: string;
      phone?: string;
      theme?: 'light' | 'dark' | 'system';
    },
  ): Promise<UserDocument> {
    const email = data.email?.trim().toLowerCase() || undefined;
    const phone = data.phone?.trim() || undefined;
    const theme = data.theme;

    if (email) {
      const existing = await this.userModel.findOne({
        email,
        _id: { $ne: userId },
      });
      if (existing) {
        throw new ConflictException('البريد الإلكتروني مستخدم بالفعل');
      }
    }

    const updateData: Record<string, any> = { email, phone };
    if (theme) {
      updateData.theme = theme;
    }

    const user = await this.userModel.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true },
    );
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async prepareGoogleLink(userId: string, googleEmail: string) {
    const normalizedEmail = googleEmail.trim().toLowerCase();
    const existing = await this.userModel.findOne({
      googleEmail: normalizedEmail,
      _id: { $ne: userId },
    });
    if (existing) {
      throw new ConflictException('حساب Google مرتبط بطالب آخر');
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedOtp = await bcrypt.hash(otp, 12);
    const otpExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    const user = await this.userModel.findByIdAndUpdate(
      userId,
      {
        $set: {
          googleEmail: normalizedEmail,
          googleLinkPending: true,
          googleLinkOtp: hashedOtp,
          googleLinkOtpExpiresAt: otpExpires,
        },
      },
      { new: true },
    );
    if (!user) throw new NotFoundException('User not found');
    return { user, otp };
  }

  async clearGoogleLink(userId: string): Promise<UserDocument> {
    const user = await this.userModel.findByIdAndUpdate(
      userId,
      {
        $set: { googleLinkPending: false },
        $unset: {
          googleId: 1,
          googleEmail: 1,
          googleLinkedAt: 1,
          googleLinkOtp: 1,
          googleLinkOtpExpiresAt: 1,
        },
      },
      { new: true },
    );
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async deactivateUser(userId: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      $set: {
        isActive: false,
        deactivatedAt: new Date(),
      },
      $inc: { tokenVersion: 1 },
    });
  }

  async activateUser(userId: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      $set: { isActive: true },
      $unset: {
        deactivatedAt: 1,
        deactivatedBy: 1,
        deactivationReason: 1,
      },
    });
  }

  async countByRole(role: Role): Promise<number> {
    return this.userModel.countDocuments({ role });
  }

  async findActiveStaffAdvisors(): Promise<UserDocument[]> {
    return (await this.userModel
      .find({ role: 'staff', isActive: true })
      .sort({ name: 1 })
      .lean()) as unknown as UserDocument[];
  }

  /** Check if an account is currently locked */
  isAccountLocked(user: UserDocument): boolean {
    const lockedUntil = user.lockUntil || user.lockedUntil;
    return Boolean(lockedUntil && lockedUntil > new Date());
  }

  /** Get remaining lock time in minutes */
  getLockRemainingMinutes(user: UserDocument): number {
    const lockedUntil = user.lockUntil || user.lockedUntil;
    if (!lockedUntil) return 0;
    const remaining = lockedUntil.getTime() - Date.now();
    return remaining > 0 ? Math.ceil(remaining / 60_000) : 0;
  }

  /** Increment login attempts. Lock accounts after configured failed attempts. */
  async incrementLoginAttempts(userId: string): Promise<void> {
    const maxAttempts = readPositiveInt('AUTH_MAX_FAILED_ATTEMPTS', 5);
    const lockDurationMs = readPositiveInt('AUTH_LOCK_MINUTES', 30) * 60 * 1000;

    const user = await this.userModel.findById(userId);
    if (!user) return;

    const currentAttempts = user.failedLoginAttempts ?? user.loginAttempts ?? 0;
    const newCount = currentAttempts + 1;
    const update: Record<string, unknown> = {
      failedLoginAttempts: newCount,
      loginAttempts: newCount,
    };

    if (newCount >= maxAttempts) {
      const lockUntil = new Date(Date.now() + lockDurationMs);
      update.lockUntil = lockUntil;
      update.lockedUntil = lockUntil;
    }

    await this.userModel.findByIdAndUpdate(userId, { $set: update });
  }

  /** Reset login attempts and clear lock after successful login */
  async resetLoginAttempts(userId: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      $set: { failedLoginAttempts: 0, loginAttempts: 0 },
      $unset: { lockUntil: 1, lockedUntil: 1 },
    });
  }

  /** Reset login attempts, clear lock, and update last login time in a single write operation */
  async resetAttemptsAndUpdateLastLogin(userId: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      $set: {
        failedLoginAttempts: 0,
        loginAttempts: 0,
        lastLoginAt: new Date(),
      },
      $unset: { lockUntil: 1, lockedUntil: 1 },
    });
  }

  async updateTheme(
    userId: string,
    theme: 'light' | 'dark' | 'system',
  ): Promise<UserDocument> {
    const user = await this.userModel.findByIdAndUpdate(
      userId,
      { $set: { theme } },
      { new: true },
    );
    if (!user) throw new NotFoundException('المستخدم غير موجود');
    return user;
  }

  async findByGoogleEmail(googleEmail: string): Promise<UserDocument | null> {
    return this.userModel.findOne({
      googleEmail: googleEmail.trim().toLowerCase(),
    });
  }

  async findByGoogleId(googleId: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ googleId: googleId.trim() });
  }

  async findLinkedGoogleAccount(data: {
    googleId: string;
    googleEmail: string;
  }): Promise<UserDocument | null> {
    return this.userModel.findOne({
      $or: [
        { googleId: data.googleId.trim() },
        { googleEmail: data.googleEmail.trim().toLowerCase() },
      ],
    });
  }
}
