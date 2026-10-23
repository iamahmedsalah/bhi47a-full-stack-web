import { validateSeedMode } from './seed-policy';

describe('production seed policy', () => {
  it('blocks demo data and database reset in production', () => {
    expect(() => validateSeedMode('production', [])).toThrow(
      'production seeding is disabled',
    );
    expect(() => validateSeedMode('production', ['--reset'])).toThrow(
      'production seeding is disabled',
    );
    expect(() =>
      validateSeedMode('production', ['--admin-only', '--reset']),
    ).toThrow('production seeding is disabled');
  });

  it('blocks production admin bootstrap and preserves development seeding', () => {
    expect(() => validateSeedMode('production', ['--admin-only'])).toThrow(
      'production seeding is disabled',
    );
    expect(validateSeedMode('development', ['--admin-only'])).toBe(true);
    expect(validateSeedMode('development', [])).toBe(false);
    expect(validateSeedMode('development', ['--reset'])).toBe(false);
  });
});
