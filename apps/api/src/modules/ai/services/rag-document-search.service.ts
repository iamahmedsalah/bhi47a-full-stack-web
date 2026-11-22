import { Injectable, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import {
  normalizeDepartment,
  type CourseLevel,
  type Semester,
} from '@student-portal/shared';
import { Course, CourseDocument } from '../../courses/schemas/course.schema';
import { courseCurriculumFilter } from '../../courses/utils/course-filter.util';
import { isCourseOfferedForTerm } from '../../registrations/utils/term-availability.util';
import {
  CourseRegistration,
  CourseRegistrationDocument,
} from '../../registrations/schemas/course-registration.schema';
import {
  StudentProfile,
  StudentProfileDocument,
} from '../../students/schemas/student-profile.schema';
import { RagDocument, RagDocumentRecord } from '../schemas/rag-document.schema';
import { RagChunk, RagChunkDocument } from '../schemas/rag-chunk.schema';
import { GeminiProvider } from '../providers/gemini.provider';
import { faqTerms, normalizeFaqText } from '../../faqs/faq-retrieval';

export interface EligibleCourseSyllabus {
  courseId: Types.ObjectId;
  courseCode: string;
  titleAr: string;
  titleEn: string;
  fileName: string;
  sha256: string;
}

export interface RagCitationSource {
  sourceId: string;
  courseId: string;
  courseCode: string;
  courseTitle: string;
  fileName: string;
  pageNumber: number;
  score: number;
}

export interface RetrievedDocumentEvidence {
  contextPrompt: string;
  evidenceMap: Map<string, RagCitationSource>;
  chunks: Array<RagCitationSource & { text: string }>;
}

const ACADEMIC_SYNONYM_GROUPS: ReadonlyArray<ReadonlyArray<string>> = [
  ['ميدترم', 'منتصف الفصل', 'امتحان نصف الفصل', 'midterm'],
  ['فاينل', 'نهائي', 'امتحان نهائي', 'final'],
  ['متطلب', 'متطلبات', 'متطلب سابق', 'prerequisite', 'prerequisites'],
  ['ساعات', 'ساعه', 'معتمدة', 'credit', 'credits', 'hours'],
  [
    'درجات',
    'توزيع الدرجات',
    'تقييم',
    'اعمال السنه',
    'grading',
    'assessment',
    'marks',
  ],
  [
    'منهج',
    'محتوي',
    'موضوعات',
    'توصيف',
    'فصول',
    'syllabus',
    'topics',
    'chapters',
    'outline',
  ],
  ['محاضره', 'محاضرات', 'lecture', 'lectures'],
  ['سكشن', 'عملي', 'تمارين', 'section', 'lab', 'tutorial'],
  ['مراجع', 'كتاب', 'مقرر', 'textbook', 'references', 'book'],
];

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a?.length || !b?.length || a.length !== b.length) {
    return 0;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const va = a[i];
    const vb = b[i];
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  }
  if (normA <= 0 || normB <= 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * P2 Query Rewriting & Bilingual Academic Synonym Expansion.
 * Expands student phrasing with canonical Arabic/English academic terms
 * without extra LLM round-trip latency.
 */
export function rewriteAndExpandQuery(rawQuery: string): {
  expandedQuery: string;
  queryTerms: string[];
  expandedTerms: string[];
} {
  const normalized = normalizeFaqText(rawQuery);
  const baseTerms = faqTerms(rawQuery);
  const expandedSet = new Set<string>(baseTerms);

  for (const group of ACADEMIC_SYNONYM_GROUPS) {
    const normalizedGroup = group.map((item) => normalizeFaqText(item));
    const matchesGroup = normalizedGroup.some(
      (phrase) =>
        normalized.includes(phrase) ||
        baseTerms.some((term) => phrase.split(' ').includes(term)),
    );
    if (matchesGroup) {
      for (const phrase of normalizedGroup) {
        for (const token of phrase.split(' ')) {
          if (token.length >= 2) {
            expandedSet.add(token);
          }
        }
      }
    }
  }

  const expandedTerms = [...expandedSet].slice(0, 24);
  const addedTerms = expandedTerms.filter((t) => !baseTerms.includes(t));
  const expandedQuery =
    addedTerms.length > 0
      ? `${rawQuery.trim()} (${addedTerms.slice(0, 8).join(' ')})`
      : rawQuery.trim();

  return {
    expandedQuery,
    queryTerms: baseTerms,
    expandedTerms,
  };
}

@Injectable()
export class RagDocumentSearchService {
  constructor(
    @InjectModel(RagDocument.name)
    private readonly documents: Model<RagDocumentRecord>,
    @InjectModel(RagChunk.name)
    private readonly chunks: Model<RagChunkDocument>,
    @InjectModel(Course.name)
    private readonly courses: Model<CourseDocument>,
    @InjectModel(StudentProfile.name)
    private readonly studentProfiles: Model<StudentProfileDocument>,
    @InjectModel(CourseRegistration.name)
    private readonly registrations: Model<CourseRegistrationDocument>,
    private readonly gemini: GeminiProvider,
    @Optional() private readonly config?: ConfigService,
  ) {}

  /**
   * P0 Strict Student Eligibility Isolation:
   * Derives the exact courses and active syllabus SHA-256 versions a student is authorized
   * to query. Blocked students (isBlocked === true) get zero access.
   */
  async resolveEligibleCoursesForStudent(
    studentId: string,
  ): Promise<Map<string, EligibleCourseSyllabus>> {
    const allowlist = new Map<string, EligibleCourseSyllabus>();
    if (!Types.ObjectId.isValid(studentId)) {
      return allowlist;
    }

    const studentObjId = new Types.ObjectId(studentId);
    const profile = await this.studentProfiles
      .findOne({ userId: studentObjId })
      .select('isBlocked level department semester academicYear')
      .lean();

    if (!profile || profile.isBlocked) {
      return allowlist;
    }

    const latestReg = await this.registrations
      .findOne({
        studentId: studentObjId,
        status: 'approved',
        ...(profile.academicYear ? { academicYear: profile.academicYear } : {}),
        ...(profile.semester ? { semester: profile.semester } : {}),
      })
      .sort({ createdAt: -1 })
      .select('courses')
      .lean();

    const registeredCodes = (latestReg?.courses ?? []).map((code) =>
      code.toUpperCase(),
    );

    const normalizedDept = normalizeDepartment(profile.department);
    const studentLevel = (profile.level ?? '1') as CourseLevel;
    const semester = (profile.semester ?? 'first') as Semester;

    const orFilters: Record<string, unknown>[] = [];
    if (registeredCodes.length > 0) {
      orFilters.push({ code: { $in: registeredCodes } });
    }
    if (normalizedDept) {
      orFilters.push(
        courseCurriculumFilter({
          level: studentLevel,
          department: normalizedDept,
          semester,
        }),
      );
    }

    if (orFilters.length === 0) {
      return allowlist;
    }

    const candidateCourses = await this.courses
      .find({
        isActive: true,
        'syllabusFile.sha256': { $exists: true, $ne: null },
        $or: orFilters,
      })
      .select(
        'code name nameAr nameEn semester offeredTerms curricula syllabusFile syllabusPdfName',
      )
      .lean();

    for (const course of candidateCourses) {
      const sha256 = course.syllabusFile?.sha256;
      if (!sha256) continue;

      const isRegistered = registeredCodes.includes(course.code.toUpperCase());
      if (!isRegistered && !isCourseOfferedForTerm(course as never, semester)) {
        continue;
      }

      const idStr = String(course._id);
      allowlist.set(idStr, {
        courseId: new Types.ObjectId(idStr),
        courseCode: course.code.toUpperCase(),
        titleAr: course.nameAr || course.name || course.code,
        titleEn: course.nameEn || course.name || course.code,
        fileName:
          course.syllabusFile?.originalName ||
          course.syllabusPdfName ||
          `syllabus_${course.code}.pdf`,
        sha256,
      });
    }

    return allowlist;
  }

  /**
   * P1 + P2 Hybrid Search, Reranking, MMR Deduplication, and Post-Retrieval Access Verification.
   */
  async searchForStudent(
    studentId: string,
    query: string,
    options?: {
      locale?: 'ar' | 'en';
      topK?: number;
      maxContextChars?: number;
    },
  ): Promise<RetrievedDocumentEvidence> {
    const emptyResult: RetrievedDocumentEvidence = {
      contextPrompt: '',
      evidenceMap: new Map(),
      chunks: [],
    };

    const allowlist = await this.resolveEligibleCoursesForStudent(studentId);
    if (allowlist.size === 0) {
      return emptyResult;
    }

    const locale = options?.locale ?? 'ar';
    const topK = options?.topK ?? 5;
    const maxContextChars = options?.maxContextChars ?? 4200;
    const embeddingModel = this.gemini.getEmbeddingModelName();

    const eligibleCourseIds = [...allowlist.values()].map((c) => c.courseId);
    const activeShas = [
      ...new Set([...allowlist.values()].map((c) => c.sha256)),
    ];

    // Verify ready documents in rag_documents matching the exact active syllabus versions
    const readyDocs = await this.documents
      .find({
        courseId: { $in: eligibleCourseIds },
        sha256: { $in: activeShas },
        status: 'ready',
        embeddingModel,
      })
      .select('_id courseId sha256')
      .lean();

    const validDocIds = readyDocs
      .filter((doc) => {
        const allowed = allowlist.get(String(doc.courseId));
        return allowed && allowed.sha256 === doc.sha256;
      })
      .map((doc) => doc._id);

    if (validDocIds.length === 0) {
      return emptyResult;
    }

    const { expandedQuery, queryTerms, expandedTerms } =
      rewriteAndExpandQuery(query);

    let queryVector: number[] | undefined;
    try {
      queryVector = await this.gemini.embed(expandedQuery, {
        taskType: 'RETRIEVAL_QUERY',
      });
    } catch {
      // Graceful fallback to lexical search if embedding API fails or key is offline
      queryVector = undefined;
    }

    // Fetch active chunks via Atlas $vectorSearch when configured, with automatic fallback to in-server query
    const validDocIdSet = new Set(validDocIds.map((id) => String(id)));
    const atlasCandidates = await this.tryAtlasVectorSearch({
      queryVector,
      eligibleCourseIds,
      activeShas,
      embeddingModel,
      topK,
    });

    const candidateChunks =
      atlasCandidates ??
      (await this.chunks
        .find({
          documentId: { $in: validDocIds },
          courseId: { $in: eligibleCourseIds },
          isActive: true,
          embeddingModel,
        })
        .select(
          'documentId courseId courseCode sha256 pageNumber chunkIndex text normalizedText terms embedding embeddingDimensions',
        )
        .limit(400)
        .lean());

    if (candidateChunks.length === 0) {
      return emptyResult;
    }

    const normalizedQuery = normalizeFaqText(query);

    // Score & Fuse (P2 Hybrid Search: Vector Cosine + Lexical Term Overlap + Course Mention Boost)
    const scored = candidateChunks
      .map((chunk) => {
        if (!validDocIdSet.has(String(chunk.documentId))) {
          return null;
        }
        const allowedCourse = allowlist.get(String(chunk.courseId));
        // Double-check authoritative ownership and version match post-fetch
        if (!allowedCourse || allowedCourse.sha256 !== chunk.sha256) {
          return null;
        }

        const atlasScore = (chunk as { vectorSearchScore?: number })
          .vectorSearchScore;

        const hasCompatibleVector =
          typeof atlasScore === 'number' ||
          (Boolean(queryVector?.length) &&
            Array.isArray(chunk.embedding) &&
            chunk.embedding.length === queryVector!.length);

        const vectorScore =
          typeof atlasScore === 'number'
            ? Math.max(0, Math.min(1, atlasScore))
            : hasCompatibleVector
              ? Math.max(0, cosineSimilarity(queryVector!, chunk.embedding))
              : 0;

        const lexicalScore = this.computeLexicalScore(
          normalizedQuery,
          queryTerms,
          expandedTerms,
          chunk.normalizedText,
          chunk.terms ?? [],
        );

        const courseMentioned = this.isCourseMentionedInQuery(
          normalizedQuery,
          allowedCourse,
        );
        const courseBoost = courseMentioned ? 0.14 : 0;

        const finalScore = hasCompatibleVector
          ? 0.65 * vectorScore + 0.35 * lexicalScore + courseBoost
          : lexicalScore + courseBoost;

        return {
          chunk,
          allowedCourse,
          vectorScore,
          lexicalScore,
          finalScore,
        };
      })
      .filter(
        (item): item is NonNullable<typeof item> =>
          item !== null && item.finalScore >= (queryVector ? 0.24 : 0.2),
      )
      .sort((a, b) => b.finalScore - a.finalScore);

    if (scored.length === 0) {
      return emptyResult;
    }

    // P2 MMR / Diversity Reranking & Context Deduplication
    const selected: typeof scored = [];
    const perPageCount = new Map<string, number>();

    for (const candidate of scored) {
      if (selected.length >= topK) break;

      const pageKey = `${String(candidate.chunk.courseId)}:${candidate.chunk.pageNumber}`;
      if ((perPageCount.get(pageKey) ?? 0) >= 2) {
        continue;
      }

      const isNearDuplicate = selected.some(
        (existing) =>
          this.jaccardSimilarity(
            existing.chunk.terms ?? [],
            candidate.chunk.terms ?? [],
          ) > 0.78,
      );
      if (isNearDuplicate) {
        continue;
      }

      selected.push(candidate);
      perPageCount.set(pageKey, (perPageCount.get(pageKey) ?? 0) + 1);
    }

    const evidenceMap = new Map<string, RagCitationSource>();
    const chunks: Array<RagCitationSource & { text: string }> = [];
    const contextBlocks: string[] = [];
    let currentChars = 0;

    for (let i = 0; i < selected.length; i++) {
      const item = selected[i];
      const excerpt = item.chunk.text.trim();
      if (
        currentChars + excerpt.length > maxContextChars &&
        chunks.length > 0
      ) {
        break;
      }

      const sourceId = `S${i + 1}`;
      const courseTitle =
        locale === 'ar'
          ? item.allowedCourse.titleAr
          : item.allowedCourse.titleEn;

      const citation: RagCitationSource = {
        sourceId,
        courseId: String(item.allowedCourse.courseId),
        courseCode: item.allowedCourse.courseCode,
        courseTitle,
        fileName: item.allowedCourse.fileName,
        pageNumber: item.chunk.pageNumber,
        score: Number(item.finalScore.toFixed(3)),
      };

      evidenceMap.set(sourceId, citation);
      chunks.push({ ...citation, text: excerpt });
      contextBlocks.push(
        `<document_excerpt id="${sourceId}" course="${citation.courseCode} - ${courseTitle}" page="${citation.pageNumber}">\n${excerpt}\n</document_excerpt>`,
      );
      currentChars += excerpt.length;
    }

    return {
      contextPrompt: contextBlocks.join('\n\n'),
      evidenceMap,
      chunks,
    };
  }

  /**
   * P0 Server-Side Citation Verification & Resolution:
   * - Requires every cited [S#] tag to exist in the server-supplied evidenceMap.
   * - Strips fabricated citation tags.
   * - Rejects responses marked [INSUFFICIENT_EVIDENCE] or lacking any valid citation.
   */
  verifyAndResolveCitations(
    rawModelOutput: string,
    evidenceMap: Map<string, RagCitationSource>,
  ): {
    grounded: boolean;
    answer: string;
    sources: RagCitationSource[];
  } {
    const trimmed = (rawModelOutput || '').trim();
    if (
      !trimmed ||
      trimmed.includes('[INSUFFICIENT_EVIDENCE]') ||
      evidenceMap.size === 0
    ) {
      return { grounded: false, answer: '', sources: [] };
    }

    const citedIds: string[] = [];
    const seenIds = new Set<string>();
    const tagMatches = trimmed.matchAll(/\[(S\d+)\]/g);

    for (const match of tagMatches) {
      const id = match[1];
      if (evidenceMap.has(id) && !seenIds.has(id)) {
        seenIds.add(id);
        citedIds.push(id);
      }
    }

    if (citedIds.length === 0) {
      return { grounded: false, answer: '', sources: [] };
    }

    // Remove any unknown/hallucinated [S#] markers from the visible answer text
    const cleanedAnswer = trimmed
      .replace(/\[(S\d+)\]/g, (full, id: string) =>
        evidenceMap.has(id) ? full : '',
      )
      .replace(/ {2,}/g, ' ')
      .replace(/\s+([.،,؛!?؟])/g, '$1')
      .trim();

    const sources = citedIds
      .map((id) => evidenceMap.get(id))
      .filter((s): s is RagCitationSource => Boolean(s));

    return {
      grounded: Boolean(cleanedAnswer) && sources.length > 0,
      answer: cleanedAnswer,
      sources,
    };
  }

  private computeLexicalScore(
    normalizedQuery: string,
    queryTerms: string[],
    expandedTerms: string[],
    normalizedChunkText: string,
    chunkTerms: string[],
  ): number {
    if (!normalizedChunkText) return 0;
    const chunkTermSet = new Set(chunkTerms);

    let hits = 0;
    for (const term of queryTerms) {
      const variants = term.startsWith('ال')
        ? [term, term.slice(2)]
        : [term, `ال${term}`];
      if (
        variants.some(
          (v) => chunkTermSet.has(v) || normalizedChunkText.includes(v),
        )
      ) {
        hits += 1;
      }
    }

    let expandedHits = 0;
    for (const term of expandedTerms) {
      if (queryTerms.includes(term)) continue;
      if (chunkTermSet.has(term) || normalizedChunkText.includes(term)) {
        expandedHits += 0.45;
      }
    }

    const denominator = Math.max(1, queryTerms.length);
    const ratio = Math.min(1, (hits + expandedHits) / denominator);
    const exactPhraseBoost =
      normalizedQuery.length >= 6 &&
      normalizedChunkText.includes(normalizedQuery)
        ? 0.25
        : 0;

    return Math.min(1, ratio * 0.85 + exactPhraseBoost);
  }

  private isCourseMentionedInQuery(
    normalizedQuery: string,
    course: EligibleCourseSyllabus,
  ): boolean {
    const codeNorm = normalizeFaqText(course.courseCode);
    if (codeNorm && normalizedQuery.includes(codeNorm)) {
      return true;
    }
    const arTerms = faqTerms(course.titleAr).filter((t) => t.length >= 3);
    if (
      arTerms.length > 0 &&
      arTerms.every((t) => normalizedQuery.includes(t))
    ) {
      return true;
    }
    const enTerms = faqTerms(course.titleEn).filter((t) => t.length >= 3);
    if (
      enTerms.length > 0 &&
      enTerms.every((t) => normalizedQuery.includes(t))
    ) {
      return true;
    }
    return false;
  }

  private jaccardSimilarity(termsA: string[], termsB: string[]): number {
    if (termsA.length === 0 || termsB.length === 0) return 0;
    const setA = new Set(termsA);
    const setB = new Set(termsB);
    let intersection = 0;
    for (const term of setA) {
      if (setB.has(term)) intersection += 1;
    }
    const union = setA.size + setB.size - intersection;
    return union > 0 ? intersection / union : 0;
  }

  /**
   * Executes a native MongoDB Atlas $vectorSearch stage with server-side pre-filtering
   * when RAG_ATLAS_VECTOR_INDEX is configured. Returns null to trigger in-server fallback
   * if not configured or if running on a local/non-Atlas MongoDB instance.
   */
  private async tryAtlasVectorSearch(params: {
    queryVector?: number[];
    eligibleCourseIds: Types.ObjectId[];
    activeShas: string[];
    embeddingModel: string;
    topK: number;
  }): Promise<Array<
    RagChunk & { _id?: Types.ObjectId; vectorSearchScore?: number }
  > | null> {
    const indexName = this.config
      ?.get<string>('RAG_ATLAS_VECTOR_INDEX')
      ?.trim();
    if (
      !indexName ||
      !params.queryVector?.length ||
      typeof this.chunks.aggregate !== 'function'
    ) {
      return null;
    }

    try {
      const results = await this.chunks.aggregate<
        RagChunk & { _id?: Types.ObjectId; vectorSearchScore?: number }
      >([
        {
          $vectorSearch: {
            index: indexName,
            path: 'embedding',
            queryVector: params.queryVector,
            numCandidates: Math.max(params.topK * 15, 60),
            limit: Math.max(params.topK * 6, 24),
            filter: {
              $and: [
                { courseId: { $in: params.eligibleCourseIds } },
                { sha256: { $in: params.activeShas } },
                { isActive: { $eq: true } },
                { embeddingModel: { $eq: params.embeddingModel } },
              ],
            },
          },
        },
        {
          $project: {
            documentId: 1,
            courseId: 1,
            courseCode: 1,
            sha256: 1,
            pageNumber: 1,
            chunkIndex: 1,
            text: 1,
            normalizedText: 1,
            terms: 1,
            embeddingDimensions: 1,
            vectorSearchScore: { $meta: 'vectorSearchScore' },
          },
        },
      ]);
      return Array.isArray(results) ? results : null;
    } catch {
      return null;
    }
  }
}
