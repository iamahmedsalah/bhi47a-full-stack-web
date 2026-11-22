import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { QueueService } from '../../../core/queues/queue.service';
import { MaterialStorageService } from '../../material-storage/material-storage.service';
import { Course, CourseDocument } from '../../courses/schemas/course.schema';
import {
  RagDocument,
  RagDocumentFailureCode,
  RagDocumentRecord,
} from '../schemas/rag-document.schema';
import { RagChunk, RagChunkDocument } from '../schemas/rag-chunk.schema';
import { PdfTextExtractionService } from './pdf-text-extraction.service';
import { chunkDocumentPages } from './rag-chunking';
import { GeminiProvider } from '../providers/gemini.provider';

export const RAG_INGESTION_QUEUE = 'rag-ingestion';
export const RAG_INGEST_SYLLABUS_JOB = 'ingest-course-syllabus';

export interface RagIngestionJobPayload {
  courseId: string;
  sha256: string;
}

export interface RagIngestionResult {
  courseId: string;
  sha256?: string;
  status: 'ready' | 'failed' | 'archived' | 'skipped';
  failureCode?: RagDocumentFailureCode;
  pageCount: number;
  chunkCount: number;
  ocrUsed?: boolean;
}

export interface RagDocumentStatusItem {
  courseId: string;
  courseCode: string;
  courseNameAr: string;
  courseNameEn: string;
  fileName: string;
  sha256: string;
  status: 'ready' | 'processing' | 'failed' | 'pending' | 'unindexed';
  failureCode?: RagDocumentFailureCode;
  pageCount: number;
  chunkCount: number;
  ocrUsed: boolean;
  embeddingModel?: string;
  ingestedAt?: Date;
  syllabusUpdatedAt?: Date;
}

export interface RagIngestionOverview {
  summary: {
    totalSyllabi: number;
    readyCount: number;
    processingCount: number;
    failedCount: number;
    unindexedCount: number;
    totalActiveChunks: number;
    embeddingModel: string;
  };
  items: RagDocumentStatusItem[];
}

@Injectable()
export class RagIngestionService implements OnModuleInit {
  private readonly logger = new Logger(RagIngestionService.name);

  constructor(
    @InjectModel(RagDocument.name)
    private readonly documents: Model<RagDocumentRecord>,
    @InjectModel(RagChunk.name)
    private readonly chunks: Model<RagChunkDocument>,
    @InjectModel(Course.name)
    private readonly courses: Model<CourseDocument>,
    private readonly extractor: PdfTextExtractionService,
    private readonly gemini: GeminiProvider,
    @Optional() private readonly materialStorage?: MaterialStorageService,
    @Optional() private readonly queueService?: QueueService,
  ) {}

  onModuleInit(): void {
    this.queueService?.registerWorker<RagIngestionJobPayload>(
      RAG_INGESTION_QUEUE,
      async (job) => {
        return this.ingestCourseSyllabus(job.data.courseId, job.data.sha256);
      },
    );
  }

  /**
   * Enqueues syllabus ingestion with a deterministic jobId keyed by (courseId, sha256)
   * so duplicate uploads or retries do not create duplicate concurrent workers.
   */
  async enqueueSyllabusIngestion(
    courseId: string,
    sha256: string,
  ): Promise<{ queued: boolean; jobId?: string; result?: unknown }> {
    const cleanCourseId = String(courseId);
    const cleanSha = String(sha256).trim();
    const jobId = `rag-syllabus:${cleanCourseId}:${cleanSha}`;
    const payload: RagIngestionJobPayload = {
      courseId: cleanCourseId,
      sha256: cleanSha,
    };

    if (!this.queueService) {
      const result = await this.ingestCourseSyllabus(cleanCourseId, cleanSha);
      return { queued: false, result };
    }

    return this.queueService.add(
      RAG_INGESTION_QUEUE,
      RAG_INGEST_SYLLABUS_JOB,
      payload,
      async (data) => this.ingestCourseSyllabus(data.courseId, data.sha256),
      {
        jobId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 3000 },
      },
    );
  }

  /**
   * Immediately removes all active chunks and archives documents for a course
   * when its syllabus is deleted or the course is deactivated.
   */
  async removeCourseIndex(
    courseId: string,
  ): Promise<{ deletedChunks: number; archivedDocuments: number }> {
    const courseObjId = new Types.ObjectId(courseId);
    const [chunkRes, docRes] = await Promise.all([
      this.chunks.deleteMany({ courseId: courseObjId }),
      this.documents.updateMany(
        { courseId: courseObjId, status: { $ne: 'archived' } },
        { $set: { status: 'archived' } },
      ),
    ]);

    return {
      deletedChunks: chunkRes.deletedCount ?? 0,
      archivedDocuments: docRes.modifiedCount ?? 0,
    };
  }

  /**
   * Returns an overview of all active course syllabi and their RAG indexing status
   * for the Admin AI Settings monitoring panel.
   */
  async getIngestionOverview(): Promise<RagIngestionOverview> {
    const embeddingModel = this.gemini.getEmbeddingModelName();
    const coursesWithSyllabi = await this.courses
      .find({
        isActive: true,
        'syllabusFile.sha256': { $exists: true, $ne: null },
      })
      .select(
        'code name nameAr nameEn syllabusFile syllabusPdfName syllabusUpdatedAt',
      )
      .sort({ code: 1 })
      .lean();

    const courseIds = coursesWithSyllabi.map((c) => c._id);
    const docs =
      courseIds.length > 0
        ? await this.documents
            .find({
              courseId: { $in: courseIds },
              status: { $ne: 'archived' },
            })
            .lean()
        : [];

    const docMap = new Map<string, (typeof docs)[number]>();
    for (const doc of docs) {
      docMap.set(`${String(doc.courseId)}:${doc.sha256}`, doc);
    }

    let readyCount = 0;
    let processingCount = 0;
    let failedCount = 0;
    let unindexedCount = 0;
    let totalActiveChunks = 0;

    const items: RagDocumentStatusItem[] = coursesWithSyllabi.map((course) => {
      const sha = course.syllabusFile?.sha256 ?? '';
      const matched = docMap.get(`${String(course._id)}:${sha}`);
      const isModelMatch =
        !matched?.embeddingModel || matched.embeddingModel === embeddingModel;

      let status: RagDocumentStatusItem['status'] = 'unindexed';
      if (matched) {
        if (matched.status === 'ready' && isModelMatch) {
          status = 'ready';
          readyCount += 1;
          totalActiveChunks += matched.chunkCount ?? 0;
        } else if (
          matched.status === 'processing' ||
          matched.status === 'pending'
        ) {
          status = matched.status;
          processingCount += 1;
        } else if (matched.status === 'failed') {
          status = 'failed';
          failedCount += 1;
        } else {
          status = 'unindexed';
          unindexedCount += 1;
        }
      } else {
        unindexedCount += 1;
      }

      return {
        courseId: String(course._id),
        courseCode: course.code.toUpperCase(),
        courseNameAr: course.nameAr || course.name || course.code,
        courseNameEn: course.nameEn || course.name || course.code,
        fileName:
          course.syllabusFile?.originalName ||
          course.syllabusPdfName ||
          `syllabus_${course.code}.pdf`,
        sha256: sha,
        status,
        failureCode: matched?.failureCode,
        pageCount: matched?.pageCount ?? 0,
        chunkCount: status === 'ready' ? (matched?.chunkCount ?? 0) : 0,
        ocrUsed: matched?.ocrUsed ?? false,
        embeddingModel: matched?.embeddingModel,
        ingestedAt: matched?.ingestedAt,
        syllabusUpdatedAt: course.syllabusUpdatedAt,
      };
    });

    return {
      summary: {
        totalSyllabi: items.length,
        readyCount,
        processingCount,
        failedCount,
        unindexedCount,
        totalActiveChunks,
        embeddingModel,
      },
      items,
    };
  }

  /**
   * Forces a manual re-index of a single course's active syllabus.
   */
  async reindexCourse(
    courseId: string,
    force = true,
  ): Promise<{ queued: boolean; courseId: string; sha256?: string }> {
    const courseObjId = new Types.ObjectId(courseId);
    const course = await this.courses
      .findById(courseObjId)
      .select('isActive syllabusFile')
      .lean();

    const activeSha = course?.syllabusFile?.sha256;
    if (!course || !course.isActive || !activeSha) {
      await this.removeCourseIndex(courseId);
      return { queued: false, courseId };
    }

    if (force) {
      await this.documents.updateOne(
        { courseId: courseObjId, sha256: activeSha },
        { $set: { status: 'pending', failureCode: undefined } },
      );
    }

    const enqueued = await this.enqueueSyllabusIngestion(courseId, activeSha);
    return {
      queued: Boolean(enqueued.queued || enqueued.result),
      courseId,
      sha256: activeSha,
    };
  }

  /**
   * Queues re-indexing for all unindexed or failed course syllabi (or all syllabi when forceAll=true).
   */
  async reindexAllPending(forceAll = false): Promise<{
    totalSyllabi: number;
    queuedCount: number;
    skippedCount: number;
  }> {
    const overview = await this.getIngestionOverview();
    let queuedCount = 0;
    let skippedCount = 0;

    for (const item of overview.items) {
      if (!forceAll && item.status === 'ready') {
        skippedCount += 1;
        continue;
      }
      await this.reindexCourse(item.courseId, true);
      queuedCount += 1;
    }

    return {
      totalSyllabi: overview.items.length,
      queuedCount,
      skippedCount,
    };
  }

  /**
   * Runs the end-to-end extraction -> chunking -> embedding -> atomic publish lifecycle.
   */
  async ingestCourseSyllabus(
    courseId: string,
    expectedSha256?: string,
  ): Promise<RagIngestionResult> {
    const courseObjId = new Types.ObjectId(courseId);
    const course = await this.courses
      .findById(courseObjId)
      .select('code name nameAr nameEn isActive syllabusFile syllabusPdfName')
      .lean();

    if (
      !course ||
      !course.isActive ||
      !course.syllabusFile?.storageKey ||
      !course.syllabusFile?.sha256
    ) {
      await this.removeCourseIndex(courseId);
      return {
        courseId,
        status: 'archived',
        pageCount: 0,
        chunkCount: 0,
      };
    }

    const activeSha = course.syllabusFile.sha256;
    if (expectedSha256 && expectedSha256 !== activeSha) {
      // A newer syllabus replaced this version before the job started
      return {
        courseId,
        sha256: expectedSha256,
        status: 'skipped',
        pageCount: 0,
        chunkCount: 0,
      };
    }

    const embeddingModel = this.gemini.getEmbeddingModelName();
    const existingReady = await this.documents
      .findOne({
        courseId: courseObjId,
        sha256: activeSha,
        status: 'ready',
        embeddingModel,
      })
      .lean();

    if (existingReady && existingReady.chunkCount > 0) {
      const activeChunkCount = await this.chunks.countDocuments({
        documentId: existingReady._id,
        isActive: true,
      });
      if (activeChunkCount === existingReady.chunkCount) {
        return {
          courseId,
          sha256: activeSha,
          status: 'skipped',
          pageCount: existingReady.pageCount,
          chunkCount: existingReady.chunkCount,
          ocrUsed: existingReady.ocrUsed,
        };
      }
    }

    const title = course.nameAr || course.name || course.nameEn || course.code;
    const fileName =
      course.syllabusFile.originalName ||
      course.syllabusPdfName ||
      `syllabus_${course.code}.pdf`;

    const docRecord = await this.documents.findOneAndUpdate(
      { courseId: courseObjId, sha256: activeSha },
      {
        $set: {
          courseCode: course.code.toUpperCase(),
          title,
          titleAr: course.nameAr || course.name,
          titleEn: course.nameEn || course.name,
          fileName,
          storageKey: course.syllabusFile.storageKey,
          status: 'processing',
          failureCode: undefined,
        },
      },
      { upsert: true, new: true },
    );

    if (!this.materialStorage) {
      await this.markDocumentFailed(docRecord._id, 'STORAGE_READ_FAILED', 0);
      return {
        courseId,
        sha256: activeSha,
        status: 'failed',
        failureCode: 'STORAGE_READ_FAILED',
        pageCount: 0,
        chunkCount: 0,
      };
    }

    let filePath: string;
    try {
      filePath = this.materialStorage.pathFor(course.syllabusFile.storageKey);
    } catch {
      await this.markDocumentFailed(docRecord._id, 'STORAGE_READ_FAILED', 0);
      return {
        courseId,
        sha256: activeSha,
        status: 'failed',
        failureCode: 'STORAGE_READ_FAILED',
        pageCount: 0,
        chunkCount: 0,
      };
    }

    const extraction = await this.extractor.extractFromFile(filePath);
    if (!extraction.ok) {
      const failureCode = extraction.failureCode ?? 'CORRUPT_PDF';
      await this.markDocumentFailed(
        docRecord._id,
        failureCode,
        extraction.pageCount,
      );
      return {
        courseId,
        sha256: activeSha,
        status: 'failed',
        failureCode,
        pageCount: extraction.pageCount,
        chunkCount: 0,
      };
    }

    const generatedChunks = chunkDocumentPages(extraction.pages);
    if (generatedChunks.length === 0) {
      await this.markDocumentFailed(
        docRecord._id,
        'EMPTY_PDF',
        extraction.pageCount,
      );
      return {
        courseId,
        sha256: activeSha,
        status: 'failed',
        failureCode: 'EMPTY_PDF',
        pageCount: extraction.pageCount,
        chunkCount: 0,
      };
    }

    let vectors: number[][];
    try {
      vectors = await this.gemini.embedBatch(
        generatedChunks.map((c) => c.text),
        {
          taskType: 'RETRIEVAL_DOCUMENT',
          title: `${course.code} - ${title}`,
        },
      );
    } catch (error) {
      this.logger.warn(
        `Embedding generation failed for course ${course.code}: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      await this.markDocumentFailed(
        docRecord._id,
        'EMBEDDING_FAILED',
        extraction.pageCount,
      );
      throw error;
    }

    if (vectors.length !== generatedChunks.length || !vectors[0]?.length) {
      await this.markDocumentFailed(
        docRecord._id,
        'EMBEDDING_FAILED',
        extraction.pageCount,
      );
      return {
        courseId,
        sha256: activeSha,
        status: 'failed',
        failureCode: 'EMBEDDING_FAILED',
        pageCount: extraction.pageCount,
        chunkCount: 0,
      };
    }

    // Re-check authoritative Course record before publishing chunks to prevent stale-version race
    const freshCourse = await this.courses
      .findById(courseObjId)
      .select('isActive syllabusFile')
      .lean();

    if (
      !freshCourse ||
      !freshCourse.isActive ||
      freshCourse.syllabusFile?.sha256 !== activeSha
    ) {
      await this.documents.updateOne(
        { _id: docRecord._id },
        { $set: { status: 'archived' } },
      );
      await this.chunks.deleteMany({ documentId: docRecord._id });
      return {
        courseId,
        sha256: activeSha,
        status: 'archived',
        pageCount: extraction.pageCount,
        chunkCount: 0,
      };
    }

    const dimensions = vectors[0].length;

    // Replace any previous draft chunks for this exact documentId
    await this.chunks.deleteMany({ documentId: docRecord._id });

    const chunkDocs = generatedChunks.map((chunk, index) => ({
      documentId: docRecord._id,
      courseId: courseObjId,
      courseCode: course.code.toUpperCase(),
      sha256: activeSha,
      pageNumber: chunk.pageNumber,
      chunkIndex: chunk.chunkIndex,
      text: chunk.text,
      normalizedText: chunk.normalizedText,
      terms: chunk.terms,
      tokenEstimate: chunk.tokenEstimate,
      embedding: vectors[index],
      embeddingModel,
      embeddingDimensions: dimensions,
      isActive: true,
    }));

    await this.chunks.insertMany(chunkDocs, { ordered: true });

    // Atomically mark document ready and purge older syllabus versions for this course
    await Promise.all([
      this.documents.updateOne(
        { _id: docRecord._id },
        {
          $set: {
            status: 'ready',
            failureCode: undefined,
            pageCount: extraction.pageCount,
            chunkCount: chunkDocs.length,
            embeddingModel,
            embeddingDimensions: dimensions,
            ocrUsed: extraction.ocrUsed,
            ingestedAt: new Date(),
          },
        },
      ),
      this.chunks.deleteMany({
        courseId: courseObjId,
        sha256: { $ne: activeSha },
      }),
      this.documents.updateMany(
        {
          courseId: courseObjId,
          sha256: { $ne: activeSha },
          status: { $ne: 'archived' },
        },
        { $set: { status: 'archived' } },
      ),
    ]);

    return {
      courseId,
      sha256: activeSha,
      status: 'ready',
      pageCount: extraction.pageCount,
      chunkCount: chunkDocs.length,
      ocrUsed: extraction.ocrUsed,
    };
  }

  private async markDocumentFailed(
    documentId: Types.ObjectId,
    failureCode: RagDocumentFailureCode,
    pageCount: number,
  ): Promise<void> {
    await Promise.all([
      this.documents.updateOne(
        { _id: documentId },
        {
          $set: {
            status: 'failed',
            failureCode,
            pageCount,
            chunkCount: 0,
          },
        },
      ),
      this.chunks.deleteMany({ documentId }),
    ]);
  }
}
