import {
  mkdtemp,
  readFile,
  writeFile,
  mkdir,
  access,
  truncate,
  lstat,
  rm,
} from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import {
  COURSE_BOOK_MAX_BYTES,
  COURSE_MATERIAL_MAX_BYTES,
} from '@student-portal/shared';
import { MaterialStorageService } from './material-storage.service';
import { publicMaterialResponse } from './material-response';
import express from 'express';
import request from 'supertest';

describe('private teaching file storage', () => {
  let root: string;
  let storage: MaterialStorageService;
  const pdf = Buffer.from('%PDF-1.7\nprivate course content');
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'portal-material-test-'));
    storage = new MaterialStorageService({
      get: (key: string) => (key === 'MATERIALS_ROOT' ? root : undefined),
    } as ConfigService);
    await storage.initialize();
    jest.spyOn(storage, 'checkCapacity').mockResolvedValue();
  });
  afterEach(async () => {
    if (!root.startsWith(join(tmpdir(), 'portal-material-test-')))
      throw new Error('Invalid test cleanup directory');
    await rm(root, { recursive: true, force: true });
  });

  async function upload(name = 'book.pdf', bytes = pdf) {
    const path = join(storage.temporaryDirectory, randomUUID());
    await writeFile(path, bytes);
    return {
      path,
      originalname: name,
      mimetype: 'application/pdf',
      size: bytes.length,
    };
  }

  it('promotes bytes atomically using a random key and checksum', async () => {
    const file = await upload('../../private.pdf');
    const result = await storage.save(file, true);
    expect(result.storageKey).toMatch(/^files\/[0-9a-f-]{36}$/);
    expect(await readFile(storage.pathFor(result.storageKey))).toEqual(pdf);
    expect(result.sha256).toBe(createHash('sha256').update(pdf).digest('hex'));
    await expect(access(file.path)).rejects.toThrow();
    if (process.platform !== 'win32')
      expect(
        (await lstat(storage.pathFor(result.storageKey))).mode & 0o777,
      ).toBe(0o640);
  });

  it.each([
    '../secret',
    'files/../../secret',
    '/etc/passwd',
    'files/not-a-uuid',
  ])('rejects invalid storage key %s', (key) => {
    expect(() => storage.pathFor(key)).toThrow('Invalid storage key');
  });

  it('rejects a forged PDF and unsupported extension', async () => {
    await expect(
      storage.save(
        await upload('book.pdf', Buffer.from('<script>bad</script>')),
        true,
      ),
    ).rejects.toThrow('content');
    await expect(storage.save(await upload('book.exe'), false)).rejects.toThrow(
      'Unsupported',
    );
  });

  it('rejects a renamed ZIP presented as an Office document', async () => {
    await expect(
      storage.save(
        await upload('book.docx', Buffer.from('PK\x03\x04arbitrary content')),
        false,
      ),
    ).rejects.toThrow('Office');
  });

  it.each([
    [true, COURSE_BOOK_MAX_BYTES],
    [false, COURSE_MATERIAL_MAX_BYTES],
  ])('enforces the exact size boundary (book=%s)', async (book, maximum) => {
    const file = await upload();
    await truncate(file.path, maximum + 1);
    await expect(storage.save(file, book)).rejects.toThrow('size');
    await truncate(file.path, maximum);
    expect((await storage.save(file, book)).size).toBe(maximum);
  });

  it('fails closed during maintenance and releases writer leases', async () => {
    const release = await storage.beginMutation();
    await release();
    await mkdir(join(root, '.maintenance'));
    await expect(storage.beginMutation()).rejects.toThrow('maintenance');
  });

  it('rejects a full disk without promoting the upload', async () => {
    jest
      .spyOn(storage, 'checkCapacity')
      .mockRejectedValue(new Error('Disk full'));
    const file = await upload();
    await expect(storage.save(file, true)).rejects.toThrow('Disk full');
    expect(await readFile(file.path)).toEqual(pdf);
  });

  it('cleans temporary failures without deleting paths outside the temporary directory', async () => {
    const file = await upload();
    const outside = join(root, 'retained.pdf');
    await writeFile(outside, pdf);
    await storage.discardTemporary(file.path);
    await storage.discardTemporary(outside);
    await expect(access(file.path)).rejects.toThrow();
    expect(await readFile(outside)).toEqual(pdf);
  });

  it('authorizes through an internal Nginx URI and never exposes a physical path', async () => {
    const result = await storage.save(await upload(), true);
    const nginx = new MaterialStorageService({
      get: (key: string) => (key === 'MATERIALS_ROOT' ? root : 'nginx'),
    } as ConfigService);
    const res = { setHeader: jest.fn(), end: jest.fn() };
    await nginx.deliver(result, res as never, true);
    expect(res.setHeader).toHaveBeenCalledWith(
      'X-Accel-Redirect',
      `/_private-materials/${result.storageKey}`,
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'private, no-store',
    );
  });

  it('returns a controlled error when a file is missing', async () => {
    const result = await storage.save(await upload(), true);
    await storage.removeUncommitted(result);
    await expect(storage.deliver(result, {} as never)).rejects.toThrow(
      'missing',
    );
  });

  it('streams full files, byte ranges and HEAD responses without buffering the file', async () => {
    const result = await storage.save(await upload(), true);
    const app = express();
    app.get('/file', (_req, res, next) => {
      void storage.deliver(result, res, true).catch(next);
    });
    const full = await request(app).get('/file').expect(200);
    expect(full.body).toEqual(pdf);
    const partial = await request(app)
      .get('/file')
      .set('Range', 'bytes=0-4')
      .expect(206);
    expect(partial.body).toEqual(Buffer.from('%PDF-'));
    expect(partial.headers['content-range']).toBe(`bytes 0-4/${pdf.length}`);
    const suffix = await request(app)
      .get('/file')
      .set('Range', 'bytes=-7')
      .expect(206);
    expect(suffix.body).toEqual(pdf.subarray(-7));
    await request(app).get('/file').set('Range', 'bytes=999-').expect(416);
    await request(app).get('/file').set('Range', 'bytes=0-1,4-5').expect(416);
    const head = await request(app).head('/file').expect(200);
    expect(head.headers['content-length']).toBe(String(pdf.length));
    expect(head.text).toBeUndefined();
  });

  it('redacts new storage references and legacy Base64 from nested responses', () => {
    const result = publicMaterialResponse({
      items: [
        {
          _id: 'course',
          syllabusPdfUrl: 'data:application/pdf;base64,SECRET',
          syllabusPdfData: 'SECRET',
          syllabusFile: { storageKey: 'SECRET' },
          legacyMaterialSource: { base64: 'SECRET' },
        },
      ],
      materials: [
        {
          _id: 'material',
          courseId: 'course',
          type: 'lecture',
          fileUrl: 'https://public.example/book',
          storedFile: { storageKey: 'SECRET' },
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('SECRET');
    expect(JSON.stringify(result)).not.toContain('public.example');
    expect(JSON.stringify(result)).toContain(
      '/api/courses/course/syllabus/download',
    );
    expect(JSON.stringify(result)).toContain(
      '/api/courses/materials/material/download',
    );
  });
});
