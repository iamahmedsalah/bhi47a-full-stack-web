import { Types, type ClientSession } from 'mongoose';
import { StaffCourseAssignmentsService } from './staff-course-assignments.service';

const session = {} as ClientSession;
const staffId = new Types.ObjectId();
const colleagueId = new Types.ObjectId();
const courseId = new Types.ObjectId();
const staff = {
  _id: staffId,
  name: 'Doctor',
  nameAr: 'أستاذ',
  role: 'staff',
  staffType: 'doctor',
  titlePrefix: 'prof',
};
function setup(rows: Record<string, unknown>[]) {
  const courses = {
    find: jest.fn(() => ({
      session: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(rows) })),
    })),
    updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
  };
  return {
    courses,
    service: new StaffCourseAssignmentsService(courses as never),
  };
}

describe('staff course assignments', () => {
  it('adds a doctor and keeps the existing colleague and legacy assistant', async () => {
    const { service, courses } = setup([
      {
        _id: courseId,
        doctorId: colleagueId,
        doctorName: 'Colleague',
        teachingAssistantId: colleagueId,
      },
    ]);
    await service.sync(staff, [String(courseId)], session);
    expect(courses.updateOne).toHaveBeenCalledWith(
      { _id: courseId },
      expect.objectContaining({
        $set: expect.objectContaining({
          doctorIds: [colleagueId, staffId],
          doctorName: 'Colleague / Doctor',
          doctors: expect.arrayContaining([
            expect.objectContaining({ _id: staffId, titlePrefix: 'prof' }),
          ]),
          teachingAssistantIds: [colleagueId],
        }),
      }),
      { session },
    );
  });
  it('removes only the target staff member when clearing assigned courses', async () => {
    const { service, courses } = setup([
      {
        _id: courseId,
        doctorId: staffId,
        doctorIds: [staffId, colleagueId],
        doctors: [
          { _id: staffId, name: 'Doctor' },
          { _id: colleagueId, name: 'Colleague' },
        ],
      },
    ]);
    await service.sync(staff, [], session);
    expect(courses.updateOne.mock.calls[0][1].$set).toMatchObject({
      doctorIds: [colleagueId],
      doctorId: colleagueId,
    });
  });
  it('moves a changed teaching role between assignment arrays without retaining stale doctor access', async () => {
    const { service, courses } = setup([
      {
        _id: courseId,
        doctorId: staffId,
        doctorIds: [staffId],
        doctors: [{ _id: staffId, name: 'Doctor' }],
      },
    ]);
    await service.sync(
      { ...staff, staffType: 'assistant_lecturer' },
      [String(courseId)],
      session,
    );
    expect(courses.updateOne.mock.calls[0][1].$set).toMatchObject({
      doctorIds: [],
      doctorId: null,
      teachingAssistantIds: [staffId],
    });
  });
  it('rejects missing courses before writing assignments', async () => {
    const { service, courses } = setup([]);
    await expect(
      service.sync(staff, [String(courseId)], session),
    ).rejects.toThrow('do not exist');
    expect(courses.updateOne).not.toHaveBeenCalled();
  });
  it('rejects nonteaching assignment and a third doctor', async () => {
    const { service, courses } = setup([
      { _id: courseId, doctorIds: [colleagueId, new Types.ObjectId()] },
    ]);
    await expect(
      service.sync(
        { ...staff, staffType: 'administrative' },
        [String(courseId)],
        session,
      ),
    ).rejects.toThrow('teaching staff');
    await expect(
      service.sync(staff, [String(courseId)], session),
    ).rejects.toThrow('at most two');
    expect(courses.updateOne).not.toHaveBeenCalled();
  });
});
