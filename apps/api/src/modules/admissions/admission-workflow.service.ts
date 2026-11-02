import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  Types,
  type ClientSession,
  type Model,
  type FilterQuery,
} from 'mongoose';
import { randomBytes, randomInt } from 'node:crypto';
import {
  canTransitionAdmission,
  admissionApplicantStatus,
  isAdmissionAcademicYear,
  isAdmissionNationalId,
  PERMISSIONS,
  type AdmissionRequestStatus,
} from '@student-portal/shared';
import type { AuthenticatedUser } from '../auth/types/authenticated-request';
import { PasswordHasher } from '../../security/password-hasher';
import { StudentCodeAllocator } from '../student-codes/student-code-allocator.service';
import { StudentCodeStore } from '../student-codes/student-code-store.service';
import { AdmissionTransactions } from '../student-codes/admission-transactions.service';
import { StudentAcademicProfile } from '../registrations/schemas/student-academic-profile.schema';
import {
  AdmissionSecurity,
  admissionEqual,
  admissionHash,
} from './admission-security.service';
import {
  AdmissionRequest,
  AdmissionAccess,
  AdmissionGroup,
  AdmissionImportBatch,
} from './schemas/admission-workflow.schema';
import {
  AccessCreateDto,
  AdmissionListDto,
  ApplicantDto,
  ApproveApplicantDto,
  CreateAdmissionGroupDto,
  DecisionDto,
  PublicAccessDto,
  PublicApplicantDto,
  PublicStatusDto,
  UpdateAdmissionGroupDto,
  UpdateApplicantDto,
} from './dto/admission-workflow.dto';
import {
  buildPaginationOptions,
  createPaginatedResult,
} from '../../common/utils/pagination.util';
import { normalizeSearchTerm } from '../../common/utils/search.util';

export function admissionConflict(
  message = 'The request changed. Refresh and retry.',
): never {
  throw new ConflictException({ code: 'ADMISSION_CONFLICT', message });
}
export function assertAdmissionPermission(
  actor: AuthenticatedUser,
  permission: string,
) {
  if (actor.role !== 'admin' && !actor.permissions.includes(permission))
    throw new ForbiddenException('Insufficient admission permissions.');
}
export function admissionId(id: string) {
  if (!/^[a-f0-9]{24}$/i.test(id))
    throw new BadRequestException('Invalid admission identifier.');
  return new Types.ObjectId(id);
}
export interface AdmissionImportContext {
  batchId: Types.ObjectId;
  rowIndex: number;
  lease: string;
}
@Injectable()
export class AdmissionWorkflowService {
  private prepared?: Promise<void>;
  constructor(
    @InjectModel(AdmissionRequest.name)
    readonly requests: Model<AdmissionRequest>,
    @InjectModel(AdmissionAccess.name) readonly access: Model<AdmissionAccess>,
    @InjectModel(AdmissionGroup.name) readonly groups: Model<AdmissionGroup>,
    @InjectModel(AdmissionImportBatch.name)
    readonly batches: Model<AdmissionImportBatch>,
    @InjectModel(StudentAcademicProfile.name)
    readonly academics: Model<StudentAcademicProfile>,
    readonly store: StudentCodeStore,
    readonly transactions: AdmissionTransactions,
    private readonly allocator: StudentCodeAllocator,
    private readonly security: AdmissionSecurity,
    private readonly passwords: PasswordHasher,
  ) {}
  prepare = async () => {
    this.prepared ??= (async () => {
      // New collections only. Existing identity indexes are checked by the allocator.
      for (const model of [
        this.requests,
        this.access,
        this.groups,
        this.batches,
      ])
        await model.createIndexes();
    })().catch((error: unknown) => {
      this.prepared = undefined;
      throw error;
    });
    return this.prepared;
  };
  private event(
    actorId: string | undefined,
    action: string,
    revision: number,
    reason?: string,
  ) {
    return {
      actorId: actorId ? admissionId(actorId) : undefined,
      action,
      revision,
      reason,
      at: new Date(),
    };
  }
  private validateApplicant(dto: ApplicantDto) {
    const samePhone = dto.guardians.findIndex(
      (guardian) => guardian.phone === dto.phone,
    );
    if (samePhone >= 0)
      throw new BadRequestException({
        code: 'ADMISSION_GUARDIAN_PHONE_MATCH',
        message:
          'A guardian phone number must differ from the student phone number.',
        errors: {
          [`guardians.${samePhone}.phone`]:
            'admissionWorkflow.validationMessages.guardianPhone',
        },
      });
    if (dto.studentType === 'TRANSFER' && !dto.previousInstitution?.trim())
      throw new BadRequestException({
        code: 'ADMISSION_TRANSFER_INSTITUTION',
        message: 'A transfer applicant must provide the previous institution.',
      });
  }
  private accessFilter(id: string, now = new Date()) {
    return {
      _id: admissionId(id),
      status: 'ACTIVE',
      expiresAt: { $gt: now },
      $expr: { $lt: ['$usedCount', '$maxRegistrations'] },
    };
  }
  private async requirePeriod(id: Types.ObjectId, session?: ClientSession) {
    const now = new Date();
    const period = await this.store.periods
      .findById(id)
      .session(session ?? null)
      .lean();
    if (!period || period.deletedAt)
      throw new BadRequestException({
        code: 'ADMISSION_ACCESS_UNAVAILABLE',
        message: 'Admission access is unavailable or has expired.',
      });
    const code = !period.isEnabled
      ? 'ADMISSION_PERIOD_DISABLED'
      : period.opensAt > now
        ? 'ADMISSION_PERIOD_SCHEDULED'
        : period.closesAt <= now
          ? 'ADMISSION_PERIOD_CLOSED'
          : undefined;
    if (code)
      throw new BadRequestException({
        code,
        message: 'The invitation exists, but its admission period is not open.',
      });
    return period;
  }
  async academicYears() {
    const rows = await this.store.periods.aggregate<{ _id: string }>([
      { $match: { deletedAt: { $exists: false } } },
      { $group: { _id: '$academicYear' } },
      { $sort: { _id: -1 } },
      { $limit: 100 },
    ]);
    return { items: rows.map((row) => row._id) };
  }
  async listAccess(query: AdmissionListDto) {
    const { page, limit, skip } = buildPaginationOptions(query);
    const filter = {
      deletedAt: { $exists: false },
      ...(query.academicYear ? { academicYear: query.academicYear } : {}),
    };
    const [items, total] = await Promise.all([
      this.access
        .find(filter)
        .select('-history +pinCipher +pinHash')
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.access.countDocuments(filter),
    ]);
    const periods = await this.store.periods
      .find({
        _id: { $in: items.map((item) => item.admissionPeriodId) },
      })
      .select('isEnabled opensAt closesAt deletedAt')
      .lean();
    const now = new Date();
    const visible = items.map((item) => {
      const period = periods.find(
        (value) => String(value._id) === String(item.admissionPeriodId),
      );
      const effectiveStatus =
        item.status === 'REVOKED'
          ? 'REVOKED'
          : item.expiresAt <= now
            ? 'EXPIRED'
            : item.usedCount >= item.maxRegistrations
              ? 'EXHAUSTED'
              : item.lockedUntil && item.lockedUntil > now
                ? 'LOCKED'
                : !period || period.deletedAt
                  ? 'PERIOD_UNAVAILABLE'
                  : !period.isEnabled
                    ? 'PERIOD_DISABLED'
                    : period.opensAt > now
                      ? 'PERIOD_SCHEDULED'
                      : period.closesAt <= now
                        ? 'PERIOD_CLOSED'
                        : 'ACTIVE';
      let pinConfigurationIssue = false;
      if (item.pinCipher) {
        try {
          pinConfigurationIssue =
            !item.pinHash ||
            !admissionEqual(
              this.security.hmac('pin', this.security.decrypt(item.pinCipher)),
              item.pinHash,
            );
        } catch {
          pinConfigurationIssue = true;
        }
      }
      const { pinCipher: _cipher, pinHash: _hash, ...publicItem } = item;
      return {
        ...publicItem,
        pinConfigurationIssue,
        effectiveStatus,
        canOpen: effectiveStatus === 'ACTIVE',
        periodOpensAt: period?.opensAt,
        periodClosesAt: period?.closesAt,
      };
    });
    return createPaginatedResult(visible, total, page, limit);
  }
  async createAccess(dto: AccessCreateDto, actor: AuthenticatedUser) {
    this.security.ready();
    const period = await this.store.periods
      .findById(admissionId(dto.admissionPeriodId))
      .lean();
    if (!period || period.deletedAt)
      throw new NotFoundException('Admission period not found.');
    const expiresAt = new Date(dto.expiresAt);
    if (
      expiresAt <= new Date() ||
      expiresAt > period.closesAt ||
      expiresAt <= period.opensAt
    )
      throw new BadRequestException({
        code: 'ADMISSION_PERIOD_EXPIRY_MISMATCH',
        message: 'Invitation expiry must fall inside the admission period.',
      });
    const pin =
      dto.method === 'QR'
        ? undefined
        : (dto.pin ?? String(randomInt(100000000, 1000000000)));
    const token =
      dto.method === 'PIN' ? undefined : randomBytes(32).toString('base64url');
    const pinHash = pin ? this.security.hmac('pin', pin) : undefined;
    if (pinHash && (await this.access.exists({ pinHash, status: 'ACTIVE' })))
      throw new ConflictException({
        code: 'ADMISSION_PIN_EXISTS',
        message:
          'An active invitation already uses this PIN. Choose another PIN or generate one automatically.',
      });
    const tokenHash = token ? admissionHash(token) : undefined;
    const pinCipher = pin ? this.security.encrypt(pin) : undefined;
    const tokenCipher = token ? this.security.encrypt(token) : undefined;
    return this.transactions.run(async (session) => {
      const fencedPeriod = await this.store.periods
        .findOneAndUpdate(
          {
            _id: period._id,
            deletedAt: { $exists: false },
            opensAt: { $lt: expiresAt },
            closesAt: { $gte: expiresAt },
          },
          { $inc: { accessRevision: 1 } },
          { session },
        )
        .lean();
      if (!fencedPeriod)
        admissionConflict(
          'The admission period changed. Refresh before creating an invitation.',
        );
      const [created] = await this.access.create(
        [
          {
            label: dto.label,
            admissionPeriodId: period._id,
            academicYear: period.academicYear,
            method: dto.method,
            pinHash,
            tokenHash,
            pinCipher,
            tokenCipher,
            expiresAt,
            maxRegistrations: dto.maxRegistrations,
            createdBy: admissionId(actor._id),
            history: [this.event(actor._id, 'CREATED', 0)],
          },
        ],
        { session },
      );
      const item = created.toObject();
      const {
        pinHash: _pin,
        tokenHash: _token,
        pinCipher: _pc,
        tokenCipher: _tc,
        history: _history,
        ...visible
      } = item as any;
      void _pin;
      void _token;
      void _pc;
      void _tc;
      void _history;
      return { ...visible, pin, token };
    }, this.prepare);
  }
  async getAccessSecret(id: string) {
    this.security.ready();
    const item = await this.access
      .findById(admissionId(id))
      .select('+pinCipher +tokenCipher')
      .lean();
    if (!item || item.deletedAt)
      throw new NotFoundException('Admission access invitation not found.');
    let pin: string | undefined;
    let token: string | undefined;
    if (item.pinCipher) {
      try {
        pin = this.security.decrypt(item.pinCipher);
      } catch {
        pin = undefined;
      }
    }
    if (item.tokenCipher) {
      try {
        token = this.security.decrypt(item.tokenCipher);
      } catch {
        token = undefined;
      }
    }
    const { pinCipher: _pc, tokenCipher: _tc, history: _h, ...visible } = item;
    void _pc;
    void _tc;
    void _h;
    return { ...visible, pin, token };
  }
  async deleteAccess(id: string, actor: AuthenticatedUser) {
    if (actor.role !== 'admin')
      throw new ForbiddenException(
        'Only administrators may delete invitations.',
      );
    return this.transactions.run(async (session) => {
      const item = await this.access
        .findById(admissionId(id))
        .session(session)
        .lean();
      if (!item) throw new NotFoundException('Admission access not found.');
      if (!item.deletedAt)
        await this.access.updateOne(
          { _id: item._id },
          {
            $set: { status: 'REVOKED', deletedAt: new Date() },
            $push: { history: this.event(actor._id, 'ARCHIVED', 1) },
          },
          { session },
        );
      return { success: true, deletedId: id };
    }, this.prepare);
  }
  async revokeAccess(id: string, actor: AuthenticatedUser) {
    return this.transactions.run(async (session) => {
      const item = await this.access
        .findOneAndUpdate(
          { _id: admissionId(id), status: 'ACTIVE' },
          {
            $set: { status: 'REVOKED' },
            $push: { history: this.event(actor._id, 'REVOKED', 1) },
          },
          { new: true, session },
        )
        .select('-history')
        .lean();
      if (!item) {
        const old = await this.access
          .findById(admissionId(id))
          .session(session)
          .select('-history')
          .lean();
        if (!old) throw new NotFoundException();
        return old;
      }
      return item;
    }, this.prepare);
  }
  async validateAccess(dto: PublicAccessDto) {
    if (!dto.pin && !dto.token)
      throw new BadRequestException({
        code: 'ADMISSION_ACCESS_UNAVAILABLE',
        message: 'Admission access is unavailable or has expired.',
      });
    const match = dto.accessId
      ? this.accessFilter(dto.accessId)
      : {
          status: 'ACTIVE',
          expiresAt: { $gt: new Date() },
          $expr: { $lt: ['$usedCount', '$maxRegistrations'] },
          ...(dto.pin
            ? { pinHash: this.security.hmac('pin', dto.pin) }
            : { tokenHash: admissionHash(dto.token!) }),
        };
    const access = await this.access
      .findOne(match)
      .select('+pinHash +tokenHash')
      .lean();
    const invalid = () =>
      new BadRequestException({
        code: 'ADMISSION_ACCESS_UNAVAILABLE',
        message: 'Admission access is unavailable or has expired.',
      });
    if (!access || (access.lockedUntil && access.lockedUntil > new Date()))
      throw invalid();
    const valid = Boolean(
      (dto.pin &&
        access.pinHash &&
        admissionEqual(this.security.hmac('pin', dto.pin), access.pinHash)) ||
      (dto.token &&
        access.tokenHash &&
        admissionEqual(admissionHash(dto.token), access.tokenHash)),
    );
    if (!valid) {
      // Bounded per-invitation lockout; never include submitted secrets in events.
      await this.access.updateOne({ _id: access._id }, [
        {
          $set: {
            failedAttempts: { $add: ['$failedAttempts', 1] },
            lockedUntil: {
              $cond: [
                { $gte: [{ $add: ['$failedAttempts', 1] }, 10] },
                new Date(Date.now() + 15 * 60_000),
                '$lockedUntil',
              ],
            },
          },
        },
      ]);
      throw invalid();
    }
    const period = await this.requirePeriod(access.admissionPeriodId);
    await this.access.updateOne(
      { _id: access._id },
      { $set: { failedAttempts: 0 }, $unset: { lockedUntil: 1 } },
    );
    return {
      admissionSession: this.security.session(String(access._id)),
      academicYear: period.academicYear,
      name: period.name,
      nameAr: period.nameAr,
      expiresAt: new Date(Date.now() + 20 * 60_000).toISOString(),
    };
  }
  async submit(dto: PublicApplicantDto, ip?: string) {
    this.validateApplicant(dto);
    if (!isAdmissionNationalId(dto.nationalId))
      throw new BadRequestException({
        code: 'ADMISSION_NATIONAL_ID',
        message:
          'Enter a valid Egyptian National ID with a valid past birth date.',
      });
    const accessId = this.security.readSession(dto.admissionSession);
    const receipt = this.security.receipt(accessId, dto.submissionKey);
    const receipts = [
      receipt,
      this.security.receipt(accessId, dto.submissionKey, true),
    ];
    const previousReceipt = async (session?: ClientSession) => {
      const previous = await this.requests
        .findOne({
          publicReference: {
            $in: receipts.map((item) => item.publicReference),
          },
        })
        .select('+statusSecretHash')
        .session(session ?? null)
        .lean();
      if (!previous) return undefined;
      const matching = receipts.find(
        (item) =>
          item.publicReference === previous.publicReference &&
          admissionEqual(admissionHash(item.secret), previous.statusSecretHash),
      );
      if (!matching)
        admissionConflict('Please start a fresh application submission.');
      return matching;
    };
    // Safe retry after a lost response does not redeem CAPTCHA or consume another use.
    const previous = await previousReceipt();
    if (previous) return previous;
    await this.security.captcha(dto.captchaToken, ip);
    const encrypted = this.security.encrypt(dto.nationalId),
      lookup = this.security.hmac('national-id', dto.nationalId);
    return this.transactions.run(async (session) => {
      const previous = await previousReceipt(session);
      if (previous) return previous;
      const access = await this.access
        .findOneAndUpdate(
          this.accessFilter(accessId),
          { $inc: { usedCount: 1 } },
          { new: true, session },
        )
        .lean();
      if (!access)
        throw new BadRequestException({
          code: 'ADMISSION_ACCESS_UNAVAILABLE',
          message: 'Admission access is unavailable or has expired.',
        });
      const period = await this.requirePeriod(
        access.admissionPeriodId,
        session,
      );
      const duplicate =
        Boolean(
          await this.requests
            .exists({
              nationalIdLookup: lookup,
              status: { $in: ['PENDING', 'WAITLISTED', 'APPROVED'] },
            })
            .session(session),
        ) ||
        Boolean(
          await this.store.users
            .exists({ role: 'student', nationalId: dto.nationalId })
            .session(session),
        ) ||
        Boolean(
          await this.store.profiles
            .exists({ nationalId: dto.nationalId })
            .session(session),
        );
      // A duplicate gets its OWN neutral receipt, never the other applicant's secret/data.
      await this.requests.create(
        [
          {
            ...this.applicantFields(dto),
            nationalIdEncrypted: encrypted,
            nationalIdLookup: duplicate
              ? `${lookup}:duplicate:${receipt.publicReference}`
              : lookup,
            duplicateReviewRequired: duplicate,
            nationalIdMasked: `${dto.nationalId.slice(0, 3)}********${dto.nationalId.slice(-3)}`,
            publicReference: receipt.publicReference,
            statusSecretHash: admissionHash(receipt.secret),
            admissionPeriodId: period._id,
            admissionAccessId: access._id,
            academicYear: period.academicYear,
            submittedAt: new Date(),
            history: [this.event(undefined, 'SUBMITTED', 0)],
          },
        ],
        { session },
      );
      return receipt;
    }, this.prepare);
  }
  private applicantFields(dto: ApplicantDto) {
    return {
      fullName: dto.fullName,
      fullNameAr: dto.fullNameAr,
      address: dto.address,
      phone: dto.phone,
      guardians: dto.guardians,
      studentType: dto.studentType,
      previousInstitution: dto.previousInstitution,
      previousFaculty: dto.previousFaculty,
      transferNotes: dto.transferNotes,
    };
  }
  private async recordImport(
    context: AdmissionImportContext | undefined,
    session: ClientSession,
  ) {
    if (!context) return;
    const result = await this.batches.updateOne(
      {
        _id: context.batchId,
        lease: context.lease,
        status: 'APPLYING',
        [`rows.${context.rowIndex}.state`]: 'VALID',
      },
      { $set: { [`rows.${context.rowIndex}.state`]: 'APPLIED' } },
      { session },
    );
    if (result.modifiedCount !== 1)
      admissionConflict('Import lease changed. Resume the batch.');
  }
  private async position(item: AdmissionRequest & { _id: Types.ObjectId }) {
    if (item.status !== 'WAITLISTED' || !item.waitlistedAt) return undefined;
    return (
      1 +
      (await this.requests.countDocuments({
        academicYear: item.academicYear,
        groupId: item.groupId ?? { $exists: false },
        status: 'WAITLISTED',
        $or: [
          { waitlistedAt: { $lt: item.waitlistedAt } },
          { waitlistedAt: item.waitlistedAt, _id: { $lt: item._id } },
        ],
      }))
    );
  }
  async publicStatus(dto: PublicStatusDto) {
    const item = await this.requests
      .findOne({ publicReference: dto.publicReference })
      .select('+statusSecretHash')
      .lean();
    if (
      !item ||
      !admissionEqual(admissionHash(dto.secret), item.statusSecretHash)
    )
      throw new NotFoundException('Request reference or secret is invalid.');
    return {
      publicReference: item.publicReference,
      status: admissionApplicantStatus(item.status, Boolean(item.studentId)),
      studentCode: item.duplicateReviewRequired ? undefined : item.studentCode,
      rejection: item.rejection,
      waitlistPosition: item.duplicateReviewRequired
        ? undefined
        : await this.position(item),
    };
  }
  filter(query: AdmissionListDto): FilterQuery<AdmissionRequest> {
    const filter: FilterQuery<AdmissionRequest> = {
      deletedAt: { $exists: false },
    };
    if (query.status === 'REJECTED')
      filter.$and = [
        {
          $or: [
            { status: 'REJECTED' },
            { status: 'CANCELLED', studentId: { $exists: false } },
          ],
        },
      ];
    else if (query.status === 'CANCELLED') {
      filter.status = 'CANCELLED';
      filter.studentId = { $exists: true };
    } else if (query.status) filter.status = query.status;
    if (query.academicYear) filter.academicYear = query.academicYear;
    if (query.search) {
      const regex = new RegExp(normalizeSearchTerm(query.search), 'i');
      filter.$or = [
        { fullName: regex },
        { fullNameAr: regex },
        { publicReference: regex },
        { studentCode: regex },
      ];
    }
    if (query.from || query.to)
      filter.submittedAt = {
        ...(query.from ? { $gte: new Date(query.from) } : {}),
        ...(query.to ? { $lte: new Date(query.to) } : {}),
      };
    return filter;
  }
  async listRequests(query: AdmissionListDto, actor?: AuthenticatedUser) {
    const { page, limit, skip } = buildPaginationOptions(query),
      filter = this.filter(query);
    const [rawItems, total] = await Promise.all([
      this.requests
        .find(filter)
        .select('-history -guardians -address -phone +nationalIdEncrypted')
        .sort({ submittedAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.requests.countDocuments(filter),
    ]);
    const canViewNationalId =
      actor?.role === 'admin' ||
      Boolean(
        actor?.permissions?.includes(PERMISSIONS.STUDENTS_VIEW_NATIONAL_ID),
      );
    const items = rawItems.map((item) => {
      const { nationalIdEncrypted, ...visible } = item as Record<string, any>;
      let nationalId = visible.nationalId;
      if (canViewNationalId && nationalIdEncrypted) {
        try {
          nationalId = this.security.decrypt(nationalIdEncrypted);
        } catch {
          nationalId = visible.nationalIdMasked;
        }
      }
      return {
        ...visible,
        status: admissionApplicantStatus(item.status, Boolean(item.studentId)),
        nationalId: nationalId ?? visible.nationalIdMasked,
      };
    });
    return createPaginatedResult(items, total, page, limit);
  }
  async detail(id: string, actor: AuthenticatedUser) {
    const item = await this.requests
      .findById(admissionId(id))
      .select('+nationalIdEncrypted')
      .lean();
    if (!item || item.deletedAt) throw new NotFoundException();
    const { nationalIdEncrypted, ...visible } = item;
    return {
      ...visible,
      status: admissionApplicantStatus(item.status, Boolean(item.studentId)),
      waitlistPosition: await this.position(item),
      nationalId:
        actor.role === 'admin' ||
        actor.permissions.includes(PERMISSIONS.STUDENTS_VIEW_NATIONAL_ID)
          ? this.security.decrypt(nationalIdEncrypted)
          : undefined,
    };
  }
  async update(
    id: string,
    dto: UpdateApplicantDto,
    actor: AuthenticatedUser,
    context?: AdmissionImportContext,
  ) {
    assertAdmissionPermission(actor, PERMISSIONS.ADMISSIONS_REQUESTS_UPDATE);
    this.validateApplicant(dto);
    return this.transactions.run(async (session) => {
      const item = await this.requests
        .findOneAndUpdate(
          {
            _id: admissionId(id),
            revision: dto.revision,
            deletedAt: { $exists: false },
            status: { $in: ['PENDING', 'WAITLISTED'] },
          },
          {
            $set: this.applicantFields(dto),
            $inc: { revision: 1 },
            $push: {
              history: this.event(actor._id, 'UPDATED', dto.revision + 1),
            },
          },
          { new: true, session },
        )
        .lean();
      if (!item) admissionConflict();
      await this.recordImport(context, session);
      return item;
    }, this.prepare);
  }
  async decide(
    id: string,
    to: AdmissionRequestStatus,
    dto: DecisionDto,
    actor: AuthenticatedUser,
    context?: AdmissionImportContext,
  ) {
    assertAdmissionPermission(
      actor,
      to === 'REJECTED'
        ? PERMISSIONS.ADMISSIONS_REQUESTS_REJECT
        : to === 'CANCELLED'
          ? PERMISSIONS.ADMISSIONS_REQUESTS_CANCEL
          : PERMISSIONS.ADMISSIONS_REQUESTS_WAITLIST,
    );
    if (to === 'REJECTED' && !dto.reasonCode)
      throw new BadRequestException('Select a rejection reason.');
    if (to === 'REJECTED' && dto.reasonCode === 'OTHER' && !dto.reason?.trim())
      throw new BadRequestException({
        code: 'ADMISSION_REASON_REQUIRED',
        message: 'Explain the rejection when selecting Other.',
      });
    if (dto.groupId)
      assertAdmissionPermission(actor, PERMISSIONS.ADMISSIONS_GROUPS_MANAGE);
    return this.transactions.run(async (session) => {
      const item = await this.requests
        .findById(admissionId(id))
        .session(session)
        .lean();
      if (!item || item.deletedAt) throw new NotFoundException();
      if (
        item.revision !== dto.revision ||
        !canTransitionAdmission(item.status, to)
      )
        admissionConflict();
      if (
        dto.groupId &&
        !(await this.groups
          .exists({
            _id: admissionId(dto.groupId),
            academicYear: item.academicYear,
            isEnabled: true,
          })
          .session(session))
      )
        throw new BadRequestException('Invalid waiting-list group.');
      const reasonText =
        dto.reason?.trim() ||
        (dto.reasonCode ? `Reason: ${dto.reasonCode}` : to);
      await this.requests.updateOne(
        { _id: item._id, revision: dto.revision },
        {
          $set: {
            status: to,
            ...(to === 'WAITLISTED'
              ? {
                  waitlistedAt: new Date(),
                  ...(dto.groupId ? { groupId: admissionId(dto.groupId) } : {}),
                }
              : {}),
            ...(to === 'REJECTED'
              ? {
                  rejection: {
                    reasonCode: dto.reasonCode,
                    explanation: reasonText,
                  },
                }
              : {}),
          },
          $inc: { revision: 1 },
          $push: {
            history: this.event(actor._id, to, dto.revision + 1, reasonText),
          },
        },
        { session },
      );
      await this.recordImport(context, session);
      return { status: to, revision: dto.revision + 1 };
    }, this.prepare);
  }
  async approve(
    id: string,
    dto: ApproveApplicantDto,
    actor: AuthenticatedUser,
    context?: AdmissionImportContext,
  ) {
    assertAdmissionPermission(actor, PERMISSIONS.ADMISSIONS_REQUESTS_APPROVE);
    assertAdmissionPermission(actor, PERMISSIONS.ADMISSIONS_ACADEMIC_MANAGE);
    if (dto.groupId)
      assertAdmissionPermission(actor, PERMISSIONS.ADMISSIONS_GROUPS_MANAGE);
    const requestId = admissionId(id);
    const initial = await this.requests
      .findById(requestId)
      .select('+nationalIdEncrypted')
      .lean();
    if (!initial || initial.deletedAt) throw new NotFoundException();
    if (initial.status === 'APPROVED') {
      if (context)
        admissionConflict('The request was approved after this preview.');
      return this.detail(id, actor);
    }
    if (initial.revision !== dto.revision) admissionConflict();
    if (initial.duplicateReviewRequired)
      throw new ConflictException({
        code: 'ADMISSION_DUPLICATE_REVIEW',
        message:
          'This application requires identity review and cannot be approved.',
      });
    if (
      initial.studentType === 'NEW' &&
      (dto.level !== '1' || dto.passedCourses.length)
    )
      throw new BadRequestException(
        'New students must start at level 1 without transfer credits.',
      );
    if (['1', '2'].includes(dto.level) && dto.department !== 'GENERAL')
      throw new BadRequestException('Levels 1 and 2 use GENERAL department.');
    const nationalId = this.security.decrypt(initial.nationalIdEncrypted);
    const passwordHash = await this.passwords.hash(nationalId);
    // Bcrypt is deliberately outside the transaction and its retry callback.
    const studentId = new Types.ObjectId();
    await this.prepare();
    await this.allocator.allocate(
      initial.academicYear,
      id,
      actor._id,
      async (studentCode, session) => {
        await this.store.users.create(
          [
            {
              _id: studentId,
              role: 'student',
              name: initial.fullName,
              nameAr: initial.fullNameAr,
              username: studentCode,
              userCode: `STD-${studentCode}`,
              studentCode,
              passwordHash,
              nationalIdHash: passwordHash,
              nationalId,
              nationalIdMasked: initial.nationalIdMasked,
              phone: initial.phone,
              mustChangePassword: true,
              isActive: true,
              permissions: [],
            },
          ],
          { session },
        );
        const group = dto.groupId
          ? await this.groups
              .findById(admissionId(dto.groupId))
              .session(session)
              .lean()
          : null;
        await this.store.profiles.create(
          [
            {
              userId: studentId,
              studentCode,
              fullName: initial.fullName,
              fullNameAr: initial.fullNameAr,
              nationalId,
              nationalIdMasked: initial.nationalIdMasked,
              phone: initial.phone,
              address: initial.address,
              guardians: initial.guardians ?? [],
              level: dto.level,
              semester: dto.semester,
              department: dto.department,
              academicYear: initial.academicYear,
              group: group?.nameAr || group?.name,
              enrollmentStatus: 'active',
            },
          ],
          { session },
        );
        await this.academics.create(
          [
            {
              studentId,
              academicLevel: dto.level,
              semester: dto.semester === '1' ? 'first' : 'second',
              gpa: 0,
              completedCourses: dto.passedCourses,
              failedCourses: [],
              lowGradeCourses: [],
              isGraduatingThisYear: false,
            },
          ],
          { session },
        );
        const result = await this.requests.updateOne(
          {
            _id: requestId,
            revision: dto.revision,
            status: { $in: ['PENDING', 'WAITLISTED'] },
          },
          {
            $set: {
              status: 'APPROVED',
              studentId,
              studentCode,
              level: dto.level,
              department: dto.department,
              semester: dto.semester,
              passedCourses: dto.passedCourses,
              ...(dto.groupId ? { groupId: admissionId(dto.groupId) } : {}),
            },
            ...(dto.groupId ? {} : { $unset: { groupId: 1 } }),
            $inc: { revision: 1 },
            $push: {
              history: this.event(actor._id, 'APPROVED', dto.revision + 1),
            },
          },
          { session },
        );
        if (result.modifiedCount !== 1) admissionConflict();
        await this.recordImport(context, session);
        return { studentId: String(studentId) };
      },
      async (session) => {
        const current = await this.requests
          .findById(requestId)
          .select('+nationalIdEncrypted')
          .session(session)
          .lean();
        if (
          !current ||
          current.deletedAt ||
          current.revision !== dto.revision ||
          current.duplicateReviewRequired ||
          !['PENDING', 'WAITLISTED'].includes(current.status)
        )
          admissionConflict();
        if (
          (await this.store.users
            .exists({ role: 'student', nationalId })
            .session(session)) ||
          (await this.store.profiles.exists({ nationalId }).session(session))
        )
          throw new ConflictException({
            code: 'ADMISSION_DUPLICATE_REVIEW',
            message: 'An existing student identity requires review.',
          });
        if (
          dto.passedCourses.length &&
          (await this.store.connection
            .collection('courses')
            .countDocuments(
              { code: { $in: dto.passedCourses } },
              { session },
            )) !== dto.passedCourses.length
        )
          throw new BadRequestException(
            'One or more passed courses do not exist.',
          );
        if (dto.groupId) {
          const claimed = await this.groups.findOneAndUpdate(
            {
              _id: admissionId(dto.groupId),
              academicYear: current.academicYear,
              level: dto.level,
              department: dto.department,
              isEnabled: true,
              $expr: { $lt: ['$enrolled', '$capacity'] },
            },
            {
              $inc: { enrolled: 1, revision: 1 },
              $push: { history: this.event(actor._id, 'SEAT_CLAIMED', 0) },
            },
            { session },
          );
          if (!claimed)
            throw new ConflictException({
              code: 'ADMISSION_GROUP_FULL',
              message:
                'The selected group is full or does not match the academic details.',
            });
        }
      },
    );
    return this.detail(id, actor);
  }
  async deleteRequest(id: string, dto: DecisionDto, actor: AuthenticatedUser) {
    if (actor.role !== 'admin')
      throw new ForbiddenException(
        'Only administrators may delete admission requests.',
      );
    return this.transactions.run(async (session) => {
      const item = await this.requests
        .findById(admissionId(id))
        .session(session)
        .lean();
      if (!item) throw new NotFoundException();
      if (item.deletedAt) return { success: true, deletedId: id };
      if (item.revision !== dto.revision) admissionConflict();
      const at = new Date();
      const pending = ['PENDING', 'WAITLISTED'].includes(item.status);
      await this.requests.updateOne(
        { _id: item._id, revision: dto.revision },
        {
          $set: {
            deletedAt: at,
            deletedBy: admissionId(actor._id),
            ...(pending
              ? {
                  status: 'REJECTED',
                  rejection: {
                    reasonCode: 'OTHER',
                    explanation:
                      dto.reason?.trim() ||
                      'Application withdrawn by the administration.',
                  },
                }
              : {}),
          },
          $inc: { revision: 1 },
          $push: {
            history: this.event(
              actor._id,
              'ARCHIVED',
              dto.revision + 1,
              dto.reason,
            ),
          },
        },
        { session },
      );
      return { success: true, deletedId: id };
    }, this.prepare);
  }
  async cancelApproved(
    id: string,
    dto: DecisionDto,
    actor: AuthenticatedUser,
    context?: AdmissionImportContext,
  ) {
    assertAdmissionPermission(actor, PERMISSIONS.ADMISSIONS_REQUESTS_CANCEL);
    // Official cancellation retains identity/code aliases, so existing academic readers remain safe.
    return this.transactions.run(
      async (session) => {
        const item = await this.requests
          .findById(admissionId(id))
          .session(session)
          .lean();
        if (!item || item.deletedAt) throw new NotFoundException();
        if (item.status === 'CANCELLED')
          return { status: 'CANCELLED', codeReleased: false };
        if (
          item.status !== 'APPROVED' ||
          item.revision !== dto.revision ||
          !item.studentId ||
          !item.studentCode
        )
          admissionConflict();
        const registry = await this.store.entries
          .findOne({
            studentCode: item.studentCode,
            currentStudentId: item.studentId,
            status: 'ASSIGNED',
          })
          .session(session)
          .lean();
        if (!registry)
          admissionConflict('Student-code ownership requires review.');
        const user = await this.store.users.updateOne(
          { _id: item.studentId, studentCode: item.studentCode },
          {
            $set: {
              isActive: false,
              deactivatedAt: new Date(),
              deactivatedBy: admissionId(actor._id),
              deactivationReason: dto.reason,
            },
            $inc: { tokenVersion: 1 },
            $unset: { refreshTokenHash: 1, refreshTokenExpiresAt: 1 },
          },
          { session },
        );
        if (user.matchedCount !== 1) admissionConflict();
        await this.store.profiles.updateOne(
          { studentCode: item.studentCode },
          { $set: { enrollmentStatus: 'inactive' } },
          { session },
        );
        if (item.groupId) {
          const seat = await this.groups.updateOne(
            { _id: item.groupId, enrolled: { $gt: 0 } },
            {
              $inc: { enrolled: -1, revision: 1 },
              $push: { history: this.event(actor._id, 'SEAT_RELEASED', 0) },
            },
            { session },
          );
          if (!seat.modifiedCount)
            admissionConflict('Group enrollment requires review.');
        }
        await this.requests.updateOne(
          { _id: item._id, revision: dto.revision },
          {
            $set: { status: 'CANCELLED' },
            $inc: { revision: 1 },
            $push: {
              history: this.event(
                actor._id,
                'CANCELLED_CODE_HELD',
                dto.revision + 1,
                dto.reason,
              ),
            },
          },
          { session },
        );
        await this.store.audits.create(
          [
            {
              studentCode: item.studentCode,
              academicYear: item.academicYear,
              actorId: admissionId(actor._id),
              studentId: item.studentId,
              requestId: item._id,
              action: 'CANCELLED_CODE_HELD',
              from: 'ASSIGNED',
              to: 'ASSIGNED',
              reason: dto.reason,
              at: new Date(),
            },
          ],
          { session },
        );
        await this.recordImport(context, session);
        return { status: 'CANCELLED', codeReleased: false };
      },
      async () => {
        await this.prepare();
        await this.store.prepareWrites();
      },
    );
  }
  async listGroups(query: AdmissionListDto) {
    const { page, limit, skip } = buildPaginationOptions(query);
    const filter = {
      deletedAt: { $exists: false },
      ...(query.academicYear ? { academicYear: query.academicYear } : {}),
    };
    return createPaginatedResult(
      await this.groups
        .find(filter)
        .select('-history')
        .sort({ name: 1, _id: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      await this.groups.countDocuments(filter),
      page,
      limit,
    );
  }
  async createGroup(dto: CreateAdmissionGroupDto, actor: AuthenticatedUser) {
    if (!isAdmissionAcademicYear(dto.academicYear))
      throw new BadRequestException('Invalid consecutive academic year.');
    return this.transactions.run(async (session) => {
      const [group] = await this.groups.create(
        [{ ...dto, history: [this.event(actor._id, 'CREATED', 0)] }],
        { session },
      );
      return group;
    }, this.prepare);
  }
  async updateGroup(
    id: string,
    dto: UpdateAdmissionGroupDto,
    actor: AuthenticatedUser,
  ) {
    return this.transactions.run(async (session) => {
      const updateSet: Record<string, any> = {
        capacity: dto.capacity,
        isEnabled: dto.isEnabled,
      };
      if (dto.nameAr !== undefined) {
        updateSet.nameAr = dto.nameAr;
      }
      const group = await this.groups
        .findOneAndUpdate(
          {
            _id: admissionId(id),
            revision: dto.revision,
            deletedAt: { $exists: false },
            enrolled: { $lte: dto.capacity },
          },
          {
            $set: updateSet,
            $inc: { revision: 1 },
            $push: {
              history: this.event(actor._id, 'UPDATED', dto.revision + 1),
            },
          },
          { new: true, session },
        )
        .select('-history')
        .lean();
      if (!group)
        admissionConflict(
          'The group changed or capacity is below its enrollment.',
        );
      return group;
    }, this.prepare);
  }

  async deleteGroup(id: string, actor: AuthenticatedUser) {
    if (actor.role !== 'admin')
      throw new ForbiddenException('Only administrators may delete groups.');
    return this.transactions.run(async (session) => {
      const group = await this.groups
        .findById(admissionId(id))
        .session(session)
        .lean();
      if (!group) throw new NotFoundException('Group not found.');
      if (group.enrolled > 0)
        throw new ConflictException({
          code: 'ADMISSION_GROUP_IN_USE',
          message: 'A group with enrolled students cannot be deleted.',
        });
      if (!group.deletedAt)
        await this.groups.updateOne(
          { _id: group._id, enrolled: 0 },
          {
            $set: { isEnabled: false, deletedAt: new Date() },
            $inc: { revision: 1 },
            $push: {
              history: this.event(actor._id, 'ARCHIVED', group.revision + 1),
            },
          },
          { session },
        );
      return { success: true, message: 'Group archived.' };
    }, this.prepare);
  }

  async getGroupStudents(id: string) {
    const group = await this.groups.findById(admissionId(id)).lean();
    if (!group || group.deletedAt)
      throw new NotFoundException('Group not found');

    const approvedRequests = await this.requests
      .find({
        groupId: admissionId(id),
        status: 'APPROVED',
      })
      .select('studentCode fullName fullNameAr department level academicYear')
      .lean();

    const studentCodes = approvedRequests
      .map((r) => r.studentCode)
      .filter((c): c is string => Boolean(c));

    const matchConditions: Record<string, any>[] = [];
    if (studentCodes.length > 0) {
      matchConditions.push({ studentCode: { $in: studentCodes } });
    }
    if (group.name) {
      matchConditions.push({ group: group.name });
    }
    if (group.nameAr) {
      matchConditions.push({ group: group.nameAr });
    }

    let profiles: any[] = [];
    if (matchConditions.length > 0) {
      profiles = await this.store.profiles
        .find({
          academicYear: group.academicYear,
          level: group.level,
          department: group.department,
          $or: matchConditions,
        })
        .select(
          'studentCode fullName fullNameAr department level academicYear enrollmentStatus group',
        )
        .lean();
    }

    const profileMap = new Map(profiles.map((p) => [p.studentCode, p]));
    const items = (
      approvedRequests.length > 0 ? approvedRequests : profiles
    ).map((item) => {
      const p = profileMap.get(item.studentCode);
      return {
        _id: String(p?._id ?? item._id),
        studentCode: item.studentCode ?? p?.studentCode ?? '',
        fullName: p?.fullName ?? item.fullName ?? '',
        fullNameAr: p?.fullNameAr ?? item.fullNameAr ?? '',
        department: p?.department ?? item.department ?? group.department,
        level: p?.level ?? item.level ?? group.level,
        academicYear:
          p?.academicYear ?? item.academicYear ?? group.academicYear,
        enrollmentStatus: p?.enrollmentStatus ?? 'active',
      };
    });

    for (const p of profiles) {
      if (!items.some((it) => it.studentCode === p.studentCode)) {
        items.push({
          _id: String(p._id),
          studentCode: p.studentCode,
          fullName: p.fullName,
          fullNameAr: p.fullNameAr ?? '',
          department: p.department,
          level: p.level,
          academicYear: p.academicYear,
          enrollmentStatus: p.enrollmentStatus ?? 'active',
        });
      }
    }

    return items;
  }
}
