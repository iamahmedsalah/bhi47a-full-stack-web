// Additive migration. Default is a dry run: no connection and no database writes.
const indexes = [
  {
    collection: "course_registrations",
    key: { academicYear: 1, semester: 1, status: 1, courses: 1, studentId: 1 },
  },
  {
    collection: "grades",
    key: {
      courseId: 1,
      academicYear: 1,
      semester: 1,
      examType: 1,
      studentId: 1,
    },
  },
];
async function main() {
  if (!process.argv.includes("--apply")) {
    console.log(JSON.stringify({ dryRun: true, indexes }, null, 2));
    return;
  }
  if (!process.env.MONGODB_URI)
    throw new Error("Database configuration missing");
  const { MongoClient } = require("mongodb");
  const client = new MongoClient(process.env.MONGODB_URI, {
    maxPoolSize: 1,
    serverSelectionTimeoutMS: 5000,
  });
  try {
    await client.connect();
    for (const { collection, key } of indexes)
      await client.db().collection(collection).createIndex(key);
    console.log(
      "Control query indexes ready; existing records and indexes preserved.",
    );
  } finally {
    await client.close();
  }
}
if (require.main === module)
  main().catch(() => {
    console.error(
      "Control query index migration failed. Check connectivity and index privileges; no existing indexes were dropped.",
    );
    process.exitCode = 1;
  });
