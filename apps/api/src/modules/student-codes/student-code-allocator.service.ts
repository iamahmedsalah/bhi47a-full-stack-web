import { Injectable } from '@nestjs/common';
import { Types, type ClientSession } from 'mongoose';
import { formatStudentCode } from '@student-portal/shared';
import { StudentCodeStore } from './student-code-store.service';
import { AdmissionTransactions } from './admission-transactions.service';
import { codeConflict } from './student-codes.service';

export interface AssignedStudentCode {
  studentId: string;
  studentCode: string;
  academicYear: string;
}

/** Internal approval integration only. There is deliberately no allocation HTTP route. */
@Injectable()
export class StudentCodeAllocator {
  constructor(
    private readonly store: StudentCodeStore,
    private readonly transactions: AdmissionTransactions,
  ) {}

  /** The callback must use this session for ALL writes; it may be retried by MongoDB. */
  async allocate(
    academicYear: string,
    requestId: string,
    actorId: string,
    createStudent: (
      studentCode: string,
      session: ClientSession,
    ) => Promise<{ studentId: string }>,
  ): Promise<AssignedStudentCode> {
    await this.store.prepareWrites();
    return this.transactions.run(async (session) => {
      const request = new Types.ObjectId(requestId);
      const existing = await this.store.entries
        .findOne({ registrationRequestId: request })
        .session(session)
        .lean();
      if (existing) {
        if (
          existing.status !== 'ASSIGNED' ||
          existing.academicYear !== academicYear ||
          !existing.currentStudentId
        )
          codeConflict(
            'CODE_ASSIGNMENT_CONFLICT',
            'This request already has a conflicting code assignment.',
          );
        await this.verifyOwner(
          String(existing.currentStudentId),
          existing.studentCode,
          session,
        );
        return {
          studentId: String(existing.currentStudentId),
          studentCode: existing.studentCode,
          academicYear,
        };
      }
      const policy = await this.store.years
        .findOneAndUpdate(
          { academicYear },
          { $inc: { revision: 1 } },
          { new: true, session },
        )
        .lean();
      if (!policy)
        codeConflict(
          'CODE_YEAR_NOT_READY',
          'Initialize this admission year before approval.',
        );
      // Consume explicitly recovered, NEVER previously held codes first. Released
      // codes stay blocked until historic readers/importers have been migrated.
      let chosen: string | undefined;
      let from = 'MISSING';
      for (let attempts = 0; attempts < 20 && !chosen; attempts++) {
        const reusable = await this.store.entries
          .findOne({
            academicYear,
            status: 'AVAILABLE',
            currentStudentId: { $exists: false },
            'assignmentHistory.0': { $exists: false },
          })
          .sort({ sequence: 1 })
          .session(session)
          .lean();
        let code: string;
        let sequence: number;
        if (reusable) {
          code = reusable.studentCode;
          sequence = reusable.sequence;
        } else {
          const counter = await this.store.years
            .findOneAndUpdate(
              { academicYear, nextSequence: { $lte: 9999 } },
              { $inc: { nextSequence: 1 } },
              { new: false, session },
            )
            .lean();
          if (!counter)
            codeConflict(
              'CODE_SEQUENCE_EXHAUSTED',
              'The four-digit sequence is exhausted. No previous holder will be reused.',
            );
          sequence = counter.nextSequence;
          code = formatStudentCode(policy.yearPrefix, sequence);
          if (
            await this.store.entries
              .exists({ studentCode: code })
              .session(session)
          )
            continue;
        }
        if (await this.store.hasReferences(code, session)) {
          if (reusable)
            await this.store.entries.updateOne(
              { _id: reusable._id },
              { $set: { status: 'REQUIRES_REVIEW' } },
              { session },
            );
          else
            await this.store.entries.create(
              [
                {
                  studentCode: code,
                  academicYear,
                  yearPrefix: policy.yearPrefix,
                  sequence,
                  status: 'REQUIRES_REVIEW',
                  assignmentHistory: [],
                },
              ],
              { session },
            );
          await this.store.audits.create(
            [
              {
                studentCode: code,
                academicYear,
                action: 'MARKED_REVIEW',
                actorId: new Types.ObjectId(actorId),
                from: reusable ? 'AVAILABLE' : 'MISSING',
                to: 'REQUIRES_REVIEW',
                reason:
                  'Existing identity or academic records reference this code.',
                at: new Date(),
              },
            ],
            { session },
          );
          continue;
        }
        if (reusable) {
          from = 'AVAILABLE';
          await this.store.entries.updateOne(
            { _id: reusable._id },
            { $set: { status: 'RESERVED', registrationRequestId: request } },
            { session },
          );
        } else
          await this.store.entries.create(
            [
              {
                studentCode: code,
                academicYear,
                yearPrefix: policy.yearPrefix,
                sequence,
                status: 'RESERVED',
                registrationRequestId: request,
                assignmentHistory: [],
              },
            ],
            { session },
          );
        chosen = code;
      }
      if (!chosen)
        codeConflict(
          'CODE_ALLOCATION_REVIEW_REQUIRED',
          'Too many conflicting codes. Review this year before retrying.',
        );
      const { studentId } = await createStudent(chosen, session);
      await this.verifyOwner(studentId, chosen, session);
      const at = new Date();
      const student = new Types.ObjectId(studentId);
      await this.store.entries.updateOne(
        {
          studentCode: chosen,
          status: 'RESERVED',
          registrationRequestId: request,
        },
        {
          $set: { status: 'ASSIGNED', currentStudentId: student },
          $push: {
            assignmentHistory: {
              studentId: student,
              registrationRequestId: request,
              assignedAt: at,
              observedAt: at,
              source: 'admission',
            },
          },
        },
        { session },
      );
      await this.store.audits.create(
        [
          {
            studentCode: chosen,
            academicYear,
            action: 'ASSIGNED',
            actorId: new Types.ObjectId(actorId),
            studentId: student,
            requestId: request,
            from,
            to: 'ASSIGNED',
            reason: 'Authorized admission approval.',
            at,
          },
        ],
        { session },
      );
      return { studentId, studentCode: chosen, academicYear };
    });
  }
  private async verifyOwner(
    studentId: string,
    studentCode: string,
    session: ClientSession,
  ) {
    const user = await this.store.users
      .exists({ _id: studentId, role: 'student', studentCode })
      .session(session);
    const profile = await this.store.profiles
      .exists({ userId: studentId, studentCode })
      .session(session);
    if (!user || !profile)
      codeConflict(
        'CODE_ASSIGNMENT_CONFLICT',
        'A matching student account and profile must be created in the approval transaction.',
      );
  }
}
