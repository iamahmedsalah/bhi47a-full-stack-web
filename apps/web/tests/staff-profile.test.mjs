import assert from 'node:assert/strict';
import test from 'node:test';
import { staffProfilePayload } from '../src/features/staff/profile-payload.ts';
import { staffFormError } from '../src/features/staff/form-errors.ts';

test('profile updates whitelist fields, retain Arabic names and explicit optional-field clearing', () => {
  const payload = staffProfilePayload({
    name: 'Staff',
    nameAr: 'اسم عربي',
    email: 'staff@example.test',
    username: '',
    phone: '',
    staffType: 'doctor',
    titlePrefix: 'prof',
    role: 'admin',
    password: 'must-not-send',
    courseIds: ['507f1f77bcf86cd799439011'],
    permissions: ['students.read'],
  });
  assert.deepEqual(payload, {
    name: 'Staff',
    nameAr: 'اسم عربي',
    email: 'staff@example.test',
    username: '',
    phone: '',
    staffType: 'doctor',
    titlePrefix: 'prof',
    courseIds: ['507f1f77bcf86cd799439011'],
    permissions: ['students.read'],
  });
});

test('duplicate identities identify the precise field with translatable messages', () => {
  assert.deepEqual(
    staffFormError({
      statusCode: 409,
      code: 'STAFF_EMAIL_TAKEN',
      message: 'Staff email already exists',
      errors: { email: 'emailTaken' },
    }),
    { message: 'emailTaken', fields: { email: 'emailTaken' } },
  );
  assert.deepEqual(
    staffFormError({
      statusCode: 409,
      code: 'STAFF_USERNAME_TAKEN',
      message: 'Staff username already exists',
    }),
    { message: 'usernameTaken', fields: { username: 'usernameTaken' } },
  );
});

test('legacy validation responses map to field errors without exposing implementation messages', () => {
  assert.deepEqual(
    staffFormError({
      statusCode: 400,
      message:
        'nameAr must be longer than or equal to 2 characters, email must be an email',
    }),
    { message: 'checkFields', fields: { nameAr: 'nameArLength', email: 'emailInvalid' } },
  );
  assert.equal(
    staffFormError({ statusCode: 400, message: 'property role should not exist' })
      .message,
    'formOutOfDate',
  );
  for (const [statusCode, message] of [
    [401, 'sessionExpired'],
    [403, 'forbidden'],
    [429, 'rateLimited'],
    [500, 'saveFailed'],
    [undefined, 'saveFailed'],
  ]) {
    assert.equal(
      staffFormError({ statusCode, message: 'technical server text' }).message,
      message,
    );
  }
});
