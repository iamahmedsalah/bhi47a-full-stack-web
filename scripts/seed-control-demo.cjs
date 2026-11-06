const { createRequire } = require('node:module');
const path = require('node:path');
const requireApi = createRequire(path.resolve(__dirname, '../apps/api/package.json'));

function validateUri(uri) {
  const parsed = new URL(uri);
  if (parsed.protocol !== 'mongodb:' || !['127.0.0.1', 'localhost'].includes(parsed.hostname) || parsed.username || parsed.password || parsed.search || parsed.pathname !== '/control-demo') throw new Error('Demo seed requires a credential-free localhost /control-demo database. Other databases are prohibited.');
  return uri;
}

async function main() {
  const uri = validateUri(process.env.CONTROL_DEMO_MONGODB_URI || 'mongodb://127.0.0.1:27023/control-demo');
  const { MongoClient, ObjectId } = requireApi('mongoose').mongo;
  const bcrypt = requireApi('bcrypt');
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 3000 });
  await client.connect();
  try {
    const hello = await client.db().admin().command({ hello: 1 });
    if (hello.setName !== 'control-test') throw new Error('Demo seed requires the isolated control-test replica set');
    const db = client.db();
    const names = ['users', 'courses', 'student_profiles', 'student_academic_profiles', 'course_registrations'];
    for (const name of names) {
      if (await db.collection(name).findOne({controlDemo:{$ne:true}})) throw new Error('Demo database contains untagged records. Seed refused before any writes.');
    }
    for (const name of names) { try { await db.createCollection(name); } catch (e) { if (e.code !== 48) throw e; } }
    const courseId = new ObjectId('c02600000000000000000001');
    const password = 'ControlDemo123!';
    const passwordHash = await bcrypt.hash(password, 12);
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        const insert = async (collection, id, values) => {
          const existing = await db.collection(collection).findOne({ _id: id }, { session });
          if (existing && existing.controlDemo !== true) throw new Error('A demo ID is occupied by an untagged record; no seed changes were committed');
          await db.collection(collection).updateOne({ _id: id }, { $setOnInsert: { ...values, controlDemo: true, createdAt: new Date(), updatedAt: new Date() } }, { upsert: true, session });
        };
        for (const [index, name] of ['submitter', 'reviewer'].entries()) {
          await insert('users', new ObjectId(`c0260000000000000000001${index}`), { role: 'admin', name: `Control demo ${name}`, username: `control-${name}`, email: `control-${name}@example.test`, passwordHash, isActive: true, mustChangePassword: false, tokenVersion: 0, permissions: [] });
        }
        await insert('courses', courseId, { code: 'CTRL-DEMO', name: 'Control demonstration', nameEn: 'Control demonstration', nameAr: 'تجربة الكنترول', level: '1', academicLevel: '1', semester: 'first', creditHours: 3, type: 'required', isActive: true, prerequisites: [], coRequisites: [], equivalentCourses: [], doctorIds: [], teachingAssistantIds: [] });
        for (let i = 1; i <= 3; i++) {
          const studentId = new ObjectId(`c0260000000000000000010${i}`);
          const studentCode = `99000${i}`;
          await insert('users', studentId, { role: 'student', name: `Synthetic student ${i}`, studentCode, username: studentCode, userCode: `STD-${studentCode}`, passwordHash, isActive: true, mustChangePassword: false, tokenVersion: 0, permissions: [] });
          await insert('student_profiles', new ObjectId(`c0260000000000000000020${i}`), { userId: studentId, studentCode, fullName: `Synthetic student ${i}`, fullNameAr: `طالب تجريبي ${i}`, academicYear: '2026-2027', level: '1', semester: 'first', enrollmentStatus: 'active', isBlocked: false, tuitionFeesStatus: 'paid', academicWarnings: 0 });
          await insert('student_academic_profiles', new ObjectId(`c0260000000000000000030${i}`), { studentId, academicLevel: '1', semester: 'first', gpa: 0, completedCourses: [], failedCourses: [], lowGradeCourses: [], academicWarnings: 0, completedCreditHours: 0, isGraduatingThisYear: false, approvedICCourseCompletions: [] });
          await insert('course_registrations', new ObjectId(`c0260000000000000000040${i}`), { studentId, academicYear: '2026-2027', semester: 'first', courses: ['CTRL-DEMO'], status: 'approved' });
        }
      });
    } finally { await session.endSession(); }
    console.log('Seeded isolated control-demo: course CTRL-DEMO, year 2026-2027, first semester, 3 approved students. Existing tagged demo records were preserved.');
    console.log('Demo-only admin logins: control-submitter@example.test and control-reviewer@example.test. Students: 990001, 990002, 990003. Password for newly inserted demo accounts: ControlDemo123!');
    console.log('Run a separate local API against mongodb://127.0.0.1:27023/control-demo; do not change a production connection.');
  } finally { await client.close(); }
}
module.exports = { validateUri };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
