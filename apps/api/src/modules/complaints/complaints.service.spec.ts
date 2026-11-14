import { Types } from 'mongoose';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ComplaintsService } from './complaints.service';
import { QueryComplaintDto } from './dto/complaint.dto';

describe('complaint list', () => {
  it('requests only the selected page and preserves the full matching total', async () => {
    const chain = {
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    };
    const countDocuments = jest.fn().mockResolvedValue(87);
    const service = new ComplaintsService(
      { find: jest.fn().mockReturnValue(chain), countDocuments } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    expect(
      await service.findAll({ page: 3, limit: 20, status: 'open' }),
    ).toMatchObject({ page: 3, limit: 20, total: 87, totalPages: 5 });
    expect(chain.skip).toHaveBeenCalledWith(40);
    expect(chain.limit).toHaveBeenCalledWith(20);
    expect(countDocuments).toHaveBeenCalledWith({ status: 'open' });
    expect(chain.select).toHaveBeenCalledWith('');
  });

  it('keeps student ownership filtering when paging and searching', async () => {
    const studentId = new Types.ObjectId().toHexString();
    const find = jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    });
    const countDocuments = jest.fn().mockResolvedValue(25);
    const studentLookup = {
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ studentCode: '2026001' }),
    };
    const service = new ComplaintsService(
      { find, countDocuments } as never,
      {} as never,
      {
        findById: jest.fn().mockReturnValue(studentLookup),
      } as never,
      {} as never,
      {} as never,
    );
    expect(
      await service.findByStudent(studentId, {
        page: 2,
        limit: 10,
        search: 'ticket.*',
      }),
    ).toMatchObject({ total: 25, totalPages: 3 });
    const filter = find.mock.calls[0][0];
    expect(filter.$or).toContainEqual({ studentCode: '2026001' });
    expect(filter.$or).toContainEqual({
      studentId: new Types.ObjectId(studentId),
    });
    expect(filter.$or).toContainEqual({ studentId });
    expect(studentLookup.select).toHaveBeenCalledWith('studentCode');
    expect(filter.$and[0].$or[0].ticketNumber.$regex).toBe('ticket\\.\\*');
    expect(countDocuments).toHaveBeenCalledWith(filter);
  });

  it.each([null, {}])(
    'keeps ticket bodies, screenshots and ownership matching without a legacy student code (%p)',
    async (student) => {
      const studentId = new Types.ObjectId().toHexString();
      const items = [
        {
          _id: 'ticket-id',
          description: 'Full ticket body',
          screenshotUrl: 'data:image/png;base64,c3ludGhldGlj',
          replies: [{ message: 'Existing reply' }],
        },
      ];
      const chain = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(items),
      };
      const find = jest.fn().mockReturnValue(chain);
      const service = new ComplaintsService(
        { find, countDocuments: jest.fn().mockResolvedValue(1) } as never,
        {} as never,
        {
          findById: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue(student),
            }),
          }),
        } as never,
        {} as never,
        {} as never,
      );
      expect(await service.findByStudent(studentId)).toMatchObject({
        items,
        total: 1,
        page: 1,
      });
      expect(find.mock.calls[0][0]).toEqual({
        $or: [{ studentId: new Types.ObjectId(studentId) }, { studentId }],
      });
      expect(chain.sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
    },
  );

  it('returns zero summary values for an empty collection without fetching ticket bodies', async () => {
    const aggregate = jest
      .fn()
      .mockReturnValue({ option: jest.fn().mockResolvedValue([]) });
    const service = new ComplaintsService(
      { aggregate } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    expect(await service.getStats()).toMatchObject({
      total: 0,
      open: 0,
      avgResolutionMs: null,
    });
    expect(aggregate.mock.calls[0][0][0].$group.total).toEqual({ $sum: 1 });
  });

  it('validates numeric pagination query strings and rejects unbounded or invalid pages', async () => {
    const valid = plainToInstance(QueryComplaintDto, {
      page: '3',
      limit: '20',
    });
    expect(await validate(valid)).toEqual([]);
    expect(valid).toMatchObject({ page: 3, limit: 20 });
    for (const params of [
      { page: '0' },
      { page: '1.5' },
      { limit: '1000' },
      { limit: '-1' },
      { page: 'abc' },
    ]) {
      expect(
        (await validate(plainToInstance(QueryComplaintDto, params))).length,
      ).toBeGreaterThan(0);
    }
  });

  it('enriches missing national IDs without requesting full user documents', async () => {
    const studentId = new Types.ObjectId();
    const items = [{ studentId, nationalId: undefined as string | undefined }];
    const lean = jest.fn().mockResolvedValue(items);
    const chain = {
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean,
    };
    const select = jest.fn().mockReturnValue({
      lean: jest
        .fn()
        .mockResolvedValue([{ _id: studentId, nationalId: '30101011234567' }]),
    });
    const service = new ComplaintsService(
      {
        find: jest.fn().mockReturnValue(chain),
        countDocuments: jest.fn().mockResolvedValue(1),
      } as never,
      {} as never,
      { find: jest.fn().mockReturnValue({ select }) } as never,
      {} as never,
      {} as never,
    );
    const result = await service.findAll({ limit: 20, page: 1 });
    expect(result).toMatchObject({
      total: 1,
      page: 1,
      items: [{ nationalId: '30101011234567' }],
    });
    expect(select).toHaveBeenCalledWith({ _id: 1, nationalId: 1 });
  });

  it('rejects malformed staff filters as validation failures before a database cast', async () => {
    const invalid = Object.assign(new QueryComplaintDto(), {
      assignedStaffId: 'invalid-id',
    });
    expect(
      (await validate(invalid)).some(
        (error) => error.property === 'assignedStaffId',
      ),
    ).toBe(true);
    expect(
      await validate(
        Object.assign(new QueryComplaintDto(), {
          assignedStaffId: new Types.ObjectId().toHexString(),
        }),
      ),
    ).toEqual([]);
  });

  it('excludes large ticket bodies only for the opt-in summary and keeps filters, counts and ordering', async () => {
    const chain = {
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([{ ticketNumber: 'TKT-1' }]),
    };
    const find = jest.fn().mockReturnValue(chain);
    const countDocuments = jest.fn().mockResolvedValue(42);
    const service = new ComplaintsService(
      { find, countDocuments } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const result = await service.findAll({
      view: 'summary',
      status: 'open',
      page: 2,
      limit: 10,
    });
    expect(chain.select).toHaveBeenCalledWith(
      '-description -screenshotUrl -replies -internalNotes -statusHistory',
    );
    expect(chain.sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
    expect(chain.skip).toHaveBeenCalledWith(10);
    expect(find).toHaveBeenCalledWith({ status: 'open' });
    expect(countDocuments).toHaveBeenCalledWith({ status: 'open' });
    expect(result).toMatchObject({
      total: 42,
      totalPages: 5,
      items: [{ ticketNumber: 'TKT-1' }],
    });
    expect(
      (
        await validate(
          Object.assign(new QueryComplaintDto(), { view: 'invalid' }),
        )
      ).length,
    ).toBeGreaterThan(0);
  });
});
