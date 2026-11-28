import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PERMISSIONS,
  type MinistryStatus,
  type OfficialEnrollmentStatus,
} from '@student-portal/shared';
import { Types } from 'mongoose';
import type { AuthenticatedUser } from '../auth/types/authenticated-request';
import type { StudentProfile } from '../students/schemas/student-profile.schema';
import {
  admissionDocuments,
  attachMinistryEvidence,
  validateEnrollmentDate,
} from './admission-evidence';
import {
  AdmissionWorkflowService,
  admissionConflict,
  admissionId,
  assertAdmissionPermission,
} from './admission-workflow.service';
import type {
  LifecycleTransitionDto,
  ProvisionalPolicyScopeDto,
  UpdateProvisionalPolicyDto,
  VerifyLegacyEnrollmentDto,
} from './dto/admission-workflow.dto';
import {
  loadProvisionalPolicy,
  provisionalPolicies,
  provisionalPolicyKey,
} from './enrollment-policy';

const transitionPermissions = {
  APPROVE_MINISTRY: PERMISSIONS.ADMISSIONS_MINISTRY_MANAGE,
  REJECT_MINISTRY: PERMISSIONS.ADMISSIONS_MINISTRY_MANAGE,
  CONFIRM_ENROLLMENT: PERMISSIONS.ADMISSIONS_ENROLLMENT_CONFIRM,
  CORRECT_MINISTRY: PERMISSIONS.ADMISSIONS_DECISIONS_CORRECT,
};

@Injectable()
export class AdmissionLifecycleService {
  constructor(private readonly workflow: AdmissionWorkflowService) {}

  async summary() {
    const profiles = this.workflow.store.profiles;
    const [official, active, pending, ready, archived, unverified] =
      await Promise.all([
        profiles.countDocuments({ officialEnrollmentStatus: 'ENROLLED' }),
        profiles.countDocuments({
          enrollmentStatus: 'active',
          officialEnrollmentStatus: { $ne: 'CANCELLED' },
        }),
        profiles.countDocuments({
          officialEnrollmentStatus: 'PROVISIONAL',
          ministryStatus: 'PENDING',
        }),
        profiles.countDocuments({
          officialEnrollmentStatus: 'PROVISIONAL',
          ministryStatus: 'APPROVED',
        }),
        profiles.countDocuments({
          officialEnrollmentStatus: 'CANCELLED',
          ministryStatus: 'REJECTED',
        }),
        profiles.countDocuments({
          officialEnrollmentStatus: { $exists: false },
          enrollmentStatus: 'active',
        }),
      ]);
    return { official, active, pending, ready, archived, unverified };
  }

  async policy(query: ProvisionalPolicyScopeDto) {
    const { midterm, coursework, quiz, finalExam } =
      await loadProvisionalPolicy(
        this.workflow.store.connection,
        query.academicYear,
        query.semester,
      );
    return { midterm, coursework, quiz, finalExam };
  }

  async updatePolicy(dto: UpdateProvisionalPolicyDto, actorId: string) {
    const { academicYear, semester, ...settings } = dto;
    const { connection } = this.workflow.store;
    return this.workflow.transactions.run(async (session) => {
      const _id = provisionalPolicyKey(academicYear, semester);
      const policies = provisionalPolicies(connection);
      const previous = await policies.findOne({ _id }, { session });
      const updatedAt = new Date();
      await policies.updateOne(
        { _id },
        { $set: { ...settings, updatedBy: actorId, updatedAt } },
        { session, upsert: true },
      );
      await connection
        .db!.collection('admission_policy_history')
        .insertOne(
          { scope: _id, previous, settings, actorId, updatedAt },
          { session },
        );
      return settings;
    });
  }

  async verifyLegacy(dto: VerifyLegacyEnrollmentDto, actorId: string) {
    validateEnrollmentDate(dto.enrollmentEffectiveDate);
    const { connection, profiles, users } = this.workflow.store;
    return this.workflow.transactions.run(async (session) => {
      const profile = await profiles
        .findOne({
          studentCode: dto.studentCode,
          officialEnrollmentStatus: { $exists: false },
          enrollmentStatus: 'active',
        })
        .session(session)
        .lean();
      if (!profile)
        admissionConflict(
          'This student is not an unverified active legacy student.',
        );
      const user = await users
        .exists({
          _id: profile.userId,
          studentCode: dto.studentCode,
          role: 'student',
        })
        .session(session);
      if (!user)
        admissionConflict(
          'Resolve the identity mismatch before verifying enrollment.',
        );
      const data: Pick<
        StudentProfile,
        | 'officialEnrollmentStatus'
        | 'enrollmentEffectiveDate'
        | 'admissionType'
        | 'ministryStatus'
      > = {
        officialEnrollmentStatus: 'ENROLLED',
        enrollmentEffectiveDate: dto.enrollmentEffectiveDate,
        ...(dto.admissionType ? { admissionType: dto.admissionType } : {}),
        ...(dto.admissionType
          ? {
              ministryStatus:
                dto.admissionType === 'TRANSFER' ? 'APPROVED' : 'NOT_REQUIRED',
            }
          : {}),
      };
      const updated = await profiles.updateOne(
        {
          _id: profile._id,
          officialEnrollmentStatus: { $exists: false },
          enrollmentStatus: 'active',
        },
        { $set: data },
        { session },
      );
      if (!updated.modifiedCount) admissionConflict();
      await connection
        .db!.collection('admission_legacy_verification')
        .insertOne(
          {
            studentId: profile.userId,
            studentCode: dto.studentCode,
            year: profile.academicYear,
            evidenceReference: dto.evidenceReference,
            actorId: admissionId(actorId),
            verifiedAt: new Date(),
            ...data,
          },
          { session },
        );
      return { studentCode: dto.studentCode, ...data };
    });
  }

  async followups(kind: 'settlement' | 'contact', page: number, limit: number) {
    const follows = this.followupCollection(kind);
    const filter = { status: 'OPEN' };
    const [items, total] = await Promise.all([
      follows
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
      follows.countDocuments(filter),
    ]);
    if (kind === 'settlement')
      return {
        items: items.map((item) => ({
          _id: String(item._id),
          studentCode: String(item.studentCode ?? ''),
        })),
        total,
      };
    const requests = await this.workflow.requests
      .find({ _id: { $in: items.map((item) => item.requestId) } })
      .select('phone fullName studentCode')
      .lean();
    const byId = new Map(
      requests.map((request) => [String(request._id), request]),
    );
    return {
      items: items.map((item) => {
        const request = byId.get(String(item.requestId));
        return {
          _id: String(item._id),
          studentCode: request?.studentCode,
          fullName: request?.fullName,
          phone: request?.phone,
        };
      }),
      total,
    };
  }

  async completeFollowup(
    kind: 'settlement' | 'contact',
    id: string,
    reference: string,
    actorId: string,
  ) {
    const completed = await this.followupCollection(kind).updateOne(
      { _id: admissionId(id), status: 'OPEN' },
      {
        $set: {
          status: 'COMPLETED',
          reference,
          completedBy: admissionId(actorId),
          completedAt: new Date(),
        },
      },
    );
    if (!completed.modifiedCount)
      admissionConflict('This follow-up is already completed or missing.');
    return { status: 'COMPLETED' };
  }

  private followupCollection(kind: 'settlement' | 'contact') {
    return this.workflow.store.connection.db!.collection(
      kind === 'settlement'
        ? 'admission_settlements'
        : 'admission_contact_followups',
    );
  }

  async upload(
    id: string,
    file: { buffer: Buffer; mimetype: string } | undefined,
    actor: AuthenticatedUser,
  ) {
    if (
      !file ||
      file.buffer.length < 5 ||
      file.mimetype !== 'application/pdf' ||
      !file.buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))
    )
      throw new BadRequestException('Upload a PDF decision document.');
    const requestId = admissionId(id);
    const request = await this.workflow.requests
      .findOne({
        _id: requestId,
        studentType: 'TRANSFER',
        deletedAt: { $exists: false },
      })
      .lean();
    if (!request) throw new NotFoundException();
    const collection = admissionDocuments(this.workflow.store.connection);
    await collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    const _id = new Types.ObjectId();
    await collection.insertOne({
      _id,
      requestId,
      actorId: admissionId(actor._id),
      bytes: file.buffer,
      uploadedAt: new Date(),
      expiresAt: new Date(Date.now() + 60 * 60_000),
    });
    return { documentId: String(_id) };
  }

  async document(id: string, documentId: string) {
    const attachment = await admissionDocuments(
      this.workflow.store.connection,
    ).findOne({
      _id: admissionId(documentId),
      requestId: admissionId(id),
      attachedAt: { $exists: true },
    });
    if (!attachment) throw new NotFoundException();
    return Buffer.isBuffer(attachment.bytes)
      ? attachment.bytes
      : Buffer.from(attachment.bytes.value());
  }

  async transition(
    id: string,
    dto: LifecycleTransitionDto,
    actor: AuthenticatedUser,
  ) {
    assertAdmissionPermission(actor, transitionPermissions[dto.transition]);
    if (dto.enrollmentEffectiveDate)
      assertAdmissionPermission(
        actor,
        PERMISSIONS.ADMISSIONS_ENROLLMENT_CONFIRM,
      );
    const { requests, groups, store, transactions, prepare } = this.workflow;
    const _id = admissionId(id);
    const actorId = admissionId(actor._id);
    const at = new Date();
    await transactions.run(async (session) => {
      const request = await requests
        .findOne({ _id, deletedAt: { $exists: false } })
        .session(session)
        .lean();
      if (!request) throw new NotFoundException();
      const prior = request.history.find(
        (event) => event.operationId === dto.operationId,
      );
      if (prior) {
        if (
          prior.action !== dto.transition ||
          String(prior.actorId) !== actor._id
        )
          admissionConflict();
        return;
      }
      if (
        request.revision !== dto.revision ||
        request.duplicateReviewRequired ||
        request.studentType !== 'TRANSFER'
      )
        admissionConflict();
      const hasStudent = Boolean(request.studentId && request.studentCode);
      const enrolled = request.officialEnrollmentStatus === 'ENROLLED';
      const provisional =
        request.status === 'APPROVED' &&
        request.officialEnrollmentStatus === 'PROVISIONAL';
      const rejected = dto.transition === 'REJECT_MINISTRY';
      const restoring = dto.transition === 'CORRECT_MINISTRY';
      const confirming = dto.transition === 'CONFIRM_ENROLLMENT';
      const ministryDecision = !confirming;
      if (!hasStudent) {
        const period = await store.periods
          .exists({ _id: request.admissionPeriodId, lifecycleEnabled: true })
          .session(session);
        if (
          !period ||
          !(
            (rejected &&
              ['PENDING', 'WAITLISTED', 'NEEDS_CORRECTION'].includes(
                request.status,
              )) ||
            (restoring &&
              request.status === 'REJECTED' &&
              request.ministryStatus === 'REJECTED')
          )
        )
          admissionConflict();
      } else if (
        restoring
          ? request.ministryStatus !== 'REJECTED' ||
            request.officialEnrollmentStatus !== 'CANCELLED'
          : confirming
            ? !provisional ||
              request.ministryStatus !== 'APPROVED' ||
              !dto.enrollmentEffectiveDate
            : rejected
              ? !provisional && !enrolled
              : !provisional || request.ministryStatus !== 'PENDING'
      )
        admissionConflict();
      if ((rejected || !hasStudent) && dto.enrollmentEffectiveDate)
        throw new BadRequestException(
          'This decision cannot confirm enrollment.',
        );
      if (restoring && !dto.reason?.trim())
        throw new BadRequestException(
          'Provide a reason for correcting the decision.',
        );

      const evidence = ministryDecision
        ? await attachMinistryEvidence(
            store.connection,
            _id,
            actorId,
            dto.ministryEvidence,
            session,
          )
        : undefined;
      const priorEvidence = request.history
        .slice()
        .reverse()
        .find((event) => event.details?.ministryEvidence)
        ?.details?.ministryEvidence;
      const priorDecisionDate =
        priorEvidence &&
        typeof priorEvidence === 'object' &&
        'decisionDate' in priorEvidence &&
        typeof priorEvidence.decisionDate === 'string'
          ? priorEvidence.decisionDate
          : undefined;
      if (dto.enrollmentEffectiveDate)
        validateEnrollmentDate(
          dto.enrollmentEffectiveDate,
          evidence?.decisionDate ?? priorDecisionDate,
        );
      const ministryStatus: MinistryStatus = rejected ? 'REJECTED' : 'APPROVED';
      const officialEnrollmentStatus: OfficialEnrollmentStatus | undefined =
        !hasStudent
          ? undefined
          : rejected
            ? 'CANCELLED'
            : dto.enrollmentEffectiveDate
              ? 'ENROLLED'
              : 'PROVISIONAL';
      const status = hasStudent
        ? 'APPROVED'
        : rejected
          ? 'REJECTED'
          : 'PENDING';
      const fields = {
        ministryStatus,
        ...(officialEnrollmentStatus ? { officialEnrollmentStatus } : {}),
        ...(dto.enrollmentEffectiveDate
          ? { enrollmentEffectiveDate: dto.enrollmentEffectiveDate }
          : {}),
      };

      if (hasStudent) {
        const owner = {
          studentCode: request.studentCode,
          userId: request.studentId,
        };
        const profile = await store.profiles.updateOne(
          owner,
          {
            $set: {
              ...fields,
              ...(rejected || restoring
                ? { enrollmentStatus: rejected ? 'inactive' : 'active' }
                : {}),
            },
            ...(rejected ? { $unset: { enrollmentEffectiveDate: 1 } } : {}),
          },
          { session },
        );
        if (!profile.matchedCount)
          admissionConflict('The student identity requires review.');
        if (rejected || restoring) {
          const user = await store.users.updateOne(
            {
              _id: request.studentId,
              role: 'student',
              studentCode: request.studentCode,
            },
            {
              $set: {
                isActive: restoring,
                ...(rejected
                  ? {
                      admissionArchivedAt: at,
                      deactivatedAt: at,
                      deactivatedBy: actorId,
                      deactivationReason: 'Ministry rejection',
                    }
                  : {}),
              },
              $inc: { tokenVersion: 1 },
              $unset: {
                refreshTokenHash: 1,
                refreshTokenExpiresAt: 1,
                ...(restoring
                  ? {
                      admissionArchivedAt: 1,
                      deactivatedAt: 1,
                      deactivatedBy: 1,
                      deactivationReason: 1,
                    }
                  : {}),
              },
            },
            { session },
          );
          if (!user.matchedCount)
            admissionConflict('The student account requires review.');
          if (request.groupId) {
            const seat = await groups.updateOne(
              {
                _id: request.groupId,
                ...(rejected
                  ? { enrolled: { $gt: 0 } }
                  : {
                      isEnabled: true,
                      deletedAt: { $exists: false },
                      $expr: { $lt: ['$enrolled', '$capacity'] },
                    }),
              },
              {
                $inc: { enrolled: rejected ? -1 : 1, revision: 1 },
                $push: {
                  history: {
                    actorId,
                    action: rejected ? 'SEAT_RELEASED' : 'SEAT_CLAIMED',
                    at,
                    revision: dto.revision + 1,
                  },
                },
              },
              { session },
            );
            if (!seat.modifiedCount)
              throw new ConflictException(
                'Review this group’s availability before changing enrollment.',
              );
          }
        }
        if (rejected) {
          await store.connection
            .db!.collection('admission_settlements')
            .updateOne(
              { _id },
              {
                $setOnInsert: {
                  studentId: request.studentId,
                  studentCode: request.studentCode,
                  createdAt: at,
                  createdBy: actorId,
                  status: 'OPEN',
                },
              },
              { session, upsert: true },
            );
          await store.connection
            .db!.collection('admission_contact_followups')
            .updateOne(
              { requestId: _id, operationId: dto.operationId },
              {
                $setOnInsert: {
                  requestId: _id,
                  operationId: dto.operationId,
                  studentId: request.studentId,
                  createdAt: at,
                  status: 'OPEN',
                  channel: 'REGISTERED_PHONE',
                },
              },
              { session, upsert: true },
            );
        }
      }
      const updated = await requests.updateOne(
        { _id, revision: dto.revision },
        {
          $set: { ...fields, status },
          ...(rejected
            ? {
                $unset: {
                  enrollmentEffectiveDate: 1,
                  correctionInstructions: 1,
                },
              }
            : {}),
          $inc: { revision: 1 },
          $push: {
            history: {
              actorId,
              at,
              action: dto.transition,
              revision: dto.revision + 1,
              reason: dto.reason,
              operationId: dto.operationId,
              details: {
                from: {
                  ministryStatus: request.ministryStatus,
                  officialEnrollmentStatus: request.officialEnrollmentStatus,
                  enrollmentEffectiveDate: request.enrollmentEffectiveDate,
                },
                to: fields,
                ...(evidence ? { ministryEvidence: evidence } : {}),
              },
            },
          },
        },
        { session },
      );
      if (!updated.modifiedCount) admissionConflict();
    }, prepare);
    return this.workflow.detail(id, actor);
  }
}
