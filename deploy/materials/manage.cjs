#!/usr/bin/env node
'use strict';
// Runs against the API's installed dependencies, locally or inside the API image.
const fs = require('node:fs/promises');
const { existsSync, createReadStream, createWriteStream } = require('node:fs');
const { resolve, join } = require('node:path');
const { createRequire } = require('node:module');
const { createHash, randomUUID } = require('node:crypto');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const packageRoot = resolve(__dirname, '../..');
const apiRoot = existsSync(join(packageRoot, 'apps/api/package.json')) ? join(packageRoot, 'apps/api') : packageRoot;
const apiRequire = createRequire(join(apiRoot, 'package.json'));
const mongoose = apiRequire('mongoose');
const EJSON = mongoose.mongo.BSON.EJSON;
const root = resolve(process.env.MATERIALS_ROOT || './var/materials');
const keyPattern = /^files\/[0-9a-f-]{36}$/;
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function lock(action) {
  await fs.mkdir(root, { recursive: true });
  const gate = join(root, '.maintenance');
  await fs.mkdir(gate); // Fail closed if another operation or unresolved crash owns the gate.
  try {
    const deadline = Date.now() + 10 * 60 * 1000;
    while ((await fs.readdir(join(root, '.writers')).catch((error) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    })).length) {
      if (Date.now() > deadline) throw new Error('Active or stale writers remain; stop writes and inspect leases before retrying');
      await sleep(500);
    }
    return await action();
  } finally { await fs.rmdir(gate); }
}

async function digest(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function verifyReference(reference, base = root) {
  if (!keyPattern.test(reference.storageKey)) throw new Error('Invalid storage key in manifest');
  const path = join(base, reference.storageKey);
  const info = await fs.lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || await fs.realpath(path) !== join(await fs.realpath(base), reference.storageKey) || info.size !== reference.size || await digest(path) !== reference.sha256) throw new Error('Material integrity check failed');
}

function cloudinaryPublicId(value, cloudName) {
  const url = allowedLegacyUrl(value);
  const prefix = `/${cloudName}/raw/upload/`;
  if (url.origin !== 'https://res.cloudinary.com' || !url.pathname.startsWith(prefix)) throw new Error('Cannot identify the original raw asset safely');
  const id = decodeURIComponent(url.pathname.slice(prefix.length).replace(/^v\d+\//, ''));
  if (!id || id.includes('..') || /[\r\n?&#]/.test(id)) throw new Error('Invalid Cloudinary public ID');
  return id;
}

async function retireCloudinary(db, apply) {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  if (!cloud || !/^[a-zA-Z0-9_-]+$/.test(cloud)) throw new Error('Cloudinary cloud name required');
  if (apply && (!process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET)) throw new Error('Cloudinary credentials required');
  const covers = await db.collection('courses').find({ coverImageUrl: { $type: 'string' } }, { projection: { coverImageUrl: 1 } }).toArray();
  let candidates = 0;
  let deleted = 0;
  let skipped = 0;
  for (const [collection, field] of [['courses', 'syllabusFile'], ['course_materials', 'storedFile']]) {
    for await (const row of db.collection(collection).find({ 'legacyMaterialSource.migratedAt': { $lte: new Date(Date.now() - 30 * 86400000) }, 'legacyMaterialSource.cloudinaryDeletedAt': { $exists: false }, [field]: { $ne: null } })) {
      const source = row.legacyMaterialSource.source;
      if (!source || source.startsWith('data:')) continue;
      let publicId;
      try { publicId = cloudinaryPublicId(source, cloud); } catch { skipped++; continue; }
      const baseId = publicId.replace(/\.[^/.]+$/, '');
      if (covers.some((row) => decodeURIComponent(row.coverImageUrl).includes(baseId))) { skipped++; continue; }
      // Do not retire an asset that another unmigrated record still uses.
      if (await db.collection('courses').countDocuments({ syllabusPdfUrl: source }) || await db.collection('course_materials').countDocuments({ fileUrl: source })) { skipped++; continue; }
      await verifyReference(row.legacyMaterialSource.storedFile || row[field]);
      candidates++;
      console.log(JSON.stringify({ candidate: { collection, id: String(row._id), publicId, resourceType: 'raw' } }));
      if (!apply) continue;
      const params = { invalidate: 'true', public_id: publicId, timestamp: String(Math.floor(Date.now() / 1000)), type: 'upload' };
      const signed = Object.entries(params).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('&');
      const signature = createHash('sha1').update(signed + process.env.CLOUDINARY_API_SECRET).digest('hex');
      const body = new URLSearchParams({ ...params, signature, api_key: process.env.CLOUDINARY_API_KEY });
      const response = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/raw/destroy`, { method: 'POST', body, redirect: 'error', signal: AbortSignal.timeout(60000) });
      if (!response.ok) throw new Error('Cloudinary retirement failed');
      const result = await response.json();
      if (!['ok', 'not found'].includes(result.result)) throw new Error('Cloudinary asset not retired');
      await db.collection(collection).updateOne({ _id: row._id }, { $set: { 'legacyMaterialSource.cloudinaryDeletedAt': new Date() } });
      deleted++;
    }
  }
  console.log(JSON.stringify({ candidates, deleted, skipped, applied: apply, note: 'CDN invalidation is asynchronous; verify old public links after propagation.' }));
}

function allowedLegacyUrl(value) {
  const url = new URL(value);
  const origins = (process.env.MATERIALS_LEGACY_ORIGINS || 'https://res.cloudinary.com').split(',').map((item) => item.trim());
  if (url.protocol !== 'https:' || url.username || url.password || !origins.includes(url.origin)) throw new Error('Legacy origin is not allowed');
  return url;
}

async function downloadLegacy(source, path, maxBytes) {
  let stream;
  if (source.startsWith('data:')) {
    const match = /^data:[^;,]+;base64,([A-Za-z0-9+/=\r\n]+)$/.exec(source);
    if (!match || match[1].length > Math.ceil(maxBytes / 3) * 4 + 4) throw new Error('Invalid or oversized legacy data');
    stream = Readable.from(Buffer.from(match[1], 'base64'));
  } else {
    const response = await fetch(allowedLegacyUrl(source), { redirect: 'error', signal: AbortSignal.timeout(600000) });
    if (!response.ok || !response.body) throw new Error('Legacy download failed');
    stream = Readable.fromWeb(response.body);
  }
  let bytes = 0;
  const bounded = async function* (input) {
    for await (const chunk of input) {
      bytes += chunk.length;
      if (bytes > maxBytes) throw new Error('Legacy file exceeds upload limit');
      yield chunk;
    }
  };
  await pipeline(stream, bounded, createWriteStream(path, { flags: 'wx', mode: 0o600 }));
}

const bookFilter = { $or: [{ 'syllabusFile.storageKey': { $type: 'string' } }, { syllabusPdfUrl: { $type: 'string', $ne: '' } }, { syllabusPdfData: { $type: 'string', $ne: '' } }] };

async function records(db, referencesOnly = false) {
  const books = await db.collection('courses').find(bookFilter, {
    projection: referencesOnly ? { syllabusFile: 1 } : { syllabusFile: 1, syllabusPdfUrl: 1, syllabusPdfName: 1, syllabusPdfData: 1, syllabusUpdatedAt: 1, legacyMaterialSource: 1 },
  }).toArray();
  const materials = await db.collection('course_materials').find({}, referencesOnly ? { projection: { storedFile: 1 } } : {}).toArray();
  return { books, materials };
}

function references(snapshot) {
  return [...snapshot.books.map((row) => row.syllabusFile), ...snapshot.materials.map((row) => row.storedFile)].filter(Boolean);
}

async function migrate(db, apply) {
  const { MaterialStorageService } = apiRequire(join(apiRoot, 'dist/modules/material-storage/material-storage.service.js'));
  const storage = new MaterialStorageService({ get: (name) => name === 'MATERIALS_ROOT' ? root : process.env[name] });
  const result = { migrated: 0, pending: 0, verified: 0, failed: 0 };
  for (const [book, collectionName] of [[true, 'courses'], [false, 'course_materials']]) {
    for await (const row of db.collection(collectionName).find(book ? bookFilter : {}).batchSize(1)) {
      const reference = book ? row.syllabusFile : row.storedFile;
      if (reference) { await verifyReference(reference); result.verified++; continue; }
      result.pending++;
      if (!apply) continue;
      const path = join(storage.temporaryDirectory, randomUUID());
      let stored;
      try {
        await storage.initialize();
        const source = book ? row.syllabusPdfData ? `data:application/pdf;base64,${row.syllabusPdfData}` : row.syllabusPdfUrl : row.fileUrl;
        await downloadLegacy(source, path, book ? 100 * 1024 * 1024 : 25 * 1024 * 1024);
        stored = await storage.save({ path, originalname: book ? row.syllabusPdfName || 'book.pdf' : row.fileName, size: (await fs.stat(path)).size, mimetype: book ? 'application/pdf' : row.mimeType }, book);
        await verifyReference(stored);
        const fields = book ? { syllabusFile: stored, syllabusPdfUrl: `/api/courses/${row._id}/syllabus/download` } : { storedFile: stored, fileUrl: `/api/courses/materials/${row._id}/download` };
        fields.legacyMaterialSource = { migratedAt: new Date(), storedFile: stored, source: book ? row.syllabusPdfData ? undefined : row.syllabusPdfUrl : row.fileUrl, base64: book ? row.syllabusPdfData : undefined };
        const collection = db.collection(book ? 'courses' : 'course_materials');
        // Keep source bytes/URLs for the retirement window. Public responses redact them.
        const update = await collection.updateOne({ _id: row._id, [book ? 'syllabusFile' : 'storedFile']: null }, { $set: fields, ...(book ? { $unset: { syllabusPdfData: '' } } : {}) });
        if (!update.modifiedCount) throw new Error('Record changed during migration');
        result.migrated++;
      } catch {
        // A write may commit after its acknowledgement is lost. Retain promoted
        // bytes until reconciliation can compare stable references after the grace period.
        result.failed++;
        console.error(`Migration failed for ${book ? 'book' : 'material'} ${row._id}; source retained`);
      } finally { await storage.discardTemporary(path); }
    }
  }
  console.log(JSON.stringify(result));
  if (result.failed) process.exitCode = 1;
}

async function snapshot(db, output) {
  const data = await records(db);
  const refs = references(data);
  for (const ref of refs) if (!keyPattern.test(ref.storageKey)) throw new Error('Invalid storage key');
  const manifest = { version: 1, createdAt: new Date(), ...data, references: refs };
  await fs.mkdir(output, { recursive: true, mode: 0o700 });
  await fs.writeFile(join(output, 'manifest.json'), EJSON.stringify(manifest), { flag: 'wx', mode: 0o600 });
  const fileKeys = [...new Set(refs.map((ref) => ref.storageKey))];
  await fs.writeFile(join(output, 'files.list'), fileKeys.length ? fileKeys.join('\n') + '\n' : '', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ files: refs.length, legacyRecords: data.books.filter((r) => !r.syllabusFile).length + data.materials.filter((r) => !r.storedFile).length }));
}

async function reconcile(db, apply) {
  const refs = references(await records(db, true));
  const live = new Set(refs.map((ref) => ref.storageKey));
  let missing = 0;
  for (const ref of refs) { try { await verifyReference(ref); } catch { missing++; } }
  const grace = 35 * 86400000;
  let orphans = 0;
  let removed = 0;
  const lastBackup = await fs.readFile(join(root, '.backup-success.json'), 'utf8').then(JSON.parse).catch(() => null);
  const safeBackup = lastBackup && Date.now() - Date.parse(lastBackup.completedAt) < 26 * 3600000;
  for (const name of await fs.readdir(join(root, 'files')).catch((error) => { if (error.code === 'ENOENT') return []; throw error; })) {
    const key = `files/${name}`;
    if (!keyPattern.test(key) || live.has(key)) continue;
    orphans++;
    // Age begins when the orphan is observed, NOT the upload date: old books can be replaced today.
    const marker = join(root, '.orphaned', name);
    await fs.mkdir(join(root, '.orphaned'), { recursive: true, mode: 0o700 });
    let observed = await fs.stat(marker).catch(() => null);
    if (!observed && apply) { await fs.writeFile(marker, '', { flag: 'wx', mode: 0o600 }); observed = await fs.stat(marker); }
    if (apply && safeBackup && !missing && observed && Date.now() - observed.mtimeMs >= grace) {
      await fs.unlink(join(root, key)); await fs.unlink(marker); removed++;
    }
  }
  if (apply) {
    for (const name of await fs.readdir(join(root, '.orphaned')).catch(() => [])) {
      if (live.has(`files/${name}`) && keyPattern.test(`files/${name}`)) await fs.unlink(join(root, '.orphaned', name));
    }
    for (const name of await fs.readdir(join(root, '.tmp')).catch(() => [])) {
      if (!/^[a-zA-Z0-9-]+$/.test(name)) continue;
      const path = join(root, '.tmp', name);
      if (Date.now() - (await fs.lstat(path)).mtimeMs > 86400000) await fs.unlink(path);
    }
  }
  console.log(JSON.stringify({ live: live.size, missing, orphans, removed, backupFresh: Boolean(safeBackup) }));
  if (missing || !safeBackup) process.exitCode = 1;
}

async function verifyBackup(directory) {
  const manifest = EJSON.parse(await fs.readFile(join(directory, 'manifest.json'), 'utf8'));
  if (manifest.version !== 1 || !Array.isArray(manifest.references)) throw new Error('Unsupported backup manifest');
  for (const ref of manifest.references) await verifyReference(ref, directory);
  console.log(JSON.stringify({ verified: manifest.references.length }));
  return manifest;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const apply = args.includes('--apply');
  const output = args.find((arg) => !arg.startsWith('--'));
  if (command === 'verify-backup') { if (!output) throw new Error('Backup directory required'); await verifyBackup(resolve(output)); return; }
  if (!['inventory', 'migrate', 'snapshot', 'reconcile', 'restore-drill', 'retire-legacy', 'retire-cloudinary'].includes(command)) throw new Error('Use inventory, migrate [--apply], snapshot DIRECTORY, reconcile [--apply], verify-backup DIRECTORY, restore-drill DIRECTORY, retire-legacy [--apply], or retire-cloudinary [--apply]');
  const uri = command === 'restore-drill' ? process.env.MATERIALS_RESTORE_TEST_URI : process.env.MONGODB_URI;
  if (!uri) throw new Error('Required database URI is missing');
  if (command === 'restore-drill') {
    if (!output || uri === process.env.MONGODB_URI || !/^materials-restore-[a-z0-9-]+$/.test(new URL(uri.replace('mongodb+srv:', 'https:').replace('mongodb:', 'http:')).pathname.slice(1))) throw new Error('Restore requires a separate materials-restore-* database');
  }
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  try {
    if (command === 'inventory') {
      const data = await records(db, true);
      console.log(JSON.stringify({ books: data.books.length, materials: data.materials.length, vpsFiles: references(data).length }));
    } else if (command === 'migrate') {
      if (apply) await lock(() => migrate(db, true)); else await migrate(db, false);
    } else if (command === 'snapshot') {
      if (!output) throw new Error('Output directory required');
      await lock(() => snapshot(db, resolve(output)));
      // Files are immutable and retained after replacement. Hash outside the write pause.
      const captured = EJSON.parse(await fs.readFile(join(resolve(output), 'manifest.json'), 'utf8'));
      for (const ref of captured.references) await verifyReference(ref);
    } else if (command === 'reconcile') {
      if (apply) await lock(() => reconcile(db, true)); else await reconcile(db, false);
    } else if (command === 'restore-drill') {
      if ((await db.listCollections().toArray()).length) throw new Error('Restore database must be empty');
      const data = await verifyBackup(resolve(output));
      if (data.books.length) await db.collection('courses').insertMany(data.books);
      if (data.materials.length) await db.collection('course_materials').insertMany(data.materials);
      console.log('Isolated metadata restored. Start an isolated API with restored files and auth fixtures to validate authorized downloads.');
    } else if (command === 'retire-legacy' || command === 'retire-cloudinary') {
      const verified = Date.parse(process.env.MATERIALS_RESTORE_VERIFIED_AT);
      if (!Number.isFinite(verified) || verified > Date.now() || Date.now() - verified > 35 * 86400000) throw new Error('Recent successful restore drill required');
      const backup = await fs.readFile(join(root, '.backup-success.json'), 'utf8').then(JSON.parse);
      if (!Number.isFinite(Date.parse(backup.completedAt)) || Date.now() - Date.parse(backup.completedAt) > 26 * 3600000) throw new Error('Fresh off-server backup required');
      if (command === 'retire-cloudinary') { await lock(() => retireCloudinary(db, apply)); return; }
      await lock(async () => {
        let eligible = 0;
        for (const [collection, field] of [['courses', 'syllabusFile'], ['course_materials', 'storedFile']]) {
          for await (const row of db.collection(collection).find({ 'legacyMaterialSource.migratedAt': { $lte: new Date(Date.now() - 30 * 86400000) }, [field]: { $exists: true } })) {
            await verifyReference(row.legacyMaterialSource.storedFile || row[field]); eligible++;
            // Cloudinary deletion requires explicit provider credentials/operator review; retain its source reference.
            if (apply) {
              const unset = { syllabusPdfData: '', 'legacyMaterialSource.base64': '' };
              if (row.legacyMaterialSource.source?.startsWith('data:')) unset['legacyMaterialSource.source'] = '';
              await db.collection(collection).updateOne({ _id: row._id }, { $unset: unset });
            }
          }
        }
        console.log(JSON.stringify({ eligible, applied: apply, cloudinaryDeletion: 'Use retirement source references to delete assets in Cloudinary; public links remain active until deletion.' }));
      });
    }
  } finally { await mongoose.disconnect(); }
}

if (require.main === module) main().catch((error) => { console.error(`Materials operation failed: ${error.code || error.name || 'Error'}. Check configuration and storage; no credentials are printed.`); process.exitCode = 1; });
module.exports = { allowedLegacyUrl, verifyReference, keyPattern, downloadLegacy, cloudinaryPublicId };
