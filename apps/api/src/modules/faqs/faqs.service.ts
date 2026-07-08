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
import { Faq, FaqDocument } from './schemas/faq.schema';

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

    if (query.search) {
      const search = normalizeSearchTerm(query.search);
      filter.$or = [
        { question: { $regex: search, $options: 'i' } },
        { answer: { $regex: search, $options: 'i' } },
        { keywords: { $regex: search, $options: 'i' } },
        { topics: { $regex: search, $options: 'i' } },
      ];
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

  async ask(dto: AskFaqDto) {
    const messageTerms = this.tokenize(dto.message);
    const faqs = await this.faqModel
      .find({ isActive: true })
      .sort({ sortOrder: 1, createdAt: -1 })
      .lean();

    const matches = faqs
      .map((faq) => ({
        faq,
        score: this.scoreFaq(messageTerms, faq),
      }))
      .filter((match) => match.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    if (matches.length === 0) {
      return {
        answer:
          'I could not find a matching FAQ yet. Please submit a complaint or contact student affairs for help.',
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

  private scoreFaq(terms: string[], faq: Faq): number {
    const haystack = [
      faq.question,
      faq.answer,
      ...(faq.topics || []),
      ...(faq.keywords || []),
    ]
      .join(' ')
      .toLowerCase();

    return terms.reduce((score, term) => {
      if (faq.keywords?.map((item) => this.normalize(item)).includes(term)) {
        return score + 3;
      }
      if (faq.topics?.map((item) => this.normalize(item)).includes(term)) {
        return score + 2;
      }
      return haystack.includes(term) ? score + 1 : score;
    }, 0);
  }

  private tokenize(value: string): string[] {
    return [
      ...new Set(
        value
          .toLowerCase()
          .split(/[^\p{L}\p{N}]+/u)
          .map((term) => this.normalize(term))
          .filter((term) => term.length > 1),
      ),
    ];
  }

  private normalizeList(values?: string[]): string[] {
    return [...new Set((values || []).map((value) => this.normalize(value)))];
  }

  private normalize(value: string): string {
    return value.trim().toLowerCase();
  }
}
