const { spawn } = require('node:child_process');
const { createHash, randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

function validateFixtureUri(uri) {
  const url = new URL(uri);
  if (
    url.protocol !== 'mongodb:' ||
    !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.pathname !== '/control-recovery-e2e'
  )
    throw new Error(
      'Restore rehearsal requires credential-free localhost /control-recovery-e2e. Live databases and credentials are prohibited.',
    );
  return url;
}
const hash = (value) => createHash('sha256').update(value).digest('hex');
async function run(executable, args, log) {
  await new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true });
    const chunks = [];
    child.stdout.on('data', (data) => chunks.push(data));
    child.stderr.on('data', (data) => chunks.push(data));
    child.on('error', reject);
    child.on('close', async (code) => {
      try {
        await fs.writeFile(log, Buffer.concat(chunks), { mode: 0o600 });
      } catch (error) {
        reject(error);
        return;
      }
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `Database tool failed (${code}); inspect its local rehearsal log`,
          ),
        );
    });
  });
}

async function inventory(db, BSON) {
  const report = {};
  const collections = await db
    .listCollections({}, { nameOnly: true })
    .toArray();
  for (const { name } of collections.sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const digest = createHash('sha256');
    let count = 0;
    for await (const document of db
      .collection(name)
      .find({})
      .sort({ _id: 1 })) {
      digest.update(BSON.serialize(document));
      count++;
    }
    const indexes = (await db.collection(name).indexes())
      .map((index) => ({
        name: index.name,
        key: Object.entries(index.key),
        unique: index.unique ?? false,
        sparse: index.sparse ?? false,
        expireAfterSeconds: index.expireAfterSeconds ?? null,
        partialFilterExpression: index.partialFilterExpression ?? null,
        collation: index.collation ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    report[name] = { count, bsonSha256: digest.digest('hex'), indexes };
  }
  return report;
}

async function seed(db, ObjectId) {
  const studentId = new ObjectId(),
    courseId = new ObjectId(),
    actorId = new ObjectId();
  const course = {
    _id: courseId,
    code: 'RESTORE-SYNTH',
    name: 'Synthetic recovery course',
    creditHours: 3,
    isActive: true,
  };
  const scope = {
    courseId,
    academicYear: '2098-2099',
    semester: 'first',
    component: 'final',
  };
  const sheetId = new ObjectId(),
    releaseId = new ObjectId(),
    oldReleaseId = new ObjectId();
  const marks = ['coursework', 'midterm', 'final'].map((examType, index) => ({
    _id: new ObjectId(),
    studentId,
    studentCode: 'SYNTH-RESTORE',
    courseId,
    courseCode: course.code,
    courseName: course.name,
    examType,
    grade: [17, 15, 48][index],
    maxGrade: [20, 20, 60][index],
    status: 'present',
    academicYear: scope.academicYear,
    semester: scope.semester,
    isPublished: true,
    controlManaged: true,
    rev: 2,
    controlApprovedRev: 2,
    ...(examType === 'coursework'
      ? { attendanceMark: 4, quizzesMark: 13 }
      : {}),
  }));
  const {
    evaluateOfficialResult,
    DEFAULT_RESULT_POLICY,
  } = require('../../dist/modules/control/utils/official-result.util.js');
  const { DEFAULT_CONTROL_COMPONENTS } = require('@student-portal/shared');
  const result = evaluateOfficialResult(
    DEFAULT_CONTROL_COMPONENTS,
    Object.fromEntries(
      marks.map((m) => [m.examType, { score: m.grade, status: m.status }]),
    ),
    DEFAULT_RESULT_POLICY,
  );
  const deliveredId = new ObjectId(),
    pendingId = new ObjectId();
  const sheets = marks.map((mark) => ({
    _id: mark.examType === 'final' ? sheetId : new ObjectId(),
    courseId,
    courseCode: course.code,
    academicYear: scope.academicYear,
    semester: scope.semester,
    component: mark.examType,
    workflowState: 'APPROVED',
    revision: 4,
    approvedBy: actorId,
    approvedAt: new Date(),
    submission: {
      digest: 'synthetic-review',
      schemeVersion: 1,
      revision: 3,
      submittedBy: String(new ObjectId()),
      submittedAt: new Date(),
    },
  }));
  const release = {
    _id: releaseId,
    sheetId,
    scope,
    digest: 'synthetic-current',
    policy: DEFAULT_RESULT_POLICY,
    schemeVersion: 1,
    actorId,
    createdAt: new Date(),
    marks,
    results: [{ studentId, result }],
  };
  const data = {
    users: [
      {
        _id: studentId,
        role: 'student',
        studentCode: 'SYNTH-RESTORE',
        name: 'Synthetic recovery student',
        isActive: true,
      },
      {
        _id: actorId,
        role: 'admin',
        name: 'Synthetic recovery reviewer',
        isActive: true,
      },
    ],
    courses: [course],
    grades: marks,
    student_profiles: [
      {
        _id: new ObjectId(),
        userId: studentId,
        studentCode: 'SYNTH-RESTORE',
        fullName: 'Synthetic recovery student',
        level: '1',
        academicYear: scope.academicYear,
        semester: scope.semester,
      },
    ],
    student_academic_profiles: [
      {
        _id: new ObjectId(),
        studentId,
        academicLevel: '1',
        semester: 'first',
        completedCourses: [course.code],
        failedCourses: [],
        gpa: result.gradePoints,
        completedCreditHours: 3,
        academicWarnings: 0,
      },
    ],
    course_registrations: [
      {
        _id: new ObjectId(),
        studentId,
        academicYear: scope.academicYear,
        semester: scope.semester,
        courses: [course.code],
        status: 'approved',
      },
    ],
    control_sheets: sheets,
    control_grading_schemes: [
      {
        _id: new ObjectId(),
        courseId,
        academicYear: scope.academicYear,
        semester: scope.semester,
        version: 1,
        courseworkAttendanceMax: 5,
        components: DEFAULT_CONTROL_COMPONENTS,
        frozenAt: new Date(),
      },
    ],
    control_result_policies: [
      {
        _id: `${courseId}|${scope.academicYear}|first`,
        version: 1,
        rules: DEFAULT_RESULT_POLICY,
        actorId: String(actorId),
        updatedAt: new Date(),
      },
    ],
    control_releases: [
      {
        ...release,
        _id: oldReleaseId,
        digest: 'synthetic-previous',
        marks: marks.map((m) => ({ ...m, rev: 1, controlApprovedRev: 1 })),
        createdAt: new Date(Date.now() - 60000),
      },
      release,
    ],
    control_release_pointers: [
      { _id: sheetId, releaseId, active: true, scope },
    ],
    grade_audit_logs: [
      {
        _id: new ObjectId(),
        sheetId,
        courseId,
        academicYear: scope.academicYear,
        semester: 'first',
        component: 'final',
        action: 'PUBLISH',
        source: 'SYSTEM',
        actorId,
        newValue: {
          releaseId: String(releaseId),
          digest: release.digest,
          isPublished: true,
        },
        at: new Date(),
      },
    ],
    control_academic_baselines: [
      {
        _id: studentId,
        completedCourses: [],
        failedCourses: [],
        lowGradeCourses: [],
        gpa: 0,
        completedCreditHours: 0,
        academicLevel: '1',
        semester: 'first',
        academicWarnings: 0,
      },
    ],
    control_release_outbox: [
      {
        _id: deliveredId,
        studentId,
        actorId,
        releaseId,
        attempts: 1,
        delivered: true,
        createdAt: new Date(),
      },
      {
        _id: pendingId,
        studentId,
        actorId,
        releaseId,
        attempts: 0,
        createdAt: new Date(),
      },
    ],
    notifications: [
      {
        _id: deliveredId,
        targetType: 'student',
        targetStudentId: studentId,
        sentBy: actorId,
        title: 'Synthetic recovered notification',
        body: 'Synthetic fixture',
        createdAt: new Date(),
        readBy: [],
        hiddenBy: [],
        deliveryStatus: 'skipped',
      },
    ],
    control_import_batches: [
      {
        _id: new ObjectId(),
        sheetId,
        actorId,
        schemeVersion: 1,
        revision: 4,
        changes: [],
        errors: [],
        result: { summary: { ok: 1 } },
        expiresAt: new Date(Date.now() + 86400000),
      },
    ],
  };
  for (const [name, rows] of Object.entries(data))
    await db.collection(name).insertMany(rows);
  await db
    .collection('grades')
    .createIndex(
      { studentId: 1, courseId: 1, academicYear: 1, semester: 1, examType: 1 },
      { unique: true },
    );
  await db
    .collection('control_sheets')
    .createIndex(
      { courseId: 1, academicYear: 1, semester: 1, component: 1 },
      { unique: true },
    );
  await db
    .collection('control_releases')
    .createIndex({ sheetId: 1, digest: 1 }, { unique: true });
  await db.collection('control_releases').createIndex({ 'marks.studentId': 1 });
  await db
    .collection('control_import_batches')
    .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  return { studentId, releaseId, pendingId };
}

async function main() {
  const url = validateFixtureUri(
    process.env.CONTROL_RESTORE_MONGODB_URI ||
      'mongodb://127.0.0.1:27023/control-recovery-e2e',
  );
  const { MongoClient, BSON } = require('mongodb');
  const mongoose = require('mongoose');
  const client = new MongoClient(url.href, {
    serverSelectionTimeoutMS: 3000,
    maxPoolSize: 2,
  });
  const id = randomUUID().replaceAll('-', '');
  const sourceName = `control-recovery-${id}-e2e`,
    targetName = `control-restored-${id}-e2e`;
  const output = path.resolve(
    __dirname,
    '../../../../outputs/control-restore',
    id,
  );
  await fs.mkdir(output, { recursive: true, mode: 0o700 });
  const start = Date.now();
  await client.connect();
  try {
    const hello = await client.db().admin().command({ hello: 1 });
    if (hello.setName !== 'control-test')
      throw new Error('Wrong replica set; no fixture created');
    const source = client.db(sourceName),
      target = client.db(targetName);
    if (
      (await source.listCollections().toArray()).length ||
      (await target.listCollections().toArray()).length
    )
      throw new Error(
        'Fresh fixture database required; no overwrite permitted',
      );
    const fixture = await seed(source, BSON.ObjectId);
    const before = await inventory(source, BSON);
    const archive = path.join(output, 'control.archive.gz');
    const base = new URL(url);
    base.pathname = '/';
    await run(
      process.env.MONGODUMP_PATH || 'mongodump',
      [
        '--uri',
        base.href,
        '--db',
        sourceName,
        '--archive=' + archive,
        '--gzip',
        '--numParallelCollections=1',
      ],
      path.join(output, 'dump.log'),
    );
    await run(
      process.env.MONGORESTORE_PATH || 'mongorestore',
      [
        '--uri',
        base.href,
        '--archive=' + archive,
        '--gzip',
        '--nsInclude=' + sourceName + '.*',
        '--nsFrom=' + sourceName + '.*',
        '--nsTo=' + targetName + '.*',
        '--stopOnError',
        '--numParallelCollections=1',
      ],
      path.join(output, 'restore.log'),
    );
    const restored = await inventory(target, BSON),
      after = await inventory(source, BSON);
    if (JSON.stringify(before) !== JSON.stringify(after))
      throw new Error(
        'Source changed during backup; consistency not established',
      );
    if (JSON.stringify(before) !== JSON.stringify(restored))
      throw new Error('Restored documents or indexes differ from source');
    const connectionUrl = new URL(url);
    connectionUrl.pathname = '/' + targetName;
    const connection = await mongoose
      .createConnection(connectionUrl.href, {
        autoIndex: false,
        autoCreate: false,
      })
      .asPromise();
    try {
      const {
        ControlReleaseStore,
      } = require('../../dist/modules/grades/control-release.store.js');
      const store = new ControlReleaseStore(connection);
      const results = await store.studentMarks(fixture.studentId);
      if (
        results.length !== 3 ||
        results.find((r) => r.examType === 'final')?.officialResult?.total !==
          80
      )
        throw new Error(
          'Recovered release does not serve the approved 80/100 result',
        );
      await store.flushOutbox();
      await store.flushOutbox();
      if (
        (await target
          .collection('notifications')
          .countDocuments({ targetStudentId: fixture.studentId })) !== 2
      )
        throw new Error(
          'Recovered outbox retry duplicated or lost notification',
        );
      if (
        await target
          .collection('control_release_outbox')
          .countDocuments({ delivered: { $ne: true } })
      )
        throw new Error('Recovered outbox did not drain');
    } finally {
      await connection.close();
    }
    const report = {
      passed: true,
      environment: 'isolated synthetic localhost replica set',
      completedAt: new Date().toISOString(),
      elapsedMs: Date.now() - start,
      sourceDatabase: sourceName,
      restoredDatabase: targetName,
      archiveSha256: hash(await fs.readFile(archive)),
      collections: before,
      checks: {
        bsonDocumentsIdentical: true,
        indexesIdentical: true,
        sourceUnchanged: true,
        approvedReleaseReadable: true,
        outboxRetryIdempotent: true,
      },
      productionBackupVerified: false,
    };
    await fs.writeFile(
      path.join(output, 'report.json'),
      JSON.stringify(report, null, 2) + '\n',
      { mode: 0o600 },
    );
    console.log(
      JSON.stringify({
        passed: true,
        report: path.relative(process.cwd(), path.join(output, 'report.json')),
        collections: Object.keys(before).length,
        elapsedMs: report.elapsedMs,
        productionBackupVerified: false,
      }),
    );
  } finally {
    await client.close();
  }
}
module.exports = { validateFixtureUri };
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
