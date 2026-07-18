import { isRegistrationTermCurrentlyOpen } from './registration-term.util';

describe('registration term window', () => {
  const now = new Date('2026-07-13T10:00:00.000Z');

  it('is closed when no admin configuration exists', () => {
    expect(isRegistrationTermCurrentlyOpen(null, now)).toBe(false);
  });

  it('respects the explicit admin switch', () => {
    expect(isRegistrationTermCurrentlyOpen({ isOpen: false }, now)).toBe(false);
    expect(isRegistrationTermCurrentlyOpen({ isOpen: true }, now)).toBe(true);
  });

  it('respects scheduled opening and closing dates', () => {
    expect(
      isRegistrationTermCurrentlyOpen(
        { isOpen: true, opensAt: new Date('2026-07-14T00:00:00.000Z') },
        now,
      ),
    ).toBe(false);
    expect(
      isRegistrationTermCurrentlyOpen(
        { isOpen: true, closesAt: new Date('2026-07-12T23:59:59.000Z') },
        now,
      ),
    ).toBe(false);
  });
});
