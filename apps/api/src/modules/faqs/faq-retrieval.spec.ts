import { faqTermPattern, faqTerms, scoreFaq } from './faq-retrieval';

describe('FAQ retrieval', () => {
  it('matches normalized Arabic variants and ignores generic question words', () => {
    const question = 'أشوف نتيجة الامتحان فين؟';
    const query = 'أين نتيجة الإمتحان؟';
    const terms = faqTerms(query);
    expect(terms).not.toContain('اين');
    expect(scoreFaq(query, terms, { question })).toBeGreaterThan(3);
    expect(new RegExp(faqTermPattern('الامتحان'), 'iu').test('الإمتحان')).toBe(
      true,
    );
  });

  it('requires a relevant question or tagged keyword', () => {
    const query = 'How do I find a schedule?';
    expect(
      scoreFaq(query, faqTerms(query), {
        question: 'How do I reset a password?',
      }),
    ).toBe(0);
  });
});
