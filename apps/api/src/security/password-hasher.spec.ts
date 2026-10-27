import * as bcrypt from 'bcrypt';
import {
  PasswordHasher,
  passwordHashFormat,
  BCRYPT_ROUNDS,
} from './password-hasher';
import { UsersService } from '../modules/users/users.service';

describe('bcrypt password policy without database migration', () => {
  const hasher = new PasswordHasher();
  it('uses the original account cost with independent salts', async () => {
    const a = await hasher.hash('SyntheticPassword123!');
    const b = await hasher.hash('SyntheticPassword123!');
    expect(BCRYPT_ROUNDS).toBe(12);
    expect(a).toMatch(/^\$2b\$12\$/);
    expect(a).not.toBe(b);
    expect(await hasher.verify('SyntheticPassword123!', a)).toBe(true);
    expect(await hasher.verify('syntheticPassword123!', a)).toBe(false);
    expect(await hasher.verify('SyntheticPassword123! ', a)).toBe(false);
  });
  it.each(['2a', '2b'])(
    'preserves existing %s credentials without any password write',
    async (prefix) => {
      const hash = (await bcrypt.hash('ExistingPassword123!', 4)).replace(
        '$2b$',
        '$' + prefix + '$',
      );
      const updateOne = jest.fn();
      const users = new UsersService({ updateOne } as never, hasher);
      const user = {
        _id: '507f1f77bcf86cd799439011',
        passwordHash: hash,
        tokenVersion: 3,
      } as never;
      expect(await users.validatePassword(user, 'ExistingPassword123!')).toBe(
        true,
      );
      expect(await users.validatePassword(user, 'wrong')).toBe(false);
      expect(updateOne).not.toHaveBeenCalled();
    },
  );
  it.each([
    '',
    'plaintext',
    '$scrypt$unknown',
    '$2y$12$unsupported',
    '$argon2id$malformed',
  ])('rejects unsupported format %s', async (hash) => {
    expect(await hasher.verify('password', hash)).toBe(false);
  });
  it('rejects excessive encoded costs before expensive work', () => {
    expect(passwordHashFormat('$2b$31$' + 'a'.repeat(53))).toBe('unknown');
  });
  it('preserves the historical bcrypt 72-byte semantics', async () => {
    const prefix = 'x'.repeat(72);
    const hash = await bcrypt.hash(prefix + 'A', 4);
    expect(await hasher.verify(prefix + 'B', hash)).toBe(true);
  });
  it('rejects oversized inputs', async () => {
    await expect(hasher.hash('x'.repeat(4097))).rejects.toThrow();
  });
  it('bounds concurrent password verification and rejects overflow', async () => {
    const encoded = await bcrypt.hash('SyntheticQueuePassword', 4);
    const results = await Promise.allSettled(
      Array.from({ length: 35 }, () =>
        hasher.verify('SyntheticQueuePassword', encoded),
      ),
    );
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'fulfilled' && result.value),
    ).toHaveLength(34);
  });
});
