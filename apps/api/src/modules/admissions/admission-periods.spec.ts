import 'reflect-metadata';
import { ValidationPipe, type ArgumentMetadata } from '@nestjs/common';
import { Types, type Model } from 'mongoose';
import {
  admissionPeriodStatus,
  isAdmissionAcademicYear,
  PERMISSIONS,
  STAFF_TYPE_DEFAULT_PERMISSIONS,
} from '@student-portal/shared';
import { AdmissionPeriodsService } from './admission-periods.service';
import { AdmissionPeriodsController } from './admission-periods.controller';
import {
  CreateAdmissionPeriodDto,
  UpdateAdmissionPeriodDto,
  QueryAdmissionPeriodDto,
} from './dto/admission-period.dto';
import type { AdmissionPeriodDocument } from './schemas/admission-period.schema';
import {
  ANY_PERMISSIONS_KEY,
  PERMISSIONS_KEY,
} from '../auth/decorators/permissions.decorator';

const opensAt = '2026-10-30T22:00:00.000Z';
const closesAt = '2026-10-31T00:00:00.000Z';
const actorId = new Types.ObjectId().toString();
const id = new Types.ObjectId();
const input = {
  code: 'INTAKE26',
  academicYear: '2026-2027',
  name: 'Intake 2026',
  opensAt,
  closesAt,
};

describe('Admission period request validation', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });
  const transform = (
    body: object,
    metatype: ArgumentMetadata['metatype'] = CreateAdmissionPeriodDto,
  ) => pipe.transform(body, { type: 'body', metatype });

  it('normalizes the reference and accepts explicit UTC and offset timestamps', async () => {
    const dto = await transform({
      ...input,
      code: ' intake26 ',
      opensAt: '2026-10-31T00:00:00+02:00',
    });
    expect(dto.code).toBe('INTAKE26');
    expect(new Date(dto.opensAt).toISOString()).toBe(opensAt);
  });
  it.each([
    { ...input, opensAt: '2026-10-30T22:00:00' },
    { ...input, opensAt: '2026-02-30T22:00:00Z' },
    { ...input, closesAt: null },
    { ...input, name: 'x' },
    { ...input, isEnabled: 'false' },
    { ...input, isEnabled: 1 },
    { ...input, studentCode: '269034' },
    { ...input, revision: 10 },
  ])('rejects invalid or unknown create properties: %j', async (body) => {
    await expect(transform(body)).rejects.toMatchObject({ status: 400 });
  });
  it.each([
    { name: 'New name' },
    { revision: -1 },
    { revision: 0.5 },
    { revision: 0, code: 'NEWCODE' },
    { revision: 0, academicYear: '2027-2028' },
    { revision: 0, isEnabled: 'true' },
    { revision: 0, nameAr: null },
  ])('rejects invalid edits and immutable fields: %j', async (body) => {
    await expect(
      transform(body, UpdateAdmissionPeriodDto),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('allows clearing the optional Arabic name and rejects unbounded queries', async () => {
    await expect(
      transform({ revision: 0, nameAr: '' }, UpdateAdmissionPeriodDto),
    ).resolves.toMatchObject({ nameAr: '' });
    await expect(
      transform({ limit: 101 }, QueryAdmissionPeriodDto),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      transform({ search: 'a'.repeat(101) }, QueryAdmissionPeriodDto),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('Admission period policy and persistence', () => {
  const fixture = () => ({
    ...input,
    _id: id,
    opensAt: new Date(opensAt),
    closesAt: new Date(closesAt),
    isEnabled: true,
    revision: 2,
  });
  const lean = (value: unknown) => ({
    lean: jest.fn().mockResolvedValue(value),
  });
  const model = {
    create: jest.fn(),
    findById: jest.fn(),
    findOneAndUpdate: jest.fn(),
    find: jest.fn(),
    countDocuments: jest.fn(),
  };
  const service = new AdmissionPeriodsService(
    model as unknown as Model<AdmissionPeriodDocument>,
  );
  beforeEach(() => jest.resetAllMocks());

  it('defaults to disabled and writes the initial actor/history with the document', async () => {
    model.create.mockImplementation((value) =>
      Promise.resolve({ ...value, _id: id }),
    );
    const result = await service.create(input, actorId);
    expect(result).toMatchObject({
      isEnabled: false,
      status: 'disabled',
      revision: 0,
      opensAt,
      closesAt,
    });
    expect(result).not.toHaveProperty('history');
    expect(model.create.mock.calls[0][0].history[0]).toMatchObject({
      revision: 0,
      actorId: new Types.ObjectId(actorId),
    });
  });
  it.each([
    { ...input, academicYear: '2026-2028' },
    { ...input, name: undefined },
    { ...input, opensAt: undefined },
    { ...input, closesAt: opensAt },
    { ...input, closesAt: 'invalid' },
  ])('fails safely before writing an invalid period: %j', async (body) => {
    await expect(service.create(body, actorId)).rejects.toMatchObject({
      status: 400,
    });
    expect(model.create).not.toHaveBeenCalled();
  });
  it('reports duplicate references as conflicts', async () => {
    model.create.mockRejectedValue({ code: 11000 });
    await expect(service.create(input, actorId)).rejects.toMatchObject({
      status: 409,
      response: { code: 'ADMISSION_PERIOD_CODE_TAKEN' },
    });
  });
  it('updates settings and audit history atomically using an expected revision', async () => {
    model.findById.mockReturnValue(lean(fixture()));
    model.findOneAndUpdate.mockReturnValue(
      lean({ ...fixture(), name: 'Changed', revision: 3 }),
    );
    const result = await service.update(
      String(id),
      { revision: 2, name: 'Changed' },
      actorId,
    );
    const [filter, update] = model.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ _id: String(id), revision: 2 });
    expect(update).toMatchObject({
      $inc: { revision: 1 },
      $set: { opensAt: new Date(opensAt), closesAt: new Date(closesAt) },
      $push: { history: { revision: 3 } },
    });
    expect(result).toMatchObject({ revision: 3, name: 'Changed' });
  });
  it('validates a single changed boundary against the saved other boundary', async () => {
    model.findById.mockReturnValue(lean(fixture()));
    await expect(
      service.update(String(id), { revision: 2, opensAt: closesAt }, actorId),
    ).rejects.toMatchObject({ status: 400 });
    expect(model.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it('rejects both stale revisions and races after the read', async () => {
    model.findById.mockReturnValue(lean(fixture()));
    await expect(
      service.update(String(id), { revision: 1, isEnabled: false }, actorId),
    ).rejects.toMatchObject({ status: 409 });
    expect(model.findOneAndUpdate).not.toHaveBeenCalled();
    model.findOneAndUpdate.mockReturnValue(lean(null));
    await expect(
      service.update(String(id), { revision: 2, isEnabled: false }, actorId),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('returns 404 without writing when a period has disappeared', async () => {
    model.findById.mockReturnValue(lean(null));
    await expect(
      service.update(String(id), { revision: 0 }, actorId),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('escapes search metacharacters and paginates a stable sort', async () => {
    const query = {
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([fixture()]),
    };
    model.find.mockReturnValue(query);
    model.countDocuments.mockResolvedValue(1);
    await service.list({ page: 2, limit: 10, search: '.*' });
    expect(model.find.mock.calls[0][0].$or[0].code.$regex).toBe('\\.\\*');
    expect(query.skip).toHaveBeenCalledWith(10);
    expect(query.sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
  });
  it('uses server instants at both boundaries independent of host timezone', () => {
    const period = fixture();
    expect(admissionPeriodStatus(period, Date.parse(opensAt) - 1)).toBe(
      'scheduled',
    );
    expect(admissionPeriodStatus(period, Date.parse(opensAt))).toBe('open');
    expect(admissionPeriodStatus(period, Date.parse(closesAt) - 1)).toBe(
      'open',
    );
    expect(admissionPeriodStatus(period, Date.parse(closesAt))).toBe('closed');
    expect(admissionPeriodStatus(period, Date.parse(closesAt) + 1)).toBe(
      'closed',
    );
    expect(admissionPeriodStatus({ ...period, isEnabled: false })).toBe(
      'disabled',
    );
    expect(admissionPeriodStatus({ ...period, closesAt: 'bad' })).toBe(
      'disabled',
    );
    expect(isAdmissionAcademicYear('2026-2027')).toBe(true);
    expect(isAdmissionAcademicYear('2026/2027')).toBe(false);
  });
  it('requires distinct grants and gives no teaching or administrative role automatic access', () => {
    const prototype = AdmissionPeriodsController.prototype;
    // Binding the method would lose its decorator metadata.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(Reflect.getMetadata(ANY_PERMISSIONS_KEY, prototype.list)).toEqual([
      PERMISSIONS.ADMISSIONS_PERIODS_READ,
      PERMISSIONS.ADMISSIONS_PERIODS_MANAGE,
    ]);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    for (const action of [prototype.create, prototype.update])
      expect(Reflect.getMetadata(PERMISSIONS_KEY, action)).toEqual([
        PERMISSIONS.ADMISSIONS_PERIODS_MANAGE,
      ]);
    for (const permissions of Object.values(STAFF_TYPE_DEFAULT_PERMISSIONS))
      expect(
        permissions.some((permission) => permission.startsWith('admissions.')),
      ).toBe(false);
  });
});
