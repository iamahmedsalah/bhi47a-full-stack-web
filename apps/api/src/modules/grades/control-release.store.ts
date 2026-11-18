import { ControlAttemptStore } from '../control/control-attempt.store';
import { ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Types } from 'mongoose';
import type { Connection, ClientSession } from 'mongoose';
import {
  DEFAULT_CONTROL_COMPONENTS,
  type ControlSchemeComponent,
} from '@student-portal/shared';
import type { Grade } from './schemas/grade.schema';
import type { ControlSheet } from '../control/schemas/control-sheet.schema';
import type { GradingScheme } from '../control/schemas/grading-scheme.schema';
import {
  DEFAULT_RESULT_POLICY,
  evaluateOfficialResult,
  type ResultPolicy,
} from '../control/utils/official-result.util';

type Mark = Grade & { _id: Types.ObjectId };
type Sheet = ControlSheet & { _id: Types.ObjectId };
export interface ReleaseScope {
  academicYear: string;
  semester: string;
  courseId: Types.ObjectId;
  component: string;
}
interface Release {
  _id: Types.ObjectId;
  sheetId: Types.ObjectId;
  scope: ReleaseScope;
  digest: string;
  policy: ResultPolicy;
  schemeVersion: number;
  actorId: Types.ObjectId;
  createdAt: Date;
  marks: Mark[];
  results: Array<{
    studentId: Types.ObjectId;
    result: ReturnType<typeof evaluateOfficialResult>;
  }>;
}
interface Pointer {
  _id: Types.ObjectId;
  releaseId: Types.ObjectId;
  active: boolean;
  scope: ReleaseScope;
}
interface Policy {
  _id: string;
  version: number;
  rules: ResultPolicy;
  actorId: string;
  updatedAt: Date;
}
interface Outbox {
  _id: Types.ObjectId;
  studentId: Types.ObjectId;
  actorId: Types.ObjectId;
  releaseId: Types.ObjectId;
  delivered?: boolean;
  attempts: number;
  createdAt: Date;
}
interface ReleasePreview {
  scope: ReleaseScope;
  marks: Mark[];
  results: Release['results'];
  policy: ResultPolicy;
  schemeVersion: number;
  digest: string;
  count: number;
  activeReleaseId: string | null;
}
const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Append-only release evidence, an atomic active pointer and retryable in-app notifications.
 * Grades remains the only activation/withdrawal authority. No historical totals are guessed.
 */
export class ControlReleaseStore {
  private static readonly prepared = new WeakSet<Connection>();
  private readonly names: {
    grades: string;
    sheets: string;
    audit: string;
    schemes: string;
    registrations: string;
  };
  constructor(private readonly connection: Connection) {
    const name = (model: string, fallback: string) =>
      connection.models[model]?.collection.name ?? fallback;
    this.names = {
      grades: name('Grade', 'grades'),
      sheets: name('ControlSheet', 'control_sheets'),
      audit: name('GradeAuditLog', 'grade_audit_logs'),
      schemes: name('GradingScheme', 'control_grading_schemes'),
      registrations: name('CourseRegistration', 'course_registrations'),
    };
  }
  private get db() {
    if (!this.connection.db) throw new Error('Database unavailable');
    return this.connection.db;
  }
  private get releases() {
    return this.db.collection<Release>('control_releases');
  }
  private get pointers() {
    return this.db.collection<Pointer>('control_release_pointers');
  }
  private get policies() {
    return this.db.collection<Policy>('control_result_policies');
  }
  private policyKey(scope: Omit<ReleaseScope, 'component'>) {
    return `${String(scope.courseId)}|${scope.academicYear}|${scope.semester}`;
  }

  async prepare() {
    if (ControlReleaseStore.prepared.has(this.connection)) return;
    // DDL stays outside transactions, including when autoCreate is disabled in tests.
    for (const name of [
      'control_releases',
      'control_release_pointers',
      'control_result_policies',
      'control_release_outbox',
      'control_academic_baselines',
    ]) {
      try {
        await this.db.createCollection(name);
      } catch (error) {
        if ((error as { code?: number }).code !== 48) throw error;
      }
    }
    await this.releases.createIndex(
      { sheetId: 1, digest: 1 },
      { unique: true },
    );
    await this.releases.createIndex({ 'marks.studentId': 1 });
    await this.pointers.createIndex({
      'scope.courseId': 1,
      'scope.academicYear': 1,
      'scope.semester': 1,
    });
    await this.db
      .collection('control_release_outbox')
      .createIndex({ delivered: 1, createdAt: 1 });
    ControlReleaseStore.prepared.add(this.connection);
  }

  async policy(
    scope: Omit<ReleaseScope, 'component'>,
    session?: ClientSession,
  ) {
    const doc = await this.policies.findOne(
      { _id: this.policyKey(scope) },
      { session },
    );
    return {
      version: doc?.version ?? 0,
      rules: {
        ...(doc?.rules ?? DEFAULT_RESULT_POLICY),
        retake: 'best' as const,
      },
    };
  }

  async updatePolicy(
    scope: Omit<ReleaseScope, 'component'>,
    rules: ResultPolicy,
    version: number,
    actorId: string,
  ) {
    rules = { ...rules, retake: 'best' };
    await this.prepare();
    const session = await this.connection.startSession();
    try {
      return await session.withTransaction(async () => {
        const current = await this.policy(scope, session);
        if (current.version !== version)
          throw new ConflictException('POLICY_CHANGED');
        const published = await this.pointers.findOne(
          {
            'scope.courseId': scope.courseId,
            'scope.academicYear': scope.academicYear,
            'scope.semester': scope.semester,
          },
          { session },
        );
        if (published)
          throw new ConflictException(
            'Policy is frozen after the first release; use a new term for a different policy',
          );
        await this.policies.replaceOne(
          { _id: this.policyKey(scope) },
          { version: version + 1, rules, actorId, updatedAt: new Date() },
          { upsert: true, session },
        );
        await this.db.collection(this.names.audit).insertOne(
          {
            courseId: scope.courseId,
            academicYear: scope.academicYear,
            semester: scope.semester,
            component: 'final',
            action: 'SCHEME_CHANGE',
            source: 'SYSTEM',
            actorId: new Types.ObjectId(actorId),
            oldValue: current,
            newValue: { rules, version: version + 1 },
            at: new Date(),
          },
          { session },
        );
        return { version: version + 1, rules };
      });
    } finally {
      await session.endSession();
    }
  }

  async preview(
    sheet: Sheet,
    session?: ClientSession,
  ): Promise<ReleasePreview> {
    const scope: ReleaseScope = {
      courseId: sheet.courseId,
      academicYear: sheet.academicYear,
      semester: sheet.semester,
      component: sheet.component,
    };
    const filter = {
      courseId: sheet.courseId,
      academicYear: sheet.academicYear,
      semester: sheet.semester,
    };
    const scheme = await this.db
      .collection<GradingScheme>(this.names.schemes)
      .findOne(filter, { session });
    const components: ControlSchemeComponent[] = DEFAULT_CONTROL_COMPONENTS.map(
      (d) => ({
        ...d,
        ...(scheme?.components.find((c) => c.key === d.key) ?? {}),
        ...(d.key === 'coursework' ? { max: 20 } : {}),
      }),
    );
    const policy = await this.policy(scope, session);
    const sheets =
      sheet.component === 'final'
        ? await this.db
            .collection<Sheet>(this.names.sheets)
            .find(filter, { session })
            .toArray()
        : [sheet];
    const needed =
      sheet.component === 'final'
        ? components.filter((c) => c.enabled).map((c) => c.key)
        : [sheet.component];
    if (
      needed.length !== (sheet.component === 'final' ? 3 : 1) ||
      needed.some(
        (key) =>
          !sheets.some(
            (s) => s.component === key && s.workflowState === 'APPROVED',
          ),
      )
    )
      throw new ConflictException(
        'Approve all required component sheets before releasing the final result',
      );
    const allMarks = await this.db
      .collection<Mark>(this.names.grades)
      .find(
        { ...filter, examType: { $in: needed }, cleared: { $ne: true } },
        { session },
      )
      .sort({ studentId: 1, examType: 1 })
      .batchSize(500)
      .toArray();
    if (allMarks.some((m) => m.controlApprovedRev !== (m.rev ?? 0)))
      throw new ConflictException('Unapproved release');
    if (sheet.component === 'final')
      await new ControlAttemptStore(this.connection).assertReviewed(
        sheet,
        session,
      );
    const registrations = await this.db
      .collection<{ studentId: Types.ObjectId; courses: string[] }>(
        this.names.registrations,
      )
      .find(
        {
          academicYear: sheet.academicYear,
          semester: sheet.semester,
          status: 'approved',
          courses: sheet.courseCode,
        },
        { session, projection: { studentId: 1, _id: 0 } },
      )
      .batchSize(500)
      .toArray();
    const roster = new Set(registrations.map((r) => String(r.studentId)));
    const presentComponents = new Map<string, Set<string>>();
    for (const mark of allMarks) {
      const id = String(mark.studentId);
      const keys = presentComponents.get(id) ?? new Set<string>();
      if (keys.has(mark.examType))
        throw new ConflictException('Duplicate component marks');
      keys.add(mark.examType);
      presentComponents.set(id, keys);
    }
    const deferredByComponent = new Map(
      sheets.map((s) => [
        s.component,
        new Set(s.tuitionDeferredStudentIds ?? []),
      ]),
    );
    const deferredStudents: string[] = [];
    for (const id of roster) {
      const missing = needed.filter(
        (key) => !presentComponents.get(id)?.has(key),
      );
      if (!missing.length) continue;
      if (missing.some((key) => !deferredByComponent.get(key)?.has(id)))
        throw new ConflictException('RESULT_INCOMPLETE');
      deferredStudents.push(id);
    }
    if (!roster.size || allMarks.some((m) => !roster.has(String(m.studentId))))
      throw new ConflictException(
        'Roster changed; reopen and review the sheet',
      );
    const deferredIds = new Set(deferredStudents);
    // Publish complete attempts only. Never fabricate a zero or partial final
    // total for a student whose exam was deferred; keep their other marks intact.
    const releasedRoster = [...roster].filter((id) => !deferredIds.has(id));
    const marks = allMarks.filter((m) => !deferredIds.has(String(m.studentId)));
    // Legacy grades cannot be inferred to be exam components or whole-course totals.
    if (
      sheet.component === 'final' &&
      (await this.db.collection(this.names.grades).findOne(
        {
          ...filter,
          examType: { $in: ['final', 'total'] },
          controlManaged: { $ne: true },
          cleared: { $ne: true },
        },
        { session },
      ))
    )
      throw new ConflictException(
        'Classify historical totals before official final release',
      );
    const marksByStudent = new Map<string, Mark[]>();
    for (const mark of marks) {
      const id = String(mark.studentId);
      const list = marksByStudent.get(id) ?? [];
      list.push(mark);
      marksByStudent.set(id, list);
    }
    const results =
      sheet.component === 'final'
        ? releasedRoster.sort().map((id) => ({
            studentId: new Types.ObjectId(id),
            result: evaluateOfficialResult(
              components,
              Object.fromEntries(
                (marksByStudent.get(id) ?? []).map((m) => [
                  m.examType,
                  { score: m.grade, status: m.status },
                ]),
              ),
              policy.rules,
            ),
          }))
        : [];
    if (
      results.some(
        (r) => !r.result.official && !r.result.withheld && !r.result.incomplete,
      )
    )
      throw new ConflictException(
        'Missing or deferred components block an official final result',
      );
    const digest = hash({
      scope,
      policy,
      schemeVersion: scheme?.version ?? 0,
      deferredStudents: deferredStudents.sort(),
      marks: marks.map((m) => [
        String(m.studentId),
        m.examType,
        m.grade,
        m.maxGrade,
        m.status,
        m.rev,
        m.attendanceMark,
        m.quizzesMark,
        m.attemptReview
          ? [m.attemptReview.fingerprint, m.attemptReview.decision]
          : null,
      ]),
    });
    const pointer = await this.pointers.findOne(
      { _id: sheet._id },
      { session },
    );
    return {
      scope,
      marks,
      results,
      policy: policy.rules,
      schemeVersion: scheme?.version ?? 0,
      digest,
      count: releasedRoster.length,
      activeReleaseId: pointer?.active ? String(pointer.releaseId) : null,
    };
  }

  async activate(
    sheet: Sheet,
    actorId: string,
    session: ClientSession,
    expectedDigest?: string,
  ): Promise<Release> {
    const preview = await this.preview(sheet, session);
    if (expectedDigest && expectedDigest !== preview.digest)
      throw new ConflictException('Release preview changed; preview again');
    // Touch every contributing sheet to serialize against reopen, edit and approval.
    await this.db.collection(this.names.sheets).updateMany(
      {
        courseId: sheet.courseId,
        academicYear: sheet.academicYear,
        semester: sheet.semester,
        component: {
          $in:
            sheet.component === 'final'
              ? ['coursework', 'midterm', 'final']
              : [sheet.component],
        },
      },
      { $inc: { revision: 1 } },
      { session },
    );
    // An update conflicts with concurrent policy changes even when no custom policy existed.
    await this.policies.updateOne(
      { _id: this.policyKey(preview.scope) },
      {
        $setOnInsert: {
          version: 0,
          rules: DEFAULT_RESULT_POLICY,
          actorId,
          updatedAt: new Date(),
        },
        $inc: { releaseRevision: 1 },
      },
      { upsert: true, session },
    );
    let release = await this.releases.findOne(
      { sheetId: sheet._id, digest: preview.digest },
      { session },
    );
    if (!release) {
      release = {
        _id: new Types.ObjectId(),
        sheetId: sheet._id,
        scope: preview.scope,
        digest: preview.digest,
        policy: preview.policy,
        schemeVersion: preview.schemeVersion,
        actorId: new Types.ObjectId(actorId),
        createdAt: new Date(),
        marks: preview.marks,
        results: preview.results,
      };
      await this.releases.insertOne(release, { session });
    }
    if (
      preview.activeReleaseId !== String(release._id) &&
      release.marks.length
    ) {
      const students = [
        ...new Set(release.marks.map((m) => String(m.studentId))),
      ];
      await this.db.collection<Outbox>('control_release_outbox').insertMany(
        students.map((id) => ({
          _id: new Types.ObjectId(),
          studentId: new Types.ObjectId(id),
          actorId: release.actorId,
          releaseId: release._id,
          attempts: 0,
          createdAt: new Date(),
        })),
        { session },
      );
    }
    await this.pointers.replaceOne(
      { _id: sheet._id },
      { releaseId: release._id, active: true, scope: preview.scope },
      { upsert: true, session },
    );
    if (sheet.component === 'final' && release.results.length) {
      const baseline = this.db.collection('control_academic_baselines');
      const ids = release.results.map((outcome) => outcome.studentId);
      const existing = await baseline
        .find({ _id: { $in: ids } }, { session, projection: { _id: 1 } })
        .toArray();
      const known = new Set(existing.map((entry) => String(entry._id)));
      const missing = ids.filter((id) => !known.has(String(id)));
      if (missing.length) {
        const profiles = await this.db
          .collection(
            this.connection.models.StudentAcademicProfile?.collection.name ??
              'student_academic_profiles',
          )
          .find({ studentId: { $in: missing } }, { session })
          .toArray();
        const byStudent = new Map(
          profiles.map((profile) => [String(profile.studentId), profile]),
        );
        // Keep baseline capture in the activation transaction. Only query/write
        // batches, rather than three database round trips per enrolled student.
        await baseline.bulkWrite(
          missing.map((id) => {
            const profile = byStudent.get(String(id));
            return {
              updateOne: {
                filter: { _id: id },
                update: {
                  $setOnInsert: {
                    completedCourses: profile?.completedCourses ?? [],
                    failedCourses: profile?.failedCourses ?? [],
                    lowGradeCourses: profile?.lowGradeCourses ?? [],
                    gpa: profile?.gpa ?? 0,
                    completedCreditHours: profile?.completedCreditHours ?? 0,
                    academicLevel: profile?.academicLevel ?? '1',
                    semester: profile?.semester ?? 'first',
                    academicWarnings: profile?.academicWarnings ?? 0,
                    createdAt: new Date(),
                  },
                },
                upsert: true,
              },
            };
          }),
          { session },
        );
      }
    }
    return release;
  }

  async withdraw(sheet: Sheet, session: ClientSession) {
    const affected = await this.pointers
      .find(
        {
          'scope.courseId': sheet.courseId,
          'scope.academicYear': sheet.academicYear,
          'scope.semester': sheet.semester,
          'scope.component': { $in: [sheet.component, 'final'] },
          active: true,
        },
        { session },
      )
      .toArray();
    await this.pointers.updateMany(
      { _id: { $in: affected.map((p) => p._id) } },
      { $set: { active: false } },
      { session },
    );
    for (const pointer of affected) {
      const release = await this.releases.findOne(
        { _id: pointer.releaseId },
        { session },
      );
      if (release)
        await this.db.collection<Outbox>('control_release_outbox').insertMany(
          [...new Set(release.marks.map((m) => String(m.studentId)))].map(
            (id) => ({
              _id: new Types.ObjectId(),
              studentId: new Types.ObjectId(id),
              actorId: release.actorId,
              releaseId: release._id,
              attempts: 0,
              createdAt: new Date(),
            }),
          ),
          { session },
        );
    }
  }

  async studentMarks(studentId: Types.ObjectId, session?: ClientSession) {
    const history = await this.releases
      .find({ 'marks.studentId': studentId }, { session })
      .limit(1001)
      .toArray();
    if (history.length > 1000)
      throw new ConflictException(
        'Student release history requires pagination',
      );
    const pointers = await this.pointers
      .find(
        { active: true, releaseId: { $in: history.map((r) => r._id) } },
        { session },
      )
      .toArray();
    const active = new Set(pointers.map((p) => String(p.releaseId)));
    const releases = history.filter((r) => active.has(String(r._id)));
    const selected = new Map<
      string,
      Mark & {
        officialResult?: ReturnType<typeof evaluateOfficialResult>;
        releaseId: string;
      }
    >();
    // A final release pins all components together; it wins over separate component releases.
    releases.sort(
      (a, b) =>
        Number(a.scope.component === 'final') -
        Number(b.scope.component === 'final'),
    );
    const withheldScopes = new Set(
      releases
        .filter(
          (r) =>
            r.scope.component === 'final' &&
            r.results.some(
              (o) =>
                o.studentId.equals(studentId) &&
                (o.result.withheld ||
                  r.marks.some(
                    (mark) =>
                      mark.studentId.equals(studentId) &&
                      mark.examType === 'final' &&
                      mark.attemptReview?.decision === 'keep_previous',
                  )),
            ),
        )
        .map(
          (r) =>
            `${String(r.scope.courseId)}|${r.scope.academicYear}|${r.scope.semester}`,
        ),
    );
    for (const release of releases)
      for (const mark of release.marks) {
        if (
          withheldScopes.has(
            `${String(mark.courseId)}|${mark.academicYear}|${mark.semester}`,
          )
        )
          continue;
        if (!mark.studentId.equals(studentId) || mark.status === 'withheld')
          continue;
        const outcome = release.results.find((r) =>
          r.studentId.equals(studentId),
        )?.result;
        if (release.scope.component === 'final' && outcome?.withheld) continue;
        selected.set(
          `${String(mark.courseId)}|${mark.academicYear}|${mark.semester}|${mark.examType}`,
          {
            ...mark,
            isPublished: true,
            releaseId: String(release._id),
            ...(mark.examType === 'final' && outcome
              ? { officialResult: outcome }
              : {}),
          },
        );
      }
    return [...selected.values()];
  }

  async managedScopes(marks: Grade[]) {
    const scopes = [
      ...new Map(
        marks.map((m) => [
          `${String(m.courseId)}|${m.academicYear}|${m.semester}`,
          {
            'scope.courseId': m.courseId,
            'scope.academicYear': m.academicYear,
            'scope.semester': m.semester,
          },
        ]),
      ).values(),
    ];
    if (scopes.length > 500)
      throw new ConflictException('Student result history requires pagination');
    const pointers = scopes.length
      ? await this.pointers.find({ $or: scopes }).limit(1501).toArray()
      : [];
    if (pointers.length > 1500)
      throw new ConflictException('Student result history requires pagination');
    return new Set(
      pointers.map(
        (p) =>
          `${String(p.scope.courseId)}|${p.scope.academicYear}|${p.scope.semester}|${p.scope.component}`,
      ),
    );
  }

  async flushOutbox(ids?: Types.ObjectId[]) {
    const outbox = this.db.collection<Outbox>('control_release_outbox');
    const pending = await outbox
      .find({ delivered: { $ne: true }, ...(ids ? { _id: { $in: ids } } : {}) })
      .sort({ createdAt: 1 })
      .limit(100)
      .toArray();
    for (const job of pending) {
      try {
        // Deterministic _id gives crash-safe retries across multiple API workers.
        await this.db.collection('notifications').updateOne(
          { _id: job._id },
          {
            $setOnInsert: {
              title: 'تحديث النتائج / Results updated',
              body: 'راجع صفحة الدرجات في موعد الإتاحة / Check Grades during the visibility window.',
              targetType: 'student',
              targetStudentId: job.studentId,
              sentBy: job.actorId,
              deliveryStatus: 'skipped',
              readBy: [],
              hiddenBy: [],
              createdAt: new Date(),
              meta: {
                controlReleaseId: String(job.releaseId),
                deliveryChannel: 'in-app',
              },
            },
          },
          { upsert: true },
        );
        await outbox.updateOne(
          { _id: job._id },
          { $set: { delivered: true }, $inc: { attempts: 1 } },
        );
      } catch {
        await outbox.updateOne({ _id: job._id }, { $inc: { attempts: 1 } });
      }
    }
    return {
      pending: await outbox.countDocuments({ delivered: { $ne: true } }),
    };
  }
}
