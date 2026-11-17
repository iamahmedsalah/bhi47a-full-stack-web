import 'reflect-metadata';
import { Types } from 'mongoose';
import { validate } from 'class-validator';
import { PERMISSIONS } from '@student-portal/shared';
import { HistoricalPublicationService } from './historical-publication.service';
import { HistoricalPublicationController } from './historical-publication.controller';
import { PublishHistoricalGradesDto } from './dto/grade.dto';

const scope = {
  academicYear: '2023-2024',
  semester: 'first' as const,
  level: '1',
};
const actorId = String(new Types.ObjectId());
const query = <T>(value: T) => {
  const q = {
    select: () => q,
    session: () => q,
    sort: () => q,
    lean: () => Promise.resolve(value),
  };
  return q;
};

function fixture() {
  const studentId = new Types.ObjectId(),
    courseId = new Types.ObjectId();
  let marks = ['coursework', 'midterm', 'final'].map((examType, i) => ({
    _id: new Types.ObjectId(),
    studentId,
    studentCode: '00123',
    courseId,
    courseCode: '111',
    examType,
    grade: [18, 25, 48][i],
    maxGrade: [20, 30, 50][i],
    status: 'present',
    academicYear: scope.academicYear,
    semester: scope.semester,
    isPublished: false,
    rev: 0,
  }));
  const jobs = new Map<string, Record<string, unknown>>();
  const matches = (
    doc: Record<string, unknown>,
    filter: Record<string, unknown>,
  ) =>
    Object.entries(filter).every(
      ([key, value]) =>
        key.startsWith('$') ||
        (key.startsWith('scope.')
          ? (doc.scope as Record<string, unknown>)[key.slice(6)]
          : doc[key]) === value,
    );
  const store = {
    findOne: jest.fn((filter: Record<string, unknown>) =>
      Promise.resolve(
        [...jobs.values()].find((j) => matches(j, filter)) ?? null,
      ),
    ),
    insertOne: jest.fn((doc: Record<string, unknown>) => {
      jobs.set(String(doc._id), { ...doc });
      return Promise.resolve();
    }),
    findOneAndUpdate: jest.fn(
      (
        filter: Record<string, unknown>,
        update: {
          $set: Record<string, unknown>;
          $unset?: Record<string, unknown>;
        },
      ) => {
        const job = jobs.get(String(filter._id));
        if (!job || !matches(job, filter)) return Promise.resolve(null);
        if (
          filter.$or &&
          job.leaseExpiresAt &&
          (job.leaseExpiresAt as Date) > new Date()
        )
          return Promise.resolve(null);
        Object.assign(job, update.$set);
        for (const key of Object.keys(update.$unset ?? {})) delete job[key];
        return Promise.resolve({ ...job });
      },
    ),
    updateOne: jest.fn(
      (
        filter: Record<string, unknown>,
        update: {
          $set: Record<string, unknown>;
          $unset?: Record<string, unknown>;
        },
      ) => {
        const job = jobs.get(String(filter._id));
        if (job && matches(job, filter)) {
          Object.assign(job, update.$set);
          for (const key of Object.keys(update.$unset ?? {})) delete job[key];
        }
        return Promise.resolve();
      },
    ),
  };
  const session = {
    withTransaction: jest.fn(async (work: () => Promise<void>) => work()),
    endSession: jest.fn(),
  };
  const leases = {
    findOneAndUpdate: jest.fn().mockResolvedValue({}),
    deleteOne: jest.fn(),
  };
  const grades = {
    find: jest.fn(() => query(marks)),
    updateMany: jest
      .fn()
      .mockResolvedValue({ matchedCount: 3, modifiedCount: 3 }),
    db: {
      db: { collection: () => store },
      collection: () => leases,
      startSession: () => Promise.resolve(session),
    },
  };
  const profiles = {
    find: jest.fn(() => query([{ userId: studentId, level: '1' }])),
  };
  const academicProfiles = { find: jest.fn(() => query([{ studentId }])) };
  const sheets = {
    find: jest.fn(() => query([] as Array<{ courseId: Types.ObjectId }>)),
  };
  const academic = {
    syncPublishedAcademicProgress: jest.fn().mockResolvedValue([{ studentId }]),
  };
  const service = new HistoricalPublicationService(
    grades as never,
    profiles as never,
    sheets as never,
    academicProfiles as never,
    academic as never,
  );
  return {
    service,
    grades,
    profiles,
    academicProfiles,
    sheets,
    store,
    session,
    leases,
    academic,
    jobs,
    courseId,
    marks: () => marks,
    setMarks: (value: typeof marks) => {
      marks = value;
    },
  };
}

describe('historical publication', () => {
  it('requires a separately delegable historical publication permission', () => {
    expect(
      Reflect.getMetadata('roles', HistoricalPublicationController),
    ).toEqual(['admin', 'staff']);
    expect(
      Reflect.getMetadata('permissions', HistoricalPublicationController),
    ).toEqual([PERMISSIONS.GRADES_HISTORICAL_PUBLISH]);
  });

  it('rejects broad scopes and missing confirmation evidence at DTO validation', async () => {
    const bad = Object.assign(new PublishHistoricalGradesDto(), {
      academicYear: '2023-2024',
      semester: 'all',
      level: 'all',
    });
    expect((await validate(bad)).map((e) => e.property).sort()).toEqual([
      'digest',
      'level',
      'semester',
    ]);
  });

  it('previews the exact current student level and excludes ordinary/Control records', async () => {
    const f = fixture();
    expect(await f.service.preview(scope)).toMatchObject({
      totalStudents: 1,
      courseAttempts: 1,
      totalMarks: 3,
      unpublishedMarks: 3,
      canPublish: true,
      issueCount: 0,
    });
    expect(f.profiles.find).toHaveBeenCalledWith({ level: '1' });
    expect(f.grades.find).toHaveBeenCalledWith(
      expect.objectContaining({
        historicalImport: true,
        controlManaged: { $ne: true },
        cleared: { $ne: true },
        academicYear: '2023-2024',
        semester: 'first',
      }),
    );
    expect(f.grades.updateMany).not.toHaveBeenCalled();
  });

  it('blocks incomplete components, invalid marks, missing academics and existing Control sheets', async () => {
    const f = fixture();
    f.setMarks(f.marks().slice(0, 2));
    expect(await f.service.preview(scope)).toMatchObject({
      canPublish: false,
      issueCount: 1,
    });
    const g = fixture();
    g.marks()[2].grade = 51;
    expect((await g.service.preview(scope)).canPublish).toBe(false);
    const h = fixture();
    h.sheets.find.mockImplementation(() => query([{ courseId: h.courseId }]));
    expect((await h.service.preview(scope)).canPublish).toBe(false);
    const j = fixture();
    j.academicProfiles.find.mockImplementation(() => query([]));
    expect((await j.service.preview(scope)).issues.join(' ')).toContain(
      'Academic profile missing',
    );
  });

  it('rejects current/future academic years even with a valid-looking scope', async () => {
    const f = fixture();
    await expect(
      f.service.preview({ ...scope, academicYear: '9998-9999' }),
    ).rejects.toThrow('previous academic year');
  });

  it('detects stale grades before any writes, including changes after the preview', async () => {
    const f = fixture(),
      preview = await f.service.preview(scope);
    f.marks()[0].grade = 17;
    await expect(
      f.service.publish({ ...scope, digest: preview.digest }, actorId),
    ).rejects.toThrow('Preview is stale');
    expect(f.grades.updateMany).not.toHaveBeenCalled();
    expect(f.store.insertOne).not.toHaveBeenCalled();
  });

  it('atomically publishes all components and records actor/scope/evidence; lost-response retries are safe', async () => {
    const f = fixture(),
      preview = await f.service.preview(scope);
    const job = await f.service.publish(
      { ...scope, digest: preview.digest },
      actorId,
    );
    expect(job).toMatchObject({
      status: 'pending',
      gradeCount: 3,
      totalStudents: 1,
      processedStudents: 0,
    });
    expect(f.session.withTransaction).toHaveBeenCalledTimes(1);
    expect(f.grades.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        historicalImport: true,
        controlManaged: { $ne: true },
        _id: { $in: f.marks().map((m) => m._id) },
      }),
      { $set: { isPublished: true } },
      { session: f.session },
    );
    expect(f.store.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        scope,
        actorId: new Types.ObjectId(actorId),
        gradeIds: f.marks().map((m) => m._id),
      }),
      { session: f.session },
    );
    await f.service.publish({ ...scope, digest: preview.digest }, actorId);
    expect(f.grades.updateMany).toHaveBeenCalledTimes(1);
    expect(f.academic.syncPublishedAcademicProgress).not.toHaveBeenCalled();
  });

  it('retains a resumable GPA job on failure and never promotes levels during publication', async () => {
    const f = fixture(),
      preview = await f.service.preview(scope);
    const job = await f.service.publish(
      { ...scope, digest: preview.digest },
      actorId,
    );
    f.academic.syncPublishedAcademicProgress.mockRejectedValueOnce(
      new Error('transient failure'),
    );
    await expect(f.service.process(job.id, actorId)).rejects.toThrow(
      'transient failure',
    );
    expect((await f.service.latest(scope)).job).toMatchObject({
      status: 'pending',
      processedStudents: 0,
    });
    expect(await f.service.process(job.id, actorId)).toMatchObject({
      status: 'complete',
      processedStudents: 1,
    });
    expect(f.academic.syncPublishedAcademicProgress).toHaveBeenLastCalledWith(
      [f.marks()[0].studentId],
      { promoteLevels: false },
    );
    await f.service.process(job.id, actorId);
    expect(f.academic.syncPublishedAcademicProgress).toHaveBeenCalledTimes(2);
    expect(f.grades.updateMany).toHaveBeenCalledTimes(1);
  });
});
