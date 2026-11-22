import { Types } from 'mongoose';
import {
  RAG_INGEST_SYLLABUS_JOB,
  RAG_INGESTION_QUEUE,
  RagIngestionService,
} from './rag-ingestion.service';

function leanSelect<T>(value: T) {
  return {
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(value),
    }),
    lean: jest.fn().mockResolvedValue(value),
  };
}

describe('RagIngestionService', () => {
  const courseId = new Types.ObjectId().toHexString();
  const docId = new Types.ObjectId();

  function createFixture() {
    const documents = {
      findOne: jest.fn().mockReturnValue(leanSelect(null)),
      find: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      }),
      findOneAndUpdate: jest.fn().mockResolvedValue({ _id: docId }),
      updateOne: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    };

    const chunks = {
      countDocuments: jest.fn().mockResolvedValue(0),
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 2 }),
      insertMany: jest.fn().mockResolvedValue([]),
    };

    const activeCourse = {
      _id: new Types.ObjectId(courseId),
      code: 'BIS201',
      name: 'Database Systems',
      nameAr: 'نظم قواعد البيانات',
      nameEn: 'Database Systems',
      isActive: true,
      syllabusFile: {
        storageKey: 'files/11111111-2222-3333-4444-555555555555',
        sha256: 'sha256-v1',
        originalName: 'bis201.pdf',
      },
    };

    const courses = {
      findById: jest.fn().mockReturnValue(leanSelect(activeCourse)),
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue([activeCourse]),
          }),
        }),
      }),
    };

    const extractor = {
      extractFromFile: jest.fn().mockResolvedValue({
        ok: true,
        pageCount: 2,
        ocrUsed: false,
        pages: [
          {
            pageNumber: 1,
            text: 'توصيف مقرر نظم قواعد البيانات وأهداف المقرر لطلاب الفرقة الثانية.',
          },
          {
            pageNumber: 2,
            text: 'توزيع الدرجات: امتحان منتصف الفصل 20 درجة والامتحان النهائي 60 درجة.',
          },
        ],
      }),
    };

    const gemini = {
      getEmbeddingModelName: () => 'gemini-embedding-001',
      embedBatch: jest.fn().mockResolvedValue([
        [0.1, 0.2, 0.3],
        [0.4, 0.5, 0.6],
      ]),
    };

    const materialStorage = {
      pathFor: jest.fn((key: string) => `/tmp/materials/${key}`),
    };

    const queueService = {
      registerWorker: jest.fn(),
      add: jest.fn().mockResolvedValue({ queued: true, jobId: 'job-1' }),
    };

    const service = new RagIngestionService(
      documents as never,
      chunks as never,
      courses as never,
      extractor as never,
      gemini as never,
      materialStorage as never,
      queueService as never,
    );

    return {
      service,
      documents,
      chunks,
      courses,
      extractor,
      gemini,
      materialStorage,
      queueService,
      activeCourse,
    };
  }

  it('enqueues syllabus ingestion with a deterministic jobId to prevent duplicate jobs', async () => {
    const { service, queueService } = createFixture();
    await service.enqueueSyllabusIngestion(courseId, 'sha256-v1');

    expect(queueService.add).toHaveBeenCalledWith(
      RAG_INGESTION_QUEUE,
      RAG_INGEST_SYLLABUS_JOB,
      { courseId, sha256: 'sha256-v1' },
      expect.any(Function),
      expect.objectContaining({
        jobId: `rag-syllabus:${courseId}:sha256-v1`,
        attempts: 3,
      }),
    );
  });

  it('extracts, chunks, embeds, publishes ready chunks, and purges older syllabus versions', async () => {
    const { service, chunks, documents } = createFixture();
    const res = await service.ingestCourseSyllabus(courseId, 'sha256-v1');

    expect(res).toEqual({
      courseId,
      sha256: 'sha256-v1',
      status: 'ready',
      pageCount: 2,
      chunkCount: 2,
      ocrUsed: false,
    });
    expect(chunks.insertMany).toHaveBeenCalledTimes(1);
    expect(documents.updateOne).toHaveBeenCalledWith(
      { _id: docId },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'ready',
          chunkCount: 2,
          embeddingModel: 'gemini-embedding-001',
          embeddingDimensions: 3,
        }),
      }),
    );
  });

  it('aborts publishing and cleans up if syllabus was removed or replaced during embedding', async () => {
    const { service, courses, chunks, activeCourse } = createFixture();
    courses.findById
      .mockReturnValueOnce(leanSelect(activeCourse))
      .mockReturnValueOnce(
        leanSelect({ ...activeCourse, syllabusFile: undefined }),
      );

    const res = await service.ingestCourseSyllabus(courseId, 'sha256-v1');
    expect(res.status).toBe('archived');
    expect(chunks.insertMany).not.toHaveBeenCalled();
  });

  it('records failureCode and removes draft chunks when PDF is corrupt or scanned without text', async () => {
    const { service, extractor, documents, chunks } = createFixture();
    extractor.extractFromFile.mockResolvedValueOnce({
      ok: false,
      pageCount: 3,
      ocrUsed: false,
      failureCode: 'SCANNED_PDF_NO_TEXT',
      pages: [],
    });

    const res = await service.ingestCourseSyllabus(courseId, 'sha256-v1');
    expect(res.status).toBe('failed');
    expect(res.failureCode).toBe('SCANNED_PDF_NO_TEXT');
    expect(documents.updateOne).toHaveBeenCalledWith(
      { _id: docId },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'failed',
          failureCode: 'SCANNED_PDF_NO_TEXT',
        }),
      }),
    );
    expect(chunks.insertMany).not.toHaveBeenCalled();
  });

  it('returns RAG ingestion overview and supports manual single-course and bulk re-indexing', async () => {
    const { service, documents, queueService } = createFixture();
    const overview = await service.getIngestionOverview();

    expect(overview.summary).toMatchObject({
      totalSyllabi: 1,
      readyCount: 0,
      unindexedCount: 1,
      embeddingModel: 'gemini-embedding-001',
    });
    expect(overview.items[0]).toMatchObject({
      courseCode: 'BIS201',
      status: 'unindexed',
    });

    const bulkRes = await service.reindexAllPending(false);
    expect(bulkRes).toEqual({
      totalSyllabi: 1,
      queuedCount: 1,
      skippedCount: 0,
    });
    expect(documents.updateOne).toHaveBeenCalled();
    expect(queueService.add).toHaveBeenCalled();
  });
});
