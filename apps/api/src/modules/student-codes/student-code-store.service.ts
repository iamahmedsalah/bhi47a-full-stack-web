import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { isAdmissionAcademicYear } from '@student-portal/shared';
import type { ClientSession, Connection, Model } from 'mongoose';
import { User } from '../users/schemas/user.schema';
import { StudentProfile } from '../students/schemas/student-profile.schema';
import { AdmissionPeriod } from '../admissions/schemas/admission-period.schema';
import {
  StudentCodeEntry,
  StudentCodeYear,
  StudentCodeAuditLog,
} from './schemas/student-code.schema';
import {
  analyzeCodeSnapshot,
  type CodeProfile,
  type CodeUser,
} from './audit-snapshot';

// These code-keyed records make reuse unsafe. Keep this inventory explicit.
export const CODE_REFERENCE_COLLECTIONS = [
  'grades',
  'attendance',
  'academic_emails',
  'course_quizzes',
  'quiz_submissions',
  'attendance_records',
  'complaints',
  'tuition_audit_logs',
  'admission_requests',
] as const;
const SCAN_LIMIT = 10001;

@Injectable()
export class StudentCodeStore {
  private ready?: Promise<void>;
  constructor(
    @InjectConnection() readonly connection: Connection,
    @InjectModel(StudentCodeEntry.name)
    readonly entries: Model<StudentCodeEntry>,
    @InjectModel(StudentCodeYear.name)
    readonly years: Model<StudentCodeYear>,
    @InjectModel(StudentCodeAuditLog.name)
    readonly audits: Model<StudentCodeAuditLog>,
    @InjectModel(User.name) readonly users: Model<User>,
    @InjectModel(StudentProfile.name)
    readonly profiles: Model<StudentProfile>,
    @InjectModel(AdmissionPeriod.name)
    readonly periods: Model<AdmissionPeriod>,
  ) {}
  validateYear(academicYear: string, prefix: string) {
    if (!isAdmissionAcademicYear(academicYear) || !/^\d{2}$/.test(prefix))
      throw new BadRequestException({
        code: 'CODE_YEAR_INVALID',
        message:
          'Use a consecutive academic year and an explicit two-digit prefix.',
      });
  }
  async prepareWrites() {
    // Create the replacement constraints before removing obsolete code indexes.
    // Never synchronize indexes or touch unrelated legacy collections.
    this.ready ??= this.prepare().catch((error: unknown) => {
      this.ready = undefined;
      throw error;
    });
    return this.ready;
  }
  private async prepare() {
    await this.entries.createIndexes();
    // Replace the old year-wide constraint only after the prefix-scoped unique
    // index exists. Issued codes and ownership records remain unchanged.
    const registryIndexes = await this.entries.collection.indexes();
    const oldSequenceIndex = registryIndexes.find(
      (index) =>
        index.unique &&
        Object.keys(index.key).length === 2 &&
        index.key.academicYear === 1 &&
        index.key.sequence === 1,
    );
    if (oldSequenceIndex?.name) {
      try {
        await this.entries.collection.dropIndex(oldSequenceIndex.name);
      } catch (error: unknown) {
        // Another application instance may have completed this same upgrade.
        if (
          !error ||
          typeof error !== 'object' ||
          !('code' in error) ||
          error.code !== 27
        )
          throw error;
      }
    }
    await this.years.createIndexes();
    // The original prefix is historical metadata after a correction. Only the
    // effective allocationPrefix remains unique, allowing the original prefix
    // to be configured for its correct intake year.
    const yearIndexes = await this.years.collection.indexes();
    const originalPrefixIndex = yearIndexes.find(
      (index) =>
        index.unique &&
        Object.keys(index.key).length === 1 &&
        index.key.yearPrefix === 1,
    );
    if (originalPrefixIndex?.name) {
      try {
        await this.years.collection.dropIndex(originalPrefixIndex.name);
      } catch (error: unknown) {
        if (
          !error ||
          typeof error !== 'object' ||
          !('code' in error) ||
          error.code !== 27
        )
          throw error;
      }
    }
    await this.audits.createIndexes();
    for (const model of [this.users, this.profiles]) {
      const indexes = await model.collection.indexes();
      if (
        !indexes.some(
          (index) =>
            index.unique &&
            Object.keys(index.key).length === 1 &&
            index.key.studentCode === 1,
        )
      )
        throw new ServiceUnavailableException({
          code: 'CODE_IDENTITY_INDEXES_REQUIRED',
          message:
            'Student-code identity indexes must be verified before allocation.',
        });
    }
  }
  async snapshot(
    academicYear: string,
    prefix: string,
    session?: ClientSession,
  ) {
    this.validateYear(academicYear, prefix);
    const regex = new RegExp(`^${prefix}`);
    const aliasRegex = new RegExp(`^${prefix}[0-9]{4}$`);
    // MongoDB does not support parallel operations within a transaction.
    const users = await this.users
      .find({
        $or: [
          { studentCode: regex },
          { username: aliasRegex },
          { userCode: new RegExp(`^STD-${prefix}[0-9]{4}$`) },
        ],
      })
      .select('_id role studentCode username userCode')
      .sort({ _id: 1 })
      .limit(SCAN_LIMIT)
      .session(session ?? null)
      .lean<CodeUser[]>();
    const profiles = await this.profiles
      .find({ studentCode: regex })
      .select(
        '_id userId studentCode fullName fullNameAr fullNameEn department level academicYear',
      )
      .sort({ _id: 1 })
      .limit(SCAN_LIMIT)
      .session(session ?? null)
      .lean<CodeProfile[]>();
    const entries = await this.entries
      .find({ yearPrefix: prefix })
      .sort({ studentCode: 1 })
      .limit(SCAN_LIMIT)
      .session(session ?? null)
      .lean();
    // A legacy policy for another year can share this prefix. Prefer the selected
    // year instead of whichever branch MongoDB happens to match first.
    const yearPolicy = await this.years
      .findOne({ academicYear })
      .session(session ?? null)
      .lean();
    const policy =
      yearPolicy ??
      (await this.years
        .findOne({
          $or: [
            { allocationPrefix: prefix },
            { allocationPrefix: { $exists: false }, yearPrefix: prefix },
          ],
        })
        .session(session ?? null)
        .lean());
    const period = await this.periods
      .exists({ academicYear, deletedAt: { $exists: false } })
      .session(session ?? null);
    const truncated = [users, profiles, entries].some(
      (items) => items.length === SCAN_LIMIT,
    );
    return {
      ...analyzeCodeSnapshot(academicYear, prefix, {
        users,
        profiles,
        entries,
        policy,
        periodExists: Boolean(period),
        truncated,
      }),
      policy,
      truncated,
    };
  }
  async hasReferences(
    studentCode: string,
    session: ClientSession,
    allowHistorical = false,
  ) {
    const user = await this.users
      .exists({
        $or: [
          { studentCode },
          { username: studentCode },
          { userCode: `STD-${studentCode}` },
        ],
      })
      .session(session);
    if (user || (await this.profiles.exists({ studentCode }).session(session)))
      return true;
    if (
      !allowHistorical &&
      (await this.audits
        .exists({
          studentCode,
          action: {
            $in: [
              'ASSIGNED',
              'BACKFILLED',
              'IMPORTED',
              'MANUAL_CREATED',
              'OWNER_REVIEWED',
              'STUDENT_DELETED_CODE_HELD',
            ],
          },
        })
        .session(session))
    )
      return true;
    for (const name of CODE_REFERENCE_COLLECTIONS) {
      if (
        await this.connection
          .collection(name)
          .findOne({ studentCode }, { session, projection: { _id: 1 } })
      )
        return true;
    }
    return false;
  }
}
