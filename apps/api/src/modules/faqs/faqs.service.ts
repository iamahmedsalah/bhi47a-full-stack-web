import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import {
  buildPaginationOptions,
  createPaginatedResult,
} from '../../common/utils/pagination.util';
import { normalizeSearchTerm } from '../../common/utils/search.util';
import {
  AskFaqDto,
  CreateFaqDto,
  QueryFaqDto,
  UpdateFaqDto,
} from './dto/faq.dto';
import { DEFAULT_FAQ_ITEMS } from './default-faqs.data';
import { Faq, FaqDocument } from './schemas/faq.schema';
import { faqTermPattern, faqTerms, scoreFaq } from './faq-retrieval';

// MongoDB's PCRE2 regex engine rejects JS \uXXXX escapes from RegExp literals
// (/[\u0600-\u06FF]/ serializes with literal "\\u"). Decoding via a JS string
// yields the UTF-8 character range that both MongoDB PCRE2 and JS accept.
const ARABIC_CHAR_PATTERN = '[\u0600-\u06FF]';
const ARABIC_CHAR_REGEX = new RegExp(ARABIC_CHAR_PATTERN);

@Injectable()
export class FaqsService {
  constructor(@InjectModel(Faq.name) private faqModel: Model<FaqDocument>) {}

  async create(dto: CreateFaqDto, userId: string): Promise<FaqDocument> {
    const faq = new this.faqModel({
      ...dto,
      topics: this.normalizeList(dto.topics),
      keywords: this.normalizeList(dto.keywords),
      createdBy: new Types.ObjectId(userId),
    });

    return faq.save();
  }

  async findAll(query: QueryFaqDto, adminView = false) {
    const { page, limit, skip } = buildPaginationOptions(query);
    const filter: FilterQuery<FaqDocument> = {};

    if (!adminView) {
      filter.isActive = true;
    } else if (query.isActive !== undefined) {
      filter.isActive = query.isActive;
    }

    if (query.topic) {
      filter.topics = this.normalize(query.topic);
    }

    const andConditions: FilterQuery<FaqDocument>[] = [];

    if (query.locale === 'ar') {
      andConditions.push({ question: { $regex: ARABIC_CHAR_PATTERN } });
    } else if (query.locale === 'en') {
      andConditions.push({ question: { $not: ARABIC_CHAR_REGEX } });
    }

    if (query.search) {
      const search = normalizeSearchTerm(query.search);
      andConditions.push({
        $or: [
          { question: { $regex: search, $options: 'i' } },
          { answer: { $regex: search, $options: 'i' } },
          { keywords: { $regex: search, $options: 'i' } },
          { topics: { $regex: search, $options: 'i' } },
        ],
      });
    }

    if (andConditions.length === 1) {
      Object.assign(filter, andConditions[0]);
    } else if (andConditions.length > 1) {
      filter.$and = andConditions;
    }

    const [items, total] = await Promise.all([
      this.faqModel
        .find(filter)
        .sort({ sortOrder: 1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.faqModel.countDocuments(filter),
    ]);

    return createPaginatedResult(items, total, page, limit);
  }

  async update(
    id: string,
    dto: UpdateFaqDto,
    userId: string,
  ): Promise<FaqDocument> {
    const updateData = {
      ...dto,
      updatedBy: new Types.ObjectId(userId),
    };

    if (dto.topics) {
      updateData.topics = this.normalizeList(dto.topics);
    }

    if (dto.keywords) {
      updateData.keywords = this.normalizeList(dto.keywords);
    }

    const updated = await this.faqModel.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true },
    );

    if (!updated) {
      throw new NotFoundException('FAQ not found');
    }

    return updated;
  }

  async remove(id: string): Promise<{ message: string }> {
    const deleted = await this.faqModel.findByIdAndDelete(id);
    if (!deleted) {
      throw new NotFoundException('FAQ not found');
    }

    return { message: 'FAQ deleted successfully' };
  }

  async bulkRemove(ids: string[]): Promise<{ deletedCount: number }> {
    const uniqueIds = [...new Set(ids)].map((id) => new Types.ObjectId(id));
    const result = await this.faqModel.deleteMany({ _id: { $in: uniqueIds } });
    return { deletedCount: result.deletedCount ?? 0 };
  }

  async seedDefaults(
    userId?: string,
  ): Promise<{ inserted: number; skipped: number; total: number }> {
    let inserted = 0;
    let skipped = 0;
    const creatorId =
      userId && Types.ObjectId.isValid(userId)
        ? new Types.ObjectId(userId)
        : undefined;

    for (const item of DEFAULT_FAQ_ITEMS) {
      const result = await this.faqModel.updateOne(
        { question: item.question },
        {
          $setOnInsert: {
            question: item.question,
            answer: item.answer,
            topics: this.normalizeList(item.topics),
            keywords: this.normalizeList(item.keywords),
            isActive: item.isActive,
            sortOrder: item.sortOrder,
            ...(creatorId ? { createdBy: creatorId } : {}),
          },
        },
        { upsert: true },
      );

      if (result.upsertedCount > 0) {
        inserted += 1;
      } else {
        skipped += 1;
      }
    }

    return {
      inserted,
      skipped,
      total: DEFAULT_FAQ_ITEMS.length,
    };
  }

  async ask(dto: AskFaqDto) {
    const messageTerms = faqTerms(dto.message);
    const matches = await this.findRelevant(dto.message);

    if (matches.length === 0) {
      return {
        answer: /\p{Script=Arabic}/u.test(dto.message)
          ? 'ملقتش إجابة معتمدة للسؤال ده. تقدر تتواصل مع شؤون الطلاب أو تبعت استفسار من صفحة الشكاوى.'
          : 'I could not find a matching FAQ yet. Please submit an inquiry or contact student affairs.',
        confidence: 0,
        matches: [],
      };
    }

    const best = matches[0];
    return {
      answer: best.faq.answer,
      confidence: Math.min(1, best.score / Math.max(3, messageTerms.length)),
      matches: matches.map((match) => ({
        id: match.faq._id,
        question: match.faq.question,
        answer: match.faq.answer,
        topics: match.faq.topics,
        score: match.score,
      })),
    };
  }

  async findRelevant(query: string, limit = 5) {
    const terms = faqTerms(query);
    if (!terms.length) return [];
    const pattern = new RegExp(terms.map(faqTermPattern).join('|'), 'iu');
    const candidates = await this.faqModel
      .find({
        isActive: true,
        $or: [
          { question: pattern },
          { keywords: pattern },
          { topics: pattern },
        ],
      })
      .select('question answer keywords topics')
      .sort({ sortOrder: 1, createdAt: -1, _id: 1 })
      .limit(100)
      .lean();
    return candidates
      .map((faq) => ({ faq, score: scoreFaq(query, terms, faq) }))
      .filter((match) => match.score >= 3)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private normalizeList(values?: string[]): string[] {
    return [...new Set((values || []).map((value) => this.normalize(value)))];
  }

  private normalize(value: string): string {
    return value.trim().toLowerCase();
  }
}
