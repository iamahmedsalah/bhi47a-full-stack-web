import { CacheService } from '../../core/cache/cache.service';
import type { ClientSession } from 'mongoose';
import { StaffCourseAssignmentsService } from './staff-course-assignments.service';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import {
  PasswordHasher,
  defaultPasswordHasher,
} from '../../security/password-hasher';
import { User, UserDocument } from '../users/schemas/user.schema';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { QueryStaffDto } from './dto/query-staff.dto';
import type { QueryStaffCoursesDto } from './dto/query-staff-courses.dto';
import { UpdateStaffPermissionsDto } from './dto/update-staff-permissions.dto';
import { ResetStaffPasswordDto } from './dto/reset-staff-password.dto';
import { DeactivateStaffDto } from './dto/deactivate-staff.dto';
import {
  StaffAuditAction,
  StaffAuditLog,
  StaffAuditLogDocument,
} from './schemas/staff-audit-log.schema';
import {
  DOCTOR_CONTROL_DEFAULT_PERMISSIONS,
  STAFF_TYPE_DEFAULT_PERMISSIONS,
  inferDoctorPrefix,
  isAcademicTeachingStaff,
  isSupportingAcademicStaff,
  type StaffType,
  type DoctorPrefix,
} from '@student-portal/shared';

const STAFF_PUBLIC_PROJECTION =
  '_id userCode name nameAr username email phone role staffType titlePrefix permissions isActive deactivatedAt deactivationReason lastLoginAt createdAt updatedAt';

export interface StaffItem {
  _id: string;
  userCode?: string;
  name: string;
  nameAr?: string;
  username?: string;
  email?: string;
  phone?: string;
  role: 'admin' | 'staff';
  staffType?: StaffType;
  titlePrefix?: DoctorPrefix;
  permissions: string[];
  isActive: boolean;
  deactivatedAt?: Date;
  deactivationReason?: string;
  lastLoginAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

interface StaffRecord {
  _id: Types.ObjectId;
  userCode?: string;
  name: string;
  nameAr?: string;
  username?: string;
  email?: string;
  phone?: string;
  role?: 'admin' | 'staff';
  staffType?: StaffType;
  titlePrefix?: DoctorPrefix;
  permissions?: string[];
  isActive?: boolean;
  deactivatedAt?: Date;
  deactivationReason?: string;
  lastLoginAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isDuplicateKeyError(error: unknown): error is { code: number } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000
  );
}

@Injectable()
export class StaffManagementService implements OnModuleInit {
  private readonly logger = new Logger(StaffManagementService.name);
  constructor(
    @InjectModel(User.name) private readonly users: Model<UserDocument>,
    @InjectModel(StaffAuditLog.name)
    private readonly auditLogs: Model<StaffAuditLogDocument>,
    @Optional()
    private readonly passwordHasher: PasswordHasher = defaultPasswordHasher,
    @Optional()
    private readonly courseAssignments?: StaffCourseAssignmentsService,
    @Optional() private readonly cache?: CacheService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureExistingDoctorsControlPermissions();
    if (!this.courseAssignments) return;
    try {
      const count = await this.courseAssignments.restoreStoredCourseGrants(
        this.users,
      );
      if (count)
        this.logger.log(
          `Checked ${count} stored Control grants for missing permissions`,
        );
    } catch (error) {
      this.logger.error(
        'Stored Control course-grant reconciliation failed. It will be retried on startup.',
        error instanceof Error ? error.name : undefined,
      );
    }
  }

  /**
   * One-time idempotent backfill so existing faculty doctors automatically
   * receive default Control grade-entry permissions without manual editing.
   */
  async ensureExistingDoctorsControlPermissions(): Promise<number> {
    if (typeof this.users?.updateMany !== 'function') return 0;
    try {
      const res = await this.users.updateMany(
        {
          role: 'staff',
          staffType: 'doctor',
          controlEntryDefaultsInitialized: { $ne: true },
        },
        {
          $addToSet: {
            permissions: { $each: [...DOCTOR_CONTROL_DEFAULT_PERMISSIONS] },
          },
          $set: { controlEntryDefaultsInitialized: true },
        },
      );
      const count = res.modifiedCount ?? 0;
      this.logger.log(
        `Control grade-entry defaults initialized for ${count} doctor accounts`,
      );
      return count;
    } catch (error) {
      this.logger.error(
        'Doctor Control permission backfill failed. Its remaining accounts will be retried on startup.',
        error instanceof Error ? error.stack : undefined,
      );
      return 0;
    }
  }

  async list(query: QueryStaffDto, actorRole?: string) {
    const filter: FilterQuery<UserDocument> = {};
    if (actorRole === 'admin') {
      if (query.role === 'admin') {
        filter.role = 'admin';
      } else if (query.role === 'staff') {
        filter.role = 'staff';
      } else {
        filter.role = { $in: ['staff', 'admin'] };
      }
    } else {
      filter.role = 'staff';
    }

    if (query.status !== 'all') {
      filter.isActive = query.status === 'active';
    }
    if (query.staffType && query.staffType !== 'all') {
      filter.staffType = query.staffType;
    }
    if (query.search?.trim()) {
      const search = new RegExp(escapeRegExp(query.search.trim()), 'i');
      filter.$or = [
        { name: search },
        { nameAr: search },
        { email: search },
        { username: search },
        { phone: search },
        { userCode: search },
      ];
    }

    const skip = (query.page - 1) * query.limit;
    const [records, total] = await Promise.all([
      this.users
        .find(filter)
        .select(STAFF_PUBLIC_PROJECTION)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(query.limit)
        .lean<StaffRecord[]>(),
      this.users.countDocuments(filter),
    ]);

    return {
      items: records.map((record) => this.toStaffItem(record)),
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit),
    };
  }

  async getById(id: string, session?: ClientSession): Promise<StaffItem> {
    const record = await this.findStaffRecord(id, session);
    return this.toStaffItem(record);
  }

  async listFormCourses(query: QueryStaffCoursesDto, staffId?: string) {
    if (staffId) await this.findStaffRecord(staffId);
    return this.courseAssignments!.list(query, staffId);
  }

  async listGradeEntryCourseIds(staffId: string) {
    await this.findStaffRecord(staffId);
    const courseIds = this.courseAssignments
      ? await this.courseAssignments.listGradeEntryCourseIds(staffId)
      : [];
    return { courseIds };
  }

  async create(
    dto: CreateStaffDto,
    actorId: string,
    actorRole?: string,
    session?: ClientSession,
  ): Promise<StaffItem> {
    if (
      actorRole !== 'admin' &&
      (dto.permissions !== undefined || dto.gradeEntryCourseIds !== undefined)
    ) {
      throw new ForbiddenException(
        'Only administrators may assign staff permissions',
      );
    }
    if (dto.gradeEntryCourseIds?.length && !dto.courseIds?.length) {
      throw new BadRequestException(
        'Assign courses before enabling grade entry',
      );
    }
    if (
      actorRole !== 'admin' &&
      dto.staffType === 'doctor' &&
      dto.courseIds?.length
    ) {
      throw new ForbiddenException(
        'Only administrators may assign courses to doctors',
      );
    }
    if (
      (dto.courseIds?.length || dto.gradeEntryCourseIds?.length) &&
      !session
    ) {
      const result = await this.users.db.transaction((transaction) =>
        this.create(dto, actorId, actorRole, transaction),
      );
      await this.cache?.delPattern('courses:*');
      return result;
    }
    const targetRole =
      actorRole === 'admin' && dto.role === 'admin' ? 'admin' : 'staff';

    if (actorRole !== 'admin') {
      if (dto.role === 'admin') {
        throw new ForbiddenException(
          'Administrative staff cannot create administrator accounts',
        );
      }
      if (!isAcademicTeachingStaff(dto.staffType)) {
        throw new ForbiddenException(
          'Administrative staff may only create Doctor and Teaching Assistant accounts',
        );
      }
    }

    const email = dto.email.trim().toLowerCase();
    const username = dto.username?.trim().toLowerCase() || undefined;
    await this.assertUniqueIdentity(email, username);

    const passwordHash = await this.passwordHasher.hash(dto.password);
    const userCode =
      targetRole === 'admin'
        ? await this.generateAdminCode()
        : await this.generateStaffCode();
    const staffType =
      targetRole === 'admin' ? undefined : dto.staffType || 'administrative';
    const basePermissions =
      targetRole === 'admin'
        ? []
        : dto.permissions !== undefined
          ? dto.permissions
          : [...(STAFF_TYPE_DEFAULT_PERMISSIONS[staffType!] || [])];
    const permissions = basePermissions;

    const titlePrefix =
      staffType === 'doctor'
        ? (dto.titlePrefix ??
          inferDoctorPrefix(dto.nameAr) ??
          inferDoctorPrefix(dto.name) ??
          'dr')
        : staffType === 'dean'
          ? (dto.titlePrefix ??
            inferDoctorPrefix(dto.nameAr) ??
            inferDoctorPrefix(dto.name) ??
            undefined)
          : undefined;

    try {
      const payload = {
        role: targetRole,
        staffType,
        titlePrefix,
        userCode,
        name: dto.name.trim(),
        nameAr: dto.nameAr?.trim() || undefined,
        email,
        username,
        phone: dto.phone?.trim() || undefined,
        passwordHash,
        mustChangePassword: true,
        permissions,
        ...(staffType === 'doctor'
          ? { controlEntryDefaultsInitialized: true }
          : {}),
        isActive: true,
      };
      const created = session
        ? (await this.users.create([payload], { session }))[0]
        : await this.users.create(payload);
      if (session && dto.courseIds?.length) {
        await this.courseAssignments!.sync(created, dto.courseIds, session);
      }
      if (session && dto.gradeEntryCourseIds !== undefined) {
        await this.courseAssignments!.setGradeEntryCourses(
          created,
          dto.gradeEntryCourseIds,
          session,
        );
      }
      if (
        session &&
        isSupportingAcademicStaff(created.staffType) &&
        dto.gradeEntryCourseIds !== undefined
      ) {
        await this.courseAssignments!.reconcileEntryPermissions(
          created,
          this.users,
          session,
        );
      }
      await this.recordAudit(
        actorId,
        created._id.toString(),
        'created',
        {
          role: created.role,
          staffType: created.staffType,
          titlePrefix: created.titlePrefix,
          permissions: created.permissions,
          courseIds: dto.courseIds,
          ...(dto.gradeEntryCourseIds !== undefined
            ? { gradeEntryCourseIds: dto.gradeEntryCourseIds }
            : {}),
        },
        undefined,
        session,
      );
      return this.getById(created._id.toString(), session);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictException(
          'Email, username, or user code already exists',
        );
      }
      throw error;
    }
  }

  async update(
    id: string,
    dto: UpdateStaffDto,
    actorId: string,
    actorRole?: string,
    session?: ClientSession,
  ): Promise<StaffItem> {
    if (
      actorRole !== 'admin' &&
      (dto.permissions !== undefined || dto.gradeEntryCourseIds !== undefined)
    ) {
      throw new ForbiddenException(
        'Only administrators may assign staff permissions',
      );
    }
    if (
      (dto.courseIds !== undefined || dto.gradeEntryCourseIds !== undefined) &&
      !session
    ) {
      const result = await this.users.db.transaction((transaction) =>
        this.update(id, dto, actorId, actorRole, transaction),
      );
      await this.cache?.delPattern('courses:*');
      return result;
    }
    const current = await this.findStaffDocument(id, session);
    if (dto.permissions !== undefined && current.role === 'admin')
      throw new ForbiddenException(
        'Administrator permissions cannot be customized',
      );

    if (actorRole !== 'admin') {
      if (
        current.role === 'admin' ||
        !isAcademicTeachingStaff(current.staffType)
      ) {
        throw new ForbiddenException(
          'Administrative staff cannot modify administrator or administrative accounts',
        );
      }
      if (dto.staffType && !isAcademicTeachingStaff(dto.staffType)) {
        throw new ForbiddenException(
          'Administrative staff may only manage Doctor and Teaching Assistant accounts',
        );
      }
      if (
        (dto.staffType === 'doctor' && current.staffType !== 'doctor') ||
        (current.staffType === 'doctor' &&
          (dto.courseIds !== undefined ||
            dto.email !== undefined ||
            dto.username !== undefined ||
            (dto.staffType !== undefined && dto.staffType !== 'doctor')))
      ) {
        throw new ForbiddenException(
          'Only administrators may change doctor assignments or account identity',
        );
      }
    }

    const email = dto.email?.trim().toLowerCase();
    const username = dto.username?.trim().toLowerCase() || undefined;
    await this.assertUniqueIdentity(email, username, id);

    const effectiveStaffType = dto.staffType ?? current.staffType;
    const titlePrefix =
      current.role === 'staff' && effectiveStaffType === 'doctor'
        ? (dto.titlePrefix ??
          (current.staffType === 'doctor' || current.staffType === 'dean'
            ? current.titlePrefix
            : undefined) ??
          inferDoctorPrefix(dto.nameAr ?? current.nameAr) ??
          inferDoctorPrefix(dto.name ?? current.name) ??
          'dr')
        : current.role === 'staff' && effectiveStaffType === 'dean'
          ? (dto.titlePrefix ??
            (current.staffType === 'dean' || current.staffType === 'doctor'
              ? current.titlePrefix
              : undefined) ??
            inferDoctorPrefix(dto.nameAr ?? current.nameAr) ??
            inferDoctorPrefix(dto.name ?? current.name) ??
            undefined)
          : undefined;

    const initializedDoctor =
      effectiveStaffType === 'doctor' && current.staffType !== 'doctor';
    const resolvedPermissions =
      dto.permissions ??
      (initializedDoctor
        ? [
            ...new Set([
              ...(current.permissions ?? []),
              ...DOCTOR_CONTROL_DEFAULT_PERMISSIONS,
            ]),
          ]
        : undefined);

    const changes: Record<string, { from: unknown; to: unknown }> = {};
    const nextValues = {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.nameAr !== undefined
        ? { nameAr: dto.nameAr.trim() || undefined }
        : {}),
      ...(email !== undefined ? { email } : {}),
      ...(dto.username !== undefined ? { username } : {}),
      ...(dto.phone !== undefined
        ? { phone: dto.phone.trim() || undefined }
        : {}),
      ...(dto.staffType !== undefined ? { staffType: dto.staffType } : {}),
      titlePrefix,
      ...(initializedDoctor ? { controlEntryDefaultsInitialized: true } : {}),
      ...(resolvedPermissions !== undefined
        ? { permissions: resolvedPermissions }
        : {}),
    };

    for (const [key, value] of Object.entries(nextValues)) {
      if (
        key === 'permissions' &&
        JSON.stringify([...(current.permissions ?? [])].sort()) ===
          JSON.stringify([...(resolvedPermissions ?? [])].sort())
      )
        continue;
      const previous = current.get(key);
      if (previous !== value) changes[key] = { from: previous, to: value };
    }

    try {
      current.set(nextValues);
      if (dto.permissions !== undefined && changes.permissions)
        current.tokenVersion = (current.tokenVersion ?? 0) + 1;
      await current.save(session ? { session } : undefined);
      if (session && dto.courseIds !== undefined) {
        await this.courseAssignments!.sync(current, dto.courseIds, session);
        changes.courseIds = { from: undefined, to: dto.courseIds };
      }
      if (session && dto.gradeEntryCourseIds !== undefined) {
        await this.courseAssignments!.setGradeEntryCourses(
          current,
          dto.gradeEntryCourseIds,
          session,
        );
        changes.gradeEntryCourseIds = {
          from: undefined,
          to: dto.gradeEntryCourseIds,
        };
      }
      if (
        session &&
        isSupportingAcademicStaff(current.staffType) &&
        (dto.courseIds !== undefined || dto.gradeEntryCourseIds !== undefined)
      ) {
        await this.courseAssignments!.reconcileEntryPermissions(
          current,
          this.users,
          session,
        );
      }
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictException('Email or username already exists');
      }
      throw error;
    }

    if (Object.keys(changes).length > 0) {
      await this.recordAudit(
        actorId,
        id,
        'profile_updated',
        changes,
        undefined,
        session,
      );
    }
    if (!session) await this.cache?.delPattern('courses:*');
    return this.getById(id, session);
  }

  async updatePermissions(
    id: string,
    dto: UpdateStaffPermissionsDto,
    actorId: string,
    actorRole?: string,
  ): Promise<StaffItem> {
    if (actorRole !== 'admin') {
      throw new ForbiddenException(
        'Only administrators can directly modify permission sets',
      );
    }
    const staff = await this.findStaffDocument(id);
    const before = [...(staff.permissions ?? [])].sort();
    const after = [...dto.permissions].sort();
    staff.permissions = after;
    staff.tokenVersion = (staff.tokenVersion ?? 0) + 1;
    await staff.save();
    await this.cache?.delPattern('courses:*');
    await this.recordAudit(actorId, id, 'permissions_updated', {
      before,
      after,
    });
    return this.getById(id);
  }

  async resetPassword(
    id: string,
    dto: ResetStaffPasswordDto,
    actorId: string,
    actorRole?: string,
  ): Promise<{ message: string }> {
    const current = await this.findStaffDocument(id);
    if (actorRole !== 'admin') {
      if (
        current.role === 'admin' ||
        current.staffType === 'doctor' ||
        !isAcademicTeachingStaff(current.staffType)
      ) {
        throw new ForbiddenException(
          'Administrative staff cannot reset passwords for administrator or administrative accounts',
        );
      }
    }

    const passwordHash = await this.passwordHasher.hash(dto.newPassword);
    const result = await this.users.updateOne(
      { _id: id, role: { $in: ['staff', 'admin'] } },
      {
        $set: {
          passwordHash,
          mustChangePassword: true,
          passwordChangedAt: new Date(),
          failedLoginAttempts: 0,
          loginAttempts: 0,
        },
        $unset: {
          refreshTokenHash: 1,
          refreshTokenExpiresAt: 1,
          lockUntil: 1,
          lockedUntil: 1,
        },
        $inc: { tokenVersion: 1 },
      },
    );
    if (result.matchedCount === 0)
      throw new NotFoundException('Account not found');
    await this.recordAudit(actorId, id, 'password_reset');
    return { message: 'Password reset successfully' };
  }

  async deactivate(
    id: string,
    dto: DeactivateStaffDto,
    actorId: string,
    actorRole?: string,
  ): Promise<StaffItem> {
    const current = await this.findStaffDocument(id);
    if (actorRole !== 'admin') {
      if (
        current.role === 'admin' ||
        current.staffType === 'doctor' ||
        !isAcademicTeachingStaff(current.staffType)
      ) {
        throw new ForbiddenException(
          'Administrative staff cannot deactivate administrator or administrative accounts',
        );
      }
    }

    const result = await this.users.updateOne(
      { _id: id, role: { $in: ['staff', 'admin'] } },
      {
        $set: {
          isActive: false,
          deactivatedAt: new Date(),
          deactivatedBy: new Types.ObjectId(actorId),
          deactivationReason: dto.reason?.trim() || undefined,
        },
        $unset: { refreshTokenHash: 1, refreshTokenExpiresAt: 1 },
        $inc: { tokenVersion: 1 },
      },
    );
    if (result.matchedCount === 0)
      throw new NotFoundException('Account not found');
    await this.recordAudit(actorId, id, 'deactivated', undefined, dto.reason);
    return this.getById(id);
  }

  async activate(
    id: string,
    actorId: string,
    actorRole?: string,
  ): Promise<StaffItem> {
    const current = await this.findStaffDocument(id);
    if (actorRole !== 'admin') {
      if (
        current.role === 'admin' ||
        current.staffType === 'doctor' ||
        !isAcademicTeachingStaff(current.staffType)
      ) {
        throw new ForbiddenException(
          'Administrative staff cannot activate administrator or administrative accounts',
        );
      }
    }

    const result = await this.users.updateOne(
      { _id: id, role: { $in: ['staff', 'admin'] } },
      {
        $set: { isActive: true },
        $unset: {
          deactivatedAt: 1,
          deactivatedBy: 1,
          deactivationReason: 1,
          lockUntil: 1,
          lockedUntil: 1,
        },
      },
    );
    if (result.matchedCount === 0)
      throw new NotFoundException('Account not found');
    await this.recordAudit(actorId, id, 'activated');
    return this.getById(id);
  }

  async delete(id: string, actorId: string, actorRole?: string) {
    if (actorRole !== 'admin') {
      throw new ForbiddenException(
        'Only administrators can permanently delete accounts',
      );
    }
    const staff = await this.findStaffDocument(id);
    await this.recordAudit(actorId, id, 'deleted', {
      userCode: staff.userCode,
      name: staff.name,
      email: staff.email,
      username: staff.username,
      role: staff.role,
      staffType: staff.staffType,
    });
    await this.users.deleteOne({ _id: staff._id });
    return { success: true, message: 'Account deleted successfully' };
  }

  async listAudit(id: string) {
    await this.findStaffDocument(id);
    return this.auditLogs
      .find({ targetStaffId: new Types.ObjectId(id) })
      .select('_id actorId targetStaffId action changes reason createdAt')
      .populate('actorId', 'name email userCode')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
  }

  private async findStaffDocument(id: string, session?: ClientSession) {
    const query = this.users.findOne({
      _id: id,
      role: { $in: ['staff', 'admin'] },
    });
    const staff = await (session ? query.session(session) : query);
    if (!staff) throw new NotFoundException('Account not found');
    return staff;
  }

  private async findStaffRecord(id: string, session?: ClientSession) {
    const query = this.users
      .findOne({ _id: id, role: { $in: ['staff', 'admin'] } })
      .select(STAFF_PUBLIC_PROJECTION);
    const staff = await (
      session ? query.session(session) : query
    ).lean<StaffRecord>();
    if (!staff) throw new NotFoundException('Account not found');
    return staff;
  }

  private toStaffItem(record: StaffRecord): StaffItem {
    return {
      _id: record._id.toString(),
      userCode: record.userCode,
      name: record.name,
      nameAr: record.nameAr,
      username: record.username,
      email: record.email,
      phone: record.phone,
      role: record.role || 'staff',
      titlePrefix:
        record.role !== 'admin' && record.staffType === 'doctor'
          ? (record.titlePrefix ??
            inferDoctorPrefix(record.nameAr) ??
            inferDoctorPrefix(record.name) ??
            'dr')
          : record.role !== 'admin' && record.staffType === 'dean'
            ? (record.titlePrefix ??
              inferDoctorPrefix(record.nameAr) ??
              inferDoctorPrefix(record.name) ??
              undefined)
            : undefined,
      staffType:
        record.staffType ||
        (record.role === 'admin' ? undefined : 'administrative'),
      permissions: record.permissions ?? [],
      isActive: record.isActive ?? true,
      deactivatedAt: record.deactivatedAt,
      deactivationReason: record.deactivationReason,
      lastLoginAt: record.lastLoginAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  private async assertUniqueIdentity(
    email?: string,
    username?: string,
    excludeId?: string,
  ) {
    if (!email && !username) return;
    const identityFilters: FilterQuery<UserDocument>[] = [];
    if (email) identityFilters.push({ email });
    if (username) identityFilters.push({ username });
    const existing = await this.users
      .findOne({
        ...(excludeId ? { _id: { $ne: excludeId } } : {}),
        $or: identityFilters,
      })
      .select('email username')
      .lean<{ email?: string; username?: string }>();
    if (existing) {
      const field = email && existing.email === email ? 'email' : 'username';
      throw new ConflictException({
        message: `Staff ${field} already exists`,
        code: field === 'email' ? 'STAFF_EMAIL_TAKEN' : 'STAFF_USERNAME_TAKEN',
        errors: { [field]: field === 'email' ? 'emailTaken' : 'usernameTaken' },
      });
    }
  }

  private async generateStaffCode() {
    const last = await this.users
      .findOne({ role: 'staff', userCode: /^STF-\d+$/ })
      .select('userCode')
      .sort({ userCode: -1 })
      .lean<{ userCode?: string }>();
    const current = Number.parseInt(last?.userCode?.split('-')[1] ?? '0', 10);
    return `STF-${String((Number.isFinite(current) ? current : 0) + 1).padStart(4, '0')}`;
  }

  private async generateAdminCode() {
    const last = await this.users
      .findOne({ role: 'admin', userCode: /^ADM-\d+$/ })
      .select('userCode')
      .sort({ userCode: -1 })
      .lean<{ userCode?: string }>();
    const current = Number.parseInt(last?.userCode?.split('-')[1] ?? '0', 10);
    return `ADM-${String((Number.isFinite(current) ? current : 0) + 1).padStart(4, '0')}`;
  }

  private async recordAudit(
    actorId: string,
    targetStaffId: string,
    action: StaffAuditAction,
    changes?: Record<string, unknown>,
    reason?: string,
    session?: ClientSession,
  ) {
    const payload = {
      actorId: new Types.ObjectId(actorId),
      targetStaffId: new Types.ObjectId(targetStaffId),
      action,
      changes,
      reason: reason?.trim() || undefined,
    };
    if (session) await this.auditLogs.create([payload], { session });
    else await this.auditLogs.create(payload);
  }
}
