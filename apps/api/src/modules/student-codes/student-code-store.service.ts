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
    // Only additive indexes on new collections; never sync/drop legacy indexes.
    this.ready ??= this.prepare().catch((error: unknown) => {
      this.ready = undefined;
      throw error;
    });
    return this.ready;
  }
  private async prepare() {
    await this.entries.createIndexes();
    await this.years.createIndexes();
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
        '_id userId studentCode fullName fullNameAr fullNameEn department level',
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
    const policy = await this.years
      .findOne({
        $or: [
          { academicYear },
          { allocationPrefix: prefix },
          { allocationPrefix: { $exists: false }, yearPrefix: prefix },
        ],
      })
      .session(session ?? null)
      .lean();
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
  async hasReferences(studentCode: string, session: ClientSession) {
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
