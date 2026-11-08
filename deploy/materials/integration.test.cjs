// Requires a built API and isolated localhost MongoDB. Never connects to Atlas.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { join } = require('node:path');
const { randomUUID } = require('node:crypto');
const { promisify } = require('node:util');
const execFile = promisify(require('node:child_process').execFile);
const { createRequire } = require('node:module');
const apiRequire = createRequire(join(__dirname, '../../apps/api/package.json'));
const { MongoClient, ObjectId } = apiRequire('mongodb');

test('legacy migration, retry, snapshot, retention and isolated restore', { timeout: 120000 }, async () => {
  const base = new URL(process.env.MATERIALS_TEST_MONGODB_URI || 'mongodb://127.0.0.1:27019/materials-storage-test');
  assert.equal(base.protocol, 'mongodb:');
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname));
  assert.equal(base.username, ''); assert.equal(base.password, ''); assert.equal(base.search, '');
  assert.equal(base.pathname, '/materials-storage-test');
  const database = `materials-storage-${randomUUID()}-test`;
  const restoreDatabase = `materials-restore-${randomUUID()}`;
  const source = new URL(base); source.pathname = `/${database}`;
  const restore = new URL(base); restore.pathname = `/${restoreDatabase}`;
  const client = new MongoClient(source.toString(), { serverSelectionTimeoutMS: 3000 });
  const scratch = join(__dirname, '../../outputs');
  await fs.mkdir(scratch, { recursive: true });
  const root = await fs.mkdtemp(join(scratch, 'materials-integration-'));
  const storageRoot = join(root, 'storage');
  const backup = join(root, 'backup');
  const env = { ...process.env, MONGODB_URI: source.toString(), MATERIALS_ROOT: storageRoot, MATERIALS_RESTORE_TEST_URI: restore.toString() };
  const run = (args, extra = {}) => execFile(process.execPath, [join(__dirname, 'manage.cjs'), ...args], { env: { ...env, ...extra }, timeout: 60000 });
  try {
    await client.connect();
    const db = client.db(database);
    const book = Buffer.from('%PDF-1.7\nlegacy book');
    const lecture = Buffer.from('%PDF-1.7\nlegacy lecture');
    const courseId = new ObjectId();
    const materialId = new ObjectId();
    await db.collection('courses').insertOne({ _id: courseId, code: 'TEST101', syllabusPdfName: 'book.pdf', syllabusPdfData: book.toString('base64') });
    await db.collection('course_materials').insertOne({ _id: materialId, courseId, fileName: 'lecture.pdf', type: 'lecture', isPublished: true, fileUrl: `data:application/pdf;base64,${lecture.toString('base64')}` });
    await run(['migrate']);
    assert.equal((await db.collection('courses').findOne({ _id: courseId })).syllabusFile, undefined);
    await run(['migrate', '--apply']);
    const migrated = await db.collection('courses').findOne({ _id: courseId });
    assert.ok(migrated.syllabusFile);
    assert.equal(migrated.code, 'TEST101');
    assert.equal(migrated.legacyMaterialSource.base64, book.toString('base64'));
    assert.deepEqual(await fs.readFile(join(storageRoot, migrated.syllabusFile.storageKey)), book);
    await run(['migrate', '--apply']);
    assert.equal((await fs.readdir(join(storageRoot, 'files'))).length, 2);
    await run(['snapshot', backup]);
    await fs.cp(join(storageRoot, 'files'), join(backup, 'files'), { recursive: true });
    await run(['verify-backup', backup]);
    await run(['restore-drill', backup]);
    assert.equal(await client.db(restoreDatabase).collection('courses').countDocuments(), 1);
    assert.equal(await client.db(restoreDatabase).collection('course_materials').countDocuments(), 1);
    await assert.rejects(run(['restore-drill', backup])); // Never overwrite a populated restore target.
    await fs.writeFile(join(storageRoot, '.backup-success.json'), JSON.stringify({ completedAt: new Date().toISOString() }));
    await db.collection('course_materials').deleteOne({ _id: materialId });
    await run(['reconcile', '--apply']);
    assert.equal((await fs.readdir(join(storageRoot, 'files'))).length, 2); // Retain a freshly orphaned file.
    const orphan = (await fs.readdir(join(storageRoot, '.orphaned')))[0];
    await fs.utimes(join(storageRoot, '.orphaned', orphan), new Date(0), new Date(0));
    await run(['reconcile', '--apply']);
    assert.equal((await fs.readdir(join(storageRoot, 'files'))).length, 1);
    const original = await fs.readFile(join(backup, migrated.syllabusFile.storageKey));
    await fs.writeFile(join(backup, migrated.syllabusFile.storageKey), Buffer.alloc(original.length));
    await assert.rejects(run(['verify-backup', backup]));
  } finally {
    // Only the two unique databases created above can be dropped by this test.
    assert.match(database, /^materials-storage-[0-9a-f-]+-test$/);
    assert.match(restoreDatabase, /^materials-restore-[0-9a-f-]+$/);
    await client.db(database).dropDatabase().catch(() => {});
    await client.db(restoreDatabase).dropDatabase().catch(() => {});
    await client.close();
    assert.ok(root.startsWith(join(scratch, 'materials-integration-')));
    await fs.rm(root, { recursive: true, force: true });
  }
});
