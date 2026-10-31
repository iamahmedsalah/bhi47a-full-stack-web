import {
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import {
  PasswordHasher,
  defaultPasswordHasher,
} from '../../security/password-hasher';
import type { Role } from '@student-portal/shared';
import { reuseRequestRead } from '../../core/metrics/request-query-context';

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
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @Optional()
    private readonly passwordHasher: PasswordHasher = defaultPasswordHasher,
  ) {}

  async findById(id: string): Promise<UserDocument> {
    const user = await this.userModel
      .findById(id)
      .select(
        '+passwordHash +nationalIdHash +resetPasswordToken +googleLinkOtp',
      );
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findByIdForAuth(id: string) {
    return reuseRequestRead(`auth-user:${id}`, async () =>
      this.userModel
        .findById(id)
        .select(
          '_id role staffType name nameAr email phone studentCode googleEmail googleLinkedAt googleLinkPending permissions mustChangePassword tokenVersion isActive lockUntil lockedUntil lastLoginAt lastActiveAt sessionStartedAt lastLogoutAt',
        )
        .lean(),
    );
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

  async countActiveOnlineStudents(windowMinutes = 60): Promise<number> {
    const threshold = new Date(Date.now() - windowMinutes * 60 * 1000);
    return this.userModel.countDocuments({
      role: 'student',
      isActive: true,
      lastActiveAt: { $gte: threshold },
      $expr: {
        $or: [
          { $eq: [{ $ifNull: ['$lastLogoutAt', null] }, null] },
          { $gt: ['$lastActiveAt', '$lastLogoutAt'] },
        ],
      },
    });
  }

  async countActiveOnlineStaff(windowMinutes = 60): Promise<number> {
    const threshold = new Date(Date.now() - windowMinutes * 60 * 1000);
    return this.userModel.countDocuments({
      role: { $in: ['staff', 'admin'] },
      isActive: true,
      lastActiveAt: { $gte: threshold },
      $expr: {
        $or: [
          { $eq: [{ $ifNull: ['$lastLogoutAt', null] }, null] },
          { $gt: ['$lastActiveAt', '$lastLogoutAt'] },
        ],
      },
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
    const passwordHash = await this.passwordHasher.hash(data.password);
    let nationalIdHash: string | undefined;
    let nationalIdMasked: string | undefined;

    if (data.nationalId) {
      nationalIdHash = await this.passwordHasher.hash(data.nationalId);
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
    return this.passwordHasher.verify(password, user.passwordHash);
  }

  async updatePassword(
    userId: string,
    newPassword: string,
    mustChangePassword: boolean = false,
  ): Promise<UserDocument> {
    const passwordHash = await this.passwordHasher.hash(newPassword);
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
    const nationalIdHash = await this.passwordHasher.hash(nationalId);
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
    const passwordHash = await this.passwordHasher.hash(nationalId);
    await this.userModel.findByIdAndUpdate(userId, {
      passwordHash,
      mustChangePassword,
      passwordChangedAt: new Date(Date.now() - 1000),
      $inc: { tokenVersion: 1 },
    });
  }

  async revokeAllSessions(userId: string) {
    await this.userModel.updateOne(
      { _id: userId },
      { $inc: { tokenVersion: 1 } },
    );
  }

  async consumePasswordReset(userId: string, expectedHash: string) {
    return this.userModel.findOneAndUpdate(
      {
        _id: userId,
        resetPasswordToken: expectedHash,
        resetPasswordExpireAt: { $gt: new Date() },
      },
      { $unset: { resetPasswordToken: 1, resetPasswordExpireAt: 1 } },
    );
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

  async updateLastLogin(
    userId: string,
    meta?: {
      device?: string;
      route?: string;
      action?: string;
      actionAr?: string;
    },
  ): Promise<void> {
    const now = new Date();
    await this.userModel.findByIdAndUpdate(userId, {
      $set: {
        lastLoginAt: now,
        sessionStartedAt: now,
        lastActiveAt: now,
        ...(meta?.device ? { sessionDevice: meta.device } : {}),
        lastAction: meta?.action || 'Logged into Portal',
        lastActionAr: meta?.actionAr || 'تسجيل الدخول إلى البوابة',
        lastActionRoute: meta?.route || '/dashboard',
      },
      $unset: { lastLogoutAt: 1 },
    });
  }

  async recordUserActivity(
    userId: string,
    data: {
      route?: string;
      action?: string;
      actionAr?: string;
      device?: string;
    },
  ): Promise<void> {
    const now = new Date();
    const update: Record<string, any> = {
      lastActiveAt: now,
    };
    if (data.route) update.lastActionRoute = data.route;
    if (data.action) update.lastAction = data.action;
    if (data.actionAr) update.lastActionAr = data.actionAr;
    if (data.device) update.sessionDevice = data.device;

    // Login (updateLastLogin / resetAttemptsAndUpdateLastLogin) is the only
    // thing allowed to clear lastLogoutAt. A late heartbeat from a session that
    // was just logged out must not mark the user online again.
    const existing = await this.findByIdForAuth(userId);

    if (!existing || existing.lastLogoutAt) {
      return;
    }

    const lastActiveTime = existing.lastActiveAt
      ? new Date(existing.lastActiveAt).getTime()
      : 0;
    const sessionInactivityLapseMs = 25 * 60 * 1000;
    if (
      !existing.sessionStartedAt ||
      now.getTime() - lastActiveTime > sessionInactivityLapseMs
    ) {
      update.sessionStartedAt = now;
    }

    await this.userModel.updateOne(
      {
        _id: userId,
        $or: [{ lastLogoutAt: { $exists: false } }, { lastLogoutAt: null }],
      },
      { $set: update },
    );
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
    const hashedOtp = await this.passwordHasher.hash(otp);
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

    const updated = await this.userModel
      .findByIdAndUpdate(
        userId,
        { $inc: { failedLoginAttempts: 1, loginAttempts: 1 } },
        { new: true },
      )
      .select('failedLoginAttempts loginAttempts')
      .lean();
    if (!updated) return;

    const newCount = updated.failedLoginAttempts ?? updated.loginAttempts ?? 0;
    if (newCount >= maxAttempts) {
      const lockUntil = new Date(Date.now() + lockDurationMs);
      await this.userModel.updateOne(
        {
          _id: userId,
          $or: [
            { lockUntil: { $exists: false } },
            { lockUntil: { $lte: new Date() } },
          ],
        },
        {
          $set: { lockUntil, lockedUntil: lockUntil },
          $inc: { tokenVersion: 1 },
        },
      );
    }
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
    const now = new Date();
    await this.userModel.findByIdAndUpdate(userId, {
      $set: {
        failedLoginAttempts: 0,
        loginAttempts: 0,
        lastLoginAt: now,
        sessionStartedAt: now,
        lastActiveAt: now,
        lastAction: 'Logged into Portal',
        lastActionAr: 'تسجيل الدخول إلى البوابة',
      },
      $unset: { lockUntil: 1, lockedUntil: 1, lastLogoutAt: 1 },
    });
  }

  /** Record user logout to immediately clear active status */
  async recordLogout(userId: string): Promise<void> {
    const now = new Date();
    await this.userModel.findByIdAndUpdate(userId, {
      $set: {
        lastActiveAt: new Date(0),
        lastLoginAt: new Date(0),
        sessionStartedAt: new Date(0),
        lastLogoutAt: now,
        lastAction: 'Logged out',
        lastActionAr: 'تم تسجيل الخروج',
      },
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
    return this.userModel.findOne({ googleId: data.googleId.trim() });
  }

  async getActiveUsersForSessions(threshold: Date) {
    return this.userModel
      .find({
        isActive: true,
        lastActiveAt: { $gte: threshold },
        $expr: {
          $or: [
            { $eq: [{ $ifNull: ['$lastLogoutAt', null] }, null] },
            { $gt: ['$lastActiveAt', '$lastLogoutAt'] },
          ],
        },
      })
      .select(
        '_id name role staffType userCode studentCode email lastLoginAt sessionStartedAt lastActiveAt lastLogoutAt lastAction lastActionAr lastActionRoute sessionDevice avatarUrl',
      )
      .sort({ lastActiveAt: -1 })
      .limit(200)
      .lean();
  }

  /**
   * Find all user accounts that are currently locked out due to brute-force protection
   * or flagged with excess failed login attempts.
   */
  async findLockedAccounts() {
    const now = new Date();
    return this.userModel
      .find({
        $or: [
          { lockUntil: { $gt: now } },
          { lockedUntil: { $gt: now } },
          { failedLoginAttempts: { $gte: 5 } },
          { loginAttempts: { $gte: 5 } },
        ],
      })
      .select(
        '_id name nameAr role staffType userCode studentCode staffCode email nationalId failedLoginAttempts loginAttempts lockUntil lockedUntil lastLoginAt updatedAt avatarUrl',
      )
      .sort({ lockUntil: -1, lockedUntil: -1, failedLoginAttempts: -1 })
      .lean();
  }

  /**
   * Count how many user accounts are currently locked or flagged.
   */
  async countLockedAccounts(): Promise<number> {
    const now = new Date();
    return this.userModel.countDocuments({
      $or: [
        { lockUntil: { $gt: now } },
        { lockedUntil: { $gt: now } },
        { failedLoginAttempts: { $gte: 5 } },
        { loginAttempts: { $gte: 5 } },
      ],
    });
  }

  /**
   * Instantly unlock a locked account by clearing lockout timestamps and reset failed attempts
   */
  async unlockAccount(userId: string) {
    const res = await this.userModel.findByIdAndUpdate(userId, {
      $set: { failedLoginAttempts: 0, loginAttempts: 0 },
      $unset: { lockUntil: 1, lockedUntil: 1 },
    });
    return {
      success: Boolean(res),
      message: 'تم فك حظر وقفل الحساب بنجاح، ويمكن للمستخدم الدخول فوراً الآن',
    };
  }

  /**
   * Bulk unlock all currently locked accounts immediately
   */
  async unlockAllAccounts() {
    const now = new Date();
    const result = await this.userModel.updateMany(
      {
        $or: [
          { lockUntil: { $gt: now } },
          { lockedUntil: { $gt: now } },
          { failedLoginAttempts: { $gte: 5 } },
          { loginAttempts: { $gte: 5 } },
        ],
      },
      {
        $set: { failedLoginAttempts: 0, loginAttempts: 0 },
        $unset: { lockUntil: 1, lockedUntil: 1 },
      },
    );
    return {
      success: true,
      unlockedCount: result.modifiedCount,
      message: `تم فك حظر وقفل جميع الحسابات بنجاح (${result.modifiedCount} حساب)`,
    };
  }
}
