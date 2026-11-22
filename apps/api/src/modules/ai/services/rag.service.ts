import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { FaqsService } from '../../faqs/faqs.service';
import { faqTermPattern, faqTerms, scoreFaq } from '../../faqs/faq-retrieval';
import { Course } from '../../courses/schemas/course.schema';
import { GeminiProvider } from '../providers/gemini.provider';

/**
 * Retrieval-Augmented Generation service.
 *
 * Retrieves relevant context from the database (FAQs, courses, grades)
 * and formats it for inclusion in LLM prompts. Supports both keyword-based
 * and (future) vector-based retrieval.
 */
@Injectable()
export class RagService {
  constructor(
    private readonly faqs: FaqsService,
    @InjectModel(Course.name) private readonly courseModel: Model<Course>,
    private readonly gemini: GeminiProvider,
  ) {}

  /**
   * Retrieve FAQ entries relevant to the user's query.
   * Uses text search for now; will be upgraded to Atlas Vector Search.
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
   */
  async retrieveCourses(
    query: string,
    limit = 10,
    locale: 'ar' | 'en' = 'en',
  ): Promise<string> {
    const terms = faqTerms(query).filter((term) => term.length >= 3);

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
      .sort({ code: 1 })
      .limit(60)
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
   * Generate an embedding for future Atlas Vector Search integration.
   */
  async generateEmbedding(text: string): Promise<number[]> {
    return this.gemini.embed(text, { taskType: 'RETRIEVAL_QUERY' });
  }
}
