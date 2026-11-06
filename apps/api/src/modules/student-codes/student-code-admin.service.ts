import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { admissionYearPrefix, parseStudentCode } from '@student-portal/shared';
import {
  StudentCodeStore,
  CODE_REFERENCE_COLLECTIONS,
} from './student-code-store.service';
import { AdmissionTransactions } from './admission-transactions.service';
import { codeConflict } from './student-codes.service';
import type { ManageStudentCodeDto } from './dto/student-code.dto';

@Injectable()
export class StudentCodeAdminService {
  constructor(
    private readonly store: StudentCodeStore,
    private readonly transactions: AdmissionTransactions,
  ) {}

  async manage(code: string, dto: ManageStudentCodeDto, actorId: string) {
    this.store.validateYear(dto.academicYear, dto.yearPrefix);
    const sequence = parseStudentCode(code, dto.yearPrefix);
    if (!sequence || admissionYearPrefix(dto.academicYear) !== dto.yearPrefix)
      codeConflict(
        'CODE_YEAR_INVALID',
        'Select the intake year matching this code prefix.',
      );
    const actor = new Types.ObjectId(actorId),
      releaseId = new Types.ObjectId();
    return this.transactions.run(
      async (session) => {
        const snapshot = await this.store.snapshot(
          dto.academicYear,
          dto.yearPrefix,
          session,
        );
        if (snapshot.truncated || snapshot.fingerprint !== dto.fingerprint)
          codeConflict(
            'CODE_PREVIEW_CHANGED',
            'Review a complete, current scan first.',
          );
        const row = snapshot.rows.find((item) => item.studentCode === code);
        if (!row)
          codeConflict(
            'CODE_RECOVERY_UNSAFE',
            'The code is missing from this scan.',
          );
        const entry = await this.store.entries
          .findOne({ studentCode: code })
          .session(session)
          .lean();
        if (snapshot.mappingConflict)
          codeConflict(
            'CODE_YEAR_NOT_READY',
            'Correct the intake prefix policy before applying this review.',
          );
        if (
          !snapshot.policy &&
          !(await this.store.periods
            .exists({
              academicYear: dto.academicYear,
              deletedAt: { $exists: false },
            })
            .session(session))
        )
          codeConflict(
            'CODE_YEAR_NOT_READY',
            'Configure an admission period for this intake first.',
          );
        const at = new Date();
        const details: Record<string, unknown> = {
          reportedOrigin: dto.origin,
          originVerification: 'admin_confirmed',
          sourceFile: dto.sourceFile,
          previousAcademicYear: entry?.academicYear,
        };
        let to: 'ASSIGNED' | 'AVAILABLE' | 'RELEASED';
        if (dto.action === 'CONFIRM_OWNER') {
          const ownerId = row.observedStudentId || row.currentStudentId;
          if (
            !ownerId ||
            !['CURRENT_OWNER', 'REGISTRY_YEAR_MISMATCH'].includes(row.reason) ||
            (entry &&
              (entry.status !== 'ASSIGNED' ||
                String(entry.currentStudentId) !== ownerId))
          )
            codeConflict(
              'CODE_OWNER_REVIEW_UNSAFE',
              'A matching student account, profile and registry owner are required.',
            );
          const owner = new Types.ObjectId(ownerId);
          const assignment = {
            studentId: owner,
            studentName: row.studentName,
            studentNameAr: row.studentNameAr,
            observedAt: at,
            source: dto.origin === 'manual' ? 'legacy' : dto.origin,
          };
          if (entry) {
            await this.store.entries.updateOne(
              { _id: entry._id, currentStudentId: owner, status: 'ASSIGNED' },
              { $set: { academicYear: dto.academicYear } },
              { session },
            );
          } else {
            await this.store.entries.create(
              [
                {
                  studentCode: code,
                  academicYear: dto.academicYear,
                  yearPrefix: dto.yearPrefix,
                  sequence,
                  currentStudentId: owner,
                  status: 'ASSIGNED',
                  assignmentHistory: [assignment],
                },
              ],
              { session },
            );
          }
          details.studentId = ownerId;
          to = 'ASSIGNED';
        } else {
          // No live login, profile or alias may be detached by a code-state action.
          const user = await this.store.users
            .exists({
              $or: [
                { studentCode: code },
                { username: code },
                { userCode: `STD-${code}` },
                ...(entry?.currentStudentId
                  ? [{ _id: entry.currentStudentId }]
                  : []),
              ],
            })
            .session(session);
          const profile = await this.store.profiles
            .exists({ studentCode: code })
            .session(session);
          if (
            user ||
            profile ||
            (entry?.status === 'RESERVED' && entry.registrationRequestId)
          )
            codeConflict(
              'CODE_ACTIVE_OWNER',
              'Delete or cancel the student identity before changing code availability.',
            );
          if (dto.action === 'FREE') {
            const db = this.store.connection.db!;
            const archives = db.collection('student_code_archived_records');
            const counts: Record<string, number> = {};
            for (const collection of CODE_REFERENCE_COLLECTIONS) {
              const records = await db
                .collection(collection)
                .find({ studentCode: code }, { session })
                .limit(1001)
                .toArray();
              if (records.length > 1000)
                codeConflict(
                  'CODE_ARCHIVE_LIMIT',
                  'More than 1000 records in one collection require a dedicated archive review.',
                );
              if (!records.length) continue;
              if (collection === 'admission_requests') {
                if (records.some((record) => record.status !== 'CANCELLED'))
                  codeConflict(
                    'CODE_ACTIVE_OWNER',
                    'Cancel the previous admission before reuse.',
                  );
                // Keep cancelled applications and tracking links; detach only the live code alias.
                await db.collection(collection).updateMany(
                  {
                    _id: { $in: records.map((record) => record._id) },
                    studentCode: code,
                  },
                  {
                    $set: { formerStudentCode: code },
                    $unset: { studentCode: '' },
                  },
                  { session },
                );
              } else {
                await archives.insertMany(
                  records.map((record) => ({
                    releaseId,
                    studentCode: code,
                    collection,
                    originalId: record._id,
                    previousStudentIds:
                      entry?.assignmentHistory.map(
                        (assignment) => assignment.studentId,
                      ) ?? [],
                    archivedAt: at,
                    archivedBy: actor,
                    record,
                  })),
                  { session },
                );
                const removed = await db.collection(collection).deleteMany(
                  {
                    _id: { $in: records.map((record) => record._id) },
                    studentCode: code,
                  },
                  { session },
                );
                if (removed.deletedCount !== records.length)
                  codeConflict(
                    'CODE_PREVIEW_CHANGED',
                    'Historical records changed during archiving.',
                  );
              }
              counts[collection] = records.length;
            }
            details.archivedRecords = counts;
            details.releaseId = String(releaseId);
            to = 'AVAILABLE';
          } else to = 'RELEASED';
          const history =
            entry?.assignmentHistory.map((assignment) => ({
              ...assignment,
              releasedAt: assignment.releasedAt ?? at,
              releasedBy: assignment.releasedBy ?? actor,
              releaseReason: assignment.releaseReason ?? dto.reason,
            })) ?? [];
          await this.store.entries.updateOne(
            { studentCode: code },
            {
              $set: {
                academicYear: dto.academicYear,
                status: to,
                reuseAuthorized: dto.action === 'FREE',
                assignmentHistory: history,
              },
              $unset: { currentStudentId: 1, registrationRequestId: 1 },
              $setOnInsert: { yearPrefix: dto.yearPrefix, sequence },
            },
            { session, upsert: true },
          );
        }
        // Fence against allocation and initialize missing counters only for an
        // intake with an existing admission period, preserving every issued code.
        await this.store.years.updateOne(
          { academicYear: dto.academicYear },
          {
            $inc: { revision: 1 },
            $max: { nextSequence: sequence + 1 },
            $setOnInsert: {
              yearPrefix: dto.yearPrefix,
              allocationPrefix: dto.yearPrefix,
              initializedAt: at,
              initializedBy: actor,
              initializationReason: dto.reason,
            },
          },
          { session, upsert: true },
        );
        await this.store.audits.create(
          [
            {
              studentCode: code,
              academicYear: dto.academicYear,
              actorId: actor,
              action:
                dto.action === 'FREE'
                  ? 'ADMIN_FREED'
                  : dto.action === 'BAN'
                    ? 'ADMIN_BANNED'
                    : 'OWNER_REVIEWED',
              from: row.status,
              to,
              reason: dto.reason,
              details,
              at,
            },
          ],
          { session },
        );
        return { studentCode: code, status: to, details };
      },
      async () => {
        await this.store.prepareWrites();
        await this.store.connection
          .db!.collection('student_code_archived_records')
          .createIndex({ studentCode: 1, archivedAt: -1 });
      },
    );
  }
}
