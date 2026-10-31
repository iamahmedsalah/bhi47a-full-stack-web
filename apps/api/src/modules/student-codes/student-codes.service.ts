import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Types } from 'mongoose';
import {
  parseStudentCode,
  type StudentCodeAuditResult,
} from '@student-portal/shared';
import { StudentCodeStore } from './student-code-store.service';
import { AdmissionTransactions } from './admission-transactions.service';
import {
  CodeAuditQueryDto,
  InitializeCodeYearDto,
  RecoverStudentCodeDto,
} from './dto/student-code.dto';

export function codeConflict(code: string, message: string): never {
  throw new ConflictException({ code, message });
}

@Injectable()
export class StudentCodesService {
  constructor(
    private readonly store: StudentCodeStore,
    private readonly transactions: AdmissionTransactions,
  ) {}
  async audit(query: CodeAuditQueryDto): Promise<StudentCodeAuditResult> {
    const snapshot = await this.store.snapshot(
      query.academicYear,
      query.yearPrefix,
    );
    const rows = snapshot.rows.filter(
      (row) =>
        (!query.status || row.status === query.status) &&
        (!query.search || row.studentCode.includes(query.search)),
    );
    return {
      academicYear: query.academicYear,
      yearPrefix: query.yearPrefix,
      scannedAt: new Date().toISOString(),
      fingerprint: snapshot.fingerprint,
      truncated: snapshot.truncated,
      canInitialize: snapshot.canInitialize,
      mappingConflict: snapshot.mappingConflict,
      reuseEnabled: false,
      policy: snapshot.policy
        ? {
            academicYear: snapshot.policy.academicYear,
            yearPrefix: snapshot.policy.yearPrefix,
            nextSequence: snapshot.policy.nextSequence,
            initializedAt: snapshot.policy.initializedAt.toISOString(),
          }
        : null,
      summary: snapshot.summary,
      items: rows.slice(
        (query.page - 1) * query.limit,
        query.page * query.limit,
      ),
      total: rows.length,
      page: query.page,
      limit: query.limit,
      totalPages: Math.max(1, Math.ceil(rows.length / query.limit)),
    };
  }
  async initialize(dto: InitializeCodeYearDto, actorId: string) {
    this.store.validateYear(dto.academicYear, dto.yearPrefix);
    return this.transactions.run(
      async (session) => {
        const snapshot = await this.store.snapshot(
          dto.academicYear,
          dto.yearPrefix,
          session,
        );
        if (snapshot.policy) {
          if (snapshot.mappingConflict)
            codeConflict(
              'CODE_YEAR_CONFLICT',
              'This year or prefix already belongs to a different mapping.',
            );
          return {
            academicYear: snapshot.policy.academicYear,
            yearPrefix: snapshot.policy.yearPrefix,
            nextSequence: snapshot.policy.nextSequence,
          };
        }
        if (snapshot.fingerprint !== dto.fingerprint)
          codeConflict(
            'CODE_PREVIEW_CHANGED',
            'The preview is stale. Scan again before confirming.',
          );
        if (!snapshot.canInitialize)
          codeConflict(
            'CODE_LEGACY_REVIEW_REQUIRED',
            'Resolve ambiguous records and configure an admission period before initialization.',
          );
        const at = new Date();
        const actor = new Types.ObjectId(actorId);
        await this.store.years.create(
          [
            {
              academicYear: dto.academicYear,
              yearPrefix: dto.yearPrefix,
              nextSequence: snapshot.maxSequence + 1,
              initializedAt: at,
              initializedBy: actor,
              initializationReason: dto.reason,
            },
          ],
          { session },
        );
        const legacy = snapshot.rows.filter((row) => row.status === 'ASSIGNED');
        if (legacy.length) {
          await this.store.entries.insertMany(
            legacy.map((row) => ({
              studentCode: row.studentCode,
              academicYear: dto.academicYear,
              yearPrefix: dto.yearPrefix,
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
          await this.store.audits.insertMany(
            legacy.map((row) => ({
              studentCode: row.studentCode,
              academicYear: dto.academicYear,
              action: 'BACKFILLED',
              actorId: actor,
              studentId: new Types.ObjectId(row.currentStudentId),
              to: 'ASSIGNED',
              reason: dto.reason,
              at,
            })),
            { session, ordered: true },
          );
        }
        await this.store.audits.create(
          [
            {
              studentCode: `${dto.yearPrefix}*`,
              academicYear: dto.academicYear,
              action: 'INITIALIZED',
              actorId: actor,
              to: 'INITIALIZED',
              reason: dto.reason,
              at,
            },
          ],
          { session },
        );
        return {
          academicYear: dto.academicYear,
          yearPrefix: dto.yearPrefix,
          nextSequence: snapshot.maxSequence + 1,
        };
      },
      () => this.store.prepareWrites(),
    );
  }
  async recover(
    studentCode: string,
    dto: RecoverStudentCodeDto,
    actorId: string,
  ) {
    this.store.validateYear(dto.academicYear, dto.yearPrefix);
    const sequence = parseStudentCode(studentCode, dto.yearPrefix);
    if (!sequence)
      throw new BadRequestException({
        code: 'CODE_FORMAT_INVALID',
        message: 'Use the configured two-digit prefix and four-digit sequence.',
      });
    return this.transactions.run(
      async (session) => {
        const snapshot = await this.store.snapshot(
          dto.academicYear,
          dto.yearPrefix,
          session,
        );
        if (!snapshot.policy || snapshot.mappingConflict)
          codeConflict(
            'CODE_YEAR_NOT_READY',
            'Initialize the year mapping first.',
          );
        if (snapshot.fingerprint !== dto.fingerprint)
          codeConflict(
            'CODE_PREVIEW_CHANGED',
            'The preview is stale. Scan again before confirming.',
          );
        if (snapshot.truncated)
          codeConflict(
            'CODE_LEGACY_REVIEW_REQUIRED',
            'A complete identity scan is required before recovery.',
          );
        const row = snapshot.rows.find(
          (item) => item.studentCode === studentCode,
        );
        if (!row || row.status !== 'MISSING')
          codeConflict(
            'CODE_RECOVERY_UNSAFE',
            'Only an unassigned gap without assignment history may be recovered.',
          );
        if (await this.store.hasReferences(studentCode, session))
          codeConflict(
            'CODE_RECOVERY_UNSAFE',
            'Existing records still reference this code.',
          );
        // Serialize recovery with allocation and other recoveries of this year.
        await this.store.years.updateOne(
          { academicYear: dto.academicYear },
          { $inc: { revision: 1 } },
          { session },
        );
        await this.store.entries.create(
          [
            {
              studentCode,
              academicYear: dto.academicYear,
              yearPrefix: dto.yearPrefix,
              sequence,
              status: 'AVAILABLE',
              assignmentHistory: [],
            },
          ],
          { session },
        );
        await this.store.audits.create(
          [
            {
              studentCode,
              academicYear: dto.academicYear,
              action: 'RECOVERED',
              actorId: new Types.ObjectId(actorId),
              from: 'MISSING',
              to: 'AVAILABLE',
              reason: dto.reason,
              at: new Date(),
            },
          ],
          { session },
        );
        return { studentCode, status: 'AVAILABLE' as const };
      },
      () => this.store.prepareWrites(),
    );
  }
  async history(studentCode: string, page = 1, limit = 20) {
    if (!/^\d{6}$/.test(studentCode))
      throw new BadRequestException('Invalid student code');
    const entry = await this.store.entries.findOne({ studentCode }).lean();
    const events = await this.store.audits
      .find({ studentCode })
      .sort({ at: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
    const total = await this.store.audits.countDocuments({ studentCode });
    return {
      entry,
      items: events,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }
}
