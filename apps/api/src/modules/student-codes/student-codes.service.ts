import type { ImportContext } from '../uploads/importer.interface';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Types } from 'mongoose';
import * as ExcelJS from 'exceljs';
import {
  parseStudentCode,
  admissionYearPrefix,
  type StudentCodeAuditResult,
} from '@student-portal/shared';
import { StudentCodeStore } from './student-code-store.service';
import { AdmissionTransactions } from './admission-transactions.service';
import type {
  AdmissionRequest,
  AdmissionGroup,
} from '../admissions/schemas/admission-workflow.schema';
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
  async assertImportOwnership(code: string, ownerId?: string) {
    const entry = await this.store.entries
      .findOne({ studentCode: code })
      .lean();
    if (
      entry &&
      (entry.status !== 'ASSIGNED' ||
        !ownerId ||
        String(entry.currentStudentId) !== ownerId)
    )
      codeConflict(
        'CODE_RECOVERY_UNSAFE',
        'This code is held by the registry. Review it in the code audit before importing.',
      );
  }
  async recordImport(
    rows: Array<{ studentCode: string; rowNum: number }>,
    actorId: string,
    context?: ImportContext,
    origin: 'import' | 'manual' = 'import',
  ) {
    const codes = rows.map((row) => row.studentCode);
    const profiles = await this.store.profiles
      .find({ studentCode: { $in: codes } })
      .select('studentCode userId academicYear')
      .lean();
    const users = await this.store.users
      .find({ studentCode: { $in: codes }, role: 'student' })
      .select('_id studentCode')
      .lean();
    const owners = new Map(
      users.map((user) => [user.studentCode, String(user._id)]),
    );
    const at = new Date();
    const events = profiles
      .filter(
        (profile) => owners.get(profile.studentCode) === String(profile.userId),
      )
      .map((profile) => ({
        studentCode: profile.studentCode,
        academicYear: profile.academicYear,
        studentId: profile.userId,
        actorId: new Types.ObjectId(actorId),
        action: origin === 'manual' ? 'MANUAL_CREATED' : 'IMPORTED',
        source: origin,
        details: {
          sourceFile: context?.sourceFile,
          batchId: context?.batchId,
          batchIndex: context?.batchIndex,
          rowNumber:
            (rows.find((row) => row.studentCode === profile.studentCode)
              ?.rowNum ?? 0) + (context?.rowOffset ?? 0),
          originVerification: 'system_recorded',
        },
        to: 'ASSIGNED',
        reason:
          origin === 'manual'
            ? 'Manually added student.'
            : `Spreadsheet row ${(rows.find((row) => row.studentCode === profile.studentCode)?.rowNum ?? 0) + (context?.rowOffset ?? 0)}`,
        at,
      }));
    if (events.length) await this.store.audits.insertMany(events);
  }
  async ownerDeletionPreview(code: string, ownerId: string) {
    const entry = await this.store.entries
      .findOne({ studentCode: code })
      .lean();
    const profile = await this.store.profiles
      .findOne({ studentCode: code, userId: new Types.ObjectId(ownerId) })
      .lean();
    if (!profile)
      codeConflict(
        'CODE_RECOVERY_UNSAFE',
        'Student ownership requires review.',
      );
    const academicYear = entry?.academicYear ?? profile.academicYear;
    if (!academicYear)
      codeConflict(
        'CODE_YEAR_INVALID',
        'Set the student academic year before deletion.',
      );
    return {
      academicYear,
      ...(await this.store.snapshot(academicYear, code.slice(0, 2))),
    };
  }
  /** Remove the login/profile, retaining academic evidence and permanent code ownership. */
  async deleteStudent(
    code: string,
    dto: InitializeCodeYearDto,
    actorId: string,
  ) {
    this.store.validateYear(dto.academicYear, dto.yearPrefix);
    return this.transactions.run(
      async (session) => {
        const snapshot = await this.store.snapshot(
          dto.academicYear,
          dto.yearPrefix,
          session,
        );
        if (snapshot.fingerprint !== dto.fingerprint)
          codeConflict(
            'CODE_PREVIEW_CHANGED',
            'Scan again and review the latest owner.',
          );
        const row = snapshot.rows.find((item) => item.studentCode === code);
        if (
          snapshot.truncated ||
          row?.status !== 'ASSIGNED' ||
          !row.currentStudentId
        )
          codeConflict(
            'CODE_RECOVERY_UNSAFE',
            'A verified current owner is required.',
          );
        const owner = new Types.ObjectId(row.currentStudentId);
        const actor = new Types.ObjectId(actorId);
        const at = new Date();
        const db = this.store.connection.db!;
        const requests = db.collection<AdmissionRequest>('admission_requests');
        const request = await requests.findOne(
          { studentCode: code },
          { session },
        );
        if (request && String(request.studentId) !== String(owner))
          codeConflict(
            'CODE_RECOVERY_UNSAFE',
            'Admission ownership requires review.',
          );
        if (request?.status === 'APPROVED') {
          if (request.groupId) {
            const seat = await db
              .collection<AdmissionGroup>('admission_groups')
              .updateOne(
                { _id: request.groupId, enrolled: { $gt: 0 } },
                {
                  $inc: { enrolled: -1, revision: 1 },
                  $push: {
                    history: {
                      actorId: actor,
                      action: 'SEAT_RELEASED',
                      at,
                      revision: 0,
                      reason: dto.reason,
                    },
                  },
                },
                { session },
              );
            if (seat.modifiedCount !== 1)
              codeConflict(
                'CODE_RECOVERY_UNSAFE',
                'Group enrollment requires review.',
              );
          }
          const cancelled = await requests.updateOne(
            {
              _id: request._id,
              status: 'APPROVED',
              revision: request.revision,
            },
            {
              $set: { status: 'CANCELLED' },
              $inc: { revision: 1 },
              $push: {
                history: {
                  actorId: actor,
                  action: 'CANCELLED_CODE_HELD',
                  at,
                  revision: request.revision + 1,
                  reason: dto.reason,
                },
              },
            },
            { session },
          );
          if (cancelled.modifiedCount !== 1)
            codeConflict(
              'CODE_PREVIEW_CHANGED',
              'Admission changed. Scan again.',
            );
        } else if (request && request.status !== 'CANCELLED') {
          codeConflict(
            'CODE_RECOVERY_UNSAFE',
            'Admission status requires review.',
          );
        }
        const entry = await this.store.entries
          .findOne({ studentCode: code })
          .session(session)
          .lean();
        if (entry) {
          const held = await this.store.entries.updateOne(
            { _id: entry._id, status: 'ASSIGNED', currentStudentId: owner },
            {
              $set: {
                status: 'RELEASED',
                assignmentHistory: entry.assignmentHistory.length
                  ? entry.assignmentHistory.map((assignment) =>
                      String(assignment.studentId) === String(owner) &&
                      !assignment.releasedAt
                        ? {
                            ...assignment,
                            studentName: row.studentName,
                            studentNameAr: row.studentNameAr,
                            releasedAt: at,
                            releasedBy: actor,
                            releaseReason: dto.reason,
                          }
                        : assignment,
                    )
                  : [
                      {
                        studentId: owner,
                        observedAt: at,
                        releasedAt: at,
                        releasedBy: actor,
                        releaseReason: dto.reason,
                        source: 'legacy',
                      },
                    ],
              },
              $unset: { currentStudentId: 1 },
            },
            { session },
          );
          if (held.modifiedCount !== 1)
            codeConflict(
              'CODE_PREVIEW_CHANGED',
              'Ownership changed. Scan again.',
            );
        } else {
          await this.store.entries.create(
            [
              {
                studentCode: code,
                academicYear: dto.academicYear,
                yearPrefix: dto.yearPrefix,
                sequence: row.sequence,
                status: 'RELEASED',
                assignmentHistory: [
                  {
                    studentId: owner,
                    observedAt: at,
                    releasedAt: at,
                    releasedBy: actor,
                    releaseReason: dto.reason,
                    source: 'legacy',
                  },
                ],
              },
            ],
            { session },
          );
        }
        const profile = await this.store.profiles.deleteOne(
          { _id: row.studentProfileId, studentCode: code, userId: owner },
          { session },
        );
        const user = await this.store.users.deleteOne(
          { _id: owner, role: 'student', studentCode: code },
          { session },
        );
        if (profile.deletedCount !== 1 || user.deletedCount !== 1)
          codeConflict('CODE_PREVIEW_CHANGED', 'Student changed. Scan again.');
        await this.store.audits.create(
          [
            {
              studentCode: code,
              academicYear: dto.academicYear,
              actorId: actor,
              studentId: owner,
              requestId: request?._id,
              action: 'STUDENT_DELETED_CODE_HELD',
              from: 'ASSIGNED',
              to: 'RELEASED',
              reason: dto.reason,
              at,
            },
          ],
          { session },
        );
        return { studentCode: code, status: 'RELEASED', codeReleased: false };
      },
      () => this.store.prepareWrites(),
    );
  }
  async holdPreviousOwner(
    code: string,
    dto: InitializeCodeYearDto,
    actorId: string,
  ) {
    this.store.validateYear(dto.academicYear, dto.yearPrefix);
    return this.transactions.run(
      async (session) => {
        const snapshot = await this.store.snapshot(
          dto.academicYear,
          dto.yearPrefix,
          session,
        );
        if (snapshot.fingerprint !== dto.fingerprint)
          codeConflict(
            'CODE_PREVIEW_CHANGED',
            'The audit changed. Scan again.',
          );
        const row = snapshot.rows.find((item) => item.studentCode === code);
        if (
          !snapshot.truncated &&
          row &&
          ['MISSING', 'AVAILABLE'].includes(row.status)
        ) {
          if (!snapshot.policy || snapshot.mappingConflict)
            codeConflict(
              'CODE_YEAR_NOT_READY',
              'Initialize the year mapping first.',
            );
          if (await this.store.hasReferences(code, session))
            codeConflict(
              'CODE_RECOVERY_UNSAFE',
              'Existing references require review.',
            );
          await this.store.years.updateOne(
            { academicYear: dto.academicYear },
            { $inc: { revision: 1 } },
            { session },
          );
          await this.store.entries.updateOne(
            { studentCode: code },
            {
              $set: { status: 'RESERVED' },
              $setOnInsert: {
                academicYear: dto.academicYear,
                yearPrefix: dto.yearPrefix,
                sequence: row.sequence,
                assignmentHistory: [],
              },
            },
            { session, upsert: true },
          );
          await this.store.audits.create(
            [
              {
                studentCode: code,
                academicYear: dto.academicYear,
                actorId: new Types.ObjectId(actorId),
                action: 'RESERVED_HELD',
                from: row.status,
                to: 'RESERVED',
                reason: dto.reason,
                at: new Date(),
              },
            ],
            { session },
          );
          return { studentCode: code, status: 'RESERVED', reuseEnabled: false };
        }
        if (
          snapshot.truncated ||
          !row ||
          row.reason !== 'PREVIOUS_OWNER_MISSING'
        )
          codeConflict(
            'CODE_RECOVERY_UNSAFE',
            'Only a verified missing previous owner can be marked held.',
          );
        const entry = await this.store.entries
          .findOne({ studentCode: code, status: 'ASSIGNED' })
          .session(session)
          .lean();
        if (!entry?.currentStudentId || !entry.assignmentHistory.length)
          codeConflict(
            'CODE_RECOVERY_UNSAFE',
            'Ownership history requires review.',
          );
        const owner = entry.currentStudentId;
        const user = await this.store.users
          .exists({
            $or: [
              { _id: owner },
              { studentCode: code },
              { username: code },
              { userCode: `STD-${code}` },
            ],
          })
          .session(session);
        const profile = await this.store.profiles
          .exists({ $or: [{ userId: owner }, { studentCode: code }] })
          .session(session);
        if (user || profile)
          codeConflict(
            'CODE_RECOVERY_UNSAFE',
            'A student identity still exists.',
          );
        await this.store.entries.updateOne(
          { _id: entry._id, status: 'ASSIGNED', currentStudentId: owner },
          {
            $set: { status: 'RELEASED' },
            $unset: { currentStudentId: 1 },
          },
          { session },
        );
        await this.store.audits.create(
          [
            {
              studentCode: code,
              academicYear: entry.academicYear,
              action: 'PREVIOUS_OWNER_HELD',
              actorId: new Types.ObjectId(actorId),
              studentId: owner,
              from: 'ASSIGNED',
              to: 'RELEASED',
              reason: dto.reason,
              at: new Date(),
            },
          ],
          { session },
        );
        return { studentCode: code, status: 'RELEASED', reuseEnabled: false };
      },
      () => this.store.prepareWrites(),
    );
  }
  constructor(
    private readonly store: StudentCodeStore,
    private readonly transactions: AdmissionTransactions,
  ) {}
  async exportAudit(query: CodeAuditQueryDto) {
    const snapshot = await this.store.snapshot(
      query.academicYear,
      query.yearPrefix,
    );
    const workbook = new ExcelJS.Workbook(),
      sheet = workbook.addWorksheet('Code Audit');
    sheet.addRow([
      'AcademicYear',
      'StudentCode',
      'Sequence',
      'Status',
      'Reason',
      'CurrentStudentId',
    ]);
    for (const row of snapshot.rows.filter(
      (row) =>
        (!query.status || row.status === query.status) &&
        (!query.search || row.studentCode.includes(query.search)),
    ))
      sheet.addRow(
        [
          query.academicYear,
          row.studentCode,
          row.sequence ?? '',
          row.status,
          row.reason,
          row.currentStudentId ?? '',
        ].map((value) =>
          typeof value === 'string' && /^[=+\-@\t\r\n]/.test(value)
            ? `'${value}`
            : value,
        ),
      );
    sheet.getRow(1).eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0D9488' },
      };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center' };
    });
    sheet.columns.forEach((column) => {
      let width = 12;
      column.eachCell?.((cell) => {
        width = Math.max(width, Math.min(50, cell.text.length + 2));
      });
      column.width = width;
    });
    const summary = workbook.addWorksheet('Scan');
    summary.addRows([
      ['ScannedAtUTC', new Date().toISOString()],
      ['Fingerprint', snapshot.fingerprint],
      ['Truncated', snapshot.truncated],
      ['ReuseEnabled', true],
      ...Object.entries(snapshot.summary),
    ]);
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
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
    const pageRows = rows.slice(
      (query.page - 1) * query.limit,
      query.page * query.limit,
    );
    const origins = await this.store.audits.aggregate<{
      _id: string;
      source?: string;
      details?: {
        reportedOrigin?: string;
        sourceFile?: string;
        rowNumber?: number;
        originVerification?: string;
      };
    }>([
      {
        $match: {
          studentCode: { $in: pageRows.map((row) => row.studentCode) },
          action: {
            $in: ['IMPORTED', 'MANUAL_CREATED', 'OWNER_REVIEWED', 'ASSIGNED'],
          },
        },
      },
      { $sort: { at: -1, _id: -1 } },
      {
        $group: {
          _id: '$studentCode',
          source: { $first: '$source' },
          details: { $first: '$details' },
        },
      },
    ]);
    const originMap = new Map(origins.map((origin) => [origin._id, origin]));
    return {
      academicYear: query.academicYear,
      yearPrefix: query.yearPrefix,
      scannedAt: new Date().toISOString(),
      fingerprint: snapshot.fingerprint,
      truncated: snapshot.truncated,
      canInitialize: snapshot.canInitialize,
      mappingConflict: snapshot.mappingConflict,
      reuseEnabled: true,
      policy: snapshot.policy
        ? {
            academicYear: snapshot.policy.academicYear,
            yearPrefix:
              snapshot.policy.allocationPrefix ?? snapshot.policy.yearPrefix,
            nextSequence: snapshot.policy.nextSequence,
            initializedAt: snapshot.policy.initializedAt.toISOString(),
          }
        : null,
      summary: snapshot.summary,
      items: pageRows.map((row) => {
        const origin = originMap.get(row.studentCode);
        return {
          ...row,
          ...(origin
            ? {
                provenance: {
                  source:
                    origin.source ?? origin.details?.reportedOrigin ?? 'legacy',
                  sourceFile: origin.details?.sourceFile,
                  rowNumber: origin.details?.rowNumber,
                  verification:
                    origin.details?.originVerification ?? 'system_recorded',
                },
              }
            : {}),
        };
      }),
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
        if (dto.yearPrefix !== admissionYearPrefix(dto.academicYear))
          codeConflict(
            'CODE_YEAR_PREFIX_MISMATCH',
            'Use the final two digits of the ending academic year for new allocation policies.',
          );
        const at = new Date();
        const actor = new Types.ObjectId(actorId);
        await this.store.years.create(
          [
            {
              academicYear: dto.academicYear,
              yearPrefix: dto.yearPrefix,
              nextSequence: snapshot.maxSequence + 1,
              allocationPrefix: dto.yearPrefix,
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
        if (!row || !['MISSING', 'RESERVED'].includes(row.status))
          codeConflict(
            'CODE_RECOVERY_UNSAFE',
            'Only an unassigned gap without assignment history may be recovered.',
          );
        const existing = await this.store.entries
          .findOne({ studentCode })
          .session(session)
          .lean();
        if (
          existing &&
          (existing.currentStudentId ||
            existing.registrationRequestId ||
            existing.assignmentHistory.length)
        )
          codeConflict(
            'CODE_RECOVERY_UNSAFE',
            'Previous ownership or an active allocation prevents recovery.',
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
        if (existing)
          await this.store.entries.updateOne(
            { _id: existing._id, status: 'RESERVED' },
            { $set: { status: 'AVAILABLE' } },
            { session },
          );
        else
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
              from: row.status,
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
    const actors = await this.store.users
      .find({ _id: { $in: events.map((event) => event.actorId) } })
      .select('_id name nameAr')
      .lean();
    const names = new Map(actors.map((actor) => [String(actor._id), actor]));
    const profile = await this.store.profiles
      .findOne({ studentCode })
      .select('_id')
      .lean();
    return {
      entry,
      existingIdentity: Boolean(profile),
      assignments: entry?.assignmentHistory ?? [],
      items: events.map((event) => ({
        ...event,
        actorName: names.get(String(event.actorId))?.name,
        actorNameAr: names.get(String(event.actorId))?.nameAr,
      })),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }
}
