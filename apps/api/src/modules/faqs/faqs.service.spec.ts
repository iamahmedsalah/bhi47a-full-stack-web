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

  it('idempotently seeds default FAQs and reports inserted vs skipped counts', async () => {
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
});
