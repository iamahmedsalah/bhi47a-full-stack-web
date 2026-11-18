import { attemptConflict } from './utils/attempt-errors.util';
import { ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Types } from 'mongoose';
import type { ClientSession, Connection } from 'mongoose';
import type { Grade } from '../grades/schemas/grade.schema';
import type { ControlSheet } from './schemas/control-sheet.schema';
import {
  attemptOrder,
  compareAttempts,
  summarizeAttempt,
  type CourseAttempt,
} from './utils/attempt-comparison.util';
import {
  DEFAULT_RESULT_POLICY,
  type ResultPolicy,
} from './utils/official-result.util';

type Scope = Pick<
  ControlSheet,
  'courseId' | 'courseCode' | 'academicYear' | 'semester'
>;
type Mark = Omit<Grade, 'examType'> & {
  _id: Types.ObjectId;
  examType: Grade['examType'] | 'total';
};
type Source = ReturnType<typeof summarizeAttempt>;
export type AttemptComparisonRow = ReturnType<typeof compareAttempts> & {
  studentId: string;
  studentCode: string;
  name: string;
  nameAr?: string;
};
export type IcSourceRow = {
  studentId: string;
  studentCode: string;
  name: string;
  nameAr?: string;
  source: Source;
};
export interface AttemptPreview {
  comparisons: AttemptComparisonRow[];
  icSources: IcSourceRow[];
  digest: string;
  currentMarks: Mark[];
}
export class ControlAttemptStore {
  constructor(private readonly connection: Connection) {}
  private collection(model: string, fallback: string) {
    return this.connection.db!.collection<Mark>(
      this.connection.models[model]?.collection.name ?? fallback,
    );
  }
  async preview(
    scope: Scope,
    session?: ClientSession,
  ): Promise<AttemptPreview> {
    const registrations = await this.connection
      .db!.collection<{ studentId: Types.ObjectId }>(
        this.connection.models.CourseRegistration?.collection.name ??
          'course_registrations',
      )
      .find(
        {
          academicYear: scope.academicYear,
          semester: scope.semester,
          status: 'approved',
          courses: scope.courseCode,
        },
        { session, projection: { studentId: 1 } },
      )
      .limit(10001)
      .toArray();
    const ids = [
      ...new Map(
        registrations.map((r) => [String(r.studentId), r.studentId]),
      ).values(),
    ];
    if (ids.length > 10000) throw attemptConflict('ATTEMPT_SCOPE_TOO_LARGE');
    const marks = ids.length
      ? await this.collection('Grade', 'grades')
          .find(
            {
              courseId: scope.courseId,
              studentId: { $in: ids },
              cleared: { $ne: true },
              examType: {
                $in: [
                  'coursework',
                  'midterm',
                  'final',
                  'practical',
                  'oral',
                  'total',
                ],
              },
            },
            { session },
          )
          .limit(100001)
          .toArray()
      : [];
    if (marks.length > 100000) throw attemptConflict('ATTEMPT_SCOPE_TOO_LARGE');
    let older = marks.filter(
      (m) =>
        attemptOrder(m) < attemptOrder(scope) &&
        ((m.historicalImport && !m.controlManaged) ||
          (m.isPublished && !m.controlManaged) ||
          (m.controlManaged && m.controlApprovedRev === (m.rev ?? 0))),
    );
    const current = marks.filter(
      (m) =>
        m.academicYear === scope.academicYear &&
        m.semester === scope.semester &&
        ['coursework', 'midterm', 'final'].includes(m.examType),
    );
    if (
      older.some(
        (m) => !['coursework', 'midterm', 'final'].includes(m.examType),
      )
    )
      throw attemptConflict('HISTORICAL_ATTEMPT_INCOMPLETE');
    // Published snapshots remain authoritative while their source workbook is reopened.
    const pointers = await this.connection
      .db!.collection<{ releaseId: Types.ObjectId }>('control_release_pointers')
      .find(
        {
          active: true,
          'scope.courseId': scope.courseId,
          'scope.component': 'final',
        },
        { session },
      )
      .limit(501)
      .toArray();
    if (pointers.length > 500) throw attemptConflict('ATTEMPT_SCOPE_TOO_LARGE');
    const publishedPolicies = new Map<string, ResultPolicy>();
    const markKey = (mark: Mark) =>
      `${String(mark.studentId)}|${mark.academicYear}|${mark.semester}|${mark.examType}`;
    const previousMarks = new Map(older.map((mark) => [markKey(mark), mark]));
    if (pointers.length) {
      const releases = this.connection
        .db!.collection<{
          marks: Mark[];
          scope: Scope;
          policy: ResultPolicy;
        }>('control_releases')
        .find(
          { _id: { $in: pointers.map((p) => p.releaseId) } },
          {
            session,
            projection: {
              marks: {
                $filter: {
                  input: '$marks',
                  as: 'mark',
                  cond: { $in: ['$$mark.studentId', ids] },
                },
              },
              scope: 1,
              policy: 1,
            },
          },
        )
        .batchSize(2);
      try {
        for await (const release of releases) {
          if (attemptOrder(release.scope) >= attemptOrder(scope)) continue;
          for (const mark of release.marks) {
            previousMarks.set(markKey(mark), mark);
            if (previousMarks.size > 100000)
              throw attemptConflict('ATTEMPT_SCOPE_TOO_LARGE');
          }
          publishedPolicies.set(
            `${release.scope.academicYear}|${release.scope.semester}`,
            release.policy,
          );
        }
      } finally {
        await releases.close();
      }
    }
    older = [...previousMarks.values()];
    if (!older.length)
      return {
        comparisons: [],
        icSources: [],
        digest: createHash('sha256').update('[]').digest('hex'),
        currentMarks: current,
      };
    const scopeKeys = [
      ...new Set(
        [scope, ...older].map(
          (m) => `${String(scope.courseId)}|${m.academicYear}|${m.semester}`,
        ),
      ),
    ];
    const policies = await this.connection
      .db!.collection<{ _id: string; rules: ResultPolicy }>(
        'control_result_policies',
      )
      .find({ _id: { $in: scopeKeys } }, { session })
      .toArray();
    const policyMap = new Map(policies.map((p) => [p._id, p.rules]));
    const users = ids.length
      ? await this.connection
          .db!.collection<{
            _id: Types.ObjectId;
            name: string;
            nameAr?: string;
            studentCode?: string;
          }>(this.connection.models.User?.collection.name ?? 'users')
          .find(
            { _id: { $in: ids }, role: 'student' },
            { session, projection: { name: 1, nameAr: 1, studentCode: 1 } },
          )
          .toArray()
      : [];
    const names = new Map(users.map((u) => [String(u._id), u]));
    const group = (entries: Mark[]) => {
      const result = new Map<string, CourseAttempt>();
      for (const mark of entries) {
        const key = `${String(mark.studentId)}|${mark.academicYear}|${mark.semester}`;
        const attempt = result.get(key) ?? {
          academicYear: mark.academicYear,
          semester: mark.semester,
          marks: [],
          policy:
            publishedPolicies.get(`${mark.academicYear}|${mark.semester}`) ??
            policyMap.get(
              `${String(scope.courseId)}|${mark.academicYear}|${mark.semester}`,
            ) ??
            DEFAULT_RESULT_POLICY,
        };
        attempt.marks.push({
          id: String(mark._id),
          component: mark.examType as 'coursework' | 'midterm' | 'final',
          grade: mark.grade,
          maxGrade: mark.maxGrade,
          status: mark.status,
          rev: mark.rev ?? 0,
          attendanceMark: mark.attendanceMark,
          quizzesMark: mark.quizzesMark,
        });
        result.set(key, attempt);
      }
      return result;
    };
    const oldGroups = group(older),
      newGroups = group(current);
    const oldByStudent = new Map<string, Source[]>();
    for (const [key, value] of oldGroups) {
      const id = key.split('|')[0];
      const list = oldByStudent.get(id) ?? [];
      list.push(summarizeAttempt(value));
      oldByStudent.set(id, list);
    }
    const comparisons: Array<
      ReturnType<typeof compareAttempts> & {
        studentId: string;
        studentCode: string;
        name: string;
        nameAr?: string;
      }
    > = [];
    const icSources: Array<{
      studentId: string;
      studentCode: string;
      name: string;
      nameAr?: string;
      source: Source;
    }> = [];
    const enteredFinalIds = new Set(
      current
        .filter((mark) => mark.examType === 'final')
        .map((mark) => String(mark.studentId)),
    );
    for (const id of ids.map(String)) {
      const identity = {
        studentId: id,
        studentCode: names.get(id)?.studentCode ?? id,
        name: names.get(id)?.name ?? '',
        nameAr: names.get(id)?.nameAr,
      };
      const attempts = oldByStudent.get(id) ?? [];
      if (!names.get(id)?.studentCode) continue;
      if (
        attempts.some(
          (attempt) =>
            attempt.marks.some(
              (mark) =>
                mark.component === 'final' &&
                ['present', 'absent', 'banned'].includes(mark.status),
            ) &&
            new Set(attempt.marks.map((mark) => mark.component)).size !== 3,
        )
      )
        throw attemptConflict('HISTORICAL_ATTEMPT_INCOMPLETE');
      const previous = attempts
        .filter((a) => a.result.official)
        .sort(
          (a, b) =>
            (b.result.percentage ?? -1) - (a.result.percentage ?? -1) ||
            attemptOrder(a).localeCompare(attemptOrder(b)),
        )[0];
      const incomplete = [...attempts].sort((a, b) =>
        attemptOrder(b).localeCompare(attemptOrder(a)),
      )[0];
      if (incomplete?.result.incomplete)
        icSources.push({ ...identity, source: incomplete });
      // No final entry means no new whole-course attempt to compare. Financial
      // deferrals are checked by sheet approval and never replace an old result.
      if (previous && enteredFinalIds.has(id))
        comparisons.push({
          ...identity,
          ...compareAttempts(
            previous,
            newGroups.get(`${id}|${scope.academicYear}|${scope.semester}`) ?? {
              academicYear: scope.academicYear,
              semester: scope.semester,
              marks: [],
            },
          ),
        });
    }
    comparisons.sort((a, b) => a.studentId.localeCompare(b.studentId));
    const digest = createHash('sha256')
      .update(
        JSON.stringify(
          comparisons.map((row) => [row.studentId, row.fingerprint]),
        ),
      )
      .digest('hex');
    return { comparisons, icSources, digest, currentMarks: current };
  }

  async approve(
    scope: Scope,
    sheetId: Types.ObjectId,
    actorId: string,
    digest: string | undefined,
    keepPrevious: string[],
    session: ClientSession,
  ) {
    const preview = await this.preview(scope, session);
    if (preview.comparisons.length && digest !== preview.digest)
      throw new ConflictException({
        code: 'ATTEMPT_REVIEW_REQUIRED',
        message:
          'Compare previous and current results before approval / راجع مقارنة المحاولات قبل الاعتماد',
      });
    const allowed = new Set(preview.comparisons.map((row) => row.studentId));
    if (keepPrevious.some((id) => !allowed.has(id)))
      throw attemptConflict('ATTEMPT_REVIEW_CHANGED');
    const stale = preview.currentMarks.filter(
      (mark) =>
        mark.examType === 'final' &&
        mark.attemptReview &&
        !allowed.has(String(mark.studentId)),
    );
    if (stale.length) {
      await this.collection('Grade', 'grades').updateMany(
        { _id: { $in: stale.map((mark) => mark._id) } },
        { $unset: { attemptReview: '' } },
        { session },
      );
      await this.connection
        .db!.collection(
          this.connection.models.GradeAuditLog?.collection.name ??
            'grade_audit_logs',
        )
        .insertMany(
          stale.map((mark) => ({
            sheetId,
            gradeId: mark._id,
            studentId: mark.studentId,
            courseId: scope.courseId,
            academicYear: scope.academicYear,
            semester: scope.semester,
            component: 'final',
            action: 'APPROVE',
            source: 'GRID',
            actorId: new Types.ObjectId(actorId),
            at: new Date(),
            oldValue: mark.attemptReview,
            newValue: null,
            reason: 'Previous source removed; comparison reviewed again',
          })),
          { session },
        );
    }
    const finalMarks = new Map(
      preview.currentMarks
        .filter((mark) => mark.examType === 'final')
        .map((mark) => [String(mark.studentId), mark]),
    );
    const keepSet = new Set(keepPrevious);
    const operations = [];
    const audit = [];
    for (const row of preview.comparisons) {
      const mark = finalMarks.get(row.studentId);
      if (!mark) throw new ConflictException('RESULT_INCOMPLETE');
      const review = {
        fingerprint: row.fingerprint,
        decision:
          !row.canAcceptNew || keepSet.has(row.studentId)
            ? ('keep_previous' as const)
            : ('accept_new' as const),
        previousYear: row.previous.academicYear,
        previousSemester: row.previous.semester,
        previousPercentage: row.previous.result.percentage,
        currentPercentage: row.current.result.percentage,
        actorId,
        reviewedAt: new Date(),
      };
      operations.push({
        updateOne: {
          filter: { _id: mark._id, rev: mark.rev },
          update: { $set: { attemptReview: review } },
        },
      });
      audit.push({
        sheetId,
        gradeId: mark._id,
        studentId: mark.studentId,
        courseId: scope.courseId,
        academicYear: scope.academicYear,
        semester: scope.semester,
        component: 'final',
        action: 'APPROVE',
        source: 'GRID',
        actorId: new Types.ObjectId(actorId),
        at: new Date(),
        oldValue: mark.attemptReview ?? null,
        newValue: review,
        reason:
          '\u0645\u0642\u0627\u0631\u0646\u0629 \u0645\u062d\u0627\u0648\u0644\u0627\u062a \u0627\u0644\u0645\u0642\u0631\u0631 / Whole-course attempt comparison',
      });
    }
    if (operations.length) {
      await this.collection('Grade', 'grades').bulkWrite(operations, {
        session,
      });
      await this.connection
        .db!.collection(
          this.connection.models.GradeAuditLog?.collection.name ??
            'grade_audit_logs',
        )
        .insertMany(audit, { session });
    }
  }

  async assertReviewed(scope: Scope, session?: ClientSession) {
    const preview = await this.preview(scope, session);
    const comparisonIds = new Set(
      preview.comparisons.map((row) => row.studentId),
    );
    const finalMarks = new Map(
      preview.currentMarks
        .filter((mark) => mark.examType === 'final')
        .map((mark) => [String(mark.studentId), mark]),
    );
    if (
      preview.currentMarks.some(
        (mark) =>
          mark.examType === 'final' &&
          mark.attemptReview &&
          !comparisonIds.has(String(mark.studentId)),
      )
    )
      throw attemptConflict('ATTEMPT_REVIEW_CHANGED');
    for (const row of preview.comparisons) {
      const mark = finalMarks.get(row.studentId);
      if (
        mark?.attemptReview?.fingerprint !== row.fingerprint ||
        (mark.attemptReview.decision === 'accept_new' && !row.canAcceptNew)
      )
        throw new ConflictException({
          code: 'ATTEMPT_REVIEW_CHANGED',
          message:
            'Attempt comparison changed; reopen and approve again / تغيرت المقارنة؛ أعد المراجعة والاعتماد',
        });
    }
  }
}
