import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import {
  cosineSimilarity,
  RagDocumentSearchService,
  rewriteAndExpandQuery,
} from './rag-document-search.service';

function leanChain<T>(value: T) {
  return {
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(value),
  };
}

describe('RagDocumentSearchService', () => {
  const studentId = new Types.ObjectId().toHexString();
  const allowedCourseId = new Types.ObjectId();
  const forbiddenCourseId = new Types.ObjectId();
  const readyDocId = new Types.ObjectId();

  function createServiceFixture(options?: {
    isBlocked?: boolean;
    activeCourseSha?: string;
    chunkSha?: string;
    queryVector?: number[];
  }) {
    const activeCourseSha = options?.activeCourseSha ?? 'sha-active-v2';
    const chunkSha = options?.chunkSha ?? activeCourseSha;

    const studentProfiles = {
      findOne: jest.fn().mockReturnValue(
        leanChain({
          userId: new Types.ObjectId(studentId),
          isBlocked: options?.isBlocked ?? false,
          level: '2',
          department: 'BIS',
          semester: 'first',
          academicYear: '2026-2027',
        }),
      ),
    };

    const registrations = {
      findOne: jest.fn().mockReturnValue(
        leanChain({
          courses: ['BIS201'],
        }),
      ),
    };

    const courses = {
      find: jest.fn().mockReturnValue(
        leanChain([
          {
            _id: allowedCourseId,
            code: 'BIS201',
            name: 'Database Systems',
            nameAr: 'نظم قواعد البيانات',
            nameEn: 'Database Systems',
            semester: 'first',
            isActive: true,
            syllabusFile: {
              sha256: activeCourseSha,
              originalName: 'bis201-syllabus.pdf',
            },
          },
        ]),
      ),
    };

    const documents = {
      find: jest.fn().mockReturnValue(
        leanChain([
          {
            _id: readyDocId,
            courseId: allowedCourseId,
            sha256: activeCourseSha,
          },
        ]),
      ),
    };

    const chunks = {
      find: jest.fn().mockReturnValue(
        leanChain([
          {
            documentId: readyDocId,
            courseId: allowedCourseId,
            courseCode: 'BIS201',
            sha256: chunkSha,
            pageNumber: 4,
            chunkIndex: 0,
            text: 'توزيع درجات مقرر نظم قواعد البيانات: امتحان منتصف الفصل 20 درجة والامتحان النهائي 60 درجة.',
            normalizedText:
              'توزيع درجات مقرر نظم قواعد البيانات امتحان منتصف الفصل 20 درجه والامتحان النهايي 60 درجه',
            terms: [
              'توزيع',
              'درجات',
              'قواعد',
              'البيانات',
              'منتصف',
              'الفصل',
              'ميدترم',
            ],
            embedding: [0.9, 0.1, 0.0],
            embeddingDimensions: 3,
          },
          {
            // Near-duplicate chunk on same page that should be deduplicated by MMR
            documentId: readyDocId,
            courseId: allowedCourseId,
            courseCode: 'BIS201',
            sha256: chunkSha,
            pageNumber: 4,
            chunkIndex: 1,
            text: 'توزيع درجات مقرر نظم قواعد البيانات: امتحان منتصف الفصل 20 درجة والامتحان النهائي 60 درجة.',
            normalizedText:
              'توزيع درجات مقرر نظم قواعد البيانات امتحان منتصف الفصل 20 درجه والامتحان النهايي 60 درجه',
            terms: [
              'توزيع',
              'درجات',
              'قواعد',
              'البيانات',
              'منتصف',
              'الفصل',
              'ميدترم',
            ],
            embedding: [0.89, 0.11, 0.0],
            embeddingDimensions: 3,
          },
        ]),
      ),
    };

    const gemini = {
      getEmbeddingModelName: () => 'gemini-embedding-001',
      embed: jest
        .fn()
        .mockResolvedValue(options?.queryVector ?? [0.88, 0.12, 0.0]),
    };

    const service = new RagDocumentSearchService(
      documents as never,
      chunks as never,
      courses as never,
      studentProfiles as never,
      registrations as never,
      gemini as never,
    );

    return {
      service,
      studentProfiles,
      registrations,
      courses,
      documents,
      chunks,
      gemini,
    };
  }

  it('denies all syllabus retrieval when student account is financially/administratively blocked', async () => {
    const { service, chunks } = createServiceFixture({ isBlocked: true });
    const evidence = await service.searchForStudent(
      studentId,
      'ما هو توزيع درجات قواعد البيانات؟',
    );
    expect(evidence.chunks).toHaveLength(0);
    expect(evidence.contextPrompt).toBe('');
    expect(chunks.find).not.toHaveBeenCalled();
  });

  it('prevents cross-user / unauthorized course access and filters chunks by active syllabus SHA-256', async () => {
    const { service, chunks } = createServiceFixture();
    const evidence = await service.searchForStudent(
      studentId,
      'توزيع درجات الميدترم في قواعد البيانات BIS201',
      { locale: 'ar' },
    );

    const chunkFilter = chunks.find.mock.calls[0][0] as {
      courseId: { $in: Types.ObjectId[] };
    };
    expect(chunkFilter.courseId.$in).toEqual([allowedCourseId]);
    expect(chunkFilter.courseId.$in).not.toContain(forbiddenCourseId);

    // Deduplicated near-identical chunk -> only 1 chunk returned
    expect(evidence.chunks).toHaveLength(1);
    expect(evidence.chunks[0]).toMatchObject({
      sourceId: 'S1',
      courseCode: 'BIS201',
      courseTitle: 'نظم قواعد البيانات',
      fileName: 'bis201-syllabus.pdf',
      pageNumber: 4,
    });
  });

  it('excludes stale chunks if syllabus SHA-256 changed before index cleanup completed', async () => {
    const { service } = createServiceFixture({
      activeCourseSha: 'sha-new-v3',
      chunkSha: 'sha-old-v1',
    });
    const evidence = await service.searchForStudent(
      studentId,
      'توزيع درجات قواعد البيانات',
    );
    expect(evidence.chunks).toHaveLength(0);
  });

  it('verifies valid citations server-side and rejects hallucinated source IDs or insufficient evidence', () => {
    const { service } = createServiceFixture();
    const evidenceMap = new Map([
      [
        'S1',
        {
          sourceId: 'S1',
          courseId: String(allowedCourseId),
          courseCode: 'BIS201',
          courseTitle: 'نظم قواعد البيانات',
          fileName: 'bis201-syllabus.pdf',
          pageNumber: 4,
          score: 0.91,
        },
      ],
    ]);

    const valid = service.verifyAndResolveCitations(
      'درجة امتحان منتصف الفصل هي 20 درجة [S1] [S99].',
      evidenceMap,
    );
    expect(valid.grounded).toBe(true);
    expect(valid.answer).toBe('درجة امتحان منتصف الفصل هي 20 درجة [S1].');
    expect(valid.sources).toHaveLength(1);
    expect(valid.sources[0].pageNumber).toBe(4);

    const hallucinatedOnly = service.verifyAndResolveCitations(
      'الدرجة 50 درجة [S99].',
      evidenceMap,
    );
    expect(hallucinatedOnly.grounded).toBe(false);
    expect(hallucinatedOnly.sources).toHaveLength(0);

    const insufficient = service.verifyAndResolveCitations(
      '[INSUFFICIENT_EVIDENCE]',
      evidenceMap,
    );
    expect(insufficient.grounded).toBe(false);
  });

  it('rewrites and expands bilingual academic synonyms (P2)', () => {
    const expanded = rewriteAndExpandQuery('كم درجة الميدترم؟');
    expect(expanded.expandedTerms).toEqual(
      expect.arrayContaining(['ميدترم', 'midterm']),
    );
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1, 5);
  });

  it('uses MongoDB Atlas $vectorSearch when RAG_ATLAS_VECTOR_INDEX is configured and falls back cleanly on error', async () => {
    const base = createServiceFixture();
    const aggregateMock = jest.fn().mockResolvedValueOnce([
      {
        documentId: readyDocId,
        courseId: allowedCourseId,
        courseCode: 'BIS201',
        sha256: 'sha-active-v2',
        pageNumber: 9,
        chunkIndex: 0,
        text: 'الفصل الرابع: فهارس قواعد البيانات وتحسين الاستعلامات.',
        normalizedText: 'الفصل الرابع فهارس قواعد البيانات وتحسين الاستعلامات',
        terms: ['فهارس', 'قواعد', 'البيانات'],
        embeddingDimensions: 3,
        vectorSearchScore: 0.94,
      },
    ]);

    Object.assign(base.chunks, { aggregate: aggregateMock });

    const atlasService = new RagDocumentSearchService(
      base.documents as never,
      base.chunks as never,
      base.courses as never,
      base.studentProfiles as never,
      base.registrations as never,
      base.gemini as never,
      new ConfigService({ RAG_ATLAS_VECTOR_INDEX: 'rag_chunks_vector_index' }),
    );

    const atlasEvidence = await atlasService.searchForStudent(
      studentId,
      'فهارس قواعد البيانات BIS201',
    );
    expect(aggregateMock).toHaveBeenCalledTimes(1);
    expect(atlasEvidence.chunks).toHaveLength(1);
    expect(atlasEvidence.chunks[0].pageNumber).toBe(9);
    expect(base.chunks.find).not.toHaveBeenCalled();

    // When aggregate throws (e.g. non-Atlas environment), it falls back to chunks.find
    aggregateMock.mockRejectedValueOnce(
      new Error('$vectorSearch not supported'),
    );
    const fallbackEvidence = await atlasService.searchForStudent(
      studentId,
      'توزيع درجات الميدترم BIS201',
    );
    expect(base.chunks.find).toHaveBeenCalledTimes(1);
    expect(fallbackEvidence.chunks).toHaveLength(1);
  });
});
