const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { createRequire } = require('node:module');

function validateOptions(args) {
  if (!args.includes('--read-only'))
    throw new Error('Explicit --read-only mode required');
  const at = args.indexOf('--source-env');
  const out = args.indexOf('--output');
  if (at < 0 || !args[at + 1] || out < 0 || !args[out + 1])
    throw new Error(
      'Use --source-env protected-config-file --read-only --output report.json',
    );
  const config = path.resolve(args[at + 1]);
  const output = path.resolve(args[out + 1]);
  if (config.toLowerCase() === output.toLowerCase())
    throw new Error(
      'Report output must not overwrite the protected source config',
    );
  return { config, output };
}

async function auditDatabase(db) {
  const active = { cleared: { $ne: true } };
  const rows = async (collection, pipeline) =>
    db
      .collection(collection)
      .aggregate(pipeline, { maxTimeMS: 10000, allowDiskUse: false })
      .toArray();
  const count = async (collection, pipeline) =>
    (await rows(collection, [...pipeline, { $count: 'count' }]))[0]?.count ?? 0;
  const failures = [];
  const counts = {};
  const check = async (name, work) => {
    try {
      counts[name] = await work();
    } catch (error) {
      counts[name] = null;
      failures.push({
        check: name,
        errorClass: error.name,
        code: error.code ?? null,
      });
    }
  };
  await check('users', () => count('users', []));
  await check('courses', () => count('courses', []));
  await check('activeGrades', () => count('grades', [{ $match: active }]));
  await check('duplicateComponentGroups', () =>
    count('grades', [
      { $match: active },
      {
        $group: {
          _id: {
            student: '$studentId',
            course: '$courseId',
            year: '$academicYear',
            term: '$semester',
            component: '$examType',
          },
          n: { $sum: 1 },
        },
      },
      { $match: { n: { $gt: 1 } } },
    ]),
  );
  await check('missingStudents', () =>
    count('grades', [
      { $match: active },
      {
        $lookup: {
          from: 'users',
          localField: 'studentId',
          foreignField: '_id',
          as: 'student',
        },
      },
      { $match: { student: { $size: 0 } } },
    ]),
  );
  await check('codeIdentityMismatches', () =>
    count('grades', [
      { $match: active },
      {
        $lookup: {
          from: 'users',
          localField: 'studentId',
          foreignField: '_id',
          as: 'student',
        },
      },
      {
        $match: {
          $expr: {
            $and: [
              { $gt: [{ $size: '$student' }, 0] },
              {
                $ne: [
                  '$studentCode',
                  { $arrayElemAt: ['$student.studentCode', 0] },
                ],
              },
            ],
          },
        },
      },
    ]),
  );
  await check('outsideApprovedRoster', () =>
    count('grades', [
      {
        $match: {
          ...active,
          examType: { $in: ['coursework', 'midterm', 'final'] },
        },
      },
      {
        $lookup: {
          from: 'course_registrations',
          let: {
            student: '$studentId',
            year: '$academicYear',
            term: '$semester',
            course: '$courseCode',
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$studentId', '$$student'] },
                    { $eq: ['$academicYear', '$$year'] },
                    { $eq: ['$semester', '$$term'] },
                    { $eq: ['$status', 'approved'] },
                    { $in: ['$$course', { $ifNull: ['$courses', []] }] },
                  ],
                },
              },
            },
            { $limit: 1 },
            { $project: { _id: 1 } },
          ],
          as: 'registration',
        },
      },
      { $match: { registration: { $size: 0 } } },
    ]),
  );
  await check('legacyFinalsNeedingClassification', () =>
    count('grades', [
      {
        $match: { ...active, examType: 'final', controlManaged: { $ne: true } },
      },
    ]),
  );
  await check('mixedTotalsAndComponents', () =>
    count('grades', [
      { $match: active },
      {
        $group: {
          _id: {
            student: '$studentId',
            course: '$courseId',
            year: '$academicYear',
            term: '$semester',
          },
          components: { $addToSet: '$examType' },
        },
      },
      {
        $match: {
          $expr: {
            $and: [
              { $in: ['total', '$components'] },
              {
                $gt: [
                  {
                    $size: {
                      $setIntersection: [
                        '$components',
                        ['coursework', 'midterm', 'final'],
                      ],
                    },
                  },
                  0,
                ],
              },
            ],
          },
        },
      },
    ]),
  );
  const cents = (field) => ({
    $round: [
      {
        $multiply: [
          { $convert: { input: field, to: 'double', onError: 0, onNull: 0 } },
          100,
        ],
      },
      0,
    ],
  });
  await check('invalidCourseworkBreakdown', () =>
    count('grades', [
      {
        $match: {
          ...active,
          examType: 'coursework',
          status: { $in: ['present', 'withheld'] },
        },
      },
      {
        $match: {
          $expr: {
            $not: [
              {
                $and: [
                  { $isNumber: '$grade' },
                  { $isNumber: '$attendanceMark' },
                  { $isNumber: '$quizzesMark' },
                  { $gte: ['$attendanceMark', 0] },
                  { $gte: ['$quizzesMark', 0] },
                  { $lte: ['$grade', 20] },
                  {
                    $eq: [
                      cents('$grade'),
                      {
                        $add: [cents('$attendanceMark'), cents('$quizzesMark')],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
    ]),
  );
  const sheetJoin = {
    $lookup: {
      from: 'control_sheets',
      let: {
        course: '$courseId',
        year: '$academicYear',
        term: '$semester',
        component: '$examType',
      },
      pipeline: [
        {
          $match: {
            $expr: {
              $and: [
                { $eq: ['$courseId', '$$course'] },
                { $eq: ['$academicYear', '$$year'] },
                { $eq: ['$semester', '$$term'] },
                { $eq: ['$component', '$$component'] },
              ],
            },
          },
        },
        { $limit: 1 },
      ],
      as: 'sheet',
    },
  };
  const controlled = {
    $or: [
      { $eq: ['$controlManaged', true] },
      { $gt: [{ $size: '$sheet' }, 0] },
    ],
  };
  const approved = {
    $and: [
      { $eq: [{ $arrayElemAt: ['$sheet.workflowState', 0] }, 'APPROVED'] },
      { $eq: ['$controlApprovedRev', { $ifNull: ['$rev', 0] }] },
    ],
  };
  await check('unapprovedPublishedControlMarks', () =>
    count('grades', [
      { $match: { ...active, isPublished: true } },
      sheetJoin,
      { $match: { $expr: { $and: [controlled, { $not: [approved] }] } } },
    ]),
  );
  await check('danglingReleasePointers', () =>
    count('control_release_pointers', [
      {
        $lookup: {
          from: 'control_releases',
          localField: 'releaseId',
          foreignField: '_id',
          as: 'release',
        },
      },
      {
        $match: {
          $expr: {
            $or: [
              { $ne: [{ $size: '$release' }, 1] },
              { $ne: ['$_id', { $arrayElemAt: ['$release.sheetId', 0] }] },
            ],
          },
        },
      },
    ]),
  );
  await check('pendingReleaseJobs', () =>
    count('control_release_outbox', [{ $match: { delivered: { $ne: true } } }]),
  );
  await check('repeatedlyFailingReleaseJobs', () =>
    count('control_release_outbox', [
      { $match: { delivered: { $ne: true }, attempts: { $gte: 5 } } },
    ]),
  );
  await check('legacyCourseActiveFlags', () =>
    count('courses', [{ $match: { isActive: { $exists: false } } }]),
  );
  let cohorts = [];
  try {
    cohorts = await rows('grades', [
      { $match: active },
      {
        $group: {
          _id: {
            academicYear: '$academicYear',
            semester: '$semester',
            courseCode: '$courseCode',
            examType: '$examType',
            maxGrade: '$maxGrade',
          },
          records: { $sum: 1 },
          published: { $sum: { $cond: ['$isPublished', 1, 0] } },
        },
      },
      { $sort: { '_id.academicYear': 1, '_id.courseCode': 1 } },
      { $limit: 201 },
    ]);
  } catch (error) {
    failures.push({
      check: 'cohortInventory',
      errorClass: error.name,
      code: error.code ?? null,
    });
  }
  const releaseBlocking = [
    'duplicateComponentGroups',
    'missingStudents',
    'codeIdentityMismatches',
    'outsideApprovedRoster',
    'legacyFinalsNeedingClassification',
    'mixedTotalsAndComponents',
    'invalidCourseworkBreakdown',
    'unapprovedPublishedControlMarks',
    'danglingReleasePointers',
    'pendingReleaseJobs',
    'repeatedlyFailingReleaseJobs',
  ];
  return {
    counts,
    failedChecks: failures,
    cohorts: cohorts
      .slice(0, 200)
      .map((c) => ({ ...c._id, records: c.records, published: c.published })),
    cohortInventoryTruncated: cohorts.length > 200,
    reviewRequired:
      failures.length > 0 ||
      cohorts.length > 200 ||
      releaseBlocking.some((key) => counts[key] !== 0),
    productionAccepted: false,
    guidance:
      'Read-only aggregate counts and course/term summaries only. Flags require review; this tool never classifies or changes historical results. Deployment verification, a real backup restore and staff sign-off are separate gates.',
  };
}

async function main() {
  const options = validateOptions(process.argv.slice(2));
  const requireConfig = createRequire(require.resolve('@nestjs/config'));
  const config = requireConfig('dotenv').parse(
    await fs.readFile(options.config),
  );
  if (!config.MONGODB_URI)
    throw new Error('Protected config has no MONGODB_URI');
  const url = new URL(config.MONGODB_URI);
  if (!['mongodb:', 'mongodb+srv:'].includes(url.protocol))
    throw new Error('Unsupported database protocol');
  const { MongoClient } = require('mongodb');
  const client = new MongoClient(config.MONGODB_URI, {
    maxPoolSize: 1,
    minPoolSize: 0,
    serverSelectionTimeoutMS: 8000,
    socketTimeoutMS: 12000,
    readPreference: 'secondaryPreferred',
    appName: 'control-read-only-acceptance-audit',
  });
  const startedAt = new Date().toISOString();
  await client.connect();
  try {
    const report = {
      startedAt,
      completedAt: null,
      sourceHostSha256: createHash('sha256').update(url.hostname).digest('hex'),
      database: client.db().databaseName,
      ...(await auditDatabase(client.db())),
    };
    report.completedAt = new Date().toISOString();
    await fs.mkdir(path.dirname(options.output), {
      recursive: true,
      mode: 0o700,
    });
    await fs.writeFile(options.output, JSON.stringify(report, null, 2) + '\n', {
      mode: 0o600,
    });
    console.log(
      JSON.stringify({
        report: options.output,
        counts: report.counts,
        failedChecks: report.failedChecks,
        reviewRequired: report.reviewRequired,
        productionAccepted: false,
      }),
    );
    if (report.failedChecks.length) process.exitCode = 1;
  } finally {
    await client.close();
  }
}
module.exports = { validateOptions, auditDatabase };
if (require.main === module)
  main().catch((error) => {
    console.error('Read-only acceptance audit failed: ' + error.name);
    process.exitCode = 1;
  });
