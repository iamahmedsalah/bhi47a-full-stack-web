import {
  Body,
  Controller,
  ForbiddenException,
  Post,
  UploadedFile,
  UseInterceptors,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as httpRequest, type Server } from 'node:http';
import request from 'supertest';
import {
  MaterialMutationInterceptor,
  MaterialUploadInterceptor,
} from './material-upload.interceptor';
import {
  MaterialStorageService,
  type MaterialUpload,
} from '../material-storage/material-storage.service';
import { CoursesService } from './courses.service';
import { CreateCourseMaterialDto } from './dto/course-material.dto';

@Controller('test-materials')
@UseInterceptors(MaterialMutationInterceptor)
class UploadFixtureController {
  constructor(private readonly storage: MaterialStorageService) {}
  @Post(':id')
  @UseInterceptors(MaterialUploadInterceptor(false))
  async upload(
    @UploadedFile() file: MaterialUpload,
    @Body() _dto: CreateCourseMaterialDto,
  ) {
    const reference = await this.storage.save(file, false);
    return { size: reference.size, mimeType: reference.mimeType };
  }
}

describe('disk multipart upload lifecycle', () => {
  let app: INestApplication;
  let root: string;
  const authorize = jest.fn().mockResolvedValue(undefined);
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'materials-http-test-'));
    const module = await Test.createTestingModule({
      controllers: [UploadFixtureController],
      providers: [
        MaterialStorageService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => (key === 'MATERIALS_ROOT' ? root : undefined),
          },
        },
        {
          provide: CoursesService,
          useValue: { authorizeMaterialUpload: authorize },
        },
      ],
    }).compile();
    // Capacity is tested separately; HTTP parsing tests must not depend on host disk usage.
    jest
      .spyOn(module.get(MaterialStorageService), 'checkCapacity')
      .mockResolvedValue();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.listen(0, '127.0.0.1');
  });
  afterAll(async () => {
    await app?.close();
    if (!root.startsWith(join(tmpdir(), 'materials-http-test-')))
      throw new Error('Invalid cleanup directory');
    await rm(root, { recursive: true, force: true });
  });

  it('accepts a streamed file with DTO fields and releases its lease', async () => {
    const pdf = Buffer.from('%PDF-1.7\nHTTP upload');
    const result = await request(app.getHttpServer())
      .post('/test-materials/course')
      .field('type', 'lecture')
      .field('title', 'Week 1')
      .attach('file', pdf, 'lecture.pdf')
      .expect(201);
    expect(result.body).toEqual({
      size: pdf.length,
      mimeType: 'application/pdf',
    });
    expect(await readdir(join(root, '.tmp'))).toEqual([]);
    expect(await readdir(join(root, '.writers'))).toEqual([]);
  });

  it('cleans parsed files when DTO validation fails', async () => {
    await request(app.getHttpServer())
      .post('/test-materials/course')
      .field('type', 'lecture')
      .field('title', 'Invalid week')
      .field('weekNumber', '21')
      .attach('file', Buffer.from('%PDF-1.7\ninvalid'), 'lecture.pdf')
      .expect(400);
    expect(await readdir(join(root, '.tmp'))).toEqual([]);
    expect(await readdir(join(root, '.writers'))).toEqual([]);
  });

  it('checks assignment before accepting the multipart file', async () => {
    authorize.mockRejectedValueOnce(new ForbiddenException('Unassigned'));
    await request(app.getHttpServer())
      .post('/test-materials/course')
      .field('type', 'lecture')
      .field('title', 'Denied')
      .attach('file', Buffer.from('%PDF-1.7\nrejected'), 'lecture.pdf')
      .expect(403);
    expect(await readdir(join(root, '.tmp'))).toEqual([]);
  });

  it('cleans an interrupted multipart upload and its writer lease', async () => {
    const address = (app.getHttpServer() as Server).address();
    if (!address || typeof address === 'string')
      throw new Error('Expected TCP test server');
    await new Promise<void>((done) => {
      const req = httpRequest({
        hostname: '127.0.0.1',
        port: address.port,
        path: '/test-materials/course',
        method: 'POST',
        headers: {
          'Content-Type': 'multipart/form-data; boundary=fixture-boundary',
          'Content-Length': '1000000',
        },
      });
      req.on('error', () => done());
      req.on('close', () => done());
      req.write(
        '--fixture-boundary\r\nContent-Disposition: form-data; name="file"; filename="partial.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.7\npartial bytes',
      );
      setTimeout(() => req.destroy(), 50);
    });
    await new Promise((done) => setTimeout(done, 150));
    for (
      let attempt = 0;
      attempt < 20 && (await readdir(join(root, '.writers'))).length;
      attempt++
    )
      await new Promise((done) => setTimeout(done, 50));
    expect(await readdir(join(root, '.tmp'))).toEqual([]);
    expect(await readdir(join(root, '.writers'))).toEqual([]);
  });
});
