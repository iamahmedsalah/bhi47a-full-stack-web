// Additive migration: creates only these two indexes; never drops or edits data.
// VPS: docker exec -i app-api-1 node < scripts/ensure-complaint-email-indexes.cjs
const mongoose = require('mongoose');
(async () => {
  if (!process.env.MONGODB_URI) throw new Error('Database configuration missing');
  const connection = await mongoose.createConnection(process.env.MONGODB_URI, {
    minPoolSize: 1, maxPoolSize: 1, serverSelectionTimeoutMS: 5000,
  }).asPromise();
  try {
    await connection.db.collection('complaints').createIndex({
      'replyEmailEvents.status': 1, 'replyEmailEvents.nextAttemptAt': 1,
    });
    await connection.db.collection('email_logs').createIndex({ eventKey: 1 }, {
      unique: true, partialFilterExpression: { eventKey: { $type: 'string' } },
    });
    console.log('Complaint email indexes ready. Existing records and indexes preserved.');
  } finally {
    await connection.close();
  }
})().catch(() => {
  console.error('Could not create complaint email indexes. Check database connectivity and index privileges.');
  process.exitCode = 1;
});
