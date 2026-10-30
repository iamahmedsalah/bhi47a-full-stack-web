import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { QueryCourseDto } from './course.dto';

describe('staff management assigned-course request', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });
  const metadata = { type: 'query' as const, metatype: QueryCourseDto };
  const query = {
    staffId: '507f1f77bcf86cd799439011',
    page: '1',
    limit: '100',
  };

  it('accepts the staff dialog request with pagination', async () => {
    await expect(pipe.transform(query, metadata)).resolves.toMatchObject({
      staffId: query.staffId,
      limit: 100,
    });
  });

  it('rejects the old cache-busting parameter that was silently rendered as an empty list', async () => {
    await expect(
      pipe.transform({ ...query, _t: Date.now() }, metadata),
    ).rejects.toThrow(BadRequestException);
  });
});
