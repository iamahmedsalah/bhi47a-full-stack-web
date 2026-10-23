// Read-only diagnostics. Run from ~/app:
// docker exec -i app-api-1 node < scripts/vps-performance-probe.cjs
// No URI, credentials, documents or query values are printed.
const mongoose = require('mongoose');

function stages(value, result = new Set()) {
  if (!value || typeof value !== 'object') return [...result];
  if (typeof value.stage === 'string') result.add(value.stage);
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') stages(child, result);
  }
  return [...result];
}

(async () => {
  if (!process.env.MONGODB_URI) throw new Error('missing configuration');
  const connection = await mongoose.createConnection(process.env.MONGODB_URI, {
    minPoolSize: 1, maxPoolSize: 2, serverSelectionTimeoutMS: 5000,
  }).asPromise();
  try {
    const db = connection.db;
    const pingMs = [];
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      await db.admin().command({ ping: 1 });
      pingMs.push(Math.round(performance.now() - start));
    }
    const collection = db.collection('complaints');
    const plan = await collection.find({}).sort({ createdAt: -1, _id: -1 }).limit(20)
      .maxTimeMS(5000).explain('executionStats');
    const sizes = await collection.aggregate([
      { $sort: { createdAt: -1, _id: -1 } }, { $limit: 20 },
      { $group: { _id: null, documents: { $sum: 1 }, totalBytes: { $sum: { $bsonSize: '$$ROOT' } } } },
    ], { maxTimeMS: 5000 }).toArray();
    const indexes = await collection.listIndexes().toArray();
    console.log(JSON.stringify({
      redisHost: process.env.REDIS_URL ? new URL(process.env.REDIS_URL).hostname : 'not configured',
      atlasPingMs: pingMs,
      complaints: {
        planStages: stages(plan.queryPlanner?.winningPlan),
        serverExecutionMs: plan.executionStats?.executionTimeMillis,
        documentsExamined: plan.executionStats?.totalDocsExamined,
        keysExamined: plan.executionStats?.totalKeysExamined,
        returned: plan.executionStats?.nReturned,
        firstPagePayloadBytes: sizes[0]?.totalBytes ?? 0,
        indexes: indexes.map(({ name, key }) => ({ name, key })),
      },
    }, null, 2));
  } finally {
    await connection.close();
  }
})().catch(() => {
  console.error('Read-only probe failed. Inspect the cause privately; do not share credentials.');
  process.exitCode = 1;
});
