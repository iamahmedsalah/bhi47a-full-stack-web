import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  access,
  chmod,
  lstat,
  mkdir,
  open,
  realpath,
  rename,
  statfs,
  unlink,
} from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Response } from 'express';
import {
  COURSE_BOOK_MAX_BYTES,
  COURSE_MATERIAL_EXTENSIONS,
  COURSE_MATERIAL_MAX_BYTES,
  type MaterialFileReference,
} from '@student-portal/shared';

export interface MaterialUpload {
  path: string;
  originalname: string;
  size: number;
  mimetype: string;
}

@Injectable()
export class MaterialStorageService implements OnModuleInit {
  private readonly logger = new Logger(MaterialStorageService.name);
  readonly root: string;
  readonly temporaryDirectory: string;

  constructor(private readonly config: ConfigService) {
    this.root = resolve(
      config.get<string>('MATERIALS_ROOT') || './var/materials',
    );
    this.temporaryDirectory = join(this.root, '.tmp');
  }

  async onModuleInit() {
    if (
      this.config.get<string>('NODE_ENV') === 'production' &&
      !this.config.get<string>('MATERIALS_ROOT')
    ) {
      throw new Error(
        'Production requires an explicitly configured persistent MATERIALS_ROOT',
      );
    }
    await this.initialize();
    for (const directory of [
      this.temporaryDirectory,
      join(this.root, 'files'),
      join(this.root, '.writers'),
    ]) {
      if ((await lstat(directory)).isSymbolicLink())
        throw new Error('Storage subdirectories cannot be symbolic links');
      await access(directory, 2); // W_OK; execute as the actual API runtime UID.
    }
  }

  async initialize() {
    await mkdir(this.temporaryDirectory, { recursive: true, mode: 0o700 });
    await mkdir(join(this.root, '.writers'), { recursive: true, mode: 0o700 });
    await mkdir(join(this.root, 'files'), { recursive: true, mode: 0o750 });
  }

  async beginMutation(): Promise<() => Promise<void>> {
    await this.initialize();
    const maintenance = join(this.root, '.maintenance');
    const check = async () => {
      try {
        await access(maintenance);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw error;
      }
      throw new ServiceUnavailableException(
        'Materials maintenance in progress. Please retry shortly.',
      );
    };
    await check();
    const lease = join(this.root, '.writers', randomUUID());
    const handle = await open(lease, 'wx', 0o600);
    await handle.close();
    try {
      await check();
    } catch (error) {
      await unlink(lease);
      throw error;
    }
    return () => unlink(lease);
  }

  async checkCapacity() {
    await this.initialize();
    const disk = await statfs(this.root);
    const usage = 1 - disk.bavail / disk.blocks;
    if (usage >= 0.8)
      this.logger.warn(`Materials disk usage ${Math.round(usage * 100)}%`);
    if (usage >= 0.9 || disk.bavail * disk.bsize < COURSE_BOOK_MAX_BYTES * 2) {
      throw new ServiceUnavailableException(
        'Material storage is nearly full. Contact the administrator.',
      );
    }
  }

  pathFor(key: string) {
    if (!/^files\/[0-9a-f-]{36}$/.test(key))
      throw new BadRequestException('Invalid storage key');
    return join(this.root, key);
  }

  async discardTemporary(path?: string) {
    if (!path || resolve(path, '..') !== resolve(this.temporaryDirectory))
      return;
    await unlink(path).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT')
        this.logger.error('Failed to remove temporary material');
    });
  }

  async save(
    file: MaterialUpload,
    book: boolean,
  ): Promise<MaterialFileReference> {
    await this.checkCapacity();
    if (resolve(file.path, '..') !== resolve(this.temporaryDirectory))
      throw new BadRequestException('Invalid temporary upload');
    const info = await lstat(file.path);
    if (
      !info.isFile() ||
      info.isSymbolicLink() ||
      info.size === 0 ||
      info.size > (book ? COURSE_BOOK_MAX_BYTES : COURSE_MATERIAL_MAX_BYTES)
    ) {
      throw new BadRequestException('Invalid file size');
    }
    const extension = extname(file.originalname).slice(1).toLowerCase();
    if (
      !(COURSE_MATERIAL_EXTENSIONS as readonly string[]).includes(extension) ||
      (book && extension !== 'pdf')
    ) {
      throw new BadRequestException('Unsupported file type');
    }
    const handle = await open(file.path, 'r');
    const header = Buffer.alloc(8192);
    try {
      await handle.read(header, 0, header.length, 0);
    } finally {
      await handle.close();
    }
    const pdf = header.subarray(0, 5).toString() === '%PDF-';
    const zip = header.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 3, 4]));
    const ole = header
      .subarray(0, 8)
      .equals(Buffer.from('d0cf11e0a1b11ae1', 'hex'));
    const rar =
      header.subarray(0, 7).equals(Buffer.from('526172211a0700', 'hex')) ||
      header.subarray(0, 8).equals(Buffer.from('526172211a070100', 'hex'));
    if (
      (extension === 'pdf' && !pdf) ||
      (['doc', 'xls', 'ppt'].includes(extension) && !ole) ||
      (['docx', 'xlsx', 'pptx', 'zip'].includes(extension) && !zip) ||
      (extension === 'rar' && !rar)
    ) {
      throw new BadRequestException(
        'File content does not match its extension',
      );
    }
    // OOXML is ZIP-based. Check the bounded central directory without decompressing user content.
    if (['docx', 'xlsx', 'pptx'].includes(extension)) {
      const tail = Buffer.alloc(Math.min(info.size, 1024 * 1024));
      const fd = await open(file.path, 'r');
      try {
        await fd.read(tail, 0, tail.length, info.size - tail.length);
      } finally {
        await fd.close();
      }
      const end = tail.lastIndexOf(Buffer.from('504b0506', 'hex'));
      if (
        end < 0 ||
        end + 22 > tail.length ||
        end + 22 + tail.readUInt16LE(end + 20) !== tail.length
      ) {
        throw new BadRequestException('Invalid Office document');
      }
      const count = tail.readUInt16LE(end + 10);
      const directorySize = tail.readUInt32LE(end + 12);
      const directoryOffset =
        tail.readUInt32LE(end + 16) - (info.size - tail.length);
      if (
        tail.readUInt16LE(end + 4) !== 0 ||
        tail.readUInt16LE(end + 6) !== 0 ||
        count > 10000 ||
        directoryOffset < 0 ||
        directoryOffset + directorySize !== end
      ) {
        throw new BadRequestException('Invalid Office document');
      }
      const names = new Set<string>();
      let cursor = directoryOffset;
      for (let index = 0; index < count; index++) {
        if (cursor + 46 > end || tail.readUInt32LE(cursor) !== 0x02014b50)
          throw new BadRequestException('Invalid Office document');
        const nameLength = tail.readUInt16LE(cursor + 28);
        const next =
          cursor +
          46 +
          nameLength +
          tail.readUInt16LE(cursor + 30) +
          tail.readUInt16LE(cursor + 32);
        if (next > end)
          throw new BadRequestException('Invalid Office document');
        names.add(
          tail.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8'),
        );
        cursor = next;
      }
      if (cursor !== end)
        throw new BadRequestException('Invalid Office document');
      const marker =
        extension === 'docx'
          ? 'word/document.xml'
          : extension === 'xlsx'
            ? 'xl/workbook.xml'
            : 'ppt/presentation.xml';
      if (!names.has('[Content_Types].xml') || !names.has(marker))
        throw new BadRequestException('Invalid Office document');
    }
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(file.path)) hash.update(chunk);
    const storageKey = `files/${randomUUID()}`;
    await chmod(file.path, 0o640);
    await rename(file.path, this.pathFor(storageKey));
    const mimeTypes: Record<string, string> = {
      pdf: 'application/pdf',
      doc: 'application/msword',
      xls: 'application/vnd.ms-excel',
      ppt: 'application/vnd.ms-powerpoint',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      zip: 'application/zip',
      rar: 'application/vnd.rar',
    };
    let originalName = file.originalname;
    if (
      Array.from(originalName).every((letter) => letter.charCodeAt(0) <= 255)
    ) {
      const decoded = Buffer.from(originalName, 'latin1').toString('utf8');
      if (!decoded.includes('\uFFFD')) originalName = decoded;
    }
    return {
      storageProvider: 'vps',
      storageKey,
      originalName: originalName
        .replaceAll('\0', '_')
        .replace(/[\r\n/\\]/g, '_')
        .slice(0, 255),
      size: info.size,
      mimeType: mimeTypes[extension],
      sha256: hash.digest('hex'),
    };
  }

  async removeUncommitted(reference: MaterialFileReference) {
    await unlink(this.pathFor(reference.storageKey)).catch(() =>
      this.logger.error('Uncommitted material requires reconciliation'),
    );
  }

  async deliver(
    reference: MaterialFileReference,
    res: Response,
    inline = false,
  ) {
    const path = this.pathFor(reference.storageKey);
    const info = await lstat(path).catch(() => {
      this.logger.error('Referenced material file is missing');
      throw new NotFoundException(
        'Material file is missing. Contact the administrator.',
      );
    });
    if (
      !info.isFile() ||
      info.size !== reference.size ||
      info.isSymbolicLink() ||
      (await realpath(path)) !==
        join(await realpath(this.root), reference.storageKey)
    )
      throw new NotFoundException('Material file is unavailable');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', reference.mimeType);
    res.setHeader(
      'Content-Disposition',
      `${inline ? 'inline' : 'attachment'}; filename="material${inline ? '.pdf' : ''}"; filename*=UTF-8''${encodeURIComponent(reference.originalName).replace(/'/g, '%27')}`,
    );
    res.setHeader('Accept-Ranges', 'bytes');
    if (this.config.get<string>('MATERIALS_DELIVERY') === 'nginx') {
      res.setHeader(
        'X-Accel-Redirect',
        `/_private-materials/${reference.storageKey}`,
      );
      return res.end();
    }
    let start = 0;
    let end = info.size - 1;
    const range = res.req.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2]))
        return res
          .status(416)
          .set('Content-Range', `bytes */${info.size}`)
          .end();
      if (!match[1]) start = Math.max(0, info.size - Number(match[2]));
      else {
        start = Number(match[1]);
        if (match[2]) end = Math.min(end, Number(match[2]));
      }
      if (start > end || start >= info.size)
        return res
          .status(416)
          .set('Content-Range', `bytes */${info.size}`)
          .end();
      res
        .status(206)
        .setHeader('Content-Range', `bytes ${start}-${end}/${info.size}`);
    }
    res.setHeader('Content-Length', end - start + 1);
    if (res.req.method === 'HEAD') return res.end();
    await pipeline(createReadStream(path, { start, end }), res);
  }
}
