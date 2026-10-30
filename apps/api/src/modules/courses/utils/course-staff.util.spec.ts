import { Types } from 'mongoose';
import {
  isAssignedToCourse,
  isTeachingStaff,
  courseStaffFilter,
} from './course-staff.util';

describe('course staff identity', () => {
  const id = new Types.ObjectId();
  it.each([
    { doctorId: id },
    { doctorIds: [id] },
    { doctors: [{ _id: id }] },
    { teachingAssistantIds: [id] },
    { teachingAssistants: [{ _id: id }] },
    { teachingAssistantId: id },
    { teachingAssistant: id.toHexString() },
    { doctorIds: [], doctorId: id.toHexString() },
  ])('recognizes current and legacy assignments: %j', (course) => {
    expect(isAssignedToCourse(course, id)).toBe(true);
    expect(isAssignedToCourse(course, new Types.ObjectId())).toBe(false);
  });
  it('fails closed for missing identities and keeps teaching roles scoped', () => {
    expect(isAssignedToCourse(null, id)).toBe(false);
    expect(
      isAssignedToCourse({ doctors: [{ name: id.toHexString() }] }, id),
    ).toBe(false);
    expect(courseStaffFilter('bad-id')).toEqual({ _id: { $in: [] } });
    expect(isTeachingStaff('assistant_lecturer')).toBe(true);
    expect(isTeachingStaff('administrative')).toBe(false);
  });
});
