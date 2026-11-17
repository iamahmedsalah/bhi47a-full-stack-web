import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { ClientSession } from 'mongoose';
import { validateHistoricalGrade } from '@student-portal/shared';
import { Grade } from './schemas/grade.schema';
import type { GradeDocument } from './schemas/grade.schema';
import { StudentProfile } from '../students/schemas/student-profile.schema';
import type { StudentProfileDocument } from '../students/schemas/student-profile.schema';
import { ControlSheet } from '../control/schemas/control-sheet.schema';
import type { ControlSheetDocument } from '../control/schemas/control-sheet.schema';
import { StudentAcademicProfile } from '../registrations/schemas/student-academic-profile.schema';
import type { StudentAcademicProfileDocument } from '../registrations/schemas/student-academic-profile.schema';
import { GradesService } from './grades.service';
import type {
  HistoricalPublicationScopeDto,
  PublishHistoricalGradesDto,
} from './dto/grade.dto';

interface PublicationJob {
  _id: string;
  scope: HistoricalPublicationScopeDto;
  actorId: Types.ObjectId;
  studentIds: Types.ObjectId[];
  gradeIds: Types.ObjectId[];
  publishedAt: Date;
  processedStudents: number;
  status: 'pending' | 'complete';
  leaseToken?: string;
  leaseExpiresAt?: Date;
  lastError?: string;
  lastProcessedBy?: Types.ObjectId;
}

@Injectable()
export class HistoricalPublicationService {
  constructor(
    @InjectModel(Grade.name) private readonly grades: Model<GradeDocument>,
    @InjectModel(StudentProfile.name)
    private readonly profiles: Model<StudentProfileDocument>,
    @InjectModel(ControlSheet.name)
    private readonly sheets: Model<ControlSheetDocument>,
    @InjectModel(StudentAcademicProfile.name)
    private readonly academicProfiles: Model<StudentAcademicProfileDocument>,
    private readonly academics: GradesService,
  ) {}

  private get jobs() {
    return this.grades.db.db!.collection<PublicationJob>(
      'historical_grade_publications',
    );
  }

  private publicJob(job: PublicationJob) {
    return {
      id: job._id,
      scope: job.scope,
      status: job.status,
      publishedAt: job.publishedAt,
      gradeCount: job.gradeIds.length,
      totalStudents: job.studentIds.length,
      processedStudents: job.processedStudents,
      reconciliationPending: job.status !== 'complete',
    };
  }

  private validateScope(scope: HistoricalPublicationScopeDto) {
    const checked = validateHistoricalGrade({
      ...scope,
      studentCode: 'scope',
      courseCode: 'scope',
      examType: 'final',
      grade: 0,
    });
    if (!checked.ok || !['1', '2', '3', '4'].includes(scope.level))
      throw new BadRequestException(
        checked.ok ? 'Choose level 1, 2, 3 or 4' : checked.message,
      );
  }

  async latest(scope: HistoricalPublicationScopeDto) {
    this.validateScope(scope);
    const filter = {
      'scope.level': scope.level,
      'scope.academicYear': scope.academicYear,
      'scope.semester': scope.semester,
    };
    const job =
      (await this.jobs.findOne(
        { ...filter, status: 'pending' },
        { sort: { publishedAt: -1 } },
      )) ?? (await this.jobs.findOne(filter, { sort: { publishedAt: -1 } }));
    return { job: job ? this.publicJob(job) : null };
  }

  private async snapshot(
    scope: HistoricalPublicationScopeDto,
    session?: ClientSession,
  ) {
    this.validateScope(scope);
    // Level always refers to the student's current level, not the course's level.
    const profiles = await this.profiles
      .find({ level: scope.level })
      .select('userId level')
      .session(session ?? null)
      .lean();
    const studentIds = profiles.map((p) => p.userId);
    const marks = await this.grades
      .find({
        historicalImport: true,
        controlManaged: { $ne: true },
        cleared: { $ne: true },
        academicYear: scope.academicYear,
        semester: scope.semester,
        studentId: { $in: studentIds },
      })
      .select(
        '_id studentId studentCode courseId courseCode examType grade maxGrade status academicYear semester isPublished rev updatedAt',
      )
      .session(session ?? null)
      .sort({ _id: 1 })
      .lean();
    const courseIds = [
      ...new Map(marks.map((m) => [String(m.courseId), m.courseId])).values(),
    ];
    const controlled = courseIds.length
      ? await this.sheets
          .find({
            courseId: { $in: courseIds },
            academicYear: scope.academicYear,
            semester: scope.semester,
          })
          .select('courseId')
          .session(session ?? null)
          .lean()
      : [];
    const controlIds = new Set(controlled.map((s) => String(s.courseId)));
    const groups = new Map<string, typeof marks>();
    const issues: string[] = [];
    let issueCount = 0;
    const addIssue = (message: string) => {
      issueCount++;
      if (issues.length < 10) issues.push(message);
    };
    for (const mark of marks) {
      const key = `${String(mark.studentId)}|${String(mark.courseId)}`;
      groups.set(key, [...(groups.get(key) ?? []), mark]);
      const valid = validateHistoricalGrade(mark);
      if (!valid.ok)
        addIssue(`${mark.studentCode} / ${mark.courseCode}: ${valid.message}`);
    }
    for (const records of groups.values()) {
      const first = records[0];
      const types = new Set(records.map((r) => r.examType));
      if (
        records.length !== 3 ||
        !['coursework', 'midterm', 'final'].every((t) =>
          types.has(t as typeof first.examType),
        )
      )
        addIssue(
          `${first.studentCode} / ${first.courseCode}: المقرر يحتاج المكونات الثلاثة دون تكرار / Three distinct components required`,
        );
      if (controlIds.has(String(first.courseId)))
        addIssue(
          `${first.studentCode} / ${first.courseCode}: يوجد كشف كنترول؛ استخدم مسار الكنترول / Existing Control sheet`,
        );
      if (
        records.some(
          (r) =>
            r.courseCode !== first.courseCode ||
            r.studentCode !== first.studentCode,
        )
      )
        addIssue(
          `${first.studentCode} / ${first.courseCode}: أكواد المكونات غير متطابقة / Inconsistent component identity`,
        );
    }
    const affectedStudents = [
      ...new Map(marks.map((m) => [String(m.studentId), m.studentId])).values(),
    ];
    const academics = affectedStudents.length
      ? await this.academicProfiles
          .find({ studentId: { $in: affectedStudents } })
          .select('studentId')
          .session(session ?? null)
          .lean()
      : [];
    const academicIds = new Set(academics.map((p) => String(p.studentId)));
    for (const id of affectedStudents)
      if (!academicIds.has(String(id)))
        addIssue(
          `ملف أكاديمي مفقود للطالب / Academic profile missing: ${marks.find((m) => String(m.studentId) === String(id))?.studentCode}`,
        );
    const digest = createHash('sha256')
      .update(
        JSON.stringify({
          scope: {
            academicYear: scope.academicYear,
            semester: scope.semester,
            level: scope.level,
          },
          students: studentIds.map(String).sort(),
          controlled: [...controlIds].sort(),
          academicIds: [...academicIds].sort(),
          marks: marks.map((m) => [
            String(m._id),
            String(m.studentId),
            m.studentCode,
            String(m.courseId),
            m.courseCode,
            m.examType,
            m.grade,
            m.maxGrade,
            m.status,
            m.isPublished,
            m.rev,
          ]),
        }),
      )
      .digest('hex');
    return {
      marks,
      affectedStudents,
      summary: {
        scope,
        digest,
        totalStudents: affectedStudents.length,
        courseAttempts: groups.size,
        totalMarks: marks.length,
        unpublishedMarks: marks.filter((m) => !m.isPublished).length,
        alreadyPublishedMarks: marks.filter((m) => m.isPublished).length,
        issueCount,
        issues,
        canPublish: marks.some((m) => !m.isPublished) && issueCount === 0,
      },
    };
  }

  async preview(scope: HistoricalPublicationScopeDto) {
    return (await this.snapshot(scope)).summary;
  }

  async publish(dto: PublishHistoricalGradesDto, actorId: string) {
    const scope = {
      academicYear: dto.academicYear,
      semester: dto.semester,
      level: dto.level,
    };
    this.validateScope(scope);
    const existing = await this.jobs.findOne({ _id: dto.digest });
    if (existing) {
      if (JSON.stringify(existing.scope) !== JSON.stringify(scope))
        throw new ConflictException('Publication scope differs');
      return this.publicJob(existing); // Safe retry after a lost response.
    }
    const pending = await this.jobs.findOne({
      status: 'pending',
      'scope.level': scope.level,
      'scope.academicYear': scope.academicYear,
      'scope.semester': scope.semester,
    });
    if (pending)
      throw new ConflictException(
        'استكمل حساب المعدل للنشر السابق أولًا / Resume the previous publication first',
      );
    const session = await this.grades.db.startSession();
    let job: PublicationJob | undefined;
    try {
      await session.withTransaction(async () => {
        const snapshot = await this.snapshot(scope, session);
        if (snapshot.summary.digest !== dto.digest)
          throw new ConflictException(
            'تغيرت الدرجات أو المستوى؛ أعد المعاينة / Preview is stale',
          );
        if (!snapshot.summary.canPublish)
          throw new ConflictException(
            'راجع المكونات وكشوف الكنترول قبل النشر / Publication blocked',
          );
        const ids = snapshot.marks.map((m) => m._id);
        const updated = await this.grades.updateMany(
          {
            _id: { $in: ids },
            historicalImport: true,
            controlManaged: { $ne: true },
            cleared: { $ne: true },
          },
          { $set: { isPublished: true } },
          { session },
        );
        if (updated.matchedCount !== ids.length)
          throw new ConflictException('Grades changed; preview again');
        job = {
          _id: dto.digest,
          scope,
          actorId: new Types.ObjectId(actorId),
          studentIds: snapshot.affectedStudents,
          gradeIds: ids,
          publishedAt: new Date(),
          processedStudents: 0,
          status: 'pending',
        };
        // Publication and its durable audit/reconciliation record commit together.
        await this.jobs.insertOne(job, { session });
      });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        const retry = await this.jobs.findOne({ _id: dto.digest });
        if (retry) return this.publicJob(retry);
      }
      throw error;
    } finally {
      await session.endSession();
    }
    return this.publicJob(job!);
  }

  async process(id: string, actorId: string) {
    if (!/^[a-f0-9]{64}$/.test(id))
      throw new BadRequestException('Invalid publication ID');
    const existing = await this.jobs.findOne({ _id: id });
    if (!existing) throw new NotFoundException('Publication not found');
    if (existing.status === 'complete') return this.publicJob(existing);
    const token = randomUUID(),
      expiresAt = new Date(Date.now() + 120000);
    const job = await this.jobs.findOneAndUpdate(
      {
        _id: id,
        status: 'pending',
        $or: [
          { leaseExpiresAt: { $lt: new Date() } },
          { leaseExpiresAt: { $exists: false } },
        ],
      },
      { $set: { leaseToken: token, leaseExpiresAt: expiresAt } },
      { returnDocument: 'after' },
    );
    if (!job)
      throw new ConflictException(
        'الحساب جارٍ؛ حاول مجددًا / GPA reconciliation is already running',
      );
    const leases = this.grades.db.collection('control_reconciliation_leases');
    const leaseId = new Types.ObjectId('0000000000000000000000c1');
    let acquired = false;
    try {
      try {
        await leases.findOneAndUpdate(
          {
            _id: leaseId,
            $or: [
              { expiresAt: { $lt: new Date() } },
              { expiresAt: { $exists: false } },
            ],
          },
          { $set: { token, expiresAt } },
          { upsert: true, returnDocument: 'after' },
        );
        acquired = true;
      } catch (error) {
        if ((error as { code?: number }).code === 11000)
          throw new ConflictException(
            'تحديث أكاديمي آخر جارٍ؛ استكمل لاحقًا / Academic reconciliation is busy',
          );
        throw error;
      }
      const ids = job.studentIds.slice(
        job.processedStudents,
        job.processedStudents + 25,
      );
      // Publish all components first; update GPA/credits without automatically promoting levels.
      const results = await this.academics.syncPublishedAcademicProgress(ids, {
        promoteLevels: false,
      });
      if (results.length !== ids.length)
        throw new ConflictException(
          'بعض الطلاب بلا ملف أكاديمي؛ استكمل بعد مراجعتها / Academic profiles missing',
        );
      const processedStudents = job.processedStudents + ids.length;
      const status =
        processedStudents === job.studentIds.length
          ? ('complete' as const)
          : ('pending' as const);
      const updated = await this.jobs.findOneAndUpdate(
        { _id: id, leaseToken: token },
        {
          $set: {
            processedStudents,
            status,
            lastProcessedBy: new Types.ObjectId(actorId),
          },
          $unset: { leaseToken: '', leaseExpiresAt: '', lastError: '' },
        },
        { returnDocument: 'after' },
      );
      if (!updated)
        throw new ConflictException(
          'Reconciliation lease changed; resume again',
        );
      return this.publicJob(updated);
    } catch (error) {
      await this.jobs.updateOne(
        { _id: id, leaseToken: token },
        {
          $set: {
            lastError:
              error instanceof Error ? error.message : 'Reconciliation failed',
          },
          $unset: { leaseToken: '', leaseExpiresAt: '' },
        },
      );
      throw error;
    } finally {
      if (acquired) await leases.deleteOne({ _id: leaseId, token });
    }
  }
}
