import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import type { ControlWorkflowState } from '@student-portal/shared';
import { AppLoggerService } from '../../core/logger/logger.service';
import { CacheService } from '../../core/cache/cache.service';
import {
  type AttendanceWipeScope,
  type ComplaintWipeScope,
  type GradeSourceScope,
  type GradeWipeExamType,
  type QuizWipeScope,
  type WipeDataDto,
  type WipePreviewDto,
  type WipeTarget,
} from './dto/wipe-data.dto';

const PROTECTED_CONTROL_WORKFLOW_STATES: readonly ControlWorkflowState[] = [
  'IN_REVIEW',
  'PENDING_APPROVAL',
  'APPROVED',
];

const CONTROL_COMPONENT_SET = new Set(['coursework', 'midterm', 'final']);

export interface WipeBreakdownItem {
  key: string;
  labelAr: string;
  labelEn: string;
  count: number;
}

export interface WipeSummaryResponse {
  studentsCount: number;
  gradesCount: number;
  attendanceCount: number;
  registrationsCount: number;
  advisingCasesCount: number;
  quizzesCount: number;
  complaintsCount: number;
  resolvedClosedComplaintsCount: number;
  controlSheetsCount: number;
  protectedControlSheetsCount: number;
  quizzesBreakdown: {
    quizzes: number;
    quizAttempts: number;
    quizSubmissions: number;
    legacyCourseQuizzes: number;
  };
  attendanceBreakdown: {
    sessions: number;
    openSessions: number;
    records: number;
    legacyAttendance: number;
  };
  gradesByYear: Array<{ academicYear: string; count: number }>;
  gradesByExamType: Record<string, number>;
  availableAcademicYears: string[];
  quizAcademicYears: string[];
  attendanceAcademicYears: string[];
  availableLevels: Array<{ level: string; count: number }>;
}

export interface WipePreviewResponse {
  target: WipeTarget;
  totalToDelete: number;
  remainingSafeCount: number;
  affectedStudentsCount: number;
  protectedCount: number;
  protectedControlSheetsCount: number;
  protectedControlGradesCount: number;
  protectedOpenSessionsCount: number;
  breakdown: WipeBreakdownItem[];
  examTypeBreakdown?: Array<{ examType: string; count: number }>;
  yearBreakdown?: Array<{ academicYear: string; count: number }>;
}

export interface WipeExecutionResponse {
  success: boolean;
  target: WipeTarget;
  deletedCounts: Record<string, number>;
  totalDeleted: number;
  protectedControlGradesCount?: number;
  protectedOpenSessionsCount?: number;
}

type DbInstance = NonNullable<Connection['db']>;

function cleanStringList(values?: string[]): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(
      values
        .map((v) => (typeof v === 'string' ? v.trim() : ''))
        .filter((v) => v.length > 0),
    ),
  );
}

function sortYearsDesc(years: Iterable<string>): string[] {
  return Array.from(new Set(years))
    .filter((y) => typeof y === 'string' && y.trim().length > 0)
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
}

function parseOlderThanDate(raw?: string): Date | undefined {
  if (!raw || !raw.trim()) return undefined;
  const trimmed = raw.trim();
  // YYYY-MM-DD treated as start of that day in UTC/local safe boundary
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? new Date(`${trimmed}T00:00:00.000Z`)
    : new Date(trimmed);
  if (!Number.isFinite(parsed.getTime())) {
    throw new BadRequestException('تاريخ التصفية غير صالح');
  }
  return parsed;
}

@Injectable()
export class UploadsWipeService {
  constructor(
    private readonly logger: AppLoggerService,
    @InjectConnection() private readonly connection: Connection,
    @Optional() private readonly cacheService?: CacheService,
  ) {}

  private requireDb(): DbInstance {
    const db = this.connection.db;
    if (!db) {
      throw new BadRequestException('Database connection is not available');
    }
    return db;
  }

  private async safeCount(
    db: DbInstance,
    collectionName: string,
    filter: Record<string, unknown> = {},
  ): Promise<number> {
    const col = db.collection(collectionName);
    if (!col || typeof col.countDocuments !== 'function') return 0;
    return col.countDocuments(filter);
  }

  private async safeAggregate<T extends Record<string, unknown>>(
    db: DbInstance,
    collectionName: string,
    pipeline: Record<string, unknown>[],
  ): Promise<T[]> {
    const col = db.collection(collectionName);
    if (!col || typeof col.aggregate !== 'function') return [];
    return (await col.aggregate(pipeline).toArray()) as T[];
  }

  private async safeDistinctStrings(
    db: DbInstance,
    collectionName: string,
    field: string,
  ): Promise<string[]> {
    const col = db.collection(collectionName);
    if (!col || typeof col.distinct !== 'function') return [];
    const values = await col.distinct(field, {
      [field]: { $exists: true, $nin: [null, ''] },
    });
    return values
      .map((v: unknown) => (typeof v === 'string' ? v.trim() : ''))
      .filter(Boolean);
  }

  async getWipeSummary(): Promise<WipeSummaryResponse> {
    const db = this.requireDb();

    const [
      studentsCount,
      gradeGroups,
      quizDefinitionsCount,
      quizAttemptsCount,
      quizSubmissionsCount,
      legacyCourseQuizzesCount,
      attendanceSessionsCount,
      attendanceOpenSessionsCount,
      attendanceRecordsCount,
      legacyAttendanceCount,
      registrationsCount,
      advisingCasesCount,
      complaintsCount,
      resolvedClosedComplaintsCount,
      controlSheetsCount,
      protectedControlSheetsCount,
      quizYearsNew,
      quizYearsLegacy,
      attendanceYearsNew,
      attendanceYearsLegacy,
      levelGroups,
    ] = await Promise.all([
      this.safeCount(db, 'users', { role: 'student' }),
      this.safeAggregate<{
        _id: { academicYear?: string | null; examType?: string | null };
        count: number;
      }>(db, 'grades', [
        {
          $group: {
            _id: { academicYear: '$academicYear', examType: '$examType' },
            count: { $sum: 1 },
          },
        },
      ]),
      this.safeCount(db, 'quizzes', {}),
      this.safeCount(db, 'quiz_attempts', {}),
      this.safeCount(db, 'quiz_submissions', {}),
      this.safeCount(db, 'course_quizzes', {}),
      this.safeCount(db, 'attendance_sessions', {}),
      this.safeCount(db, 'attendance_sessions', { status: 'OPEN' }),
      this.safeCount(db, 'attendance_records', {}),
      this.safeCount(db, 'attendance', {}),
      this.safeCount(db, 'course_registrations', {}),
      this.safeCount(db, 'advising_cases', {}),
      this.safeCount(db, 'complaints', {}),
      this.safeCount(db, 'complaints', {
        status: { $in: ['resolved', 'closed'] },
      }),
      this.safeCount(db, 'control_sheets', {}),
      this.safeCount(db, 'control_sheets', {
        $or: [
          { workflowState: { $in: [...PROTECTED_CONTROL_WORKFLOW_STATES] } },
          { locked: true },
        ],
      }),
      this.safeDistinctStrings(db, 'quizzes', 'academicYear'),
      this.safeDistinctStrings(db, 'course_quizzes', 'academicYear'),
      this.safeDistinctStrings(db, 'attendance_sessions', 'academicYear'),
      this.safeDistinctStrings(db, 'attendance', 'academicYear'),
      this.safeAggregate<{ _id: string | null; count: number }>(
        db,
        'student_profiles',
        [{ $group: { _id: '$level', count: { $sum: 1 } } }],
      ),
    ]);

    let gradesCount = 0;
    const yearMap = new Map<string, number>();
    const examTypeMap: Record<string, number> = {};

    for (const row of gradeGroups) {
      const count = Number(row.count || 0);
      gradesCount += count;
      const year =
        typeof row._id?.academicYear === 'string'
          ? row._id.academicYear.trim()
          : '';
      if (year) {
        yearMap.set(year, (yearMap.get(year) ?? 0) + count);
      }
      const examType =
        typeof row._id?.examType === 'string' ? row._id.examType.trim() : '';
      if (examType) {
        examTypeMap[examType] = (examTypeMap[examType] ?? 0) + count;
      }
    }

    const gradesByYear = Array.from(yearMap.entries())
      .map(([academicYear, count]) => ({ academicYear, count }))
      .sort((a, b) =>
        b.academicYear.localeCompare(a.academicYear, undefined, {
          numeric: true,
        }),
      );

    const quizAcademicYears = sortYearsDesc([
      ...quizYearsNew,
      ...quizYearsLegacy,
    ]);
    const attendanceAcademicYears = sortYearsDesc([
      ...attendanceYearsNew,
      ...attendanceYearsLegacy,
    ]);
    const availableAcademicYears = sortYearsDesc([
      ...gradesByYear.map((y) => y.academicYear),
      ...quizAcademicYears,
      ...attendanceAcademicYears,
    ]);

    const availableLevels = levelGroups
      .filter(
        (g) =>
          g._id !== null && g._id !== undefined && String(g._id).trim() !== '',
      )
      .map((g) => ({
        level: String(g._id).trim(),
        count: Number(g.count || 0),
      }))
      .sort((a, b) =>
        a.level.localeCompare(b.level, undefined, { numeric: true }),
      );

    const quizzesCount =
      quizDefinitionsCount +
      quizAttemptsCount +
      quizSubmissionsCount +
      legacyCourseQuizzesCount;

    const attendanceCount =
      attendanceSessionsCount + attendanceRecordsCount + legacyAttendanceCount;

    return {
      studentsCount,
      gradesCount,
      attendanceCount,
      registrationsCount,
      advisingCasesCount,
      quizzesCount,
      complaintsCount,
      resolvedClosedComplaintsCount,
      controlSheetsCount,
      protectedControlSheetsCount,
      quizzesBreakdown: {
        quizzes: quizDefinitionsCount,
        quizAttempts: quizAttemptsCount,
        quizSubmissions: quizSubmissionsCount,
        legacyCourseQuizzes: legacyCourseQuizzesCount,
      },
      attendanceBreakdown: {
        sessions: attendanceSessionsCount,
        openSessions: attendanceOpenSessionsCount,
        records: attendanceRecordsCount,
        legacyAttendance: legacyAttendanceCount,
      },
      gradesByYear,
      gradesByExamType: examTypeMap,
      availableAcademicYears,
      quizAcademicYears,
      attendanceAcademicYears,
      availableLevels,
    };
  }

  private buildGradesBaseFilter(dto: WipePreviewDto): Record<string, unknown> {
    const filter: Record<string, unknown> = {};
    const years = cleanStringList(dto.academicYears);
    if (years.length > 0) {
      filter.academicYear = { $in: years };
    }
    if (dto.semester && dto.semester !== 'all') {
      filter.semester = dto.semester;
    }
    const examTypes = cleanStringList(dto.examTypes) as GradeWipeExamType[];
    if (examTypes.length > 0) {
      filter.examType = { $in: examTypes };
    }

    const sourceScope: GradeSourceScope = dto.sourceScope ?? 'all';
    if (sourceScope === 'historical_only') {
      filter.historicalImport = true;
    } else if (sourceScope === 'non_control_only') {
      filter.controlManaged = { $ne: true };
    }

    return filter;
  }

  private buildControlSheetScopeFilter(
    dto: WipePreviewDto,
  ): Record<string, unknown> {
    const filter: Record<string, unknown> = {};
    const years = cleanStringList(dto.academicYears);
    if (years.length > 0) {
      filter.academicYear = { $in: years };
    }
    if (dto.semester && dto.semester !== 'all') {
      filter.semester = dto.semester;
    }
    const examTypes = cleanStringList(dto.examTypes);
    if (examTypes.length > 0) {
      const components = examTypes.filter((t) => CONTROL_COMPONENT_SET.has(t));
      if (components.length === 0) {
        return { _id: { $in: [] } };
      }
      filter.component = { $in: components };
    }
    return filter;
  }

  private async resolveGradesPlan(db: DbInstance, dto: WipePreviewDto) {
    const baseFilter = this.buildGradesBaseFilter(dto);
    const includeApprovedControl = dto.includeApprovedControl === true;
    const sheetScopeFilter = this.buildControlSheetScopeFilter(dto);

    const protectedSheetFilter = {
      ...sheetScopeFilter,
      $or: [
        { workflowState: { $in: [...PROTECTED_CONTROL_WORKFLOW_STATES] } },
        { locked: true },
      ],
    };

    const sheetsCol = db.collection('control_sheets');
    const protectedSheets =
      sheetsCol && typeof sheetsCol.find === 'function'
        ? await sheetsCol
            .find(protectedSheetFilter, {
              projection: {
                _id: 1,
                courseId: 1,
                academicYear: 1,
                semester: 1,
                component: 1,
              },
            })
            .toArray()
        : [];

    const gradesCol = db.collection('grades');
    const protectedGradeIdSet = new Set<string>();
    const protectedGradeIds: unknown[] = [];

    const addProtectedId = (id: unknown) => {
      const key = String(id);
      if (!protectedGradeIdSet.has(key)) {
        protectedGradeIdSet.add(key);
        protectedGradeIds.push(id);
      }
    };

    // 1. Grades governed by protected Control sheets (uses compound index on grades)
    if (
      protectedSheets.length > 0 &&
      gradesCol &&
      typeof gradesCol.find === 'function'
    ) {
      await Promise.all(
        protectedSheets.map(async (sheet) => {
          const rows = await gradesCol
            .find(
              {
                ...baseFilter,
                courseId: sheet.courseId,
                academicYear: sheet.academicYear,
                semester: sheet.semester,
                examType: sheet.component,
              },
              { projection: { _id: 1 } },
            )
            .toArray();
          for (const row of rows) addProtectedId(row._id);
        }),
      );
    }

    // 2. Grades carrying explicit approved revision or published control flags
    if (gradesCol && typeof gradesCol.find === 'function') {
      const approvedFlagRows = await gradesCol
        .find(
          {
            ...baseFilter,
            $or: [
              { controlApprovedRev: { $exists: true, $ne: null } },
              { controlManaged: true, isPublished: true },
            ],
          },
          { projection: { _id: 1 } },
        )
        .toArray();
      for (const row of approvedFlagRows) addProtectedId(row._id);
    }

    const protectedControlGradesCount = protectedGradeIds.length;
    const protectedControlSheetsCount = protectedSheets.length;

    const finalFilter: Record<string, unknown> =
      !includeApprovedControl && protectedGradeIds.length > 0
        ? { ...baseFilter, _id: { $nin: protectedGradeIds } }
        : baseFilter;

    return {
      baseFilter,
      finalFilter,
      sheetScopeFilter,
      includeApprovedControl,
      protectedControlGradesCount,
      protectedControlSheetsCount,
    };
  }

  private async resolveQuizPlan(db: DbInstance, dto: WipePreviewDto) {
    const scope: QuizWipeScope = dto.quizScope ?? 'everything';
    const years = cleanStringList(dto.academicYears);
    const hasSemester = Boolean(dto.semester && dto.semester !== 'all');
    const hasTermFilter = years.length > 0 || hasSemester;

    const includeDefinitions =
      scope === 'all_quizzes_and_submissions' || scope === 'everything';
    const includeAttemptsAndSubmissions =
      scope === 'attempts_and_submissions' ||
      scope === 'all_quizzes_and_submissions' ||
      scope === 'everything';
    const includeLegacy =
      scope === 'legacy_course_quizzes' || scope === 'everything';

    const quizFilter: Record<string, unknown> = {};
    if (years.length > 0) quizFilter.academicYear = { $in: years };
    if (hasSemester) quizFilter.semester = dto.semester;

    let childFilter: Record<string, unknown> = {};
    if (
      hasTermFilter &&
      (includeDefinitions || includeAttemptsAndSubmissions)
    ) {
      const quizzesCol = db.collection('quizzes');
      const matchingQuizzes =
        quizzesCol && typeof quizzesCol.find === 'function'
          ? await quizzesCol
              .find(quizFilter, { projection: { _id: 1 } })
              .toArray()
          : [];
      const quizIds = matchingQuizzes.map((q) => q._id);
      childFilter = { quizId: { $in: quizIds } };
    }

    const legacyFilter: Record<string, unknown> = {};
    if (years.length > 0) legacyFilter.academicYear = { $in: years };
    if (hasSemester) legacyFilter.semester = dto.semester;

    return {
      scope,
      includeDefinitions,
      includeAttemptsAndSubmissions,
      includeLegacy,
      quizFilter,
      childFilter,
      legacyFilter,
    };
  }

  private async resolveAttendancePlan(db: DbInstance, dto: WipePreviewDto) {
    const scope: AttendanceWipeScope = dto.attendanceScope ?? 'everything';
    const includeOpenSessions = dto.includeOpenAttendanceSessions === true;
    const years = cleanStringList(dto.academicYears);
    const hasSemester = Boolean(dto.semester && dto.semester !== 'all');

    const includeQr =
      scope === 'qr_sessions_and_records' || scope === 'everything';
    const includeLegacy =
      scope === 'legacy_attendance' || scope === 'everything';

    const baseSessionFilter: Record<string, unknown> = {};
    if (years.length > 0) baseSessionFilter.academicYear = { $in: years };
    if (hasSemester) baseSessionFilter.semester = dto.semester;

    const protectedOpenSessionsCount =
      includeQr && !includeOpenSessions
        ? await this.safeCount(db, 'attendance_sessions', {
            ...baseSessionFilter,
            status: 'OPEN',
          })
        : 0;

    const sessionFilter: Record<string, unknown> = includeOpenSessions
      ? baseSessionFilter
      : { ...baseSessionFilter, status: { $ne: 'OPEN' } };

    let recordsFilter: Record<string, unknown> = {};
    const mustJoinBySession =
      includeQr && (years.length > 0 || hasSemester || !includeOpenSessions);

    if (mustJoinBySession) {
      const sessionsCol = db.collection('attendance_sessions');
      const matchingSessions =
        sessionsCol && typeof sessionsCol.find === 'function'
          ? await sessionsCol
              .find(sessionFilter, { projection: { _id: 1 } })
              .toArray()
          : [];
      const sessionIds = matchingSessions.map((s) => s._id);
      recordsFilter = { sessionId: { $in: sessionIds } };
    }

    const legacyFilter: Record<string, unknown> = {};
    if (years.length > 0) legacyFilter.academicYear = { $in: years };
    if (hasSemester) legacyFilter.semester = dto.semester;

    return {
      scope,
      includeQr,
      includeLegacy,
      includeOpenSessions,
      protectedOpenSessionsCount,
      sessionFilter,
      recordsFilter,
      legacyFilter,
    };
  }

  private buildComplaintFilter(dto: WipePreviewDto): Record<string, unknown> {
    const filter: Record<string, unknown> = {};
    const scope: ComplaintWipeScope = dto.complaintScope ?? 'all';
    if (scope === 'resolved_and_closed') {
      filter.status = { $in: ['resolved', 'closed'] };
    }
    const olderThanDate = parseOlderThanDate(dto.olderThan);
    if (olderThanDate) {
      filter.createdAt = { $lt: olderThanDate };
    }
    return filter;
  }

  private async resolveTargetStudents(db: DbInstance, dto: WipePreviewDto) {
    const levels = cleanStringList(dto.levels);
    const usersCol = db.collection('users');
    const profilesCol = db.collection('student_profiles');

    let userFilter: Record<string, unknown> = { role: 'student' };
    if (
      levels.length > 0 &&
      profilesCol &&
      typeof profilesCol.find === 'function'
    ) {
      const levelProfiles = await profilesCol
        .find({ level: { $in: levels } }, { projection: { userId: 1 } })
        .toArray();
      const userIds = levelProfiles
        .map((p) => p.userId)
        .filter((id) => id !== undefined && id !== null);
      userFilter = { role: 'student', _id: { $in: userIds } };
    }

    const students =
      usersCol && typeof usersCol.find === 'function'
        ? await usersCol
            .find(userFilter, {
              projection: { _id: 1, studentCode: 1, email: 1 },
            })
            .toArray()
        : [];

    const studentIds = students.map((s) => s._id);
    const studentCodes = students
      .map((s) => (typeof s.studentCode === 'string' ? s.studentCode : ''))
      .filter(Boolean);

    return { students, studentIds, studentCodes };
  }

  async previewWipe(dto: WipePreviewDto): Promise<WipePreviewResponse> {
    const db = this.requireDb();

    if (dto.target === 'grades') {
      const plan = await this.resolveGradesPlan(db, dto);
      const [totalGradesInDb, groupedTarget, distinctStudents] =
        await Promise.all([
          this.safeCount(db, 'grades', {}),
          this.safeAggregate<{
            _id: { academicYear?: string | null; examType?: string | null };
            count: number;
          }>(db, 'grades', [
            { $match: plan.finalFilter },
            {
              $group: {
                _id: { academicYear: '$academicYear', examType: '$examType' },
                count: { $sum: 1 },
              },
            },
          ]),
          this.safeAggregate<{ total: number }>(db, 'grades', [
            { $match: plan.finalFilter },
            { $group: { _id: '$studentId' } },
            { $count: 'total' },
          ]),
        ]);

      let totalToDelete = 0;
      const byType = new Map<string, number>();
      const byYear = new Map<string, number>();
      for (const row of groupedTarget) {
        const count = Number(row.count || 0);
        totalToDelete += count;
        const examType =
          typeof row._id?.examType === 'string' && row._id.examType.trim()
            ? row._id.examType.trim()
            : 'other';
        byType.set(examType, (byType.get(examType) ?? 0) + count);
        const year =
          typeof row._id?.academicYear === 'string' &&
          row._id.academicYear.trim()
            ? row._id.academicYear.trim()
            : 'unknown';
        byYear.set(year, (byYear.get(year) ?? 0) + count);
      }

      const affectedControlSheetsCount = plan.includeApprovedControl
        ? await this.safeCount(db, 'control_sheets', plan.sheetScopeFilter)
        : 0;

      const breakdown: WipeBreakdownItem[] = [
        {
          key: 'grades',
          labelAr: 'سجلات الدرجات',
          labelEn: 'Grade Records',
          count: totalToDelete,
        },
      ];
      if (affectedControlSheetsCount > 0) {
        breakdown.push({
          key: 'controlSheets',
          labelAr: 'شيتات الكنترول المرتبطة',
          labelEn: 'Linked Control Sheets',
          count: affectedControlSheetsCount,
        });
      }

      return {
        target: 'grades',
        totalToDelete,
        remainingSafeCount: Math.max(0, totalGradesInDb - totalToDelete),
        affectedStudentsCount: Number(distinctStudents[0]?.total ?? 0),
        protectedCount: plan.includeApprovedControl
          ? 0
          : plan.protectedControlGradesCount,
        protectedControlSheetsCount: plan.protectedControlSheetsCount,
        protectedControlGradesCount: plan.protectedControlGradesCount,
        protectedOpenSessionsCount: 0,
        breakdown,
        examTypeBreakdown: Array.from(byType.entries())
          .map(([examType, count]) => ({ examType, count }))
          .sort((a, b) => b.count - a.count),
        yearBreakdown: Array.from(byYear.entries())
          .map(([academicYear, count]) => ({ academicYear, count }))
          .sort((a, b) =>
            b.academicYear.localeCompare(a.academicYear, undefined, {
              numeric: true,
            }),
          ),
      };
    }

    if (dto.target === 'quizzes') {
      const plan = await this.resolveQuizPlan(db, dto);
      const [
        totalAll,
        quizzesDel,
        attemptsDel,
        submissionsDel,
        legacyDel,
        distinctSubsStudents,
      ] = await Promise.all([
        Promise.all([
          this.safeCount(db, 'quizzes', {}),
          this.safeCount(db, 'quiz_attempts', {}),
          this.safeCount(db, 'quiz_submissions', {}),
          this.safeCount(db, 'course_quizzes', {}),
        ]).then((vals) => vals.reduce((a, b) => a + b, 0)),
        plan.includeDefinitions
          ? this.safeCount(db, 'quizzes', plan.quizFilter)
          : Promise.resolve(0),
        plan.includeAttemptsAndSubmissions
          ? this.safeCount(db, 'quiz_attempts', plan.childFilter)
          : Promise.resolve(0),
        plan.includeAttemptsAndSubmissions
          ? this.safeCount(db, 'quiz_submissions', plan.childFilter)
          : Promise.resolve(0),
        plan.includeLegacy
          ? this.safeCount(db, 'course_quizzes', plan.legacyFilter)
          : Promise.resolve(0),
        plan.includeAttemptsAndSubmissions
          ? this.safeAggregate<{ total: number }>(db, 'quiz_submissions', [
              { $match: plan.childFilter },
              { $group: { _id: '$studentId' } },
              { $count: 'total' },
            ])
          : Promise.resolve([]),
      ]);

      const totalToDelete =
        quizzesDel + attemptsDel + submissionsDel + legacyDel;

      const breakdown: WipeBreakdownItem[] = [];
      if (plan.includeDefinitions) {
        breakdown.push({
          key: 'quizzes',
          labelAr: 'الكويزات (الأسئلة والتعريفات)',
          labelEn: 'Quizzes (Definitions)',
          count: quizzesDel,
        });
      }
      if (plan.includeAttemptsAndSubmissions) {
        breakdown.push(
          {
            key: 'quizSubmissions',
            labelAr: 'تسليمات الطلاب',
            labelEn: 'Student Submissions',
            count: submissionsDel,
          },
          {
            key: 'quizAttempts',
            labelAr: 'محاولات الاختبار',
            labelEn: 'Quiz Attempts',
            count: attemptsDel,
          },
        );
      }
      if (plan.includeLegacy) {
        breakdown.push({
          key: 'courseQuizzes',
          labelAr: 'كويزات شيتات الإكسيل القديمة',
          labelEn: 'Legacy Excel Course Quizzes',
          count: legacyDel,
        });
      }

      return {
        target: 'quizzes',
        totalToDelete,
        remainingSafeCount: Math.max(0, totalAll - totalToDelete),
        affectedStudentsCount: Number(distinctSubsStudents[0]?.total ?? 0),
        protectedCount: 0,
        protectedControlSheetsCount: 0,
        protectedControlGradesCount: 0,
        protectedOpenSessionsCount: 0,
        breakdown,
      };
    }

    if (dto.target === 'attendance') {
      const plan = await this.resolveAttendancePlan(db, dto);
      const [totalAll, sessionsDel, recordsDel, legacyDel, distinctStudents] =
        await Promise.all([
          Promise.all([
            this.safeCount(db, 'attendance_sessions', {}),
            this.safeCount(db, 'attendance_records', {}),
            this.safeCount(db, 'attendance', {}),
          ]).then((vals) => vals.reduce((a, b) => a + b, 0)),
          plan.includeQr
            ? this.safeCount(db, 'attendance_sessions', plan.sessionFilter)
            : Promise.resolve(0),
          plan.includeQr
            ? this.safeCount(db, 'attendance_records', plan.recordsFilter)
            : Promise.resolve(0),
          plan.includeLegacy
            ? this.safeCount(db, 'attendance', plan.legacyFilter)
            : Promise.resolve(0),
          plan.includeQr
            ? this.safeAggregate<{ total: number }>(db, 'attendance_records', [
                { $match: plan.recordsFilter },
                { $group: { _id: '$studentId' } },
                { $count: 'total' },
              ])
            : Promise.resolve([]),
        ]);

      const totalToDelete = sessionsDel + recordsDel + legacyDel;
      const breakdown: WipeBreakdownItem[] = [];
      if (plan.includeQr) {
        breakdown.push(
          {
            key: 'attendanceSessions',
            labelAr: 'جلسات حضور QR',
            labelEn: 'QR Attendance Sessions',
            count: sessionsDel,
          },
          {
            key: 'attendanceRecords',
            labelAr: 'سجلات حضور الطلاب (QR)',
            labelEn: 'QR Student Check-ins',
            count: recordsDel,
          },
        );
      }
      if (plan.includeLegacy) {
        breakdown.push({
          key: 'attendance',
          labelAr: 'سجلات الحضور القديمة (إكسيل)',
          labelEn: 'Legacy Attendance Records',
          count: legacyDel,
        });
      }

      return {
        target: 'attendance',
        totalToDelete,
        remainingSafeCount: Math.max(0, totalAll - totalToDelete),
        affectedStudentsCount: Number(distinctStudents[0]?.total ?? 0),
        protectedCount: plan.protectedOpenSessionsCount,
        protectedControlSheetsCount: 0,
        protectedControlGradesCount: 0,
        protectedOpenSessionsCount: plan.protectedOpenSessionsCount,
        breakdown,
      };
    }

    if (dto.target === 'complaints') {
      const filter = this.buildComplaintFilter(dto);
      const [totalAll, toDelete, distinctStudents] = await Promise.all([
        this.safeCount(db, 'complaints', {}),
        this.safeCount(db, 'complaints', filter),
        this.safeAggregate<{ total: number }>(db, 'complaints', [
          { $match: filter },
          { $group: { _id: '$studentId' } },
          { $count: 'total' },
        ]),
      ]);

      return {
        target: 'complaints',
        totalToDelete: toDelete,
        remainingSafeCount: Math.max(0, totalAll - toDelete),
        affectedStudentsCount: Number(distinctStudents[0]?.total ?? 0),
        protectedCount: 0,
        protectedControlSheetsCount: 0,
        protectedControlGradesCount: 0,
        protectedOpenSessionsCount: 0,
        breakdown: [
          {
            key: 'complaints',
            labelAr: 'شكاوى وتذاكر الطلاب',
            labelEn: 'Complaints & Tickets',
            count: toDelete,
          },
        ],
      };
    }

    if (dto.target === 'students') {
      const [{ studentIds }, totalStudentsInDb] = await Promise.all([
        this.resolveTargetStudents(db, dto),
        this.safeCount(db, 'users', { role: 'student' }),
      ]);

      const [
        profilesCount,
        academicProfilesCount,
        gradesCount,
        quizSubmissionsCount,
        quizAttemptsCount,
        legacyQuizzesCount,
        attendanceRecordsCount,
        legacyAttendanceCount,
        registrationsCount,
        advisingCasesCount,
        advisingPlansCount,
        academicEmailsCount,
        codeRegistryCount,
        complaintsCount,
      ] =
        studentIds.length > 0
          ? await Promise.all([
              this.safeCount(db, 'student_profiles', {
                userId: { $in: studentIds },
              }),
              this.safeCount(db, 'student_academic_profiles', {
                studentId: { $in: studentIds },
              }),
              this.safeCount(db, 'grades', { studentId: { $in: studentIds } }),
              this.safeCount(db, 'quiz_submissions', {
                studentId: { $in: studentIds },
              }),
              this.safeCount(db, 'quiz_attempts', {
                studentId: { $in: studentIds },
              }),
              this.safeCount(db, 'course_quizzes', {
                studentId: { $in: studentIds },
              }),
              this.safeCount(db, 'attendance_records', {
                studentId: { $in: studentIds },
              }),
              this.safeCount(db, 'attendance', {
                studentId: { $in: studentIds },
              }),
              this.safeCount(db, 'course_registrations', {
                studentId: { $in: studentIds },
              }),
              this.safeCount(db, 'advising_cases', {
                studentId: { $in: studentIds },
              }),
              this.safeCount(db, 'advising_plans', {
                studentId: { $in: studentIds },
              }),
              this.safeCount(db, 'academic_emails', {
                studentId: { $in: studentIds },
              }),
              this.safeCount(db, 'student_code_registry', {
                currentStudentId: { $in: studentIds },
              }),
              this.safeCount(db, 'complaints', {
                studentId: { $in: studentIds },
              }),
            ])
          : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

      const breakdown: WipeBreakdownItem[] = [
        {
          key: 'students',
          labelAr: 'حسابات وملفات الطلاب والأكواد',
          labelEn: 'Student Accounts, Profiles & Code Entries',
          count:
            studentIds.length +
            profilesCount +
            academicProfilesCount +
            academicEmailsCount +
            codeRegistryCount,
        },
        {
          key: 'grades',
          labelAr: 'الدرجات التابعة',
          labelEn: 'Owned Grades',
          count: gradesCount,
        },
        {
          key: 'quizzes',
          labelAr: 'تسليمات ومحاولات الكويزات',
          labelEn: 'Quiz Submissions & Attempts',
          count: quizSubmissionsCount + quizAttemptsCount + legacyQuizzesCount,
        },
        {
          key: 'attendance',
          labelAr: 'سجلات الحضور التابعة',
          labelEn: 'Owned Attendance Records',
          count: attendanceRecordsCount + legacyAttendanceCount,
        },
        {
          key: 'registrations',
          labelAr: 'تسجيلات المقررات والإرشاد',
          labelEn: 'Registrations & Advising',
          count: registrationsCount + advisingCasesCount + advisingPlansCount,
        },
        {
          key: 'complaints',
          labelAr: 'شكاوى الطلاب المستهدفين',
          labelEn: 'Student Complaints',
          count: complaintsCount,
        },
      ];

      const totalToDelete = breakdown.reduce(
        (sum, item) => sum + item.count,
        0,
      );

      return {
        target: 'students',
        totalToDelete,
        remainingSafeCount: Math.max(0, totalStudentsInDb - studentIds.length),
        affectedStudentsCount: studentIds.length,
        protectedCount: 0,
        protectedControlSheetsCount: 0,
        protectedControlGradesCount: 0,
        protectedOpenSessionsCount: 0,
        breakdown,
      };
    }

    // target === 'all'
    const summary = await this.getWipeSummary();
    const breakdown: WipeBreakdownItem[] = [
      {
        key: 'students',
        labelAr: 'حسابات وملفات الطلاب',
        labelEn: 'Student Accounts',
        count: summary.studentsCount,
      },
      {
        key: 'grades',
        labelAr: 'الدرجات بالكامل',
        labelEn: 'All Grades',
        count: summary.gradesCount,
      },
      {
        key: 'quizzes',
        labelAr: 'الكويزات والتسليمات (جديد + قديم)',
        labelEn: 'All Quizzes & Submissions',
        count: summary.quizzesCount,
      },
      {
        key: 'attendance',
        labelAr: 'جلسات وسجلات الحضور (QR + قديم)',
        labelEn: 'All Attendance Sessions & Records',
        count: summary.attendanceCount,
      },
      {
        key: 'complaints',
        labelAr: 'الشكاوى والتذاكر',
        labelEn: 'All Complaints & Tickets',
        count: summary.complaintsCount,
      },
      {
        key: 'controlSheets',
        labelAr: 'شيتات الكنترول',
        labelEn: 'Control Sheets',
        count: summary.controlSheetsCount,
      },
    ];
    const totalToDelete = breakdown.reduce((sum, item) => sum + item.count, 0);

    return {
      target: 'all',
      totalToDelete,
      remainingSafeCount: 0,
      affectedStudentsCount: summary.studentsCount,
      protectedCount: 0,
      protectedControlSheetsCount: summary.protectedControlSheetsCount,
      protectedControlGradesCount: 0,
      protectedOpenSessionsCount: summary.attendanceBreakdown.openSessions,
      breakdown,
    };
  }

  private async invalidateCachesForTarget(target: WipeTarget) {
    if (!this.cacheService) return;
    const patterns: string[] = ['analytics:*'];
    if (target === 'grades' || target === 'students' || target === 'all') {
      patterns.push('grades:*', 'students:*');
    }
    if (target === 'quizzes' || target === 'students' || target === 'all') {
      patterns.push('quiz:*', 'quizzes:*');
    }
    if (target === 'attendance' || target === 'students' || target === 'all') {
      patterns.push('attendance:*');
    }
    await Promise.allSettled(
      patterns.map((pattern) => this.cacheService!.delPattern(pattern)),
    );
  }

  private async safeDeleteMany(
    db: DbInstance,
    collectionName: string,
    filter: Record<string, unknown>,
  ): Promise<number> {
    const col = db.collection(collectionName);
    if (!col || typeof col.deleteMany !== 'function') return 0;
    const res = await col.deleteMany(filter);
    return Number(res?.deletedCount ?? 0);
  }

  async executeWipe(
    dto: WipeDataDto,
    adminId: string,
  ): Promise<WipeExecutionResponse> {
    const db = this.requireDb();
    const { target } = dto;

    this.logger.warn(
      `Admin ${adminId} initiated scoped data wipe: target=${target} filters=${JSON.stringify(
        {
          academicYears: dto.academicYears,
          semester: dto.semester,
          examTypes: dto.examTypes,
          sourceScope: dto.sourceScope,
          includeApprovedControl: dto.includeApprovedControl,
          quizScope: dto.quizScope,
          attendanceScope: dto.attendanceScope,
          includeOpenAttendanceSessions: dto.includeOpenAttendanceSessions,
          complaintScope: dto.complaintScope,
          olderThan: dto.olderThan,
          levels: dto.levels,
          reason: dto.reason,
        },
      )}`,
      'UploadsWipeService',
    );

    const deletedCounts: Record<string, number> = {};

    if (target === 'complaints') {
      const filter = this.buildComplaintFilter(dto);
      deletedCounts.complaints = await this.safeDeleteMany(
        db,
        'complaints',
        filter,
      );
      await this.invalidateCachesForTarget(target);
      return {
        success: true,
        target,
        deletedCounts,
        totalDeleted: deletedCounts.complaints,
      };
    }

    if (target === 'grades') {
      const plan = await this.resolveGradesPlan(db, dto);
      deletedCounts.grades = await this.safeDeleteMany(
        db,
        'grades',
        plan.finalFilter,
      );

      // Only touch Control metadata when admin explicitly opted in.
      // Append-only `grade_audit_logs` is NEVER deleted.
      if (plan.includeApprovedControl) {
        const sheetsCol = db.collection('control_sheets');
        const matchingSheets =
          sheetsCol && typeof sheetsCol.find === 'function'
            ? await sheetsCol
                .find(plan.sheetScopeFilter, { projection: { _id: 1 } })
                .toArray()
            : [];
        const sheetIds = matchingSheets.map((s) => s._id);

        if (sheetIds.length > 0) {
          const [delSheets, delImports, delPetitions] = await Promise.all([
            this.safeDeleteMany(db, 'control_sheets', {
              _id: { $in: sheetIds },
            }),
            this.safeDeleteMany(db, 'control_import_batches', {
              sheetId: { $in: sheetIds },
            }),
            this.safeDeleteMany(db, 'control_petitions', {
              sheetId: { $in: sheetIds },
            }),
          ]);
          deletedCounts.controlSheets = delSheets;
          deletedCounts.controlImportBatches = delImports;
          deletedCounts.controlPetitions = delPetitions;
        }
      }

      await this.invalidateCachesForTarget(target);
      const totalDeleted = Object.values(deletedCounts).reduce(
        (sum, n) => sum + n,
        0,
      );
      return {
        success: true,
        target,
        deletedCounts,
        totalDeleted,
        protectedControlGradesCount: plan.includeApprovedControl
          ? 0
          : plan.protectedControlGradesCount,
      };
    }

    if (target === 'quizzes') {
      const plan = await this.resolveQuizPlan(db, dto);
      const ops: Array<Promise<void>> = [];

      if (plan.includeAttemptsAndSubmissions) {
        ops.push(
          this.safeDeleteMany(db, 'quiz_attempts', plan.childFilter).then(
            (n) => {
              deletedCounts.quizAttempts = n;
            },
          ),
          this.safeDeleteMany(db, 'quiz_submissions', plan.childFilter).then(
            (n) => {
              deletedCounts.quizSubmissions = n;
            },
          ),
        );
      }
      if (plan.includeDefinitions) {
        ops.push(
          this.safeDeleteMany(db, 'quizzes', plan.quizFilter).then((n) => {
            deletedCounts.quizzes = n;
          }),
        );
      }
      if (plan.includeLegacy) {
        ops.push(
          this.safeDeleteMany(db, 'course_quizzes', plan.legacyFilter).then(
            (n) => {
              deletedCounts.courseQuizzes = n;
            },
          ),
        );
      }

      await Promise.all(ops);
      await this.invalidateCachesForTarget(target);
      const totalDeleted = Object.values(deletedCounts).reduce(
        (sum, n) => sum + n,
        0,
      );
      return {
        success: true,
        target,
        deletedCounts,
        totalDeleted,
      };
    }

    if (target === 'attendance') {
      const plan = await this.resolveAttendancePlan(db, dto);
      const ops: Array<Promise<void>> = [];

      if (plan.includeQr) {
        ops.push(
          this.safeDeleteMany(
            db,
            'attendance_records',
            plan.recordsFilter,
          ).then((n) => {
            deletedCounts.attendanceRecords = n;
          }),
          this.safeDeleteMany(
            db,
            'attendance_sessions',
            plan.sessionFilter,
          ).then((n) => {
            deletedCounts.attendanceSessions = n;
          }),
        );
      }
      if (plan.includeLegacy) {
        ops.push(
          this.safeDeleteMany(db, 'attendance', plan.legacyFilter).then((n) => {
            deletedCounts.attendance = n;
          }),
        );
      }

      await Promise.all(ops);
      await this.invalidateCachesForTarget(target);
      const totalDeleted = Object.values(deletedCounts).reduce(
        (sum, n) => sum + n,
        0,
      );
      return {
        success: true,
        target,
        deletedCounts,
        totalDeleted,
        protectedOpenSessionsCount: plan.protectedOpenSessionsCount,
      };
    }

    if (target === 'students' || target === 'all') {
      const { studentIds, studentCodes } = await this.resolveTargetStudents(
        db,
        target === 'all' ? { target: 'all' } : dto,
      );

      if (studentIds.length > 0) {
        const advisingCasesCol = db.collection('advising_cases');
        const advisingCases =
          advisingCasesCol && typeof advisingCasesCol.find === 'function'
            ? await advisingCasesCol
                .find(
                  { studentId: { $in: studentIds } },
                  { projection: { _id: 1 } },
                )
                .toArray()
            : [];
        const caseIds = advisingCases.map((c) => c._id);

        const advisingPlansCol = db.collection('advising_plans');
        const advisingPlans =
          advisingPlansCol && typeof advisingPlansCol.find === 'function'
            ? await advisingPlansCol
                .find(
                  { studentId: { $in: studentIds } },
                  { projection: { _id: 1 } },
                )
                .toArray()
            : [];
        const planIds = advisingPlans.map((p) => p._id);

        const studentOwnedDeletes = [
          this.safeDeleteMany(db, 'users', {
            role: 'student',
            $or: [
              { _id: { $in: studentIds } },
              ...(studentCodes.length > 0
                ? [{ studentCode: { $in: studentCodes } }]
                : []),
            ],
          }).then((n) => {
            deletedCounts.students = n;
          }),
          this.safeDeleteMany(db, 'student_profiles', {
            userId: { $in: studentIds },
          }).then((n) => {
            deletedCounts.studentProfiles = n;
          }),
          this.safeDeleteMany(db, 'student_academic_profiles', {
            studentId: { $in: studentIds },
          }).then((n) => {
            deletedCounts.academicProfiles = n;
          }),
          this.safeDeleteMany(db, 'grades', {
            studentId: { $in: studentIds },
          }).then((n) => {
            deletedCounts.grades = n;
          }),
          this.safeDeleteMany(db, 'course_quizzes', {
            studentId: { $in: studentIds },
          }).then((n) => {
            deletedCounts.courseQuizzes = n;
          }),
          this.safeDeleteMany(db, 'quiz_attempts', {
            studentId: { $in: studentIds },
          }).then((n) => {
            deletedCounts.quizAttempts = n;
          }),
          this.safeDeleteMany(db, 'quiz_submissions', {
            studentId: { $in: studentIds },
          }).then((n) => {
            deletedCounts.quizSubmissions = n;
          }),
          this.safeDeleteMany(db, 'attendance', {
            studentId: { $in: studentIds },
          }).then((n) => {
            deletedCounts.attendance = n;
          }),
          this.safeDeleteMany(db, 'attendance_records', {
            studentId: { $in: studentIds },
          }).then((n) => {
            deletedCounts.attendanceRecords = n;
          }),
          this.safeDeleteMany(db, 'course_registrations', {
            studentId: { $in: studentIds },
          }).then((n) => {
            deletedCounts.registrations = n;
          }),
          this.safeDeleteMany(db, 'advising_cases', {
            studentId: { $in: studentIds },
          }).then((n) => {
            deletedCounts.advisingCases = n;
          }),
          this.safeDeleteMany(db, 'advising_plans', {
            $or: [
              { studentId: { $in: studentIds } },
              { _id: { $in: planIds } },
            ],
          }).then((n) => {
            deletedCounts.advisingPlans = n;
          }),
          this.safeDeleteMany(db, 'advising_graphs', {
            planId: { $in: planIds },
          }).then(() => undefined),
          this.safeDeleteMany(db, 'advising_notes', {
            $or: [
              { advisingCaseId: { $in: caseIds } },
              { caseId: { $in: caseIds } },
            ],
          }).then(() => undefined),
          this.safeDeleteMany(db, 'advising_audit_logs', {
            $or: [
              { advisingCaseId: { $in: caseIds } },
              { caseId: { $in: caseIds } },
            ],
          }).then(() => undefined),
          this.safeDeleteMany(db, 'course_recommendations', {
            $or: [
              { studentId: { $in: studentIds } },
              { advisingCaseId: { $in: caseIds } },
              { caseId: { $in: caseIds } },
            ],
          }).then(() => undefined),
          this.safeDeleteMany(db, 'academic_advising_requests', {
            studentId: { $in: studentIds },
          }).then(() => undefined),
          this.safeDeleteMany(db, 'academic_emails', {
            studentId: { $in: studentIds },
          }).then((n) => {
            deletedCounts.academicEmails = n;
          }),
          this.safeDeleteMany(db, 'complaints', {
            studentId: { $in: studentIds },
          }).then((n) => {
            deletedCounts.complaints = n;
          }),
          this.safeDeleteMany(db, 'chat_sessions', {
            userId: { $in: studentIds },
          }).then(() => undefined),
          this.safeDeleteMany(db, 'notifications', {
            targetStudentId: { $in: studentIds },
          }).then(() => undefined),
          // Release wiped student_code_registry rows pointing to deleted accounts
          // while NEVER deleting immutable student_code_audit_logs / grade_audit_logs / tuition_audit_logs.
          this.safeDeleteMany(db, 'student_code_registry', {
            currentStudentId: { $in: studentIds },
          }).then((n) => {
            deletedCounts.studentCodeRegistry = n;
          }),
        ];

        await Promise.all(studentOwnedDeletes);

        const notificationsCol = db.collection('notifications');
        if (
          notificationsCol &&
          typeof notificationsCol.updateMany === 'function'
        ) {
          await notificationsCol.updateMany({}, {
            $pull: {
              readBy: { userId: { $in: studentIds } },
              hiddenBy: { userId: { $in: studentIds } },
            },
          } as Record<string, unknown>);
        }
      }

      if (target === 'all') {
        // Also clear orphaned/non-student-scoped academic collections when resetting everything.
        // Preserves admins/staff, courses, system_settings, and all append-only audit logs.
        const [
          remGrades,
          remQuizzes,
          remAttempts,
          remSubs,
          remLegacyQuizzes,
          remSessions,
          remRecords,
          remLegacyAttendance,
          remComplaints,
          delSheets,
          delImports,
          delPetitions,
          delCheckpoints,
        ] = await Promise.all([
          this.safeDeleteMany(db, 'grades', {}),
          this.safeDeleteMany(db, 'quizzes', {}),
          this.safeDeleteMany(db, 'quiz_attempts', {}),
          this.safeDeleteMany(db, 'quiz_submissions', {}),
          this.safeDeleteMany(db, 'course_quizzes', {}),
          this.safeDeleteMany(db, 'attendance_sessions', {}),
          this.safeDeleteMany(db, 'attendance_records', {}),
          this.safeDeleteMany(db, 'attendance', {}),
          this.safeDeleteMany(db, 'complaints', {}),
          this.safeDeleteMany(db, 'control_sheets', {}),
          this.safeDeleteMany(db, 'control_import_batches', {}),
          this.safeDeleteMany(db, 'control_petitions', {}),
          this.safeDeleteMany(db, 'control_editor_checkpoints', {}),
        ]);

        deletedCounts.grades = (deletedCounts.grades ?? 0) + remGrades;
        deletedCounts.quizzes = remQuizzes;
        deletedCounts.quizAttempts =
          (deletedCounts.quizAttempts ?? 0) + remAttempts;
        deletedCounts.quizSubmissions =
          (deletedCounts.quizSubmissions ?? 0) + remSubs;
        deletedCounts.courseQuizzes =
          (deletedCounts.courseQuizzes ?? 0) + remLegacyQuizzes;
        deletedCounts.attendanceSessions = remSessions;
        deletedCounts.attendanceRecords =
          (deletedCounts.attendanceRecords ?? 0) + remRecords;
        deletedCounts.attendance =
          (deletedCounts.attendance ?? 0) + remLegacyAttendance;
        deletedCounts.complaints =
          (deletedCounts.complaints ?? 0) + remComplaints;
        deletedCounts.controlSheets = delSheets;
        deletedCounts.controlImportBatches = delImports;
        deletedCounts.controlPetitions = delPetitions;
        deletedCounts.controlEditorCheckpoints = delCheckpoints;
      }

      await this.invalidateCachesForTarget(target);
      const totalDeleted = Object.values(deletedCounts).reduce(
        (sum, n) => sum + n,
        0,
      );
      this.logger.log(
        `Data wipe completed for ${target}: ${totalDeleted} total records removed`,
        'UploadsWipeService',
      );
      return {
        success: true,
        target,
        deletedCounts,
        totalDeleted,
      };
    }

    throw new BadRequestException('Invalid wipe target');
  }
}
