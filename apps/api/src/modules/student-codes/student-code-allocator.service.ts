import { Injectable } from '@nestjs/common';
import { Types, type ClientSession } from 'mongoose';
import {
  admissionYearPrefix,
  formatStudentCode,
  parseStudentCode,
} from '@student-portal/shared';
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
    beforeAllocation?: (session: ClientSession) => Promise<void>,
    source: 'admission' | 'import' = 'admission',
  ): Promise<AssignedStudentCode> {
    return this.transactions.run(
      async (session) => {
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
        await beforeAllocation?.(session);
        let policy = await this.store.years
          .findOneAndUpdate(
            { academicYear },
            { $inc: { revision: 1 } },
            { new: true, session },
          )
          .lean();
        if (!policy) {
          const yearPrefix = admissionYearPrefix(academicYear);
          const snapshot = await this.store.snapshot(
            academicYear,
            yearPrefix,
            session,
          );
          const nextSequence = Math.max(1, (snapshot.maxSequence ?? 0) + 1);
          if (
            !snapshot.canInitialize ||
            snapshot.mappingConflict ||
            snapshot.truncated
          )
            codeConflict(
              'CODE_YEAR_NOT_READY',
              'Review and initialize the end-year prefix before approval. Existing codes will not be changed.',
            );
          const [created] = await this.store.years.create(
            [
              {
                academicYear,
                yearPrefix,
                allocationPrefix: yearPrefix,
                nextSequence,
                initializedAt: new Date(),
                initializedBy: new Types.ObjectId(actorId),
                initializationReason: 'Auto-initialized on admission approval',
              },
            ],
            { session },
          );
          policy = created.toObject();

          const legacy = snapshot.rows.filter(
            (row) => row.status === 'ASSIGNED',
          );
          if (legacy.length) {
            const at = new Date();
            await this.store.entries.insertMany(
              legacy.map((row) => ({
                studentCode: row.studentCode,
                academicYear,
                yearPrefix,
                sequence: row.sequence,
                status: 'ASSIGNED',
                currentStudentId: new Types.ObjectId(row.currentStudentId),
                assignmentHistory: [
                  {
                    studentId: new Types.ObjectId(row.currentStudentId),
                    observedAt: at,
                    source: 'legacy',
                  },
                ],
              })),
              { session, ordered: true },
            );
          }
          await this.store.audits.create(
            [
              {
                studentCode: `${yearPrefix}0000`,
                academicYear,
                actorId: new Types.ObjectId(actorId),
                action: 'INITIALIZED',
                to: 'INITIALIZED',
                reason:
                  'Validated end-year mapping on authorized admission approval.',
                at: new Date(),
              },
            ],
            { session },
          );
        }
        const prefix = policy.allocationPrefix ?? policy.yearPrefix;
        if (!policy.allocationPrefix)
          await this.store.years.updateOne(
            { academicYear },
            { $set: { allocationPrefix: prefix } },
            { session },
          );
        if (prefix !== admissionYearPrefix(academicYear))
          codeConflict(
            'CODE_YEAR_PREFIX_MISMATCH',
            'This year has an older prefix mapping. An administrator must review its correction before issuing further codes.',
          );
        // Imports may add a legacy code after a counter was initialized. Continue
        // beyond the actual high-water mark; numerical holes need explicit recovery.
        const exactPrefix = new RegExp(`^${prefix}[0-9]{4}$`);
        const latestUser = await this.store.users
          .findOne({ studentCode: exactPrefix })
          .select('studentCode')
          .sort({ studentCode: -1 })
          .session(session)
          .lean();
        const latestProfile = await this.store.profiles
          .findOne({ studentCode: exactPrefix })
          .select('studentCode')
          .sort({ studentCode: -1 })
          .session(session)
          .lean();
        const latestEntry = await this.store.entries
          .findOne({ studentCode: exactPrefix })
          .select('studentCode')
          .sort({ studentCode: -1 })
          .session(session)
          .lean();
        // Each intake prefix has its own sequence. A corrected prefix starts
        // at 0001 unless that prefix already has issued or protected codes.
        const latestYearEntry = await this.store.entries
          .findOne({ academicYear, yearPrefix: prefix })
          .select('sequence')
          .sort({ sequence: -1 })
          .session(session)
          .lean();
        const observedNext =
          1 +
          Math.max(
            0,
            latestYearEntry?.sequence ?? 0,
            ...[latestUser, latestProfile, latestEntry].map((item) =>
              item?.studentCode
                ? (parseStudentCode(item.studentCode, prefix) ?? 0)
                : 0,
            ),
          );
        if (observedNext > policy.nextSequence)
          await this.store.years.updateOne(
            { academicYear },
            { $max: { nextSequence: observedNext } },
            { session },
          );
        // Consume explicitly recovered, NEVER previously held codes first. Released
        // codes stay blocked until historic readers/importers have been migrated.
        let chosen: string | undefined;
        let from = 'MISSING';
        for (let attempts = 0; attempts < 20 && !chosen; attempts++) {
          const reusable = await this.store.entries
            .findOne({
              academicYear,
              yearPrefix: prefix,
              status: 'AVAILABLE',
              currentStudentId: { $exists: false },
              $or: [
                { 'assignmentHistory.0': { $exists: false } },
                { reuseAuthorized: true },
              ],
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
            code = formatStudentCode(prefix, sequence);
            if (
              await this.store.entries
                .exists({
                  $or: [
                    { studentCode: code },
                    { academicYear, yearPrefix: prefix, sequence },
                  ],
                })
                .session(session)
            )
              continue;
          }
          if (
            await this.store.hasReferences(
              code,
              session,
              reusable?.reuseAuthorized === true,
            )
          ) {
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
                    yearPrefix: prefix,
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
                  yearPrefix: prefix,
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
            $set: {
              status: 'ASSIGNED',
              currentStudentId: student,
              reuseAuthorized: false,
            },
            $push: {
              assignmentHistory: {
                studentId: student,
                registrationRequestId: request,
                assignedAt: at,
                observedAt: at,
                source,
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
              source,
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
      },
      () => this.store.prepareWrites(),
    );
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
      .exists({
        studentCode,
        $or: [{ userId: new Types.ObjectId(studentId) }, { userId: studentId }],
      })
      .session(session);
    if (!user || !profile)
      codeConflict(
        'CODE_ASSIGNMENT_CONFLICT',
        'A matching student account and profile must be created in the approval transaction.',
      );
  }
}
