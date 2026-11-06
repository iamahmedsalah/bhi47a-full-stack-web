// Read-only, aggregate-only inventory. Never connects to a production database.
const CORE = new Set(['coursework', 'midterm', 'final']);
const key = (g) => `${g.studentId}|${g.courseId}|${g.academicYear}|${g.semester}`;
const scope = (g) => `${g.courseId}|${g.academicYear}|${g.semester}|${g.examType ?? g.component}`;
function analyze({ grades = [], users = [], registrations = [], sheets = [] }) {
  const counts = { duplicateComponents: 0, missingStudents: 0, codeIdentityMismatches: 0, outsideApprovedRoster: 0, legacyFinalsNeedingClassification: 0, mixedTotalsAndComponents: 0, unapprovedPublishedControlMarks: 0, invalidCourseworkBreakdown: 0 };
  const students = new Map(users.map(u => [String(u._id), u]));
  const sheetByScope = new Map(sheets.map(s => [scope(s), s]));
  const seen = new Set(), attempts = new Map();
  for (const g of grades.filter(g => !g.cleared)) {
    const identity = `${key(g)}|${g.examType}`;
    if (seen.has(identity)) counts.duplicateComponents++;
    seen.add(identity);
    const student = students.get(String(g.studentId));
    if (!student) counts.missingStudents++;
    else if (student.studentCode !== g.studentCode) counts.codeIdentityMismatches++;
    if (CORE.has(g.examType) && !registrations.some(r => String(r.studentId) === String(g.studentId) && r.academicYear === g.academicYear && r.semester === g.semester && r.status === 'approved' && r.courses?.some(code => String(code).toUpperCase() === String(g.courseCode).toUpperCase()))) counts.outsideApprovedRoster++;
    if (g.examType === 'final' && !g.controlManaged) counts.legacyFinalsNeedingClassification++;
    const sheet = sheetByScope.get(scope(g));
    if (g.isPublished && (g.controlManaged || sheet) && (sheet?.workflowState !== 'APPROVED' || g.controlApprovedRev !== (g.rev ?? 0))) counts.unapprovedPublishedControlMarks++;
    if (g.examType === 'coursework' && ['present', 'withheld'].includes(g.status) && (!Number.isFinite(g.attendanceMark) || !Number.isFinite(g.quizzesMark) || Math.round((g.attendanceMark + g.quizzesMark) * 100) !== Math.round(g.grade * 100) || g.grade > 20 || g.attendanceMark < 0 || g.quizzesMark < 0)) counts.invalidCourseworkBreakdown++;
    const components = attempts.get(key(g)) || new Set(); components.add(g.examType); attempts.set(key(g), components);
  }
  for (const components of attempts.values()) if (components.has('total') && [...components].some(c => CORE.has(c))) counts.mixedTotalsAndComponents++;
  return { counts, scanned: { grades: grades.length, users: users.length, registrations: registrations.length, sheets: sheets.length }, guidance: 'Counts are review flags, not automatic migration decisions. Legacy final marks require human classification. No student identifiers or personal data are included.' };
}
async function main() {
  const uri = process.env.CONTROL_AUDIT_MONGODB_URI || 'mongodb://127.0.0.1:27019/student-portal-e2e';
  const url = new URL(uri);
  if (url.protocol !== 'mongodb:' || !['localhost', '127.0.0.1'].includes(url.hostname) || url.username || url.password || url.search || !/[-_](test|e2e)$/.test(url.pathname)) throw new Error('Audit runner accepts only credential-free isolated localhost test/e2e databases');
  const { MongoClient } = require('mongodb');
  const client = new MongoClient(uri, { maxPoolSize: 1, serverSelectionTimeoutMS: 3000 });
  try {
    await client.connect();
    const db = client.db(), values = {};
    for (const [name, projection] of Object.entries({ grades: { studentId: 1, studentCode: 1, courseId: 1, courseCode: 1, academicYear: 1, semester: 1, examType: 1, status: 1, grade: 1, attendanceMark: 1, quizzesMark: 1, isPublished: 1, controlManaged: 1, controlApprovedRev: 1, rev: 1, cleared: 1 }, users: { studentCode: 1 }, course_registrations: { studentId: 1, academicYear: 1, semester: 1, courses: 1, status: 1 }, control_sheets: { courseId: 1, academicYear: 1, semester: 1, component: 1, workflowState: 1 } })) values[name] = await db.collection(name).find({}, { projection }).limit(10001).toArray();
    console.log(JSON.stringify({ environment: 'isolated localhost', scannedAt: new Date().toISOString(), truncated: Object.values(values).some(rows => rows.length > 10000), ...analyze({ grades: values.grades, users: values.users, registrations: values.course_registrations, sheets: values.control_sheets }) }, null, 2));
  } finally { await client.close(); }
}
module.exports = { analyze };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
