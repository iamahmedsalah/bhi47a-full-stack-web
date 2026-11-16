import { Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '../../core/cache/cache.service';
import { CoursesService } from './courses.service';

describe('hydrated course list cache', () => {
  it('does no course or staff reads on a warm hit and separates caller roles', async () => {
    const doctorId = new Types.ObjectId();
    const course = {
      _id: new Types.ObjectId(),
      code: '111',
      doctorId,
      doctorName: 'Old name',
    };
    const chain = {
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([course]),
    };
    const courses = {
      find: jest.fn().mockReturnValue(chain),
      countDocuments: jest.fn().mockResolvedValue(1),
    };
    const users = {
      find: jest.fn().mockReturnValue({
        select: () => ({
          lean: () =>
            Promise.resolve([{ _id: doctorId, name: 'Current name' }]),
        }),
      }),
    };
    const config = new ConfigService({ NODE_ENV: 'test' });
    const cache = new CacheService(config);
    try {
      const service = new CoursesService(
        courses as never,
        {} as never,
        {} as never,
        {} as never,
        users as never,
        config,
        cache,
      );
      const caller = { _id: String(doctorId), role: 'admin' };
      const first = await service.findAll({}, caller);
      const second = await service.findAll({}, caller);
      expect(second).toEqual(first);
      expect(users.find).toHaveBeenCalledTimes(1);
      expect(courses.find).toHaveBeenCalledTimes(1);
      await service.findAll({}, { ...caller, role: 'staff' });
      expect(courses.find).toHaveBeenCalledTimes(2);
      await cache.delPattern('courses:*');
      await service.findAll({}, caller);
      expect(users.find).toHaveBeenCalledTimes(3);
    } finally {
      await cache.onModuleDestroy();
    }
  });
});
