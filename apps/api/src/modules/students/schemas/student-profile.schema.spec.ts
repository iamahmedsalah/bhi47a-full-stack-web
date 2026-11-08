import { Mongoose, Types } from 'mongoose';
import { StudentProfileSchema } from './student-profile.schema';

describe('student profile identity casting for access checks', () => {
  it('declares the linked user as an ObjectId rather than Mixed', () => {
    expect(StudentProfileSchema.path('userId').instance).toBe('ObjectId');
  });

  it('casts a JWT string user ID for blocked-profile queries', () => {
    const instance = new Mongoose();
    const profiles = instance.model(
      'BlockedProfileLookup',
      StudentProfileSchema,
    );
    const id = new Types.ObjectId();
    const query = profiles.findOne({ userId: id.toHexString() });
    query.cast();
    const filter = query.getFilter();
    expect(filter.userId).toBeInstanceOf(Types.ObjectId);
    expect(String(filter.userId)).toBe(id.toHexString());
  });
});
