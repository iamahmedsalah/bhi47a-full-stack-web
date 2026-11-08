import mongoose from 'mongoose';
import { UserSchema } from '../users/schemas/user.schema';
import { publicMaterialResponse } from './material-response';

describe('material response serialization compatibility', () => {
  it('preserves user schema sanitization for nested hydrated documents', () => {
    const isolated = new mongoose.Mongoose();
    const User = isolated.model('MaterialPrivacyFixture', UserSchema);
    const user = new User({
      name: 'Test student',
      role: 'student',
      passwordHash: 'PRIVATE_PASSWORD_HASH',
      nationalIdHash: 'PRIVATE_NATIONAL_HASH',
      refreshTokenHash: 'PRIVATE_REFRESH_HASH',
      resetPasswordToken: 'PRIVATE_RESET_TOKEN',
      googleLinkOtp: 'PRIVATE_OTP',
    });
    expect(user.toObject().passwordHash).toBe('PRIVATE_PASSWORD_HASH');
    const serialized = JSON.stringify(publicMaterialResponse({ user }));
    expect(serialized).not.toContain('PRIVATE_');
    expect(serialized).toContain('Test student');
    expect(user.passwordHash).toBe('PRIVATE_PASSWORD_HASH');
  });

  it('preserves custom JSON values while redacting material references', () => {
    const response = publicMaterialResponse({
      custom: { toJSON: () => 'serialized value' },
      course: { _id: 'course', syllabusFile: { storageKey: 'PRIVATE_KEY' } },
    });
    expect(response).toEqual({
      custom: 'serialized value',
      course: {
        _id: 'course',
        syllabusPdfUrl: '/api/courses/course/syllabus/download',
      },
    });
  });
});
