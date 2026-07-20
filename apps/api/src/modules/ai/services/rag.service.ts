import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Faq } from '../../faqs/schemas/faq.schema';
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
    @InjectModel(Faq.name) private readonly faqModel: Model<Faq>,
    @InjectModel(Course.name) private readonly courseModel: Model<Course>,
    private readonly gemini: GeminiProvider,
  ) {}

  /**
   * Retrieve FAQ entries relevant to the user's query.
   * Uses text search for now; will be upgraded to Atlas Vector Search.
   */
  async retrieveFaqs(query: string, limit = 5): Promise<string> {
    const terms = query
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((t) => t.length > 1);

    if (terms.length === 0) return '';

    const regexFilter = {
      isActive: true,
      $or: terms.flatMap((term) => [
        { question: { $regex: term, $options: 'i' } },
        { answer: { $regex: term, $options: 'i' } },
        { keywords: { $regex: term, $options: 'i' } },
        { topics: { $regex: term, $options: 'i' } },
      ]),
    };

    const faqs = await this.faqModel.find(regexFilter).limit(limit).lean();

    if (faqs.length === 0) return '';

    return faqs
      .map(
        (faq, i) =>
          `FAQ ${i + 1}:\nQ: ${faq.question}\nA: ${faq.answer}${
            faq.topics?.length ? `\nTopics: ${faq.topics.join(', ')}` : ''
          }`,
      )
      .join('\n\n');
  }

  /**
   * Retrieve course information relevant to a query.
   */
  async retrieveCourses(
    query: string,
    limit = 10,
    locale: 'ar' | 'en' = 'en',
  ): Promise<string> {
    const terms = query
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((t) => t.length > 1);

    if (terms.length === 0) return '';

    const courses = await this.courseModel
      .find({
        isActive: true,
        $or: terms.flatMap((term) => [
          { code: { $regex: term, $options: 'i' } },
          { name: { $regex: term, $options: 'i' } },
          { nameAr: { $regex: term, $options: 'i' } },
          { nameEn: { $regex: term, $options: 'i' } },
        ]),
      })
      .select(
        'code name nameAr nameEn creditHours prerequisites level semester type',
      )
      .limit(limit)
      .lean();

    if (courses.length === 0) return '';

    return courses
      .map((c) => {
        const localizedName =
          locale === 'ar'
            ? c.nameAr || c.name || c.nameEn
            : c.nameEn || c.name || c.nameAr;
        return (
          `Course: ${localizedName}\n` +
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
