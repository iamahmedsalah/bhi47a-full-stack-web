import { Types } from 'mongoose';
import { FaqsService } from './faqs.service';
import { DEFAULT_FAQ_ITEMS } from './default-faqs.data';
import {
  PERMISSIONS,
  STAFF_TYPE_DEFAULT_PERMISSIONS,
} from '@student-portal/shared';

function createChainMock<T>(value: T) {
  return {
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(value),
  };
}

describe('FaqsService', () => {
  it('filters public FAQs by locale and search together using $and', async () => {
    const items = [
      {
        _id: new Types.ObjectId(),
        question: 'كيف أعرف مكان الامتحان؟',
        answer: 'من صفحة مكان الامتحان.',
        topics: ['الامتحانات'],
        keywords: ['اللجنة'],
        isActive: true,
        sortOrder: 1,
      },
    ];

    const findMock = jest.fn().mockReturnValue(createChainMock(items));
    const countMock = jest.fn().mockResolvedValue(1);
    const model = {
      find: findMock,
      countDocuments: countMock,
    } as never;

    const service = new FaqsService(model);
    const result = await service.findAll({
      locale: 'ar',
      topic: 'الامتحانات',
      search: 'اللجنة',
      page: 1,
      limit: 20,
    });

    expect(result.items).toHaveLength(1);
    const passedFilter = findMock.mock.calls[0][0] as Record<string, unknown>;
    expect(passedFilter.isActive).toBe(true);
    expect(passedFilter.topics).toBe('الامتحانات');
    expect(Array.isArray(passedFilter.$and)).toBe(true);
    expect((passedFilter.$and as unknown[]).length).toBe(2);
  });

  it('adds starter FAQs as drafts and never overwrites existing entries', async () => {
    const updateOneMock = jest
      .fn()
      .mockResolvedValueOnce({ upsertedCount: 1 })
      .mockResolvedValue({ upsertedCount: 0 });
    const model = {
      updateOne: updateOneMock,
    } as never;

    const service = new FaqsService(model);
    const userId = new Types.ObjectId().toHexString();
    const result = await service.seedDefaults(userId);

    expect(updateOneMock).toHaveBeenCalledTimes(DEFAULT_FAQ_ITEMS.length);
    for (const [filter, update, options] of updateOneMock.mock.calls) {
      expect(filter).toEqual({ question: expect.any(String) });
      expect(update).toEqual({
        $setOnInsert: expect.objectContaining({ isActive: false }),
      });
      expect(options).toEqual({ upsert: true });
    }
    expect(result).toEqual({
      inserted: 1,
      skipped: DEFAULT_FAQ_ITEMS.length - 1,
      total: DEFAULT_FAQ_ITEMS.length,
    });
  });

  it('bulk removes FAQs by ObjectId list', async () => {
    const id1 = new Types.ObjectId().toHexString();
    const id2 = new Types.ObjectId().toHexString();
    const deleteManyMock = jest.fn().mockResolvedValue({ deletedCount: 2 });
    const model = { deleteMany: deleteManyMock } as never;

    const service = new FaqsService(model);
    const result = await service.bulkRemove([id1, id2, id1]);

    expect(deleteManyMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ deletedCount: 2 });
  });

  it('includes FAQS_READ and FAQS_WRITE in default administrative staff permissions', () => {
    const adminStaffDefaults = STAFF_TYPE_DEFAULT_PERMISSIONS.administrative;
    expect(adminStaffDefaults).toContain(PERMISSIONS.FAQS_READ);
    expect(adminStaffDefaults).toContain(PERMISSIONS.FAQS_WRITE);
  });

  it('uses a PCRE2-safe $regex string without \\u escapes for locale=ar', async () => {
    const findMock = jest.fn().mockReturnValue(createChainMock([]));
    const countMock = jest.fn().mockResolvedValue(0);
    const service = new FaqsService({
      find: findMock,
      countDocuments: countMock,
    } as never);

    await service.findAll({ locale: 'ar', page: 1, limit: 100 });

    const passedFilter = findMock.mock.calls[0][0] as {
      question?: { $regex?: unknown };
    };
    const pattern = passedFilter.question?.$regex;
    expect(typeof pattern).toBe('string');
    expect(String(pattern)).not.toContain('\\u');
    const regex = new RegExp(String(pattern));
    expect(regex.test('كيف أعرف الجدول؟')).toBe(true);
    expect(regex.test('How do I view the schedule?')).toBe(false);
  });

  it('uses a PCRE2-safe RegExp under $not without \\u escapes for locale=en', async () => {
    const findMock = jest.fn().mockReturnValue(createChainMock([]));
    const countMock = jest.fn().mockResolvedValue(0);
    const service = new FaqsService({
      find: findMock,
      countDocuments: countMock,
    } as never);

    await service.findAll({ locale: 'en', page: 1, limit: 100 });

    const passedFilter = findMock.mock.calls[0][0] as {
      question?: { $not?: unknown };
    };
    const pattern = passedFilter.question?.$not;
    expect(pattern).toBeInstanceOf(RegExp);
    expect((pattern as RegExp).source).not.toContain('\\u');
    expect((pattern as RegExp).test('كيف أعرف الجدول؟')).toBe(true);
    expect((pattern as RegExp).test('How do I view the schedule?')).toBe(false);
  });
});
