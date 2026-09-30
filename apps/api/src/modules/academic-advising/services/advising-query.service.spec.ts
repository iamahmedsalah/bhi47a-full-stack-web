import { Types } from 'mongoose';
import { AdvisingQueryService } from './advising-query.service';

function createQuery<T>(value: T) {
  const query = {
    sort: jest.fn(),
    populate: jest.fn(),
    lean: jest.fn().mockResolvedValue(value),
  };
  query.sort.mockReturnValue(query);
  query.populate.mockReturnValue(query);
  return query;
}

describe('AdvisingQueryService note persistence contract', () => {
  const caseId = new Types.ObjectId();
  const actorId = new Types.ObjectId();
  const noteId = new Types.ObjectId();

  const cases = {
    findOne: jest.fn(),
    findById: jest.fn(),
  };
  const plans = { findById: jest.fn() };
  const recommendations = { find: jest.fn() };
  const notes = { find: jest.fn(), create: jest.fn() };
  const auditLogs = {};
  const audit = { record: jest.fn() };

  const service = new AdvisingQueryService(
    cases as never,
    plans as never,
    recommendations as never,
    notes as never,
    auditLogs as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    audit as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates notes with the schema field advisingCaseId', async () => {
    cases.findById.mockResolvedValue({ _id: caseId });
    notes.create.mockResolvedValue({ _id: noteId });
    audit.record.mockResolvedValue(undefined);

    await service.createNote(
      caseId.toString(),
      { visibility: 'INTERNAL', content: 'Advisor note' },
      actorId.toString(),
      'admin',
    );

    expect(notes.create).toHaveBeenCalledWith(
      expect.objectContaining({ advisingCaseId: caseId }),
    );
    expect(notes.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ caseId }),
    );
  });

  it('loads student-visible notes using the schema field and enum value', async () => {
    cases.findOne.mockReturnValue(createQuery({ _id: caseId }));
    recommendations.find.mockReturnValue(createQuery([]));
    notes.find.mockReturnValue(createQuery([]));

    await service.getStudentAdvising(actorId.toString());

    expect(notes.find).toHaveBeenCalledWith({
      advisingCaseId: caseId,
      visibility: 'STUDENT_VISIBLE',
    });
  });
});
