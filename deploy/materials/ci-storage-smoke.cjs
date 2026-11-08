// Run only inside isolated CI containers with an ephemeral materials volume.
const fs = require('node:fs/promises');
const { resolve, join } = require('node:path');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
const { MaterialStorageService } = require('../../dist/modules/material-storage/material-storage.service.js');
const { verifyReference } = require('./manage.cjs');
async function main() {
  assert.equal(process.env.MATERIALS_DELIVERY, 'stream', 'CI streaming mode required');
  assert.match(process.env.MONGODB_URI || '', /\/student-portal-ci$/);
  const root = resolve(process.env.MATERIALS_ROOT);
  const storage = new MaterialStorageService({ get: (key) => key === 'MATERIALS_ROOT' ? root : undefined });
  const marker = join(root, '.ci-reference.json');
  if (process.argv[2] === 'write') {
    await storage.initialize();
    const path = join(storage.temporaryDirectory, randomUUID());
    const content = Buffer.from('%PDF-1.7\nCI persistence fixture');
    await fs.writeFile(path, content);
    const ref = await storage.save({ path, originalname: 'ci-book.pdf', size: content.length, mimetype: 'application/pdf' }, true);
    await fs.writeFile(marker, JSON.stringify(ref));
  } else {
    await verifyReference(JSON.parse(await fs.readFile(marker, 'utf8')), root);
  }
  console.log('Private materials persistence check passed');
}
main().catch(() => { console.error('Private materials persistence check failed'); process.exitCode = 1; });
