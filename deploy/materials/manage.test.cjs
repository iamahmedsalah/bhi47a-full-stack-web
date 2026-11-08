const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { createHash, randomUUID } = require('node:crypto');
const { allowedLegacyUrl, verifyReference, downloadLegacy, cloudinaryPublicId } = require('./manage.cjs');

test('Cloudinary retirement identifies only the configured original raw asset', () => {
  assert.equal(cloudinaryPublicId('https://res.cloudinary.com/demo/raw/upload/v123/course-materials/book.pdf', 'demo'), 'course-materials/book.pdf');
  assert.throws(() => cloudinaryPublicId('https://res.cloudinary.com/other/raw/upload/v123/book.pdf', 'demo'));
  assert.throws(() => cloudinaryPublicId('https://res.cloudinary.com/demo/image/upload/v123/book.jpg', 'demo'));
});

test('legacy migration rejects foreign origins, credentials and insecure URLs', () => {
  assert.equal(allowedLegacyUrl('https://res.cloudinary.com/demo/raw/upload/book.pdf').hostname, 'res.cloudinary.com');
  for (const value of ['http://res.cloudinary.com/book', 'https://res.cloudinary.com.evil.test/book', 'https://user:secret@res.cloudinary.com/book', 'http://127.0.0.1/admin', 'file:///etc/passwd']) {
    assert.throws(() => allowedLegacyUrl(value));
  }
});

test('restored files must match path, size and checksum', async () => {
  const root = await fs.mkdtemp(join(tmpdir(), 'material-verify-test-'));
  try {
    await fs.mkdir(join(root, 'files'));
    const storageKey = `files/${randomUUID()}`;
    const bytes = Buffer.from('%PDF-1.7\nrestored content');
    await fs.writeFile(join(root, storageKey), bytes);
    const ref = { storageKey, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
    await verifyReference(ref, root);
    await assert.rejects(verifyReference({ ...ref, storageKey: '../secret' }, root));
    await assert.rejects(verifyReference({ ...ref, size: bytes.length + 1 }, root));
    await fs.writeFile(join(root, storageKey), Buffer.alloc(bytes.length));
    await assert.rejects(verifyReference(ref, root));
  } finally {
    assert.ok(root.startsWith(join(tmpdir(), 'material-verify-test-')));
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('Base64 migration preserves bytes and enforces bounds without fetching a URL', async () => {
  const root = await fs.mkdtemp(join(tmpdir(), 'material-migrate-test-'));
  try {
    const bytes = Buffer.from('%PDF-1.7\nlegacy content');
    const source = `data:application/pdf;base64,${bytes.toString('base64')}`;
    await downloadLegacy(source, join(root, 'copy'), bytes.length);
    assert.deepEqual(await fs.readFile(join(root, 'copy')), bytes);
    await assert.rejects(downloadLegacy(source, join(root, 'oversized'), 1));
    await assert.rejects(downloadLegacy('data:application/pdf;base64,!!!!', join(root, 'invalid'), 100));
  } finally {
    assert.ok(root.startsWith(join(tmpdir(), 'material-migrate-test-')));
    await fs.rm(root, { recursive: true, force: true });
  }
});
