import { BadRequestException } from '@nestjs/common';
import { normalizeSearchTerm } from './search.util';

describe('normalizeSearchTerm', () => {
  it('trims input', () => {
    expect(normalizeSearchTerm('  student  ')).toBe('student');
  });

  it('escapes regex metacharacters', () => {
    expect(normalizeSearchTerm('a+b?(test)[1]')).toBe(
      'a\\+b\\?\\(test\\)\\[1\\]',
    );
  });

  it('rejects overly long terms', () => {
    expect(() => normalizeSearchTerm('a'.repeat(101))).toThrow(
      BadRequestException,
    );
  });
});
