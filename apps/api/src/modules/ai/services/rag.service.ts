import { Injectable, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { FaqsService } from '../../faqs/faqs.service';
import { faqTermPattern, faqTerms, scoreFaq } from '../../faqs/faq-retrieval';
import { Course } from '../../courses/schemas/course.schema';
import { GeminiProvider } from '../providers/gemini.provider';
import {
  RagDocumentSearchService,
  type RagCitationSource,
  type RetrievedDocumentEvidence,
} from './rag-document-search.service';

/**
 * Retrieval-Augmented Generation service.
 *
 * Retrieves relevant context from the database (FAQs, courses, and
 * student-eligible syllabus PDF chunks) and formats it for inclusion
 * in LLM prompts with strict server-side citation verification.
 */
@Injectable()
export class RagService {
  constructor(
    private readonly faqs: FaqsService,
    @InjectModel(Course.name) private readonly courseModel: Model<Course>,
    private readonly gemini: GeminiProvider,
    @Optional() private readonly documentSearch?: RagDocumentSearchService,
  ) {}

  /**
   * Retrieve FAQ entries relevant to the user's query.
   */
  async retrieveFaqs(query: string, limit = 5): Promise<string> {
    const faqs = await this.faqs.findRelevant(query, limit);

    return faqs
      .map(
        ({ faq }, i) =>
          `FAQ ${i + 1}:\nQ: ${faq.question}\nA: ${faq.answer}${
            faq.topics?.length ? `\nTopics: ${faq.topics.join(', ')}` : ''
          }`,
      )
      .join('\n\n');
  }

  async findAnswer(
    query: string,
    locale: 'ar' | 'en',
  ): Promise<string | undefined> {
    const matches = await this.faqs.findRelevant(query, 20);
    return matches.find(
      ({ faq }) =>
        /\p{Script=Arabic}/u.test(faq.question) === (locale === 'ar'),
    )?.faq.answer;
  }

  /**
   * Retrieve course information relevant to a query.
   * Evaluates all matching active courses before scoring to avoid alphabetical truncation.
   */
  async retrieveCourses(
    query: string,
    limit = 10,
    locale: 'ar' | 'en' = 'en',
  ): Promise<string> {
    const terms = faqTerms(query).filter((term) => term.length >= 2);

    if (terms.length === 0) return '';

    const pattern = new RegExp(terms.map(faqTermPattern).join('|'), 'iu');
    const courses = await this.courseModel
      .find({
        isActive: true,
        $or: [
          { code: pattern },
          { name: pattern },
          { nameAr: pattern },
          { nameEn: pattern },
        ],
      })
      .select(
        'code name nameAr nameEn creditHours prerequisites level semester type',
      )
      .limit(300)
      .lean();

    if (courses.length === 0) return '';

    return courses
      .map((course) => ({
        course,
        score: Math.max(
          ...[course.code, course.name, course.nameAr, course.nameEn]
            .filter((name): name is string => Boolean(name))
            .map((question) => scoreFaq(query, terms, { question })),
        ),
      }))
      .filter(({ score }) => score >= 4)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ course: c }) => {
        const localizedName =
          locale === 'ar'
            ? c.nameAr || c.name || c.nameEn
            : c.nameEn || c.name || c.nameAr;
        return (
          `Course: ${localizedName} (code: ${c.code})\n` +
          `Level: ${c.level}, Semester: ${c.semester}, Credits: ${c.creditHours ?? 0}\n` +
          `Type: ${c.type ?? 'N/A'}` +
          (c.prerequisites?.length
            ? `\nPrerequisites: ${c.prerequisites.join(', ')}`
            : '')
        );
      })
      .join('\n\n');
  }

  /**
   * Retrieve student-authorized PDF document excerpts and citation metadata.
   */
  async retrieveDocumentExcerpts(
    studentId: string,
    query: string,
    locale: 'ar' | 'en' = 'ar',
  ): Promise<RetrievedDocumentEvidence | undefined> {
    if (!this.documentSearch) return undefined;
    return this.documentSearch.searchForStudent(studentId, query, { locale });
  }

  /**
   * Verify model citations against server-supplied document evidence.
   */
  verifyDocumentCitations(
    rawAnswer: string,
    evidenceMap: Map<string, RagCitationSource>,
  ): {
    grounded: boolean;
    answer: string;
    sources: RagCitationSource[];
  } {
    if (!this.documentSearch) {
      return { grounded: false, answer: '', sources: [] };
    }
    return this.documentSearch.verifyAndResolveCitations(
      rawAnswer,
      evidenceMap,
    );
  }

  /**
   * Build a combined context string for the LLM prompt.
   */
  async buildContext(
    query: string,
    options?: {
      includeFaqs?: boolean;
      includeCourses?: boolean;
      locale?: 'ar' | 'en';
    },
  ): Promise<string> {
    const parts: string[] = [];

    if (options?.includeFaqs !== false) {
      const faqContext = await this.retrieveFaqs(query);
      if (faqContext) {
        parts.push(`## Relevant FAQs\n${faqContext}`);
      }
    }

    if (options?.includeCourses !== false) {
      const courseContext = await this.retrieveCourses(
        query,
        10,
        options?.locale,
      );
      if (courseContext) {
        parts.push(`## Relevant Courses\n${courseContext}`);
      }
    }

    return parts.join('\n\n---\n\n');
  }

  /**
   * Generate an embedding for query retrieval.
   */
  async generateEmbedding(text: string): Promise<number[]> {
    return this.gemini.embed(text, { taskType: 'RETRIEVAL_QUERY' });
  }
}
