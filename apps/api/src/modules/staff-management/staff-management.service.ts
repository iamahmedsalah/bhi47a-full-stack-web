import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from '../users/schemas/user.schema';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { QueryStaffDto } from './dto/query-staff.dto';
import { UpdateStaffPermissionsDto } from './dto/update-staff-permissions.dto';
import { ResetStaffPasswordDto } from './dto/reset-staff-password.dto';
import { DeactivateStaffDto } from './dto/deactivate-staff.dto';
import {
  StaffAuditAction,
  StaffAuditLog,
  StaffAuditLogDocument,
} from './schemas/staff-audit-log.schema';

const STAFF_PUBLIC_PROJECTION =
  '_id userCode name username email phone role permissions isActive deactivatedAt deactivationReason lastLoginAt createdAt updatedAt';

export interface StaffItem {
  _id: string;
  userCode?: string;
  name: string;
  username?: string;
  email?: string;
  phone?: string;
  role: 'staff';
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
  username?: string;
  email?: string;
  phone?: string;
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
export class StaffManagementService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<UserDocument>,
    @InjectModel(StaffAuditLog.name)
    private readonly auditLogs: Model<StaffAuditLogDocument>,
  ) {}

  async list(query: QueryStaffDto) {
    const filter: FilterQuery<UserDocument> = { role: 'staff' };
    if (query.status !== 'all') {
      filter.isActive = query.status === 'active';
    }
    if (query.search?.trim()) {
      const search = new RegExp(escapeRegExp(query.search.trim()), 'i');
      filter.$or = [
        { name: search },
        { email: search },
        { username: search },
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

  async getById(id: string): Promise<StaffItem> {
    const record = await this.findStaffRecord(id);
    return this.toStaffItem(record);
  }

  async create(dto: CreateStaffDto, actorId: string): Promise<StaffItem> {
    const email = dto.email.trim().toLowerCase();
    const username = dto.username?.trim().toLowerCase();
    await this.assertUniqueIdentity(email, username);

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const userCode = await this.generateStaffCode();

    try {
      const created = await this.users.create({
        role: 'staff',
        userCode,
        name: dto.name.trim(),
        email,
        username,
        phone: dto.phone?.trim() || undefined,
        passwordHash,
        mustChangePassword: true,
        permissions: dto.permissions ?? [],
        isActive: true,
      });
      await this.recordAudit(actorId, created._id.toString(), 'created', {
        permissions: created.permissions,
      });
      return this.getById(created._id.toString());
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictException(
          'Staff email, username, or code already exists',
        );
      }
      throw error;
    }
  }

  async update(
    id: string,
    dto: UpdateStaffDto,
    actorId: string,
  ): Promise<StaffItem> {
    const current = await this.findStaffDocument(id);
    const email = dto.email?.trim().toLowerCase();
    const username = dto.username?.trim().toLowerCase();
    await this.assertUniqueIdentity(email, username, id);

    const changes: Record<string, { from: unknown; to: unknown }> = {};
    const nextValues = {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(email !== undefined ? { email } : {}),
      ...(username !== undefined ? { username } : {}),
      ...(dto.phone !== undefined
        ? { phone: dto.phone.trim() || undefined }
        : {}),
    };

    for (const [key, value] of Object.entries(nextValues)) {
      const previous = current.get(key);
      if (previous !== value) changes[key] = { from: previous, to: value };
    }

    try {
      current.set(nextValues);
      await current.save();
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictException('Staff email or username already exists');
      }
      throw error;
    }

    if (Object.keys(changes).length > 0) {
      await this.recordAudit(actorId, id, 'profile_updated', changes);
    }
    return this.getById(id);
  }

  async updatePermissions(
    id: string,
    dto: UpdateStaffPermissionsDto,
    actorId: string,
  ): Promise<StaffItem> {
    const staff = await this.findStaffDocument(id);
    const before = [...(staff.permissions ?? [])].sort();
    const after = [...dto.permissions].sort();
    staff.permissions = after;
    await staff.save();
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
  ): Promise<{ message: string }> {
    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    const result = await this.users.updateOne(
      { _id: id, role: 'staff' },
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
      throw new NotFoundException('Staff member not found');
    await this.recordAudit(actorId, id, 'password_reset');
    return { message: 'Staff password reset successfully' };
  }

  async deactivate(
    id: string,
    dto: DeactivateStaffDto,
    actorId: string,
  ): Promise<StaffItem> {
    const result = await this.users.updateOne(
      { _id: id, role: 'staff' },
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
      throw new NotFoundException('Staff member not found');
    await this.recordAudit(actorId, id, 'deactivated', undefined, dto.reason);
    return this.getById(id);
  }

  async activate(id: string, actorId: string): Promise<StaffItem> {
    const result = await this.users.updateOne(
      { _id: id, role: 'staff' },
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
      throw new NotFoundException('Staff member not found');
    await this.recordAudit(actorId, id, 'activated');
    return this.getById(id);
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

  private async findStaffDocument(id: string) {
    const staff = await this.users.findOne({ _id: id, role: 'staff' });
    if (!staff) throw new NotFoundException('Staff member not found');
    return staff;
  }

  private async findStaffRecord(id: string) {
    const staff = await this.users
      .findOne({ _id: id, role: 'staff' })
      .select(STAFF_PUBLIC_PROJECTION)
      .lean<StaffRecord>();
    if (!staff) throw new NotFoundException('Staff member not found');
    return staff;
  }

  private toStaffItem(record: StaffRecord): StaffItem {
    return {
      _id: record._id.toString(),
      userCode: record.userCode,
      name: record.name,
      username: record.username,
      email: record.email,
      phone: record.phone,
      role: 'staff',
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
    const existing = await this.users.exists({
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
      $or: identityFilters,
    });
    if (existing)
      throw new ConflictException('Staff email or username already exists');
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

  private async recordAudit(
    actorId: string,
    targetStaffId: string,
    action: StaffAuditAction,
    changes?: Record<string, unknown>,
    reason?: string,
  ) {
    await this.auditLogs.create({
      actorId: new Types.ObjectId(actorId),
      targetStaffId: new Types.ObjectId(targetStaffId),
      action,
      changes,
      reason: reason?.trim() || undefined,
    });
  }
}
